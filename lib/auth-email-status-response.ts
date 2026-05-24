import {
  authEmailDeliveryUnavailableMessage,
  type AuthEmailDeliveryStatus
} from "@/lib/auth-email-delivery";

export type PublicAuthEmailStatus = "accepted" | "delivery_unavailable";

export type PublicAuthEmailStatusPayload = {
  status: PublicAuthEmailStatus;
  emailDeliveryStatus: AuthEmailDeliveryStatus;
  message?: string;
};

export function buildPublicAuthEmailStatusPayload(
  emailDeliveryStatus: AuthEmailDeliveryStatus
): PublicAuthEmailStatusPayload {
  if (emailDeliveryStatus === "delivery_unavailable") {
    return {
      status: "delivery_unavailable",
      emailDeliveryStatus,
      message: authEmailDeliveryUnavailableMessage
    };
  }

  return {
    status: "accepted",
    emailDeliveryStatus
  };
}
