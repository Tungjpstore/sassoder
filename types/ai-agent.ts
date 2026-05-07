export type AiAgentActionType = "link" | "prompt" | "api" | "ui";

export type AiAgentAction = {
  id: string;
  type: AiAgentActionType;
  label: string;
  description?: string;
  href?: string;
  prompt?: string;
  endpoint?: string;
  body?: Record<string, unknown>;
  intent?: string;
  uiTarget?:
    | "menu"
    | "menu_category"
    | "add_item"
    | "cart"
    | "orders"
    | "payment"
    | "staff_call"
    | "reservation"
    | "delivery";
  priority?: "primary" | "secondary" | "danger";
  safety?: "safe" | "confirm" | "manual_only";
};

export type AiAgentPlan = {
  title: string;
  summary: string;
  focusArea: string;
  nextBestActionId: string | null;
  safetyNote: string;
  confidence: "high" | "medium" | "low";
};
