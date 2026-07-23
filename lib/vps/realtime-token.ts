import { createHmac } from "node:crypto";
import { assertServerRuntime } from "@/lib/customer/signed-json-token";
import { AppError } from "@/lib/response";
import type { UserRole } from "@/types/domain";

type TokenInput = {
  restaurantId: string;
  userId: string;
  role: UserRole;
  ttlSeconds?: number;
};

type TokenPayload = {
  scope: "dashboard";
  restaurantId: string;
  userId: string;
  role: UserRole;
  iat: number;
  exp: number;
};

export function createVpsRealtimeToken({ restaurantId, userId, role, ttlSeconds = 300 }: TokenInput) {
  assertServerRuntime();
  const secret = process.env.LOGIVN_INTERNAL_API_KEY;
  if (!secret) throw new AppError("Thiếu LOGIVN_INTERNAL_API_KEY để cấp realtime token.", 500);

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    scope: "dashboard",
    restaurantId,
    userId,
    role,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds
  };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);

  return {
    value: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.exp * 1000).toISOString()
  };
}

export function createCustomerVpsRealtimeToken({
  restaurantId,
  customerSessionId,
  orderId,
  customerSessionExpiresAt,
  ttlSeconds = 300,
  now = Math.floor(Date.now() / 1000)
}: {
  restaurantId: string;
  customerSessionId: string;
  orderId: string;
  customerSessionExpiresAt: number;
  ttlSeconds?: number;
  now?: number;
}) {
  assertServerRuntime();
  const secret = process.env.LOGIVN_INTERNAL_API_KEY;
  if (!secret) throw new AppError("Thiếu LOGIVN_INTERNAL_API_KEY để cấp realtime token.", 500);
  if (!Number.isInteger(now) || !Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new AppError("Cấu hình thời hạn realtime token không hợp lệ.", 500);
  }
  const exp = Math.min(now + ttlSeconds, customerSessionExpiresAt);
  if (!Number.isInteger(customerSessionExpiresAt) || exp <= now) {
    throw new AppError("Phiên khách hàng đã hết hạn.", 401);
  }
  const payload = {
    scope: "customer_order" as const,
    restaurantId,
    customerSessionId,
    orderId,
    iat: now,
    exp
  };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return {
    value: `${encodedPayload}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString()
  };
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signPayload(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}
