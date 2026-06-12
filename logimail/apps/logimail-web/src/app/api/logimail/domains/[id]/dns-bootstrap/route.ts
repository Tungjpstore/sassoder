import { jsonError, jsonOk, requireAuth, requireServerConfig } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { buildSafeDnsPlan, createLogimailStore, normalizeUuid, supabaseErrorMessage } from '@/lib/logimail-store';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;
  const params = await context.params;
  let domainId: string;
  try {
    domainId = normalizeUuid(params.id, 'domainId');
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Domain id không hợp lệ.', 400);
  }

  const missing = requireServerConfig(['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ZONE_ID']);
  if (missing.length > 0) {
    return jsonError('not_configured', `Thiếu env server-side: ${missing.join(', ')}`, 503);
  }

  const store = createLogimailStore(auth.token);
  const { data: domain, error } = await store
    .from('domains')
    .select('id,workspace_id,domain,mail_hostname,status')
    .eq('id', domainId)
    .maybeSingle();

  if (error) return jsonError('supabase_error', supabaseErrorMessage(error), 502);
  if (!domain) return jsonError('not_found', 'Không tìm thấy domain hoặc bạn không có quyền truy cập.', 404);

  const vpsIp = process.env.LOGIMAIL_VPS_IP;
  if (!vpsIp) return jsonError('not_configured', 'Thiếu env server-side: LOGIMAIL_VPS_IP', 503);

  const mailHostname = domain.mail_hostname ?? process.env.LOGIMAIL_MAIL_HOSTNAME ?? `mail.${domain.domain}`;
  const plannedRecords = buildSafeDnsPlan(domain.domain, vpsIp, mailHostname);

  await writeAuditLog({
    workspaceId: domain.workspace_id,
    actorId: auth.user.id,
    action: 'domain.dns_bootstrap_dry_run',
    targetType: 'domain',
    targetId: domain.id,
    metadata: { domain: domain.domain, mailHostname, plannedRecordCount: plannedRecords.length },
  });

  return jsonOk({
    domainId,
    plannedRecords,
    status: 'dry_run_only',
    policy: 'Create only missing safe records. Existing MX/SPF/DKIM/DMARC changes require Cloudflare backup and explicit confirmation.',
  }, { status: 202 });
}
