import { firstForwardedIp } from "@/lib/attendance-network";

function hasTrustedProxyMarker(headers: Headers) {
  return Boolean(headers.get("cf-ray") || headers.get("x-vercel-id"));
}

export function trustedClientIp(request: Request) {
  const headers = request.headers;
  const cfIp = headers.get("cf-connecting-ip")?.trim() || null;
  if (cfIp && headers.get("cf-ray")) return cfIp;

  const forwardedIp = firstForwardedIp(headers.get("x-forwarded-for"));
  if (forwardedIp && hasTrustedProxyMarker(headers)) return forwardedIp;

  const realIp = headers.get("x-real-ip")?.trim() || null;
  if (process.env.STAFF_ATTENDANCE_TRUST_PROXY_HEADERS === "true") {
    return realIp || forwardedIp || cfIp;
  }

  if (process.env.NODE_ENV !== "production") {
    return realIp || forwardedIp || cfIp;
  }

  return null;
}
