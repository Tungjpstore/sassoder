import { jsonOk, requireServerConfig } from '@/lib/api-boundary';

export function GET() {
  const missing = requireServerConfig([
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'BILLIONMAIL_BASE_URL',
    'CLOUDFLARE_ZONE_ID',
  ]);

  return jsonOk({
    service: 'logimail-web-api',
    status: missing.length === 0 ? 'ready' : 'not_configured',
    missing,
  });
}
