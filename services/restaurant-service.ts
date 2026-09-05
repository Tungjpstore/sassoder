import { AppError } from "@/lib/response";
import { validateOnboardingTableCount } from "@/lib/billing/plan-limits";
import { createSlug } from "@/lib/slug";
import {
  STAFF_ROLE_TEMPLATES,
  getStaffPermissionPreset,
  getStaffRoleTemplate,
  mapPermissionProfileToRoleTemplateCode,
  normalizeStaffPermissions,
  type StaffPermissionKey,
  type StaffPermissionProfile,
  type StaffRoleTemplateCode
} from "@/lib/staff-permissions";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hashStaffPin, staffPinLookupHash } from "@/features/staff/services/staff-pin-service";
import { ensureDefaultStoreBranch } from "@/services/branch-service";
import { searchAddress } from "@/services/maps/geocoding/geocoder-service";
import { uploadMenuImageFile, uploadRemoteMenuImageUrl } from "@/services/menu-image-service";
import { notifyPlatformTenantCreated } from "@/services/platform-telegram-events";
import { writeOperationalEvent } from "@/services/operational-observability-service";
import { writeStaffActivityLog } from "@/services/staff-activity-log-service";
import { assertStaffOwnerMutationAllowed } from "@/services/staff-owner-boundary-service";
import { isPublicTenantActive } from "@/services/tenant-status-guard";
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
const dashboardBundleTtlMs = 8_000;

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

function isMissingStaffOperationsTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42P01" || /staff_members|staff_branch_assignments|staff_roles/i.test(error.message ?? "");
}

function compactRecord<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item !== "undefined")) as Partial<T>;
}

type StaffOperationsRoleConfig = {
  id: string | null;
  code: string;
  title: string;
  scope: "ADMIN" | "STAFF";
  profile: StaffPermissionProfile;
  permissions: StaffPermissionKey[];
};

type StaffRoleConfigRow = {
  id: string;
  code: string;
  name: string;
  legacy_permission_profile: StaffPermissionProfile;
  role_scope: "ADMIN" | "STAFF";
};

type StaffRolePermissionConfigRow = {
  permission_key: StaffPermissionKey;
};

type StaffCreateProfileRpcRow = {
  user_id: string;
  staff_member_id: string;
  employee_code: string | null;
  employee_number: number | null;
  must_change_app_password: boolean | null;
  branch_id: string | null;
};

type StaffMutationRpcRow = {
  user_id: string;
  staff_member_id: string;
  branch_id?: string | null;
  next_state?: string | null;
};

function isTemplateRoleCode(roleCode: string): roleCode is StaffRoleTemplateCode {
  return STAFF_ROLE_TEMPLATES.some((role) => role.code === roleCode);
}

async function resolveStaffOperationsRole(supabase: any, restaurantId: string, roleCode: string): Promise<StaffOperationsRoleConfig> {
  const roleResult = await supabase
    .from("staff_roles")
    .select("id,code,name,legacy_permission_profile,role_scope")
    .eq("restaurant_id", restaurantId)
    .eq("code", roleCode)
    .eq("is_active", true)
    .maybeSingle();

  if (roleResult.error && !isMissingStaffOperationsTable(roleResult.error)) {
    throw new AppError(roleResult.error.message, 400);
  }

  const role = roleResult.data as StaffRoleConfigRow | null;
  if (role) {
    const permissionResult = await supabase
      .from("staff_role_permissions")
      .select("permission_key")
      .eq("restaurant_id", restaurantId)
      .eq("role_id", role.id);

    if (permissionResult.error && !isMissingStaffOperationsTable(permissionResult.error)) {
      throw new AppError(permissionResult.error.message, 400);
    }

    const template = STAFF_ROLE_TEMPLATES.find((item) => item.code === role.code);
    const fallback = template?.permissions ?? getStaffPermissionPreset(role.legacy_permission_profile).permissions;
    const permissionRows = (permissionResult.data ?? []) as StaffRolePermissionConfigRow[];
    const permissions = permissionRows.length > 0 ? permissionRows.map((item) => item.permission_key) : fallback;

    return {
      id: role.id,
      code: role.code,
      title: role.name,
      scope: role.role_scope,
      profile: role.legacy_permission_profile,
      permissions: normalizeStaffPermissions(permissions, role.legacy_permission_profile)
    };
  }

  if (!isTemplateRoleCode(roleCode)) {
    throw new AppError("Vai trò nhân sự không tồn tại hoặc đã bị tắt.", 404);
  }

  const template = getStaffRoleTemplate(roleCode);
  return {
    id: null,
    code: template.code,
    title: template.title,
    scope: template.role,
    profile: template.profile,
    permissions: template.permissions
  };
}

function buildStaffPinPayload(restaurantId: string, pin?: string | null) {
  if (!pin) return {};
  const { pinHash, normalizedPin } = hashStaffPin(pin);
  return {
    pin_hash: pinHash,
    pin_lookup_hash: staffPinLookupHash(restaurantId, normalizedPin),
    pin_attempts: 0,
    pin_locked_until: null,
    pin_updated_at: new Date().toISOString()
  };
}

async function rollbackCreatedAuthUser(supabase: any, userId: string) {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[staff-create] failed to rollback auth user", { userId, error: error.message });
  }
}

function staffCreateProfileRpcError(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "Không tạo được hồ sơ nhân viên.";
  if (error?.code === "23505" && /pin/i.test(message)) {
    return new AppError("PIN này đã được dùng bởi nhân sự khác trong quán.", 409);
  }
  if (error?.code === "23505" && /users.*email|email/i.test(message)) {
    return new AppError("Email này đã có tài khoản trong hệ thống.", 409);
  }
  if (/Invalid staff branch assignment/i.test(message)) {
    return new AppError("Chi nhánh gán cho nhân viên không hợp lệ hoặc đã tắt.", 400);
  }
  if (/Invalid staff role assignment/i.test(message)) {
    return new AppError("Vai trò gán cho nhân viên không hợp lệ hoặc không thuộc quán này.", 400);
  }
  return new AppError(message, 400);
}

function staffMutationRpcError(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "Không cập nhật được nhân sự.";
  if (error?.code === "23505" && /pin/i.test(message)) {
    return new AppError("PIN này đã được dùng bởi nhân sự khác trong quán.", 409);
  }
  if (/Last active admin cannot be changed/i.test(message)) {
    return new AppError("Cần giữ lại ít nhất một tài khoản quản trị đang hoạt động cho quán.", 400);
  }
  if (/Actor cannot demote own admin account/i.test(message)) {
    return new AppError("Bạn không thể tự hạ quyền quản trị của tài khoản đang đăng nhập.", 400);
  }
  if (/Actor cannot lock own account/i.test(message)) {
    return new AppError("Bạn không thể tự khoá hoặc lưu trữ chính tài khoản đang đăng nhập.", 400);
  }
  if (/Invalid staff branch assignment/i.test(message)) {
    return new AppError("Chi nhánh gán cho nhân viên không hợp lệ hoặc đã tắt.", 400);
  }
  if (/Invalid staff role assignment|Invalid staff role code/i.test(message)) {
    return new AppError("Vai trò gán cho nhân viên không hợp lệ hoặc không thuộc quán này.", 400);
  }
  if (/Staff user not found|Staff member profile not found/i.test(message)) {
    return new AppError("Không tìm thấy nhân viên", 404);
  }
  return new AppError(message, 400);
}

async function syncStaffAuthAppMetadata(
  supabase: any,
  input: {
    restaurantId: string;
    userId: string;
    role: "ADMIN" | "STAFF";
    staffTitle: string;
    permissionProfile: StaffPermissionProfile;
    permissions: StaffPermissionKey[];
  }
) {
  const { error } = await supabase.auth.admin.updateUserById(input.userId, {
    app_metadata: {
      restaurant_id: input.restaurantId,
      role: input.role,
      staff_title: input.staffTitle,
      permission_profile: input.permissionProfile,
      permissions: normalizeStaffPermissions(input.permissions, input.permissionProfile)
    }
  });

  if (error) {
    writeOperationalEvent({
      area: "audit",
      event: "staff_auth_app_metadata_sync_failed",
      restaurantId: input.restaurantId,
      status: "warn",
      metadata: {
        userId: input.userId,
        error: error.message
      }
    });
  }
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
  return isPublicTenantActive(data) ? data : null;
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
  actorUserId?: string | null;
  email: string;
  password: string;
  roleCode: string;
  fullName: string;
  pin?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  hometown?: string | null;
  mustChangeAppPassword?: boolean;
  branchId?: string | null;
  notes?: string | null;
}) {
  const supabase = (await createServerSupabaseClient()) as any;
  const adminSupabase = createAdminSupabaseClient() as any;
  const normalizedEmail = input.email.toLowerCase();
  const roleConfig = await resolveStaffOperationsRole(adminSupabase, input.restaurantId, input.roleCode);
  await assertStaffOwnerMutationAllowed({
    supabase: adminSupabase,
    restaurantId: input.restaurantId,
    actorUserId: input.actorUserId,
    requestedRoleCode: roleConfig.code,
    action: "tạo tài khoản"
  });
  const branchId = input.branchId ?? (await ensureDefaultStoreBranch(input.restaurantId))?.id ?? null;
  const pinPayload = buildStaffPinPayload(input.restaurantId, input.pin);

  const { data: existingUser, error: existingUserError } = await adminSupabase
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();
  throwIfSupabaseError(existingUserError);
  if (existingUser) {
    throw new AppError("Email này đã có tài khoản trong hệ thống.", 409);
  }

  const { data: authUser, error: authError } = await adminSupabase.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: true,
    app_metadata: {
      restaurant_id: input.restaurantId,
      role: roleConfig.scope,
      staff_title: roleConfig.title,
      permission_profile: roleConfig.profile,
      permissions: roleConfig.permissions
    }
  });

  if (authError || !authUser.user) {
    throw new AppError(authError?.message ?? "Không tạo được tài khoản nhân viên", 400);
  }

  const { data, error } = await supabase.rpc("create_staff_user_profile", {
    p_user_id: authUser.user.id,
    p_restaurant_id: input.restaurantId,
    p_actor_user_id: input.actorUserId ?? null,
    p_email: normalizedEmail,
    p_role_scope: roleConfig.scope,
    p_staff_title: roleConfig.title,
    p_permission_profile: roleConfig.profile,
    p_permissions: roleConfig.permissions,
    p_role_id: roleConfig.id,
    p_role_code: roleConfig.code,
    p_full_name: input.fullName,
    p_phone: input.phone ?? null,
    p_username: null,
    p_pin_hash: "pin_hash" in pinPayload ? pinPayload.pin_hash : null,
    p_pin_lookup_hash: "pin_lookup_hash" in pinPayload ? pinPayload.pin_lookup_hash : null,
    p_date_of_birth: input.dateOfBirth ?? null,
    p_hometown: input.hometown ?? null,
    p_must_change_app_password: input.mustChangeAppPassword ?? true,
    p_branch_id: branchId,
    p_notes: input.notes ?? null
  });

  if (error) {
    // The authenticated RPC is called through supabase.rpc; Auth rollback
    // intentionally uses the separate service-role client below.
    // await rollbackCreatedAuthUser(supabase, authUser.user.id)
    await rollbackCreatedAuthUser(adminSupabase, authUser.user.id);
    throw staffCreateProfileRpcError(error);
  }

  const staffProfile = (Array.isArray(data) ? data[0] : data) as StaffCreateProfileRpcRow | null;
  if (!staffProfile) {
    await rollbackCreatedAuthUser(adminSupabase, authUser.user.id);
    throw new AppError("Không tạo được hồ sơ nhân viên sau khi tạo tài khoản Auth.", 400);
  }

  return {
    id: authUser.user.id,
    email: normalizedEmail,
    role: roleConfig.scope,
    restaurant_id: input.restaurantId,
    staff_title: roleConfig.title,
    permission_profile: roleConfig.profile,
    permissions: roleConfig.permissions,
    employeeCode: staffProfile.employee_code ?? null,
    staffMemberId: staffProfile.staff_member_id ?? null,
    mustChangeAppPassword: staffProfile.must_change_app_password ?? true
  };
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

  const supabase = (await createServerSupabaseClient()) as any;
  const adminSupabase = createAdminSupabaseClient() as any;
  const roleCode = mapPermissionProfileToRoleTemplateCode(input.permissionProfile);
  const roleConfig = await resolveStaffOperationsRole(adminSupabase, input.restaurantId, roleCode);
  await assertStaffOwnerMutationAllowed({
    supabase: adminSupabase,
    restaurantId: input.restaurantId,
    actorUserId: input.actorUserId,
    targetUserId: input.userId,
    requestedRoleCode: roleConfig.code,
    action: "đổi vai trò"
  });
  const { data, error } = await supabase.rpc("update_staff_user_profile", {
    p_restaurant_id: input.restaurantId,
    p_user_id: input.userId,
    p_actor_user_id: input.actorUserId,
    p_role_scope: roleConfig.scope,
    p_staff_title: roleConfig.title,
    p_permission_profile: roleConfig.profile,
    p_permissions: roleConfig.permissions,
    p_role_id: roleConfig.id,
    p_role_code: roleConfig.code,
    p_profile: {},
    p_branch_id: null
  });

  if (error) throw staffMutationRpcError(error);

  await syncStaffAuthAppMetadata(adminSupabase, {
    restaurantId: input.restaurantId,
    userId: input.userId,
    role: roleConfig.scope,
    staffTitle: roleConfig.title,
    permissionProfile: roleConfig.profile,
    permissions: roleConfig.permissions
  });

  return (Array.isArray(data) ? data[0] : data) as StaffMutationRpcRow | null;
}

export async function updateRestaurantUserOperationsProfile(input: {
  restaurantId: string;
  userId: string;
  actorUserId: string;
  fullName: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  hometown?: string | null;
  username?: string | null;
  pin?: string | null;
  roleCode: string;
  branchId?: string | null;
  employmentStatus: "active" | "suspended" | "resigned";
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  notes?: string | null;
}) {
  const supabase = (await createServerSupabaseClient()) as any;
  const adminSupabase = createAdminSupabaseClient() as any;
  const roleConfig = await resolveStaffOperationsRole(adminSupabase, input.restaurantId, input.roleCode);
  await assertStaffOwnerMutationAllowed({
    supabase: adminSupabase,
    restaurantId: input.restaurantId,
    actorUserId: input.actorUserId,
    targetUserId: input.userId,
    requestedRoleCode: roleConfig.code,
    action: "cập nhật hồ sơ"
  });
  const branchId = input.branchId ?? (await ensureDefaultStoreBranch(input.restaurantId))?.id ?? null;
  const pinPayload = buildStaffPinPayload(input.restaurantId, input.pin);
  const profilePayload = compactRecord({
    fullName: input.fullName,
    phone: input.phone,
    username: input.username,
    dateOfBirth: input.dateOfBirth,
    hometown: input.hometown,
    employmentStatus: input.employmentStatus,
    emergencyContactName: input.emergencyContactName,
    emergencyContactPhone: input.emergencyContactPhone,
    notes: input.notes,
    pinHash: "pin_hash" in pinPayload ? pinPayload.pin_hash : undefined,
    pinLookupHash: "pin_lookup_hash" in pinPayload ? pinPayload.pin_lookup_hash : undefined
  });

  const { data, error } = await supabase.rpc("update_staff_user_profile", {
    p_restaurant_id: input.restaurantId,
    p_user_id: input.userId,
    p_actor_user_id: input.actorUserId,
    p_role_scope: roleConfig.scope,
    p_staff_title: roleConfig.title,
    p_permission_profile: roleConfig.profile,
    p_permissions: roleConfig.permissions,
    p_role_id: roleConfig.id,
    p_role_code: roleConfig.code,
    p_profile: profilePayload,
    p_branch_id: branchId
  });

  if (error) throw staffMutationRpcError(error);

  await syncStaffAuthAppMetadata(adminSupabase, {
    restaurantId: input.restaurantId,
    userId: input.userId,
    role: roleConfig.scope,
    staffTitle: roleConfig.title,
    permissionProfile: roleConfig.profile,
    permissions: roleConfig.permissions
  });

  return (Array.isArray(data) ? data[0] : data) as StaffMutationRpcRow | null;
}

async function assertOwnerProfileMutationAllowed({
  supabase,
  restaurantId,
  userId,
  actorUserId
}: {
  supabase: any;
  restaurantId: string;
  userId: string;
  actorUserId: string;
}) {
  const [targetResult, targetMemberResult, restaurantResult] = await Promise.all([
    supabase
      .from("users")
      .select("id,email,role,full_name,phone,username,account_status")
      .eq("restaurant_id", restaurantId)
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("staff_members")
      .select("id,role_code,full_name,phone,username")
      .eq("restaurant_id", restaurantId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("restaurants")
      .select("owner_user_id")
      .eq("id", restaurantId)
      .maybeSingle()
  ]);

  throwIfSupabaseError(targetResult.error, "Không tải được hồ sơ chủ quán");
  throwIfSupabaseError(targetMemberResult.error, "Không tải được hồ sơ nhân sự chủ quán");
  throwIfSupabaseError(restaurantResult.error, "Không xác thực được quyền chủ quán");

  const target = targetResult.data as any | null;
  const targetMember = targetMemberResult.data as { id: string; role_code: string | null; full_name: string | null; phone: string | null; username: string | null } | null;
  const canonicalOwnerUserId = (restaurantResult.data as { owner_user_id: string | null } | null)?.owner_user_id ?? null;
  const isTargetOwner = target?.role === "ADMIN" && canonicalOwnerUserId === userId;
  const isActorOwner = canonicalOwnerUserId === actorUserId;

  if (!target || !isTargetOwner) throw new AppError("Hồ sơ này không phải tài khoản chủ quán.", 400);
  if (actorUserId !== userId && !isActorOwner) {
    throw new AppError("Chỉ chủ quán mới được cập nhật hồ sơ chủ quán.", 403);
  }

  return { target, targetMember };
}

export async function updateRestaurantOwnerDashboardProfile(input: {
  restaurantId: string;
  userId: string;
  actorUserId: string;
  fullName: string;
  phone?: string | null;
  username?: string | null;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { target, targetMember } = await assertOwnerProfileMutationAllowed({
    supabase,
    restaurantId: input.restaurantId,
    userId: input.userId,
    actorUserId: input.actorUserId
  });
  const beforeState = {
    user: {
      fullName: target.full_name ?? null,
      phone: target.phone ?? null,
      username: target.username ?? null
    },
    staffMember: {
      fullName: targetMember?.full_name ?? null,
      phone: targetMember?.phone ?? null,
      username: targetMember?.username ?? null
    }
  };
  const profile = {
    full_name: input.fullName.trim(),
    phone: input.phone?.trim() || null,
    username: input.username?.trim().toLowerCase() || null
  };

  const userResult = await supabase
    .from("users")
    .update(profile)
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.userId)
    .select("id,full_name,phone,username")
    .single();
  throwIfSupabaseError(userResult.error, "Không cập nhật được tài khoản chủ quán");

  let staffMember = targetMember;
  if (targetMember?.id) {
    const staffResult = await supabase
      .from("staff_members")
      .update(profile)
      .eq("restaurant_id", input.restaurantId)
      .eq("id", targetMember.id)
      .select("id,full_name,phone,username")
      .single();
    throwIfSupabaseError(staffResult.error, "Không đồng bộ được hồ sơ chủ quán");
    staffMember = staffResult.data;
  }

  await writeStaffActivityLog({
    restaurantId: input.restaurantId,
    actorUserId: input.actorUserId,
    entityType: "owner_dashboard_profile",
    entityId: input.userId,
    action: "owner.profile_updated",
    severity: "info",
    beforeState,
    afterState: {
      user: userResult.data,
      staffMember
    },
    metadata: { source: "staff_owner_profile_panel" }
  });
}

export async function setRestaurantUserAccountState(input: {
  restaurantId: string;
  userId: string;
  actorUserId: string;
  nextState: "active" | "suspended" | "archived";
  reason?: string | null;
}) {
  if (input.userId === input.actorUserId && input.nextState !== "active") {
    throw new AppError("Bạn không thể tự khoá hoặc lưu trữ chính tài khoản đang đăng nhập.", 400);
  }

  const supabase = (await createServerSupabaseClient()) as any;
  const adminSupabase = createAdminSupabaseClient() as any;
  await assertStaffOwnerMutationAllowed({
    supabase: adminSupabase,
    restaurantId: input.restaurantId,
    actorUserId: input.actorUserId,
    targetUserId: input.userId,
    rejectCanonicalOwnerTarget: input.nextState !== "active",
    action: "thay đổi trạng thái"
  });
  const { data, error } = await supabase.rpc("set_staff_account_state", {
    p_restaurant_id: input.restaurantId,
    p_user_id: input.userId,
    p_actor_user_id: input.actorUserId,
    p_next_state: input.nextState,
    p_reason: input.reason ?? null
  });

  if (error) throw staffMutationRpcError(error);

  return (Array.isArray(data) ? data[0] : data) as StaffMutationRpcRow | null;
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
  await assertStaffOwnerMutationAllowed({
    supabase,
    restaurantId: input.restaurantId,
    actorUserId: input.actorUserId,
    targetUserId: input.userId,
    rejectCanonicalOwnerTarget: true,
    action: "xóa tài khoản"
  });
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

  const tableLimit = validateOnboardingTableCount({ planCode, tableCount });
  if (!tableLimit.ok) throw new AppError(tableLimit.message, 402);

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
    planCode: tableLimit.planCode
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

function menuItemSeedKey(name: string) {
  return name.trim().normalize("NFC").toLowerCase();
}

type PrimaryBranchLocation = {
  address: string;
  latitude: number;
  longitude: number;
  source: "onboarding_pin" | "geocoded_address";
};

async function resolvePrimaryBranchLocation(input: {
  address?: string;
  storeLat?: number;
  storeLng?: number;
}): Promise<PrimaryBranchLocation | null> {
  const address = input.address?.trim();

  if (address && Number.isFinite(input.storeLat) && Number.isFinite(input.storeLng)) {
    return {
      address,
      latitude: input.storeLat!,
      longitude: input.storeLng!,
      source: "onboarding_pin"
    };
  }

  if (!address || address.length < 6) return null;

  try {
    const [result] = await searchAddress(address, {
      limit: 1,
      context: {
        source: "background"
      }
    });

    if (!result) return null;
    return {
      address: result.address || address,
      latitude: result.lat,
      longitude: result.lng,
      source: "geocoded_address"
    };
  } catch (error) {
    console.error("[restaurant/onboarding] Primary branch geocode failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
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

  const tableLimit = validateOnboardingTableCount({
    planCode: input.planCode,
    tableCount: input.tableCount
  });
  if (!tableLimit.ok) throw new AppError(tableLimit.message, 402);

  const supabase = createAdminSupabaseClient();
  const slug = await createUniqueRestaurantSlug(input.name, input.slug);
  const customBusinessType = input.customBusinessType?.trim();
  const brandDescription = input.brandDescription?.trim();
  const brandSlogan = input.brandSlogan?.trim();
  const primaryBranchLocation = await resolvePrimaryBranchLocation(input);
  const requestedInitialMenuItems = [
    ...(input.initialMenuItems ?? []),
    ...(input.initialMenuItem ? [input.initialMenuItem] : [])
  ];
  const categorySeedNames = new Set<string>();
  const categories = categoryTemplates[input.businessType].map((category) => {
    categorySeedNames.add(menuItemSeedKey(category.name));
    return { name: category.name };
  });

  for (const initialMenuItem of requestedInitialMenuItems) {
    const categoryName = initialMenuItem.categoryName?.trim();
    if (!categoryName) continue;
    const key = menuItemSeedKey(categoryName);
    if (!key || categorySeedNames.has(key)) continue;
    categorySeedNames.add(key);
    categories.push({ name: categoryName });
  }

  const menuItems: Array<{ name: string; price: number; categoryName?: string }> = [];
  const seenMenuItemNames = new Set<string>();

  function appendMenuItem(item: { name: string; price: number; categoryName?: string }) {
    const key = menuItemSeedKey(item.name);
    if (!key || seenMenuItemNames.has(key)) return;
    seenMenuItemNames.add(key);
    menuItems.push({
      name: item.name.trim(),
      price: item.price,
      categoryName: item.categoryName?.trim() || undefined
    });
  }

  for (const initialMenuItem of requestedInitialMenuItems) {
    if (!initialMenuItem.name || !Number.isFinite(initialMenuItem.price) || initialMenuItem.price <= 0) continue;
    appendMenuItem({
      name: initialMenuItem.name,
      price: initialMenuItem.price,
      categoryName: initialMenuItem.categoryName
    });
  }

  for (const category of categoryTemplates[input.businessType]) {
    for (const item of category.items) {
      appendMenuItem({
        name: item.name,
        price: item.price,
        categoryName: category.name
      });
    }
  }

  const { data: rpcRestaurant, error: onboardingError } = await (supabase as any).rpc("create_restaurant_onboarding_core", {
    p_user_id: input.userId,
    p_owner_email: input.email.toLowerCase(),
    p_name: input.name,
    p_slug: slug,
    p_business_type: input.businessType,
    p_table_count: input.tableCount,
    p_address: input.address || null,
    p_store_lat: input.storeLat ?? null,
    p_store_lng: input.storeLng ?? null,
    p_hotline: input.hotline || null,
    p_description: brandDescription || (customBusinessType ? `Loại hình: ${customBusinessType}` : null),
    p_logo_url: input.logoUrl || null,
    p_receipt_footer: brandSlogan || null,
    p_bank_code: input.bankCode || null,
    p_bank_account: input.bankAccount || null,
    p_bank_account_name: input.bankAccountName || null,
    p_primary_branch: primaryBranchLocation
      ? {
          name: "Chi nhánh chính",
          address: primaryBranchLocation.address,
          latitude: primaryBranchLocation.latitude,
          longitude: primaryBranchLocation.longitude,
          source: primaryBranchLocation.source
        }
      : null,
    p_categories: categories,
    p_menu_items: menuItems,
    p_plan_code: tableLimit.planCode
  });

  if (onboardingError || !rpcRestaurant) {
    const existingAfterConflict = await getRestaurantRowForUser(input.userId, input.email);
    if (existingAfterConflict) return existingAfterConflict;
    throw new AppError(onboardingError?.message ?? "Không tạo được dữ liệu khởi tạo quán", 400);
  }

  const restaurant = (Array.isArray(rpcRestaurant) ? rpcRestaurant[0] : rpcRestaurant) as RestaurantRow;
  let onboardedRestaurant = restaurant;

  if (input.logoFile) {
    try {
      const logoUrl = await uploadMenuImageFile({ restaurantId: restaurant.id, file: input.logoFile, label: "Logo quán" });
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

  await notifyPlatformTenantCreated({
    restaurant: onboardedRestaurant,
    requestedPlanCode: tableLimit.planCode,
    initialMenuItemCount: menuItems.length,
    source: "dashboard"
  });

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
    logoFile?: FormDataEntryValue | null;
    removeLogo?: boolean;
  }
) {
  const supabase = await createServerSupabaseClient();
  const logoUrl = input.removeLogo ? null : await uploadMenuImageFile({ restaurantId, file: input.logoFile ?? null, label: "Logo quán" });
  const logoUpdate = logoUrl !== undefined || input.removeLogo ? { logo_url: logoUrl } : {};
  // Never write a fallback for legacy QR: omitting it must preserve the tenant's
  // stored value, because defaulting to true would silently re-open unsigned
  // table QR links and defaulting to false would break already printed codes.
  const legacyQrUpdate = input.allowLegacyQr === undefined ? {} : { allow_legacy_qr: input.allowLegacyQr };
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
      notify_new_order: input.notifyNewOrder ?? true,
      notify_payment_waiting: input.notifyPaymentWaiting ?? true,
      show_promotions_on_menu: input.showPromotionsOnMenu ?? true,
      receipt_footer: input.receiptFooter || null,
      receipt_show_qr: input.receiptShowQr ?? true,
      ...legacyQrUpdate,
      ...logoUpdate
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
