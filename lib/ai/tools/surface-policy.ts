export type AiToolSurface = "owner" | "customer";

export const customerAiToolNames = ["search_menu", "create_combo"] as const;

const customerAiToolNameSet = new Set<string>(customerAiToolNames);

export function isAiToolNameAllowedForSurface(surface: AiToolSurface, toolName: string, ownerToolNames: ReadonlySet<string>) {
  return surface === "customer" ? customerAiToolNameSet.has(toolName) : ownerToolNames.has(toolName);
}
