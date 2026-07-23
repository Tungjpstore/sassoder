import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveReservationClosureDepositDisposition } from "../lib/reservations/deposit-policy";
import { buildReservationAnalytics, type ReservationAnalyticsRow } from "./reservation-analytics";
import { isReservationPastNoShowGrace, reservationNoShowAvailableAt } from "./reservation-time";

const schemaSql = readFileSync("supabase/schema.sql", "utf8");
const reservationServiceSql = readFileSync("services/reservation-service.ts", "utf8");
const reservationCronRouteSql = readFileSync("app/api/cron/reservations/expire/route.ts", "utf8");
const reservationAvailabilityRouteSql = readFileSync("app/api/restaurants/[restaurantSlug]/reservations/availability/route.ts", "utf8");
const publicReservationRouteSql = readFileSync("app/api/reservations/[reservationId]/route.ts", "utf8");
const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  crons?: Array<{ path?: string; schedule?: string }>;
};

function sqlPattern(text: string) {
  return literalPattern(text, "i");
}

function servicePattern(text: string) {
  return literalPattern(text, "s");
}

function literalPattern(text: string, flags: string) {
  const escapedParts = text
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escapedParts.join("\\s+"), flags);
}

function analyticsRow(overrides: Partial<ReservationAnalyticsRow> = {}): ReservationAnalyticsRow {
  return {
    id: "reservation-1",
    status: "confirmed",
    party_size: 2,
    starts_at: "2026-05-12T12:00:00.000Z",
    created_at: "2026-05-12T03:00:00.000Z",
    deposit_required_amount: 0,
    deposit_paid_amount: 0,
    deposit_status: "none",
    locks: [
      {
        table: {
          name: "Ban 4",
          area: "Main",
          capacity: 4,
          floor_label: "Floor 1"
        }
      }
    ],
    ...overrides
  };
}

test("reservation locks prevent overlapping table holds per tenant", () => {
  assert.match(schemaSql, /create extension if not exists btree_gist/i);
  assert.match(
    schemaSql,
    sqlPattern(`constraint reservation_no_overlap_per_table exclude using gist (
      restaurant_id with =,
      table_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status = 'active')`)
  );
  assert.match(schemaSql, /constraint reservation_table_locks_status_check check \(status in \('active','released'\)\)/i);
});

test("reservation booking retries are tenant-scoped and idempotent", () => {
  assert.match(
    schemaSql,
    sqlPattern(`create unique index reservations_restaurant_idempotency_idx
      on public.reservations (restaurant_id, idempotency_key)
      where idempotency_key is not null`)
  );
  // Retries must recover the same customer access token instead of minting a new one.
  assert.match(
    reservationServiceSql,
    /const accessToken = input\.idempotencyKey\s*\?\s*deterministicReservationAccessToken\(settings\.id, input\.idempotencyKey\)\s*:\s*randomUUID\(\);/
  );
  assert.match(reservationServiceSql, /function deterministicReservationAccessToken\(/);
  assert.match(reservationServiceSql, /getIdempotentReservationResult\(supabase, settings, input\.idempotencyKey\)/);
  assert.match(reservationServiceSql, /\(reservationError as \{ code\?: string \} \| null\)\?\.code === "23505" && input\.idempotencyKey/);
});

test("reservation RLS policies keep reservation data inside one tenant", () => {
  assert.match(schemaSql, sqlPattern("alter table public.reservations enable row level security"));
  assert.match(schemaSql, sqlPattern("alter table public.reservation_table_locks enable row level security"));
  assert.match(schemaSql, /on public\.reservations for select[\s\S]*restaurant_id = (?:public|app_private)\.current_restaurant_id\(\)/i);
  assert.match(schemaSql, /on public\.reservation_table_locks for select[\s\S]*restaurant_id = (?:public|app_private)\.current_restaurant_id\(\)/i);
});

test("public reservation APIs avoid tenant leaks and brute-force status checks", () => {
  assert.match(reservationServiceSql, /async function assertReservationAccess\(reservationId: string, token: string\)[\s\S]*access_token_hash !== hashToken\(token\)/);
  assert.match(publicReservationRouteSql, /checkPersistentRateLimit\(\{[\s\S]*scope: "reservation_status"[\s\S]*identifier: reservationId[\s\S]*limit: 30/);
  assert.match(publicReservationRouteSql, /publicReservationAccessSchema\.parse/);
  assert.match(reservationAvailabilityRouteSql, /scope: "reservation_availability"[\s\S]*identifier: restaurantSlug/);
  assert.match(reservationAvailabilityRouteSql, /restaurant: \{[\s\S]*name: result\.restaurant\.name[\s\S]*slug: result\.restaurant\.slug/);
  assert.doesNotMatch(reservationAvailabilityRouteSql, /id: result\.restaurant\.id/);
});

test("reservation table assignments are guarded against cross-tenant joins", () => {
  assert.match(schemaSql, /create or replace function public\.enforce_restaurant_scoped_table_assignment\(\)/i);
  assert.match(schemaSql, /raise foreign_key_violation[\s\S]*restaurant_scoped_table_assignment/i);
  assert.match(schemaSql, /raise foreign_key_violation[\s\S]*restaurant_scoped_reservation_assignment/i);
  assert.match(
    schemaSql,
    /create trigger reservation_table_locks_enforce_restaurant_scope[\s\S]*on public\.reservation_table_locks[\s\S]*execute function public\.enforce_restaurant_scoped_table_assignment\(\)/i
  );
  assert.match(
    schemaSql,
    /create trigger table_bills_enforce_restaurant_scope[\s\S]*on public\.table_bills[\s\S]*execute function public\.enforce_restaurant_scoped_table_assignment\(\)/i
  );
  assert.match(schemaSql, /revoke all on function public\.enforce_restaurant_scoped_table_assignment\(\) from public, anon, authenticated/i);
});

test("reservation realtime publication covers availability and assignment inputs", () => {
  for (const table of ["reservations", "reservation_table_locks", "tables", "table_bills"]) {
    assert.match(schemaSql, sqlPattern(`alter publication supabase_realtime add table public.${table}`), table);
  }
});

test("reservation deposit closure policy separates refunds, forfeits and uncaptured cancellations", () => {
  assert.deepEqual(
    resolveReservationClosureDepositDisposition(
      {
        depositRequiredAmount: 100_000,
        depositPaidAmount: 100_000,
        depositStatus: "paid"
      },
      "merchant_cancel"
    ),
    {
      nextDepositStatus: "refundable",
      logStatus: "cancelled",
      riskEventType: "refund_due",
      label: "Cần hoàn cọc thủ công"
    }
  );

  assert.deepEqual(
    resolveReservationClosureDepositDisposition(
      {
        depositRequiredAmount: 100_000,
        depositPaidAmount: 100_000,
        depositStatus: "paid"
      },
      "no_show"
    ),
    {
      nextDepositStatus: "forfeited",
      logStatus: "cancelled",
      riskEventType: "deposit_forfeited",
      label: "Giữ cọc do khách không đến"
    }
  );

  assert.equal(
    resolveReservationClosureDepositDisposition(
      {
        depositRequiredAmount: 0,
        depositPaidAmount: 0,
        depositStatus: "none"
      },
      "customer_cancel"
    ),
    null
  );
});

test("reservation no-show logic waits until the configured grace deadline", () => {
  const startsAt = "2026-05-12T19:00:00+07:00";

  assert.equal(reservationNoShowAvailableAt(startsAt, 20).toISOString(), "2026-05-12T12:20:00.000Z");
  assert.equal(isReservationPastNoShowGrace(startsAt, 20, new Date("2026-05-12T12:19:59.000Z")), false);
  assert.equal(isReservationPastNoShowGrace(startsAt, 20, new Date("2026-05-12T12:20:00.000Z")), true);
});

test("reservation analytics reports peak-hour booking in Vietnam time", () => {
  const analytics = buildReservationAnalytics(
    [
      analyticsRow({
        id: "dinner-peak",
        starts_at: "2026-05-12T12:30:00.000Z",
        created_at: "2026-05-12T03:00:00.000Z",
        party_size: 6
      }),
      analyticsRow({
        id: "late-local-day",
        starts_at: "2026-05-12T17:30:00.000Z",
        created_at: "2026-05-12T17:00:00.000Z",
        party_size: 2
      })
    ],
    {
      windowDays: 1,
      windowStart: new Date("2026-05-12T00:00:00.000Z"),
      windowEnd: new Date("2026-05-13T00:00:00.000Z")
    }
  );

  assert.deepEqual(analytics.peakHours, [
    { label: "00:00", reservations: 1, guests: 2 },
    { label: "19:00", reservations: 1, guests: 6 }
  ]);
});

test("reservation service releases locks on cancellation, reschedule and no-show", () => {
  assert.match(
    reservationServiceSql,
    servicePattern(`export async function cancelReservation(restaurantId: string, reservationId: string) {
      const reservation = await getFreshReservationById(reservationId, restaurantId);
      const supabase = createAdminSupabaseClient();`)
  );
  assert.match(
    reservationServiceSql,
    servicePattern(`.from("reservation_table_locks")
    .update({ status: "released" })
    .eq("reservation_id", reservationId)
    .eq("restaurant_id", restaurantId);`)
  );
  assert.match(reservationServiceSql, /async function replaceReservationTableLocks[\s\S]*replace_reservation_table_locks_atomic/);
  assert.match(reservationServiceSql, /export async function rescheduleReservation[\s\S]*replaceReservationTableLocks/);
  assert.doesNotMatch(
    reservationServiceSql,
    /export async function rescheduleReservation[\s\S]*if \(error\) await replacement\.rollback\(\);/
  );
  assert.match(reservationServiceSql, /export async function markReservationNoShow[\s\S]*\.from\("reservation_table_locks"\)[\s\S]*\.update\(\{ status: "released" \}\)/);
});

test("reservation seating converts a confirmed booking into an open table bill", () => {
  assert.match(
    reservationServiceSql,
    /export async function seatReservation[\s\S]*\.from\("table_bills"\)[\s\S]*reservation_id: reservationId[\s\S]*deposit_applied_amount: reservation\.depositPaidAmount/
  );
  assert.match(schemaSql, /create unique index table_bills_open_table_idx[\s\S]*on public\.table_bills \(restaurant_id, table_id\)[\s\S]*where status = 'open'/i);
});

test("reservation reminders are queued through a tenant-scoped notification outbox", () => {
  assert.match(schemaSql, /create table public\.reservation_notification_outbox/i);
  assert.match(schemaSql, /reservation_id uuid not null references public\.reservations\(id\) on delete cascade/i);
  assert.match(schemaSql, /dedupe_key text/i);
  assert.match(schemaSql, /constraint reservation_notification_outbox_dedupe_key_format check \(dedupe_key is null or dedupe_key ~ '\^\[a-z0-9_:-\]\{6,160\}\$'\)/i);
  assert.match(
    schemaSql,
    sqlPattern(`create unique index reservation_notification_outbox_dedupe_idx
      on public.reservation_notification_outbox (restaurant_id, dedupe_key)`)
  );
  assert.match(schemaSql, /on public\.reservation_notification_outbox for select[\s\S]*restaurant_id = (?:public|app_private)\.current_restaurant_id\(\)/i);
  assert.match(reservationServiceSql, /from\("reservation_notification_outbox"\)\.insert/);
  assert.match(reservationServiceSql, /const reservationReminderNotifications = \[[\s\S]*customer_arrival_2h[\s\S]*merchant_table_prep_30m/);
  assert.match(reservationServiceSql, /scheduleReservationReminderNotifications[\s\S]*\.upsert\(rows, \{[\s\S]*onConflict: "restaurant_id,dedupe_key"/);
  assert.match(reservationServiceSql, /skipQueuedReservationReminderNotifications[\s\S]*\.like\("dedupe_key", `reservation:\$\{input\.reservationId\}:reminder:%`\)/);
  assert.match(reservationServiceSql, /export async function createReservation[\s\S]*scheduleReservationReminderNotifications/);
  assert.match(reservationServiceSql, /export async function rescheduleReservation[\s\S]*scheduleReservationReminderNotifications/);
  assert.match(reservationServiceSql, /export async function cancelReservation[\s\S]*skipQueuedReservationReminderNotifications/);
  assert.match(reservationServiceSql, /export async function markReservationNoShow[\s\S]*skipQueuedReservationReminderNotifications/);
  assert.match(reservationServiceSql, /reservation_deposit_confirmed/);
  assert.match(reservationServiceSql, /reservation_rescheduled/);
  assert.match(reservationServiceSql, /reservation_no_show/);
});

test("reservation reminder outbox is processed by the frequent lifecycle cron", () => {
  assert.match(reservationServiceSql, /export async function processDueReservationNotifications/);
  assert.match(
    reservationServiceSql,
    /from\("reservation_notification_outbox"\)[\s\S]*\.eq\("status", "queued"\)[\s\S]*\.lte\("scheduled_at", now\)[\s\S]*\.order\("scheduled_at", \{ ascending: true \}\)/
  );
  assert.match(reservationServiceSql, /statusPatch =[\s\S]*row\.channel === "in_app"[\s\S]*status: "sent"[\s\S]*sent_at: now/);
  assert.match(reservationServiceSql, /status: "skipped"[\s\S]*unsupported_channel:\$\{row\.channel\}/);
  assert.match(reservationServiceSql, /\.eq\("id", row\.id\)[\s\S]*\.eq\("restaurant_id", row\.restaurant_id\)[\s\S]*\.eq\("status", "queued"\)/);
  assert.match(reservationServiceSql, /const notifications = await processDueReservationNotifications\(restaurantId, options\)/);
  assert.match(reservationServiceSql, /hasMore: holds\.hasMore \|\| noShows\.hasMore \|\| notifications\.hasMore/);
  assert.match(reservationCronRouteSql, /notificationBatches: result\.notifications\.batches/);
  assert.match(reservationCronRouteSql, /notificationSent: result\.notifications\.sent/);
  assert.match(reservationCronRouteSql, /notificationFailed: result\.notifications\.failed/);

  const reservationCron = vercelConfig.crons?.find((cron) => cron.path === "/api/cron/reservations/expire");
  assert.equal(reservationCron?.schedule, "*/15 * * * *");
});
