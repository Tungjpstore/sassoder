import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import type { Database } from "@/types/supabase";

type RestaurantRow = Pick<
  Database["public"]["Tables"]["restaurants"]["Row"],
  | "id"
  | "name"
  | "address"
  | "store_lat"
  | "store_lng"
  | "delivery_radius_km"
  | "free_delivery_radius_km"
  | "delivery_base_fee"
  | "delivery_fee_per_km"
  | "pickup_eta_minutes"
  | "delivery_eta_minutes"
  | "opening_time"
  | "closing_time"
>;

export type StoreBranchRecord = Pick<
  Database["public"]["Tables"]["store_branches"]["Row"],
  | "id"
  | "restaurant_id"
  | "name"
  | "address"
  | "latitude"
  | "longitude"
  | "is_primary"
  | "is_active"
  | "delivery_radius_km"
  | "free_delivery_radius_km"
  | "delivery_base_fee"
  | "delivery_fee_per_km"
  | "pickup_eta_minutes"
  | "delivery_eta_minutes"
  | "accepting_delivery"
  | "delivery_paused"
  | "temporarily_closed"
  | "delivery_opening_time"
  | "delivery_closing_time"
  | "delivery_availability_note"
  | "metadata"
  | "created_at"
  | "updated_at"
>;

export type StoreBranchInput = {
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isPrimary?: boolean;
  isActive?: boolean;
};

const branchSelect =
  "id,restaurant_id,name,address,latitude,longitude,is_primary,is_active,delivery_radius_km,free_delivery_radius_km,delivery_base_fee,delivery_fee_per_km,pickup_eta_minutes,delivery_eta_minutes,accepting_delivery,delivery_paused,temporarily_closed,delivery_opening_time,delivery_closing_time,delivery_availability_note,metadata,created_at,updated_at";

const restaurantBranchDefaultSelect =
  "id,name,address,store_lat,store_lng,delivery_radius_km,free_delivery_radius_km,delivery_base_fee,delivery_fee_per_km,pickup_eta_minutes,delivery_eta_minutes,opening_time,closing_time";

function normalizeBranchText(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function normalizeCoordinate(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : null;
}

function isMissingOptionalBranchSidecar(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /inventory_locations|Could not find|does not exist/i.test(error.message ?? "")
  );
}

function assertCoordinatePair(input: Pick<StoreBranchInput, "latitude" | "longitude">) {
  const latitude = normalizeCoordinate(input.latitude);
  const longitude = normalizeCoordinate(input.longitude);
  if ((latitude === null) !== (longitude === null)) {
    throw new AppError("Vui lòng nhập đủ cả vĩ độ và kinh độ của chi nhánh.", 400);
  }
  return { latitude, longitude };
}

function defaultBranchPayload(restaurant: RestaurantRow) {
  return {
    restaurant_id: restaurant.id,
    name: "Chi nhánh chính",
    address: normalizeBranchText(restaurant.address, restaurant.name || "Chi nhánh chính"),
    latitude: normalizeCoordinate(restaurant.store_lat),
    longitude: normalizeCoordinate(restaurant.store_lng),
    is_primary: true,
    is_active: true,
    delivery_radius_km: restaurant.delivery_radius_km,
    free_delivery_radius_km: restaurant.free_delivery_radius_km,
    delivery_base_fee: restaurant.delivery_base_fee,
    delivery_fee_per_km: restaurant.delivery_fee_per_km,
    pickup_eta_minutes: restaurant.pickup_eta_minutes,
    delivery_eta_minutes: restaurant.delivery_eta_minutes,
    accepting_delivery: true,
    delivery_paused: false,
    temporarily_closed: false,
    delivery_opening_time: restaurant.opening_time,
    delivery_closing_time: restaurant.closing_time,
    delivery_availability_note: null,
    metadata: {
      createdFrom: "default_single_branch",
      source: "restaurant_profile"
    }
  };
}

async function getRestaurantBranchDefaults(supabase: ReturnType<typeof createAdminSupabaseClient>, restaurantId: string) {
  const { data, error } = await supabase
    .from("restaurants")
    .select(restaurantBranchDefaultSelect)
    .eq("id", restaurantId)
    .maybeSingle();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy quán để tạo chi nhánh mặc định.", 404);
  return data as RestaurantRow;
}

async function fetchBranches(supabase: ReturnType<typeof createAdminSupabaseClient>, restaurantId: string) {
  const { data, error } = await supabase
    .from("store_branches")
    .select(branchSelect)
    .eq("restaurant_id", restaurantId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })
    .order("name", { ascending: true });

  throwIfSupabaseError(error);
  return (data ?? []) as StoreBranchRecord[];
}

async function ensurePrimaryBranch(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  restaurantId: string,
  branches: StoreBranchRecord[]
) {
  const activeBranches = branches.filter((branch) => branch.is_active);
  if (activeBranches.length === 0) {
    const fallback = branches[0] ?? null;
    if (!fallback) return null;
    const { data, error } = await supabase
      .from("store_branches")
      .update({ is_active: true, is_primary: true })
      .eq("id", fallback.id)
      .eq("restaurant_id", restaurantId)
      .select(branchSelect)
      .single();

    throwIfSupabaseError(error);
    const branch = data as StoreBranchRecord;
    await ensureBranchInventoryLocation(supabase, branch);
    return branch;
  }
  const activePrimaryBranches = activeBranches.filter((branch) => branch.is_primary);
  const primary = activePrimaryBranches[0] ?? null;
  if (primary) {
    if (activePrimaryBranches.length > 1) {
      const { error } = await supabase
        .from("store_branches")
        .update({ is_primary: false })
        .eq("restaurant_id", restaurantId)
        .neq("id", primary.id);
      throwIfSupabaseError(error);
    }
    await ensureBranchInventoryLocation(supabase, primary);
    return primary;
  }

  const fallback = activeBranches[0];
  const { data, error } = await supabase
    .from("store_branches")
    .update({ is_primary: true })
    .eq("id", fallback.id)
    .eq("restaurant_id", restaurantId)
    .select(branchSelect)
    .single();

  throwIfSupabaseError(error);
  const branch = data as StoreBranchRecord;
  await ensureBranchInventoryLocation(supabase, branch);
  return branch;
}

async function ensureBranchInventoryLocation(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  branch: StoreBranchRecord | null
) {
  if (!branch?.id) return;
  const db = supabase as any;

  const existing = await db
    .from("inventory_locations")
    .select("id")
    .eq("restaurant_id", branch.restaurant_id)
    .eq("branch_id", branch.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    if (isMissingOptionalBranchSidecar(existing.error)) return;
    throwIfSupabaseError(existing.error);
  }
  if (existing.data) return;

  const { error } = await db.from("inventory_locations").insert({
    restaurant_id: branch.restaurant_id,
    branch_id: branch.id,
    name: `${branch.name} - Kho chính`,
    location_type: "branch_storage",
    code: "MAIN",
    is_primary: true,
    is_active: true,
    sort_order: 0,
    metadata: {
      seededFrom: "default_branch_service",
      branchId: branch.id
    }
  } as never);

  if (error && isMissingOptionalBranchSidecar(error)) return;
  throwIfSupabaseError(error);
}

export async function ensureDefaultStoreBranch(restaurantId: string) {
  const supabase = createAdminSupabaseClient();
  const existingBranches = await fetchBranches(supabase, restaurantId);
  if (existingBranches.length > 0) {
    return ensurePrimaryBranch(supabase, restaurantId, existingBranches);
  }

  const restaurant = await getRestaurantBranchDefaults(supabase, restaurantId);
  const payload = defaultBranchPayload(restaurant);
  const { data, error } = await supabase
    .from("store_branches")
    .insert(payload as never)
    .select(branchSelect)
    .single();

  if (error?.code === "23505") {
    const branchesAfterRace = await fetchBranches(supabase, restaurantId);
    return ensurePrimaryBranch(supabase, restaurantId, branchesAfterRace);
  }

  throwIfSupabaseError(error);
  const branch = data as StoreBranchRecord;
  await ensureBranchInventoryLocation(supabase, branch);
  return branch;
}

export async function listStoreBranchesForManagement(restaurantId: string) {
  const supabase = createAdminSupabaseClient();
  await ensureDefaultStoreBranch(restaurantId);
  return fetchBranches(supabase, restaurantId);
}

export async function listActiveStoreBranches(
  restaurantId: string,
  options: { requireCoordinates?: boolean } = {}
) {
  const supabase = createAdminSupabaseClient();
  await ensureDefaultStoreBranch(restaurantId);
  let query = supabase
    .from("store_branches")
    .select(branchSelect)
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });

  if (options.requireCoordinates) {
    query = query.not("latitude", "is", null).not("longitude", "is", null);
  }

  const { data, error } = await query;
  throwIfSupabaseError(error);
  return (data ?? []) as StoreBranchRecord[];
}

export async function createStoreBranch(restaurantId: string, input: StoreBranchInput) {
  const supabase = createAdminSupabaseClient();
  await ensureDefaultStoreBranch(restaurantId);
  const defaults = await getRestaurantBranchDefaults(supabase, restaurantId);
  const { latitude, longitude } = assertCoordinatePair(input);
  const isActive = input.isActive ?? true;
  const isPrimary = input.isPrimary === true && isActive;

  if (isPrimary) {
    const { error } = await supabase
      .from("store_branches")
      .update({ is_primary: false })
      .eq("restaurant_id", restaurantId);
    throwIfSupabaseError(error);
  }

  const { data, error } = await supabase
    .from("store_branches")
    .insert({
      ...defaultBranchPayload(defaults),
      name: normalizeBranchText(input.name, "Chi nhánh"),
      address: normalizeBranchText(input.address, input.name || defaults.name),
      latitude,
      longitude,
      is_primary: isPrimary,
      is_active: isActive,
      metadata: {
        createdFrom: "dashboard_branch_settings",
        source: "manual"
      }
    } as never)
    .select(branchSelect)
    .single();

  throwIfSupabaseError(error);
  await ensureBranchInventoryLocation(supabase, data as StoreBranchRecord);
  const branches = await fetchBranches(supabase, restaurantId);
  await ensurePrimaryBranch(supabase, restaurantId, branches);
  return data as StoreBranchRecord;
}

export async function updateStoreBranch(restaurantId: string, branchId: string, input: StoreBranchInput) {
  const supabase = createAdminSupabaseClient();
  await ensureDefaultStoreBranch(restaurantId);
  const branches = await fetchBranches(supabase, restaurantId);
  const current = branches.find((branch) => branch.id === branchId);
  if (!current) throw new AppError("Không tìm thấy chi nhánh cần cập nhật.", 404);

  const { latitude, longitude } = assertCoordinatePair(input);
  const nextActive = input.isActive ?? true;
  const activeBranches = branches.filter((branch) => branch.is_active);
  if (!nextActive && current.is_active && activeBranches.length <= 1) {
    throw new AppError("Quán cần ít nhất một chi nhánh đang hoạt động.", 400);
  }

  let nextPrimary = input.isPrimary === true;
  const otherActivePrimary = branches.some((branch) => branch.id !== branchId && branch.is_active && branch.is_primary);
  if (!nextPrimary && current.is_primary && !otherActivePrimary) nextPrimary = true;
  if (!nextActive) nextPrimary = false;

  if (nextPrimary) {
    const { error } = await supabase
      .from("store_branches")
      .update({ is_primary: false })
      .eq("restaurant_id", restaurantId)
      .neq("id", branchId);
    throwIfSupabaseError(error);
  }

  const { data, error } = await supabase
    .from("store_branches")
    .update({
      name: normalizeBranchText(input.name, current.name),
      address: normalizeBranchText(input.address, current.address),
      latitude,
      longitude,
      is_primary: nextPrimary,
      is_active: nextActive
    } as never)
    .eq("id", branchId)
    .eq("restaurant_id", restaurantId)
    .select(branchSelect)
    .single();

  throwIfSupabaseError(error);
  if ((data as StoreBranchRecord).is_active) {
    await ensureBranchInventoryLocation(supabase, data as StoreBranchRecord);
  }
  const nextBranches = await fetchBranches(supabase, restaurantId);
  await ensurePrimaryBranch(supabase, restaurantId, nextBranches);
  return data as StoreBranchRecord;
}
