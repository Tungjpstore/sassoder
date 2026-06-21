import { revalidateTag, unstable_cache } from "next/cache";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildModifierGroupCloneRow, buildModifierOptionCloneRows } from "@/lib/menu-modifier-clone";
import { listActiveStoreBranches } from "@/services/branch-service";
import { listPublicPromotions } from "@/services/promotion-service";
import { isPublicTenantActive, type TenantPlatformStatus } from "@/services/tenant-status-guard";
import type { PublicMenuModifierGroup, PublicPromotion, PublicStoreBranch } from "@/types";

export type AdminMenuItem = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  price: number;
  image_url: string | null;
  is_available: boolean;
  modifierGroups?: PublicMenuModifierGroup[];
};

export type AdminMenuCategory = {
  id: string;
  restaurant_id: string;
  name: string;
  items: AdminMenuItem[];
};

const adminMenuCache = new Map<string, { expiresAt: number; value: AdminMenuCategory[] }>();
const adminMenuCacheTtlMs = 10_000;

function readCachedAdminMenu(restaurantId: string) {
  const cached = adminMenuCache.get(restaurantId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    adminMenuCache.delete(restaurantId);
    return null;
  }
  return cached.value;
}

function writeCachedAdminMenu(restaurantId: string, value: AdminMenuCategory[]) {
  adminMenuCache.set(restaurantId, {
    value,
    expiresAt: Date.now() + adminMenuCacheTtlMs
  });
}

export type PublicMenuRestaurant = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  platform_status: TenantPlatformStatus;
  deleted_at: string | null;
  logo_url: string | null;
  address: string | null;
  store_lat: number | null;
  store_lng: number | null;
  hotline: string | null;
  contact_email: string | null;
  allow_legacy_qr: boolean;
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
  branches: PublicStoreBranch[];
  promotions: PublicPromotion[];
  onlinePromotions: PublicPromotion[];
  categories: AdminMenuCategory[];
};

export async function listMenuForAdmin(restaurantId: string) {
  const cached = readCachedAdminMenu(restaurantId);
  if (cached) return cached;

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .select("id,restaurant_id,name,items:menu_items(id,restaurant_id,category_id,name,price,image_url,is_available)")
    .eq("restaurant_id", restaurantId)
    .order("name", { ascending: true })
    .order("name", { referencedTable: "menu_items", ascending: true });

  throwIfSupabaseError(error);
  const categories = (data ?? []) as unknown as AdminMenuCategory[];
  const itemIds = categories.flatMap((category) => category.items.map((item) => item.id));
  const modifierGroupsByItemId = await listAdminMenuModifierGroups(supabase, restaurantId, itemIds);
  const menu = attachPublicMenuModifiers(categories, modifierGroupsByItemId);
  writeCachedAdminMenu(restaurantId, menu);
  return menu;
}

type MenuModifierGroupRow = {
  id: string;
  menu_item_id: string;
  name: string;
  kind?: PublicMenuModifierGroup["kind"];
  selection_type?: PublicMenuModifierGroup["selectionType"];
  allow_quantity?: boolean;
  is_required: boolean;
  min_select: number;
  max_select: number | null;
  sort_order: number;
};

type MenuModifierOptionRow = {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  pricing_mode?: PublicMenuModifierGroup["options"][number]["pricingMode"];
  price_value?: number | null;
  is_default?: boolean;
  is_available: boolean;
  sort_order: number;
};

const menuModifierGroupSelect = "id,menu_item_id,name,kind,selection_type,allow_quantity,is_required,min_select,max_select,sort_order";
const menuModifierOptionSelect = "id,group_id,name,price_delta,pricing_mode,price_value,is_default,is_available,sort_order";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>> | ReturnType<typeof createAdminSupabaseClient>;

function isMissingMenuModifierSchema(error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST205" ||
    /menu_modifier_groups|menu_modifier_options|modifier/i.test(message)
  );
}

async function listPublicMenuModifierGroups(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  restaurantId: string
): Promise<Map<string, PublicMenuModifierGroup[]>> {
  const [groupsResult, optionsResult] = await Promise.all([
    supabase
      .from("menu_modifier_groups")
      .select(menuModifierGroupSelect)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("menu_modifier_options")
      .select(menuModifierOptionSelect)
      .eq("restaurant_id", restaurantId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
  ]);

  if (isMissingMenuModifierSchema(groupsResult.error) || isMissingMenuModifierSchema(optionsResult.error)) {
    return new Map();
  }

  throwIfSupabaseError(groupsResult.error);
  throwIfSupabaseError(optionsResult.error);

  const optionsByGroupId = new Map<string, PublicMenuModifierGroup["options"]>();
  for (const option of (optionsResult.data ?? []) as MenuModifierOptionRow[]) {
    const groupOptions = optionsByGroupId.get(option.group_id) ?? [];
    groupOptions.push({
      id: option.id,
      name: option.name,
      priceDelta: option.price_delta,
      pricingMode: option.pricing_mode ?? "DELTA",
      priceValue: option.price_value ?? null,
      isDefault: option.is_default ?? false,
      isAvailable: option.is_available
    });
    optionsByGroupId.set(option.group_id, groupOptions);
  }

  const groupsByItemId = new Map<string, PublicMenuModifierGroup[]>();
  for (const group of (groupsResult.data ?? []) as MenuModifierGroupRow[]) {
    const itemGroups = groupsByItemId.get(group.menu_item_id) ?? [];
    itemGroups.push({
      id: group.id,
      name: group.name,
      kind: group.kind ?? "CUSTOM",
      selectionType: group.selection_type ?? (group.max_select === 1 ? "SINGLE" : "MULTIPLE"),
      allowQuantity: group.allow_quantity ?? false,
      required: group.is_required,
      minSelect: group.min_select,
      maxSelect: group.max_select,
      options: optionsByGroupId.get(group.id) ?? []
    });
    groupsByItemId.set(group.menu_item_id, itemGroups);
  }

  return groupsByItemId;
}

async function listAdminMenuModifierGroups(
  supabase: ServerSupabaseClient,
  restaurantId: string,
  menuItemIds: string[]
): Promise<Map<string, PublicMenuModifierGroup[]>> {
  if (menuItemIds.length === 0) return new Map();

  const { data: groupsData, error: groupsError } = await supabase
    .from("menu_modifier_groups")
    .select(menuModifierGroupSelect)
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .in("menu_item_id", menuItemIds)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (isMissingMenuModifierSchema(groupsError)) return new Map();
  throwIfSupabaseError(groupsError);

  const groups = (groupsData ?? []) as MenuModifierGroupRow[];
  const groupIds = groups.map((group) => group.id);
  if (groupIds.length === 0) return new Map();

  const { data: optionsData, error: optionsError } = await supabase
    .from("menu_modifier_options")
    .select(menuModifierOptionSelect)
    .eq("restaurant_id", restaurantId)
    .in("group_id", groupIds)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (isMissingMenuModifierSchema(optionsError)) return new Map();
  throwIfSupabaseError(optionsError);

  const optionsByGroupId = new Map<string, PublicMenuModifierGroup["options"]>();
  for (const option of (optionsData ?? []) as MenuModifierOptionRow[]) {
    const groupOptions = optionsByGroupId.get(option.group_id) ?? [];
    groupOptions.push({
      id: option.id,
      name: option.name,
      priceDelta: option.price_delta,
      pricingMode: option.pricing_mode ?? "DELTA",
      priceValue: option.price_value ?? null,
      isDefault: option.is_default ?? false,
      isAvailable: option.is_available
    });
    optionsByGroupId.set(option.group_id, groupOptions);
  }

  const groupsByItemId = new Map<string, PublicMenuModifierGroup[]>();
  for (const group of groups) {
    const itemGroups = groupsByItemId.get(group.menu_item_id) ?? [];
    itemGroups.push({
      id: group.id,
      name: group.name,
      kind: group.kind ?? "CUSTOM",
      selectionType: group.selection_type ?? (group.max_select === 1 ? "SINGLE" : "MULTIPLE"),
      allowQuantity: group.allow_quantity ?? false,
      required: group.is_required,
      minSelect: group.min_select,
      maxSelect: group.max_select,
      options: optionsByGroupId.get(group.id) ?? []
    });
    groupsByItemId.set(group.menu_item_id, itemGroups);
  }

  return groupsByItemId;
}

function attachPublicMenuModifiers(categories: AdminMenuCategory[], groupsByItemId: Map<string, PublicMenuModifierGroup[]>): AdminMenuCategory[] {
  return categories.map((category) => ({
    ...category,
    items: (category.items ?? []).map((item) => ({
      ...item,
      modifierGroups: groupsByItemId.get(item.id) ?? []
    }))
  }));
}

export const getCachedPublicMenu = unstable_cache(
  async (restaurantSlug: string): Promise<PublicMenuRestaurant | null> => {
    const supabase = createAdminSupabaseClient();
    const { data: restaurantData, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id,name,slug,created_at,platform_status,deleted_at,logo_url,address,store_lat,store_lng,hotline,contact_email,allow_legacy_qr,receipt_footer,receipt_show_qr,show_promotions_on_menu,online_ordering_enabled,pickup_enabled,delivery_enabled,delivery_radius_km,free_delivery_radius_km,delivery_base_fee,delivery_fee_per_km,min_order_for_delivery,pickup_eta_minutes,delivery_eta_minutes,online_payment_mode,delivery_tracking_enabled,show_store_marker_on_ordering,show_customer_distance,show_delivery_eta,service_fee_enabled,service_fee_percent,service_fee_min,service_fee_max")
      .eq("slug", restaurantSlug)
      .maybeSingle();

    throwIfSupabaseError(restaurantError);
    const restaurant = restaurantData as Omit<PublicMenuRestaurant, "branches" | "categories" | "promotions" | "onlinePromotions"> | null;
    if (!isPublicTenantActive(restaurant)) return null;
    const activeBranches = await listActiveStoreBranches(restaurant.id);

    const [categoriesResult, promotions, onlinePromotions, modifierGroupsByItemId] = await Promise.all([
      supabase
        .from("menu_categories")
        .select("id,restaurant_id,name,items:menu_items(id,restaurant_id,category_id,name,price,image_url,is_available)")
        .eq("restaurant_id", restaurant.id)
        .eq("items.is_available", true)
        .order("name", { ascending: true })
        .order("name", { referencedTable: "menu_items", ascending: true }),
      restaurant.show_promotions_on_menu ? listPublicPromotions(restaurant.id, "QR_MENU") : Promise.resolve([]),
      restaurant.show_promotions_on_menu ? listPublicPromotions(restaurant.id, "WEBSITE") : Promise.resolve([]),
      listPublicMenuModifierGroups(supabase, restaurant.id)
    ]);

    throwIfSupabaseError(categoriesResult.error);

    return {
      ...restaurant,
      branches: activeBranches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        address: branch.address,
        isPrimary: Boolean(branch.is_primary),
        pickupEtaMinutes: Number(branch.pickup_eta_minutes ?? restaurant.pickup_eta_minutes),
        deliveryEtaMinutes: Number(branch.delivery_eta_minutes ?? restaurant.delivery_eta_minutes)
      })),
      promotions,
      onlinePromotions,
      categories: attachPublicMenuModifiers((categoriesResult.data ?? []) as unknown as AdminMenuCategory[], modifierGroupsByItemId)
    };
  },
  ["public-menu"],
  { revalidate: 60, tags: ["public-menu"] }
);

export function invalidateMenuCache() {
  adminMenuCache.clear();
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
    .insert({
      restaurant_id: input.restaurantId,
      category_id: input.categoryId,
      name: input.name,
      price: input.price,
      image_url: input.image || null,
      ...(typeof input.isAvailable === "boolean" ? { is_available: input.isAvailable } : {})
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

function throwMenuModifierError(error: Parameters<typeof throwIfSupabaseError>[0], fallback: string) {
  if (isMissingMenuModifierSchema(error)) {
    throw new AppError("Cấu hình topping/tùy chọn món chưa được cập nhật trong database.", 400);
  }

  throwIfSupabaseError(error, fallback);
}

function normalizeModifierName(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

function inferMenuOptionKind(name: string): NonNullable<PublicMenuModifierGroup["kind"]> {
  const normalized = normalizeModifierName(name);
  if (normalized.includes("size") || normalized.includes("kich co")) return "SIZE";
  if (normalized.includes("topping") || normalized.includes("tran chau")) return "TOPPING";
  if (normalized.includes("duong")) return "SUGAR";
  if (normalized.includes("da")) return "ICE";
  if (normalized.includes("mon kem") || normalized.includes("an kem") || normalized.includes("them")) return "ADDON";
  if (normalized.includes("combo") || normalized.includes("set")) return "COMBO";
  return "CUSTOM";
}

function inferMenuSelectionType(input: {
  kind: NonNullable<PublicMenuModifierGroup["kind"]>;
  maxSelect: number | null;
}): NonNullable<PublicMenuModifierGroup["selectionType"]> {
  if (input.maxSelect === 1) return "SINGLE";
  if (["SIZE", "ICE", "SUGAR", "CHOICE"].includes(input.kind)) return "SINGLE";
  if (["TOPPING", "ADDON"].includes(input.kind)) return "QUANTITY";
  return "MULTIPLE";
}

async function assertMenuItemForRestaurant(supabase: ServerSupabaseClient, restaurantId: string, itemId: string) {
  const { data, error } = await supabase
    .from("menu_items")
    .select("id")
    .eq("id", itemId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy món trong menu", 404);
}

async function assertModifierGroupForRestaurant(supabase: ServerSupabaseClient, restaurantId: string, groupId: string) {
  const { data, error } = await supabase
    .from("menu_modifier_groups")
    .select("id,menu_item_id")
    .eq("id", groupId)
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .maybeSingle();

  throwMenuModifierError(error, "Không tìm thấy nhóm tùy chọn");
  if (!data) throw new AppError("Không tìm thấy nhóm tùy chọn", 404);
  return data;
}

async function nextModifierGroupSortOrder(supabase: ServerSupabaseClient, restaurantId: string, itemId: string) {
  const { data, error } = await supabase
    .from("menu_modifier_groups")
    .select("sort_order")
    .eq("restaurant_id", restaurantId)
    .eq("menu_item_id", itemId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  throwMenuModifierError(error, "Không đọc được thứ tự nhóm tùy chọn");
  return Number(data?.sort_order ?? 0) + 10;
}

async function nextModifierOptionSortOrder(supabase: ServerSupabaseClient, restaurantId: string, groupId: string) {
  const { data, error } = await supabase
    .from("menu_modifier_options")
    .select("sort_order")
    .eq("restaurant_id", restaurantId)
    .eq("group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  throwMenuModifierError(error, "Không đọc được thứ tự tùy chọn");
  return Number(data?.sort_order ?? 0) + 10;
}

async function clearSiblingDefaultModifierOptions(
  supabase: ServerSupabaseClient,
  restaurantId: string,
  groupId: string,
  optionId: string
) {
  const { error } = await supabase
    .from("menu_modifier_options")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId)
    .eq("group_id", groupId)
    .neq("id", optionId);

  throwMenuModifierError(error, "Không cập nhật được lựa chọn mặc định");
}

export async function createMenuModifierGroup(input: {
  restaurantId: string;
  itemId: string;
  name: string;
  kind?: PublicMenuModifierGroup["kind"];
  selectionType?: PublicMenuModifierGroup["selectionType"];
  allowQuantity?: boolean;
  isRequired?: boolean;
  minSelect: number;
  maxSelect: number | null;
}) {
  const supabase = await createServerSupabaseClient();
  await assertMenuItemForRestaurant(supabase, input.restaurantId, input.itemId);
  const sortOrder = await nextModifierGroupSortOrder(supabase, input.restaurantId, input.itemId);
  const kind = input.kind ?? inferMenuOptionKind(input.name);
  const selectionType = input.selectionType ?? inferMenuSelectionType({ kind, maxSelect: input.maxSelect });
  const { data, error } = await supabase
    .from("menu_modifier_groups")
    .insert({
      restaurant_id: input.restaurantId,
      menu_item_id: input.itemId,
      name: input.name,
      kind,
      selection_type: selectionType,
      allow_quantity: input.allowQuantity ?? selectionType === "QUANTITY",
      is_required: Boolean(input.isRequired),
      min_select: input.minSelect,
      max_select: input.maxSelect,
      sort_order: sortOrder,
      is_active: true
    })
    .select()
    .single();

  throwMenuModifierError(error, "Không tạo được nhóm tùy chọn");
  invalidateMenuCache();
  return data;
}

export async function updateMenuModifierGroup(input: {
  restaurantId: string;
  itemId: string;
  groupId: string;
  name: string;
  kind?: PublicMenuModifierGroup["kind"];
  selectionType?: PublicMenuModifierGroup["selectionType"];
  allowQuantity?: boolean;
  isRequired?: boolean;
  minSelect: number;
  maxSelect: number | null;
}) {
  const supabase = await createServerSupabaseClient();
  await assertMenuItemForRestaurant(supabase, input.restaurantId, input.itemId);
  const kind = input.kind ?? inferMenuOptionKind(input.name);
  const selectionType = input.selectionType ?? inferMenuSelectionType({ kind, maxSelect: input.maxSelect });
  const { data, error } = await supabase
    .from("menu_modifier_groups")
    .update({
      menu_item_id: input.itemId,
      name: input.name,
      kind,
      selection_type: selectionType,
      allow_quantity: input.allowQuantity ?? selectionType === "QUANTITY",
      is_required: Boolean(input.isRequired),
      min_select: input.minSelect,
      max_select: input.maxSelect,
      updated_at: new Date().toISOString()
    })
    .eq("id", input.groupId)
    .eq("restaurant_id", input.restaurantId)
    .eq("is_active", true)
    .select()
    .single();

  throwMenuModifierError(error, "Không cập nhật được nhóm tùy chọn");
  invalidateMenuCache();
  return data;
}

export async function deleteMenuModifierGroup(restaurantId: string, groupId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_modifier_groups")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  throwMenuModifierError(error, "Không xóa được nhóm tùy chọn");
  invalidateMenuCache();
  return data;
}

export async function createMenuModifierOption(input: {
  restaurantId: string;
  groupId: string;
  name: string;
  priceDelta: number;
  pricingMode?: PublicMenuModifierGroup["options"][number]["pricingMode"];
  priceValue?: number | null;
  isDefault?: boolean;
  isAvailable?: boolean;
}) {
  const supabase = await createServerSupabaseClient();
  await assertModifierGroupForRestaurant(supabase, input.restaurantId, input.groupId);
  const sortOrder = await nextModifierOptionSortOrder(supabase, input.restaurantId, input.groupId);
  const { data, error } = await supabase
    .from("menu_modifier_options")
    .insert({
      restaurant_id: input.restaurantId,
      group_id: input.groupId,
      name: input.name,
      price_delta: input.priceDelta,
      pricing_mode: input.pricingMode ?? "DELTA",
      price_value: input.priceValue ?? null,
      is_default: Boolean(input.isDefault),
      is_available: input.isAvailable ?? true,
      sort_order: sortOrder
    })
    .select()
    .single();

  throwMenuModifierError(error, "Không tạo được tùy chọn");
  if (input.isDefault && data?.id) {
    await clearSiblingDefaultModifierOptions(supabase, input.restaurantId, input.groupId, data.id);
  }
  invalidateMenuCache();
  return data;
}

export async function updateMenuModifierOption(input: {
  restaurantId: string;
  groupId: string;
  optionId: string;
  name: string;
  priceDelta: number;
  pricingMode?: PublicMenuModifierGroup["options"][number]["pricingMode"];
  priceValue?: number | null;
  isDefault?: boolean;
  isAvailable?: boolean;
}) {
  const supabase = await createServerSupabaseClient();
  await assertModifierGroupForRestaurant(supabase, input.restaurantId, input.groupId);
  const { data, error } = await supabase
    .from("menu_modifier_options")
    .update({
      group_id: input.groupId,
      name: input.name,
      price_delta: input.priceDelta,
      pricing_mode: input.pricingMode ?? "DELTA",
      price_value: input.priceValue ?? null,
      is_default: Boolean(input.isDefault),
      is_available: input.isAvailable ?? false,
      updated_at: new Date().toISOString()
    })
    .eq("id", input.optionId)
    .eq("restaurant_id", input.restaurantId)
    .select()
    .single();

  throwMenuModifierError(error, "Không cập nhật được tùy chọn");
  if (input.isDefault && data?.id) {
    await clearSiblingDefaultModifierOptions(supabase, input.restaurantId, input.groupId, data.id);
  }
  invalidateMenuCache();
  return data;
}

export async function updateMenuModifierOptionAvailability(restaurantId: string, optionId: string, isAvailable: boolean) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_modifier_options")
    .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
    .eq("id", optionId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  throwMenuModifierError(error, "Không đổi được trạng thái tùy chọn");
  invalidateMenuCache();
  return data;
}

export async function deleteMenuModifierOption(restaurantId: string, optionId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("menu_modifier_options")
    .delete()
    .eq("id", optionId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  throwMenuModifierError(error, "Không xóa được tùy chọn");
  invalidateMenuCache();
  return data;
}

async function replaceModifierGroupsForItem(
  supabase: ServerSupabaseClient,
  restaurantId: string,
  targetItemId: string,
  sourceGroups: PublicMenuModifierGroup[]
) {
  const { error: deactivateError } = await supabase
    .from("menu_modifier_groups")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId)
    .eq("menu_item_id", targetItemId)
    .eq("is_active", true);

  throwMenuModifierError(deactivateError, "Không thể thay cách bán hiện tại");

  for (const [groupIndex, group] of sourceGroups.entries()) {
    const { data: insertedGroup, error: groupError } = await supabase
      .from("menu_modifier_groups")
      .insert(buildModifierGroupCloneRow({ restaurantId, targetItemId, group, groupIndex }))
      .select("id")
      .single();

    throwMenuModifierError(groupError, "Không thể sao chép nhóm cách bán");
    if (!insertedGroup?.id) throw new AppError("Không thể sao chép nhóm cách bán", 500);

    if (group.options.length === 0) continue;
    const optionRows = buildModifierOptionCloneRows({ restaurantId, targetGroupId: insertedGroup.id, options: group.options });
    const { error: optionError } = await supabase.from("menu_modifier_options").insert(optionRows);
    throwMenuModifierError(optionError, "Không thể sao chép lựa chọn cách bán");
  }
}

function isMissingMenuModifierSetupRpc(error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return error.code === "42883" || error.code === "PGRST202" || /replace_menu_modifier_setup|Could not find the function/i.test(message);
}

async function replaceModifierGroupsForItemsRpc(
  supabase: ServerSupabaseClient,
  restaurantId: string,
  sourceItemId: string,
  targetItemIds: string[]
) {
  const { error } = await supabase.rpc("replace_menu_modifier_setup", {
    p_restaurant_id: restaurantId,
    p_source_item_id: sourceItemId,
    p_target_item_ids: targetItemIds
  });

  if (isMissingMenuModifierSetupRpc(error)) return false;
  if (error?.message?.includes("Source menu item has no modifier setup")) {
    throw new AppError("Món nguồn chưa có cách bán để sao chép", 400);
  }
  if (error?.message?.includes("Source menu item not found") || error?.message?.includes("Target menu item not found")) {
    throw new AppError("Không tìm thấy món trong quán hiện tại", 404);
  }
  if (error?.message?.includes("Source item cannot be a target item")) {
    throw new AppError("Hãy chọn một món khác để sao chép", 400);
  }
  throwMenuModifierError(error, "Không thể áp dụng cách bán tự động");
  return true;
}

async function readModifierGroupsForSourceItem(
  supabase: ServerSupabaseClient,
  restaurantId: string,
  sourceItemId: string
) {
  await assertMenuItemForRestaurant(supabase, restaurantId, sourceItemId);
  const groups = (await listAdminMenuModifierGroups(supabase, restaurantId, [sourceItemId])).get(sourceItemId) ?? [];
  if (groups.length === 0) throw new AppError("Món nguồn chưa có cách bán để sao chép", 400);
  return groups;
}

export async function copyMenuModifierSetup(input: {
  restaurantId: string;
  sourceItemId: string;
  targetItemId: string;
}) {
  if (input.sourceItemId === input.targetItemId) throw new AppError("Hãy chọn một món khác để sao chép", 400);
  const supabase = await createServerSupabaseClient();
  const sourceGroups = await readModifierGroupsForSourceItem(supabase, input.restaurantId, input.sourceItemId);
  await assertMenuItemForRestaurant(supabase, input.restaurantId, input.targetItemId);
  const usedRpc = await replaceModifierGroupsForItemsRpc(supabase, input.restaurantId, input.sourceItemId, [input.targetItemId]);
  if (!usedRpc) {
    await replaceModifierGroupsForItem(supabase, input.restaurantId, input.targetItemId, sourceGroups);
  }
  invalidateMenuCache();
}

export async function applyMenuModifierSetupToCategory(input: {
  restaurantId: string;
  sourceItemId: string;
  categoryId: string;
}) {
  const supabase = await createServerSupabaseClient();
  const sourceGroups = await readModifierGroupsForSourceItem(supabase, input.restaurantId, input.sourceItemId);
  const { data: targetItems, error } = await supabase
    .from("menu_items")
    .select("id")
    .eq("restaurant_id", input.restaurantId)
    .eq("category_id", input.categoryId)
    .neq("id", input.sourceItemId)
    .limit(120);

  throwIfSupabaseError(error);
  if (!targetItems?.length) throw new AppError("Không có món khác trong danh mục để áp dụng", 400);

  const targetItemIds = targetItems.map((target) => target.id);
  const usedRpc = await replaceModifierGroupsForItemsRpc(supabase, input.restaurantId, input.sourceItemId, targetItemIds);
  if (!usedRpc) {
    for (const targetItemId of targetItemIds) {
      await replaceModifierGroupsForItem(supabase, input.restaurantId, targetItemId, sourceGroups);
    }
  }
  invalidateMenuCache();
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
    .eq("restaurant_id", restaurantId);

  throwIfSupabaseError(categoryReadError);

  const categoryByName = new Map((existingCategories ?? []).map((category) => [menuImportDuplicateKey(category.name), category.id]));
  const missingCategoryNames = categoryNames.filter((name) => !categoryByName.has(menuImportDuplicateKey(name)));

  if (missingCategoryNames.length > 0) {
    const { data: insertedCategories, error: categoryInsertError } = await supabase
      .from("menu_categories")
      .insert(missingCategoryNames.map((name) => ({ restaurant_id: restaurantId, name })))
      .select("id,name");

    throwIfSupabaseError(categoryInsertError);
    (insertedCategories ?? []).forEach((category) => categoryByName.set(menuImportDuplicateKey(category.name), category.id));
  }

  const rows = newItems
    .map((item) => ({
      restaurant_id: restaurantId,
      category_id: categoryByName.get(menuImportDuplicateKey(item.categoryName))!,
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
