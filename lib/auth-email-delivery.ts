import { AppError } from "@/lib/response";
import { configuredEmailProvider, isEmailDeliveryConfigured, type EmailDeliveryEnv, type EmailDeliveryProvider } from "@/services/email-delivery";

type AuthEmailDeliveryEnv = EmailDeliveryEnv;

export type AuthEmailDeliveryStatus = "configured" | "delivery_unavailable";

export const authEmailDeliveryUnavailableMessage =
  "Email hợp lệ, nhưng hệ thống gửi mã xác thực chưa sẵn sàng. Vui lòng liên hệ LogiVN để kiểm tra kênh gửi email.";

export function isAuthEmailDeliveryConfigured(env: AuthEmailDeliveryEnv = process.env) {
  return isEmailDeliveryConfigured(env);
}

export function getAuthEmailDeliveryStatus(env: AuthEmailDeliveryEnv = process.env): AuthEmailDeliveryStatus {
  return isAuthEmailDeliveryConfigured(env) ? "configured" : "delivery_unavailable";
}

export function assertAuthEmailDeliveryConfigured(env: AuthEmailDeliveryEnv = process.env): EmailDeliveryProvider {
  const provider = configuredEmailProvider(env);
  if (!provider) {
    throw new AppError(authEmailDeliveryUnavailableMessage, 503);
  }

  return provider;
}
