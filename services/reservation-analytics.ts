import type { ReservationStatus } from "@/types/domain";
import type { Database } from "@/types/supabase";

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];

export type ReservationAnalyticsTableRow = {
  name: string;
  area: string;
  capacity: number;
  floor_label?: string | null;
};

export type ReservationAnalyticsLockRow = {
  table?: ReservationAnalyticsTableRow | ReservationAnalyticsTableRow[] | null;
};

export type ReservationAnalyticsRow = Pick<
  ReservationRow,
  "id" | "status" | "party_size" | "starts_at" | "created_at" | "deposit_required_amount" | "deposit_paid_amount" | "deposit_status"
> & {
  locks?: ReservationAnalyticsLockRow[] | null;
};

export type ReservationAnalytics = {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  totalReservations: number;
  totalGuests: number;
  averagePartySize: number;
  confirmedRate: number;
  arrivalRate: number;
  noShowRate: number;
  cancellationRate: number;
  statusCounts: Record<ReservationStatus, number>;
  deposit: {
    requiredCount: number;
    paidCount: number;
    waitingConfirmCount: number;
    requiredAmount: number;
    paidAmount: number;
    paidRate: number;
  };
  leadTime: {
    averageHours: number;
    sameDayRate: number;
  };
  capacity: {
    assignedReservations: number;
    averageUnusedSeats: number;
    tightFitRate: number;
  };
  peakHours: Array<{
    label: string;
    reservations: number;
    guests: number;
  }>;
  topAreas: Array<{
    label: string;
    reservations: number;
    guests: number;
  }>;
};

export const DEFAULT_RESERVATION_ANALYTICS_WINDOW_DAYS = 30;

const VN_UTC_OFFSET_MINUTES = 7 * 60;
const reservationStatuses = [
  "draft",
  "pending",
  "holding",
  "waiting_deposit_confirm",
  "confirmed",
  "checked_in",
  "seated",
  "completed",
  "cancelled",
  "rejected",
  "expired",
  "no_show"
] satisfies ReservationStatus[];

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function emptyReservationStatusCounts(): Record<ReservationStatus, number> {
  return reservationStatuses.reduce(
    (counts, status) => ({
      ...counts,
      [status]: 0
    }),
    {} as Record<ReservationStatus, number>
  );
}

function roundedRate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function roundedOneDecimal(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function vietnamDate(value: string) {
  return new Date(new Date(value).getTime() + VN_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

function reservationAnalyticsHourLabel(value: string) {
  const hour = new Date(value).getUTCHours() + 7;
  return `${String(hour % 24).padStart(2, "0")}:00`;
}

function reservationAnalyticsTables(row: ReservationAnalyticsRow) {
  return (row.locks ?? [])
    .map((lock) => firstOrNull(lock.table))
    .filter((table): table is ReservationAnalyticsTableRow => Boolean(table));
}

function pushGroupedMetric(groups: Map<string, { reservations: number; guests: number }>, key: string, guests: number) {
  const current = groups.get(key) ?? { reservations: 0, guests: 0 };
  groups.set(key, {
    reservations: current.reservations + 1,
    guests: current.guests + guests
  });
}

function topReservationAnalyticsGroups(groups: Map<string, { reservations: number; guests: number }>, limit: number) {
  return Array.from(groups.entries())
    .map(([label, value]) => ({ label, ...value }))
    .sort((left, right) => {
      if (right.reservations !== left.reservations) return right.reservations - left.reservations;
      return left.label.localeCompare(right.label, "vi");
    })
    .slice(0, limit);
}

export function buildReservationAnalytics(
  rows: ReservationAnalyticsRow[],
  options: {
    windowDays?: number;
    windowStart?: Date;
    windowEnd?: Date;
  } = {}
): ReservationAnalytics {
  const windowDays = options.windowDays ?? DEFAULT_RESERVATION_ANALYTICS_WINDOW_DAYS;
  const windowEnd = options.windowEnd ?? new Date();
  const windowStart = options.windowStart ?? addMinutes(windowEnd, -windowDays * 24 * 60);
  const statusCounts = emptyReservationStatusCounts();
  const hourGroups = new Map<string, { reservations: number; guests: number }>();
  const areaGroups = new Map<string, { reservations: number; guests: number }>();
  let totalGuests = 0;
  let depositRequiredCount = 0;
  let depositPaidCount = 0;
  let depositWaitingConfirmCount = 0;
  let depositRequiredAmount = 0;
  let depositPaidAmount = 0;
  let totalLeadHours = 0;
  let leadTimeCount = 0;
  let sameDayCount = 0;
  let assignedReservations = 0;
  let totalUnusedSeats = 0;
  let tightFitCount = 0;

  for (const row of rows) {
    statusCounts[row.status as ReservationStatus] += 1;
    totalGuests += row.party_size;
    pushGroupedMetric(hourGroups, reservationAnalyticsHourLabel(row.starts_at), row.party_size);

    const tables = reservationAnalyticsTables(row);
    const capacity = tables.reduce((sum, table) => sum + Number(table.capacity || 0), 0);
    if (tables[0]) {
      const areaLabel = tables[0].floor_label ? `${tables[0].floor_label} · ${tables[0].area}` : tables[0].area || "Khu chính";
      pushGroupedMetric(areaGroups, areaLabel, row.party_size);
    }
    if (capacity > 0) {
      const unusedSeats = Math.max(0, capacity - row.party_size);
      assignedReservations += 1;
      totalUnusedSeats += unusedSeats;
      if (unusedSeats <= 1) tightFitCount += 1;
    }

    if (row.deposit_required_amount > 0) {
      depositRequiredCount += 1;
      depositRequiredAmount += row.deposit_required_amount;
    }
    if (row.deposit_paid_amount > 0 || row.deposit_status === "paid") {
      depositPaidCount += 1;
      depositPaidAmount += row.deposit_paid_amount;
    }
    if (row.deposit_status === "waiting_confirm") {
      depositWaitingConfirmCount += 1;
    }

    const createdAt = new Date(row.created_at);
    const startsAt = new Date(row.starts_at);
    if (Number.isFinite(createdAt.getTime()) && Number.isFinite(startsAt.getTime())) {
      totalLeadHours += Math.max(0, startsAt.getTime() - createdAt.getTime()) / 3_600_000;
      leadTimeCount += 1;
      if (vietnamDate(row.created_at) === vietnamDate(row.starts_at)) sameDayCount += 1;
    }
  }

  const totalReservations = rows.length;
  const confirmedLifecycle =
    statusCounts.confirmed +
    statusCounts.checked_in +
    statusCounts.seated +
    statusCounts.completed +
    statusCounts.no_show;
  const arrivedReservations = statusCounts.checked_in + statusCounts.seated + statusCounts.completed;
  const closedNegativeReservations = statusCounts.cancelled + statusCounts.rejected + statusCounts.expired;

  return {
    windowDays,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    totalReservations,
    totalGuests,
    averagePartySize: roundedOneDecimal(totalGuests / totalReservations),
    confirmedRate: roundedRate(confirmedLifecycle, totalReservations),
    arrivalRate: roundedRate(arrivedReservations, confirmedLifecycle),
    noShowRate: roundedRate(statusCounts.no_show, confirmedLifecycle),
    cancellationRate: roundedRate(closedNegativeReservations, totalReservations),
    statusCounts,
    deposit: {
      requiredCount: depositRequiredCount,
      paidCount: depositPaidCount,
      waitingConfirmCount: depositWaitingConfirmCount,
      requiredAmount: depositRequiredAmount,
      paidAmount: depositPaidAmount,
      paidRate: roundedRate(depositPaidCount, depositRequiredCount)
    },
    leadTime: {
      averageHours: roundedOneDecimal(totalLeadHours / leadTimeCount),
      sameDayRate: roundedRate(sameDayCount, totalReservations)
    },
    capacity: {
      assignedReservations,
      averageUnusedSeats: roundedOneDecimal(totalUnusedSeats / assignedReservations),
      tightFitRate: roundedRate(tightFitCount, assignedReservations)
    },
    peakHours: topReservationAnalyticsGroups(hourGroups, 3),
    topAreas: topReservationAnalyticsGroups(areaGroups, 3)
  };
}
