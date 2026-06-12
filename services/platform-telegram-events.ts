import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { publishOperationalEvent, type OperationalEvent } from "@/services/operational-event-bus";

type RestaurantLike = {
  id: string;
  name?: string | null;
  slug?: string | null;
  business_type?: string | null;
  table_count?: number | null;
  contact_email?: string | null;
  hotline?: string | null;
  address?: string | null;
  bank_account?: string | null;
  store_lat?: number | null;
  store_lng?: number | null;
  platform_status?: string | null;
  created_at?: string | null;
};

type PlanLike = {
  id?: string | null;
  code?: string | null;
  name?: string | null;
  monthly_price?: number | null;
};

type SubscriptionLike = {
  id?: string | null;
  restaurant_id?: string | null;
  status?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
  metadata?: unknown;
  plan?: PlanLike | PlanLike[] | null;
};

type PaymentLike = {
  id: string;
  restaurant_id: string;
  subscription_id?: string | null;
  plan_id?: string | null;
  amount?: number | null;
  months?: number | null;
  transfer_content?: string | null;
  raw_data?: unknown;
  created_at?: string | null;
  confirmed_at?: string | null;
  confirmed_by?: string | null;
  rejected_at?: string | null;
  rejected_reason?: string | null;
  restaurant?: RestaurantLike | RestaurantLike[] | null;
  plan?: PlanLike | PlanLike[] | null;
  subscription?: SubscriptionLike | SubscriptionLike[] | null;
};

export async function notifyPlatformTenantCreated(input: {
  restaurant: RestaurantLike;
  requestedPlanCode?: string | null;
  initialMenuItemCount?: number | null;
  source?: "dashboard" | "system" | "devops";
}) {
  const subscription = await readLatestSubscription(input.restaurant.id).catch(() => null);
  const plan = firstOrNull(subscription?.plan);
  const metadata = asRecord(subscription?.metadata);

  await publishPlatformEventSafely({
    type: "platform.tenant.created",
    eventId: `platform.tenant.created:${input.restaurant.id}`,
    restaurantId: input.restaurant.id,
    source: input.source ?? "dashboard",
    tenant: {
      id: input.restaurant.id,
      name: input.restaurant.name ?? "Không rõ quán",
      slug: input.restaurant.slug ?? null,
      businessType: input.restaurant.business_type ?? null,
      tableCount: input.restaurant.table_count ?? null,
      contactEmail: input.restaurant.contact_email ?? null,
      hotline: input.restaurant.hotline ?? null,
      address: input.restaurant.address ?? null,
      platformStatus: input.restaurant.platform_status ?? "active",
      createdAt: input.restaurant.created_at ?? null,
      planCode: stringField(plan, "code"),
      planName: stringField(plan, "name"),
      subscriptionStatus: subscription?.status ?? null,
      trialEndsAt: subscription?.trial_ends_at ?? null,
      currentPeriodEnd: subscription?.current_period_end ?? null,
      requestedPlanCode: input.requestedPlanCode ?? stringField(metadata, "requestedPlanCode"),
      hasBankAccount: Boolean(input.restaurant.bank_account),
      hasLocation: Boolean(input.restaurant.store_lat && input.restaurant.store_lng),
      initialMenuItemCount: input.initialMenuItemCount ?? null
    }
  });
}

export async function notifyPlatformSubscriptionApprovalRequested(input: {
  restaurant: RestaurantLike;
  subscription: SubscriptionLike;
  currentPlan?: PlanLike | null;
  targetPlan?: PlanLike | null;
  payment: PaymentLike;
  billingAction?: string | null;
  effectiveSummary?: string | null;
  effectiveAt?: string | null;
}) {
  await publishPlatformEventSafely({
    type: "platform.subscription.approval_requested",
    eventId: `platform.subscription.approval_requested:${input.payment.id}`,
    restaurantId: input.restaurant.id,
    source: "dashboard",
    payment: buildPlatformPaymentSnapshot({
      payment: input.payment,
      restaurant: input.restaurant,
      subscription: input.subscription,
      targetPlan: input.targetPlan,
      currentPlan: input.currentPlan,
      billingAction: input.billingAction,
      effectiveSummary: input.effectiveSummary,
      effectiveAt: input.effectiveAt
    })
  });
}

export async function notifyPlatformSubscriptionResolved(input: {
  paymentId: string;
  status: "confirmed" | "rejected";
  resolvedBy?: string | null;
  rejectedReason?: string | null;
  source?: "dashboard" | "system" | "devops" | "telegram";
}) {
  try {
    const payment = await readSubscriptionPayment(input.paymentId);
    if (!payment) return;
    const restaurant = firstOrNull(payment.restaurant) ?? { id: payment.restaurant_id };
    const subscription = firstOrNull(payment.subscription) ?? null;
    const targetPlan = firstOrNull(payment.plan) ?? null;
    const rawData = asRecord(payment.raw_data);
    const type = input.status === "confirmed" ? "platform.subscription.confirmed" : "platform.subscription.rejected";

    await publishPlatformEventSafely({
      type,
      eventId: `${type}:${input.paymentId}`,
      restaurantId: payment.restaurant_id,
      source: input.source ?? "devops",
      payment: {
        ...buildPlatformPaymentSnapshot({
          payment,
          restaurant,
          subscription: subscription ?? undefined,
          targetPlan,
          currentPlan: null,
          billingAction: stringField(rawData, "billingAction"),
          effectiveSummary: stringField(rawData, "effectiveSummary"),
          effectiveAt: stringField(rawData, "effectiveAt")
        }),
        resolvedAt: input.status === "confirmed" ? payment.confirmed_at ?? new Date().toISOString() : payment.rejected_at ?? new Date().toISOString(),
        resolvedBy: input.resolvedBy ?? payment.confirmed_by ?? null,
        rejectedReason: input.rejectedReason ?? payment.rejected_reason ?? null
      }
    });
  } catch (error) {
    console.error("[platform-telegram-events] subscription resolved snapshot failed", {
      paymentId: input.paymentId,
      status: input.status,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function notifyPlatformTenantStatusChanged(input: {
  restaurantId: string;
  restaurantName?: string | null;
  restaurantSlug?: string | null;
  previousStatus?: string | null;
  status: "active" | "suspended" | "deleted";
  reason?: string | null;
  actor?: string | null;
  changedAt?: string | null;
  source?: "dashboard" | "devops" | "telegram" | "system";
}) {
  await publishPlatformEventSafely({
    type: "platform.tenant.status_changed",
    eventId: `platform.tenant.status_changed:${input.restaurantId}:${input.status}:${input.changedAt ?? Date.now()}`,
    restaurantId: input.restaurantId,
    source: input.source ?? "devops",
    tenantStatus: {
      restaurantId: input.restaurantId,
      restaurantName: input.restaurantName ?? null,
      restaurantSlug: input.restaurantSlug ?? null,
      previousStatus: input.previousStatus ?? null,
      status: input.status,
      reason: input.reason ?? null,
      actor: input.actor ?? null,
      changedAt: input.changedAt ?? new Date().toISOString()
    }
  });
}

export async function notifyPlatformSubscriptionStatusChanged(input: {
  subscriptionId: string;
  restaurantId: string;
  previousStatus?: string | null;
  status: string;
  reason?: string | null;
  changedAt?: string | null;
  source?: "dashboard" | "devops" | "telegram" | "system";
}) {
  try {
    const subscription = await readSubscription(input.subscriptionId);
    const restaurant = firstOrNull(subscription?.restaurant) ?? null;
    const plan = firstOrNull(subscription?.plan) ?? null;
    const restaurantId = subscription?.restaurant_id ?? input.restaurantId;

    await publishPlatformEventSafely({
      type: "platform.subscription.status_changed",
      eventId: `platform.subscription.status_changed:${input.subscriptionId}:${input.status}:${input.changedAt ?? Date.now()}`,
      restaurantId,
      source: input.source ?? "system",
      subscription: {
        id: input.subscriptionId,
        restaurantId,
        restaurantName: restaurant?.name ?? null,
        restaurantSlug: restaurant?.slug ?? null,
        previousStatus: input.previousStatus ?? null,
        status: input.status,
        planCode: plan?.code ?? null,
        planName: plan?.name ?? null,
        currentPeriodEnd: subscription?.current_period_end ?? null,
        trialEndsAt: subscription?.trial_ends_at ?? null,
        reason: input.reason ?? null,
        changedAt: input.changedAt ?? new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("[platform-telegram-events] subscription status snapshot failed", {
      subscriptionId: input.subscriptionId,
      status: input.status,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function notifyPlatformLogimailApprovalRequested(input: {
  requestId: string;
  requestType: "account" | "domain" | "mailbox";
  requesterUserId?: string | null;
  requesterEmail?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
  workspaceSlug?: string | null;
  targetValue: string;
  purpose?: string | null;
  domain?: string | null;
  mailHostname?: string | null;
  emailAddress?: string | null;
  displayName?: string | null;
  quotaMb?: number | null;
  riskFlags?: string[];
  plannedRecordCount?: number;
  createdAt?: string | null;
  source?: "dashboard" | "system" | "devops";
}) {
  await publishPlatformEventSafely({
    type: "platform.logimail.approval_requested",
    eventId: `platform.logimail.approval_requested:${input.requestType}:${input.requestId}`,
    tenantId: "platform",
    source: input.source ?? "dashboard",
    logimail: {
      requestId: input.requestId,
      requestType: input.requestType,
      requesterUserId: input.requesterUserId ?? null,
      requesterEmail: input.requesterEmail ?? null,
      workspaceId: input.workspaceId ?? null,
      workspaceName: input.workspaceName ?? null,
      workspaceSlug: input.workspaceSlug ?? null,
      targetValue: input.targetValue,
      purpose: input.purpose ?? null,
      domain: input.domain ?? null,
      mailHostname: input.mailHostname ?? null,
      emailAddress: input.emailAddress ?? null,
      displayName: input.displayName ?? null,
      quotaMb: input.quotaMb ?? null,
      riskFlags: input.riskFlags ?? [],
      plannedRecordCount: input.plannedRecordCount ?? 0,
      createdAt: input.createdAt ?? new Date().toISOString()
    }
  });
}

async function publishPlatformEventSafely(event: OperationalEvent) {
  try {
    await publishOperationalEvent(event);
  } catch (error) {
    console.error("[platform-telegram-events] publish failed", {
      eventId: event.eventId,
      type: event.type,
      restaurantId: event.restaurantId ?? null,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

async function readLatestSubscription(restaurantId: string): Promise<SubscriptionLike | null> {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("restaurant_subscriptions")
    .select("id,restaurant_id,status,current_period_start,current_period_end,trial_ends_at,metadata,plan:saas_plans(code,name,monthly_price)")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as SubscriptionLike | null;
}

async function readSubscriptionPayment(paymentId: string): Promise<PaymentLike | null> {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("subscription_payment_logs")
    .select("id,restaurant_id,subscription_id,plan_id,amount,months,transfer_content,raw_data,created_at,confirmed_at,confirmed_by,rejected_at,rejected_reason,restaurant:restaurants(id,name,slug),plan:saas_plans(code,name,monthly_price),subscription:restaurant_subscriptions(id,restaurant_id,status,current_period_start,current_period_end,trial_ends_at,metadata)")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw error;
  return data as PaymentLike | null;
}

async function readSubscription(subscriptionId: string): Promise<(SubscriptionLike & { restaurant?: RestaurantLike | RestaurantLike[] | null }) | null> {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("restaurant_subscriptions")
    .select("id,restaurant_id,status,current_period_start,current_period_end,trial_ends_at,metadata,restaurant:restaurants(id,name,slug),plan:saas_plans(code,name,monthly_price)")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (error) throw error;
  return data as (SubscriptionLike & { restaurant?: RestaurantLike | RestaurantLike[] | null }) | null;
}

function buildPlatformPaymentSnapshot(input: {
  payment: PaymentLike;
  restaurant: RestaurantLike;
  subscription?: SubscriptionLike | null;
  targetPlan?: PlanLike | null;
  currentPlan?: PlanLike | null;
  billingAction?: string | null;
  effectiveSummary?: string | null;
  effectiveAt?: string | null;
}) {
  const rawData = asRecord(input.payment.raw_data);
  const targetPlan = input.targetPlan ?? firstOrNull(input.payment.plan);
  const subscription = input.subscription ?? firstOrNull(input.payment.subscription);
  const restaurant = input.restaurant;

  return {
    id: input.payment.id,
    restaurantId: input.payment.restaurant_id ?? restaurant.id,
    restaurantName: restaurant.name ?? null,
    restaurantSlug: restaurant.slug ?? null,
    subscriptionId: input.payment.subscription_id ?? subscription?.id ?? null,
    planCode: stringField(rawData, "planCode") ?? targetPlan?.code ?? null,
    planName: stringField(rawData, "planName") ?? targetPlan?.name ?? null,
    fromPlanCode: stringField(rawData, "fromPlanCode") ?? input.currentPlan?.code ?? null,
    fromPlanName: stringField(rawData, "fromPlanName") ?? input.currentPlan?.name ?? null,
    amount: Number(input.payment.amount ?? 0),
    months: Math.max(1, Number(input.payment.months ?? 1) || 1),
    transferContent: input.payment.transfer_content ?? null,
    billingAction: input.billingAction ?? stringField(rawData, "billingAction"),
    effectiveSummary: input.effectiveSummary ?? stringField(rawData, "effectiveSummary"),
    effectiveAt: input.effectiveAt ?? stringField(rawData, "effectiveAt"),
    subscriptionStatus: subscription?.status ?? null,
    currentPeriodStart: subscription?.current_period_start ?? null,
    currentPeriodEnd: subscription?.current_period_end ?? null,
    trialEndsAt: subscription?.trial_ends_at ?? null,
    createdAt: input.payment.created_at ?? null
  };
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(record: unknown, key: string) {
  const source = asRecord(record);
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
