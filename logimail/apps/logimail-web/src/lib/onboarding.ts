import 'server-only';

import { resolveTxt, resolveMx, resolve4 } from 'node:dns/promises';

import { buildSafeDnsPlan, createLogimailServiceStore, normalizeDomain, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';
import { createDomainOwnershipChallenge, type DomainOwnershipChallenge } from '@/lib/domain-ownership';

// Domain_Onboarding_Wizard (Requirement 19): guide domain entry -> Cloudflare zone
// -> DNS plan generation -> verification, persisting state on `domain_requests`.

type PlannedRecord = { type: string; name: string; content: string; priority?: number; proxied?: boolean };

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('onboarding_not_configured');
  return client;
}

function vpsIp(): string {
  return process.env.LOGIMAIL_VPS_IP?.trim() || '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Step 1 — domain entry: create a pending domain request (R19.1). */
export async function startOnboarding(input: { workspaceId: string; requestedBy: string; domain: string; mailHostname?: string; actor: string; actorId?: string | null }): Promise<{ requestId: string }> {
  const db = store();
  const domain = normalizeDomain(input.domain);
  const mailHostname = input.mailHostname ? normalizeDomain(input.mailHostname) : `mail.${domain}`;
  const ownership = createDomainOwnershipChallenge(domain);

  const { data, error } = await db
    .from('domain_requests')
    .insert({
      workspace_id: input.workspaceId,
      requested_by: input.requestedBy,
      domain,
      mail_hostname: mailHostname,
      status: 'pending',
      dns_plan: [ownership],
      risk_flags: ['ownership_unverified'],
      metadata: {
        ownership: { challenge: ownership, status: 'pending', verifiedAt: null },
        onboarding: { step: 'domain_entry' },
      },
    })
    .select('id')
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));

  const requestId = (data as { id: string }).id;
  await writeAuditLog({ workspaceId: input.workspaceId, actorId: input.actorId ?? input.actor, action: 'logimail.onboarding_started', targetType: 'domain_request', targetId: requestId, metadata: { domain } });
  return { requestId };
}

/** Step 2 — store the selected Cloudflare zone (R19.2). */
export async function selectCloudflareZone(input: { requestId: string; cloudflareZoneId: string; actor: string; actorId?: string | null }): Promise<void> {
  const db = store();
  const { data: current, error: readError } = await db.from('domain_requests').select('id,metadata').eq('id', input.requestId).maybeSingle();
  if (readError) throw new Error(supabaseErrorMessage(readError));
  if (!current) throw new Error('request_not_found');
  const { data, error } = await db
    .from('domain_requests')
    .update({ cloudflare_zone_id: input.cloudflareZoneId, metadata: { ...asRecord(current.metadata), onboarding: { step: 'zone_selected' } } })
    .eq('id', input.requestId)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) throw new Error('request_not_found');
  await writeAuditLog({ actorId: input.actorId ?? input.actor, action: 'logimail.onboarding_zone_selected', targetType: 'domain_request', targetId: input.requestId, metadata: { cloudflareZoneId: input.cloudflareZoneId } });
}

/** Step 3 — generate + persist the DNS plan (R19.3). */
export async function generateOnboardingDnsPlan(input: { requestId: string; actor: string; actorId?: string | null }): Promise<{ plan: PlannedRecord[] }> {
  const db = store();
  const { data: request, error } = await db.from('domain_requests').select('id,domain,mail_hostname,metadata').eq('id', input.requestId).maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!request) throw new Error('request_not_found');

  const row = request as { domain: string; mail_hostname: string; metadata: unknown };
  const metadata = asRecord(row.metadata);
  const ownership = asRecord(metadata.ownership);
  const challenge = ownership.challenge as DomainOwnershipChallenge | undefined;
  if (!challenge) throw new Error('ownership_challenge_missing');
  const sendingIp = vpsIp();
  if (!sendingIp) throw new Error('missing_vps_ip');
  const plan = [challenge, ...buildSafeDnsPlan(row.domain, sendingIp, row.mail_hostname)] as PlannedRecord[];

  const { error: updateError } = await db
    .from('domain_requests')
    .update({ dns_plan: plan, metadata: { ...metadata, onboarding: { step: 'dns_plan' } } })
    .eq('id', input.requestId);
  if (updateError) throw new Error(supabaseErrorMessage(updateError));

  await writeAuditLog({ actorId: input.actorId ?? input.actor, action: 'logimail.onboarding_dns_plan', targetType: 'domain_request', targetId: input.requestId, metadata: { records: plan.length } });
  return { plan };
}

async function recordVerifies(record: PlannedRecord, domain: string): Promise<boolean> {
  try {
    if (record.type === 'MX') {
      const mx = await resolveMx(domain);
      return mx.some((entry) => entry.exchange.toLowerCase().replace(/\.$/, '') === record.content.toLowerCase().replace(/\.$/, ''));
    }
    if (record.type === 'A') {
      const a = await resolve4(record.name);
      return a.includes(record.content);
    }
    if (record.type === 'TXT') {
      const txt = (await resolveTxt(record.name)).map((chunks) => chunks.join(''));
      // Match by record prefix (e.g. v=spf1 / v=DMARC1).
      const prefix = record.content.split(' ')[0].toLowerCase();
      return txt.some((value) => value.toLowerCase().startsWith(prefix));
    }
    return false;
  } catch {
    return false;
  }
}

/** Step 4 — verify required records; eligible only when all verify (R19.4, R19.5). */
export async function verifyOnboarding(input: { requestId: string; actor: string; actorId?: string | null }): Promise<{ eligible: boolean; unverified: PlannedRecord[] }> {
  const db = store();
  const { data: request, error } = await db.from('domain_requests').select('id,domain,dns_plan,metadata').eq('id', input.requestId).maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!request) throw new Error('request_not_found');

  const row = request as { domain: string; dns_plan: unknown; metadata: Record<string, unknown> | null };
  const plan = (Array.isArray(row.dns_plan) ? row.dns_plan : []) as PlannedRecord[];
  if (plan.length === 0) throw new Error('dns_plan_missing');
  const hasMx = plan.some((record) => record.type === 'MX' && record.name === row.domain);
  const hasSpf = plan.some((record) => record.type === 'TXT' && record.name === row.domain && record.content.toLowerCase().startsWith('v=spf1'));
  const hasDmarc = plan.some((record) => record.type === 'TXT' && record.name === `_dmarc.${row.domain}` && record.content.toLowerCase().startsWith('v=dmarc1'));
  if (!hasMx || !hasSpf || !hasDmarc) throw new Error('dns_plan_incomplete');

  const unverified: PlannedRecord[] = [];
  for (const record of plan) {
    const ok = await recordVerifies(record, row.domain);
    if (!ok) unverified.push(record);
  }

  const eligible = unverified.length === 0;
  const metadata = asRecord(row.metadata);
  const ownership = asRecord(metadata.ownership);
  const challenge = ownership.challenge as DomainOwnershipChallenge | undefined;
  const ownershipVerified = Boolean(challenge && !unverified.some((record) => record.name === challenge.name && record.content === challenge.content));
  const riskFlags = ownershipVerified ? [] : ['ownership_unverified'];
  await db
    .from('domain_requests')
    .update({
      risk_flags: riskFlags,
      metadata: {
        ...metadata,
        ownership: { ...ownership, status: ownershipVerified ? 'verified' : 'pending', verifiedAt: ownershipVerified ? new Date().toISOString() : null },
        onboarding: { step: eligible ? 'eligible' : 'verify_failed', eligible, unverified },
      },
    })
    .eq('id', input.requestId); // status stays 'pending' until approval (R19.4)

  await writeAuditLog({ actorId: input.actorId ?? input.actor, action: 'logimail.onboarding_verified', targetType: 'domain_request', targetId: input.requestId, metadata: { eligible, unverifiedCount: unverified.length } });
  return { eligible, unverified };
}

export function onboardingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'onboarding_error');
  if (message === 'onboarding_not_configured') return { status: 503, text: 'Thiếu service role cho onboarding.' };
  if (message === 'request_not_found') return { status: 404, text: 'Không tìm thấy yêu cầu domain.' };
  if (message === 'dns_plan_missing') return { status: 409, text: 'Chưa tạo DNS plan cho domain này.' };
  if (message === 'dns_plan_incomplete') return { status: 409, text: 'DNS plan chưa đủ MX, SPF và DMARC để xác minh.' };
  if (message === 'ownership_challenge_missing') return { status: 409, text: 'Yêu cầu domain chưa có ownership challenge.' };
  if (message === 'missing_vps_ip') return { status: 503, text: 'Thiếu LOGIMAIL_VPS_IP để tạo DNS plan.' };
  if (message === 'invalid_domain') return { status: 400, text: 'Domain không hợp lệ.' };
  return { status: 502, text: message };
}
