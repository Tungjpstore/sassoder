/**
 * Browser customer session IDs for dine-in / remote ordering.
 * Kept out of large client components so both surfaces share TTL and UUID rules.
 */

export const CUSTOMER_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const CUSTOMER_SESSION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createCustomerSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function dineInCustomerSessionStorageKey(restaurantId: string, tableId: string) {
  return `logivn:customer-session:${restaurantId}:${tableId}`;
}

/** Legacy key used by remote ordering (plain UUID string, not JSON envelope). */
export function remoteCustomerSessionStorageKey(restaurantId: string) {
  return `logivn-remote-session:${restaurantId}`;
}

/**
 * Remote clients historically stored a bare UUID. Keep that format for continuity
 * so existing browsers do not mint a second session after deploy.
 */
export function resolveOrCreateRemoteCustomerSessionId(restaurantId: string) {
  if (typeof window === "undefined") return createCustomerSessionId();
  const key = remoteCustomerSessionStorageKey(restaurantId);
  const existing = window.localStorage.getItem(key);
  if (existing && CUSTOMER_SESSION_UUID_RE.test(existing)) return existing;
  const id = createCustomerSessionId();
  window.localStorage.setItem(key, id);
  return id;
}

type StoredCustomerSession = {
  id?: string;
  createdAt?: number;
};

export function readCustomerSessionId(storageKey: string, now = Date.now()): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCustomerSession;
    if (
      typeof parsed?.id === "string" &&
      CUSTOMER_SESSION_UUID_RE.test(parsed.id) &&
      typeof parsed.createdAt === "number" &&
      now - parsed.createdAt < CUSTOMER_SESSION_TTL_MS
    ) {
      return parsed.id;
    }
  } catch {
    // ignore corrupt storage
  }
  return null;
}

export function writeCustomerSessionId(storageKey: string, id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify({ id, createdAt: Date.now() }));
}

/** Read a valid stored session or create + persist a new one. */
export function resolveOrCreateCustomerSessionId(storageKey: string) {
  const existing = readCustomerSessionId(storageKey);
  if (existing) return existing;
  const id = createCustomerSessionId();
  writeCustomerSessionId(storageKey, id);
  return id;
}
