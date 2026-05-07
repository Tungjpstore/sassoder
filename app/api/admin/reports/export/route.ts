import { NextResponse } from "next/server";
import { fail } from "@/lib/response";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { getAdminReport } from "@/services/dashboard-report-service";
import { buildAdminReportCsv } from "@/services/report-export-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "advanced_reports" });

    const report = await getAdminReport(session.restaurantId);
    const date = new Date().toISOString().slice(0, 10);
    const format = new URL(request.url).searchParams.get("format");

    if (format === "json") {
      return NextResponse.json(report, {
        headers: {
          "Content-Disposition": `attachment; filename="logivn-bao-cao-${date}.json"`,
          "Cache-Control": "no-store"
        }
      });
    }

    const csv = buildAdminReportCsv(report);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="logivn-bao-cao-${date}.csv"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return fail(error);
  }
}
