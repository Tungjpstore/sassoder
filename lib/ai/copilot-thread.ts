export function buildCopilotThreadId(...parts: Array<string | number | null | undefined>) {
  const normalized = parts
    .map((value) =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)
    )
    .filter(Boolean);

  return normalized.join(":") || "logivn:copilot:default";
}
