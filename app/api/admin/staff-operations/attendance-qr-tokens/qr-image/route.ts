import { NextResponse } from "next/server";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { AppError } from "@/lib/response";

export const preferredRegion = "sin1";

function safeSize(value: string | null) {
  const size = Number(value ?? 360);
  if (!Number.isFinite(size)) return 360;
  return Math.min(900, Math.max(180, Math.round(size)));
}

export async function GET(request: Request) {
  try {
    await requireOperationalDashboardApiSession({
      adminOnly: true,
      feature: "staff_management",
      permission: "attendance.edit"
    });

    const url = new URL(request.url);
    const data = url.searchParams.get("data");
    if (!data || data.length > 1200) {
      return NextResponse.json({ ok: false, error: "Dữ liệu QR không hợp lệ." }, { status: 422 });
    }

    const size = safeSize(url.searchParams.get("size"));
    const qrUrl = new URL("https://api.qrserver.com/v1/create-qr-code/");
    qrUrl.searchParams.set("size", `${size}x${size}`);
    qrUrl.searchParams.set("format", "png");
    qrUrl.searchParams.set("margin", "12");
    qrUrl.searchParams.set("data", data);

    const response = await fetch(qrUrl, { cache: "no-store" });
    if (!response.ok || !response.body) {
      return NextResponse.json({ ok: false, error: "Không tạo được ảnh QR chấm công." }, { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", "image/png");
    headers.set("Cache-Control", "private, no-store");
    return new Response(response.body, { headers });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Không tạo được ảnh QR chấm công.";
    console.error("[staff-attendance-qr-image]", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
