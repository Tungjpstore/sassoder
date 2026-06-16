import 'server-only';

import { timingSafeEqual } from 'node:crypto';

// Shared signed-key auth for ingestion endpoints (R5, R6). The caller must send
// `x-logimail-ingest-key` matching LOGIMAIL_INGEST_KEY.

export function verifyIngestKey(request: Request): boolean {
  const expected = process.env.LOGIMAIL_INGEST_KEY?.trim() ?? '';
  if (!expected) return false;
  const provided = request.headers.get('x-logimail-ingest-key')?.trim() ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
