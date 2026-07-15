import { createHmac, timingSafeEqual } from "crypto";

export type TableQrAccessOptions = {
  allowLegacyQr?: boolean;
};

export type TableQrAccessTable = {
  id: string;
  restaurant_id: string;
  qr_token_version?: number;
  qr_token_enforced?: boolean;
};

const LOCAL_DEV_TABLE_QR_SECRET = "logivn-local-table-qr-access";

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

/**
 * Production requires TABLE_QR_ACCESS_SECRET (fail-closed).
 * Never fall back to SUPABASE_SERVICE_ROLE_KEY — rotating service role would invalidate every QR.
 * Dev may use PLATFORM_ADMIN_SESSION_SECRET or a fixed local secret for convenience.
 */
export function resolveTableQrAccessSecret() {
  const dedicated = process.env.TABLE_QR_ACCESS_SECRET?.trim();
  if (dedicated) return dedicated;

  if (isProductionRuntime()) {
    throw new Error(
      "TABLE_QR_ACCESS_SECRET is required in production. Set a dedicated long random secret (do not reuse service-role keys)."
    );
  }

  return process.env.PLATFORM_ADMIN_SESSION_SECRET?.trim() || LOCAL_DEV_TABLE_QR_SECRET;
}

function tableQrSecret() {
  return resolveTableQrAccessSecret();
}

export function buildTableQrAccessToken(table: TableQrAccessTable) {
  return createHmac("sha256", tableQrSecret())
    .update(`${table.restaurant_id}:${table.id}:${table.qr_token_version ?? 1}`)
    .digest("hex")
    .slice(0, 40);
}

function safeEqualToken(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isValidTableQrAccess(table: TableQrAccessTable, token?: string | null, options: TableQrAccessOptions = {}) {
  // Enforce token when table is marked enforced, or when restaurant disables legacy QR.
  const requiresToken = Boolean(table.qr_token_enforced) || options.allowLegacyQr === false;
  if (!requiresToken) return true;
  if (!token || !/^[a-f0-9]{40}$/i.test(token)) return false;
  return safeEqualToken(token.toLowerCase(), buildTableQrAccessToken(table));
}
