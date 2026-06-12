import { assertBillionMailReady } from './billionmail-service.js';
import { assertCloudflareReady } from './cloudflare-dns-service.js';

export function getHealth() {
  return {
    ok: true,
    service: 'logimail-api',
    billionmail: assertBillionMailReady(),
    cloudflare: assertCloudflareReady(),
  };
}
