// Pure DKIM selector validation + record formatting (Requirement 1). No
// project-alias / server-only imports so selector uniqueness (Property 5) can be
// property-tested directly.

export const SELECTOR_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** A selector is 1–63 lowercase chars matching the DKIM label pattern (R1.2). */
export function isValidSelector(value: string): boolean {
  return typeof value === 'string' && value.length >= 1 && value.length <= 63 && SELECTOR_PATTERN.test(value);
}

/** DNS name where a selector's DKIM TXT record is published. */
export function dkimTxtName(selector: string, domain: string): string {
  return `${selector}._domainkey.${domain.toLowerCase()}`;
}

/** TXT record content for an RSA public key (base64 DER / SPKI, no PEM headers). */
export function dkimTxtContent(publicKeyBase64: string): string {
  return `v=DKIM1; k=rsa; p=${publicKeyBase64}`;
}

/** True when a selector name already exists in the given set (case-insensitive). */
export function selectorExists(existing: Array<{ selector: string }>, candidate: string): boolean {
  const needle = candidate.toLowerCase();
  return existing.some((row) => row.selector.toLowerCase() === needle);
}

/**
 * Decide whether `candidate` may be added to a domain's selector set.
 * Enforces validity (R1.2) and per-domain uniqueness (R1.4 / Property 5).
 */
export function canAddSelector(
  existing: Array<{ selector: string }>,
  candidate: string,
): { ok: true } | { ok: false; reason: 'invalid_selector' | 'dkim_selector_conflict' } {
  if (!isValidSelector(candidate)) return { ok: false, reason: 'invalid_selector' };
  if (selectorExists(existing, candidate)) return { ok: false, reason: 'dkim_selector_conflict' };
  return { ok: true };
}

/** Deterministic default selector name, e.g. `lm20260613` (matches the pattern). */
export function defaultSelectorName(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `lm${y}${m}${d}`;
}
