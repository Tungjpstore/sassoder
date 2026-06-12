import { jsonOk, requireAuth } from '@/lib/api-boundary';

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'read');
  if (!auth.ok) return auth.response;

  return jsonOk({ status: 'not_connected', checks: [] });
}
