export const staffPinAttemptWindowMs = 10 * 60_000;
export const staffPinDeviceAttemptLimit = 20;
export const staffPinRestaurantAttemptLimit = 120;
export const staffPinUnknownAttemptLimit = 5;

type StaffPinAttemptContext = {
  restaurantId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type StaffPinRateLimitInput = {
  scope: string;
  identifier: string;
  ip: string;
  limit: number;
  windowMs: number;
};

function safeRateLimitPart(value: string | null | undefined, fallback: string, maxLength = 160) {
  const normalized = value?.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return normalized || fallback;
}

export function buildStaffPinAttemptRateLimitInputs({
  restaurantId,
  ipAddress,
  userAgent
}: StaffPinAttemptContext): StaffPinRateLimitInput[] {
  const restaurant = safeRateLimitPart(restaurantId, "unknown-restaurant", 80);
  const device = safeRateLimitPart(userAgent, "unknown-device", 160);
  const ip = safeRateLimitPart(ipAddress, "local", 80);

  return [
    {
      scope: "staff_pin_attempt_device",
      identifier: `restaurant:${restaurant}:device:${device}`,
      ip,
      limit: staffPinDeviceAttemptLimit,
      windowMs: staffPinAttemptWindowMs
    },
    {
      scope: "staff_pin_attempt_restaurant",
      identifier: `restaurant:${restaurant}`,
      ip: "global",
      limit: staffPinRestaurantAttemptLimit,
      windowMs: staffPinAttemptWindowMs
    }
  ];
}

export function buildStaffPinUnknownRateLimitInput({
  restaurantId,
  ipAddress
}: Pick<StaffPinAttemptContext, "restaurantId" | "ipAddress">): StaffPinRateLimitInput {
  const restaurant = safeRateLimitPart(restaurantId, "unknown-restaurant", 80);
  const ip = safeRateLimitPart(ipAddress, "local", 80);

  return {
    scope: "staff_pin_unknown",
    identifier: `restaurant:${restaurant}`,
    ip,
    limit: staffPinUnknownAttemptLimit,
    windowMs: staffPinAttemptWindowMs
  };
}
