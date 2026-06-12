import { jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { createLogimailStore, readJsonObject, stringField, supabaseErrorMessage } from '@/lib/logimail-store';

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'read');
  if (!auth.ok) return auth.response;
  const store = createLogimailStore(auth.token);
  const [profileResult, accountRequestsResult, workspacesResult] = await Promise.all([
    store
      .from('profiles')
      .select('id,email,full_name,avatar_url,role,account_status,created_at,updated_at')
      .eq('id', auth.user.id)
      .maybeSingle(),
    store
      .from('account_requests')
      .select('id,status,requested_workspace_name,requested_slug,reviewed_at,rejection_reason,created_at,updated_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(5),
    store
      .from('workspaces')
      .select('id,name,slug,plan,status,created_at,updated_at')
      .order('created_at', { ascending: false }),
  ]);

  const profile = profileResult.error ? null : profileResult.data;
  const accountRequests = accountRequestsResult.error ? [] : accountRequestsResult.data ?? [];
  const workspaces = workspacesResult.error ? [] : workspacesResult.data ?? [];
  const accountStatus = profile?.account_status ?? accountRequests[0]?.status ?? 'unregistered';

  return jsonOk({
    user: auth.user,
    profile,
    profileError: profileResult.error ? supabaseErrorMessage(profileResult.error) : null,
    accountStatus,
    accountRequests,
    accountRequestsError: accountRequestsResult.error ? supabaseErrorMessage(accountRequestsResult.error) : null,
    workspaces,
    workspacesError: workspacesResult.error ? supabaseErrorMessage(workspacesResult.error) : null,
  });
}

function cleanAvatarUrl(value: string | null) {
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('invalid_avatar_url');
  }
  if (parsed.protocol !== 'https:') throw new Error('invalid_avatar_url');
  return parsed.toString();
}

function profileError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'profile_update_failed');
  if (message === 'invalid_avatar_url') return 'Avatar phải là URL HTTPS hợp lệ.';
  if (message === 'invalid_fullName') return 'Tên hiển thị quá dài.';
  if (message === 'invalid_avatarUrl') return 'Avatar URL quá dài.';
  return 'Không cập nhật được hồ sơ.';
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonObject(request);
    const fullName = stringField(body, 'fullName', { max: 120 });
    const avatarUrl = cleanAvatarUrl(stringField(body, 'avatarUrl', { max: 2048 }));
    const store = createLogimailStore(auth.token);
    const { data: profile, error } = await store
      .from('profiles')
      .update({ full_name: fullName, avatar_url: avatarUrl })
      .eq('id', auth.user.id)
      .select('id,email,full_name,avatar_url,role,account_status,updated_at')
      .maybeSingle();
    if (error) throw new Error(supabaseErrorMessage(error));

    await writeAuditLog({
      actorId: auth.user.id,
      action: 'profile.update_sender_identity',
      targetType: 'profile',
      targetId: auth.user.id,
      metadata: { hasAvatar: Boolean(avatarUrl) },
    });

    return jsonOk({ profile });
  } catch (error) {
    return Response.json({ ok: false, error: { code: 'profile_update_failed', message: profileError(error) } }, { status: 400 });
  }
}
