import { jsonOk } from '@/lib/api-boundary';
import { requireAuth } from '@/lib/api-boundary';
import { webPushReadiness } from '@/lib/web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'read');
  if (!auth.ok) return auth.response;
  const readiness = webPushReadiness();
  return jsonOk({
    ready: readiness.ready,
    publicKey: readiness.publicKey,
    missing: readiness.missing,
  });
}
