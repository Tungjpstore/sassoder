import 'server-only';

import { resolveTxt, resolveMx } from 'node:dns/promises';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';
import { computeDeliverabilityScore, type DnsState } from '@/lib/deliverability/score';
import { getDkimTxtRecord } from '@/lib/deliverability/dkim';
import { resolvePtrStatus } from '@/lib/deliverability/ptr';

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
    { kind: 'dmarc', name: `_dmarc.${domain.domain}`, type: 'TXT', content: `v=DMARC1; p=none; rua=mailto:postmaster@${domain.domain}` },
    { kind: 'bimi', name: `default._bimi.${domain.domain}`, type: 'TXT', content: 'v=BIMI1; l=; a=' },
    { kind: 'mta-sts', name: `_mta-sts.${domain.domain}`, type: 'TXT', content: 'v=STSv1; id=logimail' },
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
    if (dkimRecords.some((value) => value.toLowerCase().includes('p='))) dkim = 'pass';
    else {
      dkim = 'fail';
      notes.push('DKIM: chưa publish bản ghi TXT cho selector active.');
    }
  }

  // DMARC
  const dmarcRecords = await txtRecords(`_dmarc.${domain.domain}`);
  const dmarc: DnsState = dmarcRecords.some((value) => value.toLowerCase().startsWith('v=dmarc1')) ? 'pass' : 'fail';
  if (dmarc === 'fail') notes.push('DMARC: không tìm thấy bản ghi _dmarc.');

  // BIMI — absence is `unknown`, not `fail` (R2.4)
  const bimiRecords = await txtRecords(`default._bimi.${domain.domain}`);
  const bimi: DnsState = bimiRecords.some((value) => value.toLowerCase().startsWith('v=bimi1')) ? 'pass' : 'unknown';

  // MTA-STS — absence is `unknown`
  const mtaRecords = await txtRecords(`_mta-sts.${domain.domain}`);
  const mtaSts: DnsState = mtaRecords.some((value) => value.toLowerCase().startsWith('v=stsv1')) ? 'pass' : 'unknown';

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
    metadata: { score, spf: spf.state, dkim, dmarc, mx, ptr: ptrResult.state, bimi, mtaSts },
  });

  return { domainId: input.domainId, score, mx, spf: spf.state, dkim, dmarc, ptr: ptrResult.state, bimi, mtaSts, notes };
}

export function authRecordsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'auth_records_error');
  if (message === 'auth_records_not_configured') return { status: 503, text: 'Thiếu service role cho auth records.' };
  if (message === 'domain_not_found') return { status: 404, text: 'Không tìm thấy domain.' };
  return { status: 502, text: message };
}

export { evaluateSpf };
