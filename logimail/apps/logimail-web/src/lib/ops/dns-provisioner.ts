import { createHash } from 'node:crypto';

import { writeAuditLog } from '@/lib/audit-log';
import {
  diffDnsPlan,
  enforceProxyPolicy,
  isMailTransportRecord,
  recordSlot,
  recordValueKey,
  type DnsPlanDiff,
  type DnsRecord,
  typedDnsChanges,
} from '@/lib/ops/dns-plan';
import { inspectDnsPolicy, type DnsPolicyFinding } from '@/lib/ops/dns-policy';

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

export type CloudflareZone = {
  id: string;
  name: string;
  status?: string;
};

export type DnsRollbackAction = {
  action: 'delete_created' | 'restore_updated';
  recordId: string;
  record: DnsRecord;
};

export type DnsPlanPreview = {
  zone: CloudflareZone;
  status: 'ready' | 'needs_confirmation' | 'blocked';
  digest: string;
  generatedAt: string;
  planned: DnsRecord[];
  existingRelevant: DnsRecord[];
  diff: DnsPlanDiff;
  changes: ReturnType<typeof typedDnsChanges>;
  findings: DnsPolicyFinding[];
  blockers: DnsPolicyFinding[];
  rollbackPreview: DnsRollbackAction[];
};

export type ProvisionResult = {
  status: 'applied' | 'already_applied' | 'needs_confirmation' | 'blocked' | 'failed';
  previewDigest: string;
  applied: DnsRecord[];
  created: DnsRecord[];
  updated: Array<{ planned: DnsRecord; existing: DnsRecord }>;
  skipped: DnsRecord[];
  needsConfirmation: Array<{ planned: DnsRecord; existing: DnsRecord }>;
  duplicates: DnsRecord[];
  findings: DnsPolicyFinding[];
  rollback: DnsRollbackAction[];
  failed: Array<{ action: 'create' | 'update'; record: DnsRecord; existing?: DnsRecord; reason: string }>;
};

type CloudflareEnvelope<T> = {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: T;
  result_info?: { page?: number; total_pages?: number };
};

function config() {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) throw new Error('cloudflare_not_configured');
  return { token };
}

async function cfFetchEnvelope<T>(path: string, token: string, init?: RequestInit): Promise<CloudflareEnvelope<T>> {
  const response = await fetch(`${CLOUDFLARE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as CloudflareEnvelope<T>;
  if (!response.ok || body.success === false) {
    const message = body.errors?.map((error) => error.message).filter(Boolean).join('; ') || `cloudflare_http_${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function cfFetch<T>(path: string, token: string, init?: RequestInit): Promise<T | undefined> {
  return (await cfFetchEnvelope<T>(path, token, init)).result;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

function zoneCoversDomain(zoneName: string, domain: string) {
  const zone = normalizeName(zoneName);
  const target = normalizeName(domain);
  return target === zone || target.endsWith(`.${zone}`);
}

function assertRecordScope(record: DnsRecord, targetDomain: string, zoneName: string) {
  const name = normalizeName(record.name);
  if (!zoneCoversDomain(zoneName, name)) throw new Error('dns_record_outside_zone');
  if (!zoneCoversDomain(targetDomain, name)) throw new Error('dns_record_outside_domain');
}

async function getZone(zoneId: string, token: string): Promise<CloudflareZone> {
  const zone = await cfFetch<CloudflareZone>(`/zones/${encodeURIComponent(zoneId)}`, token);
  if (!zone?.id || !zone.name) throw new Error('cloudflare_zone_not_found');
  return zone;
}

async function findZoneByName(name: string, token: string): Promise<CloudflareZone | null> {
  const result = await cfFetch<CloudflareZone[]>(
    `/zones?name=${encodeURIComponent(name)}&status=active&match=all&per_page=20`,
    token,
  );
  return (result ?? []).find((zone) => normalizeName(zone.name) === normalizeName(name)) ?? null;
}

/** Resolve the authoritative Cloudflare zone for each domain instead of using one global zone. */
export async function resolveCloudflareZone(input: { targetDomain: string; preferredZoneId?: string | null }): Promise<CloudflareZone> {
  const { token } = config();
  const targetDomain = normalizeName(input.targetDomain);
  const preferred = input.preferredZoneId?.trim() || '';

  if (preferred) {
    const zone = await getZone(preferred, token);
    if (zoneCoversDomain(zone.name, targetDomain)) return zone;
    throw new Error('cloudflare_zone_domain_mismatch');
  }

  const fallbackZoneId = process.env.CLOUDFLARE_ZONE_ID?.trim() || '';
  if (fallbackZoneId) {
    try {
      const fallback = await getZone(fallbackZoneId, token);
      if (zoneCoversDomain(fallback.name, targetDomain)) return fallback;
    } catch {
      // A stale single-zone fallback must not block discovery for other domains.
    }
  }

  const labels = targetDomain.split('.');
  for (let index = 0; index <= labels.length - 2; index += 1) {
    const candidate = labels.slice(index).join('.');
    const zone = await findZoneByName(candidate, token);
    if (zone) return zone;
  }
  throw new Error('cloudflare_zone_not_found');
}

/** List every DNS record in a zone and preserve Cloudflare record IDs. */
export async function listZoneRecords(zoneId: string): Promise<DnsRecord[]> {
  const { token } = config();
  const records: DnsRecord[] = [];
  const perPage = 100;

  for (let page = 1; page <= 1_000; page += 1) {
    const envelope = await cfFetchEnvelope<Array<Required<Pick<DnsRecord, 'id' | 'type' | 'name' | 'content'>> & DnsRecord>>(
      `/zones/${zoneId}/dns_records?per_page=${perPage}&page=${page}`,
      token,
    );
    const pageRecords = envelope.result ?? [];
    records.push(...pageRecords.map((record) => ({
      id: record.id,
      type: record.type,
      name: record.name,
      content: record.content,
      priority: record.priority,
      proxied: record.proxied,
      ttl: record.ttl,
    })));

    const totalPages = envelope.result_info?.total_pages;
    if ((typeof totalPages === 'number' && page >= totalPages) || pageRecords.length < perPage) return records;
  }

  throw new Error('cloudflare_pagination_limit');
}

function previewDigest(zoneId: string, planned: DnsRecord[], existingRelevant: DnsRecord[]) {
  const canonical = {
    zoneId,
    planned: [...planned].sort((left, right) => recordValueKey(left).localeCompare(recordValueKey(right))),
    existing: [...existingRelevant].sort((left, right) => {
      const leftKey = `${left.id ?? ''}|${recordValueKey(left)}`;
      const rightKey = `${right.id ?? ''}|${recordValueKey(right)}`;
      return leftKey.localeCompare(rightKey);
    }),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function previewRollback(diff: DnsPlanDiff): DnsRollbackAction[] {
  return diff.toModify
    .filter((change) => Boolean(change.existing.id))
    .map((change) => ({ action: 'restore_updated' as const, recordId: change.existing.id!, record: change.existing }));
}

const APPLY_BLOCKER_CODES = new Set([
  'spf_multiple_records',
  'dmarc_multiple_records',
  'mta_sts_multiple_records',
]);

export async function previewDnsPlan(input: {
  planned: DnsRecord[];
  targetDomain: string;
  zoneId?: string | null;
}): Promise<DnsPlanPreview> {
  const targetDomain = normalizeName(input.targetDomain);
  const zone = await resolveCloudflareZone({ targetDomain, preferredZoneId: input.zoneId });
  const planned = input.planned.map(enforceProxyPolicy);
  for (const record of planned) assertRecordScope(record, targetDomain, zone.name);

  const existing = await listZoneRecords(zone.id);
  const diff = diffDnsPlan(planned, existing);
  const plannedSlots = new Set(planned.map(recordSlot));
  const existingRelevant = existing.filter((record) => plannedSlots.has(recordSlot(record)));
  const findings = inspectDnsPolicy(targetDomain, existing);
  const blockers = findings.filter((finding) => APPLY_BLOCKER_CODES.has(finding.code));
  if (diff.duplicates.length > 0 && !blockers.some((finding) => finding.code === 'dns_slot_conflict')) {
    blockers.push({
      code: 'dns_slot_conflict',
      severity: 'blocker',
      message: 'Một hoặc nhiều DNS slot có record dư. LogiMail sẽ không tự xóa record production.',
      recordIds: diff.duplicates.map((record) => record.id).filter((id): id is string => Boolean(id)),
    });
  }

  return {
    zone,
    status: blockers.length > 0 ? 'blocked' : diff.toModify.length > 0 ? 'needs_confirmation' : 'ready',
    digest: previewDigest(zone.id, planned, existingRelevant),
    generatedAt: new Date().toISOString(),
    planned,
    existingRelevant,
    diff,
    changes: typedDnsChanges(diff),
    findings,
    blockers,
    rollbackPreview: previewRollback(diff),
  };
}

function recordPayload(record: DnsRecord, existing?: DnsRecord) {
  const payload: Record<string, unknown> = { type: record.type, name: record.name, content: record.content };
  const type = record.type.toUpperCase();
  if (['A', 'AAAA', 'CNAME'].includes(type)) {
    payload.proxied = isMailTransportRecord(record) ? false : record.proxied ?? false;
  }
  if (type === 'MX') payload.priority = record.priority ?? 10;
  const ttl = record.ttl ?? existing?.ttl;
  if (typeof ttl === 'number') payload.ttl = ttl;
  return payload;
}

async function createZoneRecord(zoneId: string, token: string, record: DnsRecord) {
  const created = await cfFetch<DnsRecord>(`/zones/${zoneId}/dns_records`, token, {
    method: 'POST',
    body: JSON.stringify(recordPayload(record)),
  });
  return created ? { ...record, ...created } : record;
}

async function updateZoneRecord(zoneId: string, token: string, planned: DnsRecord, existing: DnsRecord) {
  if (!existing.id) throw new Error('cloudflare_record_id_missing');
  const updated = await cfFetch<DnsRecord>(`/zones/${zoneId}/dns_records/${existing.id}`, token, {
    method: 'PUT',
    body: JSON.stringify(recordPayload(planned, existing)),
  });
  return updated ? { ...planned, ...updated } : { ...planned, id: existing.id };
}

function auditRecord(record: DnsRecord) {
  return {
    id: record.id ?? null,
    type: record.type,
    name: record.name,
    content: record.content,
    priority: record.priority ?? null,
    proxied: record.proxied ?? null,
    ttl: record.ttl ?? null,
  };
}

function resultFromPreview(preview: DnsPlanPreview): ProvisionResult {
  return {
    status: preview.status === 'blocked' ? 'blocked' : 'applied',
    previewDigest: preview.digest,
    applied: [],
    created: [],
    updated: [],
    skipped: preview.diff.alreadyAppliedExisting.map(({ existing }) => existing),
    needsConfirmation: [],
    duplicates: [...preview.diff.duplicates],
    findings: preview.findings,
    rollback: [],
    failed: [],
  };
}

function auditMetadata(input: { zone: CloudflareZone; targetDomain: string; planned: DnsRecord[]; result: ProvisionResult }) {
  return {
    zone: input.zone,
    targetDomain: input.targetDomain,
    previewDigest: input.result.previewDigest,
    status: input.result.status,
    planned: input.planned.map(auditRecord),
    created: input.result.created.map(auditRecord),
    updated: input.result.updated.map((change) => ({ planned: auditRecord(change.planned), existing: auditRecord(change.existing) })),
    skipped: input.result.skipped.map(auditRecord),
    needsConfirmation: input.result.needsConfirmation.map((change) => ({ planned: auditRecord(change.planned), existing: auditRecord(change.existing) })),
    duplicates: input.result.duplicates.map(auditRecord),
    findings: input.result.findings,
    rollback: input.result.rollback.map((action) => ({ ...action, record: auditRecord(action.record) })),
    failed: input.result.failed.map((failure) => ({
      action: failure.action,
      record: auditRecord(failure.record),
      existing: failure.existing ? auditRecord(failure.existing) : null,
      reason: failure.reason,
    })),
  };
}

/** Apply only a server-generated, freshly previewed DNS plan. */
export async function provisionDnsPlan(input: {
  zoneId?: string | null;
  planned: DnsRecord[];
  targetDomain?: string;
  expectedPreviewDigest?: string | null;
  allowModify?: boolean;
  actor: string;
  actorId?: string | null;
  workspaceId?: string | null;
  domainId?: string | null;
  beforeApply?: (preview: DnsPlanPreview) => Promise<void>;
}): Promise<ProvisionResult> {
  const targetDomain = normalizeName(input.targetDomain ?? input.planned[0]?.name ?? '');
  if (!targetDomain) throw new Error('target_domain_required');
  const preview = await previewDnsPlan({ planned: input.planned, targetDomain, zoneId: input.zoneId });
  const result = resultFromPreview(preview);

  if (input.expectedPreviewDigest && input.expectedPreviewDigest !== preview.digest) throw new Error('dns_preview_stale');
  if ((preview.diff.toCreate.length > 0 || preview.diff.toModify.length > 0) && !input.expectedPreviewDigest) {
    throw new Error('preview_required');
  }
  if (preview.status === 'blocked') {
    await writeAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? input.actor,
      action: 'logimail.dns_provision_blocked',
      targetType: input.domainId ? 'domain' : 'zone',
      targetId: input.domainId ?? preview.zone.id,
      metadata: auditMetadata({ zone: preview.zone, targetDomain, planned: preview.planned, result }),
    });
    return result;
  }

  if (preview.diff.toModify.length > 0 && (!input.allowModify || !input.expectedPreviewDigest)) {
    result.status = 'needs_confirmation';
    result.needsConfirmation = preview.diff.toModify;
    await writeAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? input.actor,
      action: 'logimail.dns_provision_confirmation_required',
      targetType: input.domainId ? 'domain' : 'zone',
      targetId: input.domainId ?? preview.zone.id,
      metadata: auditMetadata({ zone: preview.zone, targetDomain, planned: preview.planned, result }),
    });
    return result;
  }

  if (input.beforeApply && (preview.diff.toCreate.length > 0 || preview.diff.toModify.length > 0)) {
    await input.beforeApply(preview);
  }

  const { token } = config();
  for (const change of preview.diff.toModify) {
    try {
      const updated = await updateZoneRecord(preview.zone.id, token, change.planned, change.existing);
      result.applied.push(updated);
      result.updated.push({ planned: updated, existing: change.existing });
      if (change.existing.id) result.rollback.unshift({ action: 'restore_updated', recordId: change.existing.id, record: change.existing });
    } catch (error) {
      result.failed.push({ action: 'update', record: change.planned, existing: change.existing, reason: error instanceof Error ? error.message : 'unknown' });
      result.status = 'failed';
      break;
    }
  }

  if (result.status !== 'failed') {
    for (const record of preview.diff.toCreate) {
      try {
        const created = await createZoneRecord(preview.zone.id, token, record);
        result.applied.push(created);
        result.created.push(created);
        if (created.id) result.rollback.unshift({ action: 'delete_created', recordId: created.id, record: created });
      } catch (error) {
        result.failed.push({ action: 'create', record, reason: error instanceof Error ? error.message : 'unknown' });
        result.status = 'failed';
        break;
      }
    }
  }

  if (result.status !== 'failed' && result.applied.length === 0) result.status = 'already_applied';
  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? input.actor,
    action: result.status === 'failed' ? 'logimail.dns_provision_failed' : 'logimail.dns_provisioned',
    targetType: input.domainId ? 'domain' : 'zone',
    targetId: input.domainId ?? preview.zone.id,
    metadata: auditMetadata({ zone: preview.zone, targetDomain, planned: preview.planned, result }),
  });
  return result;
}

export function dnsProvisionerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'dns_provisioner_error');
  if (message === 'cloudflare_not_configured') return { status: 503, text: 'Chưa cấu hình CLOUDFLARE_API_TOKEN.' };
  if (message === 'cloudflare_zone_not_found') return { status: 404, text: 'Không tìm thấy Cloudflare zone phù hợp với domain.' };
  if (message === 'cloudflare_zone_domain_mismatch') return { status: 409, text: 'Cloudflare zone đã chọn không quản lý target domain.' };
  if (message === 'dns_preview_stale') return { status: 409, text: 'DNS đã thay đổi sau lần preview. Hãy tải preview mới trước khi xác nhận.' };
  if (message === 'preview_required') return { status: 409, text: 'Hãy tải preview mới trước khi áp dụng DNS.' };
  if (message === 'dns_record_outside_zone' || message === 'dns_record_outside_domain') return { status: 409, text: 'DNS plan chứa record nằm ngoài phạm vi domain/zone.' };
  if (message === 'target_domain_required') return { status: 400, text: 'Thiếu target domain cho DNS plan.' };
  return { status: 502, text: message };
}
