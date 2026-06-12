import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { createLogimailStore, normalizeSlug, readJsonObject, stringField, supabaseErrorMessage } from '@/lib/logimail-store';
import { notifyPlatformLogimailApprovalRequested } from '@/lib/platform-events';

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;
  if (!auth.user.email) return jsonError('invalid_request', 'Tài khoản cần có email đã xác thực để đăng ký LogiMail.', 400);

  try {
    const body = await readJsonObject(request);
    const fullName = stringField(body, 'fullName', { max: 120 });
    const companyName = stringField(body, 'companyName', { max: 160 });
    const purpose = stringField(body, 'purpose', { max: 1000 });
    const requestedWorkspaceName = stringField(body, 'requestedWorkspaceName', { max: 120 });
    const requestedSlugValue = stringField(body, 'requestedSlug', { max: 64 });
    const requestedSlug = requestedSlugValue ? normalizeSlug(requestedSlugValue) : null;
    const store = createLogimailStore(auth.token);

    const { data, error } = await store
      .from('account_requests')
      .insert({
        user_id: auth.user.id,
        email: auth.user.email.toLowerCase(),
        full_name: fullName,
        company_name: companyName,
        purpose,
        requested_workspace_name: requestedWorkspaceName,
        requested_slug: requestedSlug,
        status: 'pending',
        metadata: { source: 'logimail-web-api' },
      })
      .select('id,user_id,email,full_name,company_name,purpose,requested_workspace_name,requested_slug,status,created_at,updated_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return jsonError('pending_request_exists', 'Tài khoản này đã có yêu cầu LogiMail đang chờ phê duyệt.', 409);
      }
      return jsonError('supabase_error', supabaseErrorMessage(error), 502);
    }

    await writeAuditLog({
      actorId: auth.user.id,
      action: 'account.request_create',
      targetType: 'account_request',
      targetId: data.id,
      metadata: { email: data.email, requestedSlug: data.requested_slug },
    });

    await notifyPlatformLogimailApprovalRequested({
      requestId: data.id,
      requestType: 'account',
      requesterUserId: auth.user.id,
      requesterEmail: data.email,
      workspaceName: data.requested_workspace_name ?? companyName,
      workspaceSlug: data.requested_slug,
      targetValue: data.email,
      purpose: data.purpose,
      createdAt: data.created_at,
    }).catch((error) => {
      console.error('[logimail-account-request] platform notification failed', error);
    });

    return jsonOk({ accountRequest: data, status: 'pending_admin_approval' }, { status: 202 });
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Payload không hợp lệ.', 400);
  }
}
