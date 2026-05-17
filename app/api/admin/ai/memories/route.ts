import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import {
  listRestaurantAiMemories,
  updateRestaurantAiMemoryStatus,
  upsertRestaurantAiMemory
} from "@/lib/ai/memory/restaurant-memory";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const memoryCategories = ["brand", "menu", "customer", "operations", "staff", "inventory", "marketing", "policy", "branch"] as const;
const memorySensitivities = ["public", "internal", "sensitive"] as const;

const createSchema = z.object({
  category: z.enum(memoryCategories),
  title: z.string().trim().min(1).max(180),
  content: z.string().trim().min(1).max(4000),
  summary: z.string().trim().max(700).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  source: z.enum(["manual", "chatbot", "ai_ops", "import", "system"]).optional(),
  sourceRefId: z.string().trim().max(160).optional(),
  sensitivity: z.enum(memorySensitivities).optional(),
  metadata: z.record(z.unknown()).optional()
});

const updateSchema = z.object({
  memoryId: z.string().uuid(),
  status: z.enum(["active", "archived", "deleted"])
});

function readCategory(value: string | null) {
  return memoryCategories.find((category) => category === value) ?? null;
}

function readLimit(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  return Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 20;
}

export async function GET(request: Request) {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "ai_owner_assistant" });
    const url = new URL(request.url);
    return ok(
      await listRestaurantAiMemories({
        restaurantId: session.restaurantId,
        category: readCategory(url.searchParams.get("category")),
        includeSensitive: session.role === "ADMIN" && url.searchParams.get("includeSensitive") === "true",
        limit: readLimit(request)
      })
    );
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ adminOnly: true, feature: "ai_owner_assistant" });
    const body = createSchema.parse(await request.json());
    return ok(
      await upsertRestaurantAiMemory({
        restaurantId: session.restaurantId,
        category: body.category,
        title: body.title,
        content: body.content,
        summary: body.summary,
        tags: body.tags,
        source: body.source,
        sourceRefId: body.sourceRefId,
        sensitivity: body.sensitivity,
        actorUserId: session.userId,
        metadata: body.metadata
      })
    );
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ adminOnly: true, feature: "ai_owner_assistant" });
    const body = updateSchema.parse(await request.json());
    return ok(
      await updateRestaurantAiMemoryStatus({
        restaurantId: session.restaurantId,
        memoryId: body.memoryId,
        status: body.status,
        actorUserId: session.userId
      })
    );
  } catch (error) {
    return fail(error);
  }
}
