import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { buildSafeDnsPlan, normalizeUuid, readJsonObject, stringField } from '@/lib/logimail-store';
import { getDomain } from '@/lib/admin-service';
import { completeDnsPreviewTicket, consumeDnsPreviewTicket, dnsConfirmationText, dnsPreviewTicketError, issueDnsPreviewTicket, supersedeDnsPreviewTickets } from '@/lib/ops/dns-preview-ticket';
import { dnsProvisionerError, previewDnsPlan, provisionDnsPlan } from '@/lib/ops/dns-provisioner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function loadPlan(domainId: string) {
  const domain = await getDomain(domainId);
  if (!domain) throw new Error('domain_not_found');
  if (domain.approval_status !== 'approved' || domain.status === 'disabled') throw new Error('domain_not_provisionable');

  const vpsIp = process.env.LOGIMAIL_VPS_IP?.trim() || '';
  if (!vpsIp) throw new Error('missing_vps_ip');
  const mailHostname = domain.mail_hostname ?? `mail.${domain.domain}`;
  return { domain, planned: buildSafeDnsPlan(domain.domain, vpsIp, mailHostname).map((record) => ({ ...record })) };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request, 'read');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const domainId = normalizeUuid(id, 'domainId');
    const { domain, planned } = await loadPlan(domainId);
    const preview = await previewDnsPlan({ targetDomain: domain.domain, planned });
    const mutationCount = preview.changes.filter((change) => change.action === 'create' || change.action === 'update').length;
    const confirmationText = mutationCount > 0 && preview.status !== 'blocked'
      ? dnsConfirmationText(domain.domain, preview.digest)
      : null;
    if (!confirmationText) await supersedeDnsPreviewTickets(domain.id);
    const ticket = confirmationText
      ? await issueDnsPreviewTicket({
          workspaceId: domain.workspace_id,
          domainId: domain.id,
          actorId: admin.user.id,
          digest: preview.digest,
          confirmationText,
        })
      : null;
    return jsonOk({
      preview: {
        ...preview,
        confirmation: ticket ? { previewId: ticket.id, text: confirmationText, expiresAt: ticket.expiresAt } : null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    if (error instanceof Error && error.message === 'domain_not_found') return jsonError('domain_not_found', 'Không tìm thấy domain.', 404);
    if (error instanceof Error && error.message === 'domain_not_provisionable') return jsonError('domain_not_provisionable', 'Domain chưa được duyệt hoặc đã bị vô hiệu hóa.', 409);
    if (error instanceof Error && error.message === 'missing_vps_ip') return jsonError('missing_vps_ip', 'Thiếu LOGIMAIL_VPS_IP để dựng DNS plan.', 503);
    if (error instanceof Error && error.message.startsWith('dns_preview_')) {
      const ticketError = dnsPreviewTicketError(error);
      return jsonError(ticketError.code, ticketError.text, ticketError.status);
    }
    const mapped = dnsProvisionerError(error);
    return jsonError('dns_preview_failed', mapped.text, mapped.status);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  // Dangerous: provisioning live DNS requires the confirm header.
  const admin = await requireAdmin(request, 'dangerous');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const domainId = normalizeUuid(id, 'domainId');
    const body = await readJsonObject(request);

    if (body.zoneId !== undefined || body.planned !== undefined || body.targetDomain !== undefined) {
      return jsonError('server_managed_dns_plan', 'Zone và DNS plan được khóa theo cấu hình server của domain.', 400);
    }
    if (body.allowModify !== undefined) return jsonError('server_managed_dns_confirmation', 'Quyền cập nhật DNS được quyết định từ preview ticket.', 400);

    const { domain, planned } = await loadPlan(domainId);
    const previewIdValue = stringField(body, 'previewId');
    const expectedPreviewDigest = stringField(body, 'expectedPreviewDigest', { max: 64 }) ?? '';
    const confirmationText = stringField(body, 'confirmationText', { max: 160 }) ?? '';
    if (!previewIdValue || !expectedPreviewDigest || !confirmationText) {
      return jsonError('preview_required', 'Hãy tải preview mới và nhập đúng câu xác nhận trước khi áp dụng DNS.', 409);
    }
    const previewId = normalizeUuid(previewIdValue, 'previewId');
    if (!/^[0-9a-f]{64}$/.test(expectedPreviewDigest)) return jsonError('invalid_preview_digest', 'DNS preview digest không hợp lệ.', 400);

    let ticketClaimed = false;
    try {
      const result = await provisionDnsPlan({
        planned,
        allowModify: true,
        actor: actorLabel(admin.user),
        actorId: admin.user.id,
        workspaceId: domain.workspace_id,
        domainId: domain.id,
        targetDomain: domain.domain,
        expectedPreviewDigest,
        beforeApply: async (freshPreview) => {
          await consumeDnsPreviewTicket({
            previewId,
            workspaceId: domain.workspace_id,
            domainId: domain.id,
            actorId: admin.user.id,
            digest: freshPreview.digest,
            confirmationText,
          });
          ticketClaimed = true;
        },
      });
      return jsonOk({ result });
    } finally {
      if (ticketClaimed) await completeDnsPreviewTicket(previewId);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    if (error instanceof Error && error.message === 'domain_not_found') return jsonError('domain_not_found', 'Không tìm thấy domain.', 404);
    if (error instanceof Error && error.message === 'domain_not_provisionable') return jsonError('domain_not_provisionable', 'Domain chưa được duyệt hoặc đã bị vô hiệu hóa.', 409);
    if (error instanceof Error && error.message === 'missing_vps_ip') return jsonError('missing_vps_ip', 'Thiếu LOGIMAIL_VPS_IP để dựng DNS plan.', 503);
    if (error instanceof Error && error.message === 'dns_preview_stale') {
      const mapped = dnsProvisionerError(error);
      return jsonError('dns_preview_stale', mapped.text, mapped.status);
    }
    if (error instanceof Error && error.message.startsWith('dns_preview_')) {
      const ticketError = dnsPreviewTicketError(error);
      return jsonError(ticketError.code, ticketError.text, ticketError.status);
    }
    const mapped = dnsProvisionerError(error);
    return jsonError('dns_provision_failed', mapped.text, mapped.status);
  }
}
