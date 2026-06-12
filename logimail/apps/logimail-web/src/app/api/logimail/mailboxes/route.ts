import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import {
  createLogimailStore,
  normalizeUuid,
  supabaseErrorMessage,
} from '@/lib/logimail-store';

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'read');
  if (!auth.ok) return auth.response;

  try {
    const store = createLogimailStore(auth.token);
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const domainId = url.searchParams.get('domainId');
    let query = store
      .from('mailboxes')
      .select('id,workspace_id,domain_id,email_address,display_name,quota_mb,status,provider,provider_mailbox_id,created_at,updated_at')
      .order('created_at', { ascending: false });

    if (workspaceId) query = query.eq('workspace_id', normalizeUuid(workspaceId, 'workspaceId'));
    if (domainId) query = query.eq('domain_id', normalizeUuid(domainId, 'domainId'));

    const { data, error } = await query;
    if (error) return jsonError('supabase_error', supabaseErrorMessage(error), 502);
    return jsonOk({ mailboxes: data ?? [] });
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Query không hợp lệ.', 400);
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  await writeAuditLog({
    actorId: auth.user.id,
    action: 'mailbox.create_approval_required',
    targetType: 'mailbox',
    metadata: { replacementRoute: '/api/logimail/mailboxes/request' },
  });

  return jsonError(
    'approval_required',
    'Mailbox chỉ được tạo sau khi admin phê duyệt. Hãy dùng /api/logimail/mailboxes/request.',
    403,
  );
}
