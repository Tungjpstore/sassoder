import "server-only";

import { createHash } from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { AiAutomationWorkflow } from "@/lib/ai/automation-workflows";
import { writeOperationalEvent } from "@/services/operational-observability-service";

export type AiAutomationRunStatus = "pending_confirmation" | "approved" | "dismissed" | "completed" | "expired" | "manual";

export type PersistedAiAutomationWorkflow = AiAutomationWorkflow & {
  lifecycle?: {
    databaseId?: string;
    status: AiAutomationRunStatus;
    schemaReady?: boolean;
    firstSeenAt?: string | null;
    lastSeenAt?: string | null;
    approvedAt?: string | null;
    dismissedAt?: string | null;
    completedAt?: string | null;
    expiresAt?: string | null;
  };
};

type AutomationRunRow = {
  id: string;
  workflow_key: string;
  fingerprint: string;
  domain?: AiAutomationWorkflow["domain"];
  title?: string;
  trigger?: string;
  outcome?: string;
  priority?: AiAutomationWorkflow["priority"];
  confidence?: AiAutomationWorkflow["confidence"];
  execution_mode?: AiAutomationWorkflow["executionMode"];
  estimated_minutes?: number;
  evidence?: unknown;
  actions?: unknown;
  status: AiAutomationRunStatus;
  first_seen_at: string | null;
  last_seen_at: string | null;
  approved_at: string | null;
  dismissed_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  steps?: Array<{
    step_key: string;
    position: number;
    label: string;
    description: string;
    status: AiAutomationWorkflow["steps"][number]["status"];
  }> | null;
};

const aiAutomationSource = "ai_ops";
const visibleRunStatuses = new Set<AiAutomationRunStatus>(["pending_confirmation", "approved", "manual"]);
const freshRunWindowMs = 5 * 60 * 1000;

function isMissingAiAutomationSchema(error: { code?: string; message?: string } | null | undefined) {
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

function scopeKey(branchId?: string | null) {
  return branchId ? `branch:${branchId}` : "restaurant";
}

function hashWorkflow(workflow: AiAutomationWorkflow) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        domain: workflow.domain,
        title: workflow.title,
        trigger: workflow.trigger,
        outcome: workflow.outcome,
        priority: workflow.priority,
        confidence: workflow.confidence,
        executionMode: workflow.executionMode,
        evidence: workflow.evidence,
        steps: workflow.steps.map((step) => ({
          id: step.id,
          label: step.label,
          description: step.description,
          status: step.status
        })),
        actions: workflow.actions.map((action) => ({
          id: action.id,
          type: action.type,
          label: action.label,
          href: action.href,
          intent: action.intent
        }))
      })
    )
    .digest("hex")
    .slice(0, 64);
}

function lifecycle(row: AutomationRunRow, schemaReady = true): NonNullable<PersistedAiAutomationWorkflow["lifecycle"]> {
  return {
    databaseId: row.id,
    status: row.status,
    schemaReady,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    approvedAt: row.approved_at,
    dismissedAt: row.dismissed_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at
  };
}

function safeStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean).slice(0, 12) : [];
}

function safeActions(value: unknown): AiAutomationWorkflow["actions"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((action) => (action && typeof action === "object" && !Array.isArray(action) ? (action as AiAutomationWorkflow["actions"][number]) : null))
    .filter((action): action is AiAutomationWorkflow["actions"][number] => Boolean(action?.id && action.label && action.type))
    .slice(0, 8);
}

function workflowFromRow(row: AutomationRunRow): PersistedAiAutomationWorkflow {
  const executionMode = row.execution_mode === "manual_only" ? "manual_only" : "confirm_first";
  return {
    id: row.workflow_key,
    domain: row.domain ?? "inventory",
    title: row.title ?? "AI workflow",
    trigger: row.trigger ?? "",
    outcome: row.outcome ?? "",
    priority: row.priority ?? "medium",
    confidence: row.confidence ?? "medium",
    estimatedMinutes: Number(row.estimated_minutes ?? 0),
    executionMode,
    evidence: safeStringArray(row.evidence),
    actions: safeActions(row.actions),
    steps: (row.steps ?? [])
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((step) => ({
        id: step.step_key,
        label: step.label,
        description: step.description,
        status: step.status
      })),
    lifecycle: lifecycle(row)
  };
}

function withSchemaMissingLifecycle(workflows: AiAutomationWorkflow[]): PersistedAiAutomationWorkflow[] {
  return workflows.map((workflow) => ({
    ...workflow,
    lifecycle: {
      status: workflow.executionMode === "manual_only" ? "manual" : "pending_confirmation",
      schemaReady: false
    }
  }));
}

function withVisibleWorkflows(workflows: AiAutomationWorkflow[], rowsByKey: Map<string, AutomationRunRow>): PersistedAiAutomationWorkflow[] {
  return workflows
    .map<PersistedAiAutomationWorkflow>((workflow) => {
      const row = rowsByKey.get(workflow.id);
      return row
        ? { ...workflow, lifecycle: lifecycle(row) }
        : {
            ...workflow,
            lifecycle: {
              status: workflow.executionMode === "manual_only" ? "manual" : "pending_confirmation",
              schemaReady: true
            }
          };
    })
    .filter((workflow) => visibleRunStatuses.has(workflow.lifecycle?.status ?? (workflow.executionMode === "manual_only" ? "manual" : "pending_confirmation")));
}

function rowForWorkflow({
  restaurantId,
  branchId,
  scope,
  generatedAt,
  existing,
  workflow
}: {
  restaurantId: string;
  branchId?: string | null;
  scope: string;
  generatedAt: string;
  existing?: AutomationRunRow;
  workflow: AiAutomationWorkflow;
}) {
  const fingerprint = hashWorkflow(workflow);
  const fingerprintChanged = Boolean(existing && existing.fingerprint !== fingerprint);
  const status = fingerprintChanged
    ? workflow.executionMode === "manual_only"
      ? "manual"
      : "pending_confirmation"
    : existing?.status ?? (workflow.executionMode === "manual_only" ? "manual" : "pending_confirmation");

  return {
    restaurant_id: restaurantId,
    branch_id: branchId ?? null,
    scope_key: scope,
    source: aiAutomationSource,
    workflow_key: workflow.id,
    fingerprint,
    domain: workflow.domain,
    title: workflow.title,
    trigger: workflow.trigger,
    outcome: workflow.outcome,
    priority: workflow.priority,
    confidence: workflow.confidence,
    execution_mode: workflow.executionMode,
    status,
    estimated_minutes: workflow.estimatedMinutes,
    evidence: workflow.evidence,
    actions: workflow.actions,
    metadata: { deterministic: true },
    generated_at: generatedAt,
    last_seen_at: generatedAt,
    approved_at: fingerprintChanged ? null : existing?.approved_at ?? null,
    approved_by: fingerprintChanged ? null : undefined,
    dismissed_at: fingerprintChanged ? null : existing?.dismissed_at ?? null,
    dismissed_by: fingerprintChanged ? null : undefined,
    completed_at: fingerprintChanged ? null : existing?.completed_at ?? null,
    completed_by: fingerprintChanged ? null : undefined,
    expires_at: null
  };
}

async function replaceRunSteps(supabase: any, restaurantId: string, rowsByKey: Map<string, AutomationRunRow>, workflows: AiAutomationWorkflow[]) {
  const stepRows = workflows.flatMap((workflow) => {
    const run = rowsByKey.get(workflow.id);
    if (!run) return [];
    return workflow.steps.map((step, index) => ({
      run_id: run.id,
      restaurant_id: restaurantId,
      step_key: step.id,
      position: index,
      label: step.label,
      description: step.description,
      status: step.status,
      metadata: {}
    }));
  });

  if (!stepRows.length) return;
  await supabase.from("ai_automation_steps").upsert(stepRows, { onConflict: "run_id,step_key" });
}

async function upsertApprovals(supabase: any, restaurantId: string, rowsByKey: Map<string, AutomationRunRow>, workflows: AiAutomationWorkflow[]) {
  const approvalRows = workflows.flatMap((workflow) => {
    const run = rowsByKey.get(workflow.id);
    if (!run || workflow.executionMode !== "confirm_first") return [];
    return [
      {
        run_id: run.id,
        restaurant_id: restaurantId,
        approval_key: "owner-confirmation",
        status: run.status === "approved" ? "approved" : "pending",
        requested_reason: workflow.outcome,
        approved_at: run.approved_at,
        metadata: { workflowKey: workflow.id, priority: workflow.priority }
      }
    ];
  });

  if (!approvalRows.length) return;
  await supabase.from("ai_automation_approvals").upsert(approvalRows, { onConflict: "run_id,approval_key" });
}

export async function persistAiAutomationRuns(input: {
  restaurantId: string;
  branchId?: string | null;
  workflows: AiAutomationWorkflow[];
  generatedAt?: string;
}): Promise<{ workflows: PersistedAiAutomationWorkflow[]; schemaReady: boolean }> {
  if (input.workflows.length === 0) return { workflows: [], schemaReady: true };

  const startedAt = Date.now();
  const supabase = createAdminSupabaseClient() as any;
  const scope = scopeKey(input.branchId);
  const workflowKeys = input.workflows.map((workflow) => workflow.id);

  const existingResult = await supabase
    .from("ai_automation_runs")
    .select("id,workflow_key,fingerprint,status,first_seen_at,last_seen_at,approved_at,dismissed_at,completed_at,expires_at")
    .eq("restaurant_id", input.restaurantId)
    .eq("scope_key", scope)
    .eq("source", aiAutomationSource)
    .in("workflow_key", workflowKeys);

  if (existingResult.error) {
    if (isMissingAiAutomationSchema(existingResult.error)) return { workflows: withSchemaMissingLifecycle(input.workflows), schemaReady: false };
    writeOperationalEvent({
      area: "ai",
      event: "ai_automation_runs_read_failed",
      restaurantId: input.restaurantId,
      status: "warn",
      metadata: { code: existingResult.error.code }
    });
    return { workflows: input.workflows, schemaReady: false };
  }

  const existingByKey = new Map<string, AutomationRunRow>(
    ((existingResult.data ?? []) as AutomationRunRow[]).map((row) => [row.workflow_key, row])
  );
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const rows = input.workflows.map((workflow) =>
    rowForWorkflow({
      restaurantId: input.restaurantId,
      branchId: input.branchId,
      scope,
      generatedAt,
      existing: existingByKey.get(workflow.id),
      workflow
    })
  );
  const generatedAtMs = new Date(generatedAt).getTime();
  const writesRequired = rows.some((row) => {
    const existing = existingByKey.get(row.workflow_key);
    if (!existing || existing.fingerprint !== row.fingerprint) return true;
    const lastSeenAtMs = new Date(existing.last_seen_at ?? "").getTime();
    return !Number.isFinite(lastSeenAtMs) || !Number.isFinite(generatedAtMs) || generatedAtMs - lastSeenAtMs > freshRunWindowMs;
  });

  if (!writesRequired) return { workflows: withVisibleWorkflows(input.workflows, existingByKey), schemaReady: true };

  const upsertResult = await supabase
    .from("ai_automation_runs")
    .upsert(rows, { onConflict: "restaurant_id,scope_key,source,workflow_key" })
    .select("id,workflow_key,fingerprint,status,first_seen_at,last_seen_at,approved_at,dismissed_at,completed_at,expires_at");

  if (upsertResult.error) {
    if (isMissingAiAutomationSchema(upsertResult.error)) return { workflows: withSchemaMissingLifecycle(input.workflows), schemaReady: false };
    writeOperationalEvent({
      area: "ai",
      event: "ai_automation_runs_upsert_failed",
      restaurantId: input.restaurantId,
      status: "warn",
      metadata: { code: upsertResult.error.code }
    });
    return { workflows: input.workflows, schemaReady: false };
  }

  const rowsByKey = new Map<string, AutomationRunRow>(
    ((upsertResult.data ?? []) as AutomationRunRow[]).map((row) => [row.workflow_key, row])
  );
  await replaceRunSteps(supabase, input.restaurantId, rowsByKey, input.workflows);
  await upsertApprovals(supabase, input.restaurantId, rowsByKey, input.workflows);

  writeOperationalEvent({
    area: "ai",
    event: "ai_automation_runs_persisted",
    restaurantId: input.restaurantId,
    latencyMs: Date.now() - startedAt,
    metadata: { count: rows.length, scope }
  });

  return { workflows: withVisibleWorkflows(input.workflows, rowsByKey), schemaReady: true };
}

export async function updateAiAutomationRunStatus(input: {
  restaurantId: string;
  runId: string;
  status: Extract<AiAutomationRunStatus, "approved" | "dismissed" | "completed">;
  actorUserId?: string | null;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: input.status };

  if (input.status === "approved") {
    patch.approved_at = now;
    patch.approved_by = input.actorUserId ?? null;
  }

  if (input.status === "dismissed") {
    patch.dismissed_at = now;
    patch.dismissed_by = input.actorUserId ?? null;
  }

  if (input.status === "completed") {
    patch.completed_at = now;
    patch.completed_by = input.actorUserId ?? null;
  }

  const result = await supabase
    .from("ai_automation_runs")
    .update(patch)
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.runId)
    .select("id")
    .maybeSingle();

  if (result.error) {
    if (isMissingAiAutomationSchema(result.error)) return { updated: false, schemaReady: false };
    throw result.error;
  }

  if (input.status === "approved") {
    await supabase
      .from("ai_automation_approvals")
      .update({
        status: "approved",
        approved_at: now,
        approved_by: input.actorUserId ?? null
      })
      .eq("restaurant_id", input.restaurantId)
      .eq("run_id", input.runId)
      .eq("approval_key", "owner-confirmation");
  }

  writeOperationalEvent({
    area: "ai",
    event: "ai_automation_run_status_updated",
    restaurantId: input.restaurantId,
    status: "success",
    metadata: { runId: input.runId, runStatus: input.status }
  });

  return { updated: Boolean(result.data?.id), schemaReady: true };
}

export async function listRecentAiAutomationRuns(restaurantId: string, limit = 12) {
  const supabase = createAdminSupabaseClient() as any;
  const result = await supabase
    .from("ai_automation_runs")
    .select(
      "id,workflow_key,fingerprint,domain,title,trigger,outcome,priority,confidence,execution_mode,estimated_minutes,evidence,actions,status,first_seen_at,last_seen_at,approved_at,dismissed_at,completed_at,expires_at,steps:ai_automation_steps(step_key,position,label,description,status)"
    )
    .eq("restaurant_id", restaurantId)
    .in("status", ["pending_confirmation", "approved", "manual"])
    .order("last_seen_at", { ascending: false })
    .limit(Math.max(1, Math.min(50, Math.floor(limit))));

  if (result.error) {
    if (isMissingAiAutomationSchema(result.error)) return { workflows: [], schemaReady: false };
    throw result.error;
  }

  return {
    workflows: ((result.data ?? []) as AutomationRunRow[]).map(workflowFromRow),
    schemaReady: true
  };
}
