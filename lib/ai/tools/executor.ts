import "server-only";

import { analyticsTools, generate_campaign } from "./analytics.tool";
import { recordAiSecurityEvent } from "@/lib/ai/security-audit";
import { customerTools, create_combo } from "./customer.tool";
import { menuTools, find_best_seller, search_menu } from "./menu.tool";
import { orderTools, analyze_peak_hour, summarize_sales } from "./orders.tool";
import { paymentTools, detect_payment_issue } from "./payment.tool";
import { isAiToolNameAllowedForSurface, type AiToolSurface as AiToolSurfaceValue } from "./surface-policy";

export type AiToolSurface = AiToolSurfaceValue;

export type AiToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AiToolCall = {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
};

export type AiToolResult = {
  status: "success" | "failed" | "error";
  message: string;
  [key: string]: unknown;
};

export type AiToolContext = {
  restaurantId: string;
  branchId?: string | null;
  userId?: string | null;
  customerSessionId?: string | null;
  surface: AiToolSurfaceValue;
};

export const allAiTools = [
  ...orderTools,
  ...menuTools,
  ...paymentTools,
  ...analyticsTools,
  ...customerTools
] satisfies AiToolDefinition[];

export const ownerAiTools = allAiTools;

const allAiToolNames = new Set(allAiTools.map((tool) => tool.function.name));

export const customerAiTools = allAiTools.filter((tool) => isAiToolNameAllowedForSurface("customer", tool.function.name, allAiToolNames));

type AiToolHandler = (args: Record<string, unknown>, context: AiToolContext) => Promise<AiToolResult>;

const toolHandlers: Record<string, AiToolHandler> = {
  summarize_sales,
  analyze_peak_hour,
  search_menu,
  find_best_seller,
  detect_payment_issue,
  generate_campaign,
  create_combo
};

export function getAiToolsForSurface(surface: AiToolSurfaceValue) {
  return surface === "customer" ? customerAiTools : ownerAiTools;
}

export function isAiToolAllowedForSurface(surface: AiToolSurfaceValue, toolName: string) {
  return isAiToolNameAllowedForSurface(surface, toolName, allAiToolNames);
}

function parseToolArgs(argsString: string): Record<string, unknown> {
  if (!argsString?.trim()) return {};
  const parsed = JSON.parse(argsString);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

export async function executeAiToolCall(toolCall: AiToolCall, context: AiToolContext): Promise<AiToolResult | null> {
  if (toolCall.type !== "function") return null;

  const { name, arguments: argsString } = toolCall.function;
  const handler = toolHandlers[name];

  if (!isAiToolAllowedForSurface(context.surface, name)) {
    console.warn(`[AI Tools] Blocked ${context.surface} tool call: ${name}`);
    await recordAiSecurityEvent({
      restaurantId: context.restaurantId,
      userId: context.userId,
      customerSessionId: context.customerSessionId,
      surface: context.surface,
      eventType: "ai_tool_call_blocked",
      severity: context.surface === "customer" ? "critical" : "high",
      metadata: { toolName: name, reason: "surface_allowlist" }
    });
    return { status: "error", message: "Công cụ này không khả dụng trong phạm vi hiện tại." };
  }

  if (!handler) {
    console.warn(`[AI Tools] No handler found for tool: ${name}`);
    return { status: "error", message: `Công cụ ${name} chưa được hỗ trợ.` };
  }

  try {
    return handler(parseToolArgs(argsString), context);
  } catch (error) {
    console.error(`[AI Tools] Error executing tool ${name}:`, error);
    return { status: "error", message: `Không thể chạy công cụ ${name}.` };
  }
}
