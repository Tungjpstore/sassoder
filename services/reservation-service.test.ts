import assert from "node:assert/strict";
import { test } from "node:test";
import { reservationRescheduleSchema, reservationSetTablesSchema } from "../lib/validators";
import { buildReservationAnalytics, type ReservationAnalyticsRow } from "./reservation-analytics";
import { rankReservationTablesForAssignment, reservationAssignmentReason } from "./reservation-assignment";
import { isReservationPastNoShowGrace, reservationNoShowAvailableAt, roundUpToSlotBoundary } from "./reservation-time";

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
          name: "Bàn 4",
          area: "Khu chính",
          capacity: 4,
          floor_label: "Tầng 1"
        }
      }
    ],
    ...overrides
  };
}

test("roundUpToSlotBoundary snaps to the next 30-minute slot", () => {
  const value = roundUpToSlotBoundary(new Date("2026-05-12T10:17:24+07:00"));
  assert.equal(value.toISOString(), "2026-05-12T03:30:00.000Z");
});

test("roundUpToSlotBoundary keeps aligned slot times unchanged", () => {
  const value = roundUpToSlotBoundary(new Date("2026-05-12T10:30:00+07:00"));
  assert.equal(value.toISOString(), "2026-05-12T03:30:00.000Z");
});

test("reservationNoShowAvailableAt applies arrival grace from the reservation start", () => {
  const value = reservationNoShowAvailableAt("2026-05-12T19:00:00+07:00", 15);
  assert.equal(value.toISOString(), "2026-05-12T12:15:00.000Z");
});

test("isReservationPastNoShowGrace only allows no-show after grace time", () => {
  const startsAt = "2026-05-12T19:00:00+07:00";
  assert.equal(isReservationPastNoShowGrace(startsAt, 15, new Date("2026-05-12T12:14:59.000Z")), false);
  assert.equal(isReservationPastNoShowGrace(startsAt, 15, new Date("2026-05-12T12:15:00.000Z")), true);
});

test("reservationRescheduleSchema accepts a new start time with optional table override", () => {
  assert.deepEqual(
    reservationRescheduleSchema.parse({
      startsAt: "2026-05-12T12:00:00.000Z",
      tableId: ""
    }),
    {
      startsAt: "2026-05-12T12:00:00.000Z",
      tableId: undefined
    }
  );

  assert.equal(
    reservationRescheduleSchema.parse({
      startsAt: "2026-05-12T12:00:00.000Z",
      tableId: "11111111-1111-4111-8111-111111111111"
    }).tableId,
    "11111111-1111-4111-8111-111111111111"
  );
});

test("reservationSetTablesSchema accepts one to eight table ids", () => {
  const tableIds = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222"
  ];

  assert.deepEqual(reservationSetTablesSchema.parse({ tableIds }), { tableIds });
  assert.throws(() => reservationSetTablesSchema.parse({ tableIds: [] }));
  assert.throws(() => reservationSetTablesSchema.parse({ tableIds: [tableIds[0], tableIds[0]] }));
  assert.throws(() =>
    reservationSetTablesSchema.parse({
      tableIds: Array.from({ length: 9 }, (_, index) => `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`)
    })
  );
});

test("buildReservationAnalytics summarizes reservation operations without schema-specific aggregation", () => {
  const analytics = buildReservationAnalytics(
    [
      analyticsRow({
        id: "confirmed-paid",
        status: "confirmed",
        party_size: 4,
        starts_at: "2026-05-12T12:00:00.000Z",
        deposit_required_amount: 100_000,
        deposit_paid_amount: 100_000,
        deposit_status: "paid"
      }),
      analyticsRow({
        id: "completed",
        status: "completed",
        party_size: 2,
        starts_at: "2026-05-12T12:30:00.000Z",
        created_at: "2026-05-11T12:00:00.000Z"
      }),
      analyticsRow({
        id: "no-show",
        status: "no_show",
        party_size: 2,
        starts_at: "2026-05-12T13:00:00.000Z",
        deposit_required_amount: 50_000,
        deposit_status: "waiting_confirm",
        locks: [
          {
            table: {
              name: "VIP 4",
              area: "Phòng VIP",
              capacity: 4,
              floor_label: "Tầng 2"
            }
          }
        ]
      }),
      analyticsRow({
        id: "cancelled",
        status: "cancelled",
        party_size: 6,
        starts_at: "2026-05-12T12:45:00.000Z",
        locks: [
          {
            table: {
              name: "Bàn 8",
              area: "Khu chính",
              capacity: 8,
              floor_label: "Tầng 1"
            }
          }
        ]
      })
    ],
    {
      windowDays: 30,
      windowStart: new Date("2026-04-12T00:00:00.000Z"),
      windowEnd: new Date("2026-05-12T14:00:00.000Z")
    }
  );

  assert.equal(analytics.totalReservations, 4);
  assert.equal(analytics.totalGuests, 14);
  assert.equal(analytics.averagePartySize, 3.5);
  assert.equal(analytics.confirmedRate, 75);
  assert.equal(analytics.arrivalRate, 33.3);
  assert.equal(analytics.noShowRate, 33.3);
  assert.equal(analytics.cancellationRate, 25);
  assert.equal(analytics.deposit.requiredCount, 2);
  assert.equal(analytics.deposit.paidCount, 1);
  assert.equal(analytics.deposit.waitingConfirmCount, 1);
  assert.equal(analytics.deposit.paidRate, 50);
  assert.equal(analytics.capacity.tightFitRate, 25);
  assert.equal(analytics.capacity.averageUnusedSeats, 1.5);
  assert.deepEqual(analytics.peakHours[0], { label: "19:00", reservations: 3, guests: 12 });
  assert.deepEqual(analytics.topAreas[0], { label: "Tầng 1 · Khu chính", reservations: 3, guests: 12 });
});

test("buildReservationAnalytics returns zero-safe metrics for empty windows", () => {
  const analytics = buildReservationAnalytics([], {
    windowDays: 30,
    windowStart: new Date("2026-04-12T00:00:00.000Z"),
    windowEnd: new Date("2026-05-12T00:00:00.000Z")
  });

  assert.equal(analytics.totalReservations, 0);
  assert.equal(analytics.averagePartySize, 0);
  assert.equal(analytics.confirmedRate, 0);
  assert.equal(analytics.deposit.paidRate, 0);
  assert.equal(analytics.capacity.averageUnusedSeats, 0);
  assert.deepEqual(analytics.peakHours, []);
  assert.deepEqual(analytics.topAreas, []);
});

test("rankReservationTablesForAssignment prefers tight capacity before larger tables", () => {
  const ranked = rankReservationTablesForAssignment(
    [
      { id: "large", name: "Bàn 8", area: "Khu chính", capacity: 8, reservation_priority: 1 },
      { id: "tight", name: "Bàn 4", area: "Khu chính", capacity: 4, reservation_priority: 100 },
      { id: "medium", name: "Bàn 6", area: "Khu chính", capacity: 6, reservation_priority: 10 }
    ],
    4
  );

  assert.deepEqual(ranked.map((table) => table.id), ["tight", "medium", "large"]);
});

test("rankReservationTablesForAssignment filters by preferred area and table kind", () => {
  const ranked = rankReservationTablesForAssignment(
    [
      { id: "standard-main", name: "Bàn 4", area: "Khu chính", capacity: 4, table_area_id: "main", table_kind: "standard" },
      { id: "vip-main", name: "VIP 4", area: "Khu chính", capacity: 4, table_area_id: "main", table_kind: "vip" },
      { id: "vip-garden", name: "VIP sân vườn", area: "Sân vườn", capacity: 4, table_area_id: "garden", table_kind: "vip" }
    ],
    4,
    { preferredTableAreaId: "garden", preferredTableKind: "vip" }
  );

  assert.deepEqual(ranked.map((table) => table.id), ["vip-garden"]);
});

test("rankReservationTablesForAssignment treats mixed seating as fallback for indoor or outdoor preference", () => {
  const ranked = rankReservationTablesForAssignment(
    [
      { id: "indoor", name: "Trong nhà", area: "Khu chính", capacity: 4, seating_zone: "indoor" },
      { id: "mixed", name: "Linh hoạt", area: "Khu phụ", capacity: 4, seating_zone: "mixed" },
      { id: "outdoor", name: "Ngoài trời", area: "Sân", capacity: 4, seating_zone: "outdoor" }
    ],
    4,
    { preferredSeatingZone: "outdoor" }
  );

  assert.deepEqual(ranked.map((table) => table.id), ["outdoor", "mixed"]);
});

test("rankReservationTablesForAssignment does not mutate caller table order", () => {
  const tables = [
    { id: "large", name: "Bàn 8", area: "Khu chính", capacity: 8 },
    { id: "tight", name: "Bàn 4", area: "Khu chính", capacity: 4 }
  ];

  rankReservationTablesForAssignment(tables, 4);

  assert.deepEqual(tables.map((table) => table.id), ["large", "tight"]);
});

test("rankReservationTablesForAssignment avoids equivalent tables with a tight next booking", () => {
  const ranked = rankReservationTablesForAssignment(
    [
      { id: "tight-turn", name: "Bàn 4A", area: "Khu chính", capacity: 4, reservation_priority: 1 },
      { id: "clean-turn", name: "Bàn 4B", area: "Khu chính", capacity: 4, reservation_priority: 20 }
    ],
    4,
    {},
    {
      tableSignals: [
        { tableId: "tight-turn", minutesUntilNextReservation: 20, nearbyReservationCount: 1 },
        { tableId: "clean-turn", minutesUntilNextReservation: 180, nearbyReservationCount: 0 }
      ]
    }
  );

  assert.deepEqual(ranked.map((table) => table.id), ["clean-turn", "tight-turn"]);
});

test("rankReservationTablesForAssignment keeps occupancy ahead of soft active-bill pressure", () => {
  const ranked = rankReservationTablesForAssignment(
    [
      { id: "tight", name: "Bàn 4", area: "Khu chính", capacity: 4 },
      { id: "wasteful", name: "Bàn 6", area: "Khu chính", capacity: 6 }
    ],
    4,
    {},
    {
      tableSignals: [{ tableId: "tight", hasActiveBill: true }]
    }
  );

  assert.deepEqual(ranked.map((table) => table.id), ["tight", "wasteful"]);
});

test("reservationAssignmentReason can explain rotation-friendly choices", () => {
  assert.equal(
    reservationAssignmentReason(
      { id: "t1", name: "Bàn 4", area: "Khu chính", capacity: 4 },
      4,
      { tableId: "t1", minutesUntilNextReservation: 120 }
    ),
    "Bàn có khoảng xoay vòng tốt trước lịch kế tiếp."
  );
});

test("reservationAssignmentReason explains occupancy-friendly assignment", () => {
  assert.equal(
    reservationAssignmentReason({ id: "t1", name: "Bàn 4", area: "Khu chính", capacity: 4 }, 4),
    "Bàn vừa đủ sức chứa, tối ưu vòng quay."
  );
});
