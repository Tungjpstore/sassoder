import { NextResponse } from "next/server";
import { createSlug } from "@/lib/slug";
import { restaurantSchema } from "@/lib/validators";
import { isRestaurantSlugAvailable } from "@/services/restaurant-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawSlug = searchParams.get("slug") ?? "";
  const slug = createSlug(rawSlug);
  const parsed = restaurantSchema.pick({ slug: true }).safeParse({ slug });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, available: false, slug, error: "Đường dẫn chưa hợp lệ" }, { status: 422 });
  }

  const available = await isRestaurantSlugAvailable(slug);
  return NextResponse.json({ ok: true, available, slug });
}
