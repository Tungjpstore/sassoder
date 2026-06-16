import 'server-only';

import { timingSafeEqual } from 'node:crypto';

// Cron auth: accept Vercel Cron's `Authorization: Bearer <CRON_SECRET>` or our own
// `x-logimail-cron-key` matching LOGIMAIL_CRON_KEY.

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function verifyCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const auth = request.headers.get('authorization')?.trim() ?? '';
    if (auth.toLowerCase().startsWith('bearer ') && safeEqual(auth.slice(7).trim(), cronSecret)) return true;
  }

  const key = process.env.LOGIMAIL_CRON_KEY?.trim();
  if (key) {
    const provided = request.headers.get('x-logimail-cron-key')?.trim() ?? '';
    if (safeEqual(provided, key)) return true;
  }

  return false;
}
