import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { createLogimailStore, normalizeUuid, supabaseErrorMessage } from '@/lib/logimail-store';

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'read');
  if (!auth.ok) return auth.response;

  try {
    const store = createLogimailStore(auth.token);
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');
    let query = store
      .from('domains')
      .select('id,workspace_id,domain,mail_hostname,approval_status,registration_enabled,status,spf_status,dkim_status,dmarc_status,mx_status,ptr_status,last_checked_at,created_at,updated_at')
      .order('created_at', { ascending: false });

    if (workspaceId) query = query.eq('workspace_id', normalizeUuid(workspaceId, 'workspaceId'));

    const { data, error } = await query;
    if (error) return jsonError('supabase_error', supabaseErrorMessage(error), 502);
    return jsonOk({ domains: data ?? [] });
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Query không hợp lệ.', 400);
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  await writeAuditLog({
    actorId: auth.user.id,
    action: 'domain.create_approval_required',
    targetType: 'domain',
    metadata: { replacementRoute: '/api/logimail/domains/request' },
  });

  return jsonError(
    'approval_required',
    'Domain LogiMail chỉ được thêm sau khi admin phê duyệt DNS/provisioning. Hãy dùng /api/logimail/domains/request.',
    403,
  );
}
