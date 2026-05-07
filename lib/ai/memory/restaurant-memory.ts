import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

function isMissingAiSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.message?.includes("Could not find") ||
    error.message?.includes("does not exist")
  );
}

export async function getRestaurantAiMemory(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const [restaurantResult, menuResult, promotionsResult, usageResult] = await Promise.all([
    supabase
      .from("restaurants")
      .select("id,name,slug,business_type,address,hotline,description,brand_settings")
      .eq("id", restaurantId)
      .maybeSingle(),
    supabase
      .from("menu_items")
      .select("id,name,price,is_available,category:menu_categories(name)")
      .eq("restaurant_id", restaurantId)
      .eq("is_available", true)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("promotions")
      .select("id,name,code,discount_type,discount_value,min_order_amount,show_on_customer_menu,starts_at,ends_at")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .limit(20),
    supabase
      .from("ai_usage_logs")
      .select("feature_key,provider,model,status,created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(12)
  ]);

  return {
    restaurant: restaurantResult.data ?? null,
    menu: (menuResult.data ?? []).map((item: any) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price ?? 0),
      category: Array.isArray(item.category) ? item.category[0]?.name : item.category?.name,
      available: Boolean(item.is_available)
    })),
    promotions: promotionsResult.data ?? [],
    aiUsageRecent: usageResult.data ?? []
  };
}

export async function persistAiConversationMessage(input: {
  restaurantId: string;
  conversationId?: string | null;
  userId?: string | null;
  customerSessionId?: string | null;
  surface: "dashboard" | "customer" | "admin";
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  provider?: string | null;
  model?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminSupabaseClient() as any;
  let conversationId = input.conversationId;

  if (!conversationId) {
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({
        restaurant_id: input.restaurantId,
        user_id: input.userId ?? null,
        customer_session_id: input.customerSessionId ?? null,
        surface: input.surface,
        title: input.content.slice(0, 80),
        metadata: input.metadata ?? {}
      })
      .select("id")
      .single();
    if (error && isMissingAiSchema(error)) return null;
    if (!error) conversationId = data?.id ?? null;
  }

  if (!conversationId) return null;

  const { error } = await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    restaurant_id: input.restaurantId,
    role: input.role,
    content: input.content.slice(0, 6000),
    provider: input.provider ?? null,
    model: input.model ?? null,
    metadata: input.metadata ?? {}
  });

  if (error && isMissingAiSchema(error)) return conversationId;
  if (error) return conversationId;
  return conversationId;
}
