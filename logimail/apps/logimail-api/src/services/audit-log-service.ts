export type AuditEvent = {
  workspaceId?: string;
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(event: AuditEvent) {
  return {
    ok: true,
    queued: true,
    action: event.action,
  };
}
