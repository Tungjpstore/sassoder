import { NextResponse } from "next/server";
import QRCode from "qrcode";
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
      feature: "staff_management",
      permission: "attendance.edit"
    });

    const url = new URL(request.url);
    const data = url.searchParams.get("data");
    if (!data || data.length > 1200) {
      return NextResponse.json({ ok: false, error: "Dữ liệu QR không hợp lệ." }, { status: 422 });
    }

    const size = safeSize(url.searchParams.get("size"));
    const qrImage = await QRCode.toBuffer(data, {
      type: "png",
      width: size,
      margin: 2,
      errorCorrectionLevel: "M"
    });

    const headers = new Headers();
    headers.set("Content-Type", "image/png");
    headers.set("Cache-Control", "private, no-store");
    return new Response(new Blob([new Uint8Array(qrImage)], { type: "image/png" }), { headers });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Không tạo được ảnh QR chấm công.";
    console.error("[staff-attendance-qr-image]", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
