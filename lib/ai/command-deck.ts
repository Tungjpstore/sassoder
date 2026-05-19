import type {
  AiAgentAction,
  AiAgentMission,
  AiCommandDeck,
  AiCommandDeckAutomationLevel,
  AiCommandDeckIntensity,
  AiCommandDeckSignal,
  AiCommandDeckSignalTone
} from "@/types/ai-agent";
import type { AiOperationalPassport } from "@/lib/ai/operational-passport";

type CommandDeckInput = {
  surface: AiAgentMission["surface"];
  title: string;
  headline: string;
  actions?: AiAgentAction[];
  mission?: AiAgentMission | null;
  passport?: AiOperationalPassport | null;
  confidence?: "high" | "medium" | "low" | null;
  premiumReason?: string;
};

const AUTOMATION_LABEL: Record<AiCommandDeckAutomationLevel, string> = {
  autopilot: "Tự chạy an toàn",
  copilot: "Chờ xác nhận",
  manual: "Cần thao tác tay"
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: unknown, fallback: string, maxLength = 140) {
  if (typeof value !== "string") return fallback;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return fallback;
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1).trim()}…` : compact;
}

function normalizeScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? clamp(Math.round(value), 1, 99) : 58;
}

function toneFromIntensity(intensity: AiCommandDeckIntensity): AiCommandDeckSignalTone {
  if (intensity === "critical") return "danger";
  if (intensity === "accelerate") return "warning";
  return "success";
}

function deriveAutomationLevel(actions: AiAgentAction[], mission?: AiAgentMission | null): AiCommandDeckAutomationLevel {
  const missionSteps = mission?.steps ?? [];
  if (actions.some((action) => action.safety === "manual_only") || missionSteps.some((step) => step.status === "manual")) {
    return "manual";
  }
  if (actions.some((action) => action.safety === "confirm") || missionSteps.some((step) => step.status === "needs_confirmation")) {
    return "copilot";
  }
  return "autopilot";
}

function deriveNextMove(actions: AiAgentAction[], mission?: AiAgentMission | null, passport?: AiOperationalPassport | null) {
  const readyStep = mission?.steps.find((step) => step.status === "ready" || step.status === "needs_confirmation");
  const matchedAction = readyStep?.actionId ? actions.find((action) => action.id === readyStep.actionId) : null;
  return normalizeText(matchedAction?.label ?? readyStep?.label ?? passport?.nextActionLabel ?? actions[0]?.label, "Mở bước hành động phù hợp", 92);
}

function buildSignals(input: {
  impactScore: number;
  intensity: AiCommandDeckIntensity;
  automationLevel: AiCommandDeckAutomationLevel;
  actions: AiAgentAction[];
  mission?: AiAgentMission | null;
  confidence?: "high" | "medium" | "low" | null;
}): AiCommandDeckSignal[] {
  const actionCount = input.actions.length || input.mission?.steps.length || 0;
  const confirmationCount =
    input.actions.filter((action) => action.safety === "confirm" || action.safety === "manual_only").length ||
    input.mission?.steps.filter((step) => step.status === "needs_confirmation" || step.status === "manual").length ||
    0;
  const confidenceLabel = input.confidence === "high" ? "Cao" : input.confidence === "low" ? "Cần kiểm" : "Ổn định";

  return [
    {
      label: "Impact",
      value: `${input.impactScore}/100`,
      tone: toneFromIntensity(input.intensity)
    },
    {
      label: "Mode",
      value: AUTOMATION_LABEL[input.automationLevel],
      tone: input.automationLevel === "autopilot" ? "success" : input.automationLevel === "copilot" ? "warning" : "danger"
    },
    {
      label: "Action",
      value: `${actionCount} bước`,
      tone: actionCount > 0 ? "success" : "info"
    },
    {
      label: "Trust",
      value: confirmationCount > 0 ? `${confirmationCount} cần duyệt` : confidenceLabel,
      tone: confirmationCount > 0 ? "warning" : input.confidence === "low" ? "warning" : "success"
    }
  ];
}

export function buildCommandDeck(input: CommandDeckInput): AiCommandDeck {
  const actions = input.actions ?? [];
  const automationLevel = deriveAutomationLevel(actions, input.mission);
  const confirmationCount =
    actions.filter((action) => action.safety === "confirm" || action.safety === "manual_only").length +
    (input.mission?.steps.filter((step) => step.status === "needs_confirmation" || step.status === "manual").length ?? 0);
  const urgencyScore = input.mission?.urgency === "now" ? 21 : input.mission?.urgency === "soon" ? 13 : 7;
  const actionScore = clamp((actions.length || input.mission?.steps.length || 1) * 7, 7, 30);
  const confirmationScore = clamp(confirmationCount * 6, 0, 18);
  const confidenceScore = input.confidence === "high" || input.passport?.confidence === "high" ? 18 : input.confidence === "low" || input.passport?.confidence === "low" ? 8 : 13;
  const impactScore = normalizeScore(34 + urgencyScore + actionScore + confirmationScore + confidenceScore);
  const intensity: AiCommandDeckIntensity = impactScore >= 82 || input.mission?.urgency === "now" ? "critical" : impactScore >= 66 ? "accelerate" : "steady";
  const nextMove = deriveNextMove(actions, input.mission, input.passport);
  const estimatedMinutes = input.mission?.estimatedMinutes ? `${input.mission.estimatedMinutes} phút` : "2-5 phút";

  return {
    id: `command-${input.surface}-${input.mission?.id ?? (input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deck")}`,
    surface: input.surface,
    title: normalizeText(input.title, "AI Command Deck", 80),
    headline: normalizeText(input.headline, input.mission?.outcome ?? "AI đã chuẩn bị luồng hành động tiếp theo.", 170),
    intensity,
    impactScore,
    automationLevel,
    primaryMetric: estimatedMinutes,
    secondaryMetric: `${actions.length || input.mission?.steps.length || 0} thao tác`,
    signals: buildSignals({ impactScore, intensity, automationLevel, actions, mission: input.mission, confidence: input.confidence ?? input.passport?.confidence ?? "medium" }),
    nextMove,
    premiumReason:
      input.premiumReason ??
      "Command Deck biến câu trả lời AI thành lệnh vận hành có ưu tiên, trạng thái an toàn và bước áp dụng ngay."
  };
}

export function sanitizeCommandDeck(value: unknown): AiCommandDeck | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<AiCommandDeck>;
  const surface = record.surface === "dashboard" || record.surface === "customer" || record.surface === "admin" || record.surface === "onboarding" ? record.surface : null;
  if (!surface) return null;
  const impactScore = normalizeScore(record.impactScore);
  const intensity: AiCommandDeckIntensity = record.intensity === "critical" || record.intensity === "accelerate" || record.intensity === "steady" ? record.intensity : impactScore >= 82 ? "critical" : impactScore >= 66 ? "accelerate" : "steady";
  const automationLevel: AiCommandDeckAutomationLevel = record.automationLevel === "autopilot" || record.automationLevel === "copilot" || record.automationLevel === "manual" ? record.automationLevel : "copilot";
  const signals = Array.isArray(record.signals)
    ? record.signals
        .map((signal) => {
          if (!signal || typeof signal !== "object" || Array.isArray(signal)) return null;
          const item = signal as Partial<AiCommandDeckSignal>;
          const tone: AiCommandDeckSignalTone = item.tone === "success" || item.tone === "warning" || item.tone === "danger" || item.tone === "info" ? item.tone : "info";
          return {
            label: normalizeText(item.label, "Signal", 28),
            value: normalizeText(item.value, "Sẵn sàng", 38),
            tone
          };
        })
        .filter(Boolean)
        .slice(0, 4) as AiCommandDeckSignal[]
    : [];

  return {
    id: normalizeText(record.id, `command-${surface}`, 90),
    surface,
    title: normalizeText(record.title, "AI Command Deck", 80),
    headline: normalizeText(record.headline, "AI đã chuẩn bị luồng hành động tiếp theo.", 170),
    intensity,
    impactScore,
    automationLevel,
    primaryMetric: normalizeText(record.primaryMetric, "2-5 phút", 32),
    secondaryMetric: normalizeText(record.secondaryMetric, "0 thao tác", 32),
    signals,
    nextMove: normalizeText(record.nextMove, "Mở bước hành động phù hợp", 92),
    premiumReason: normalizeText(record.premiumReason, "Command Deck biến câu trả lời AI thành lệnh vận hành áp dụng được ngay.", 180)
  };
}
