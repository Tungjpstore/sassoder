import { AppError } from "@/lib/response";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestOrigin(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return null;

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProto ?? new URL(request.url).protocol.replace(":", "");
  return `${protocol}://${host}`;
}

export function assertSameOriginRequest(request: Request) {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const origin = request.headers.get("origin");
  if (!origin) return;

  const expectedOrigin = requestOrigin(request);
  if (!expectedOrigin || origin !== expectedOrigin) {
    throw new AppError("Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.", 403);
  }
}
