import type { BillingPlanCode } from "@/lib/billing/types";

export type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthly_price: number;
  trial_days: number;
  features: unknown;
  is_active: boolean;
  sort_order: number;
};

export type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  contact_email?: string | null;
  platform_status?: "active" | "suspended" | "deleted";
  suspended_at?: string | null;
  deleted_at?: string | null;
};

export type SubscriptionRow = {
  id: string;
  restaurant_id: string;
  plan_id: string;
  status: "trialing" | "pending_payment" | "active" | "past_due" | "suspended" | "cancelled" | "expired";
  trial_started_at: string;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  suspended_at: string | null;
  cancelled_at: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type PaymentRow = {
  id: string;
  restaurant_id: string;
  subscription_id: string | null;
  plan_id: string | null;
  amount: number;
  months: number;
  method: string;
  status: "waiting_confirm" | "confirmed" | "rejected" | "expired";
  transfer_content: string;
  raw_data: unknown;
  created_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
};

export type BillingV2PlanRow = {
  id: string;
  code: BillingPlanCode;
  name: string;
  description: string | null;
  monthly_price: number;
  metadata?: Record<string, unknown> | null;
};

export type BillingV2SubscriptionRow = {
  id: string;
  restaurant_id: string;
  plan_id: string;
  status: "trialing" | "active" | "grace" | "pending_payment" | "cancelled" | "expired" | "suspended";
  current_period_start: string | null;
  current_period_end: string | null;
  grace_ends_at?: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  plan?: BillingV2PlanRow | BillingV2PlanRow[] | null;
};

export type BillingV2PaymentRow = {
  id: string;
  restaurant_id: string;
  subscription_id: string | null;
  invoice_id: string | null;
  amount: number;
  currency: string;
  status: "pending" | "detected" | "waiting_confirmation" | "confirmed" | "failed" | "expired" | "cancelled" | "refunded";
  transfer_code: string;
  created_at: string;
  confirmed_at: string | null;
  deleted_at?: string | null;
};

export type SubscriptionReminderCandidateRow = {
  id: string;
  restaurant_id: string;
  status: SubscriptionRow["status"];
  trial_ends_at: string | null;
  current_period_end: string | null;
  restaurant?: { name: string; slug: string; contact_email: string | null } | { name: string; slug: string; contact_email: string | null }[] | null;
  plan?: Pick<PlanRow, "name" | "code" | "monthly_price"> | Pick<PlanRow, "name" | "code" | "monthly_price">[] | null;
};
