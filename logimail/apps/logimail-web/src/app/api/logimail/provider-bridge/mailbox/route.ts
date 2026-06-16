import { NextResponse } from 'next/server';
import {
  createBillionMailMailboxDirect,
  deleteBillionMailMailboxDirect,
  updateBillionMailMailboxPasswordDirect,
  type MailboxInput,
} from '@/lib/billionmail-provider';
import { readJsonObject } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type BridgeAction = 'create' | 'update' | 'delete';

function jsonError(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function bearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

function requireBridgeAuth(request: Request) {
  const expected = process.env.BILLIONMAIL_BRIDGE_TOKEN?.trim() || process.env.LOGIMAIL_BILLIONMAIL_BRIDGE_TOKEN?.trim() || '';
  if (!expected) return jsonError('bridge_not_configured', 'BillionMail bridge chưa được cấu hình.', 503);
  if (bearerToken(request) !== expected) return jsonError('unauthorized', 'Bridge token không hợp lệ.', 401);
  return null;
}

function mailboxPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_payload');
  const payload = value as Partial<MailboxInput>;
  for (const key of ['email', 'localPart', 'domain', 'password'] as const) {
    if (typeof payload[key] !== 'string' || !payload[key]?.trim()) throw new Error('invalid_payload');
  }
  return payload as MailboxInput;
}

export async function POST(request: Request) {
  const authError = requireBridgeAuth(request);
  if (authError) return authError;

  try {
    const body = await readJsonObject(request);
    const action = body.action as BridgeAction;
    if (action === 'create') {
      const result = await createBillionMailMailboxDirect(mailboxPayload(body.payload));
      return NextResponse.json({ ok: true, data: result });
    }
    if (action === 'update') {
      const result = await updateBillionMailMailboxPasswordDirect(mailboxPayload(body.payload));
      return NextResponse.json({ ok: true, data: result });
    }
    if (action === 'delete') {
      const payload = body.payload as { email?: unknown } | undefined;
      if (!payload || typeof payload.email !== 'string' || !payload.email.trim()) throw new Error('invalid_payload');
      const result = await deleteBillionMailMailboxDirect(payload.email);
      return NextResponse.json({ ok: true, data: result });
    }
    return jsonError('invalid_action', 'Bridge action không hợp lệ.', 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'bridge_failed';
    return jsonError('bridge_failed', message, 502);
  }
}
