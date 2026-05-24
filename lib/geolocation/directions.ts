import type { Coordinate } from "@/services/maps/types";

function isAppleDevice(userAgent: string) {
  return /iPhone|iPad|Macintosh/i.test(userAgent);
}

export function buildDirectionsHref(
  destination: Coordinate,
  options: {
    origin?: Coordinate | null;
    userAgent?: string;
    fallback?: "google" | "apple";
  } = {}
) {
  const userAgent = options.userAgent ?? "";
  const start = options.origin ? `${options.origin.lat},${options.origin.lng}` : "";
  const end = `${destination.lat},${destination.lng}`;
  const preferApple = options.fallback === "apple" || isAppleDevice(userAgent);

  if (preferApple) {
    const url = new URL("https://maps.apple.com/");
    url.searchParams.set("daddr", end);
    if (start) url.searchParams.set("saddr", start);
    url.searchParams.set("dirflg", "d");
    return url.toString();
  }

  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", end);
  if (start) url.searchParams.set("origin", start);
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}
