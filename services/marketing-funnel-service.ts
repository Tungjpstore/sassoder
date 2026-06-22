import "server-only";

import { createHmac } from "crypto";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isEmailDeliveryConfigured, sendTransactionalEmail } from "@/services/email-delivery";
import {
  funnelEventSchema,
  inferPlanFromPilotGoal,
  leadRedirectPath,
  normalizeMarketingText,
  splitContact,
  waitlistLeadSchema,
  type FunnelEventInput,
  type WaitlistLeadInput
} from "@/lib/marketing/funnel";

type RequestContext = {
  ip: string;
  userAgent: string;
};

function marketingSecret() {
  return (
    process.env.MARKETING_FUNNEL_SECRET?.trim() ||
    process.env.AUTH_RATE_LIMIT_SECRET?.trim() ||
    process.env.PLATFORM_ADMIN_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "logivn-local-marketing-funnel"
  );
}

function sha256Hmac(value: string) {
  return createHmac("sha256", marketingSecret()).update(value).digest("hex");
}

function cleanSource(value: string | undefined, fallback: string) {
  return normalizeMarketingText(value, fallback).toLowerCase().replace(/[^a-z0-9_.:-]/g, "_").slice(0, 80) || fallback;
}

function cleanVariant(value: string | undefined) {
  return normalizeMarketingText(value, "direct").toLowerCase().replace(/[^a-z0-9_.:-]/g, "_").slice(0, 40) || "direct";
}

async function maybeSendWaitlistNotification({
  leadId,
  restaurantName,
  contact,
  businessType,
  pilotGoal,
  selectedPlan,
  source,
  variant
}: {
  leadId: string;
  restaurantName?: string;
  contact: string;
  businessType: string;
  pilotGoal: string;
  selectedPlan: string;
  source: string;
  variant: string;
}) {
  if (process.env.MARKETING_WAITLIST_NOTIFY_ENABLED !== "true") return;
  const to = process.env.MARKETING_WAITLIST_NOTIFY_TO;
  const from = process.env.MARKETING_EMAIL_FROM || process.env.REPORT_EMAIL_FROM || process.env.AUTH_EMAIL_FROM;
  if (!to || !from || !isEmailDeliveryConfigured()) return;

  const subject = `Waitlist LogiVN: ${restaurantName || contact}`;
  const text = [
    "Lead waitlist mới từ LogiVN",
    "",
    `Lead ID: ${leadId}`,
    `Quán: ${restaurantName || "Chưa nhập"}`,
    `Liên hệ: ${contact}`,
    `Mô hình: ${businessType}`,
    `Mục tiêu pilot: ${pilotGoal}`,
    `Gói gợi ý: ${selectedPlan}`,
    `Source: ${source}`,
    `Variant: ${variant}`
  ].join("\n");

  await sendTransactionalEmail(
    {
      from,
      to: [to],
      subject,
      text,
      category: "platform_admin",
      metadata: { source, variant }
    },
    { signal: AbortSignal.timeout(8_000) }
  ).catch((error) => {
    console.error("[marketing/waitlist] Notification email failed", {
      message: error instanceof Error ? error.message : String(error)
    });
  });
}

export async function captureWaitlistLead(input: WaitlistLeadInput, context: RequestContext) {
  const parsed = waitlistLeadSchema.parse(input);
  const contact = splitContact(parsed.contact);
  const selectedPlan = parsed.selectedPlan || inferPlanFromPilotGoal(parsed.pilotGoal);
  const source = cleanSource(parsed.source, "waitlist");
  const variant = cleanVariant(parsed.variant);
  const metadata = {
    ...(parsed.metadata || {}),
    sessionId: normalizeMarketingText(parsed.sessionId),
    userAgent: context.userAgent.slice(0, 220),
    ipHash: sha256Hmac(context.ip)
  };
  const leadIdentityHash = sha256Hmac(contact.normalized);
  const supabase = createAdminSupabaseClient() as any;

  const now = new Date().toISOString();
  const leadPayload = {
    restaurant_name: normalizeMarketingText(parsed.restaurantName) || null,
    contact: parsed.contact.trim(),
    contact_email: contact.email,
    contact_phone: contact.phone,
    business_type: parsed.businessType,
    pilot_goal: parsed.pilotGoal,
    selected_plan: selectedPlan,
    source,
    variant,
    page_path: normalizeMarketingText(parsed.pagePath, "/waitlist") || null,
    utm_source: normalizeMarketingText(parsed.utmSource) || null,
    utm_medium: normalizeMarketingText(parsed.utmMedium) || null,
    utm_campaign: normalizeMarketingText(parsed.utmCampaign) || null,
    utm_content: normalizeMarketingText(parsed.utmContent) || null,
    status: "captured",
    nurture_stage: "welcome_ready",
    metadata,
    last_submitted_at: now
  };

  const { data: existingLead, error: lookupError } = await supabase
    .from("marketing_waitlist_leads")
    .select("id, submission_count")
    .eq("lead_identity_hash", leadIdentityHash)
    .maybeSingle();

  if (lookupError) {
    console.error("[marketing/waitlist] Lead lookup failed", {
      code: lookupError.code,
      message: lookupError.message
    });
    throw new AppError("Chưa kiểm tra được waitlist. Vui lòng thử lại sau ít phút.", 500);
  }

  const query = existingLead
    ? supabase
        .from("marketing_waitlist_leads")
        .update({
          ...leadPayload,
          submission_count: Math.max(1, Number(existingLead.submission_count || 1) + 1)
        })
        .eq("id", existingLead.id)
    : supabase.from("marketing_waitlist_leads").insert({
        ...leadPayload,
        lead_identity_hash: leadIdentityHash,
        submission_count: 1
      });

  const { data, error } = await query.select("id, selected_plan, pilot_goal, source, variant, submission_count").single();

  if (error || !data) {
    console.error("[marketing/waitlist] Lead capture failed", {
      code: error?.code,
      message: error?.message
    });
    throw new AppError("Chưa lưu được waitlist. Vui lòng thử lại sau ít phút.", 500);
  }

  await maybeSendWaitlistNotification({
    leadId: data.id,
    restaurantName: normalizeMarketingText(parsed.restaurantName),
    contact: parsed.contact,
    businessType: parsed.businessType,
    pilotGoal: parsed.pilotGoal,
    selectedPlan,
    source,
    variant
  });

  return {
    id: data.id as string,
    selectedPlan,
    pilotGoal: parsed.pilotGoal,
    source,
    variant,
    redirectTo: leadRedirectPath({
      selectedPlan,
      pilotGoal: parsed.pilotGoal,
      source,
      variant
    })
  };
}

export async function recordFunnelEvent(input: FunnelEventInput, context: RequestContext) {
  const parsed = funnelEventSchema.parse(input);
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("marketing_funnel_events").insert({
    session_id: parsed.sessionId,
    event_name: parsed.eventName,
    page_path: normalizeMarketingText(parsed.pagePath) || null,
    source: cleanSource(parsed.source, "marketing"),
    variant: cleanVariant(parsed.variant),
    target_href: normalizeMarketingText(parsed.targetHref) || null,
    target_text: normalizeMarketingText(parsed.targetText) || null,
    plan_code: normalizeMarketingText(parsed.planCode) || null,
    lead_id: normalizeMarketingText(parsed.leadId) || null,
    metadata: parsed.metadata || {},
    user_agent: context.userAgent.slice(0, 220),
    ip_hash: sha256Hmac(context.ip),
    created_at: new Date().toISOString()
  });

  if (error) {
    console.error("[marketing/events] Funnel event insert failed", {
      code: error.code,
      message: error.message
    });
    throw new AppError("Không ghi được sự kiện funnel.", 500);
  }
}
