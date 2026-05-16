export type ReservationAssignableTable = {
  id: string;
  name: string;
  area: string;
  capacity: number;
  seating_zone?: string | null;
  table_kind?: string | null;
  reservation_priority?: number | null;
};

function assignmentScore(table: ReservationAssignableTable, partySize: number) {
  const wastedSeats = Math.max(0, table.capacity - partySize);
  const priority = Number(table.reservation_priority ?? 100);
  const vipPenalty = table.table_kind === "vip" && wastedSeats > 1 ? 3 : 0;
  const outdoorPenalty = table.seating_zone === "outdoor" ? 1 : 0;

  return wastedSeats * 1000 + vipPenalty * 100 + outdoorPenalty * 25 + priority;
}

export function rankReservationTablesForAssignment<T extends ReservationAssignableTable>(tables: T[], partySize: number) {
  return [...tables].sort((left, right) => {
    const scoreDiff = assignmentScore(left, partySize) - assignmentScore(right, partySize);
    if (scoreDiff !== 0) return scoreDiff;

    const capacityDiff = left.capacity - right.capacity;
    if (capacityDiff !== 0) return capacityDiff;

    return left.name.localeCompare(right.name, "vi");
  });
}

export function reservationAssignmentReason(table: ReservationAssignableTable, partySize: number) {
  const wastedSeats = Math.max(0, table.capacity - partySize);
  if (wastedSeats === 0) return "Bàn vừa đủ sức chứa, tối ưu vòng quay.";
  if (wastedSeats <= 2) return "Bàn còn ít ghế trống, giảm lãng phí bàn lớn.";
  if (table.table_kind === "vip") return "Bàn VIP chỉ được chọn khi không còn bàn tiêu chuẩn phù hợp hơn.";
  return "Bàn phù hợp nhất trong các lựa chọn còn trống.";
}
