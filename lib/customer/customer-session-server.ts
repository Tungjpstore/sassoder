import "server-only";

import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/response";
import {
  createCustomerSessionToken,
  verifyCustomerSessionToken,
  type VerifiedCustomerSessionTokenClaims
} from "./customer-session-token";
import {
  customerSessionTokenVersion,
  isLegacyCustomerSessionFallbackEnabled,
  readCustomerSessionToken,
  verifyRemoteCustomerSessionRequest
} from "./customer-session-auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { assertPublicTenantActive } from "@/services/tenant-status-guard";
import { getPublicTable } from "@/services/table-service";

export type RemoteCustomerSessionAccess = {
  restaurantId: string;
  restaurantSlug: string;
  customerSessionId: string;
  verifiedSession: VerifiedCustomerSessionTokenClaims | null;
  usedLegacyFallback: boolean;
};

export type DineInCustomerSessionAccess = {
  restaurantId: string;
  restaurantSlug: string;
  tableId: string;
  customerSessionId: string;
  verifiedSession: VerifiedCustomerSessionTokenClaims | null;
  usedLegacyFallback: boolean;
};

export async function getPublicRestaurantIdentity(restaurantSlug: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select("id,slug,allow_legacy_qr,platform_status,deleted_at")
    .eq("slug", restaurantSlug)
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy quán", 404);
  assertPublicTenantActive(data);
  return data;
}

export async function requireDineInCustomerSession(input: {
  request: Pick<Request, "headers">;
  restaurantSlug: string;
  tableId: string;
  customerSessionId: string;
}): Promise<DineInCustomerSessionAccess> {
  const restaurant = await getPublicRestaurantIdentity(input.restaurantSlug);
  const tokenVersion = customerSessionTokenVersion();
  // DINE_IN tokens include a table binding. Verify it with the dedicated
  // customer-session verifier so a REMOTE token cannot be reused here.
  const dineInSession = verifyCustomerSessionTokenForDineIn(
    restaurant.id,
    input.tableId,
    input.customerSessionId,
    readCustomerSessionToken(input.request),
    tokenVersion
  );

  if (dineInSession) {
    return {
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      tableId: input.tableId,
      customerSessionId: dineInSession.sid,
      verifiedSession: dineInSession,
      usedLegacyFallback: false
    };
  }

  if (isLegacyCustomerSessionFallbackEnabled()) {
    return {
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      tableId: input.tableId,
      customerSessionId: input.customerSessionId,
      verifiedSession: null,
      usedLegacyFallback: true
    };
  }

  throw new AppError("Phiên khách hàng không hợp lệ hoặc đã hết hạn.", 401);
}

export async function requireRemoteCustomerSession(input: {
  request: Pick<Request, "headers">;
  restaurantSlug: string;
  customerSessionId: string;
}): Promise<RemoteCustomerSessionAccess> {
  const restaurant = await getPublicRestaurantIdentity(input.restaurantSlug);
  const tokenVersion = customerSessionTokenVersion();
  const verifiedSession = verifyRemoteCustomerSessionRequest({
    restaurantId: restaurant.id,
    sessionId: input.customerSessionId,
    token: readCustomerSessionToken(input.request),
    tokenVersion
  });

  if (verifiedSession) {
    return {
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      customerSessionId: verifiedSession.sid,
      verifiedSession,
      usedLegacyFallback: false
    };
  }

  if (isLegacyCustomerSessionFallbackEnabled()) {
    return {
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      customerSessionId: input.customerSessionId,
      verifiedSession: null,
      usedLegacyFallback: true
    };
  }

  throw new AppError("Phiên khách hàng không hợp lệ hoặc đã hết hạn.", 401);
}

export async function issueRemoteCustomerSession(restaurantSlug: string) {
  const restaurant = await getPublicRestaurantIdentity(restaurantSlug);
  const sessionId = randomUUID();
  const tokenVersion = customerSessionTokenVersion();
  const token = createCustomerSessionToken(
    {
      sessionId,
      restaurantId: restaurant.id,
      scope: "REMOTE",
      tokenVersion
    },
    { ttlSeconds: 24 * 60 * 60 }
  );
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return { restaurantId: restaurant.id, customerSessionId: sessionId, token, expiresAt, tokenVersion };
}

export async function issueDineInCustomerSession(input: {
  restaurantSlug: string;
  tableId: string;
  tableAccessToken?: string | null;
  customerSessionId?: string;
}) {
  const restaurant = await getPublicRestaurantIdentity(input.restaurantSlug);
  const table = await getPublicTable(restaurant.id, input.tableId, input.tableAccessToken, {
    allowLegacyQr: restaurant.allow_legacy_qr
  });
  if (!table) throw new AppError("Không tìm thấy bàn hoặc mã QR đã hết hiệu lực. Vui lòng quét lại mã tại bàn.", 403);

  const sessionId = input.customerSessionId || randomUUID();
  const tokenVersion = customerSessionTokenVersion();
  const token = createCustomerSessionToken(
    {
      sessionId,
      restaurantId: restaurant.id,
      scope: "DINE_IN",
      tableId: table.id,
      tokenVersion
    },
    { ttlSeconds: 24 * 60 * 60 }
  );
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return { restaurantId: restaurant.id, tableId: table.id, customerSessionId: sessionId, token, expiresAt, tokenVersion };
}

function verifyCustomerSessionTokenForDineIn(
  restaurantId: string,
  tableId: string,
  sessionId: string,
  token: string | null,
  tokenVersion: number
) {
  if (!token) return null;
  try {
    return verifyCustomerSessionToken(token, {
      restaurantId,
      sessionId,
      scope: "DINE_IN",
      tableId,
      tokenVersion
    });
  } catch {
    return null;
  }
}
