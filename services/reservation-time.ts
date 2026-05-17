export function roundUpToSlotBoundary(date: Date, intervalMinutes = 30) {
  const intervalMs = intervalMinutes * 60_000;
  return new Date(Math.ceil(date.getTime() / intervalMs) * intervalMs);
}

export function reservationNoShowAvailableAt(startsAt: Date | string, graceMinutes: number) {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  const safeGraceMinutes = Number.isFinite(graceMinutes) ? Math.max(0, graceMinutes) : 0;
  return new Date(start.getTime() + safeGraceMinutes * 60_000);
}

export function isReservationPastNoShowGrace(startsAt: Date | string, graceMinutes: number, now = new Date()) {
  return reservationNoShowAvailableAt(startsAt, graceMinutes).getTime() <= now.getTime();
}
