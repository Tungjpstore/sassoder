import {
  compactLogibotAttachments,
  firstReadableAttachmentPayload,
  inferLogibotAttachmentOcrTarget,
  type LogibotAttachmentDraft
} from "@/components/ai/logibot-composer";
import type { AiAgentAction, AiAgentPlan } from "@/types/ai-agent";

export type LogibotOwnerIntent =
  | "setup"
  | "overview"
  | "orders"
  | "kitchen"
  | "menu"
  | "inventory"
  | "tables"
  | "payments"
  | "promotions"
  | "staff"
  | "online"
  | "reservations"
  | "reports"
  | "settings"
  | "security"
  | "growth";

export type LogibotOwnerResult = {
  reply?: string;
  text?: string;
  intent?: LogibotOwnerIntent;
  intentLabel?: string;
  suggestions?: string[];
  actions?: AiAgentAction[];
  agentPlan?: AiAgentPlan;
  data?: unknown;
  commandDeck?: unknown;
  mission?: unknown;
  passport?: unknown;
  provider?: string;
  model?: string;
  config?: unknown;
  readiness?: unknown;
};

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string };

export type LogibotAssistantBody = {
  intent?: string;
  threadId?: string;
  message: string;
  context?: Record<string, unknown>;
};

export type LogibotRequestInput = {
  message: string;
  attachments?: LogibotAttachmentDraft[];
  assistantBody: LogibotAssistantBody;
};

export async function postLogibotJson<T>(url: string, body: unknown, timeoutMs = 24_000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
    if (!payload || !payload.ok) throw new Error(payload?.error || "LogiBot chưa xử lý được yêu cầu.");
    return payload.data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("LogiBot mất quá lâu để phản hồi. Hãy thử lại bằng một câu ngắn hơn.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isJsonLikeText(value?: string) {
  const trimmed = value?.trim();
  return Boolean(trimmed && (trimmed.startsWith("{") || trimmed.startsWith("[") || /^"[\w-]+"\s*:/.test(trimmed)));
}

function firstSafeText(...values: Array<string | undefined>) {
  return values.map((value) => value?.trim()).find((value): value is string => Boolean(value && !isJsonLikeText(value)));
}

function dataText(data: unknown) {
  const record = asRecord(data);
  if (!record) return "";

  return firstSafeText(
    typeof record.ownerMessage === "string" ? record.ownerMessage : undefined,
    typeof record.summary === "string" ? record.summary : undefined,
    typeof record.title === "string" ? record.title : undefined,
    typeof record.description === "string" ? record.description : undefined
  );
}

export function logibotResultText(result: Pick<LogibotOwnerResult, "data" | "reply" | "text">) {
  return (
    firstSafeText(result.reply, result.text, dataText(result.data)) ||
    "LogiBot đã xử lý yêu cầu, nhưng phản hồi chưa có nội dung đủ rõ để hiển thị an toàn."
  );
}

export async function requestLogibot(input: LogibotRequestInput) {
  const attachments = input.attachments ?? [];
  const target = inferLogibotAttachmentOcrTarget(input.message, attachments);
  const payload = target ? firstReadableAttachmentPayload(attachments) : null;

  if (target && payload) {
    const endpoint = target === "menu" ? "/api/admin/ai/menu-ocr" : "/api/admin/ai/inventory-ocr";
    return await postLogibotJson<LogibotOwnerResult>(endpoint, payload, 45_000);
  }

  return await postLogibotJson<LogibotOwnerResult>(
    "/api/admin/ai/assistant",
    {
      ...input.assistantBody,
      context: {
        ...(input.assistantBody.context ?? {}),
        attachments: attachments.length ? compactLogibotAttachments(attachments) : undefined
      }
    },
    30_000
  );
}
