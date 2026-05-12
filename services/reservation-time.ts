export function roundUpToSlotBoundary(date: Date, intervalMinutes = 30) {
  const intervalMs = intervalMinutes * 60_000;
  return new Date(Math.ceil(date.getTime() / intervalMs) * intervalMs);
}
