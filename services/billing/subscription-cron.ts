import { DEFAULT_GRACE_PERIOD_DAYS } from "@/lib/billing/subscription-transitions";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isEmailDeliveryConfigured, sendTransactionalEmail } from "@/services/email-delivery";
import { notifyPlatformSubscriptionStatusChanged } from "@/services/platform-telegram-events";
import { addDays, dateOnly, daysUntil, firstOrNull, formatDateVi, isMissingSchemaError } from "./billing-utils";
import type { SubscriptionReminderCandidateRow } from "./billing-types";

function buildSubscriptionReminderEmail({
  restaurantName,
  planName,
  daysLeft,
  periodEnd
}: {
  restaurantName: string;
  planName: string;
  daysLeft: number;
  periodEnd: string;
}) {
  const urgency =
    daysLeft <= 0
      ? "Gói LogiVN của quán hết hạn hôm nay."
      : daysLeft === 1
        ? "Gói LogiVN của quán còn 1 ngày."
        : `Gói LogiVN của quán còn ${daysLeft} ngày.`;

  return `<!doctype html>
<html lang="vi">
  <body style="margin:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif;color:#0F172A;">
    <div style="max-width:640px;margin:0 auto;padding:28px;">
      <div style="border:1px solid #E2E8F0;border-radius:20px;background:#FFFFFF;overflow:hidden;">
        <div style="padding:22px 26px;background:#0F4D3A;color:#FFFFFF;">
          <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.78;">LogiVN Billing</div>
          <h1 style="margin:8px 0 0;font-size:26px;line-height:1.25;">Nhắc gia hạn gói ${planName}</h1>
        </div>
        <div style="padding:24px 26px;">
          <p style="font-size:16px;line-height:1.7;margin:0;">${urgency}</p>
          <div style="margin:18px 0;padding:16px;border:1px solid #E2E8F0;border-radius:14px;background:#F8FAFC;">
            <p style="margin:0 0 8px;font-weight:700;">${restaurantName}</p>
            <p style="margin:0;color:#475569;">Ngày hết hạn: <strong>${formatDateVi(periodEnd)}</strong></p>
          </div>
          <p style="font-size:14px;line-height:1.7;color:#475569;margin:0;">Vui lòng vào Dashboard > Cài đặt > Gói LogiVN để tạo mã VietQR gia hạn. Hệ thống sẽ tự mở lại đầy đủ tính năng ngay sau khi LogiVN xác minh thanh toán.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

async function sendSubscriptionReminderEmail({
  to,
  subject,
  html
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const from = process.env.BILLING_EMAIL_FROM ?? process.env.RESEND_FROM ?? "LogiVN <billing@logivn.com>";
  return sendTransactionalEmail({ from, to: [to], subject, html });
}

async function insertReminderLog({
  restaurantId,
  subscriptionId,
  reminderKey,
  recipient,
  status,
  errorMessage,
  metadata
}: {
  restaurantId: string;
  subscriptionId: string;
  reminderKey: string;
  recipient: string | null;
  status: "sent" | "skipped" | "failed";
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("subscription_reminder_logs").insert({
    restaurant_id: restaurantId,
    subscription_id: subscriptionId,
    reminder_key: reminderKey,
    channel: "email",
    recipient,
    status,
    error_message: errorMessage ?? null,
    metadata: metadata ?? {}
  });

  if (error && error.code !== "23505") {
    if (!isMissingSchemaError(error)) throw error;
  }
}

export async function sendSubscriptionExpiryReminders() {
  const supabase = createAdminSupabaseClient() as any;
  const horizon = addDays(new Date(), 14).toISOString();
  const { data, error } = await supabase
    .from("restaurant_subscriptions")
    .select("id,restaurant_id,status,trial_ends_at,current_period_end,restaurant:restaurants(name,slug,contact_email),plan:saas_plans(name,code,monthly_price)")
    .in("status", ["trialing", "active"])
    .or(`trial_ends_at.lte.${horizon},current_period_end.lte.${horizon}`);

  if (error) {
    if (isMissingSchemaError(error)) return { scanned: 0, sent: 0, skipped: 0, failed: 0 };
    throw error;
  }

  const thresholds = new Set([14, 7, 3, 1, 0]);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of (data ?? []) as SubscriptionReminderCandidateRow[]) {
    const periodEnd = row.current_period_end || row.trial_ends_at;
    if (!periodEnd) continue;
    const daysLeft = daysUntil(periodEnd);
    if (!thresholds.has(daysLeft)) continue;

    const restaurant = firstOrNull(row.restaurant);
    const plan = firstOrNull(row.plan);
    const recipient = restaurant?.contact_email?.trim().toLowerCase() || null;
    const reminderKey = `expiry_${daysLeft}d_${dateOnly(periodEnd)}`.replace(/[^a-z0-9_:-]/gi, "_").toLowerCase();

    if (!recipient) {
      skipped += 1;
      await insertReminderLog({
        restaurantId: row.restaurant_id,
        subscriptionId: row.id,
        reminderKey,
        recipient,
        status: "skipped",
        errorMessage: "Quán chưa có email liên hệ.",
        metadata: { daysLeft, periodEnd }
      });
      continue;
    }

    if (!isEmailDeliveryConfigured()) {
      skipped += 1;
      await insertReminderLog({
        restaurantId: row.restaurant_id,
        subscriptionId: row.id,
        reminderKey,
        recipient,
        status: "skipped",
        errorMessage: "Thiếu cấu hình provider gửi email transactional.",
        metadata: { daysLeft, periodEnd }
      });
      continue;
    }

    try {
      const emailResult = await sendSubscriptionReminderEmail({
        to: recipient,
        subject: daysLeft <= 0 ? "Gói LogiVN hết hạn hôm nay" : `Gói LogiVN còn ${daysLeft} ngày`,
        html: buildSubscriptionReminderEmail({
          restaurantName: restaurant?.name ?? "Quán của bạn",
          planName: plan?.name ?? "LogiVN",
          daysLeft,
          periodEnd
        })
      });
      sent += 1;
      await insertReminderLog({
        restaurantId: row.restaurant_id,
        subscriptionId: row.id,
        reminderKey,
        recipient,
        status: "sent",
        metadata: { daysLeft, periodEnd, providerMessageId: emailResult.providerMessageId }
      });
    } catch (sendError) {
      failed += 1;
      await insertReminderLog({
        restaurantId: row.restaurant_id,
        subscriptionId: row.id,
        reminderKey,
        recipient,
        status: "failed",
        errorMessage: sendError instanceof Error ? sendError.message : "Không gửi được email nhắc gia hạn.",
        metadata: { daysLeft, periodEnd }
      });
    }
  }

  return {
    scanned: (data ?? []).length,
    sent,
    skipped,
    failed
  };
}

export async function expireStaleRestaurantSubscriptions({
  invalidateRestaurantEntitlementCache
}: {
  invalidateRestaurantEntitlementCache: (restaurantId?: string) => void;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();
  const reminders = await sendSubscriptionExpiryReminders();
  const { data: expiredTrials, error: trialError } = await supabase
    .from("restaurant_subscriptions")
    .update({
      status: "expired",
      updated_at: now
    })
    .eq("status", "trialing")
    .lt("trial_ends_at", now)
    .select("id,restaurant_id");

  if (trialError) throw trialError;

  const { data: pastDueSubscriptions, error: activeError } = await supabase
    .from("restaurant_subscriptions")
    .update({
      status: "past_due",
      updated_at: now
    })
    .eq("status", "active")
    .lt("current_period_end", now)
    .select("id,restaurant_id");

  if (activeError) throw activeError;

  const graceCutoff = addDays(new Date(), -DEFAULT_GRACE_PERIOD_DAYS).toISOString();
  const { data: expiredPastDueSubscriptions, error: pastDueError } = await supabase
    .from("restaurant_subscriptions")
    .update({
      status: "expired",
      updated_at: now
    })
    .eq("status", "past_due")
    .lt("current_period_end", graceCutoff)
    .select("id,restaurant_id");

  if (pastDueError) throw pastDueError;

  const { data: expiredV2GraceSubscriptions, error: v2GraceError } = await supabase
    .from("subscriptions")
    .update({
      status: "expired",
      updated_at: now
    })
    .eq("status", "grace")
    .lt("grace_ends_at", now)
    .select("id,restaurant_id");

  if (v2GraceError && !isMissingSchemaError(v2GraceError)) throw v2GraceError;

  const { data: expiredV2GraceFallbackSubscriptions, error: v2GraceFallbackError } = await supabase
    .from("subscriptions")
    .update({
      status: "expired",
      updated_at: now
    })
    .eq("status", "grace")
    .is("grace_ends_at", null)
    .lt("current_period_end", graceCutoff)
    .select("id,restaurant_id");

  if (v2GraceFallbackError && !isMissingSchemaError(v2GraceFallbackError)) throw v2GraceFallbackError;

  // Hết hạn gói thử nghiệm V2
  const { data: expiredV2Trials, error: v2TrialError } = await supabase
    .from("subscriptions")
    .update({
      status: "expired",
      updated_at: now
    })
    .eq("status", "trialing")
    .lt("trial_ends_at", now)
    .select("id,restaurant_id");

  if (v2TrialError && !isMissingSchemaError(v2TrialError)) throw v2TrialError;

  // Chuyển gói active V2 sang grace
  const { data: activeV2Subscriptions, error: activeV2QueryError } = await supabase
    .from("subscriptions")
    .select("id,restaurant_id,current_period_end")
    .eq("status", "active")
    .lt("current_period_end", now);

  if (activeV2QueryError && !isMissingSchemaError(activeV2QueryError)) throw activeV2QueryError;

  const transitionedV2GraceSubscriptions: { id: string; restaurant_id: string }[] = [];
  if (activeV2Subscriptions && activeV2Subscriptions.length > 0) {
    for (const sub of activeV2Subscriptions) {
      const currentPeriodEnd = new Date(sub.current_period_end);
      const graceEndsAt = addDays(currentPeriodEnd, 7).toISOString();
      const { data: updatedSub, error: updateError } = await supabase
        .from("subscriptions")
        .update({
          status: "grace",
          grace_ends_at: graceEndsAt,
          updated_at: now
        })
        .eq("id", sub.id)
        .select("id,restaurant_id")
        .single();

      if (updateError && !isMissingSchemaError(updateError)) throw updateError;
      if (updatedSub) transitionedV2GraceSubscriptions.push(updatedSub);
    }
  }

  const affectedRestaurantIds = new Set<string>();
  for (const row of expiredTrials ?? []) affectedRestaurantIds.add(row.restaurant_id);
  for (const row of pastDueSubscriptions ?? []) affectedRestaurantIds.add(row.restaurant_id);
  for (const row of expiredPastDueSubscriptions ?? []) affectedRestaurantIds.add(row.restaurant_id);
  for (const row of expiredV2GraceSubscriptions ?? []) affectedRestaurantIds.add(row.restaurant_id);
  for (const row of expiredV2GraceFallbackSubscriptions ?? []) affectedRestaurantIds.add(row.restaurant_id);
  for (const row of expiredV2Trials ?? []) affectedRestaurantIds.add(row.restaurant_id);
  for (const row of transitionedV2GraceSubscriptions ?? []) affectedRestaurantIds.add(row.restaurant_id);

  for (const restaurantId of affectedRestaurantIds) invalidateRestaurantEntitlementCache(restaurantId);

  await Promise.all([
    ...(expiredTrials ?? []).map((row: { id: string; restaurant_id: string }) =>
      notifyPlatformSubscriptionStatusChanged({
        subscriptionId: row.id,
        restaurantId: row.restaurant_id,
        previousStatus: "trialing",
        status: "expired",
        reason: "Trial đã hết hạn.",
        changedAt: now,
        source: "system"
      })
    ),
    ...(pastDueSubscriptions ?? []).map((row: { id: string; restaurant_id: string }) =>
      notifyPlatformSubscriptionStatusChanged({
        subscriptionId: row.id,
        restaurantId: row.restaurant_id,
        previousStatus: "active",
        status: "past_due",
        reason: "Kỳ thanh toán đã quá hạn.",
        changedAt: now,
        source: "system"
      })
    ),
    ...(expiredPastDueSubscriptions ?? []).map((row: { id: string; restaurant_id: string }) =>
      notifyPlatformSubscriptionStatusChanged({
        subscriptionId: row.id,
        restaurantId: row.restaurant_id,
        previousStatus: "past_due",
        status: "expired",
        reason: "Quá thời gian grace sau past_due.",
        changedAt: now,
        source: "system"
      })
    )
  ]);

  const result = {
    expiredTrials: expiredTrials?.length ?? 0,
    pastDueSubscriptions: pastDueSubscriptions?.length ?? 0,
    expiredPastDueSubscriptions: expiredPastDueSubscriptions?.length ?? 0,
    expiredV2GraceSubscriptions: (expiredV2GraceSubscriptions?.length ?? 0) + (expiredV2GraceFallbackSubscriptions?.length ?? 0),
    expiredV2Trials: expiredV2Trials?.length ?? 0,
    transitionedV2GraceSubscriptions: transitionedV2GraceSubscriptions.length,
    reminders
  };

  if (
    result.expiredTrials ||
    result.pastDueSubscriptions ||
    result.expiredPastDueSubscriptions ||
    result.expiredV2GraceSubscriptions ||
    result.expiredV2Trials ||
    result.transitionedV2GraceSubscriptions
  ) {
    await supabase.from("platform_audit_logs").insert({
      actor: "system-cron",
      action: "subscriptions_expired",
      target_type: "restaurant_subscription",
      metadata: result
    });
  }

  return result;
}
