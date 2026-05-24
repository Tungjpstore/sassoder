import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { writeOperationalEvent } from "@/services/operational-observability-service";

export type CronRunStatus = "success" | "warn" | "error";

type CronRunLogInput = {
  jobKey: string;
  jobPath: string;
  status: CronRunStatus;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  resultSummary?: Record<string, unknown>;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

type RunLoggedCronInput<T> = {
  request: Request;
  jobKey: string;
  run: () => Promise<T>;
  statusFromResult?: (result: T) => CronRunStatus;
  summaryFromResult?: (result: T) => Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

function isMissingCronRunLogSchema(error: { code?: string; message?: string } | null | undefined) {
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

function sanitizeText(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return sanitizeText(error.message || error.name, 1000);
  return sanitizeText(String(error || "Unknown cron failure"), 1000);
}

function safeRecord(value: Record<string, unknown> | undefined) {
  if (!value) return {};
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function recordCronRunLog(input: CronRunLogInput): Promise<{ inserted: boolean; schemaReady: boolean }> {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("cron_run_logs").insert({
    job_key: sanitizeText(input.jobKey, 120),
    job_path: sanitizeText(input.jobPath, 240),
    status: input.status,
    started_at: input.startedAt.toISOString(),
    finished_at: input.finishedAt.toISOString(),
    duration_ms: Math.max(0, Math.round(input.durationMs)),
    deployment_id: process.env.VERCEL_GIT_COMMIT_SHA || null,
    region: process.env.VERCEL_REGION || null,
    result_summary: safeRecord(input.resultSummary),
    error_message: input.errorMessage ? sanitizeText(input.errorMessage, 1000) : null,
    metadata: safeRecord(input.metadata)
  });

  if (!error) return { inserted: true, schemaReady: true };
  if (isMissingCronRunLogSchema(error)) return { inserted: false, schemaReady: false };

  writeOperationalEvent({
    area: "ops",
    event: "cron_run_log_write_failed",
    status: "warn",
    metadata: {
      jobKey: input.jobKey,
      status: input.status,
      error: error.message ?? "Unknown cron_run_logs insert failure"
    }
  });

  return { inserted: false, schemaReady: true };
}

export async function runLoggedCron<T>(input: RunLoggedCronInput<T>) {
  const startedAt = new Date();
  const startedMs = Date.now();
  const jobPath = new URL(input.request.url).pathname;

  try {
    const result = await input.run();
    const finishedAt = new Date();
    const status = input.statusFromResult?.(result) ?? "success";

    await recordCronRunLog({
      jobKey: input.jobKey,
      jobPath,
      status,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedMs,
      resultSummary: input.summaryFromResult?.(result) ?? {},
      metadata: input.metadata
    });

    return result;
  } catch (error) {
    const finishedAt = new Date();

    await recordCronRunLog({
      jobKey: input.jobKey,
      jobPath,
      status: "error",
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedMs,
      errorMessage: errorMessage(error),
      metadata: input.metadata
    });

    throw error;
  }
}
