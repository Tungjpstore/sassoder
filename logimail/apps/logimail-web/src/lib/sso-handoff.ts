import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  DOMAIN_CONTROL_HOST,
  DOMAIN_CONTROL_PREFIXES,
  MAIL_HOST,
  MAILBOX_PREFIXES,
  hostnameFromAuthority,
  hostnameFromHeaders,
  isLocalHost,
  startsWithPath,
} from './logimail-hosts';
import { safeNextPath } from './safe-next-path';

export type SsoSurface = 'mail' | 'domain';

type SsoTicketPayload = {
  v: 1;
  id: string;
  nonce: string;
  sourceHost: string;
  targetHost: string;
  iat: number;
  exp: number;
};

type SsoStatePayload = {
  v: 1;
  state: string;
  verifier: string;
  sourceHost: string;
  targetHost: string;
  target: SsoSurface;
  next: string;
  iat: number;
  exp: number;
};

const SSO_TTL_SECONDS = 60;
const SSO_MAX_TTL_SECONDS = 90;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SENSITIVE_NEXT_QUERY_KEYS = new Set([
  'access_token',
  'refresh_token',
  'id_token',
  'token',
  'token_hash',
  'code',
  'otp',
  'email',
  'verifier',
  'challenge',
]);
const SENSITIVE_NEXT_QUERY_PATTERN = /(?:^|[?&])(?:access_token|refresh_token|id_token|token|token_hash|code|otp|email|verifier|challenge)=/i;

function ssoSecret() {
  const secret = process.env.LOGIMAIL_SSO_SECRET ?? '';
  if (secret.length < 32) throw new Error('missing_sso_secret');
  return secret;
}

function encodePayload(payload: SsoTicketPayload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function signPayload(purpose: 'ticket' | 'state', encodedPayload: string) {
  return createHmac('sha256', ssoSecret()).update(`${purpose}.${encodedPayload}`).digest('base64url');
}

function safeSignatureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isAllowedSsoHost(hostname: string) {
  return hostname === MAIL_HOST || hostname === DOMAIN_CONTROL_HOST || isLocalHost(hostname);
}

function assertHostPair(sourceHost: string, targetHost: string) {
  if (!isAllowedSsoHost(sourceHost) || !isAllowedSsoHost(targetHost)) throw new Error('invalid_sso_host');
  const localPair = isLocalHost(sourceHost) && isLocalHost(targetHost);
  if (!localPair && sourceHost === targetHost) throw new Error('invalid_sso_target');
  if (isLocalHost(sourceHost) !== isLocalHost(targetHost)) throw new Error('invalid_sso_host_pair');
}

function isTicketPayload(value: unknown): value is SsoTicketPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Partial<SsoTicketPayload>;
  return payload.v === 1
    && typeof payload.id === 'string' && UUID_PATTERN.test(payload.id)
    && typeof payload.nonce === 'string' && payload.nonce.length >= 43 && BASE64URL_PATTERN.test(payload.nonce)
    && typeof payload.sourceHost === 'string'
    && typeof payload.targetHost === 'string'
    && typeof payload.iat === 'number' && Number.isInteger(payload.iat)
    && typeof payload.exp === 'number' && Number.isInteger(payload.exp);
}

function isStatePayload(value: unknown): value is SsoStatePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Partial<SsoStatePayload>;
  return payload.v === 1
    && typeof payload.state === 'string' && payload.state.length >= 43 && BASE64URL_PATTERN.test(payload.state)
    && typeof payload.verifier === 'string' && PKCE_VERIFIER_PATTERN.test(payload.verifier)
    && typeof payload.sourceHost === 'string'
    && typeof payload.targetHost === 'string'
    && (payload.target === 'mail' || payload.target === 'domain')
    && typeof payload.next === 'string'
    && typeof payload.iat === 'number' && Number.isInteger(payload.iat)
    && typeof payload.exp === 'number' && Number.isInteger(payload.exp);
}

export function normalizeSsoSurface(value: string): SsoSurface {
  if (value !== 'mail' && value !== 'domain') throw new Error('invalid_sso_target');
  return value;
}

export function targetHostForSurface(surface: SsoSurface) {
  return surface === 'mail' ? MAIL_HOST : DOMAIN_CONTROL_HOST;
}

export function resolveSsoTarget(input: { sourceHost: string; sourceOrigin: string; target: SsoSurface }) {
  const sourceHost = input.sourceHost.toLowerCase();
  if (!isAllowedSsoHost(sourceHost)) throw new Error('invalid_sso_source');

  if (isLocalHost(sourceHost)) {
    return { targetHost: sourceHost, targetOrigin: input.sourceOrigin };
  }

  const targetHost = targetHostForSurface(input.target);
  assertHostPair(sourceHost, targetHost);
  return { targetHost, targetOrigin: `https://${targetHost}` };
}

export function safeSsoNextPath(surface: SsoSurface, value: string | null | undefined, local = false) {
  const fallback = surface === 'mail' ? '/mail/inbox' : '/';
  const path = safeNextPath(value, { fallback });
  let parsed: URL;
  try {
    parsed = new URL(path, 'https://logimail.invalid');
  } catch {
    return fallback;
  }
  for (const key of parsed.searchParams.keys()) {
    if (SENSITIVE_NEXT_QUERY_KEYS.has(key.toLowerCase())) return fallback;
  }
  try {
    if (SENSITIVE_NEXT_QUERY_PATTERN.test(decodeURIComponent(parsed.search))) return fallback;
  } catch {
    return fallback;
  }
  if (local) return path;

  const pathname = parsed.pathname;
  if (surface === 'mail') {
    return startsWithPath(pathname, MAILBOX_PREFIXES) && pathname !== '/auth/callback' ? path : fallback;
  }

  const allowed = pathname === '/'
    || pathname === '/dashboard'
    || pathname.startsWith('/dashboard/')
    || startsWithPath(pathname, DOMAIN_CONTROL_PREFIXES);
  return allowed ? path : fallback;
}

export function assertPkceChallenge(value: string) {
  if (!PKCE_CHALLENGE_PATTERN.test(value)) throw new Error('invalid_code_challenge');
  return value;
}

export function assertPkceVerifier(value: string) {
  if (!PKCE_VERIFIER_PATTERN.test(value)) throw new Error('invalid_code_verifier');
  return value;
}

export function pkceChallengeForVerifier(verifier: string) {
  return createHash('sha256').update(assertPkceVerifier(verifier), 'ascii').digest('base64url');
}

export function hashSsoNonce(nonce: string) {
  if (nonce.length < 43 || !BASE64URL_PATTERN.test(nonce)) throw new Error('invalid_sso_nonce');
  return createHash('sha256').update(nonce, 'ascii').digest('hex');
}

export function hashSsoState(state: string) {
  if (state.length < 43 || !BASE64URL_PATTERN.test(state)) throw new Error('invalid_sso_state');
  return createHash('sha256').update(state, 'ascii').digest('hex');
}

export function createSsoBrowserState(input: {
  sourceHost: string;
  targetHost: string;
  target: SsoSurface;
  nextPath: string;
  now?: number;
}) {
  const sourceHost = input.sourceHost.toLowerCase();
  const targetHost = input.targetHost.toLowerCase();
  assertHostPair(sourceHost, targetHost);
  const local = isLocalHost(targetHost);
  const next = safeSsoNextPath(input.target, input.nextPath, local);
  const issuedAt = Math.floor((input.now ?? Date.now()) / 1000);
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const payload: SsoStatePayload = {
    v: 1,
    state,
    verifier,
    sourceHost,
    targetHost,
    target: input.target,
    next,
    iat: issuedAt,
    exp: issuedAt + SSO_MAX_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

  return {
    value: `${encodedPayload}.${signPayload('state', encodedPayload)}`,
    state,
    stateHash: hashSsoState(state),
    codeChallenge: pkceChallengeForVerifier(verifier),
    next,
    expiresAt: new Date(payload.exp * 1000),
  };
}

export function verifySsoBrowserState(value: string, input: { targetHost: string; now?: number }) {
  if (!value || value.length > 4096) throw new Error('invalid_sso_state');
  const [encodedPayload, signature, extra] = value.split('.');
  if (!encodedPayload || !signature || extra || !BASE64URL_PATTERN.test(encodedPayload) || !BASE64URL_PATTERN.test(signature)) {
    throw new Error('invalid_sso_state');
  }
  if (!safeSignatureEqual(signature, signPayload('state', encodedPayload))) throw new Error('invalid_sso_state_signature');

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('invalid_sso_state');
  }
  if (!isStatePayload(payload)) throw new Error('invalid_sso_state');
  assertHostPair(payload.sourceHost, payload.targetHost);

  const now = Math.floor((input.now ?? Date.now()) / 1000);
  if (payload.exp <= now || payload.iat > now + 10 || payload.exp - payload.iat > SSO_MAX_TTL_SECONDS) {
    throw new Error('expired_sso_state');
  }
  if (payload.targetHost !== input.targetHost.toLowerCase()) throw new Error('sso_state_target_mismatch');
  const local = isLocalHost(payload.targetHost);
  if (safeSsoNextPath(payload.target, payload.next, local) !== payload.next) throw new Error('invalid_sso_next');

  return {
    stateHash: hashSsoState(payload.state),
    codeChallenge: pkceChallengeForVerifier(payload.verifier),
    sourceHost: payload.sourceHost,
    targetHost: payload.targetHost,
    target: payload.target,
    next: payload.next,
    expiresAt: new Date(payload.exp * 1000),
  };
}

export function ssoStateCookieName(local: boolean) {
  return local ? 'logimail_sso_state' : '__Host-logimail-sso-state';
}

export function createSsoHandoffTicket(input: { sourceHost: string; targetHost: string; now?: number }) {
  const sourceHost = input.sourceHost.toLowerCase();
  const targetHost = input.targetHost.toLowerCase();
  assertHostPair(sourceHost, targetHost);

  const issuedAt = Math.floor((input.now ?? Date.now()) / 1000);
  const nonce = randomBytes(32).toString('base64url');
  const payload: SsoTicketPayload = {
    v: 1,
    id: randomUUID(),
    nonce,
    sourceHost,
    targetHost,
    iat: issuedAt,
    exp: issuedAt + SSO_TTL_SECONDS,
  };
  const encodedPayload = encodePayload(payload);

  return {
    id: payload.id,
    nonceHash: hashSsoNonce(nonce),
    expiresAt: new Date(payload.exp * 1000),
    ticket: `${encodedPayload}.${signPayload('ticket', encodedPayload)}`,
  };
}

export function verifySsoHandoffTicket(ticket: string, input: { targetHost: string; now?: number }) {
  if (!ticket || ticket.length > 2048) throw new Error('invalid_sso_ticket');
  const [encodedPayload, signature, extra] = ticket.split('.');
  if (!encodedPayload || !signature || extra || !BASE64URL_PATTERN.test(encodedPayload) || !BASE64URL_PATTERN.test(signature)) {
    throw new Error('invalid_sso_ticket');
  }
  if (!safeSignatureEqual(signature, signPayload('ticket', encodedPayload))) throw new Error('invalid_sso_signature');

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('invalid_sso_ticket');
  }
  if (!isTicketPayload(payload)) throw new Error('invalid_sso_ticket');
  assertHostPair(payload.sourceHost, payload.targetHost);

  const now = Math.floor((input.now ?? Date.now()) / 1000);
  if (payload.exp <= now || payload.iat > now + 10 || payload.exp - payload.iat > SSO_MAX_TTL_SECONDS) {
    throw new Error('expired_sso_ticket');
  }
  if (payload.targetHost !== input.targetHost.toLowerCase()) throw new Error('sso_target_mismatch');

  return {
    id: payload.id,
    nonceHash: hashSsoNonce(payload.nonce),
    sourceHost: payload.sourceHost,
    targetHost: payload.targetHost,
    expiresAt: new Date(payload.exp * 1000),
  };
}

export function trustedSsoRequestContext(request: Request) {
  const requestUrl = new URL(request.url);
  const hostname = hostnameFromHeaders(request.headers, requestUrl.hostname);
  if (!isAllowedSsoHost(hostname)) throw new Error('invalid_sso_host');

  const originHeader = request.headers.get('origin');
  let requestOrigin: URL;
  try {
    requestOrigin = new URL(originHeader ?? '');
  } catch {
    throw new Error('invalid_sso_origin');
  }

  const local = isLocalHost(hostname);
  const expectedOrigin = local ? requestUrl.origin : `https://${hostname}`;
  if (originHeader !== requestOrigin.origin
    || hostnameFromAuthority(requestOrigin.host) !== hostname
    || requestOrigin.origin !== expectedOrigin) {
    throw new Error('invalid_sso_origin');
  }

  return { hostname, origin: requestOrigin.origin, local };
}
