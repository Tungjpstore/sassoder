export type RestaurantAvailabilityInput = {
  openingTime?: string | null;
  closingTime?: string | null;
  now?: Date;
  timeZone?: string;
  enforce?: boolean;
};

export type RestaurantAvailability = {
  isOpen: boolean;
  shouldEnforce: boolean;
  reason?: string;
  localTime: string;
};

function parseTimeOfDay(value?: string | null) {
  const match = value?.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function getLocalMinutes(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return {
    localTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    minutes: hour * 60 + minute
  };
}

function isWithinWindow(nowMinutes: number, openingMinutes: number, closingMinutes: number) {
  if (openingMinutes === closingMinutes) return true;
  if (openingMinutes < closingMinutes) return nowMinutes >= openingMinutes && nowMinutes < closingMinutes;
  return nowMinutes >= openingMinutes || nowMinutes < closingMinutes;
}

export function isOperatingHoursEnforced() {
  return process.env.DELIVERY_ENFORCE_OPERATING_HOURS !== "false";
}

export function resolveRestaurantAvailability(input: RestaurantAvailabilityInput): RestaurantAvailability {
  const shouldEnforce = input.enforce ?? isOperatingHoursEnforced();
  const timeZone = input.timeZone ?? "Asia/Ho_Chi_Minh";
  const { localTime, minutes } = getLocalMinutes(input.now ?? new Date(), timeZone);
  const openingMinutes = parseTimeOfDay(input.openingTime);
  const closingMinutes = parseTimeOfDay(input.closingTime);

  if (!shouldEnforce || openingMinutes === null || closingMinutes === null) {
    return { isOpen: true, shouldEnforce, localTime };
  }

  const isOpen = isWithinWindow(minutes, openingMinutes, closingMinutes);
  return {
    isOpen,
    shouldEnforce,
    localTime,
    reason: isOpen ? undefined : `Quán đang ngoài giờ nhận đơn giao hàng (${input.openingTime} - ${input.closingTime}).`
  };
}
