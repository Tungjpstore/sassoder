export type ReservationAssignableTable = {
  id: string;
  name: string;
  area: string;
  capacity: number;
  table_area_id?: string | null;
  seating_zone?: string | null;
  table_kind?: string | null;
  reservation_priority?: number | null;
};

export type ReservationAssignmentPreferences = {
  preferredTableAreaId?: string | null;
  preferredSeatingZone?: string | null;
  preferredTableKind?: string | null;
};

export type ReservationAssignmentTableSignal = {
  tableId: string;
  minutesSincePreviousReservation?: number | null;
  minutesUntilNextReservation?: number | null;
  nearbyReservationCount?: number | null;
  hasActiveBill?: boolean | null;
};

export type ReservationAssignmentContext = {
  tableSignals?: ReservationAssignmentTableSignal[];
  rotationWindowMinutes?: number;
};

export function tableMatchesReservationPreferences(table: ReservationAssignableTable, preferences: ReservationAssignmentPreferences = {}) {
  if (preferences.preferredTableAreaId && table.table_area_id !== preferences.preferredTableAreaId) return false;
  if (preferences.preferredTableKind && table.table_kind !== preferences.preferredTableKind) return false;
  if (preferences.preferredSeatingZone && table.seating_zone !== preferences.preferredSeatingZone && table.seating_zone !== "mixed") return false;
  return true;
}

function rotationPenalty(signal: ReservationAssignmentTableSignal | undefined, rotationWindowMinutes: number) {
  if (!signal) return 0;
  const minutesUntilNext = Number(signal.minutesUntilNextReservation ?? rotationWindowMinutes);
  const minutesSincePrevious = Number(signal.minutesSincePreviousReservation ?? rotationWindowMinutes);
  const nextPressure = minutesUntilNext < rotationWindowMinutes ? rotationWindowMinutes - Math.max(0, minutesUntilNext) : 0;
  const previousPressure = minutesSincePrevious < rotationWindowMinutes ? rotationWindowMinutes - Math.max(0, minutesSincePrevious) : 0;
  const densityPenalty = Number(signal.nearbyReservationCount ?? 0) * 12;
  const activeBillPenalty = signal.hasActiveBill ? 180 : 0;

  return nextPressure * 6 + previousPressure * 3 + densityPenalty + activeBillPenalty;
}

function assignmentScore(
  table: ReservationAssignableTable,
  partySize: number,
  preferences: ReservationAssignmentPreferences = {},
  signal?: ReservationAssignmentTableSignal,
  rotationWindowMinutes = 120
) {
  const wastedSeats = Math.max(0, table.capacity - partySize);
  const priority = Number(table.reservation_priority ?? 100);
  const vipPenalty = table.table_kind === "vip" && preferences.preferredTableKind !== "vip" && wastedSeats > 1 ? 3 : 0;
  const outdoorPenalty = table.seating_zone === "outdoor" && preferences.preferredSeatingZone !== "outdoor" ? 1 : 0;
  const seatingFallbackPenalty = preferences.preferredSeatingZone && preferences.preferredSeatingZone !== "mixed" && table.seating_zone === "mixed" ? 1 : 0;

  return wastedSeats * 1000 + vipPenalty * 100 + outdoorPenalty * 25 + seatingFallbackPenalty * 25 + rotationPenalty(signal, rotationWindowMinutes) + priority;
}

export function rankReservationTablesForAssignment<T extends ReservationAssignableTable>(
  tables: T[],
  partySize: number,
  preferences: ReservationAssignmentPreferences = {},
  context: ReservationAssignmentContext = {}
) {
  const signalsByTableId = new Map((context.tableSignals ?? []).map((signal) => [signal.tableId, signal]));
  const rotationWindowMinutes = context.rotationWindowMinutes ?? 120;

  return [...tables]
    .filter((table) => tableMatchesReservationPreferences(table, preferences))
    .sort((left, right) => {
      const scoreDiff =
        assignmentScore(left, partySize, preferences, signalsByTableId.get(left.id), rotationWindowMinutes) -
        assignmentScore(right, partySize, preferences, signalsByTableId.get(right.id), rotationWindowMinutes);
      if (scoreDiff !== 0) return scoreDiff;

      const capacityDiff = left.capacity - right.capacity;
      if (capacityDiff !== 0) return capacityDiff;

      return left.name.localeCompare(right.name, "vi");
    });
}

export function reservationAssignmentReason(table: ReservationAssignableTable, partySize: number, signal?: ReservationAssignmentTableSignal) {
  if (signal?.minutesUntilNextReservation !== null && signal?.minutesUntilNextReservation !== undefined && signal.minutesUntilNextReservation >= 90) {
    return "Bàn có khoảng xoay vòng tốt trước lịch kế tiếp.";
  }
  if (signal?.minutesSincePreviousReservation !== null && signal?.minutesSincePreviousReservation !== undefined && signal.minutesSincePreviousReservation >= 90) {
    return "Bàn đã có đủ thời gian trống để phục vụ lượt mới.";
  }

  const wastedSeats = Math.max(0, table.capacity - partySize);
  if (wastedSeats === 0) return "Bàn vừa đủ sức chứa, tối ưu vòng quay.";
  if (wastedSeats <= 2) return "Bàn còn ít ghế trống, giảm lãng phí bàn lớn.";
  if (table.table_kind === "vip") return "Bàn VIP chỉ được chọn khi không còn bàn tiêu chuẩn phù hợp hơn.";
  return "Bàn phù hợp nhất trong các lựa chọn còn trống.";
}
