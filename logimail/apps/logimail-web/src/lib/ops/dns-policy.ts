import { createPublicKey } from 'node:crypto';

import { recordSlot, type DnsRecord } from '@/lib/ops/dns-plan';

export type DnsPolicySeverity = 'blocker' | 'warning' | 'info';

export type DnsPolicyFinding = {
  code: string;
  severity: DnsPolicySeverity;
  message: string;
  recordIds: string[];
};

export type DkimKeyInspection = {
  valid: boolean;
  algorithm: string | null;
  bits: number | null;
};

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

function recordIds(records: DnsRecord[]) {
  return records.map((record) => record.id).filter((id): id is string => Boolean(id));
}

function txtAt(records: DnsRecord[], name: string) {
  const target = normalizeName(name);
  return records.filter((record) => record.type.toUpperCase() === 'TXT' && normalizeName(record.name) === target);
}

function tagValue(content: string, tag: string) {
  const prefix = `${tag.toLowerCase()}=`;
  return content
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(prefix))
    ?.slice(prefix.length)
    .trim() ?? null;
}

function dkimPublicKey(content: string) {
  return tagValue(content, 'p')?.replace(/\s+/g, '') ?? '';
}

/** Validate a DKIM RSA public key and expose its modulus length. */
export function inspectDkimPublicKey(publicKeyBase64: string): DkimKeyInspection {
  const normalized = publicKeyBase64.replace(/\s+/g, '');
  if (!normalized) return { valid: false, algorithm: null, bits: null };

  for (const type of ['spki', 'pkcs1'] as const) {
    try {
      const key = createPublicKey({ key: Buffer.from(normalized, 'base64'), format: 'der', type });
      const algorithm = key.asymmetricKeyType ?? null;
      const details = key.asymmetricKeyDetails as { modulusLength?: number } | undefined;
      return { valid: algorithm === 'rsa' || algorithm === 'rsa-pss', algorithm, bits: details?.modulusLength ?? null };
    } catch {
      // Some providers export PKCS#1 rather than SPKI, so try both encodings.
    }
  }

  return { valid: false, algorithm: null, bits: null };
}

export function inspectDnsPolicy(domain: string, records: DnsRecord[]): DnsPolicyFinding[] {
  const normalizedDomain = normalizeName(domain);
  const findings: DnsPolicyFinding[] = [];

  const spf = txtAt(records, normalizedDomain).filter((record) => record.content.trim().toLowerCase().startsWith('v=spf1'));
  if (spf.length === 0) {
    findings.push({ code: 'spf_missing', severity: 'warning', message: 'Chưa có bản ghi SPF tại domain gốc.', recordIds: [] });
  } else if (spf.length > 1) {
    findings.push({
      code: 'spf_multiple_records',
      severity: 'blocker',
      message: `Phát hiện ${spf.length} bản ghi SPF. RFC yêu cầu hợp nhất thành đúng một bản ghi.`,
      recordIds: recordIds(spf),
    });
  }
  if (spf.length === 1 && !/(?:^|\s)[~-]all(?:\s|$)/i.test(spf[0].content)) {
    findings.push({ code: 'spf_unbounded', severity: 'warning', message: 'SPF chưa kết thúc bằng ~all hoặc -all.', recordIds: recordIds(spf) });
  }

  const dmarc = txtAt(records, `_dmarc.${normalizedDomain}`).filter((record) => record.content.trim().toLowerCase().startsWith('v=dmarc1'));
  if (dmarc.length === 0) {
    findings.push({ code: 'dmarc_missing', severity: 'warning', message: 'Chưa có bản ghi DMARC.', recordIds: [] });
  } else if (dmarc.length > 1) {
    findings.push({ code: 'dmarc_multiple_records', severity: 'blocker', message: 'DMARC chỉ được có một bản ghi.', recordIds: recordIds(dmarc) });
  } else {
    const policy = tagValue(dmarc[0].content, 'p')?.toLowerCase();
    if (!policy || !['none', 'quarantine', 'reject'].includes(policy)) {
      findings.push({ code: 'dmarc_invalid_policy', severity: 'blocker', message: 'DMARC thiếu policy p= hợp lệ.', recordIds: recordIds(dmarc) });
    } else if (policy === 'none') {
      findings.push({ code: 'dmarc_monitoring_only', severity: 'info', message: 'DMARC đang ở chế độ theo dõi p=none.', recordIds: recordIds(dmarc) });
    }
    if (!tagValue(dmarc[0].content, 'rua')) {
      findings.push({ code: 'dmarc_rua_missing', severity: 'warning', message: 'DMARC chưa có địa chỉ nhận aggregate report (rua).', recordIds: recordIds(dmarc) });
    }
  }

  const dkim = records.filter((record) => (
    record.type.toUpperCase() === 'TXT'
    && normalizeName(record.name).endsWith(`._domainkey.${normalizedDomain}`)
    && record.content.trim().toLowerCase().startsWith('v=dkim1')
  ));
  for (const record of dkim) {
    const inspection = inspectDkimPublicKey(dkimPublicKey(record.content));
    if (!inspection.valid) {
      findings.push({ code: 'dkim_key_invalid', severity: 'blocker', message: `DKIM ${record.name} chứa public key không hợp lệ.`, recordIds: recordIds([record]) });
    } else if ((inspection.bits ?? 0) < 2048) {
      findings.push({ code: 'dkim_key_weak', severity: 'blocker', message: `DKIM ${record.name} chỉ có ${inspection.bits ?? 'không rõ'} bit; yêu cầu tối thiểu 2048 bit.`, recordIds: recordIds([record]) });
    }
  }

  const mtaSts = txtAt(records, `_mta-sts.${normalizedDomain}`).filter((record) => record.content.trim().toLowerCase().startsWith('v=stsv1'));
  if (mtaSts.length === 0) {
    findings.push({ code: 'mta_sts_missing', severity: 'warning', message: 'Chưa có TXT MTA-STS.', recordIds: [] });
  } else if (mtaSts.length > 1) {
    findings.push({ code: 'mta_sts_multiple_records', severity: 'blocker', message: 'MTA-STS chỉ được có một TXT record.', recordIds: recordIds(mtaSts) });
  }

  const tlsRpt = txtAt(records, `_smtp._tls.${normalizedDomain}`).filter((record) => record.content.trim().toLowerCase().startsWith('v=tlsrptv1'));
  if (tlsRpt.length === 0) {
    findings.push({ code: 'tls_rpt_missing', severity: 'warning', message: 'Chưa có TLS-RPT để nhận báo cáo lỗi TLS.', recordIds: [] });
  } else if (!tagValue(tlsRpt[0].content, 'rua')) {
    findings.push({ code: 'tls_rpt_rua_missing', severity: 'warning', message: 'TLS-RPT thiếu địa chỉ nhận báo cáo rua.', recordIds: recordIds(tlsRpt) });
  }

  const exactValues = new Map<string, DnsRecord[]>();
  for (const record of records) {
    const key = `${recordSlot(record)}|${normalizeName(record.content)}`;
    const group = exactValues.get(key) ?? [];
    group.push(record);
    exactValues.set(key, group);
  }
  for (const duplicates of exactValues.values()) {
    if (duplicates.length < 2) continue;
    findings.push({
      code: 'dns_exact_duplicate',
      severity: 'warning',
      message: `Có ${duplicates.length} DNS record trùng hoàn toàn tại ${duplicates[0].name}.`,
      recordIds: recordIds(duplicates),
    });
  }

  return findings;
}

export function hasBlockingDnsFindings(findings: DnsPolicyFinding[]) {
  return findings.some((finding) => finding.severity === 'blocker');
}
