import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import {
  buildSafeDnsPlan,
  createLogimailStore,
  normalizeDomain,
  normalizeUuid,
  readJsonObject,
  stringField,
  supabaseErrorMessage,
} from '@/lib/logimail-store';
import { notifyPlatformLogimailApprovalRequested } from '@/lib/platform-events';

function dnsPlanForRequest(domain: string, mailHostname: string) {
  const vpsIp = process.env.LOGIMAIL_VPS_IP ?? '';
  return {
    plannedRecords: vpsIp ? buildSafeDnsPlan(domain, vpsIp, mailHostname) : [],
    riskFlags: vpsIp ? [] : ['missing_vps_ip'],
  };
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonObject(request);
    const workspaceId = normalizeUuid(stringField(body, 'workspaceId', { required: true }) ?? '', 'workspaceId');
    const domain = normalizeDomain(stringField(body, 'domain', { required: true, max: 253 }) ?? '');
    const requestedMailHostname = stringField(body, 'mailHostname', { max: 253 });
    const mailHostname = normalizeDomain(requestedMailHostname ?? process.env.LOGIMAIL_MAIL_HOSTNAME ?? `mail.${domain}`);
    const cloudflareZoneId = stringField(body, 'cloudflareZoneId', { max: 80 });
    const purpose = stringField(body, 'purpose', { max: 1000 });
    const { plannedRecords, riskFlags } = dnsPlanForRequest(domain, mailHostname);
    const store = createLogimailStore(auth.token);

    const { data, error } = await store
      .from('domain_requests')
      .insert({
        workspace_id: workspaceId,
        requested_by: auth.user.id,
        domain,
        mail_hostname: mailHostname,
        cloudflare_zone_id: cloudflareZoneId,
        purpose,
        dns_plan: { plannedRecords },
        risk_flags: riskFlags,
        status: 'pending',
        metadata: { source: 'logimail-web-api' },
      })
      .select('id,workspace_id,requested_by,domain,mail_hostname,cloudflare_zone_id,purpose,status,risk_flags,created_at,updated_at')
      .single();

    if (error) {
      if (error.code === '23505') return jsonError('pending_request_exists', 'Domain này đã có yêu cầu đang chờ phê duyệt.', 409);
      return jsonError('supabase_error', supabaseErrorMessage(error), 502);
    }

    await writeAuditLog({
      workspaceId,
      actorId: auth.user.id,
      action: 'domain.request_create',
      targetType: 'domain_request',
      targetId: data.id,
      metadata: { domain, mailHostname, riskFlags, plannedRecordCount: plannedRecords.length },
    });

    await notifyPlatformLogimailApprovalRequested({
      requestId: data.id,
      requestType: 'domain',
      requesterUserId: auth.user.id,
      requesterEmail: auth.user.email ?? null,
      workspaceId,
      targetValue: domain,
      purpose: data.purpose,
      domain,
      mailHostname,
      riskFlags,
      plannedRecordCount: plannedRecords.length,
      createdAt: data.created_at,
    }).catch((error) => {
      console.error('[logimail-domain-request] platform notification failed', error);
    });

    return jsonOk({ domainRequest: data, plannedRecords, status: 'pending_admin_approval' }, { status: 202 });
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Payload không hợp lệ.', 400);
  }
}
