import 'server-only';

import { writeAuditLog } from '@/lib/audit-log';
import {
  diffDnsPlan,
  enforceProxyPolicy,
  isMailTransportRecord,
  type DnsRecord,
} from '@/lib/ops/dns-plan';

// DNS_Provisioner (Requirement 12, 21): apply a planned record set to a Cloudflare
// zone idempotently within Zone:Read + DNS:Edit scope.

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

export type ProvisionResult = {
  status: 'applied' | 'already_applied' | 'needs_confirmation' | 'failed';
  applied: DnsRecord[];
  skipped: DnsRecord[];
  needsConfirmation: Array<{ planned: DnsRecord; existing: DnsRecord }>;
  failed: Array<{ record: DnsRecord; reason: string }>;
};

function config() {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) throw new Error('cloudflare_not_configured');
  return { token };
}

async function cfFetch(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`${CLOUDFLARE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as { success?: boolean; errors?: Array<{ message?: string }>; result?: unknown };
  if (!response.ok || body.success === false) {
    const message = body.errors?.map((error) => error.message).filter(Boolean).join('; ') || `cloudflare_http_${response.status}`;
    throw new Error(message);
  }
  return body.result;
}

/** List existing DNS records in the zone (Zone:Read). */
export async function listZoneRecords(zoneId: string): Promise<DnsRecord[]> {
  const { token } = config();
  const result = (await cfFetch(`/zones/${zoneId}/dns_records?per_page=100`, token)) as Array<{
    type: string;
    name: string;
    content: string;
    priority?: number;
    proxied?: boolean;
  }>;
  return (result ?? []).map((record) => ({ type: record.type, name: record.name, content: record.content, priority: record.priority, proxied: record.proxied }));
}

async function createZoneRecord(zoneId: string, token: string, record: DnsRecord) {
  const payload: Record<string, unknown> = {
    type: record.type,
    name: record.name,
    content: record.content,
    proxied: isMailTransportRecord(record) ? false : record.proxied ?? false, // R12.4
  };
  if (record.type.toUpperCase() === 'MX') payload.priority = record.priority ?? 10;
  await cfFetch(`/zones/${zoneId}/dns_records`, token, { method: 'POST', body: JSON.stringify(payload) });
}

/**
 * Apply a DNS plan to a Cloudflare zone idempotently (R12.2, R21.2–21.5):
 *  - create only records whose slot is empty,
 *  - skip records that already match (re-run -> `already_applied`),
 *  - require confirmation for records that would modify existing content,
 *  - stop on the first Cloudflare error and report applied/skipped/failed.
 */
export async function provisionDnsPlan(input: {
  zoneId: string;
  planned: DnsRecord[];
  allowModify?: boolean;
  actor: string;
  actorId?: string | null;
}): Promise<ProvisionResult> {
  const { token } = config();
  const planned = input.planned.map(enforceProxyPolicy);
  const existing = await listZoneRecords(input.zoneId);
  const diff = diffDnsPlan(planned, existing);

  const result: ProvisionResult = {
    status: 'applied',
    applied: [],
    skipped: [...diff.alreadyApplied],
    needsConfirmation: [],
    failed: [],
  };

  // Modifications require explicit confirmation unless allowed (R12.3).
  if (diff.toModify.length > 0 && !input.allowModify) {
    result.needsConfirmation = diff.toModify;
    result.status = 'needs_confirmation';
    return result;
  }

  for (const record of diff.toCreate) {
    try {
      await createZoneRecord(input.zoneId, token, record);
      result.applied.push(record);
    } catch (error) {
      // Stop the plan and report what was applied vs not (R12.5).
      result.failed.push({ record, reason: error instanceof Error ? error.message : 'unknown' });
      result.status = 'failed';
      await writeAuditLog({
        actorId: input.actorId ?? input.actor,
        action: 'logimail.dns_provision_failed',
        targetType: 'zone',
        targetId: input.zoneId,
        metadata: { applied: result.applied.length, skipped: result.skipped.length, failedRecord: record, reason: result.failed[0].reason },
      });
      return result;
    }
  }

  if (result.applied.length === 0 && diff.toModify.length === 0) {
    result.status = 'already_applied'; // nothing to do on re-run (R21.4)
  }

  await writeAuditLog({
    actorId: input.actorId ?? input.actor,
    action: 'logimail.dns_provisioned',
    targetType: 'zone',
    targetId: input.zoneId,
    metadata: { status: result.status, applied: result.applied.length, skipped: result.skipped.length },
  });

  return result;
}

export function dnsProvisionerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'dns_provisioner_error');
  if (message === 'cloudflare_not_configured') return { status: 503, text: 'Chưa cấu hình CLOUDFLARE_API_TOKEN.' };
  return { status: 502, text: message };
}
