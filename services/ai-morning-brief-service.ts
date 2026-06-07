import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/services/email-delivery";
import { writeOperationalEvent } from "@/services/operational-observability-service";
import {
  buildAiMorningBriefActionItems,
  calculateAiMorningBriefCounts,
  normalizeAiMorningBriefRecipients,
  resolveAiMorningBriefDate
} from "@/lib/ai/morning-brief";
import type { AiOperationInsightsDeck } from "@/lib/ai/operation-insights";
import type { AiMorningBriefActionItem } from "@/lib/ai/morning-brief";

export type { AiMorningBriefActionItem } from "@/lib/ai/morning-brief";

export type AiMorningBriefStatus = "generated" | "sent" | "skipped" | "failed";
export type AiMorningBriefChannel = "dashboard" | "email";

export type AiMorningBriefRun = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  briefDate: string;
  source: string;
  channel: AiMorningBriefChannel;
  status: AiMorningBriefStatus;
  recipients: string[];
  healthScore: number;
  summary: string;
  primaryInsightKey: string | null;
  insightCount: number;
  criticalCount: number;
  warningCount: number;
  opportunityCount: number;
  actionItems: AiMorningBriefActionItem[];
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
};

type AiMorningBriefRow = {
  id: string;
  restaurant_id: string;
  restaurant_name: string;
  brief_date: string;
  source: string;
  channel: AiMorningBriefChannel;
  status: AiMorningBriefStatus;
  recipient_emails: string[];
  health_score: number;
  summary: string;
  primary_insight_key: string | null;
  insight_count: number;
  critical_count: number;
  warning_count: number;
  opportunity_count: number;
  action_items: unknown;
  deck?: unknown;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
};

type AiMorningBriefPreferencesRow = {
  restaurant_id: string;
  email_enabled: boolean;
  recipient_emails: string[];
  send_hour: number;
  timezone: string;
  updated_at: string;
};

export type AiMorningBriefPreferences = {
  restaurantId: string;
  emailEnabled: boolean;
  recipients: string[];
  sendHour: number;
  timezone: string;
  updatedAt: string | null;
};

type CreateAiMorningBriefInput = {
  restaurantId: string;
  restaurantName: string;
  contactEmail?: string | null;
  recipients?: string[];
  deck: AiOperationInsightsDeck;
  source?: "ai_ops_cron" | "dashboard" | "manual";
  emailEnabled?: boolean;
  now?: Date;
};

type UpdateAiMorningBriefPreferencesInput = {
  restaurantId: string;
  emailEnabled: boolean;
  recipients: string[];
  sendHour?: number;
  timezone?: string;
  actorUserId?: string | null;
  fallbackEmail?: string | null;
};

type RetryAiMorningBriefEmailInput = {
  restaurantId: string;
  runId: string;
  actorUserId?: string | null;
};

type RecordAiMorningBriefRunInput = {
  restaurantId: string;
  restaurantName: string;
  deck: AiOperationInsightsDeck;
  source: "ai_ops_cron" | "dashboard" | "manual";
  channel: AiMorningBriefChannel;
  status: AiMorningBriefStatus;
  recipients?: string[];
  provider?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  sentAt?: string | null;
  now: Date;
};

function isMissingAiMorningBriefSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.message?.includes("Could not find") ||
    error.message?.includes("does not exist")
  );
}

function sanitizeText(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeDeck(deck: AiOperationInsightsDeck) {
  try {
    return JSON.parse(JSON.stringify(deck)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function safeActionItems(value: unknown): AiMorningBriefActionItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AiMorningBriefActionItem => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return typeof record.id === "string" && typeof record.title === "string" && typeof record.action === "string";
  });
}

function asAiMorningBriefDeck(value: unknown): AiOperationInsightsDeck | null {
  const deck = value as AiOperationInsightsDeck | null | undefined;
  if (!deck || typeof deck.generatedAt !== "string" || typeof deck.summary !== "string" || !Array.isArray(deck.insights)) {
    return null;
  }
  return deck;
}

function mapMorningBriefRun(row: AiMorningBriefRow): AiMorningBriefRun {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    briefDate: row.brief_date,
    source: row.source,
    channel: row.channel,
    status: row.status,
    recipients: row.recipient_emails ?? [],
    healthScore: row.health_score,
    summary: row.summary,
    primaryInsightKey: row.primary_insight_key,
    insightCount: row.insight_count,
    criticalCount: row.critical_count,
    warningCount: row.warning_count,
    opportunityCount: row.opportunity_count,
    actionItems: safeActionItems(row.action_items),
    errorMessage: row.error_message,
    sentAt: row.sent_at,
    createdAt: row.created_at
  };
}

function defaultAiMorningBriefPreferences(restaurantId: string, fallbackEmail?: string | null): AiMorningBriefPreferences {
  return {
    restaurantId,
    emailEnabled: false,
    recipients: normalizeAiMorningBriefRecipients([fallbackEmail]),
    sendHour: 7,
    timezone: "Asia/Ho_Chi_Minh",
    updatedAt: null
  };
}

function mapMorningBriefPreferences(row: AiMorningBriefPreferencesRow): AiMorningBriefPreferences {
  return {
    restaurantId: row.restaurant_id,
    emailEnabled: Boolean(row.email_enabled),
    recipients: normalizeAiMorningBriefRecipients(row.recipient_emails ?? []),
    sendHour: Math.max(0, Math.min(23, Math.floor(Number(row.send_hour) || 7))),
    timezone: row.timezone || "Asia/Ho_Chi_Minh",
    updatedAt: row.updated_at ?? null
  };
}

function buildMorningBriefEmailHtml(input: {
  restaurantName: string;
  deck: AiOperationInsightsDeck;
  items: AiMorningBriefActionItem[];
}) {
  const rows = input.items
    .map(
      (item) => `
        <tr>
          <td style="border-top:1px solid #E2E8F0;padding:12px 0;">
            <div style="font-size:13px;color:#64748B;font-weight:700;text-transform:uppercase;">${escapeHtml(item.severity)} · ${escapeHtml(item.kind)}</div>
            <div style="font-size:15px;font-weight:800;margin-top:4px;">${escapeHtml(item.title)}</div>
            <div style="font-size:14px;color:#475569;margin-top:4px;line-height:1.6;">${escapeHtml(item.action)}</div>
          </td>
        </tr>`
    )
    .join("");
  const restaurantName = escapeHtml(input.restaurantName);
  const summary = escapeHtml(input.deck.summary);

  return `<!doctype html>
<html lang="vi">
  <body style="margin:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif;color:#0F172A;">
    <div style="max-width:720px;margin:0 auto;padding:28px;">
      <div style="border:1px solid #E2E8F0;border-radius:20px;background:#FFFFFF;overflow:hidden;">
        <div style="padding:24px 28px;background:#0F4D3A;color:#FFFFFF;">
          <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.78;">LogiVN AI Ops</div>
          <h1 style="margin:8px 0 0;font-size:28px;line-height:1.2;">Morning Brief - ${restaurantName}</h1>
          <p style="margin:10px 0 0;opacity:.86;">${summary}</p>
        </div>
        <div style="padding:24px 28px;">
          <div style="border:1px solid #E2E8F0;border-radius:14px;padding:16px;background:#F8FAFC;">
            <div style="font-size:12px;color:#64748B;font-weight:800;text-transform:uppercase;">Health score</div>
            <div style="font-size:32px;font-weight:900;margin-top:4px;">${input.deck.healthScore}/100</div>
          </div>
          <h2 style="font-size:18px;margin:26px 0 12px;">Việc nên xử lý hôm nay</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            ${rows || `<tr><td style="padding:12px 0;color:#64748B;">AI Ops chưa thấy rủi ro rõ trong ca hiện tại.</td></tr>`}
          </table>
          <p style="margin-top:24px;color:#64748B;font-size:13px;line-height:1.7;">Brief này được tạo từ dữ liệu vận hành của quán trong LogiVN. Mở dashboard để xem thẻ hành động và đánh dấu đã xử lý.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

async function sendMorningBriefEmail(input: {
  recipients: string[];
  restaurantName: string;
  deck: AiOperationInsightsDeck;
  items: AiMorningBriefActionItem[];
}) {
  const from = process.env.AI_OPS_MORNING_BRIEF_FROM ?? process.env.REPORT_EMAIL_FROM ?? process.env.RESEND_FROM ?? "LogiVN <reports@logivn.com>";
  return sendTransactionalEmail({
    from,
    to: input.recipients,
    subject: `LogiVN AI Morning Brief - ${input.restaurantName}`,
    html: buildMorningBriefEmailHtml(input)
  });
}

async function recordAiMorningBriefRun(input: RecordAiMorningBriefRunInput) {
  const supabase = createAdminSupabaseClient() as any;
  const counts = calculateAiMorningBriefCounts(input.deck);
  const items = buildAiMorningBriefActionItems(input.deck);
  const { data, error } = await supabase
    .from("ai_morning_brief_runs")
    .upsert(
      {
        restaurant_id: input.restaurantId,
        branch_id: null,
        scope_key: "restaurant",
        brief_date: resolveAiMorningBriefDate(input.now),
        source: input.source,
        channel: input.channel,
        status: input.status,
        restaurant_name: sanitizeText(input.restaurantName, 180),
        recipient_emails: input.recipients ?? [],
        health_score: Math.max(0, Math.min(100, Math.round(input.deck.healthScore))),
        summary: sanitizeText(input.deck.summary, 700),
        primary_insight_key: input.deck.primaryInsightId,
        insight_count: counts.insightCount,
        critical_count: counts.criticalCount,
        warning_count: counts.warningCount,
        opportunity_count: counts.opportunityCount,
        action_items: items,
        deck: safeDeck(input.deck),
        provider: input.provider ?? null,
        provider_message_id: input.providerMessageId ?? null,
        error_message: input.errorMessage ? sanitizeText(input.errorMessage, 1000) : null,
        sent_at: input.sentAt ?? null
      },
      { onConflict: "restaurant_id,scope_key,source,channel,brief_date" }
    )
    .select("id,restaurant_id,restaurant_name,brief_date,source,channel,status,recipient_emails,health_score,summary,primary_insight_key,insight_count,critical_count,warning_count,opportunity_count,action_items,error_message,sent_at,created_at")
    .single();

  if (error) {
    if (isMissingAiMorningBriefSchema(error)) return { schemaReady: false, run: null };
    writeOperationalEvent({
      area: "ai",
      event: "ai_morning_brief_write_failed",
      restaurantId: input.restaurantId,
      status: "warn",
      metadata: { code: error.code, message: error.message, channel: input.channel }
    });
    return { schemaReady: false, run: null };
  }

  return { schemaReady: true, run: mapMorningBriefRun(data as AiMorningBriefRow) };
}

async function readAiMorningBriefPreferences(restaurantId: string, fallbackEmail?: string | null) {
  const fallback = defaultAiMorningBriefPreferences(restaurantId, fallbackEmail);
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("ai_morning_brief_preferences")
    .select("restaurant_id,email_enabled,recipient_emails,send_hour,timezone,updated_at")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (error) {
    if (isMissingAiMorningBriefSchema(error)) return { schemaReady: false, preferences: fallback };
    throw error;
  }

  return {
    schemaReady: true,
    preferences: data ? mapMorningBriefPreferences(data as AiMorningBriefPreferencesRow) : fallback
  };
}

export async function createAiMorningBriefRun(input: CreateAiMorningBriefInput) {
  const now = input.now ?? new Date();
  const source = input.source ?? "ai_ops_cron";
  const preferencesResult = await readAiMorningBriefPreferences(input.restaurantId, input.contactEmail);
  const globalEmailEnabled = process.env.AI_OPS_MORNING_BRIEF_EMAIL_ENABLED === "true";
  const emailEnabled = input.emailEnabled ?? (preferencesResult.schemaReady ? preferencesResult.preferences.emailEnabled && globalEmailEnabled : globalEmailEnabled);
  const recipients = input.recipients
    ? normalizeAiMorningBriefRecipients(input.recipients)
    : preferencesResult.preferences.recipients;

  const dashboardRun = await recordAiMorningBriefRun({
    restaurantId: input.restaurantId,
    restaurantName: input.restaurantName,
    deck: input.deck,
    source,
    channel: "dashboard",
    status: "generated",
    now
  });

  if (!dashboardRun.schemaReady) {
    return {
      schemaReady: false,
      dashboard: dashboardRun.run,
      email: null,
      emailStatus: null as AiMorningBriefStatus | null
    };
  }

  if (!emailEnabled) {
    return {
      schemaReady: true,
      dashboard: dashboardRun.run,
      email: null,
      emailStatus: null as AiMorningBriefStatus | null
    };
  }

  if (recipients.length === 0) {
    const emailRun = await recordAiMorningBriefRun({
      restaurantId: input.restaurantId,
      restaurantName: input.restaurantName,
      deck: input.deck,
      source,
      channel: "email",
      status: "skipped",
      recipients,
      errorMessage: "Quán chưa có email liên hệ.",
      now
    });
    return { schemaReady: true, dashboard: dashboardRun.run, email: emailRun.run, emailStatus: "skipped" as const };
  }

  try {
    const sent = await sendMorningBriefEmail({
      recipients,
      restaurantName: input.restaurantName,
      deck: input.deck,
      items: buildAiMorningBriefActionItems(input.deck)
    });
    const emailRun = await recordAiMorningBriefRun({
      restaurantId: input.restaurantId,
      restaurantName: input.restaurantName,
      deck: input.deck,
      source,
      channel: "email",
      status: "sent",
      recipients,
      provider: sent.provider,
      providerMessageId: sent.providerMessageId,
      sentAt: new Date().toISOString(),
      now
    });
    return { schemaReady: true, dashboard: dashboardRun.run, email: emailRun.run, emailStatus: "sent" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không gửi được AI Morning Brief.";
    const emailRun = await recordAiMorningBriefRun({
      restaurantId: input.restaurantId,
      restaurantName: input.restaurantName,
      deck: input.deck,
      source,
      channel: "email",
      status: "failed",
      recipients,
      errorMessage: message,
      now
    });
    return { schemaReady: true, dashboard: dashboardRun.run, email: emailRun.run, emailStatus: "failed" as const };
  }
}

export async function getAiMorningBriefPreferences(restaurantId: string, fallbackEmail?: string | null) {
  return readAiMorningBriefPreferences(restaurantId, fallbackEmail);
}

export async function updateAiMorningBriefPreferences(input: UpdateAiMorningBriefPreferencesInput) {
  const recipients = normalizeAiMorningBriefRecipients(input.recipients);
  const sendHour = Math.max(0, Math.min(23, Math.floor(Number(input.sendHour ?? 7) || 7)));
  const timezone = sanitizeText(input.timezone || "Asia/Ho_Chi_Minh", 64) || "Asia/Ho_Chi_Minh";
  const fallback = defaultAiMorningBriefPreferences(input.restaurantId, input.fallbackEmail);
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("ai_morning_brief_preferences")
    .upsert(
      {
        restaurant_id: input.restaurantId,
        email_enabled: input.emailEnabled,
        recipient_emails: recipients,
        send_hour: sendHour,
        timezone,
        updated_by: input.actorUserId ?? null
      },
      { onConflict: "restaurant_id" }
    )
    .select("restaurant_id,email_enabled,recipient_emails,send_hour,timezone,updated_at")
    .single();

  if (error) {
    if (isMissingAiMorningBriefSchema(error)) return { schemaReady: false, preferences: fallback };
    throw error;
  }

  return { schemaReady: true, preferences: mapMorningBriefPreferences(data as AiMorningBriefPreferencesRow) };
}

export async function retryAiMorningBriefEmail(input: RetryAiMorningBriefEmailInput) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("ai_morning_brief_runs")
    .select("id,restaurant_id,restaurant_name,brief_date,source,channel,status,recipient_emails,health_score,summary,primary_insight_key,insight_count,critical_count,warning_count,opportunity_count,action_items,deck,error_message,sent_at,created_at")
    .eq("id", input.runId)
    .eq("restaurant_id", input.restaurantId)
    .maybeSingle();

  if (error) {
    if (isMissingAiMorningBriefSchema(error)) {
      return { schemaReady: false, emailStatus: null as AiMorningBriefStatus | null, run: null, message: "Chưa có bảng AI Morning Brief." };
    }
    throw error;
  }

  if (!data) {
    throw new AppError("Không tìm thấy AI Morning Brief của quán này.", 404);
  }

  const row = data as AiMorningBriefRow;
  const deck = asAiMorningBriefDeck(row.deck);
  if (!deck) {
    throw new AppError("Brief này thiếu dữ liệu deck để gửi lại email.", 409);
  }

  const preferencesResult = await getAiMorningBriefPreferences(input.restaurantId);
  const preferences = preferencesResult.preferences;

  if (preferencesResult.schemaReady && !preferences.emailEnabled) {
    const skipped = await recordAiMorningBriefRun({
      restaurantId: input.restaurantId,
      restaurantName: row.restaurant_name,
      deck,
      source: row.source as "ai_ops_cron" | "dashboard" | "manual",
      channel: "email",
      status: "skipped",
      recipients: preferences.recipients,
      errorMessage: "Email Morning Brief đang tắt trong cài đặt quán.",
      now: new Date()
    });
    return { schemaReady: skipped.schemaReady, emailStatus: "skipped" as const, run: skipped.run, message: "Email Morning Brief đang tắt." };
  }

  const recipients = preferencesResult.schemaReady
    ? preferences.recipients
    : normalizeAiMorningBriefRecipients(row.recipient_emails ?? []);

  if (recipients.length === 0) {
    const skipped = await recordAiMorningBriefRun({
      restaurantId: input.restaurantId,
      restaurantName: row.restaurant_name,
      deck,
      source: row.source as "ai_ops_cron" | "dashboard" | "manual",
      channel: "email",
      status: "skipped",
      recipients,
      errorMessage: "Chưa có email nhận Morning Brief.",
      now: new Date()
    });
    return { schemaReady: skipped.schemaReady, emailStatus: "skipped" as const, run: skipped.run, message: "Chưa có email nhận brief." };
  }

  try {
    const sent = await sendMorningBriefEmail({
      recipients,
      restaurantName: row.restaurant_name,
      deck,
      items: buildAiMorningBriefActionItems(deck)
    });
    const emailRun = await recordAiMorningBriefRun({
      restaurantId: input.restaurantId,
      restaurantName: row.restaurant_name,
      deck,
      source: row.source as "ai_ops_cron" | "dashboard" | "manual",
      channel: "email",
      status: "sent",
      recipients,
      provider: sent.provider,
      providerMessageId: sent.providerMessageId,
      sentAt: new Date().toISOString(),
      now: new Date()
    });
    writeOperationalEvent({
      area: "ai",
      event: "ai_morning_brief_email_retried",
      restaurantId: input.restaurantId,
      status: "success",
      metadata: { runId: input.runId, actorUserId: input.actorUserId ?? null }
    });
    return { schemaReady: true, emailStatus: "sent" as const, run: emailRun.run, message: "Đã gửi lại Morning Brief." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không gửi được AI Morning Brief.";
    const emailRun = await recordAiMorningBriefRun({
      restaurantId: input.restaurantId,
      restaurantName: row.restaurant_name,
      deck,
      source: row.source as "ai_ops_cron" | "dashboard" | "manual",
      channel: "email",
      status: "failed",
      recipients,
      errorMessage: message,
      now: new Date()
    });
    writeOperationalEvent({
      area: "ai",
      event: "ai_morning_brief_email_retry_failed",
      restaurantId: input.restaurantId,
      status: "warn",
      metadata: { runId: input.runId, actorUserId: input.actorUserId ?? null, message }
    });
    return { schemaReady: true, emailStatus: "failed" as const, run: emailRun.run, message };
  }
}

export async function getLatestAiMorningBriefRun(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("ai_morning_brief_runs")
    .select("id,restaurant_id,restaurant_name,brief_date,source,channel,status,recipient_emails,health_score,summary,primary_insight_key,insight_count,critical_count,warning_count,opportunity_count,action_items,error_message,sent_at,created_at")
    .eq("restaurant_id", restaurantId)
    .order("brief_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingAiMorningBriefSchema(error)) return null;
    throw error;
  }

  return data ? mapMorningBriefRun(data as AiMorningBriefRow) : null;
}

export async function listRecentAiMorningBriefRuns(restaurantId: string, limit = 8) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("ai_morning_brief_runs")
    .select("id,restaurant_id,restaurant_name,brief_date,source,channel,status,recipient_emails,health_score,summary,primary_insight_key,insight_count,critical_count,warning_count,opportunity_count,action_items,error_message,sent_at,created_at")
    .eq("restaurant_id", restaurantId)
    .order("brief_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingAiMorningBriefSchema(error)) return [];
    throw error;
  }

  return ((data ?? []) as AiMorningBriefRow[]).map(mapMorningBriefRun);
}
