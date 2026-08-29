import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const MAIL_SESSION_COOKIE = 'logimail_mail_session';

const MAIL_SESSION_VERSION = 2;
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;

export type MailSession = {
  v: typeof MAIL_SESSION_VERSION;
  userId: string;
  mailboxId: string;
  sessionVersion: number;
  email: string;
  password: string;
  issuedAt: number;
  expiresAt: number;
};

export type PublicMailSession = Pick<MailSession, 'mailboxId' | 'email' | 'issuedAt' | 'expiresAt'>;

function secretMaterial() {
  const secret = process.env.LOGIMAIL_MAIL_SESSION_SECRET || process.env.LOGIMAIL_SECURITY_CODE_SECRET || '';
  if (secret.length < 16) throw new Error('missing_mail_session_secret');
  return secret;
}

function sessionKey() {
  return createHash('sha256').update(`logimail-mail-session:v1:${secretMaterial()}`).digest();
}

function safeEqualText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isMailSession(value: unknown): value is MailSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Partial<MailSession>;
  return payload.v === MAIL_SESSION_VERSION &&
    typeof payload.userId === 'string' &&
    typeof payload.mailboxId === 'string' &&
    typeof payload.sessionVersion === 'number' &&
    typeof payload.email === 'string' &&
    typeof payload.password === 'string' &&
    typeof payload.issuedAt === 'number' &&
    typeof payload.expiresAt === 'number';
}

export function createMailSession(input: { userId: string; mailboxId: string; sessionVersion: number; email: string; password: string; ttlMs?: number }): MailSession {
  const now = Date.now();
  const ttlMs = Math.min(24 * 60 * 60 * 1000, Math.max(15 * 60 * 1000, input.ttlMs ?? DEFAULT_TTL_MS));
  return {
    v: MAIL_SESSION_VERSION,
    userId: input.userId,
    mailboxId: input.mailboxId,
    sessionVersion: input.sessionVersion,
    email: input.email.toLowerCase(),
    password: input.password,
    issuedAt: now,
    expiresAt: now + ttlMs,
  };
}

export function publicMailSession(session: MailSession): PublicMailSession {
  return {
    mailboxId: session.mailboxId,
    email: session.email,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
  };
}

export function encryptMailSession(session: MailSession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sessionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptMailSession(value: string | undefined | null) {
  if (!value) return null;
  try {
    const [ivText, tagText, encryptedText] = value.split('.');
    if (!ivText || !tagText || !encryptedText) return null;
    const decipher = createDecipheriv('aes-256-gcm', sessionKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    const decoded = Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
    const payload = JSON.parse(decoded) as unknown;
    if (!isMailSession(payload) || payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function readMailSessionCookie() {
  const cookieStore = await cookies();
  return decryptMailSession(cookieStore.get(MAIL_SESSION_COOKIE)?.value);
}

export function mailSessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  };
}

export function emptyMailSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  };
}

export function mailSessionBelongsTo(session: MailSession, input: { userId: string; mailboxId?: string; sessionVersion?: number; email?: string }) {
  if (!safeEqualText(session.userId, input.userId)) return false;
  if (input.mailboxId && !safeEqualText(session.mailboxId, input.mailboxId)) return false;
  if (input.sessionVersion !== undefined && session.sessionVersion !== input.sessionVersion) return false;
  if (input.email && !safeEqualText(session.email, input.email.toLowerCase())) return false;
  return true;
}
