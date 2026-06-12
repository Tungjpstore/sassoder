import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { resolveAuthorizedMailbox } from '@/lib/mail-access';
import {
  createLogimailServiceStore,
  createLogimailStore,
  normalizeMailboxLocalPart,
  normalizeUuid,
  readJsonObject,
  stringField,
  supabaseErrorMessage,
} from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'read');
  if (!auth.ok) return auth.response;

  const store = createLogimailStore(auth.token);
  const { data, error } = await store
    .from('mailbox_aliases')
    .select('id,workspace_id,mailbox_id,domain_id,local_part,alias_email,display_name,status,provider_alias_id,created_by,metadata,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return jsonError('supabase_error', supabaseErrorMessage(error), 502);
  return jsonOk({ aliases: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonObject(request);
    const mailboxId = normalizeUuid(stringField(body, 'mailboxId', { required: true }) ?? '', 'mailboxId');
    const localPart = normalizeMailboxLocalPart(stringField(body, 'localPart', { required: true, max: 64 }) ?? '');
    const displayName = stringField(body, 'displayName', { max: 120 });
    const mailbox = await resolveAuthorizedMailbox(auth.user, mailboxId);
    if (!mailbox) return jsonError('mailbox_forbidden', 'Bạn không có quyền truy cập mailbox này.', 403);
    if (mailbox.permission !== 'admin') return jsonError('forbidden', 'Chỉ mailbox admin mới được yêu cầu alias.', 403);
    if (!mailbox.domain) return jsonError('domain_not_found', 'Mailbox chưa có domain hợp lệ.', 409);

    const aliasEmail = `${localPart}@${mailbox.domain}`;
    if (aliasEmail === mailbox.emailAddress) return jsonError('alias_conflict', 'Alias không được trùng mailbox chính.', 409);

    const serviceStore = createLogimailServiceStore();
    if (!serviceStore) return jsonError('not_configured', 'Thiếu Supabase service role cho alias.', 503);

    const [mailboxConflict, aliasConflict] = await Promise.all([
      serviceStore.from('mailboxes').select('id').eq('email_address', aliasEmail).maybeSingle(),
      serviceStore.from('mailbox_aliases').select('id').eq('alias_email', aliasEmail).maybeSingle(),
    ]);
    if (mailboxConflict.error) return jsonError('supabase_error', supabaseErrorMessage(mailboxConflict.error), 502);
    if (aliasConflict.error) return jsonError('supabase_error', supabaseErrorMessage(aliasConflict.error), 502);
    if (mailboxConflict.data || aliasConflict.data) return jsonError('alias_unavailable', 'Alias này đã tồn tại hoặc đang chờ xử lý.', 409);

    const { data, error } = await serviceStore
      .from('mailbox_aliases')
      .insert({
        workspace_id: mailbox.workspaceId,
        mailbox_id: mailbox.id,
        domain_id: mailbox.domainId,
        local_part: localPart,
        alias_email: aliasEmail,
        display_name: displayName,
        status: 'pending',
        created_by: auth.user.id,
        metadata: {
          source: 'logimail-web-api',
          provider: mailbox.provider,
          provider_status: 'provider_alias_endpoint_not_configured',
        },
      })
      .select('id,workspace_id,mailbox_id,domain_id,local_part,alias_email,display_name,status,created_at,updated_at')
      .single();

    if (error) {
      if (error.code === '23505') return jsonError('alias_unavailable', 'Alias này đã tồn tại hoặc đang chờ xử lý.', 409);
      return jsonError('supabase_error', supabaseErrorMessage(error), 502);
    }

    await writeAuditLog({
      workspaceId: mailbox.workspaceId,
      actorId: auth.user.id,
      action: 'mail.alias.request_create',
      targetType: 'mailbox_alias',
      targetId: data.id,
      metadata: { aliasEmail, mailboxId: mailbox.id, provider: mailbox.provider },
    });

    return jsonOk({ alias: data, status: 'pending_provider_alias' }, { status: 202 });
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Payload không hợp lệ.', 400);
  }
}
