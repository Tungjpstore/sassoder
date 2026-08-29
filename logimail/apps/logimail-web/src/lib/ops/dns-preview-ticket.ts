import 'server-only';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';

const PREVIEW_TTL_MS = 5 * 60 * 1000;

type PreviewTicketRow = {
  id: string;
  workspace_id: string;
  domain_id: string;
  actor_id: string;
  digest: string;
  confirmation_text: string;
  status: 'issued' | 'applying' | 'consumed' | 'superseded' | 'expired';
  expires_at: string;
  consumed_at: string | null;
};

function store() {
  const db = createLogimailServiceStore();
  if (!db) throw new Error('dns_preview_store_not_configured');
  return db;
}

export function dnsConfirmationText(domain: string, digest: string) {
  return `APPLY ${domain.trim().toLowerCase()} ${digest.slice(0, 12).toUpperCase()}`;
}

export async function supersedeDnsPreviewTickets(domainId: string) {
  const db = store();
  const now = new Date().toISOString();
  const { error: expiryError } = await db
    .from('dns_provision_previews')
    .update({ status: 'expired' })
    .eq('domain_id', domainId)
    .in('status', ['issued', 'applying'])
    .lte('expires_at', now);
  if (expiryError) throw new Error(supabaseErrorMessage(expiryError));

  const { error } = await db
    .from('dns_provision_previews')
    .update({ status: 'superseded' })
    .eq('domain_id', domainId)
    .eq('status', 'issued');
  if (error) throw new Error(supabaseErrorMessage(error));
}

export async function issueDnsPreviewTicket(input: {
  workspaceId: string;
  domainId: string;
  actorId: string;
  digest: string;
  confirmationText: string;
}) {
  const db = store();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PREVIEW_TTL_MS).toISOString();

  await supersedeDnsPreviewTickets(input.domainId);

  const { data, error } = await db
    .from('dns_provision_previews')
    .insert({
      workspace_id: input.workspaceId,
      domain_id: input.domainId,
      actor_id: input.actorId,
      digest: input.digest,
      confirmation_text: input.confirmationText,
      expires_at: expiresAt,
    })
    .select('id,expires_at')
    .single();
  if (error?.code === '23505') throw new Error('dns_preview_apply_in_progress');
  if (error || !data) throw new Error(error ? supabaseErrorMessage(error) : 'dns_preview_issue_failed');
  return { id: String(data.id), expiresAt: String(data.expires_at) };
}

export async function consumeDnsPreviewTicket(input: {
  previewId: string;
  workspaceId: string;
  domainId: string;
  actorId: string;
  digest: string;
  confirmationText: string;
}) {
  const db = store();
  const consumedAt = new Date().toISOString();
  const { data, error } = await db
    .from('dns_provision_previews')
    .update({ status: 'applying' })
    .eq('id', input.previewId)
    .eq('workspace_id', input.workspaceId)
    .eq('domain_id', input.domainId)
    .eq('actor_id', input.actorId)
    .eq('digest', input.digest)
    .eq('confirmation_text', input.confirmationText)
    .eq('status', 'issued')
    .gt('expires_at', consumedAt)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (data) return { consumed: true as const };

  const { data: existing, error: lookupError } = await db
    .from('dns_provision_previews')
    .select('id,workspace_id,domain_id,actor_id,digest,confirmation_text,status,expires_at,consumed_at')
    .eq('id', input.previewId)
    .maybeSingle();
  if (lookupError) throw new Error(supabaseErrorMessage(lookupError));
  const ticket = existing as PreviewTicketRow | null;
  if (!ticket) throw new Error('dns_preview_invalid');
  if (ticket.status === 'applying' || ticket.status === 'consumed' || ticket.consumed_at) throw new Error('dns_preview_replayed');
  if (ticket.status === 'superseded') throw new Error('dns_preview_superseded');
  if (ticket.status === 'expired' || Date.parse(ticket.expires_at) <= Date.now()) throw new Error('dns_preview_expired');
  throw new Error('dns_preview_confirmation_invalid');
}

export async function completeDnsPreviewTicket(previewId: string) {
  const consumedAt = new Date().toISOString();
  const { data, error } = await store()
    .from('dns_provision_previews')
    .update({ status: 'consumed', consumed_at: consumedAt })
    .eq('id', previewId)
    .eq('status', 'applying')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) throw new Error('dns_preview_completion_failed');
}

export function dnsPreviewTicketError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'dns_preview_ticket_error');
  if (message === 'dns_preview_store_not_configured') return { code: message, status: 503, text: 'Thiếu service role cho DNS preview ticket.' };
  if (message === 'dns_preview_replayed') return { code: message, status: 409, text: 'DNS preview này đã được sử dụng. Hãy tải preview mới.' };
  if (message === 'dns_preview_superseded') return { code: message, status: 409, text: 'DNS preview đã bị thay thế bởi một preview mới hơn.' };
  if (message === 'dns_preview_expired') return { code: message, status: 409, text: 'DNS preview đã hết hạn. Hãy tải preview mới.' };
  if (message === 'dns_preview_apply_in_progress') return { code: message, status: 409, text: 'Một lần áp dụng DNS khác đang chạy cho domain này.' };
  if (message === 'dns_preview_invalid' || message === 'dns_preview_confirmation_invalid') {
    return { code: message, status: 409, text: 'DNS preview hoặc câu xác nhận không hợp lệ.' };
  }
  return { code: 'dns_preview_ticket_failed', status: 502, text: message };
}
