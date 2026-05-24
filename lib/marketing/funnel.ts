import { z } from "zod";

export const marketingBusinessTypeLabels = {
  cafe: "Cafe độc lập",
  "milk-tea": "Trà sữa",
  restaurant: "Nhà hàng phục vụ tại bàn",
  "small-eatery": "Quán ăn nhỏ",
  chain: "Chuỗi F&B nhỏ"
} as const;

export const marketingPilotGoalLabels = {
  "qr-ordering": "QR ordering và order tại bàn",
  "ai-operations": "AI, báo cáo và vận hành sâu hơn",
  "staff-inventory": "Nhân viên, bàn và tồn kho"
} as const;

const textInput = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const waitlistLeadSchema = z.object({
  restaurantName: textInput(140),
  contact: z.string().trim().min(3).max(180),
  businessType: z.enum(["cafe", "milk-tea", "restaurant", "small-eatery", "chain"]).default("cafe"),
  pilotGoal: z.enum(["qr-ordering", "ai-operations", "staff-inventory"]).default("qr-ordering"),
  selectedPlan: z.enum(["pro", "premium"]).optional(),
  source: textInput(80),
  variant: textInput(40),
  pagePath: textInput(180),
  utmSource: textInput(120),
  utmMedium: textInput(120),
  utmCampaign: textInput(160),
  utmContent: textInput(160),
  sessionId: textInput(120),
  metadata: z.record(z.unknown()).optional()
});

export const funnelEventSchema = z.object({
  sessionId: z.string().trim().min(8).max(120),
  eventName: z.string().trim().regex(/^[a-z0-9_.:-]{2,80}$/),
  pagePath: textInput(180),
  source: textInput(80),
  variant: textInput(40),
  targetHref: textInput(500),
  targetText: textInput(180),
  planCode: z.enum(["pro", "premium"]).optional().or(z.literal("")),
  leadId: z.string().uuid().optional().or(z.literal("")),
  metadata: z.record(z.unknown()).optional()
});

export type WaitlistLeadInput = z.input<typeof waitlistLeadSchema>;
export type WaitlistLead = z.output<typeof waitlistLeadSchema>;
export type FunnelEventInput = z.input<typeof funnelEventSchema>;
export type FunnelEvent = z.output<typeof funnelEventSchema>;

export function normalizeMarketingText(value: string | undefined, fallback = "") {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

export function inferPlanFromPilotGoal(goal: WaitlistLead["pilotGoal"]) {
  return goal === "qr-ordering" ? "pro" : "premium";
}

export function splitContact(contact: string) {
  const normalized = contact.trim().toLowerCase();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
  const phone = email ? null : contact.replace(/[^\d+]/g, "").slice(0, 24) || null;

  return {
    normalized,
    email,
    phone
  };
}

export function leadRedirectPath(input: { selectedPlan?: "pro" | "premium"; pilotGoal: WaitlistLead["pilotGoal"]; source?: string; variant?: string }) {
  const plan = input.selectedPlan || inferPlanFromPilotGoal(input.pilotGoal);
  const params = new URLSearchParams({
    plan,
    source: input.source || "waitlist",
    pilotGoal: input.pilotGoal
  });

  if (input.variant) params.set("variant", input.variant);

  return `/dashboard/register?${params.toString()}`;
}
