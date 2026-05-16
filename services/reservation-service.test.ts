import assert from "node:assert/strict";
import { test } from "node:test";
import { rankReservationTablesForAssignment, reservationAssignmentReason } from "./reservation-assignment";
import { roundUpToSlotBoundary } from "./reservation-time";

test("roundUpToSlotBoundary snaps to the next 30-minute slot", () => {
  const value = roundUpToSlotBoundary(new Date("2026-05-12T10:17:24+07:00"));
  assert.equal(value.toISOString(), "2026-05-12T03:30:00.000Z");
});

test("roundUpToSlotBoundary keeps aligned slot times unchanged", () => {
  const value = roundUpToSlotBoundary(new Date("2026-05-12T10:30:00+07:00"));
  assert.equal(value.toISOString(), "2026-05-12T03:30:00.000Z");
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

test("reservationAssignmentReason explains occupancy-friendly assignment", () => {
  assert.equal(
    reservationAssignmentReason({ id: "t1", name: "Bàn 4", area: "Khu chính", capacity: 4 }, 4),
    "Bàn vừa đủ sức chứa, tối ưu vòng quay."
  );
});
