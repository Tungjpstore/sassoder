import "server-only";

import webPush, { type PushSubscription, type Urgency, WebPushError } from "web-push";
import { z } from "zod";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { StaffPermissionKey } from "@/lib/staff-permissions";
import { getStaffEffectivePermissions } from "@/services/staff-permission-service";
import { normalizePwaPushPayload, operationalEventToPwaPushTarget, type PwaPushPayload } from "@/lib/pwa/push-notifications";
import type { OperationalEvent } from "@/services/operational-event-bus";
import type { SessionProfile, UserRole } from "@/types/domain";

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().url().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(20).max(4096),
    auth: z.string().min(8).max(1024)
  })
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

type PushDeviceInput = {
  deviceLabel?: string | null;
  platform?: string | null;
  appSurface?: "dashboard" | "staff" | "customer" | "platform";
  permissionState?: "granted" | "denied" | "default";
  userAgent?: string | null;
};

type PushSubscriptionRow = {
  id: string;
  restaurant_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
  user_agent?: string | null;
};

type PushUserRow = {
  id: string;
  email: string;
  role: UserRole;
  account_status?: "active" | "blocked" | null;
};

type PushSendSummary = {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
  disabled: number;
};

const MAX_PUSH_SUBSCRIPTIONS_PER_EVENT = Number(process.env.PWA_PUSH_MAX_SUBSCRIPTIONS_PER_EVENT || 80);

export function getWebPushPublicConfig() {
  const runtime = getWebPushRuntimeConfig();
  return {
    configured: runtime.configured,
    publicKey: runtime.publicKey
  };
}

export async function listUserPushSubscriptions(session: SessionProfile) {
  const supabase = createAdminSupabaseClient() as any;
  const result = await supabase
    .from("push_subscriptions")
    .select("id,device_label,platform,app_surface,enabled,last_seen_at,last_success_at,last_failure_at,created_at,disabled_at")
    .eq("restaurant_id", session.restaurantId)
    .eq("user_id", session.userId)
    .order("last_seen_at", { ascending: false })
    .limit(12);

  if (result.error) {
    if (isMissingPushSchema(result.error)) return [];
    throw result.error;
  }

  return (result.data ?? []).map((row: any) => ({
    id: String(row.id),
    deviceLabel: row.device_label ? String(row.device_label) : null,
    platform: row.platform ? String(row.platform) : null,
    appSurface: row.app_surface ? String(row.app_surface) : "dashboard",
    enabled: Boolean(row.enabled) && !row.disabled_at,
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
    lastFailureAt: row.last_failure_at ? String(row.last_failure_at) : null,
    createdAt: row.created_at ? String(row.created_at) : null
  }));
}

export async function upsertUserPushSubscription({
  session,
  subscription,
  device
}: {
  session: SessionProfile;
  subscription: PushSubscriptionInput;
  device: PushDeviceInput;
}) {
  const runtime = assertWebPushConfigured();
  const supabase = createAdminSupabaseClient() as any;
  const parsed = pushSubscriptionInputSchema.parse(subscription);
  const now = new Date().toISOString();

  const row = {
    restaurant_id: session.restaurantId,
    user_id: session.userId,
    endpoint: parsed.endpoint,
    p256dh: parsed.keys.p256dh,
    auth: parsed.keys.auth,
    expiration_time: parsed.expirationTime ? new Date(parsed.expirationTime).toISOString() : null,
    device_label: cleanOptionalText(device.deviceLabel, 80),
    platform: cleanOptionalText(device.platform, 60),
    app_surface: device.appSurface || "dashboard",
    permission_state: device.permissionState || "granted",
    enabled: true,
    failure_count: 0,
    disabled_at: null,
    disabled_reason: null,
    last_seen_at: now,
    user_agent: cleanOptionalText(device.userAgent, 500),
    metadata: {
      vapidPublicKeyFingerprint: runtime.publicKey.slice(0, 12)
    },
    updated_at: now
  };

  const result = await supabase
    .from("push_subscriptions")
    .upsert(row, { onConflict: "endpoint" })
    .select("id,last_seen_at")
    .single();

  if (result.error) {
    if (isMissingPushSchema(result.error)) throw new AppError("Schema Web Push chưa sẵn sàng. Vui lòng chạy migration PWA mới.", 503);
    throw result.error;
  }

  return {
    id: String(result.data.id),
    lastSeenAt: String(result.data.last_seen_at)
  };
}

export async function disableUserPushSubscription({ session, endpoint, reason = "user_unsubscribed" }: { session: SessionProfile; endpoint?: string | null; reason?: string }) {
  const supabase = createAdminSupabaseClient() as any;
  const patch = {
    enabled: false,
    disabled_at: new Date().toISOString(),
    disabled_reason: reason.slice(0, 120)
  };
  let query = supabase.from("push_subscriptions").update(patch).eq("restaurant_id", session.restaurantId).eq("user_id", session.userId);
  if (endpoint) query = query.eq("endpoint", endpoint);

  const result = await query.select("id");
  if (result.error) {
    if (isMissingPushSchema(result.error)) return { disabled: 0 };
    throw result.error;
  }

  return { disabled: result.data?.length ?? 0 };
}

export async function sendTestPushToUser(session: SessionProfile) {
  const payload = normalizePwaPushPayload({
    title: "Thông báo LogiVN đã sẵn sàng",
    body: "Thiết bị này sẽ nhận cảnh báo vận hành khi PWA đang ở nền.",
    tag: `push-test:${session.userId}`,
    data: {
      url: "/dashboard",
      eventId: `push-test:${Date.now()}`,
      eventType: "push.test"
    }
  });
  const subscriptions = await readActiveSubscriptions({ restaurantId: session.restaurantId, userId: session.userId, limit: 5 });
  return sendPayloadToSubscriptions(subscriptions, payload, { urgency: "normal", ttlSeconds: 120 });
}

export async function sendOperationalEventPush(event: OperationalEvent): Promise<PushSendSummary> {
  if (!event.restaurantId) return emptySummary();
  const target = operationalEventToPwaPushTarget(event as Parameters<typeof operationalEventToPwaPushTarget>[0]);
  if (!target) return emptySummary();
  if (!getWebPushRuntimeConfig().configured) return emptySummary();

  const subscriptions = await readActiveSubscriptions({ restaurantId: event.restaurantId, limit: boundedEventLimit() });
  if (!subscriptions.length) return emptySummary();

  const users = await readPushUsers(event.restaurantId, Array.from(new Set(subscriptions.map((subscription) => subscription.user_id))));
  const allowedSubscriptions: PushSubscriptionRow[] = [];

  for (const subscription of subscriptions) {
    const user = users.get(subscription.user_id);
    if (!user || user.account_status === "blocked") continue;
    if (await userCanReceivePush({ restaurantId: event.restaurantId, user, requiredPermissions: target.requiredPermissions })) {
      allowedSubscriptions.push(subscription);
    }
  }

  const sent = await sendPayloadToSubscriptions(allowedSubscriptions, target.payload, {
    urgency: target.urgency,
    ttlSeconds: target.ttlSeconds
  });

  return {
    ...sent,
    scanned: subscriptions.length,
    skipped: subscriptions.length - allowedSubscriptions.length
  };
}

async function readActiveSubscriptions({ restaurantId, userId, limit }: { restaurantId: string; userId?: string; limit: number }) {
  const supabase = createAdminSupabaseClient() as any;
  let query = supabase
    .from("push_subscriptions")
    .select("id,restaurant_id,user_id,endpoint,p256dh,auth,failure_count,user_agent")
    .eq("restaurant_id", restaurantId)
    .eq("enabled", true)
    .is("disabled_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (userId) query = query.eq("user_id", userId);

  const result = await query;
  if (result.error) {
    if (isMissingPushSchema(result.error)) return [];
    throw result.error;
  }

  return (result.data ?? []) as PushSubscriptionRow[];
}

async function readPushUsers(restaurantId: string, userIds: string[]) {
  if (!userIds.length) return new Map<string, PushUserRow>();
  const supabase = createAdminSupabaseClient() as any;
  const result = await supabase
    .from("users")
    .select("id,email,role,account_status")
    .eq("restaurant_id", restaurantId)
    .in("id", userIds);
  if (result.error) throw result.error;
  return new Map<string, PushUserRow>((result.data ?? []).map((user: PushUserRow) => [user.id, user]));
}

async function userCanReceivePush({ restaurantId, user, requiredPermissions }: { restaurantId: string; user: PushUserRow; requiredPermissions: StaffPermissionKey[] }) {
  if (!requiredPermissions.length || user.role === "ADMIN") return true;

  try {
    const context = await getStaffEffectivePermissions({
      userId: user.id,
      email: user.email,
      role: user.role,
      accountStatus: user.account_status ?? "active",
      restaurantId,
      restaurant: {
        id: restaurantId,
        name: "",
        slug: ""
      }
    });
    const granted = new Set(context.permissions);
    return requiredPermissions.some((permission) => granted.has(permission));
  } catch (error) {
    console.warn("[push-notifications] permission check skipped subscription", { userId: user.id, error });
    return false;
  }
}

async function sendPayloadToSubscriptions(subscriptions: PushSubscriptionRow[], payload: PwaPushPayload, options: { urgency: Urgency; ttlSeconds: number }): Promise<PushSendSummary> {
  const runtime = assertWebPushConfigured();
  const summary = emptySummary();
  summary.scanned = subscriptions.length;
  const normalized = normalizePwaPushPayload(payload);
  const body = JSON.stringify(normalized);

  await Promise.all(
    subscriptions.map(async (row) => {
      try {
        await webPush.sendNotification(toWebPushSubscription(row), body, {
          vapidDetails: runtime,
          TTL: options.ttlSeconds,
          urgency: options.urgency,
          contentEncoding: "aes128gcm",
          timeout: 4500
        });
        summary.sent += 1;
        await markPushSuccess(row.id);
      } catch (error) {
        summary.failed += 1;
        if (isExpiredPushEndpoint(error)) {
          summary.disabled += 1;
          await disablePushRow(row.id, "push_endpoint_expired");
          return;
        }
        await markPushFailure(row.id, error);
      }
    })
  );

  return summary;
}

function toWebPushSubscription(row: PushSubscriptionRow): PushSubscription {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth
    }
  };
}

async function markPushSuccess(id: string) {
  const supabase = createAdminSupabaseClient() as any;
  await supabase
    .from("push_subscriptions")
    .update({
      failure_count: 0,
      last_success_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    })
    .eq("id", id);
}

async function markPushFailure(id: string, error: unknown) {
  const supabase = createAdminSupabaseClient() as any;
  await supabase
    .from("push_subscriptions")
    .update({
      last_failure_at: new Date().toISOString(),
      metadata: {
        lastError: error instanceof Error ? error.message.slice(0, 180) : "push_failed"
      }
    })
    .eq("id", id);
}

async function disablePushRow(id: string, reason: string) {
  const supabase = createAdminSupabaseClient() as any;
  await supabase
    .from("push_subscriptions")
    .update({
      enabled: false,
      disabled_at: new Date().toISOString(),
      disabled_reason: reason,
      last_failure_at: new Date().toISOString()
    })
    .eq("id", id);
}

function getWebPushRuntimeConfig() {
  const publicKey = (process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = (process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  const subject = (process.env.WEB_PUSH_VAPID_SUBJECT || process.env.NEXT_PUBLIC_SITE_URL || "mailto:admin@logivn.com").trim();

  return {
    configured: Boolean(publicKey && privateKey && subject),
    subject,
    publicKey,
    privateKey
  };
}

function assertWebPushConfigured() {
  const config = getWebPushRuntimeConfig();
  if (!config.configured) {
    throw new AppError("Web Push chưa được cấu hình VAPID keys.", 503);
  }
  return {
    subject: config.subject,
    publicKey: config.publicKey,
    privateKey: config.privateKey
  };
}

function isExpiredPushEndpoint(error: unknown) {
  return error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410);
}

function isMissingPushSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42P01" || /push_subscriptions/i.test(error.message ?? "");
}

function cleanOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function boundedEventLimit() {
  if (!Number.isFinite(MAX_PUSH_SUBSCRIPTIONS_PER_EVENT)) return 80;
  return Math.max(1, Math.min(500, Math.trunc(MAX_PUSH_SUBSCRIPTIONS_PER_EVENT)));
}

function emptySummary(): PushSendSummary {
  return { scanned: 0, sent: 0, skipped: 0, failed: 0, disabled: 0 };
}
