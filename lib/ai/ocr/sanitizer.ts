const unsafeOcrPatterns = [
  /\bignore\s+(all\s+)?(previous|above)\s+instructions?\b/i,
  /\b(system|developer|assistant)\s+(prompt|message|instruction)s?\b/i,
  /\bprompt\s+injection\b/i,
  /\b(api[_\s-]?key|secret|password|bearer\s+token|service[_\s-]?role)\b/i,
  /\b(tool_calls?|function_call|execute\s+tool|run\s+tool)\b/i,
  /\b(curl\s+|fetch\s*\(|https?:\/\/)/i,
  /\b(drop\s+table|select\s+\*\s+from|insert\s+into|delete\s+from)\b/i
];

function compactOcrText(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isUnsafeOcrText(value: unknown) {
  if (typeof value !== "string") return false;
  const compact = compactOcrText(value);
  return unsafeOcrPatterns.some((pattern) => pattern.test(compact));
}

export function sanitizeOcrText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  const compact = compactOcrText(value);
  if (!compact || isUnsafeOcrText(compact)) return "";
  return compact.slice(0, maxLength);
}

export function sanitizeOcrTextList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeOcrText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}
