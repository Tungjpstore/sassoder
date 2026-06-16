import { jsonError, jsonOk } from '@/lib/api-boundary';
import { normalizeEmail, normalizeUuid, readJsonObject, stringField } from '@/lib/logimail-store';
import { verifyIngestKey } from '@/lib/ingest-auth';
import { bounceError, processBounceEvent } from '@/lib/deliverability/bounce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!verifyIngestKey(request)) return jsonError('unauthorized', 'Thiếu hoặc sai khóa ingest.', 401);
  try {
    const body = await readJsonObject(request);
    const workspaceId = normalizeUuid(stringField(body, 'workspaceId', { required: true }) ?? '', 'workspaceId');
    const recipientEmail = normalizeEmail(stringField(body, 'recipientEmail', { required: true }) ?? '');
    const result = await processBounceEvent({
      workspaceId,
      recipientEmail,
      senderEmail: stringField(body, 'senderEmail', { max: 254 }),
      subject: stringField(body, 'subject', { max: 998 }),
      eventType: stringField(body, 'eventType', { max: 32 }),
      smtpCode: stringField(body, 'smtpCode', { max: 16 }),
      reason: stringField(body, 'reason', { max: 998 }),
      providerMessageId: stringField(body, 'providerMessageId', { max: 255 }),
    });
    return jsonOk({ result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = bounceError(error);
    return jsonError('bounce_ingest_failed', mapped.text, mapped.status);
  }
}
