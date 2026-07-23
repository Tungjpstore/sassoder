import { publishOperationalEvent } from "../shared/queues.js";
import { readEnv } from "../shared/env.js";
import { hasSupabaseConfig, supabaseAdmin } from "../shared/supabase.js";

type OperationalOutboxRow = {
  id: string;
  event_id: string;
  event_type: string;
  restaurant_id: string;
  branch_id: string | null;
  attempts: number;
  locked_by: string;
  payload: Record<string, unknown>;
};

type RelayState = {
  running: boolean;
  timer: ReturnType<typeof setInterval> | null;
};

export function startOperationalOutboxRelay({ logger }: { logger: any }) {
  const enabled = readEnv("OPERATIONAL_OUTBOX_RELAY_ENABLED", "true") !== "false";
  const state: RelayState = { running: false, timer: null };

  if (!enabled) {
    logger.warn("operational outbox relay disabled");
    return () => undefined;
  }

  if (!hasSupabaseConfig()) {
    logger.warn("operational outbox relay skipped: missing Supabase config");
    return () => undefined;
  }

  const intervalMs = numberEnv("OPERATIONAL_OUTBOX_RELAY_INTERVAL_MS", 5000);
  state.timer = setInterval(() => {
    void relayOnce(state, logger).catch((error) => {
      logger.error({ error: safeLogError(error) }, "operational outbox relay tick failed");
    });
  }, intervalMs);
  state.timer.unref?.();

  void relayOnce(state, logger).catch((error) => {
    logger.error({ error: safeLogError(error) }, "operational outbox relay initial run failed");
  });

  logger.info({ intervalMs }, "operational outbox relay started");

  return () => {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  };
}

async function relayOnce(state: RelayState, logger: any) {
  if (state.running) return;
  state.running = true;
  try {
    const rows = await claimRows();
    if (rows.length === 0) return;

    logger.info({ count: rows.length }, "operational outbox relay claimed events");
    for (const row of rows) {
      await relayRow(row, logger);
    }
  } finally {
    state.running = false;
  }
}

async function relayRow(row: OperationalOutboxRow, logger: any) {
  try {
    const jobs = await publishOperationalEvent(row.payload);
    await markPublished(row, jobs);
    logger.info({ outboxId: row.id, eventId: row.event_id, eventType: row.event_type, jobs: jobs.length }, "operational outbox event published");
  } catch (error) {
    const attempts = Number(row.attempts ?? 0);
    const maxAttempts = numberEnv("OPERATIONAL_OUTBOX_RELAY_MAX_ATTEMPTS", 12);
    const final = attempts >= maxAttempts || isPermanentPublishError(error);
    await markFailed(row, error, final);
    logger.error(
      { outboxId: row.id, eventId: row.event_id, eventType: row.event_type, attempts, final, error: safeLogError(error) },
      "operational outbox event publish failed"
    );
  }
}

async function claimRows(): Promise<OperationalOutboxRow[]> {
  const workerName = readEnv("HOSTNAME", "logivn-worker");
  const limit = numberEnv("OPERATIONAL_OUTBOX_RELAY_BATCH_SIZE", 25);
  const lockSeconds = numberEnv("OPERATIONAL_OUTBOX_RELAY_LOCK_SECONDS", 120);
  const { data, error } = await supabaseAdmin().rpc("claim_operational_event_outbox", {
    p_limit: limit,
    p_worker: workerName,
    p_lock_seconds: lockSeconds
  });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    event_id: String(row.event_id),
    event_type: String(row.event_type),
    restaurant_id: String(row.restaurant_id),
    branch_id: row.branch_id ? String(row.branch_id) : null,
    attempts: Number(row.attempts ?? 0),
    locked_by: String(row.locked_by),
    payload: row.payload && typeof row.payload === "object" ? row.payload : {}
  }));
}

async function markPublished(row: OperationalOutboxRow, jobs: Array<{ queueName: string; jobId: string; name: string }>) {
  const { data, error } = await supabaseAdmin()
    .from("operational_event_outbox")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error: null,
      delivery_metadata: { jobs, relayedAt: new Date().toISOString() },
      updated_at: new Date().toISOString()
    })
    .eq("id", row.id)
    .eq("status", "processing")
    .eq("locked_by", row.locked_by)
    .eq("attempts", row.attempts)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("OUTBOX_LEASE_LOST");
}

async function markFailed(row: OperationalOutboxRow, error: unknown, final: boolean) {
  const delayMs = final ? 0 : nextDelayMs(row.attempts);
  const { data, error: updateError } = await supabaseAdmin()
    .from("operational_event_outbox")
    .update({
      status: final ? "dead_letter" : "failed",
      locked_at: null,
      locked_by: null,
      last_error: errorMessage(error).slice(0, 500),
      next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", row.id)
    .eq("status", "processing")
    .eq("locked_by", row.locked_by)
    .eq("attempts", row.attempts)
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!data) throw new Error("OUTBOX_LEASE_LOST");
}

function nextDelayMs(attempts: number) {
  const base = numberEnv("OPERATIONAL_OUTBOX_RELAY_BACKOFF_MS", 30_000);
  const cap = numberEnv("OPERATIONAL_OUTBOX_RELAY_BACKOFF_MAX_MS", 900_000);
  const exponential = base * 2 ** Math.min(Math.max(attempts - 1, 0), 8);
  const jitter = Math.floor(Math.random() * Math.min(base, 10_000));
  return Math.min(exponential + jitter, cap);
}

function isPermanentPublishError(error: unknown) {
  const message = errorMessage(error);
  return message.includes("Unsupported operational event") || message.includes("must include tenantId");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function safeLogError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function numberEnv(name: string, fallback: number) {
  const parsed = Number(readEnv(name, String(fallback)));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
