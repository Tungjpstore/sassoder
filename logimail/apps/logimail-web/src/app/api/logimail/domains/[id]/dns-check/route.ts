import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { buildSafeDnsPlan, createLogimailStore, normalizeUuid, supabaseErrorMessage } from '@/lib/logimail-store';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request, 'read');
  if (!auth.ok) return auth.response;
  const params = await context.params;
  let domainId: string;
  try {
    domainId = normalizeUuid(params.id, 'domainId');
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Domain id không hợp lệ.', 400);
  }

  const store = createLogimailStore(auth.token);
  const { data: domain, error } = await store
    .from('domains')
    .select('id,workspace_id,domain,mail_hostname,status,spf_status,dkim_status,dmarc_status,mx_status,ptr_status,last_checked_at')
    .eq('id', domainId)
    .maybeSingle();

  if (error) return jsonError('supabase_error', supabaseErrorMessage(error), 502);
  if (!domain) return jsonError('not_found', 'Không tìm thấy domain hoặc bạn không có quyền truy cập.', 404);

  const vpsIp = process.env.LOGIMAIL_VPS_IP ?? '';
  const mailHostname = domain.mail_hostname ?? process.env.LOGIMAIL_MAIL_HOSTNAME ?? `mail.${domain.domain}`;

  return jsonOk({
    domain,
    expectedRecords: vpsIp ? buildSafeDnsPlan(domain.domain, vpsIp, mailHostname) : [],
    status: vpsIp ? 'metadata_only' : 'missing_vps_ip',
    policy: 'DNS public verification is performed by Cloudflare/report scripts until production token is connected.',
  });
}
