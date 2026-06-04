export type BackupRpoRisk = "low" | "medium" | "high";

export function backupRpoRisk(input: { ageHours: number | null; latestStatus?: string | null; openCriticalAlerts?: number }) {
  if (input.openCriticalAlerts && input.openCriticalAlerts > 0) return "high" as BackupRpoRisk;
  if (!Number.isFinite(input.ageHours ?? NaN)) return "high" as BackupRpoRisk;
  if (input.latestStatus === "failed") return "high" as BackupRpoRisk;
  if ((input.ageHours ?? 999) > 36) return "high" as BackupRpoRisk;
  if ((input.ageHours ?? 999) > 26) return "medium" as BackupRpoRisk;
  return "low" as BackupRpoRisk;
}
