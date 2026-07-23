/**
 * Browser customer session IDs for dine-in / remote ordering.
 * Kept out of large client components so both surfaces share TTL and UUID rules.
 */

export const CUSTOMER_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const CUSTOMER_SESSION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RemoteCustomerSession = {
  id: string;
  token: string;
  expiresAt: string;
};

export type DineInCustomerSession = RemoteCustomerSession;

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

/** Storage key used by remote ordering. Values use the shared expiring envelope. */
export function remoteCustomerSessionStorageKey(restaurantId: string) {
  return `logivn-remote-session:${restaurantId}`;
}

/** Read an expiring remote session, rotating legacy bare UUID values on migration. */
export function resolveOrCreateRemoteCustomerSessionId(restaurantId: string) {
  return resolveOrCreateCustomerSessionId(remoteCustomerSessionStorageKey(restaurantId));
}

type StoredCustomerSession = {
  id?: string;
  createdAt?: number;
  token?: string;
  expiresAt?: string;
};

export async function resolveOrCreateRemoteCustomerSession(
  restaurantId: string,
  restaurantSlug: string,
  options: { fetchImpl?: typeof fetch; now?: number } = {}
): Promise<RemoteCustomerSession> {
  if (typeof window === "undefined") {
    throw new Error("Remote customer sessions can only be initialized in the browser.");
  }
  const key = remoteCustomerSessionStorageKey(restaurantId);
  const now = options.now ?? Date.now();
  const existing = readStoredRemoteCustomerSession(key, now);
  if (existing) return existing;

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("/api/customer-sessions/remote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restaurantSlug })
  });
  const envelope = await response.json().catch(() => null) as {
    ok?: boolean;
    error?: string;
    data?: { customerSessionId?: string; token?: string; expiresAt?: string };
  } | null;
  const data = envelope?.data;
  if (
    !response.ok ||
    envelope?.ok !== true ||
    !data ||
    typeof data.customerSessionId !== "string" ||
    !CUSTOMER_SESSION_UUID_RE.test(data.customerSessionId) ||
    typeof data.token !== "string" ||
    data.token.length === 0 ||
    typeof data.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(data.expiresAt)) ||
    Date.parse(data.expiresAt) <= now
  ) {
    throw new Error(envelope?.error ?? "Không khởi tạo được phiên khách hàng.");
  }

  const session = { id: data.customerSessionId, token: data.token, expiresAt: data.expiresAt };
  window.localStorage.setItem(key, JSON.stringify({ ...session, createdAt: now }));
  return session;
}

export async function resolveOrCreateDineInCustomerSession(
  restaurantId: string,
  restaurantSlug: string,
  tableId: string,
  tableAccessToken: string | null | undefined,
  options: { fetchImpl?: typeof fetch; now?: number } = {}
): Promise<DineInCustomerSession> {
  if (typeof window === "undefined") {
    throw new Error("Dine-in customer sessions can only be initialized in the browser.");
  }
  const key = dineInCustomerSessionStorageKey(restaurantId, tableId);
  const now = options.now ?? Date.now();
  const existing = readStoredRemoteCustomerSession(key, now);
  if (existing) return existing;

  const legacyId = readCustomerSessionId(key, now) ?? undefined;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("/api/customer-sessions/dine-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      restaurantSlug,
      tableId,
      tableAccessToken: tableAccessToken ?? undefined,
      customerSessionId: legacyId
    })
  });
  const envelope = await response.json().catch(() => null) as {
    ok?: boolean;
    error?: string;
    data?: { customerSessionId?: string; token?: string; expiresAt?: string };
  } | null;
  const data = envelope?.data;
  if (
    !response.ok ||
    envelope?.ok !== true ||
    !data ||
    typeof data.customerSessionId !== "string" ||
    !CUSTOMER_SESSION_UUID_RE.test(data.customerSessionId) ||
    typeof data.token !== "string" ||
    data.token.length === 0 ||
    typeof data.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(data.expiresAt)) ||
    Date.parse(data.expiresAt) <= now
  ) {
    throw new Error(envelope?.error ?? "Không khởi tạo được phiên khách tại bàn.");
  }

  const session = { id: data.customerSessionId, token: data.token, expiresAt: data.expiresAt };
  window.localStorage.setItem(key, JSON.stringify({ ...session, createdAt: now }));
  return session;
}

function readStoredRemoteCustomerSession(storageKey: string, now: number): RemoteCustomerSession | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCustomerSession;
    if (
      typeof parsed.id === "string" &&
      CUSTOMER_SESSION_UUID_RE.test(parsed.id) &&
      typeof parsed.token === "string" &&
      parsed.token.length > 0 &&
      typeof parsed.expiresAt === "string" &&
      Number.isFinite(Date.parse(parsed.expiresAt)) &&
      Date.parse(parsed.expiresAt) > now
    ) {
      return { id: parsed.id, token: parsed.token, expiresAt: parsed.expiresAt };
    }
  } catch {
    // Corrupt or legacy storage is replaced by a server-issued session.
  }
  return null;
}

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
