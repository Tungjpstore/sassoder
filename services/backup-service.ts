import "server-only";

import { backupRpoRisk, type BackupRpoRisk } from "@/lib/backup-health";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type BackupJobStatus = "queued" | "running" | "success" | "warn" | "failed" | "cancelled";
type BackupRetentionClass = "daily" | "weekly" | "monthly" | "manual";

type BackupJobRow = {
  id: string;
  environment: string;
  backup_type: string;
  retention_class: BackupRetentionClass;
  status: BackupJobStatus;
  trigger_source: string;
  triggered_by: string;
  storage_provider: string;
  storage_bucket: string | null;
  storage_prefix: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  file_size: number | null;
  artifact_count: number | null;
  encrypted: boolean;
  checksum_status: string;
  verify_status: string;
  retention_applied: boolean;
  retry_count: number;
  error_step: string | null;
  error_message: string | null;
  summary: unknown;
  metadata: unknown;
  created_at: string;
};

type BackupArtifactRow = {
  id: string;
  job_id: string;
  artifact_type: string;
  status: string;
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  checksum_sha256: string | null;
  metadata_signature: string | null;
  encrypted: boolean;
  created_at: string;
};

type BackupAlertRow = {
  id: string;
  job_id: string | null;
  alert_type: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "acknowledged" | "resolved";
  title: string;
  message: string;
  rpo_risk: BackupRpoRisk;
  created_at: string;
};

type BackupRestoreTestRow = {
  id: string;
  job_id: string | null;
  environment: string;
  status: string;
  source_storage_path: string | null;
  target_database: string | null;
  schema_verified: boolean;
  row_count_verified: boolean;
  critical_tables_verified: boolean;
  error_message: string | null;
  created_at: string;
};

type BackupSettingRow = {
  key: string;
  value: unknown;
  updated_at: string;
  updated_by: string;
};

export type BackupHealth = {
  schemaReady: boolean;
  generatedAt: string;
  environment: string;
  latestStatus: BackupJobStatus | "missing";
  rpoRisk: BackupRpoRisk;
  ageHours: number | null;
  lastSuccessfulBackup: ReturnType<typeof mapJob> | null;
  latestJob: ReturnType<typeof mapJob> | null;
  history: ReturnType<typeof mapJob>[];
  artifacts: ReturnType<typeof mapArtifact>[];
  openAlerts: ReturnType<typeof mapAlert>[];
  restoreTests: ReturnType<typeof mapRestoreTest>[];
  retention: {
    daily: number;
    weekly: number;
    monthly: number;
    manual: number;
    timezone: string;
    storageProvider: string;
  };
  storageUsageBytes: number;
  warnings: string[];
};

function isMissingBackupSchemaError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.message?.includes("Could not find") ||
    error.message?.includes("does not exist") ||
    /backup_(jobs|artifacts|alerts|restore_tests|settings|events)/i.test(error.message ?? "")
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function hoursSince(value: string | null | undefined, now = Date.now()) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.round(Math.max(0, now - timestamp) / 36_000) / 100;
}

function mapJob(job: BackupJobRow) {
  return {
    id: job.id,
    environment: job.environment,
    backupType: job.backup_type,
    retentionClass: job.retention_class,
    status: job.status,
    triggerSource: job.trigger_source,
    triggeredBy: job.triggered_by,
    storageProvider: job.storage_provider,
    storageBucket: job.storage_bucket,
    storagePrefix: job.storage_prefix,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    durationMs: job.duration_ms ?? 0,
    fileSize: Number(job.file_size ?? 0),
    artifactCount: job.artifact_count ?? 0,
    encrypted: job.encrypted,
    checksumStatus: job.checksum_status,
    verifyStatus: job.verify_status,
    retentionApplied: job.retention_applied,
    retryCount: job.retry_count,
    errorStep: job.error_step,
    errorMessage: job.error_message,
    summary: asRecord(job.summary),
    metadata: asRecord(job.metadata),
    createdAt: job.created_at
  };
}

function mapArtifact(artifact: BackupArtifactRow) {
  return {
    id: artifact.id,
    jobId: artifact.job_id,
    artifactType: artifact.artifact_type,
    status: artifact.status,
    storageBucket: artifact.storage_bucket,
    storagePath: artifact.storage_path,
    fileName: artifact.file_name,
    fileSize: Number(artifact.file_size ?? 0),
    checksumSha256: artifact.checksum_sha256,
    metadataSignature: artifact.metadata_signature,
    encrypted: artifact.encrypted,
    createdAt: artifact.created_at
  };
}

function mapAlert(alert: BackupAlertRow) {
  return {
    id: alert.id,
    jobId: alert.job_id,
    alertType: alert.alert_type,
    severity: alert.severity,
    status: alert.status,
    title: alert.title,
    message: alert.message,
    rpoRisk: alert.rpo_risk,
    createdAt: alert.created_at
  };
}

function mapRestoreTest(test: BackupRestoreTestRow) {
  return {
    id: test.id,
    jobId: test.job_id,
    environment: test.environment,
    status: test.status,
    sourceStoragePath: test.source_storage_path,
    targetDatabase: test.target_database,
    schemaVerified: test.schema_verified,
    rowCountVerified: test.row_count_verified,
    criticalTablesVerified: test.critical_tables_verified,
    errorMessage: test.error_message,
    createdAt: test.created_at
  };
}

function isBackupDataJob(job: ReturnType<typeof mapJob>) {
  if (job.backupType === "restore_test" || job.triggerSource === "restore_test") return false;
  if (job.status === "success" || job.status === "warn") return isCompletedDataBackupJob(job);
  return true;
}

function isCompletedDataBackupJob(job: ReturnType<typeof mapJob>) {
  if (job.backupType === "restore_test" || job.triggerSource === "restore_test") return false;
  return job.artifactCount > 0 || job.fileSize > 0;
}

function normalizeRetention(settings: BackupSettingRow[]) {
  const retention = settings.find((row) => row.key === "retention_policy");
  const value = asRecord(retention?.value);
  return {
    daily: Number(value.daily ?? process.env.BACKUP_RETENTION_DAILY ?? 7),
    weekly: Number(value.weekly ?? process.env.BACKUP_RETENTION_WEEKLY ?? 8),
    monthly: Number(value.monthly ?? process.env.BACKUP_RETENTION_MONTHLY ?? 12),
    manual: Number(value.manual ?? process.env.BACKUP_RETENTION_MANUAL ?? 14),
    timezone: String(value.timezone ?? process.env.BACKUP_TIMEZONE ?? "Asia/Ho_Chi_Minh"),
    storageProvider: String(value.storageProvider ?? "cloudflare-r2")
  };
}

function emptyBackupHealth(warnings: string[] = []): BackupHealth {
  return {
    schemaReady: false,
    generatedAt: new Date().toISOString(),
    environment: process.env.BACKUP_ENVIRONMENT || process.env.LOGIVN_ENV || "prod",
    latestStatus: "missing",
    rpoRisk: "high",
    ageHours: null,
    lastSuccessfulBackup: null,
    latestJob: null,
    history: [],
    artifacts: [],
    openAlerts: [],
    restoreTests: [],
    retention: normalizeRetention([]),
    storageUsageBytes: 0,
    warnings: warnings.length ? warnings : ["Cần chạy migration backup_dr_foundation trước khi đọc backup health."]
  };
}

export async function getBackupHealth(): Promise<BackupHealth> {
  const supabase = createAdminSupabaseClient() as any;
  const warnings: string[] = [];
  const environment = process.env.BACKUP_ENVIRONMENT || process.env.LOGIVN_ENV || "prod";

  const [jobsResult, latestSuccessResult, alertsResult, restoreTestsResult, settingsResult] = await Promise.all([
    supabase
      .from("backup_jobs")
      .select("id,environment,backup_type,retention_class,status,trigger_source,triggered_by,storage_provider,storage_bucket,storage_prefix,started_at,finished_at,duration_ms,file_size,artifact_count,encrypted,checksum_status,verify_status,retention_applied,retry_count,error_step,error_message,summary,metadata,created_at")
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("backup_jobs")
      .select("id,environment,backup_type,retention_class,status,trigger_source,triggered_by,storage_provider,storage_bucket,storage_prefix,started_at,finished_at,duration_ms,file_size,artifact_count,encrypted,checksum_status,verify_status,retention_applied,retry_count,error_step,error_message,summary,metadata,created_at")
      .eq("environment", environment)
      .in("status", ["success", "warn"])
      .order("finished_at", { ascending: false })
      .limit(20),
    supabase
      .from("backup_alerts")
      .select("id,job_id,alert_type,severity,status,title,message,rpo_risk,created_at")
      .in("status", ["open", "acknowledged"])
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("backup_restore_tests")
      .select("id,job_id,environment,status,source_storage_path,target_database,schema_verified,row_count_verified,critical_tables_verified,error_message,created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("backup_settings").select("key,value,updated_at,updated_by")
  ]);

  const schemaError = [jobsResult.error, latestSuccessResult.error, alertsResult.error, restoreTestsResult.error, settingsResult.error].find(isMissingBackupSchemaError);
  if (schemaError) return emptyBackupHealth();

  const hardError = jobsResult.error || latestSuccessResult.error || alertsResult.error || restoreTestsResult.error || settingsResult.error;
  if (hardError) throw hardError;

  const jobs = ((jobsResult.data ?? []) as BackupJobRow[]).map(mapJob);
  const latestJob = jobs.find(isBackupDataJob) ?? null;
  const lastSuccessfulBackup = ((latestSuccessResult.data ?? []) as BackupJobRow[])
    .map(mapJob)
    .find(isCompletedDataBackupJob) ?? null;
  const ageHours = hoursSince(lastSuccessfulBackup?.finishedAt ?? lastSuccessfulBackup?.startedAt);
  const openAlerts = ((alertsResult.data ?? []) as BackupAlertRow[]).map(mapAlert);
  const criticalAlerts = openAlerts.filter((alert) => alert.severity === "critical").length;
  const latestStatus = latestJob?.status ?? "missing";
  const artifactJobId = lastSuccessfulBackup?.id ?? latestJob?.id;
  let artifacts: ReturnType<typeof mapArtifact>[] = [];

  if (artifactJobId) {
    const { data, error } = await supabase
      .from("backup_artifacts")
      .select("id,job_id,artifact_type,status,storage_bucket,storage_path,file_name,file_size,checksum_sha256,metadata_signature,encrypted,created_at")
      .eq("job_id", artifactJobId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      if (isMissingBackupSchemaError(error)) warnings.push("Cần chạy migration backup_artifacts.");
      else throw error;
    } else {
      artifacts = ((data ?? []) as BackupArtifactRow[]).map(mapArtifact);
    }
  }

  const storageUsageBytes = jobs.reduce((sum, job) => sum + Number(job.fileSize ?? 0), 0);

  return {
    schemaReady: true,
    generatedAt: new Date().toISOString(),
    environment,
    latestStatus,
    rpoRisk: backupRpoRisk({ ageHours, latestStatus, openCriticalAlerts: criticalAlerts }),
    ageHours,
    lastSuccessfulBackup,
    latestJob,
    history: jobs,
    artifacts,
    openAlerts,
    restoreTests: ((restoreTestsResult.data ?? []) as BackupRestoreTestRow[]).map(mapRestoreTest),
    retention: normalizeRetention((settingsResult.data ?? []) as BackupSettingRow[]),
    storageUsageBytes,
    warnings
  };
}

export async function requestManualBackup(input: {
  actor: string;
  reason?: string | null;
  retentionClass?: BackupRetentionClass;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const environment = process.env.BACKUP_ENVIRONMENT || process.env.LOGIVN_ENV || "prod";
  const retentionClass = input.retentionClass ?? "manual";
  const reason = input.reason?.trim() || "manual backup requested";
  const { data, error } = await supabase
    .from("backup_jobs")
    .insert({
      environment,
      backup_type: "full",
      retention_class: retentionClass,
      status: "queued",
      trigger_source: "manual",
      triggered_by: input.actor,
      storage_provider: "cloudflare-r2",
      storage_bucket: process.env.R2_BUCKET || "logivn-backups",
      storage_prefix: `${process.env.BACKUP_R2_PREFIX || "logivn"}/${environment}`,
      encrypted: true,
      checksum_status: "pending",
      verify_status: "pending",
      summary: { reason },
      metadata: {
        source: "admin.logivn.com",
        queuedAt: new Date().toISOString(),
        executor: "infra/vps/scripts/backup.sh --claim-manual"
      }
    })
    .select("id,environment,retention_class,status,created_at")
    .maybeSingle();

  if (error) {
    if (isMissingBackupSchemaError(error)) throw new AppError("Cần chạy migration backup_dr_foundation trước khi trigger backup.", 409);
    throw error;
  }

  await supabase.from("backup_events").insert({
    job_id: data.id,
    event_type: "manual_backup_queued",
    severity: "info",
    step: "manual_trigger",
    message: reason,
    metadata: { actor: input.actor, source: "admin.logivn.com" }
  }).then(({ error }: { error: { code?: string; message?: string } | null }) => {
    if (error && !isMissingBackupSchemaError(error)) throw error;
  });

  return {
    id: data.id as string,
    environment: data.environment as string,
    retentionClass: data.retention_class as BackupRetentionClass,
    status: data.status as BackupJobStatus,
    createdAt: data.created_at as string
  };
}

export function assertInternalBackupRequest(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const candidates = [process.env.LOGIVN_INTERNAL_API_KEY, process.env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter(Boolean) as string[];

  if (!candidates.length) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
      throw new AppError("Thiếu LOGIVN_INTERNAL_API_KEY hoặc CRON_SECRET cho backup API.", 500);
    }
    return;
  }

  if (!candidates.some((secret) => authHeader === `Bearer ${secret}`)) {
    throw new AppError("Không có quyền truy cập backup API.", 401);
  }
}
