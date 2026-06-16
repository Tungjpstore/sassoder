// Pure DNS provisioning-plan diff logic (Requirement 12, 21 / Property 4).
// No imports so Provisioning_Idempotency can be property-tested directly.

export type DnsRecord = {
  type: string;
  name: string;
  content: string;
  priority?: number;
  proxied?: boolean;
};

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

/** Identity key: a record is "the same record slot" by type + name (+ MX priority). */
export function recordSlot(record: DnsRecord): string {
  const base = `${record.type.toUpperCase()}|${norm(record.name)}`;
  return record.type.toUpperCase() === 'MX' ? `${base}|${record.priority ?? 0}` : base;
}

/** Full value key: slot + content. Equal values mean the record already exists. */
export function recordValueKey(record: DnsRecord): string {
  return `${recordSlot(record)}|${norm(record.content)}`;
}

export type DnsPlanDiff = {
  toCreate: DnsRecord[]; // no record in this slot exists yet
  alreadyApplied: DnsRecord[]; // identical record already present
  toModify: Array<{ planned: DnsRecord; existing: DnsRecord }>; // slot exists with different content
};

/**
 * Diff a planned record set against the existing zone records (R21.2):
 *  - create only records whose slot has no existing record (idempotent),
 *  - treat identical records as already-applied,
 *  - flag slots that exist with different content for confirmation (R12.3).
 */
export function diffDnsPlan(planned: DnsRecord[], existing: DnsRecord[]): DnsPlanDiff {
  const existingBySlot = new Map<string, DnsRecord>();
  const existingValues = new Set<string>();
  for (const record of existing) {
    existingBySlot.set(recordSlot(record), record);
    existingValues.add(recordValueKey(record));
  }

  const diff: DnsPlanDiff = { toCreate: [], alreadyApplied: [], toModify: [] };
  for (const record of planned) {
    if (existingValues.has(recordValueKey(record))) {
      diff.alreadyApplied.push(record);
    } else if (existingBySlot.has(recordSlot(record))) {
      diff.toModify.push({ planned: record, existing: existingBySlot.get(recordSlot(record))! });
    } else {
      diff.toCreate.push(record);
    }
  }
  return diff;
}

/** Mail transport hosts must never be proxied through Cloudflare (R12.4). */
export function isMailTransportRecord(record: DnsRecord): boolean {
  return record.type.toUpperCase() === 'MX' || record.type.toUpperCase() === 'A';
}

export function enforceProxyPolicy(record: DnsRecord): DnsRecord {
  return isMailTransportRecord(record) ? { ...record, proxied: false } : record;
}
