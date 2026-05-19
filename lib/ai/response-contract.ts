export type AiReplySource = "model" | "structured" | "fallback";

export type AiReplyQuality = {
  source: AiReplySource;
  wasBlank: boolean;
  wasRawPayload: boolean;
  fallbackUsed: boolean;
};

export type AiReplyContract = {
  reply: string;
  quality: AiReplyQuality;
};

export function sanitizeAiDisplayText(value: string, maxLength = 900) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

export function looksLikeRawAiPayload(value: string) {
  const text = sanitizeAiDisplayText(value, 1800);
  if (!text) return true;
  if (/^[{[]/.test(text)) return true;
  if (/^"(summary|reply|actions|agentPlan|readinessScore|launchBlockers)"\s*:/.test(text)) return true;
  if (/"(summary|reply|actions|agentPlan|launchBlockers|expressSetup)"\s*:/.test(text) && /[{}[\]]/.test(text)) return true;
  if (/\b(tool_call|tool_calls|function_call|raw|arguments)\b/i.test(text) && /[{}[\]]/.test(text)) return true;
  return false;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readText(value: unknown, maxLength = 220) {
  return typeof value === "string" ? sanitizeAiDisplayText(value, maxLength) : "";
}

function readTextList(value: unknown, maxItems = 3) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => readText(item, 120)).filter(Boolean).slice(0, maxItems);
}

function parseJsonCandidate(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced || trimmed;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? source.slice(start, end + 1) : source;

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function actionTitle(value: unknown) {
  const record = asRecord(value);
  return readText(record?.title, 120) || readText(record?.label, 120) || readText(record?.action, 120) || readText(record?.name, 120);
}

function structuredTextFromValue(value: unknown) {
  const record = asRecord(value);
  if (!record) {
    if (Array.isArray(value)) return value.map((item) => readText(item, 120) || actionTitle(item)).filter(Boolean).slice(0, 3).join(" · ");
    return "";
  }

  const direct = [
    readText(record.reply, 260),
    readText(record.ownerMessage, 260),
    readText(record.customerMessage, 260),
    readText(record.summary, 260),
    readText(record.message, 260),
    readText(record.description, 260)
  ].filter(Boolean);
  const blockers = readTextList(record.launchBlockers ?? record.criticalMissing ?? record.blockers, 2);
  const setup = Array.isArray(record.expressSetup) ? record.expressSetup.map(actionTitle).filter(Boolean).slice(0, 2) : [];
  const quickWins = readTextList(record.quickWins, 2);
  const slogans = readTextList(record.slogans, 2);
  const checklist = readTextList(asRecord(record.draft)?.checklist ?? record.checklist, 2);
  const parts = [
    ...direct,
    blockers.length ? `Cần xử lý: ${blockers.join(" · ")}` : "",
    setup.length ? `Bước nên làm: ${setup.join(" · ")}` : "",
    quickWins.length ? `Thắng nhanh: ${quickWins.join(" · ")}` : "",
    slogans.length ? `Slogan: ${slogans.join(" · ")}` : "",
    checklist.length ? `Checklist: ${checklist.join(" · ")}` : ""
  ];

  return Array.from(new Set(parts.filter(Boolean))).slice(0, 4).join(" ");
}

export function extractReadableTextFromAiPayload(value: string) {
  const parsed = parseJsonCandidate(value);
  return sanitizeAiDisplayText(structuredTextFromValue(parsed), 900);
}

export function normalizeAiReply(input: {
  rawText?: string | null;
  fallbackText?: string | null;
  emptyText: string;
  maxLength?: number;
}): AiReplyContract {
  const maxLength = input.maxLength ?? 900;
  const rawText = String(input.rawText || "");
  const sanitized = sanitizeAiDisplayText(rawText, Math.max(maxLength * 2, 900));
  const wasBlank = sanitized.length === 0;
  const wasRawPayload = looksLikeRawAiPayload(sanitized);
  const structured = wasRawPayload ? extractReadableTextFromAiPayload(rawText) : "";
  const modelText = !wasRawPayload ? sanitized : "";
  const fallback = sanitizeAiDisplayText(input.fallbackText || input.emptyText, maxLength);
  const reply = sanitizeAiDisplayText(structured || modelText || fallback || input.emptyText, maxLength);
  const source: AiReplySource = structured ? "structured" : modelText ? "model" : "fallback";

  return {
    reply,
    quality: {
      source,
      wasBlank,
      wasRawPayload,
      fallbackUsed: source === "fallback"
    }
  };
}
