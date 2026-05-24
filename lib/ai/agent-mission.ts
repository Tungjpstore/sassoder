import type { AiAgentAction, AiAgentMission, AiAgentMissionStep } from "@/types/ai-agent";

type MissionSurface = AiAgentMission["surface"];

function missionSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function stepStatus(action: AiAgentAction, index: number): AiAgentMissionStep["status"] {
  if (action.safety === "manual_only") return "manual";
  if (action.safety === "confirm") return "needs_confirmation";
  return index === 0 || action.priority === "primary" ? "ready" : "queued";
}

function defaultOperatorNote(surface: MissionSurface) {
  if (surface === "customer") return "LogiBot chỉ gợi ý và mở đúng thao tác; khách vẫn là người xác nhận đơn, thanh toán hoặc đặt bàn.";
  if (surface === "onboarding") return "LogiBot áp dụng bản nháp vào onboarding, dữ liệu thật chỉ được lưu khi người dùng hoàn tất tạo quán.";
  if (surface === "admin") return "LogiBot chỉ điều hướng và tạo checklist nền tảng, không tự kích hoạt tenant hoặc gói dịch vụ.";
  return "LogiBot có thể mở màn và gọi action an toàn; thanh toán, xoá dữ liệu và cấu hình nhạy cảm luôn cần người dùng xác nhận.";
}

function defaultSuccessCriteria(surface: MissionSurface, actions: AiAgentAction[]) {
  const primaryAction = actions.find((action) => action.priority === "primary") ?? actions[0];
  if (surface === "customer") {
    return [
      primaryAction ? `Khách bấm "${primaryAction.label}" hoặc chọn bước thay thế.` : "Khách có bước tiếp theo rõ ràng.",
      "Không có câu trả lời trống hoặc gợi ý ngoài dữ liệu menu/đơn hiện tại."
    ];
  }

  if (surface === "onboarding") {
    return [
      primaryAction ? `Bản nháp "${primaryAction.label}" được áp dụng vào form.` : "Người dùng biết bước onboarding kế tiếp.",
      "Không lưu dữ liệu thật khi chưa hoàn tất setup."
    ];
  }

  return [
    primaryAction ? `Operator xử lý hoặc mở "${primaryAction.label}".` : "Operator có đường đi tiếp theo rõ ràng.",
    "Không lộ raw tool output, không tự xác nhận thanh toán hoặc xoá dữ liệu."
  ];
}

export function buildAgentMission(input: {
  surface: MissionSurface;
  title: string;
  outcome: string;
  route?: string | null;
  actions?: AiAgentAction[];
  urgency?: AiAgentMission["urgency"];
  estimatedMinutes?: number;
  successCriteria?: string[];
  operatorNote?: string;
  fallbackSteps?: Array<{ id: string; label: string; description?: string; status?: AiAgentMissionStep["status"] }>;
}): AiAgentMission {
  const actions = input.actions ?? [];
  const stepsFromActions = actions.slice(0, 4).map(
    (action, index): AiAgentMissionStep => ({
      id: `step-${action.id}`,
      label: action.label,
      description: action.description,
      actionId: action.id,
      status: stepStatus(action, index)
    })
  );
  const fallbackSteps =
    input.fallbackSteps?.slice(0, 4).map((step, index) => ({
      id: step.id,
      label: step.label,
      description: step.description,
      actionId: null,
      status: step.status ?? (index === 0 ? "ready" : "queued")
    })) ?? [];
  const steps = stepsFromActions.length ? stepsFromActions : fallbackSteps.length ? fallbackSteps : [
    {
      id: "step-open-context",
      label: "Mở đúng ngữ cảnh",
      description: "Đi tới vùng thao tác liên quan trước khi xử lý.",
      actionId: null,
      status: "ready" as const
    },
    {
      id: "step-check-data",
      label: "Kiểm dữ liệu thật",
      description: "Đối chiếu trạng thái hiện tại rồi mới xác nhận.",
      actionId: null,
      status: "queued" as const
    }
  ];

  return {
    id: `mission-${input.surface}-${missionSlug(input.title || input.outcome) || "logibot"}`,
    surface: input.surface,
    title: input.title,
    outcome: input.outcome,
    route: input.route ?? null,
    urgency: input.urgency ?? (actions.some((action) => action.priority === "primary") ? "now" : "soon"),
    estimatedMinutes: Math.max(1, Math.min(30, Math.round(input.estimatedMinutes ?? Math.max(2, steps.length * 2)))),
    steps,
    successCriteria: (input.successCriteria?.filter(Boolean).slice(0, 3) ?? defaultSuccessCriteria(input.surface, actions)).slice(0, 3),
    operatorNote: input.operatorNote || defaultOperatorNote(input.surface)
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function sanitizeSurface(value: unknown): MissionSurface | null {
  return value === "dashboard" || value === "customer" || value === "admin" || value === "onboarding" ? value : null;
}

function sanitizeUrgency(value: unknown): AiAgentMission["urgency"] {
  return value === "now" || value === "soon" || value === "watch" ? value : "soon";
}

function sanitizeStepStatus(value: unknown): AiAgentMissionStep["status"] {
  if (value === "ready" || value === "needs_confirmation" || value === "queued" || value === "manual" || value === "done") return value;
  return "queued";
}

export function sanitizeAgentMission(value: unknown): AiAgentMission | null {
  const record = asRecord(value);
  if (!record) return null;
  const surface = sanitizeSurface(record.surface);
  if (!surface || typeof record.title !== "string" || typeof record.outcome !== "string") return null;

  const rawSteps = Array.isArray(record.steps) ? record.steps : [];
  const steps = rawSteps
    .map((step): AiAgentMissionStep | null => {
      const stepRecord = asRecord(step);
      if (!stepRecord || typeof stepRecord.id !== "string" || typeof stepRecord.label !== "string") return null;
      return {
        id: stepRecord.id,
        label: stepRecord.label.slice(0, 120),
        description: typeof stepRecord.description === "string" ? stepRecord.description.slice(0, 220) : undefined,
        actionId: typeof stepRecord.actionId === "string" ? stepRecord.actionId : null,
        status: sanitizeStepStatus(stepRecord.status)
      };
    })
    .filter((step): step is AiAgentMissionStep => Boolean(step))
    .slice(0, 4);

  return {
    id: typeof record.id === "string" ? record.id.slice(0, 120) : `mission-${surface}`,
    surface,
    title: record.title.slice(0, 120),
    outcome: record.outcome.slice(0, 360),
    route: typeof record.route === "string" ? record.route.slice(0, 180) : null,
    urgency: sanitizeUrgency(record.urgency),
    estimatedMinutes: Math.max(1, Math.min(30, Number(record.estimatedMinutes ?? 5))),
    steps,
    successCriteria: Array.isArray(record.successCriteria)
      ? record.successCriteria.filter((item): item is string => typeof item === "string").slice(0, 3)
      : [],
    operatorNote: typeof record.operatorNote === "string" ? record.operatorNote.slice(0, 260) : defaultOperatorNote(surface)
  };
}
