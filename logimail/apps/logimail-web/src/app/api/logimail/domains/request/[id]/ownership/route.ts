import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { verifyDomainOwnership, type DomainOwnershipChallenge } from '@/lib/domain-ownership';
import { createLogimailServiceStore, createLogimailStore, normalizeUuid, supabaseErrorMessage } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type OwnershipMetadata = {
  challenge?: DomainOwnershipChallenge;
  status?: 'pending' | 'verified';
  verifiedAt?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function ownershipFrom(metadata: unknown): OwnershipMetadata {
  const root = asRecord(metadata);
  return asRecord(root.ownership) as OwnershipMetadata;
}

async function authorizedRequest(request: Request, id: string, mode: 'read' | 'write') {
  const auth = await requireAuth(request, mode);
  if (!auth.ok) return { response: auth.response } as const;

  const requestId = normalizeUuid(id, 'requestId');
  const store = createLogimailStore(auth.token);
  const { data, error } = await store
    .from('domain_requests')
    .select('id,workspace_id,requested_by,domain,status,risk_flags,metadata')
    .eq('id', requestId)
    .maybeSingle();
  if (error) return { response: jsonError('supabase_error', supabaseErrorMessage(error), 502) } as const;
  if (!data) return { response: jsonError('not_found', 'Không tìm thấy yêu cầu domain hoặc bạn không có quyền truy cập.', 404) } as const;
  return { auth, domainRequest: data as {
    id: string;
    workspace_id: string;
    requested_by: string;
    domain: string;
    status: string;
    risk_flags: string[];
    metadata: unknown;
  } } as const;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await authorizedRequest(request, id, 'read');
    if ('response' in result) return result.response;
    const ownership = ownershipFrom(result.domainRequest.metadata);
    if (!ownership.challenge) return jsonError('challenge_missing', 'Yêu cầu này chưa có ownership challenge.', 409);
    return jsonOk({
      requestId: result.domainRequest.id,
      domain: result.domainRequest.domain,
      status: ownership.status ?? 'pending',
      verifiedAt: ownership.verifiedAt ?? null,
      record: {
        name: ownership.challenge.name,
        type: ownership.challenge.type,
        content: ownership.challenge.content,
      },
    });
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Request không hợp lệ.', 400);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await authorizedRequest(request, id, 'write');
    if ('response' in result) return result.response;
    if (result.domainRequest.status !== 'pending') return jsonError('request_not_pending', 'Yêu cầu domain không còn ở trạng thái chờ.', 409);

    const metadata = asRecord(result.domainRequest.metadata);
    const ownership = ownershipFrom(metadata);
    if (!ownership.challenge) return jsonError('challenge_missing', 'Yêu cầu này chưa có ownership challenge.', 409);

    const verification = await verifyDomainOwnership(ownership.challenge);
    const now = new Date().toISOString();
    const nextOwnership = {
      ...ownership,
      status: verification.verified ? 'verified' : 'pending',
      verifiedAt: verification.verified ? now : null,
      lastCheckedAt: now,
      observedRecordCount: verification.observedRecords.length,
    };
    const nextRiskFlags = Array.from(new Set((result.domainRequest.risk_flags ?? []).filter((flag) => (
      verification.verified ? flag !== 'ownership_unverified' : true
    ))));
    if (!verification.verified && !nextRiskFlags.includes('ownership_unverified')) nextRiskFlags.push('ownership_unverified');

    const serviceStore = createLogimailServiceStore();
    if (!serviceStore) return jsonError('not_configured', 'Thiếu service role để lưu kết quả xác minh domain.', 503);
    const { error } = await serviceStore
      .from('domain_requests')
      .update({ metadata: { ...metadata, ownership: nextOwnership }, risk_flags: nextRiskFlags })
      .eq('id', result.domainRequest.id)
      .eq('status', 'pending');
    if (error) return jsonError('supabase_error', supabaseErrorMessage(error), 502);

    await writeAuditLog({
      workspaceId: result.domainRequest.workspace_id,
      actorId: result.auth.user.id,
      action: verification.verified ? 'domain.ownership_verified' : 'domain.ownership_check_failed',
      targetType: 'domain_request',
      targetId: result.domainRequest.id,
      metadata: { domain: result.domainRequest.domain, observedRecordCount: verification.observedRecords.length },
    });

    return jsonOk({
      verified: verification.verified,
      status: verification.verified ? 'ready_for_admin_approval' : 'awaiting_dns_propagation',
      checkedAt: now,
      observedRecordCount: verification.observedRecords.length,
    }, { status: verification.verified ? 200 : 202 });
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Request không hợp lệ.', 400);
  }
}
