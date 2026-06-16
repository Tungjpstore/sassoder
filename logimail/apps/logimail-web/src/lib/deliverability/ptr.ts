import 'server-only';

import { reverse as dnsReverse } from 'node:dns/promises';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';
import type { DnsState } from '@/lib/deliverability/score';

// PTR_Verifier (Requirement 3): reverse-lookup the sending IP and compare it to
// the domain mail hostname.

export type PtrResult = {
  state: DnsState;
  note: string;
  resolved: string[];
  sendingIp: string | null;
  mailHostname: string | null;
};

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('ptr_not_configured');
  return client;
}

function hostMatches(resolved: string[], mailHostname: string): boolean {
  const target = mailHostname.toLowerCase().replace(/\.$/, '');
  return resolved.some((name) => name.toLowerCase().replace(/\.$/, '') === target);
}

/**
 * Resolve the PTR state for an IP against a mail hostname (R3.1–3.4):
 *  - no IP configured -> unknown
 *  - reverse matches hostname -> pass
 *  - reverse returns a different hostname -> warning (+ resolved name in note)
 */
export async function resolvePtrStatus(sendingIp: string | null | undefined, mailHostname: string | null | undefined): Promise<PtrResult> {
  if (!sendingIp) {
    return { state: 'unknown', note: 'Chưa cấu hình sending IP.', resolved: [], sendingIp: null, mailHostname: mailHostname ?? null };
  }

  let resolved: string[] = [];
  try {
    resolved = await dnsReverse(sendingIp);
  } catch {
    return { state: 'warning', note: `Không reverse được IP ${sendingIp}.`, resolved: [], sendingIp, mailHostname: mailHostname ?? null };
  }

  if (!mailHostname) {
    return { state: 'unknown', note: 'Chưa cấu hình mail hostname để so khớp.', resolved, sendingIp, mailHostname: null };
  }

  if (hostMatches(resolved, mailHostname)) {
    return { state: 'pass', note: `PTR khớp ${mailHostname}.`, resolved, sendingIp, mailHostname };
  }

  return { state: 'warning', note: `PTR trả về ${resolved.join(', ') || '(rỗng)'} ≠ ${mailHostname}.`, resolved, sendingIp, mailHostname };
}

async function fetchDomain(domainId: string) {
  const db = store();
  const { data, error } = await db
    .from('domains')
    .select('id,workspace_id,domain,mail_hostname,sending_ip')
    .eq('id', domainId)
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) throw new Error('domain_not_found');
  return data as { id: string; workspace_id: string; domain: string; mail_hostname: string | null; sending_ip: string | null };
}

/** Run a PTR check for a domain and update the `domains.ptr_status` cache (R3, R2.6). */
export async function checkDomainPtr(input: { domainId: string; actor: string; actorId?: string | null }): Promise<PtrResult> {
  const db = store();
  const domain = await fetchDomain(input.domainId);
  const result = await resolvePtrStatus(domain.sending_ip, domain.mail_hostname);

  const { error } = await db.from('domains').update({ ptr_status: result.state }).eq('id', input.domainId);
  if (error) throw new Error(supabaseErrorMessage(error));

  await writeAuditLog({
    workspaceId: domain.workspace_id,
    actorId: input.actorId ?? input.actor,
    action: 'logimail.ptr_checked',
    targetType: 'domain',
    targetId: input.domainId,
    metadata: { state: result.state, resolved: result.resolved, sendingIp: result.sendingIp },
  });

  return result;
}

export { hostMatches as ptrHostMatches };
