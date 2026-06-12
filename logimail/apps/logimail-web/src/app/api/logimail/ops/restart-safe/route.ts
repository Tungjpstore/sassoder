import { jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'dangerous');
  if (!auth.ok) return auth.response;

  await writeAuditLog({
    actorId: auth.user.id,
    action: 'ops.restart_safe.request',
    targetType: 'ops',
    targetId: 'restart-safe',
    metadata: { whitelist: ['postfix', 'dovecot', 'rspamd', 'webmail'] },
  });

  return jsonOk({ status: 'audit_logged_requires_vps_worker', whitelist: ['postfix', 'dovecot', 'rspamd', 'webmail'] }, { status: 202 });
}
