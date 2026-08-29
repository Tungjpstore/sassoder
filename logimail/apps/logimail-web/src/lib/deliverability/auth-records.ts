import 'server-only';

import { resolveTxt, resolveMx } from 'node:dns/promises';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';
import { computeDeliverabilityScore, type DnsState } from '@/lib/deliverability/score';
import { getDkimTxtRecord } from '@/lib/deliverability/dkim';
import { resolvePtrStatus } from '@/lib/deliverability/ptr';
import { inspectDkimPublicKey } from '@/lib/ops/dns-policy';

// Auth_Record_Service (Requirement 2): build expected SPF/DKIM/DMARC/BIMI/
// MTA-STS/TLS-RPT records and validate them against public DNS, writing one
// `deliverability_checks` history row and refreshing the `domains` status cache.

export type ExpectedRecord = { kind: string; name: string; type: 'TXT' | 'MX' | 'A'; content: string };

export type AuthCheckResult = {
  domainId: string;
  score: number;
  mx: DnsState;
  spf: DnsState;
  dkim: DnsState;
  dmarc: DnsState;
  ptr: DnsState;
  bimi: DnsState;
  mtaSts: DnsState;
  tlsRpt: DnsState;
  notes: string[];
};

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('auth_records_not_configured');
  return client;
}

type DomainRow = {
  id: string;
  workspace_id: string;
  domain: string;
  mail_hostname: string | null;
  sending_ip: string | null;
};

async function fetchDomain(domainId: string): Promise<DomainRow> {
  const db = store();
  const { data, error } = await db
    .from('domains')
    .select('id,workspace_id,domain,mail_hostname,sending_ip')
    .eq('id', domainId)
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) throw new Error('domain_not_found');
  return data as DomainRow;
}

/** Expected authentication records for a domain (R2.1). */
export async function buildExpectedRecords(domainId: string): Promise<ExpectedRecord[]> {
  const domain = await fetchDomain(domainId);
  const host = domain.mail_hostname ?? `mail.${domain.domain}`;
  const ip = domain.sending_ip ?? '';
  const dkim = await getDkimTxtRecord(domainId);

  const records: ExpectedRecord[] = [
    { kind: 'spf', name: domain.domain, type: 'TXT', content: `v=spf1 mx ip4:${ip || '<sending_ip>'} -all` },
    { kind: 'mx', name: domain.domain, type: 'MX', content: host },
    { kind: 'dmarc', name: `_dmarc.${domain.domain}`, type: 'TXT', content: `v=DMARC1; p=none; rua=mailto:postmaster@${domain.domain}; fo=1` },
    { kind: 'bimi', name: `default._bimi.${domain.domain}`, type: 'TXT', content: 'v=BIMI1; l=; a=' },
    { kind: 'mta-sts', name: `_mta-sts.${domain.domain}`, type: 'TXT', content: 'v=STSv1; id=logimail-v1' },
    { kind: 'tls-rpt', name: `_smtp._tls.${domain.domain}`, type: 'TXT', content: `v=TLSRPTv1; rua=mailto:postmaster@${domain.domain}` },
  ];

  if (dkim) records.splice(1, 0, { kind: 'dkim', name: dkim.name, type: 'TXT', content: dkim.content });
  return records;
}

async function txtRecords(name: string): Promise<string[]> {
  try {
    const records = await resolveTxt(name);
    return records.map((chunks) => chunks.join(''));
  } catch {
    return [];
  }
}

function evaluateSpf(records: string[]): { state: DnsState; note?: string } {
  const spf = records.filter((value) => value.toLowerCase().startsWith('v=spf1'));
  if (spf.length === 0) return { state: 'fail', note: 'Không tìm thấy bản ghi SPF.' };
  if (spf.length > 1) return { state: 'fail', note: `Phát hiện ${spf.length} bản ghi SPF trùng — chỉ được phép một.` }; // R2.3
  const value = spf[0].toLowerCase();
  if (value.includes('-all') || value.includes('~all')) return { state: 'pass' };
  return { state: 'warning', note: 'SPF thiếu cơ chế kết thúc -all/~all.' };
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

async function evaluateMtaSts(domain: string, records: string[]): Promise<{ state: DnsState; note?: string }> {
  const sts = records.filter((value) => value.toLowerCase().startsWith('v=stsv1'));
  if (sts.length === 0) return { state: 'unknown', note: 'Chưa publish TXT _mta-sts.' };
  if (sts.length > 1) return { state: 'fail', note: 'Có nhiều TXT _mta-sts; chỉ được phép một record.' };
  if (!tagValue(sts[0], 'id')) return { state: 'warning', note: 'TXT MTA-STS thiếu policy id.' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`https://mta-sts.${domain}/.well-known/mta-sts.txt`, {
      signal: controller.signal,
      headers: { Accept: 'text/plain' },
      cache: 'no-store',
    });
    if (!response.ok) return { state: 'warning', note: `MTA-STS policy endpoint trả HTTP ${response.status}.` };
    const policy = (await response.text()).replace(/\r/g, '');
    const lines = policy.split('\n').map((line) => line.trim()).filter(Boolean);
    const hasVersion = lines.some((line) => line.toLowerCase() === 'version: stsv1');
    const hasMode = lines.some((line) => /^mode:\s*(testing|enforce|none)$/i.test(line));
    const hasMx = lines.some((line) => /^mx:\s*\S+/i.test(line));
    const hasMaxAge = lines.some((line) => /^max_age:\s*\d+$/i.test(line));
    if (hasVersion && hasMode && hasMx && hasMaxAge) return { state: 'pass' };
    return { state: 'warning', note: 'MTA-STS policy file thiếu version, mode, mx hoặc max_age hợp lệ.' };
  } catch {
    return { state: 'warning', note: 'Không tải được MTA-STS policy qua HTTPS.' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkAuthRecords(input: { domainId: string; actor: string; actorId?: string | null }): Promise<AuthCheckResult> {
  const db = store();
  const domain = await fetchDomain(input.domainId);
  const notes: string[] = [];

  // SPF (R2.2, R2.3)
  const spfRecords = await txtRecords(domain.domain);
  const spf = evaluateSpf(spfRecords);
  if (spf.note) notes.push(`SPF: ${spf.note}`);

  // MX
  let mx: DnsState = 'fail';
  try {
    const mxRecords = await resolveMx(domain.domain);
    const host = (domain.mail_hostname ?? '').toLowerCase().replace(/\.$/, '');
    if (mxRecords.length === 0) {
      mx = 'fail';
      notes.push('MX: không có bản ghi MX.');
    } else if (host && mxRecords.some((record) => record.exchange.toLowerCase().replace(/\.$/, '') === host)) {
      mx = 'pass';
    } else {
      mx = 'warning';
      notes.push(`MX: ${mxRecords.map((r) => r.exchange).join(', ')} không khớp mail hostname.`);
    }
  } catch {
    mx = 'fail';
    notes.push('MX: không phân giải được.');
  }

  // DKIM (R2.2) — needs an active selector + published TXT.
  let dkim: DnsState = 'unknown';
  const expectedDkim = await getDkimTxtRecord(input.domainId);
  if (!expectedDkim) {
    notes.push('DKIM: chưa có selector active.');
  } else {
    const dkimRecords = await txtRecords(expectedDkim.name);
    const expectedKey = tagValue(expectedDkim.content, 'p')?.replace(/\s+/g, '') ?? '';
    const matching = dkimRecords.find((value) => tagValue(value, 'p')?.replace(/\s+/g, '') === expectedKey);
    if (!matching) {
      dkim = 'fail';
      notes.push('DKIM: public key đã publish không khớp selector active.');
    } else {
      const inspection = inspectDkimPublicKey(expectedKey);
      if (!inspection.valid) {
        dkim = 'fail';
        notes.push('DKIM: public key không hợp lệ.');
      } else if ((inspection.bits ?? 0) < 2048) {
        dkim = 'fail';
        notes.push(`DKIM: RSA key ${inspection.bits ?? 'không rõ'} bit, yêu cầu tối thiểu 2048 bit.`);
      } else {
        dkim = 'pass';
      }
    }
  }

  // DMARC
  const dmarcRecords = await txtRecords(`_dmarc.${domain.domain}`);
  const dmarcMatches = dmarcRecords.filter((value) => value.toLowerCase().startsWith('v=dmarc1'));
  let dmarc: DnsState = 'fail';
  if (dmarcMatches.length === 1 && ['none', 'quarantine', 'reject'].includes(tagValue(dmarcMatches[0], 'p')?.toLowerCase() ?? '')) {
    dmarc = tagValue(dmarcMatches[0], 'rua') ? 'pass' : 'warning';
    if (dmarc === 'warning') notes.push('DMARC: thiếu địa chỉ aggregate report rua.');
  } else if (dmarcMatches.length > 1) {
    notes.push('DMARC: phát hiện nhiều record, chỉ được phép một.');
  } else {
    notes.push('DMARC: không tìm thấy record hợp lệ với policy p=.');
  }

  // BIMI — absence is `unknown`, not `fail` (R2.4)
  const bimiRecords = await txtRecords(`default._bimi.${domain.domain}`);
  const bimi: DnsState = bimiRecords.some((value) => value.toLowerCase().startsWith('v=bimi1')) ? 'pass' : 'unknown';

  // MTA-STS requires both the DNS signal and a valid HTTPS policy file.
  const mtaRecords = await txtRecords(`_mta-sts.${domain.domain}`);
  const mtaEvaluation = await evaluateMtaSts(domain.domain, mtaRecords);
  const mtaSts = mtaEvaluation.state;
  if (mtaEvaluation.note) notes.push(`MTA-STS: ${mtaEvaluation.note}`);

  const tlsRptRecords = (await txtRecords(`_smtp._tls.${domain.domain}`)).filter((value) => value.toLowerCase().startsWith('v=tlsrptv1'));
  let tlsRpt: DnsState = 'unknown';
  if (tlsRptRecords.length > 1) {
    tlsRpt = 'fail';
    notes.push('TLS-RPT: phát hiện nhiều record, chỉ được phép một.');
  } else if (tlsRptRecords.length === 1) {
    tlsRpt = tagValue(tlsRptRecords[0], 'rua') ? 'pass' : 'warning';
    if (tlsRpt === 'warning') notes.push('TLS-RPT: thiếu địa chỉ nhận báo cáo rua.');
  }

  // PTR (R3, also cached here per R2.6)
  const ptrResult = await resolvePtrStatus(domain.sending_ip, domain.mail_hostname);
  if (ptrResult.state !== 'pass') notes.push(`PTR: ${ptrResult.note}`);

  const score = computeDeliverabilityScore({
    mx,
    spf: spf.state,
    dkim,
    dmarc,
    ptr: ptrResult.state,
    bimi,
    mtaSts,
  });

  // History row (R2.2, R2.5)
  const { error: insertError } = await db.from('deliverability_checks').insert({
    workspace_id: domain.workspace_id,
    domain_id: input.domainId,
    score,
    mx_status: mx,
    spf_status: spf.state,
    dkim_status: dkim,
    dmarc_status: dmarc,
    ptr_status: ptrResult.state,
    bimi_status: bimi,
    mta_sts_status: mtaSts,
    notes: notes.join('\n') || null,
    checked_by: input.actorId ?? null,
  });
  if (insertError) throw new Error(supabaseErrorMessage(insertError));

  // Refresh status cache on the domain row (R2.6)
  const { error: cacheError } = await db
    .from('domains')
    .update({
      spf_status: spf.state,
      dkim_status: dkim,
      dmarc_status: dmarc,
      mx_status: mx,
      ptr_status: ptrResult.state,
      bimi_status: bimi,
      mta_sts_status: mtaSts,
      last_checked_at: new Date().toISOString(),
    })
    .eq('id', input.domainId);
  if (cacheError) throw new Error(supabaseErrorMessage(cacheError));

  await writeAuditLog({
    workspaceId: domain.workspace_id,
    actorId: input.actorId ?? input.actor,
    action: 'logimail.auth_records_checked',
    targetType: 'domain',
    targetId: input.domainId,
    metadata: { score, spf: spf.state, dkim, dmarc, mx, ptr: ptrResult.state, bimi, mtaSts, tlsRpt },
  });

  return { domainId: input.domainId, score, mx, spf: spf.state, dkim, dmarc, ptr: ptrResult.state, bimi, mtaSts, tlsRpt, notes };
}

export function authRecordsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'auth_records_error');
  if (message === 'auth_records_not_configured') return { status: 503, text: 'Thiếu service role cho auth records.' };
  if (message === 'domain_not_found') return { status: 404, text: 'Không tìm thấy domain.' };
  return { status: 502, text: message };
}

export { evaluateSpf };
