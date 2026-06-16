import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { buildSafeDnsPlan, normalizeUuid, readJsonObject, stringField } from '@/lib/logimail-store';
import { getDomain } from '@/lib/admin-service';
import { dnsProvisionerError, provisionDnsPlan } from '@/lib/ops/dns-provisioner';
import type { DnsRecord } from '@/lib/ops/dns-plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function plannedFromBody(value: unknown): DnsRecord[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((item) => {
    const record = item as Record<string, unknown>;
    return {
      type: String(record.type ?? ''),
      name: String(record.name ?? ''),
      content: String(record.content ?? ''),
      priority: typeof record.priority === 'number' ? record.priority : undefined,
      proxied: typeof record.proxied === 'boolean' ? record.proxied : undefined,
    };
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  // Dangerous: provisioning live DNS requires the confirm header.
  const admin = await requireAdmin(request, 'dangerous');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const domainId = normalizeUuid(id, 'domainId');
    const body = await readJsonObject(request);

    const zoneId = stringField(body, 'zoneId', { max: 64 }) ?? process.env.CLOUDFLARE_ZONE_ID?.trim() ?? '';
    if (!zoneId) return jsonError('missing_zone', 'Thiếu Cloudflare zoneId.', 400);

    let planned = plannedFromBody(body.planned);
    if (!planned || planned.length === 0) {
      const domain = await getDomain(domainId);
      if (!domain) return jsonError('domain_not_found', 'Không tìm thấy domain.', 404);
      const vpsIp = process.env.LOGIMAIL_VPS_IP?.trim() || '';
      if (!vpsIp) return jsonError('missing_vps_ip', 'Thiếu LOGIMAIL_VPS_IP để dựng plan mặc định.', 400);
      planned = buildSafeDnsPlan(domain.domain, vpsIp, domain.mail_hostname ?? `mail.${domain.domain}`) as unknown as DnsRecord[];
    }

    const allowModify = body.allowModify === true || body.allowModify === 'true';
    const result = await provisionDnsPlan({ zoneId, planned, allowModify, actor: actorLabel(admin.user), actorId: admin.user.id });
    return jsonOk({ result });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = dnsProvisionerError(error);
    return jsonError('dns_provision_failed', mapped.text, mapped.status);
  }
}
