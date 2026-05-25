import { publishOperationalEvent } from "../shared/queues.js";
import { readEnv } from "../shared/env.js";
import { hasSupabaseConfig, supabaseAdmin } from "../shared/supabase.js";

type SlaOrderRow = {
  id: string;
  restaurant_id: string;
  branch_id: string | null;
  service_due_at: string;
};

type ScannerState = {
  running: boolean;
  timer: ReturnType<typeof setInterval> | null;
};

export function startSlaScanner({ logger }: { logger: any }) {
  const enabled = readEnv("ORDERS_SLA_SCANNER_ENABLED", "true") !== "false";
  const state: ScannerState = { running: false, timer: null };

  if (!enabled) {
    logger.warn("orders SLA scanner disabled");
    return () => undefined;
  }

  if (!hasSupabaseConfig()) {
    logger.warn("orders SLA scanner skipped: missing Supabase config");
    return () => undefined;
  }

  const intervalMs = numberEnv("ORDERS_SLA_SCANNER_INTERVAL_MS", 60_000);
  state.timer = setInterval(() => {
    void scanOnce(state, logger).catch((error) => {
      logger.error({ error: safeLogError(error) }, "orders SLA scanner tick failed");
    });
  }, intervalMs);
  state.timer.unref?.();

  void scanOnce(state, logger).catch((error) => {
    logger.error({ error: safeLogError(error) }, "orders SLA scanner initial run failed");
  });

  logger.info({ intervalMs }, "orders SLA scanner started");

  return () => {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  };
}

async function scanOnce(state: ScannerState, logger: any) {
  if (state.running) return;
  state.running = true;
  try {
    const thresholdMinutes = numberEnv("ORDERS_SLA_WARNING_MINUTES", 10);
    const repeatMinutes = numberEnv("ORDERS_SLA_WARNING_REPEAT_MINUTES", 15);
    const cutoff = new Date(Date.now() - thresholdMinutes * 60_000).toISOString();
    const limit = numberEnv("ORDERS_SLA_SCANNER_BATCH_SIZE", 80);
    const { data, error } = await supabaseAdmin()
      .from("orders")
      .select("id,restaurant_id,branch_id,service_due_at")
      .in("status", ["pending", "ordering"])
      .not("service_due_at", "is", null)
      .lt("service_due_at", cutoff)
      .order("service_due_at", { ascending: true })
      .limit(limit);

    if (error) throw error;
    const rows = (data ?? []) as SlaOrderRow[];
    if (rows.length === 0) return;

    let published = 0;
    for (const row of rows) {
      const lateMinutes = Math.max(1, Math.floor((Date.now() - new Date(row.service_due_at).getTime()) / 60_000));
      const bucket = Math.max(1, Math.floor(lateMinutes / repeatMinutes));
      await publishOperationalEvent({
        type: "sla.warning",
        eventId: `sla.warning:${row.id}:${bucket}`,
        tenantId: row.restaurant_id,
        restaurantId: row.restaurant_id,
        branchId: row.branch_id,
        source: "system",
        actor: { type: "system" },
        sla: {
          orderId: row.id,
          displayCode: shortId(row.id),
          lateMinutes
        }
      });
      published += 1;
    }

    logger.warn({ scanned: rows.length, published }, "orders SLA warnings published");
  } finally {
    state.running = false;
  }
}

function shortId(id: string) {
  return id.replaceAll("-", "").slice(0, 6).toUpperCase();
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
