import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET() {
  const startedAt = performance.now();
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("restaurants").select("id").limit(1);
  const healthy = !error;

  return NextResponse.json(
    {
      ok: healthy,
      appUrl: getAppUrl(),
      supabase: healthy ? "connected" : "error",
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt: new Date().toISOString()
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
