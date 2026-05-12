import { AppError } from "@/lib/response";
import { createSlug } from "@/lib/slug";
import {
  getStaffPermissionPreset,
  normalizeStaffPermissions,
  type StaffPermissionProfile
} from "@/lib/staff-permissions";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadMenuImageFile, uploadRemoteMenuImageUrl } from "@/services/menu-image-service";
import { createInitialRestaurantSubscription } from "@/services/subscription-service";
import type { BusinessType, OrderStatus, PaymentMethod } from "@/types/domain";
import type { Database } from "@/types/supabase";
import type { Json } from "@/types/supabase";

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
type RestaurantDashboard = {
  restaurant: RestaurantRow;
  menuItems: number;
  tables: number;
  activeOrders: number;
};
type RestaurantOperationsSummary = {
  pending: number;
  ordering: number;
  completed: number;
  waitingPayment: number;
  waitingConfirm: number;
  paid: number;
  completedToday: number;
  todayOrders: number;
  todayRevenue: number;
  qrRevenue: number;
  cashRevenue: number;
  averageTicket: number;
  openOrderTotal: number;
  recentOrders: Array<{
    id: string;
    status: OrderStatus;
    total: number;
    paymentMethod: PaymentMethod | null;
    createdAt: string;
    tableName: string;
  }>;
};
type RestaurantDashboardBundle = {
  dashboard: RestaurantDashboard;
  operations: RestaurantOperationsSummary;
};
type StaffProfileRow = {
  id: string;
  email: string;
  role: "ADMIN" | "STAFF";
  restaurant_id: string;
  staff_title?: string | null;
  permission_profile?: StaffPermissionProfile | null;
  permissions?: Json | null;
  account_status?: "active" | "blocked";
};
type DashboardSnapshotRow = {
  dashboard?: {
    restaurant?: RestaurantRow;
    menuItems?: number;
    tables?: number;
    activeOrders?: number;
  };
  operations?: {
    pending?: number;
    ordering?: number;
    completed?: number;
    waitingPayment?: number;
    waitingConfirm?: number;
    paid?: number;
    completedToday?: number;
    todayOrders?: number;
    todayRevenue?: number;
    qrRevenue?: number;
    cashRevenue?: number;
    averageTicket?: number;
    openOrderTotal?: number;
    recentOrders?: Array<{
      id?: string;
      status?: OrderStatus;
      total?: number;
      paymentMethod?: PaymentMethod | null;
      createdAt?: string;
      tableName?: string;
    }>;
  };
};

const dashboardBundleCache = new Map<string, { expiresAt: number; value: RestaurantDashboardBundle }>();
const dashboardBundleTtlMs = 2_000;

function readCachedDashboardBundle(restaurantId: string) {
  const cached = dashboardBundleCache.get(restaurantId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    dashboardBundleCache.delete(restaurantId);
    return null;
  }
  return cached.value;
}

function writeCachedDashboardBundle(restaurantId: string, value: RestaurantDashboardBundle) {
  dashboardBundleCache.set(restaurantId, {
    value,
    expiresAt: Date.now() + dashboardBundleTtlMs
  });
}

function isMissingStaffProfileColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST204" || /staff_title|permission_profile|permissions/i.test(error.message ?? "");
}

function hydrateStaffProfile(row: StaffProfileRow) {
  const preset = getStaffPermissionPreset(row.permission_profile ?? (row.role === "ADMIN" ? "manager" : "service"));
  return {
    ...row,
    staff_title: row.staff_title ?? preset.title,
    permission_profile: preset.key,
    permissions: normalizeStaffPermissions(row.permissions, preset.key),
    account_status: row.account_status ?? "active"
  };
}

export function invalidateRestaurantDashboardCache(restaurantId: string) {
  dashboardBundleCache.delete(restaurantId);
}

function isMissingDashboardRpc(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST202" || error.message?.includes("get_admin_dashboard_snapshot");
}

function normalizeDashboardSnapshot(value: Json): RestaurantDashboardBundle | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as DashboardSnapshotRow;
  const restaurant = snapshot.dashboard?.restaurant;
  if (!restaurant?.id) return null;

  const recentOrders = snapshot.operations?.recentOrders ?? [];

  return {
    dashboard: {
      restaurant,
      menuItems: Number(snapshot.dashboard?.menuItems ?? 0),
      tables: Number(snapshot.dashboard?.tables ?? 0),
      activeOrders: Number(snapshot.dashboard?.activeOrders ?? 0)
    },
    operations: {
      pending: Number(snapshot.operations?.pending ?? 0),
      ordering: Number(snapshot.operations?.ordering ?? 0),
      completed: Number(snapshot.operations?.completed ?? 0),
      waitingPayment: Number(snapshot.operations?.waitingPayment ?? 0),
      waitingConfirm: Number(snapshot.operations?.waitingConfirm ?? 0),
      paid: Number(snapshot.operations?.paid ?? 0),
      completedToday: Number(snapshot.operations?.completedToday ?? 0),
      todayOrders: Number(snapshot.operations?.todayOrders ?? 0),
      todayRevenue: Number(snapshot.operations?.todayRevenue ?? 0),
      qrRevenue: Number(snapshot.operations?.qrRevenue ?? 0),
      cashRevenue: Number(snapshot.operations?.cashRevenue ?? 0),
      averageTicket: Number(snapshot.operations?.averageTicket ?? 0),
      openOrderTotal: Number(snapshot.operations?.openOrderTotal ?? 0),
      recentOrders: recentOrders
        .filter((order) => order.id && order.status && typeof order.total === "number")
        .map((order) => ({
          id: order.id as string,
          status: order.status as OrderStatus,
          total: Number(order.total ?? 0),
          paymentMethod: order.paymentMethod ?? null,
          createdAt: order.createdAt ?? "",
          tableName: order.tableName || "Không rõ bàn"
        }))
    }
  };
}

export async function getRestaurantBySlug(slug: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.from("restaurants").select("*").eq("slug", slug).maybeSingle();
  throwIfSupabaseError(error);
  return data;
}

export async function isRestaurantSlugAvailable(slug: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.from("restaurants").select("id").eq("slug", slug).maybeSingle();
  throwIfSupabaseError(error);
  return !data;
}

export async function createUniqueRestaurantSlug(name: string, preferredSlug?: string | null) {
  const base = createSlug(preferredSlug || name) || "quan";
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select("slug")
    .or(`slug.eq.${base},slug.like.${base}-%`);

  throwIfSupabaseError(error);

  const used = new Set((data ?? []).map((row) => row.slug));
  if (!used.has(base)) return base;

  for (let index = 2; index <= 999; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}

export async function getRestaurantDashboard(restaurantId: string) {
  const supabase = await createServerSupabaseClient();
  const [restaurant, menuItems, tables, activeOrders] = await Promise.all([
    supabase.from("restaurants").select("*").eq("id", restaurantId).single(),
    supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    supabase.from("tables").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .in("status", ["pending", "ordering", "completed", "waiting_payment", "waiting_confirm"])
  ]);

  throwIfSupabaseError(restaurant.error);
  throwIfSupabaseError(menuItems.error);
  throwIfSupabaseError(tables.error);
  throwIfSupabaseError(activeOrders.error);
  if (!restaurant.data) throw new AppError("Không tìm thấy quán", 404);

  return {
    restaurant: restaurant.data,
    menuItems: menuItems.count ?? 0,
    tables: tables.count ?? 0,
    activeOrders: activeOrders.count ?? 0
  };
}

type DashboardOrderRow = {
  id: string;
  status: OrderStatus;
  total: number;
  payment_method: PaymentMethod | null;
  created_at: string;
  fulfillment_type?: "DINE_IN" | "PICKUP" | "DELIVERY";
  table: { name: string } | { name: string }[] | null;
};

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function orderLocationLabel(order: { fulfillment_type?: "DINE_IN" | "PICKUP" | "DELIVERY"; table?: { name: string } | { name: string }[] | null }) {
  if (order.fulfillment_type === "DELIVERY") return "Giao hàng";
  if (order.fulfillment_type === "PICKUP") return "Đến lấy";
  return firstOrNull(order.table)?.name ?? "Không rõ bàn";
}

export async function getRestaurantOperationsSummary(restaurantId: string) {
  const supabase = await createServerSupabaseClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const activeStatuses: OrderStatus[] = ["pending", "ordering", "completed", "waiting_payment", "waiting_confirm"];
  const [todayOrders, openOrders, recentOrders] = await Promise.all([
    supabase
      .from("orders")
      .select("id,total,status,payment_method,payment_status")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", startOfDay.toISOString()),
    supabase
      .from("orders")
      .select("id,total,status")
      .eq("restaurant_id", restaurantId)
      .in("status", activeStatuses),
    supabase
      .from("orders")
      .select("id,status,total,payment_method,fulfillment_type,created_at,table:tables(name)")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(6)
  ]);

  throwIfSupabaseError(todayOrders.error);
  throwIfSupabaseError(openOrders.error);
  throwIfSupabaseError(recentOrders.error);

  const todayRows = todayOrders.data ?? [];
  const openRows = openOrders.data ?? [];
  const paidTodayRows = todayRows.filter((order) => order.status === "paid" || order.payment_status === "paid");
  const todayRevenue = paidTodayRows.reduce((sum, order) => sum + order.total, 0);
  const qrRevenue = paidTodayRows
    .filter((order) => order.payment_method === "QR")
    .reduce((sum, order) => sum + order.total, 0);
  const cashRevenue = paidTodayRows
    .filter((order) => order.payment_method === "CASH")
    .reduce((sum, order) => sum + order.total, 0);
  const averageTicket = paidTodayRows.length > 0 ? Math.round(todayRevenue / paidTodayRows.length) : 0;
  const openOrderTotal = openRows.reduce((sum, order) => sum + order.total, 0);
  const openStatusCounts = openRows.reduce(
    (acc, order) => {
      acc[order.status] = (acc[order.status] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<OrderStatus, number>>
  );

  return {
    pending: openStatusCounts.pending ?? 0,
    ordering: openStatusCounts.ordering ?? 0,
    completed: openStatusCounts.completed ?? 0,
    waitingPayment: openStatusCounts.waiting_payment ?? 0,
    waitingConfirm: openStatusCounts.waiting_confirm ?? 0,
    paid: paidTodayRows.length,
    completedToday: todayRows.filter((order) => order.status === "completed").length,
    todayOrders: todayRows.length,
    todayRevenue,
    qrRevenue,
    cashRevenue,
    averageTicket,
    openOrderTotal,
    recentOrders: ((recentOrders.data ?? []) as unknown as DashboardOrderRow[]).map((order) => ({
      id: order.id,
      status: order.status,
      total: order.total,
      paymentMethod: order.payment_method,
      createdAt: order.created_at,
      tableName: orderLocationLabel(order)
    }))
  };
}

export async function getRestaurantAdminDashboard(restaurantId: string) {
  const cached = readCachedDashboardBundle(restaurantId);
  if (cached) return cached;

  const supabase = createAdminSupabaseClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase.rpc("get_admin_dashboard_snapshot", {
    target_restaurant_id: restaurantId,
    today_start: startOfDay.toISOString()
  });

  if (!error) {
    const snapshot = normalizeDashboardSnapshot(data as Json);
    if (!snapshot) throw new AppError("Không tìm thấy quán", 404);
    writeCachedDashboardBundle(restaurantId, snapshot);
    return snapshot;
  }

  if (!isMissingDashboardRpc(error)) {
    throwIfSupabaseError(error);
  }

  const [dashboard, operations] = await Promise.all([
    getRestaurantDashboard(restaurantId),
    getRestaurantOperationsSummary(restaurantId)
  ]);
  const fallback = { dashboard, operations };
  writeCachedDashboardBundle(restaurantId, fallback);
  return fallback;
}

export async function getRestaurantPaymentSettings(restaurantId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select("id,name,slug,bank_code,bank_account,bank_account_name")
    .eq("id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy quán", 404);
  return data;
}

export async function listRestaurantUsers(restaurantId: string) {
  const supabase = (await createServerSupabaseClient()) as any;
  const { data, error } = await supabase
    .from("users")
    .select("id,email,role,restaurant_id,staff_title,permission_profile,permissions,account_status")
    .eq("restaurant_id", restaurantId)
    .order("role", { ascending: true })
    .order("email", { ascending: true });

  if (isMissingStaffProfileColumn(error)) {
    const fallback = await supabase
      .from("users")
      .select("id,email,role,restaurant_id,account_status")
      .eq("restaurant_id", restaurantId)
      .order("role", { ascending: true })
      .order("email", { ascending: true });
    throwIfSupabaseError(fallback.error);
    return (fallback.data ?? []).map((row: StaffProfileRow) => hydrateStaffProfile(row));
  }

  throwIfSupabaseError(error);
  return (data ?? []).map((row: StaffProfileRow) => hydrateStaffProfile(row));
}

export async function createRestaurantUser(input: {
  restaurantId: string;
  email: string;
  password: string;
  permissionProfile: StaffPermissionProfile;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const normalizedEmail = input.email.toLowerCase();
  const preset = getStaffPermissionPreset(input.permissionProfile);

  const { data: existingUser, error: existingUserError } = await supabase
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();
  throwIfSupabaseError(existingUserError);
  if (existingUser) {
    throw new AppError("Email này đã có tài khoản trong hệ thống.", 409);
  }

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      restaurant_id: input.restaurantId,
      role: preset.role,
      staff_title: preset.title,
      permission_profile: preset.key,
      permissions: preset.permissions
    }
  });

  if (authError || !authUser.user) {
    throw new AppError(authError?.message ?? "Không tạo được tài khoản nhân viên", 400);
  }

  let { data, error } = await supabase
    .from("users")
    .insert({
      id: authUser.user.id,
      email: normalizedEmail,
      role: preset.role,
      restaurant_id: input.restaurantId,
      staff_title: preset.title,
      permission_profile: preset.key,
      permissions: preset.permissions
    })
    .select()
    .single();

  if (isMissingStaffProfileColumn(error)) {
    const fallback = await supabase
      .from("users")
      .insert({
        id: authUser.user.id,
        email: normalizedEmail,
        role: preset.role,
        restaurant_id: input.restaurantId
      })
      .select()
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    throw new AppError(error.message, 400);
  }

  return data;
}

export async function updateRestaurantUserRole(input: {
  restaurantId: string;
  userId: string;
  actorUserId: string;
  permissionProfile: StaffPermissionProfile;
}) {
  if (input.userId === input.actorUserId) {
    throw new AppError("Bạn không thể đổi vai trò của chính tài khoản đang đăng nhập.", 400);
  }

  const preset = getStaffPermissionPreset(input.permissionProfile);
  const supabase = createAdminSupabaseClient() as any;
  let userResult = await supabase
    .from("users")
    .select("id,email,role,restaurant_id,permission_profile,permissions")
    .eq("id", input.userId)
    .eq("restaurant_id", input.restaurantId)
    .single();

  if (isMissingStaffProfileColumn(userResult.error)) {
    userResult = await supabase
      .from("users")
      .select("id,email,role,restaurant_id")
      .eq("id", input.userId)
      .eq("restaurant_id", input.restaurantId)
      .single();
  }

  const user = userResult.data as StaffProfileRow | null;
  throwIfSupabaseError(userResult.error);
  if (!user) throw new AppError("Không tìm thấy nhân viên", 404);

  if (user.role === "ADMIN" && preset.role === "STAFF") {
    const { count, error } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", input.restaurantId)
      .eq("role", "ADMIN");
    throwIfSupabaseError(error);
    if ((count ?? 0) <= 1) {
      throw new AppError("Cần giữ lại ít nhất một tài khoản quản lý cho quán.", 400);
    }
  }

  let updateResult = await supabase
    .from("users")
    .update({
      role: preset.role,
      staff_title: preset.title,
      permission_profile: preset.key,
      permissions: preset.permissions
    })
    .eq("id", input.userId)
    .eq("restaurant_id", input.restaurantId)
    .select()
    .single();

  if (isMissingStaffProfileColumn(updateResult.error)) {
    updateResult = await supabase
      .from("users")
      .update({ role: preset.role })
      .eq("id", input.userId)
      .eq("restaurant_id", input.restaurantId)
      .select()
      .single();
  }

  throwIfSupabaseError(updateResult.error);

  const { error: metadataError } = await supabase.auth.admin.updateUserById(input.userId, {
    user_metadata: {
      restaurant_id: input.restaurantId,
      role: preset.role,
      staff_title: preset.title,
      permission_profile: preset.key,
      permissions: normalizeStaffPermissions(preset.permissions, preset.key)
    }
  });
  if (metadataError) throw new AppError(metadataError.message, 400);

  return updateResult.data;
}

export async function deleteRestaurantUser(input: {
  restaurantId: string;
  userId: string;
  actorUserId: string;
}) {
  if (input.userId === input.actorUserId) {
    throw new AppError("Bạn không thể xoá chính tài khoản đang đăng nhập.", 400);
  }

  const supabase = createAdminSupabaseClient();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id,email,role,restaurant_id")
    .eq("id", input.userId)
    .eq("restaurant_id", input.restaurantId)
    .single();

  throwIfSupabaseError(userError);
  if (!user) throw new AppError("Không tìm thấy nhân viên", 404);

  if (user.role === "ADMIN") {
    const { count, error } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", input.restaurantId)
      .eq("role", "ADMIN");
    throwIfSupabaseError(error);
    if ((count ?? 0) <= 1) {
      throw new AppError("Cần giữ lại ít nhất một tài khoản quản lý cho quán.", 400);
    }
  }

  const { error } = await supabase.auth.admin.deleteUser(input.userId);
  if (error) throw new AppError(error.message, 400);
}

type RegistrationIntentPayload = {
  name: string;
  slug?: string;
  businessType: BusinessType;
  customBusinessType?: string;
  tableCount: number;
  address?: string;
  storeLat?: number;
  storeLng?: number;
  hotline?: string;
  brandSlogan?: string;
  brandDescription?: string;
  logoUrl?: string;
  initialMenuItem?: {
    name: string;
    price: number;
    categoryName?: string;
  };
  initialMenuItems?: Array<{
    name: string;
    price: number;
    categoryName?: string;
  }>;
  bankCode?: string;
  bankAccount?: string;
  bankAccountName?: string;
  planCode?: string;
};

function parseRegistrationIntentMenuItem(value: Json): RegistrationIntentPayload["initialMenuItem"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as Record<string, Json>;
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const price = typeof item.price === "number" ? item.price : Number(item.price);
  const categoryName = typeof item.categoryName === "string" ? item.categoryName.trim() : undefined;
  if (!name || !Number.isFinite(price) || price <= 0) return undefined;
  return { name, price, categoryName };
}

function parseRegistrationIntentMenuItems(value: Json): NonNullable<RegistrationIntentPayload["initialMenuItems"]> {
  if (!Array.isArray(value)) return [];
  return value.map(parseRegistrationIntentMenuItem).filter((item): item is NonNullable<RegistrationIntentPayload["initialMenuItem"]> => Boolean(item)).slice(0, 80);
}

function parseRegistrationIntentPayload(value: Json): RegistrationIntentPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("Dữ liệu đăng ký đã hết hạn hoặc không hợp lệ", 400);
  }

  const payload = value as Record<string, Json>;
  const name = typeof payload.name === "string" ? payload.name : "";
  const slug = typeof payload.slug === "string" ? payload.slug : undefined;
  const businessType = typeof payload.businessType === "string" ? payload.businessType : "";
  const customBusinessType = typeof payload.customBusinessType === "string" ? payload.customBusinessType.trim() : undefined;
  const tableCount = typeof payload.tableCount === "number" ? payload.tableCount : Number(payload.tableCount);
  const address = typeof payload.address === "string" ? payload.address : undefined;
  const storeLat = typeof payload.storeLat === "number" ? payload.storeLat : undefined;
  const storeLng = typeof payload.storeLng === "number" ? payload.storeLng : undefined;
  const hotline = typeof payload.hotline === "string" ? payload.hotline : undefined;
  const brandSlogan = typeof payload.brandSlogan === "string" ? payload.brandSlogan : undefined;
  const brandDescription = typeof payload.brandDescription === "string" ? payload.brandDescription : undefined;
  const logoUrl = typeof payload.logoUrl === "string" ? payload.logoUrl : undefined;
  const initialMenuItem = parseRegistrationIntentMenuItem(payload.initialMenuItem);
  const initialMenuItems = parseRegistrationIntentMenuItems(payload.initialMenuItems);
  const bankCode = typeof payload.bankCode === "string" ? payload.bankCode : undefined;
  const bankAccount = typeof payload.bankAccount === "string" ? payload.bankAccount : undefined;
  const bankAccountName = typeof payload.bankAccountName === "string" ? payload.bankAccountName : undefined;
  const planCode = typeof payload.planCode === "string" ? payload.planCode : undefined;

  if (!name || !["CAFE", "RESTAURANT", "FAST_FOOD", "BAR", "OTHER"].includes(businessType) || !Number.isInteger(tableCount)) {
    throw new AppError("Dữ liệu đăng ký đã hết hạn hoặc không hợp lệ", 400);
  }

  return {
    name,
    slug,
    businessType: businessType as BusinessType,
    customBusinessType,
    tableCount,
    address,
    storeLat,
    storeLng,
    hotline,
    brandSlogan,
    brandDescription,
    logoUrl,
    initialMenuItem,
    initialMenuItems,
    bankCode,
    bankAccount,
    bankAccountName,
    planCode
  };
}

export async function getRestaurantForUser(userId: string, email?: string | null) {
  const supabase = createAdminSupabaseClient();
  let { data, error } = await supabase
    .from("users")
    .select("restaurant:restaurants(id,name,slug)")
    .eq("id", userId)
    .maybeSingle();

  if (!data && !error && email) {
    const fallback = await supabase
      .from("users")
      .select("restaurant:restaurants(id,name,slug)")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    data = fallback.data;
    error = fallback.error;
  }

  throwIfSupabaseError(error);
  const row = data as
    | {
        restaurant: { id: string; name: string; slug: string } | Array<{ id: string; name: string; slug: string }> | null;
      }
    | null;
  const restaurant = Array.isArray(row?.restaurant) ? row?.restaurant[0] : row?.restaurant;
  return restaurant ?? null;
}

async function getRestaurantRowForUser(userId: string, email?: string | null) {
  const existingRestaurant = await getRestaurantForUser(userId, email);
  if (!existingRestaurant?.id) return null;

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.from("restaurants").select("*").eq("id", existingRestaurant.id).maybeSingle();
  throwIfSupabaseError(error);
  return data;
}

export async function createRegistrationIntent(input: {
  userId: string;
  email: string;
  payload: RegistrationIntentPayload;
}) {
  const supabase = createAdminSupabaseClient();
  const normalizedEmail = input.email.toLowerCase();

  await supabase
    .from("registration_intents")
    .update({ consumed_at: new Date().toISOString() })
    .eq("email", normalizedEmail)
    .is("consumed_at", null);

  const { data, error } = await supabase
    .from("registration_intents")
    .insert({
      email: normalizedEmail,
      user_id: input.userId,
      payload: JSON.parse(JSON.stringify(input.payload)) as Json
    })
    .select("id")
    .single();

  throwIfSupabaseError(error);
  return data;
}

export async function consumeRegistrationIntentForUser(input: { userId: string; email: string }) {
  const existingRestaurant = await getRestaurantForUser(input.userId, input.email);
  if (existingRestaurant) return existingRestaurant;

  const supabase = createAdminSupabaseClient();
  const normalizedEmail = input.email.toLowerCase();
  const { data: userIntent, error: userIntentError } = await supabase
    .from("registration_intents")
    .select("id,payload")
    .eq("user_id", input.userId)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  throwIfSupabaseError(userIntentError);

  const { data: emailIntent, error: emailIntentError } = userIntent
    ? { data: null, error: null }
    : await supabase
        .from("registration_intents")
        .select("id,payload")
        .eq("email", normalizedEmail)
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  throwIfSupabaseError(emailIntentError);
  const intent = userIntent ?? emailIntent;
  if (!intent) return null;

  const payload = parseRegistrationIntentPayload(intent.payload);
  const restaurant = await completeRestaurantOnboarding({
    userId: input.userId,
    email: normalizedEmail,
    ...payload
  });

  const { error: consumeError } = await supabase
    .from("registration_intents")
    .update({ consumed_at: new Date().toISOString(), user_id: input.userId })
    .eq("id", intent.id);

  throwIfSupabaseError(consumeError);
  return restaurant;
}

type MenuTemplate = Array<{
  name: string;
  items: Array<{ name: string; price: number }>;
}>;

const categoryTemplates: Record<BusinessType, MenuTemplate> = {
  CAFE: [
    {
      name: "Cà phê",
      items: [
        { name: "Cà phê sữa đá", price: 29000 },
        { name: "Bạc xỉu", price: 35000 }
      ]
    },
    {
      name: "Trà",
      items: [
        { name: "Trà đào cam sả", price: 45000 },
        { name: "Trà vải", price: 42000 }
      ]
    },
    {
      name: "Bánh ngọt",
      items: [{ name: "Croissant bơ", price: 39000 }]
    }
  ],
  RESTAURANT: [
    {
      name: "Món chính",
      items: [
        { name: "Cơm gà xối mỡ", price: 69000 },
        { name: "Bún bò Huế", price: 65000 }
      ]
    },
    {
      name: "Món ăn kèm",
      items: [
        { name: "Gỏi cuốn", price: 39000 },
        { name: "Khoai tây chiên", price: 35000 }
      ]
    },
    {
      name: "Đồ uống",
      items: [{ name: "Trà đá", price: 8000 }]
    }
  ],
  FAST_FOOD: [
    {
      name: "Combo",
      items: [
        { name: "Combo burger bò", price: 89000 },
        { name: "Combo gà giòn", price: 79000 }
      ]
    },
    {
      name: "Món lẻ",
      items: [
        { name: "Burger phô mai", price: 59000 },
        { name: "Gà rán 2 miếng", price: 69000 }
      ]
    },
    {
      name: "Đồ uống",
      items: [{ name: "Coca-Cola", price: 19000 }]
    }
  ],
  BAR: [
    {
      name: "Cocktail",
      items: [
        { name: "Mojito", price: 99000 },
        { name: "Whisky Sour", price: 119000 }
      ]
    },
    {
      name: "Bia",
      items: [
        { name: "Bia tươi", price: 49000 },
        { name: "Craft IPA", price: 89000 }
      ]
    },
    {
      name: "Món nhắm",
      items: [{ name: "Khoai tây chiên phô mai", price: 69000 }]
    }
  ],
  OTHER: [
    {
      name: "Bán chạy",
      items: [
        { name: "Món nổi bật 1", price: 59000 },
        { name: "Món nổi bật 2", price: 69000 }
      ]
    },
    {
      name: "Đồ uống",
      items: [{ name: "Nước suối", price: 12000 }]
    }
  ]
};

type SeedMenuItem = {
  restaurant_id: string;
  category_id: string;
  name: string;
  price: number;
  is_available: boolean;
};

function menuItemSeedKey(name: string) {
  return name.trim().normalize("NFC").toLowerCase();
}

export async function completeRestaurantOnboarding(input: {
  userId: string;
  email: string;
  name: string;
  slug?: string;
  businessType: BusinessType;
  customBusinessType?: string;
  tableCount: number;
  address?: string;
  storeLat?: number;
  storeLng?: number;
  hotline?: string;
  logoUrl?: string;
  logoFile?: FormDataEntryValue | null;
  brandSlogan?: string;
  brandDescription?: string;
  initialMenuItem?: {
    name: string;
    price: number;
    categoryName?: string;
  };
  initialMenuItems?: Array<{
    name: string;
    price: number;
    categoryName?: string;
  }>;
  bankCode?: string;
  bankAccount?: string;
  bankAccountName?: string;
  planCode?: string;
}) {
  const existingRestaurant = await getRestaurantRowForUser(input.userId, input.email);
  if (existingRestaurant) return existingRestaurant;

  const supabase = createAdminSupabaseClient();
  const slug = await createUniqueRestaurantSlug(input.name, input.slug);
  const customBusinessType = input.customBusinessType?.trim();
  const brandDescription = input.brandDescription?.trim();
  const brandSlogan = input.brandSlogan?.trim();

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .insert({
      name: input.name,
      slug,
      business_type: input.businessType,
      table_count: input.tableCount,
      contact_email: input.email.toLowerCase(),
      address: input.address || null,
      store_lat: input.storeLat ?? null,
      store_lng: input.storeLng ?? null,
      hotline: input.hotline || null,
      description: brandDescription || (customBusinessType ? `Loại hình: ${customBusinessType}` : null),
      logo_url: input.logoUrl || null,
      brand_primary: "#0F4D3A",
      brand_accent: "#F28C28",
      receipt_footer: brandSlogan || null,
      bank_code: input.bankCode || null,
      bank_account: input.bankAccount || null,
      bank_account_name: input.bankAccountName || null
    })
    .select()
    .single();

  if (restaurantError || !restaurant) {
    throw new AppError(restaurantError?.message ?? "Không tạo được quán", 400);
  }

  let onboardedRestaurant = restaurant;

  const { error: profileError } = await supabase.from("users").insert({
    id: input.userId,
    email: input.email.toLowerCase(),
    role: "ADMIN",
    restaurant_id: restaurant.id
  });

  if (profileError) {
    const existingAfterProfileConflict = await getRestaurantRowForUser(input.userId, input.email);
    await supabase.from("restaurants").delete().eq("id", restaurant.id);
    if (existingAfterProfileConflict) return existingAfterProfileConflict;
    throw new AppError(profileError.message, 400);
  }

  if (input.logoFile) {
    try {
      const logoUrl = await uploadMenuImageFile({ restaurantId: restaurant.id, file: input.logoFile });
      if (logoUrl) {
        const { data: updatedRestaurant, error: logoUpdateError } = await supabase
          .from("restaurants")
          .update({ logo_url: logoUrl })
          .eq("id", restaurant.id)
          .select()
          .single();

        if (logoUpdateError) throw logoUpdateError;
        onboardedRestaurant = updatedRestaurant;
      }
    } catch (error) {
      console.error("Failed to upload onboarding restaurant logo", error);
    }
  } else if (input.logoUrl) {
    try {
      const persistedLogoUrl = await uploadRemoteMenuImageUrl({ restaurantId: restaurant.id, imageUrl: input.logoUrl });
      if (persistedLogoUrl) {
        const { data: updatedRestaurant, error: logoUpdateError } = await supabase
          .from("restaurants")
          .update({ logo_url: persistedLogoUrl })
          .eq("id", restaurant.id)
          .select()
          .single();

        if (logoUpdateError) throw logoUpdateError;
        onboardedRestaurant = updatedRestaurant;
      }
    } catch (error) {
      console.error("Failed to persist onboarding AI logo", error);
    }
  }

  const requestedInitialMenuItems = [
    ...(input.initialMenuItems ?? []),
    ...(input.initialMenuItem ? [input.initialMenuItem] : [])
  ];
  const categorySeedNames = new Set<string>();
  const categories = categoryTemplates[input.businessType].map((category) => {
    categorySeedNames.add(menuItemSeedKey(category.name));
    return {
      restaurant_id: restaurant.id,
      name: category.name
    };
  });

  for (const initialMenuItem of requestedInitialMenuItems) {
    const categoryName = initialMenuItem.categoryName?.trim();
    if (!categoryName) continue;
    const key = menuItemSeedKey(categoryName);
    if (!key || categorySeedNames.has(key)) continue;
    categorySeedNames.add(key);
    categories.push({
      restaurant_id: restaurant.id,
      name: categoryName
    });
  }

  const tables = Array.from({ length: input.tableCount }, (_, index) => ({
    restaurant_id: restaurant.id,
    name: `Bàn ${index + 1}`
  }));

  const [{ error: tableError }, { data: insertedCategories, error: categoryError }] = await Promise.all([
    supabase.from("tables").insert(tables),
    supabase.from("menu_categories").insert(categories).select("id,name")
  ]);

  if (tableError || categoryError) {
    await supabase.from("restaurants").delete().eq("id", restaurant.id);
    throw new AppError(tableError?.message ?? categoryError?.message ?? "Không tạo được dữ liệu khởi tạo", 400);
  }

  const categoryByName = new Map((insertedCategories ?? []).map((category) => [category.name, category.id]));
  const menuItems: SeedMenuItem[] = [];
  const seenMenuItemNames = new Set<string>();

  function appendMenuItem(item: SeedMenuItem) {
    const key = menuItemSeedKey(item.name);
    if (!key || seenMenuItemNames.has(key)) return;
    seenMenuItemNames.add(key);
    menuItems.push({ ...item, name: item.name.trim() });
  }

  for (const initialMenuItem of requestedInitialMenuItems) {
    if (!initialMenuItem.name || !Number.isFinite(initialMenuItem.price) || initialMenuItem.price <= 0) continue;
    const fallbackCategoryId = insertedCategories?.[0]?.id;
    const categoryId = categoryByName.get(initialMenuItem.categoryName || "") ?? fallbackCategoryId;
    if (categoryId) {
      appendMenuItem({
        restaurant_id: restaurant.id,
        category_id: categoryId,
        name: initialMenuItem.name,
        price: initialMenuItem.price,
        is_available: true
      });
    }
  }

  for (const category of categoryTemplates[input.businessType]) {
    const categoryId = categoryByName.get(category.name);
    if (!categoryId) continue;

    for (const item of category.items) {
      appendMenuItem({
        restaurant_id: restaurant.id,
        category_id: categoryId,
        name: item.name,
        price: item.price,
        is_available: true
      });
    }
  }

  if (menuItems.length > 0) {
    const { error: menuItemError } = await supabase.from("menu_items").insert(menuItems);
    if (menuItemError) {
      await supabase.from("restaurants").delete().eq("id", restaurant.id);
      throw new AppError(menuItemError.message, 400);
    }
  }

  try {
    await createInitialRestaurantSubscription({
      restaurantId: restaurant.id,
      ownerUserId: input.userId,
      ownerEmail: input.email,
      planCode: input.planCode
    });
  } catch (error) {
    console.error("Failed to create initial restaurant subscription", error);
  }

  return onboardedRestaurant;
}

export async function updateRestaurantPaymentSettings(
  restaurantId: string,
  input: {
    bankCode: string;
    bankAccount: string;
    bankAccountName: string;
  }
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .update({
      bank_code: input.bankCode,
      bank_account: input.bankAccount,
      bank_account_name: input.bankAccountName
    })
    .eq("id", restaurantId)
    .select()
    .single();

  throwIfSupabaseError(error);
  return data;
}

export async function updateRestaurantSettings(
  restaurantId: string,
  input: {
    name: string;
    businessType?: BusinessType | "";
    contactEmail?: string;
    hotline?: string;
    address?: string;
    description?: string;
    openingTime?: string;
    closingTime?: string;
    brandPrimary?: string;
    brandAccent?: string;
    allowLegacyQr?: boolean;
    notifyNewOrder?: boolean;
    notifyPaymentWaiting?: boolean;
    showPromotionsOnMenu?: boolean;
    receiptFooter?: string;
    receiptShowQr?: boolean;
  }
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .update({
      name: input.name,
      business_type: input.businessType || null,
      contact_email: input.contactEmail || null,
      hotline: input.hotline || null,
      address: input.address || null,
      description: input.description || null,
      opening_time: input.openingTime || null,
      closing_time: input.closingTime || null,
      brand_primary: input.brandPrimary || null,
      brand_accent: input.brandAccent || null,
      allow_legacy_qr: input.allowLegacyQr ?? true,
      notify_new_order: input.notifyNewOrder ?? true,
      notify_payment_waiting: input.notifyPaymentWaiting ?? true,
      show_promotions_on_menu: input.showPromotionsOnMenu ?? true,
      receipt_footer: input.receiptFooter || null,
      receipt_show_qr: input.receiptShowQr ?? true
    })
    .eq("id", restaurantId)
    .select()
    .single();

  throwIfSupabaseError(error);
  return data;
}

export async function applyRestaurantAiBranding(input: {
  restaurantId: string;
  brandSlogan?: string;
  brandDescription?: string;
  logoUrl?: string;
}) {
  const updates: Database["public"]["Tables"]["restaurants"]["Update"] = {};
  const brandDescription = input.brandDescription?.trim();
  const brandSlogan = input.brandSlogan?.trim();

  if (brandDescription) updates.description = brandDescription;
  if (brandSlogan) updates.receipt_footer = brandSlogan;

  if (input.logoUrl) {
    const persistedLogoUrl = await uploadRemoteMenuImageUrl({
      restaurantId: input.restaurantId,
      imageUrl: input.logoUrl
    });
    if (persistedLogoUrl) updates.logo_url = persistedLogoUrl;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError("Chưa có nội dung AI nào để áp dụng vào hồ sơ quán.", 400);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("restaurants")
    .update(updates)
    .eq("id", input.restaurantId)
    .select()
    .single();

  throwIfSupabaseError(error);
  return data;
}
