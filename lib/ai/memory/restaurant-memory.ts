import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sanitizeAgentMission } from "@/lib/ai/agent-mission";
import { sanitizeCommandDeck } from "@/lib/ai/command-deck";
import { sanitizeOperationalPassport } from "@/lib/ai/operational-passport";
import type { AiConversationReplayPayload, AiConversationWorkflowSnapshot, AiWorkflowCheckpoint, AiWorkflowCheckpointStatus } from "@/types/ai-history";
import type { AiAgentAction, AiAgentPlan } from "@/types/ai-agent";

function isMissingAiSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.message?.includes("Could not find") ||
    error.message?.includes("does not exist")
  );
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function sanitizeStringArray(value: unknown, limit = 40) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, limit) : [];
}

function mergeConversationMetadata(
  current: Record<string, unknown> | null,
  next: Record<string, unknown> | undefined,
  threadId?: string | null
) {
  return {
    ...(current ?? {}),
    ...(next ?? {}),
    ...(threadId ? { threadId } : {})
  };
}

function sanitizeAction(value: unknown): AiAgentAction | null {
  const record = asRecord(value);
  if (!record) return null;

  const type = record.type;
  const id = record.id;
  const label = record.label;

  if (
    typeof id !== "string" ||
    typeof label !== "string" ||
    (type !== "link" && type !== "prompt" && type !== "api" && type !== "ui")
  ) {
    return null;
  }

  const body = asRecord(record.body);
  const priority = record.priority;
  const safety = record.safety;
  const uiTarget = record.uiTarget;

  return {
    id,
    type,
    label,
    ...(typeof record.description === "string" ? { description: record.description } : {}),
    ...(typeof record.href === "string" ? { href: record.href } : {}),
    ...(typeof record.prompt === "string" ? { prompt: record.prompt } : {}),
    ...(typeof record.endpoint === "string" ? { endpoint: record.endpoint } : {}),
    ...(typeof record.intent === "string" ? { intent: record.intent } : {}),
    ...(uiTarget === "menu" ||
    uiTarget === "menu_category" ||
    uiTarget === "add_item" ||
    uiTarget === "cart" ||
    uiTarget === "orders" ||
    uiTarget === "payment" ||
    uiTarget === "staff_call" ||
    uiTarget === "reservation" ||
    uiTarget === "delivery"
      ? { uiTarget }
      : {}),
    ...(priority === "primary" || priority === "secondary" || priority === "danger" ? { priority } : {}),
    ...(safety === "safe" || safety === "confirm" || safety === "manual_only" ? { safety } : {}),
    ...(body ? { body } : {})
  };
}

function sanitizePlan(value: unknown): AiAgentPlan | null {
  const record = asRecord(value);
  if (!record) return null;

  const confidence = record.confidence;

  if (
    typeof record.title !== "string" ||
    typeof record.summary !== "string" ||
    typeof record.focusArea !== "string" ||
    typeof record.safetyNote !== "string" ||
    (confidence !== "high" && confidence !== "medium" && confidence !== "low")
  ) {
    return null;
  }

  return {
    title: record.title,
    summary: record.summary,
    focusArea: record.focusArea,
    nextBestActionId: typeof record.nextBestActionId === "string" ? record.nextBestActionId : null,
    safetyNote: record.safetyNote,
    confidence
  };
}

function sanitizeWorkflowCheckpoint(value: unknown): AiWorkflowCheckpoint | null {
  const record = asRecord(value);
  if (!record) return null;

  const status = record.status;
  const source = record.source;

  if (
    typeof record.id !== "string" ||
    (status !== "approval_requested" && status !== "approved" && status !== "declined" && status !== "executed" && status !== "failed" && status !== "handoff") ||
    (source !== "owner" && source !== "assistant" && source !== "system") ||
    typeof record.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    actionId: typeof record.actionId === "string" ? record.actionId : null,
    actionLabel: typeof record.actionLabel === "string" ? record.actionLabel : null,
    status,
    summary: typeof record.summary === "string" ? record.summary.slice(0, 280) : null,
    source,
    createdAt: record.createdAt
  };
}

function extractWorkflowSnapshot(metadata: unknown, updatedAt?: string | null): AiConversationWorkflowSnapshot | null {
  const record = asRecord(metadata);
  if (!record) return null;

  const completedActionIds = sanitizeStringArray(record.completedActionIds);
  const declinedActionIds = sanitizeStringArray(record.declinedActionIds);
  const blockedActionIds = new Set([...completedActionIds, ...declinedActionIds]);
  const actions = Array.isArray(record.actions)
    ? (record.actions.map(sanitizeAction).filter(Boolean) as AiAgentAction[]).filter((action) => !blockedActionIds.has(action.id))
    : [];
  const agentPlan = sanitizePlan(record.agentPlan);
  const suggestions = sanitizeStringArray(record.suggestions, 6);
  const checkpoints = sanitizeStringArray(record.workflowCheckpointIds, 20);
  const latestCheckpoint = sanitizeWorkflowCheckpoint(record.latestCheckpoint);
  const passport = sanitizeOperationalPassport(record.passport);
  const mission = sanitizeAgentMission(record.mission);
  const commandDeck = sanitizeCommandDeck(record.commandDeck);
  const pendingApprovalActionId =
    typeof record.pendingApprovalActionId === "string" && !blockedActionIds.has(record.pendingApprovalActionId)
      ? record.pendingApprovalActionId
      : null;

  if (
    !actions.length &&
    !agentPlan &&
    !suggestions.length &&
    !completedActionIds.length &&
    !declinedActionIds.length &&
    !checkpoints.length &&
    !passport &&
    !mission &&
    !commandDeck &&
    typeof record.intent !== "string" &&
    typeof record.intentLabel !== "string"
  ) {
    return null;
  }

  return {
    intent: typeof record.intent === "string" ? record.intent : null,
    intentLabel: typeof record.intentLabel === "string" ? record.intentLabel : null,
    suggestions,
    actions,
    agentPlan,
    completedActionIds,
    declinedActionIds,
    pendingApprovalActionId,
    latestCheckpoint,
    mission,
    commandDeck,
    passport,
    updatedAt: updatedAt ?? null
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function removeString(values: string[], value: string | null | undefined) {
  if (!value) return values;
  return values.filter((item) => item !== value);
}

function buildWorkflowCheckpoint(input: {
  actionId?: string | null;
  actionLabel?: string | null;
  status: AiWorkflowCheckpointStatus;
  summary?: string | null;
  source?: "owner" | "assistant" | "system";
}): AiWorkflowCheckpoint {
  const createdAt = new Date().toISOString();
  return {
    id: `${createdAt}:${input.status}:${input.actionId ?? "workflow"}`,
    actionId: input.actionId ?? null,
    actionLabel: input.actionLabel ?? null,
    status: input.status,
    summary: input.summary ? input.summary.slice(0, 280) : null,
    source: input.source ?? "owner",
    createdAt
  };
}

function mergeWorkflowCheckpointMetadata(
  current: Record<string, unknown>,
  checkpoint: AiWorkflowCheckpoint,
  action: AiAgentAction | null,
  threadId?: string | null
) {
  const completedActionIds = sanitizeStringArray(current.completedActionIds);
  const declinedActionIds = sanitizeStringArray(current.declinedActionIds);
  const workflowCheckpointIds = sanitizeStringArray(current.workflowCheckpointIds, 20);
  const actionId = action?.id ?? checkpoint.actionId;
  let nextCompletedActionIds = completedActionIds;
  let nextDeclinedActionIds = declinedActionIds;
  let pendingApprovalActionId =
    typeof current.pendingApprovalActionId === "string" ? current.pendingApprovalActionId : null;

  if (actionId) {
    if (checkpoint.status === "executed" || checkpoint.status === "handoff") {
      nextCompletedActionIds = uniqueStrings([...completedActionIds, actionId]);
      nextDeclinedActionIds = removeString(declinedActionIds, actionId);
      pendingApprovalActionId = pendingApprovalActionId === actionId ? null : pendingApprovalActionId;
    }

    if (checkpoint.status === "declined") {
      nextDeclinedActionIds = uniqueStrings([...declinedActionIds, actionId]);
      nextCompletedActionIds = removeString(completedActionIds, actionId);
      pendingApprovalActionId = pendingApprovalActionId === actionId ? null : pendingApprovalActionId;
    }

    if (checkpoint.status === "approval_requested") {
      pendingApprovalActionId = actionId;
    }

    if (checkpoint.status === "approved") {
      pendingApprovalActionId = pendingApprovalActionId === actionId ? null : pendingApprovalActionId;
    }
  }

  return {
    ...current,
    ...(threadId ? { threadId } : {}),
    completedActionIds: nextCompletedActionIds.slice(-40),
    declinedActionIds: nextDeclinedActionIds.slice(-40),
    pendingApprovalActionId,
    latestCheckpoint: checkpoint,
    workflowCheckpointIds: uniqueStrings([...workflowCheckpointIds, checkpoint.id]).slice(-20)
  };
}

async function findReusableConversation(input: {
  restaurantId: string;
  surface: "dashboard" | "customer" | "admin";
  userId?: string | null;
  customerSessionId?: string | null;
  threadId?: string | null;
}) {
  const supabase = createAdminSupabaseClient() as any;

  const buildScopeQuery = () => {
    let query = supabase
      .from("ai_conversations")
      .select("id,title,metadata,updated_at")
      .eq("restaurant_id", input.restaurantId)
      .eq("surface", input.surface)
      .eq("status", "active");

    if (input.userId) query = query.eq("user_id", input.userId);
    if (input.customerSessionId) query = query.eq("customer_session_id", input.customerSessionId);

    return query;
  };

  if (input.threadId) {
    const threadMatch = await buildScopeQuery()
      .contains("metadata", { threadId: input.threadId })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (threadMatch.error && isMissingAiSchema(threadMatch.error)) return null;
    if (threadMatch.data?.id) {
      return {
        id: threadMatch.data.id as string,
        title: typeof threadMatch.data.title === "string" ? threadMatch.data.title : null,
        metadata: asRecord(threadMatch.data.metadata),
        updatedAt: typeof threadMatch.data.updated_at === "string" ? threadMatch.data.updated_at : null
      };
    }
  }

  const fallback = await buildScopeQuery()
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fallback.error && isMissingAiSchema(fallback.error)) return null;
  if (!fallback.data?.id) return null;

  return {
    id: fallback.data.id as string,
    title: typeof fallback.data.title === "string" ? fallback.data.title : null,
    metadata: asRecord(fallback.data.metadata),
    updatedAt: typeof fallback.data.updated_at === "string" ? fallback.data.updated_at : null
  };
}

export async function getRestaurantAiMemory(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const [restaurantResult, menuResult, promotionsResult, usageResult] = await Promise.all([
    supabase
      .from("restaurants")
      .select("id,name,slug,business_type,address,hotline,description,brand_settings")
      .eq("id", restaurantId)
      .maybeSingle(),
    supabase
      .from("menu_items")
      .select("id,name,price,is_available,category:menu_categories(name)")
      .eq("restaurant_id", restaurantId)
      .eq("is_available", true)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("promotions")
      .select("id,name,code,discount_type,discount_value,min_order_amount,show_on_customer_menu,starts_at,ends_at")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .limit(20),
    supabase
      .from("ai_usage_logs")
      .select("feature_key,provider,model,status,created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(12)
  ]);

  return {
    restaurant: restaurantResult.data ?? null,
    menu: (menuResult.data ?? []).map((item: any) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price ?? 0),
      category: Array.isArray(item.category) ? item.category[0]?.name : item.category?.name,
      available: Boolean(item.is_available)
    })),
    promotions: promotionsResult.data ?? [],
    aiUsageRecent: usageResult.data ?? []
  };
}

export async function persistAiConversationMessage(input: {
  restaurantId: string;
  conversationId?: string | null;
  userId?: string | null;
  customerSessionId?: string | null;
  threadId?: string | null;
  surface: "dashboard" | "customer" | "admin";
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  provider?: string | null;
  model?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminSupabaseClient() as any;
  let conversationId = input.conversationId;
  let conversationTitle: string | null = null;
  let conversationMetadata: Record<string, unknown> | null = null;

  if (!conversationId) {
    const reusableConversation = await findReusableConversation({
      restaurantId: input.restaurantId,
      surface: input.surface,
      userId: input.userId,
      customerSessionId: input.customerSessionId,
      threadId: input.threadId
    });

    if (reusableConversation?.id) {
      conversationId = reusableConversation.id;
      conversationTitle = reusableConversation.title;
      conversationMetadata = reusableConversation.metadata;
    }
  }

  if (!conversationId) {
    const nextMetadata = mergeConversationMetadata(conversationMetadata, input.metadata, input.threadId);
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({
        restaurant_id: input.restaurantId,
        user_id: input.userId ?? null,
        customer_session_id: input.customerSessionId ?? null,
        surface: input.surface,
        title: input.content.slice(0, 80),
        metadata: nextMetadata
      })
      .select("id,title,metadata")
      .single();
    if (error && isMissingAiSchema(error)) return null;
    if (!error) {
      conversationId = data?.id ?? null;
      conversationTitle = typeof data?.title === "string" ? data.title : input.content.slice(0, 80);
      conversationMetadata = asRecord(data?.metadata) ?? nextMetadata;
    }
  }

  if (!conversationId) return null;

  const { error } = await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    restaurant_id: input.restaurantId,
    role: input.role,
    content: input.content.slice(0, 6000),
    provider: input.provider ?? null,
    model: input.model ?? null,
    metadata: input.metadata ?? {}
  });

  if (error && isMissingAiSchema(error)) return conversationId;
  if (error) return conversationId;

  const nextConversationMetadata = mergeConversationMetadata(conversationMetadata, input.metadata, input.threadId);
  const { error: conversationError } = await supabase
    .from("ai_conversations")
    .update({
      title: conversationTitle ?? input.content.slice(0, 80),
      metadata: nextConversationMetadata
    })
    .eq("id", conversationId);

  if (conversationError && isMissingAiSchema(conversationError)) return conversationId;
  return conversationId;
}

export async function getLatestAiConversationReplay(input: {
  restaurantId: string;
  surface: "dashboard" | "customer" | "admin";
  userId?: string | null;
  customerSessionId?: string | null;
  threadId?: string | null;
  limit?: number;
}): Promise<AiConversationReplayPayload> {
  const supabase = createAdminSupabaseClient() as any;
  const limit = Math.min(Math.max(input.limit ?? 10, 2), 20);

  const reusableConversation = await findReusableConversation({
    restaurantId: input.restaurantId,
    surface: input.surface,
    userId: input.userId,
    customerSessionId: input.customerSessionId,
    threadId: input.threadId
  });

  if (!reusableConversation?.id) {
    return {
      conversationId: null,
      threadId: input.threadId ?? null,
      messages: [],
      workflow: null
    };
  }

  const { data, error } = await supabase
    .from("ai_messages")
    .select("role,content,created_at,metadata")
    .eq("conversation_id", reusableConversation.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error && isMissingAiSchema(error)) {
    return {
      conversationId: null,
      threadId: input.threadId ?? null,
      messages: [],
      workflow: null
    };
  }

  const orderedMessages = (data ?? []).slice().reverse();
  const replayMessages = orderedMessages
    .filter((message: any) => message?.role === "user" || message?.role === "assistant")
    .map((message: any) => ({
      role: message.role as "user" | "assistant",
      content: typeof message.content === "string" ? message.content : "",
      createdAt: typeof message.created_at === "string" ? message.created_at : new Date().toISOString()
    }))
    .filter((message: { content: string }) => message.content.trim().length > 0);

  const latestAssistantWithWorkflow = [...orderedMessages]
    .reverse()
    .find((message: any) => message?.role === "assistant" && extractWorkflowSnapshot(message.metadata, message.created_at));

  const workflow =
    extractWorkflowSnapshot(reusableConversation.metadata, reusableConversation.updatedAt) ??
    extractWorkflowSnapshot(latestAssistantWithWorkflow?.metadata, latestAssistantWithWorkflow?.created_at);

  const conversationThreadId = typeof reusableConversation.metadata?.threadId === "string" ? reusableConversation.metadata.threadId : input.threadId ?? null;

  return {
    conversationId: reusableConversation.id,
    threadId: conversationThreadId,
    messages: replayMessages,
    workflow
  };
}

export async function recordAiWorkflowCheckpoint(input: {
  restaurantId: string;
  surface: "dashboard" | "customer" | "admin";
  userId?: string | null;
  customerSessionId?: string | null;
  threadId?: string | null;
  status: AiWorkflowCheckpointStatus;
  action?: unknown;
  actionId?: string | null;
  actionLabel?: string | null;
  summary?: string | null;
  source?: "owner" | "assistant" | "system";
}) {
  const supabase = createAdminSupabaseClient() as any;
  const conversation = await findReusableConversation({
    restaurantId: input.restaurantId,
    surface: input.surface,
    userId: input.userId,
    customerSessionId: input.customerSessionId,
    threadId: input.threadId
  });

  if (!conversation?.id) return null;

  const action = sanitizeAction(input.action);
  const checkpoint = buildWorkflowCheckpoint({
    actionId: action?.id ?? input.actionId,
    actionLabel: action?.label ?? input.actionLabel,
    status: input.status,
    summary: input.summary,
    source: input.source
  });
  const nextMetadata = mergeWorkflowCheckpointMetadata(conversation.metadata ?? {}, checkpoint, action, input.threadId);

  const { error } = await supabase
    .from("ai_conversations")
    .update({ metadata: nextMetadata })
    .eq("id", conversation.id);

  if (error && isMissingAiSchema(error)) return null;
  if (error) return null;

  return extractWorkflowSnapshot(nextMetadata, new Date().toISOString());
}
