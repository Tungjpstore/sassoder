import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { createLogimailStore, supabaseErrorMessage } from '@/lib/logimail-store';

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'read');
  if (!auth.ok) return auth.response;

  const store = createLogimailStore(auth.token);
  const { data, error } = await store
    .from('workspaces')
    .select('id,name,slug,plan,status,created_at,updated_at')
    .order('created_at', { ascending: false });

  if (error) return jsonError('supabase_error', supabaseErrorMessage(error), 502);
  return jsonOk({ workspaces: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  await writeAuditLog({
    actorId: auth.user.id,
    action: 'workspace.create_approval_required',
    targetType: 'workspace',
    metadata: { replacementRoute: '/api/logimail/account/request' },
  });

  return jsonError(
    'approval_required',
    'Workspace LogiMail chỉ được tạo sau khi admin phê duyệt yêu cầu đăng ký. Hãy dùng /api/logimail/account/request.',
    403,
  );
}
