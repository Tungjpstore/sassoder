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

function tableQrSecret() {
  return (
    process.env.TABLE_QR_ACCESS_SECRET?.trim() ||
    process.env.PLATFORM_ADMIN_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "logivn-local-table-qr-access"
  );
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
  const requiresToken = table.qr_token_enforced || options.allowLegacyQr === false;
  if (!requiresToken) return true;
  if (!token || !/^[a-f0-9]{40}$/i.test(token)) return false;
  return safeEqualToken(token.toLowerCase(), buildTableQrAccessToken(table));
}
