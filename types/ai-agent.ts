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
    | "delivery"
    | "add_item_to_cart"
    | "remove_item_from_cart"
    | "clear_cart";
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

export type AiAgentMissionStepStatus = "ready" | "needs_confirmation" | "queued" | "manual" | "done";

export type AiAgentMissionStep = {
  id: string;
  label: string;
  description?: string;
  actionId?: string | null;
  status: AiAgentMissionStepStatus;
};

export type AiAgentMission = {
  id: string;
  surface: "dashboard" | "customer" | "admin" | "onboarding";
  title: string;
  outcome: string;
  route?: string | null;
  urgency: "now" | "soon" | "watch";
  estimatedMinutes: number;
  steps: AiAgentMissionStep[];
  successCriteria: string[];
  operatorNote: string;
};

export type AiCommandDeckIntensity = "critical" | "accelerate" | "steady";

export type AiCommandDeckAutomationLevel = "autopilot" | "copilot" | "manual";

export type AiCommandDeckSignalTone = "success" | "warning" | "danger" | "info";

export type AiCommandDeckSignal = {
  label: string;
  value: string;
  tone: AiCommandDeckSignalTone;
};

export type AiCommandDeck = {
  id: string;
  surface: AiAgentMission["surface"];
  title: string;
  headline: string;
  intensity: AiCommandDeckIntensity;
  impactScore: number;
  automationLevel: AiCommandDeckAutomationLevel;
  primaryMetric: string;
  secondaryMetric: string;
  signals: AiCommandDeckSignal[];
  nextMove: string;
  premiumReason: string;
};
