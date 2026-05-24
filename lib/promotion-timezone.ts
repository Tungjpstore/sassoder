export const DEFAULT_RESTAURANT_TIMEZONE = "Asia/Ho_Chi_Minh";

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const offsetDateTimePattern = /(?:z|[+-]\d{2}:\d{2})$/i;
const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseLocalDateTime(value: string): DateTimeParts | null {
  const match = localDateTimePattern.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second)
  };
}

function timeZoneOffsetMs(timeZone: string, date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

function localDateTimeToUtc(parts: DateTimeParts, timeZone: string) {
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const guessedDate = new Date(localAsUtc);
  let offset = timeZoneOffsetMs(timeZone, guessedDate);
  let utc = localAsUtc - offset;
  offset = timeZoneOffsetMs(timeZone, new Date(utc));
  utc = localAsUtc - offset;
  return new Date(utc);
}

export function promotionDateTimeToUtcIso(value?: string | null, timeZone = DEFAULT_RESTAURANT_TIMEZONE) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (offsetDateTimePattern.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }

  const parts = parseLocalDateTime(trimmed);
  if (!parts) return null;

  try {
    return localDateTimeToUtc(parts, timeZone).toISOString();
  } catch {
    return localDateTimeToUtc(parts, DEFAULT_RESTAURANT_TIMEZONE).toISOString();
  }
}
