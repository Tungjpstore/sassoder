import { jsonOk, requireServerConfig } from '@/lib/api-boundary';
import { billionMailProviderReadiness } from '@/lib/billionmail-config';

export function GET() {
  const missing = requireServerConfig(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'CLOUDFLARE_ZONE_ID']);
  const billionmail = billionMailProviderReadiness();

  return jsonOk({
    service: 'logimail-web-api',
    status: missing.length === 0 && billionmail.ready ? 'ready' : 'not_configured',
    missing: [...missing, ...billionmail.missing],
    billionmail: { ready: billionmail.ready, mode: billionmail.mode },
  });
}
