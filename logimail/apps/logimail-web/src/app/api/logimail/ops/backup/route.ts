import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { createLogimailServiceStore, createLogimailStore, normalizeUuid, readJsonObject, stringField, supabaseErrorMessage } from '@/lib/logimail-store';

function scopeField(value: string | null) {
  const scope = value ?? 'workspace';
  if (!['workspace', 'domain', 'mailbox'].includes(scope)) throw new Error('invalid_scope');
  return scope;
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonObject(request).catch(() => ({}));
    const scope = scopeField(stringField(body, 'scope', { max: 32 }));
    const workspaceIdRaw = stringField(body, 'workspaceId', { max: 64 });
    const domainIdRaw = stringField(body, 'domainId', { max: 64 });
    const mailboxIdRaw = stringField(body, 'mailboxId', { max: 64 });
    const store = createLogimailStore(auth.token);

    let workspaceId = workspaceIdRaw ? normalizeUuid(workspaceIdRaw, 'workspaceId') : null;
    if (!workspaceId) {
      const { data: workspaces, error } = await store.from('workspaces').select('id,status').order('created_at', { ascending: false }).limit(1);
      if (error) throw new Error(supabaseErrorMessage(error));
      workspaceId = workspaces?.[0]?.id ?? null;
    }
    if (!workspaceId) throw new Error('missing_workspace');

    const serviceStore = createLogimailServiceStore();
    if (!serviceStore) throw new Error('not_configured');

    const { data, error } = await serviceStore
      .from('backup_jobs')
      .insert({
        workspace_id: workspaceId,
        scope,
        domain_id: domainIdRaw ? normalizeUuid(domainIdRaw, 'domainId') : null,
        mailbox_id: mailboxIdRaw ? normalizeUuid(mailboxIdRaw, 'mailboxId') : null,
        status: 'requested',
        requested_by: auth.user.id,
        metadata: { source: 'logimail-web-api', policy: 'vps_worker_required' },
      })
      .select('id,workspace_id,scope,domain_id,mailbox_id,status,requested_by,started_at,completed_at,artifact_uri,error_message,metadata,created_at,updated_at')
      .single();

    if (error) throw new Error(supabaseErrorMessage(error));

    await writeAuditLog({
      workspaceId,
      actorId: auth.user.id,
      action: 'ops.backup.request',
      targetType: 'backup_job',
      targetId: data.id,
      metadata: { scope, status: 'requested' },
    });

    return jsonOk({ backupJob: data, status: 'requested', policy: 'Server-side backup only; VPS worker/runbook executes the job.' }, { status: 202 });
  } catch (error) {
    return jsonError('backup_request_failed', error instanceof Error ? error.message : 'Không tạo được backup job.', 400);
  }
}
