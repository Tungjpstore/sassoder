// Pure DNS provisioning-plan diff logic (Requirement 12, 21 / Property 4).
// No imports so Provisioning_Idempotency can be property-tested directly.

export type DnsRecord = {
  id?: string;
  type: string;
  name: string;
  content: string;
  priority?: number;
  proxied?: boolean;
  ttl?: number;
};

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

function txtFamily(content: string) {
  const value = norm(content);
  if (value.startsWith('v=spf1')) return 'spf';
  if (value.startsWith('v=dmarc1')) return 'dmarc';
  if (value.startsWith('v=dkim1')) return 'dkim';
  if (value.startsWith('v=stsv1')) return 'mta-sts';
  if (value.startsWith('v=tlsrptv1')) return 'tls-rpt';
  if (value.startsWith('v=bimi1')) return 'bimi';
  if (value.startsWith('logimail-verification=')) return 'logimail-ownership';
  // Generic TXT values may coexist at the same owner name and are only the
  // same slot when their complete value is identical.
  return `value:${value}`;
}

/** Identity key: record type + owner + protocol-specific identity. */
export function recordSlot(record: DnsRecord): string {
  const base = `${record.type.toUpperCase()}|${norm(record.name)}`;
  const type = record.type.toUpperCase();
  if (type === 'MX') return `${base}|${record.priority ?? 0}`;
  if (type === 'TXT') return `${base}|${txtFamily(record.content)}`;
  return base;
}

/** Full value key: slot + content (+ proxy state where Cloudflare supports it). */
export function recordValueKey(record: DnsRecord): string {
  const type = record.type.toUpperCase();
  const proxyValue = ['A', 'AAAA', 'CNAME'].includes(type) && typeof record.proxied === 'boolean'
    ? `|proxied:${record.proxied}`
    : '';
  return `${recordSlot(record)}|${norm(record.content)}${proxyValue}`;
}

export type DnsPlanDiff = {
  toCreate: DnsRecord[]; // no record in this slot exists yet
  alreadyApplied: DnsRecord[]; // identical record already present
  alreadyAppliedExisting: Array<{ planned: DnsRecord; existing: DnsRecord }>;
  toModify: Array<{ planned: DnsRecord; existing: DnsRecord }>; // slot exists with different content
  duplicates: DnsRecord[]; // additional existing records in a planned slot
};

export type DnsPlanChange = {
  action: 'create' | 'update' | 'delete' | 'noop';
  before: DnsRecord | null;
  after: DnsRecord | null;
};

/**
 * Diff a planned record set against the existing zone records (R21.2):
 *  - create only records whose slot has no existing record (idempotent),
 *  - treat identical records as already-applied,
 *  - flag slots that exist with different content for confirmation (R12.3).
 */
export function diffDnsPlan(planned: DnsRecord[], existing: DnsRecord[]): DnsPlanDiff {
  const existingBySlot = new Map<string, Array<{ record: DnsRecord; index: number }>>();
  for (const [index, record] of existing.entries()) {
    const slot = recordSlot(record);
    const records = existingBySlot.get(slot) ?? [];
    records.push({ record, index });
    existingBySlot.set(slot, records);
  }

  const consumed = new Set<number>();
  const plannedSlots = new Set(planned.map(recordSlot));
  const diff: DnsPlanDiff = { toCreate: [], alreadyApplied: [], alreadyAppliedExisting: [], toModify: [], duplicates: [] };
  for (const record of planned) {
    const candidates = existingBySlot.get(recordSlot(record)) ?? [];
    const identical = candidates.find(({ record: candidate, index }) => (
      !consumed.has(index) && recordValueKey(candidate) === recordValueKey(record)
    ));
    if (identical) {
      consumed.add(identical.index);
      diff.alreadyApplied.push(record);
      diff.alreadyAppliedExisting.push({ planned: record, existing: identical.record });
      continue;
    }

    const modifiable = candidates.find(({ index }) => !consumed.has(index));
    if (modifiable) {
      consumed.add(modifiable.index);
      diff.toModify.push({ planned: record, existing: modifiable.record });
    } else {
      diff.toCreate.push(record);
    }
  }

  for (const [index, record] of existing.entries()) {
    if (plannedSlots.has(recordSlot(record)) && !consumed.has(index)) {
      diff.duplicates.push(record);
    }
  }

  return diff;
}

/** Convert the slot diff into a complete, renderable change list. */
export function typedDnsChanges(diff: DnsPlanDiff): DnsPlanChange[] {
  return [
    ...diff.toCreate.map((record) => ({ action: 'create' as const, before: null, after: record })),
    ...diff.toModify.map(({ planned, existing }) => ({
      action: 'update' as const,
      before: existing,
      after: {
        ...planned,
        id: existing.id,
        ttl: planned.ttl ?? existing.ttl,
        proxied: planned.proxied ?? existing.proxied,
        priority: planned.priority ?? existing.priority,
      },
    })),
    // Duplicates remain blocked from automatic deletion, but the preview must
    // still disclose the delete candidate instead of hiding it as a conflict.
    ...diff.duplicates.map((record) => ({ action: 'delete' as const, before: record, after: null })),
    ...diff.alreadyAppliedExisting.map(({ existing }) => ({ action: 'noop' as const, before: existing, after: existing })),
  ];
}

/** Mail transport hosts must never be proxied through Cloudflare (R12.4). */
export function isMailTransportRecord(record: DnsRecord): boolean {
  return record.type.toUpperCase() === 'MX' || record.type.toUpperCase() === 'A';
}

export function enforceProxyPolicy(record: DnsRecord): DnsRecord {
  return isMailTransportRecord(record) ? { ...record, proxied: false } : record;
}
