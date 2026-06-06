import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import {
  disableUserPushSubscription,
  getWebPushPublicConfig,
  listUserPushSubscriptions,
  pushSubscriptionInputSchema,
  upsertUserPushSubscription
} from "@/services/push-notification-service";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

const deviceSchema = z.object({
  deviceLabel: z.string().max(80).optional().nullable(),
  platform: z.string().max(60).optional().nullable(),
  appSurface: z.enum(["dashboard", "staff", "customer", "platform"]).optional(),
  permissionState: z.enum(["granted", "denied", "default"]).optional(),
  userAgent: z.string().max(500).optional().nullable()
});

const subscribeSchema = z.object({
  subscription: pushSubscriptionInputSchema,
  device: deviceSchema.optional().default({})
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048).optional().nullable()
});

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession();
    const config = getWebPushPublicConfig();
    const subscriptions = await listUserPushSubscriptions(session);
    return ok({
      ...config,
      subscriptions,
      activeCount: subscriptions.filter((subscription: { enabled: boolean }) => subscription.enabled).length
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession();
    const body = subscribeSchema.parse(await request.json().catch(() => ({})));
    const subscription = await upsertUserPushSubscription({
      session,
      subscription: body.subscription,
      device: body.device
    });
    return ok(subscription);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession();
    const body = unsubscribeSchema.parse(await request.json().catch(() => ({})));
    return ok(await disableUserPushSubscription({ session, endpoint: body.endpoint }));
  } catch (error) {
    return fail(error);
  }
}
