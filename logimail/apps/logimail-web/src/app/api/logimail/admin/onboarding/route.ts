import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { normalizeUuid, readJsonObject, stringField } from '@/lib/logimail-store';
import { generateOnboardingDnsPlan, onboardingError, selectCloudflareZone, startOnboarding, verifyOnboarding } from '@/lib/onboarding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const body = await readJsonObject(request);
    const step = stringField(body, 'step', { required: true }) ?? '';
    const actor = actorLabel(admin.user);

    if (step === 'start') {
      const workspaceId = normalizeUuid(stringField(body, 'workspaceId', { required: true }) ?? '', 'workspaceId');
      const domain = stringField(body, 'domain', { required: true, max: 253 }) ?? '';
      const mailHostname = stringField(body, 'mailHostname', { max: 253 }) ?? undefined;
      const result = await startOnboarding({ workspaceId, requestedBy: admin.user.id, domain, mailHostname, actor, actorId: admin.user.id });
      return jsonOk(result, { status: 201 });
    }

    const requestId = normalizeUuid(stringField(body, 'requestId', { required: true }) ?? '', 'requestId');
    if (step === 'zone') {
      const cloudflareZoneId = stringField(body, 'cloudflareZoneId', { required: true, max: 64 }) ?? '';
      await selectCloudflareZone({ requestId, cloudflareZoneId, actor, actorId: admin.user.id });
      return jsonOk({ ok: true });
    }
    if (step === 'dns-plan') {
      const result = await generateOnboardingDnsPlan({ requestId, actor, actorId: admin.user.id });
      return jsonOk(result);
    }
    if (step === 'verify') {
      const result = await verifyOnboarding({ requestId, actor, actorId: admin.user.id });
      return jsonOk(result);
    }
    return jsonError('invalid_step', 'Bước onboarding không hợp lệ.', 400);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = onboardingError(error);
    return jsonError('onboarding_failed', mapped.text, mapped.status);
  }
}
