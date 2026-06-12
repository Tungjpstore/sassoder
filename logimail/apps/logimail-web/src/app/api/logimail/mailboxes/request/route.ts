import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import {
  createLogimailStore,
  normalizeEmail,
  normalizeMailboxLocalPart,
  normalizeUuid,
  optionalNumberField,
  readJsonObject,
  stringField,
  supabaseErrorMessage,
} from '@/lib/logimail-store';
import { notifyPlatformLogimailApprovalRequested } from '@/lib/platform-events';

function localPartFromEmail(emailAddress: string, domain: string) {
  const normalized = normalizeEmail(emailAddress);
  const suffix = `@${domain}`;
  if (!normalized.endsWith(suffix)) throw new Error('email_domain_mismatch');
  return normalizeMailboxLocalPart(normalized.slice(0, -suffix.length));
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonObject(request);
    const workspaceId = normalizeUuid(stringField(body, 'workspaceId', { required: true }) ?? '', 'workspaceId');
    const domainId = normalizeUuid(stringField(body, 'domainId', { required: true }) ?? '', 'domainId');
    const displayName = stringField(body, 'displayName', { max: 120 });
    const requestedLocalPart = stringField(body, 'localPart', { max: 64 });
    const requestedEmailAddress = stringField(body, 'emailAddress', { max: 254 });
    const quotaMb = optionalNumberField(body, 'quotaMb', { min: 128, max: 102400 }) ?? 1024;
    const store = createLogimailStore(auth.token);

    const { data: domain, error: domainError } = await store
      .from('domains')
      .select('id,workspace_id,domain,status,approval_status,registration_enabled')
      .eq('id', domainId)
      .maybeSingle();

    if (domainError) return jsonError('supabase_error', supabaseErrorMessage(domainError), 502);
    if (!domain) return jsonError('not_found', 'Không tìm thấy domain hoặc bạn không có quyền truy cập.', 404);
    if (domain.workspace_id !== workspaceId) return jsonError('workspace_domain_mismatch', 'Domain không thuộc workspace đã chọn.', 409);
    if (domain.status !== 'active' || domain.approval_status !== 'approved' || domain.registration_enabled !== true) {
      return jsonError('domain_not_available', 'Domain chưa được admin duyệt hoặc chưa bật đăng ký mailbox.', 409);
    }

    const localPart = requestedEmailAddress
      ? localPartFromEmail(requestedEmailAddress, domain.domain)
      : normalizeMailboxLocalPart(requestedLocalPart ?? '');
    const emailAddress = `${localPart}@${domain.domain}`;

    const { data, error } = await store
      .from('mailbox_requests')
      .insert({
        workspace_id: workspaceId,
        domain_id: domainId,
        requested_by: auth.user.id,
        local_part: localPart,
        email_address: emailAddress,
        display_name: displayName,
        quota_mb: quotaMb,
        status: 'pending',
        metadata: { source: 'logimail-web-api' },
      })
      .select('id,workspace_id,domain_id,requested_by,local_part,email_address,display_name,quota_mb,status,created_at,updated_at')
      .single();

    if (error) {
      if (error.code === '23505') return jsonError('pending_request_exists', 'Mailbox này đã tồn tại hoặc đang chờ phê duyệt.', 409);
      return jsonError('supabase_error', supabaseErrorMessage(error), 502);
    }

    await writeAuditLog({
      workspaceId,
      actorId: auth.user.id,
      action: 'mailbox.request_create',
      targetType: 'mailbox_request',
      targetId: data.id,
      metadata: { emailAddress, domainId, quotaMb },
    });

    await notifyPlatformLogimailApprovalRequested({
      requestId: data.id,
      requestType: 'mailbox',
      requesterUserId: auth.user.id,
      requesterEmail: auth.user.email ?? null,
      workspaceId,
      targetValue: emailAddress,
      domain: domain.domain,
      emailAddress,
      displayName: data.display_name,
      quotaMb: data.quota_mb,
      createdAt: data.created_at,
    }).catch((error) => {
      console.error('[logimail-mailbox-request] platform notification failed', error);
    });

    return jsonOk({ mailboxRequest: data, status: 'pending_admin_approval' }, { status: 202 });
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Payload không hợp lệ.', 400);
  }
}
