import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { createLogimailServiceStore, createLogimailStore, normalizeUuid, readJsonObject, stringField, supabaseErrorMessage, type JsonObject } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function scoreFromSignals(signals: string[]) {
  const passed = signals.filter((signal) => signal === 'pass').length;
  const warnings = signals.filter((signal) => signal === 'warning').length;
  const failed = signals.filter((signal) => signal === 'fail' || signal === 'failed').length;
  return Math.max(0, Math.min(100, Math.round((passed / signals.length) * 100 - warnings * 8 - failed * 14)));
}

function optionalStatus(value: string | null) {
  if (!value) return 'unknown';
  if (!/^[a-z_]{2,32}$/.test(value)) throw new Error('invalid_status');
  return value;
}

function spamRate(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error('invalid_spam_rate');
  return parsed;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  const params = await context.params;
  let domainId: string;
  try {
    domainId = normalizeUuid(params.id, 'domainId');
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Domain id không hợp lệ.', 400);
  }

  try {
    const body: JsonObject = await readJsonObject(request).catch(() => ({}));
    const store = createLogimailStore(auth.token);
    const { data: domain, error: domainError } = await store
      .from('domains')
      .select('id,workspace_id,domain,mx_status,spf_status,dkim_status,dmarc_status,ptr_status')
      .eq('id', domainId)
      .maybeSingle();
    if (domainError) return jsonError('supabase_error', supabaseErrorMessage(domainError), 502);
    if (!domain) return jsonError('not_found', 'Không tìm thấy domain hoặc bạn không có quyền truy cập.', 404);

    const bimiStatus = optionalStatus(stringField(body, 'bimiStatus', { max: 32 }));
    const mtaStsStatus = optionalStatus(stringField(body, 'mtaStsStatus', { max: 32 }));
    const notes = stringField(body, 'notes', { max: 1000 });
    const signals = [domain.mx_status, domain.spf_status, domain.dkim_status, domain.dmarc_status, domain.ptr_status, bimiStatus, mtaStsStatus];
    const score = scoreFromSignals(signals);

    const serviceStore = createLogimailServiceStore();
    if (!serviceStore) return jsonError('not_configured', 'Thiếu Supabase service role cho deliverability.', 503);

    const { data, error } = await serviceStore
      .from('deliverability_checks')
      .insert({
        workspace_id: domain.workspace_id,
        domain_id: domain.id,
        score,
        mx_status: domain.mx_status,
        spf_status: domain.spf_status,
        dkim_status: domain.dkim_status,
        dmarc_status: domain.dmarc_status,
        ptr_status: domain.ptr_status,
        bimi_status: bimiStatus,
        mta_sts_status: mtaStsStatus,
        spam_rate: spamRate(body.spamRate),
        notes,
        checked_by: auth.user.id,
      })
      .select('id,workspace_id,domain_id,score,mx_status,spf_status,dkim_status,dmarc_status,ptr_status,bimi_status,mta_sts_status,spam_rate,notes,checked_by,created_at')
      .single();

    if (error) return jsonError('supabase_error', supabaseErrorMessage(error), 502);

    await writeAuditLog({
      workspaceId: domain.workspace_id,
      actorId: auth.user.id,
      action: 'domain.deliverability.check_create',
      targetType: 'domain',
      targetId: domain.id,
      metadata: { score, domain: domain.domain },
    });

    return jsonOk({ check: data }, { status: 201 });
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Payload không hợp lệ.', 400);
  }
}
