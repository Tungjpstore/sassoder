import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { buildTenantUrl } from "@/lib/tenant-domain";

export const preferredRegion = "sin1";

function safeSize(value: string | null) {
  const size = Number(value ?? 640);
  if (!Number.isFinite(size)) return 640;
  return Math.min(1600, Math.max(160, Math.round(size)));
}

export async function GET(request: Request) {
  const session = await requireOperationalDashboardApiSession({ feature: "reservations" });
  const url = new URL(request.url);
  const size = safeSize(url.searchParams.get("size"));
  const reserveUrl = buildTenantUrl(session.restaurant.slug, "/reserve");
  const qrUrl = new URL("https://api.qrserver.com/v1/create-qr-code/");
  qrUrl.searchParams.set("size", `${size}x${size}`);
  qrUrl.searchParams.set("format", "png");
  qrUrl.searchParams.set("margin", "14");
  qrUrl.searchParams.set("data", reserveUrl);

  const response = await fetch(qrUrl, { cache: "no-store" });
  if (!response.ok || !response.body) {
    return Response.json({ ok: false, error: "Không tạo được mã QR đặt bàn." }, { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "image/png");
  headers.set("Cache-Control", "private, no-store");
  if (url.searchParams.get("download") === "1") {
    headers.set("Content-Disposition", `attachment; filename="logivn-reservation-${session.restaurant.slug}.png"`);
  }

  return new Response(response.body, { headers });
}
