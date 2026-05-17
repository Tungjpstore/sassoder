import { AppError } from "@/lib/response";

type AuthEmailDeliveryEnv = Record<string, string | undefined>;

export type AuthEmailDeliveryStatus = "configured" | "delivery_unavailable";

export const authEmailDeliveryUnavailableMessage =
  "Email hợp lệ, nhưng hệ thống gửi mã xác thực chưa sẵn sàng. Vui lòng liên hệ LogiVN để kiểm tra kênh gửi email.";

export function isAuthEmailDeliveryConfigured(env: AuthEmailDeliveryEnv = process.env) {
  return Boolean(env.RESEND_API_KEY?.trim());
}

export function getAuthEmailDeliveryStatus(env: AuthEmailDeliveryEnv = process.env): AuthEmailDeliveryStatus {
  return isAuthEmailDeliveryConfigured(env) ? "configured" : "delivery_unavailable";
}

export function assertAuthEmailDeliveryConfigured(env: AuthEmailDeliveryEnv = process.env) {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError(authEmailDeliveryUnavailableMessage, 503);
  }

  return apiKey;
}
