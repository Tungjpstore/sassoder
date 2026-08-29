const SAFE_URL_ORIGIN = 'https://logimail.invalid';
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
// Catch separator encodings even when an attacker nests them behind %25.
const ENCODED_SEPARATOR_PATTERN = /%(?:25)*(?:2f|5c)/i;

type SafeNextPathOptions = Readonly<{
  fallback?: string;
  disallowAuthRoutes?: boolean;
}>;

function hasUnsafeEncoding(value: string) {
  let current = value;

  for (let pass = 0; pass < 4; pass += 1) {
    if (CONTROL_CHARACTER_PATTERN.test(current) || current.includes('\\') || ENCODED_SEPARATOR_PATTERN.test(current)) {
      return true;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      // Malformed percent escapes are rejected instead of being reinterpreted
      // differently by a proxy or browser later in the redirect chain.
      return true;
    }

    if (decoded === current) return false;
    current = decoded;
  }

  // More decode layers than this are never needed by a legitimate app path;
  // fail closed instead of letting a downstream proxy continue decoding it.
  return true;
}

/**
 * Keep post-auth redirects on this origin and reject URL-parser edge cases.
 * The original value is returned for valid paths so query/hash encoding is
 * preserved for the destination application.
 */
export function safeNextPath(value: string | null | undefined, options: SafeNextPathOptions = {}) {
  const fallback = options.fallback ?? '/mail/inbox';
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  const pathEnd = value.search(/[?#]/);
  const rawPathname = pathEnd === -1 ? value : value.slice(0, pathEnd);
  if (hasUnsafeEncoding(rawPathname)) return fallback;

  let destination: URL;
  try {
    destination = new URL(value, SAFE_URL_ORIGIN);
  } catch {
    return fallback;
  }

  if (destination.origin !== SAFE_URL_ORIGIN || destination.username || destination.password) return fallback;
  if (options.disallowAuthRoutes && (destination.pathname === '/auth' || destination.pathname.startsWith('/auth/'))) {
    return fallback;
  }

  return value;
}
