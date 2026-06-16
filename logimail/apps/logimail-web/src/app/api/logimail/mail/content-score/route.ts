import { jsonError, jsonOk } from '@/lib/api-boundary';
import { requireMailSession } from '@/lib/mail-api';
import { readJsonObject, stringField } from '@/lib/logimail-store';
import { scoreContent } from '@/lib/deliverability/content-score';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const context = await requireMailSession(request, 'read');
  if (!context.ok) return context.response;
  try {
    const body = await readJsonObject(request);
    const result = scoreContent({
      subject: stringField(body, 'subject', { max: 998 }),
      text: stringField(body, 'text', { max: 200_000 }),
      html: stringField(body, 'html', { max: 500_000 }),
    });
    return jsonOk({ score: result });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    return jsonError('content_score_failed', 'Không chấm điểm được nội dung.', 400);
  }
}
