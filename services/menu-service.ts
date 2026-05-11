import { revalidateTag, unstable_cache } from "next/cache";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listPublicPromotions, type PublicPromotion } from "@/services/promotion-service";

export type AdminMenuItem = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  price: number;
  image_url: string | null;
  is_available: boolean;
};

export type AdminMenuCategory = {
  id: string;
  restaurant_id: string;
  name: string;
  items: AdminMenuItem[];
};

export type PublicMenuRestaurant = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  logo_url: string | null;
  address: string | null;
  store_lat: number | null;
  store_lng: number | null;
  hotline: string | null;
  contact_email: string | null;
  receipt_footer: string | null;
  receipt_show_qr: boolean;
  show_promotions_on_menu: boolean;
  online_ordering_enabled: boolean;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  delivery_radius_km: number;
  free_delivery_radius_km: number;
  delivery_base_fee: number;
  delivery_fee_per_km: number;
  min_order_for_delivery: number;
  pickup_eta_minutes: number;
  delivery_eta_minutes: number;
  online_payment_mode: "PAY_AFTER" | "QR_PREPAID";
  delivery_tracking_enabled: boolean;
  show_store_marker_on_ordering: boolean;
  show_customer_distance: boolean;
  show_delivery_eta: boolean;
  service_fee_enabled: boolean;
  service_fee_percent: number;
  service_fee_min: number;
  service_fee_max: number | null;
  promotions: PublicPromotion[];
  categories: AdminMenuCategory[];
};

export async function listMenuForAdmin(restaurantId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .select("id,restaurant_id,name,items:menu_items(id,restaurant_id,category_id,name,price,image_url,is_available)")
    .eq("restaurant_id", restaurantId)
    .order("name", { ascending: true })
    .order("name", { referencedTable: "menu_items", ascending: true });

  throwIfSupabaseError(error);
  return (data ?? []) as unknown as AdminMenuCategory[];
}

export const getCachedPublicMenu = unstable_cache(
  async (restaurantSlug: string): Promise<PublicMenuRestaurant | null> => {
    const supabase = createAdminSupabaseClient();
    const { data: restaurantData, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id,name,slug,created_at,logo_url,address,store_lat,store_lng,hotline,contact_email,receipt_footer,receipt_show_qr,show_promotions_on_menu,online_ordering_enabled,pickup_enabled,delivery_enabled,delivery_radius_km,free_delivery_radius_km,delivery_base_fee,delivery_fee_per_km,min_order_for_delivery,pickup_eta_minutes,delivery_eta_minutes,online_payment_mode,delivery_tracking_enabled,show_store_marker_on_ordering,show_customer_distance,show_delivery_eta,service_fee_enabled,service_fee_percent,service_fee_min,service_fee_max")
      .eq("slug", restaurantSlug)
      .maybeSingle();

    throwIfSupabaseError(restaurantError);
    const restaurant = restaurantData as Omit<PublicMenuRestaurant, "categories"> | null;
    if (!restaurant) return null;

    const [categoriesResult, promotions] = await Promise.all([
      supabase
        .from("menu_categories")
        .select("id,restaurant_id,name,items:menu_items(id,restaurant_id,category_id,name,price,image_url,is_available)")
        .eq("restaurant_id", restaurant.id)
        .eq("items.is_available", true)
        .order("name", { ascending: true })
        .order("name", { referencedTable: "menu_items", ascending: true }),
      restaurant.show_promotions_on_menu ? listPublicPromotions(restaurant.id, "QR_MENU") : Promise.resolve([])
    ]);

    throwIfSupabaseError(categoriesResult.error);

    return {
      ...restaurant,
      promotions,
      categories: (categoriesResult.data ?? []) as unknown as AdminMenuCategory[]
    };
  },
  ["public-menu"],
  { revalidate: 60, tags: ["public-menu"] }
);

export function invalidateMenuCache() {
  revalidateTag("public-menu", "max");
}

export async function createCategory(restaurantId: string, name: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .insert({ restaurant_id: restaurantId, name })
    .select()
    .single();

  throwIfSupabaseError(error);
  invalidateMenuCache();
  return data;
}

export async function createMenuItem(input: {
  restaurantId: string;
  categoryId: string;
  name: string;
  price: number;
  image?: string;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: category, error: categoryError } = await supabase
    .from("menu_categories")
    .select("id")
    .eq("id", input.categoryId)
    .eq("restaurant_id", input.restaurantId)
    .single();

  throwIfSupabaseError(categoryError);
  if (!category) throw new AppError("Không tìm thấy danh mục", 404);

  const { data, error } = await supabase
    .from("menu_items")
    .insert({
      restaurant_id: input.restaurantId,
      category_id: input.categoryId,
      name: input.name,
      price: input.price,
      image_url: input.image || null
    })
    .select()
    .single();

  throwIfSupabaseError(error);
  invalidateMenuCache();
  return data;
}

export async function deleteMenuItem(restaurantId: string, itemId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_items")
    .update({ is_available: false })
    .eq("id", itemId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  throwIfSupabaseError(error);
  invalidateMenuCache();
  return data;
}

export async function updateMenuItemAvailability(restaurantId: string, itemId: string, isAvailable: boolean) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_items")
    .update({ is_available: isAvailable })
    .eq("id", itemId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  throwIfSupabaseError(error);
  invalidateMenuCache();
  return data;
}

export async function updateMenuItem(input: {
  restaurantId: string;
  itemId: string;
  categoryId: string;
  name: string;
  price: number;
  image?: string;
  isAvailable?: boolean;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: category, error: categoryError } = await supabase
    .from("menu_categories")
    .select("id")
    .eq("id", input.categoryId)
    .eq("restaurant_id", input.restaurantId)
    .single();

  throwIfSupabaseError(categoryError);
  if (!category) throw new AppError("Không tìm thấy danh mục", 404);

  const { data, error } = await supabase
    .from("menu_items")
    .update({
      category_id: input.categoryId,
      name: input.name,
      price: input.price,
      ...(input.image ? { image_url: input.image } : {}),
      ...(typeof input.isAvailable === "boolean" ? { is_available: input.isAvailable } : {})
    })
    .eq("id", input.itemId)
    .eq("restaurant_id", input.restaurantId)
    .select()
    .single();

  throwIfSupabaseError(error);
  invalidateMenuCache();
  return data;
}

function normalizeMenuImportName(value: string) {
  return value.trim().normalize("NFC");
}

function menuImportDuplicateKey(value: string) {
  return normalizeMenuImportName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export async function importMenuItemsFromDraft({
  restaurantId,
  items,
  beforeInsert
}: {
  restaurantId: string;
  items: Array<{
    categoryName?: string;
    name: string;
    price: number;
  }>;
  beforeInsert?: (increment: number) => Promise<void>;
}) {
  const normalizedItems = items
    .map((item) => ({
      categoryName: normalizeMenuImportName(item.categoryName || "Menu"),
      name: normalizeMenuImportName(item.name),
      price: Math.round(Number(item.price))
    }))
    .filter((item) => item.name.length >= 2 && Number.isFinite(item.price) && item.price >= 1000)
    .slice(0, 80);

  if (normalizedItems.length === 0) {
    return { inserted: 0, skipped: 0, categoriesCreated: 0, skippedNames: [] as string[] };
  }

  const supabase = await createServerSupabaseClient();
  const { data: existingItems, error: itemReadError } = await supabase
    .from("menu_items")
    .select("name")
    .eq("restaurant_id", restaurantId);

  throwIfSupabaseError(itemReadError);
  const existingItemNames = new Set((existingItems ?? []).map((item) => menuImportDuplicateKey(item.name)));
  const seen = new Set<string>();
  const skippedNames: string[] = [];
  const newItems = normalizedItems.filter((item) => {
    const key = menuImportDuplicateKey(item.name);
    if (!key || existingItemNames.has(key) || seen.has(key)) {
      skippedNames.push(item.name);
      return false;
    }
    seen.add(key);
    return true;
  });

  if (newItems.length === 0) {
    return {
      inserted: 0,
      skipped: normalizedItems.length,
      categoriesCreated: 0,
      skippedNames: skippedNames.slice(0, 12)
    };
  }

  const categoryNames = Array.from(new Set(newItems.map((item) => item.categoryName)));
  const { data: existingCategories, error: categoryReadError } = await supabase
    .from("menu_categories")
    .select("id,name")
    .eq("restaurant_id", restaurantId)
    .in("name", categoryNames);

  throwIfSupabaseError(categoryReadError);

  const categoryByName = new Map((existingCategories ?? []).map((category) => [category.name, category.id]));
  const missingCategoryNames = categoryNames.filter((name) => !categoryByName.has(name));

  if (missingCategoryNames.length > 0) {
    const { data: insertedCategories, error: categoryInsertError } = await supabase
      .from("menu_categories")
      .insert(missingCategoryNames.map((name) => ({ restaurant_id: restaurantId, name })))
      .select("id,name");

    throwIfSupabaseError(categoryInsertError);
    (insertedCategories ?? []).forEach((category) => categoryByName.set(category.name, category.id));
  }

  const rows = newItems
    .map((item) => ({
      restaurant_id: restaurantId,
      category_id: categoryByName.get(item.categoryName)!,
      name: item.name,
      price: item.price,
      is_available: true
    }))
    .filter((item) => Boolean(item.category_id));

  if (rows.length === 0) {
    return {
      inserted: 0,
      skipped: normalizedItems.length,
      categoriesCreated: missingCategoryNames.length,
      skippedNames: skippedNames.slice(0, 12)
    };
  }

  if (beforeInsert) await beforeInsert(rows.length);

  const { error: insertError } = await supabase.from("menu_items").insert(rows);
  throwIfSupabaseError(insertError);
  invalidateMenuCache();

  return {
    inserted: rows.length,
    skipped: normalizedItems.length - rows.length,
    categoriesCreated: missingCategoryNames.length,
    skippedNames: skippedNames.slice(0, 12)
  };
}
