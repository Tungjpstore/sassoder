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

function nullIfBlank(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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

function profileNameFromEmail(email: string) {
  return email
    .split("@")[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function upsertStaffOperationsProfile(
  supabase: any,
  input: {
    restaurantId: string;
    userId: string;
    email: string;
    roleCode: string;
    roleConfig?: StaffOperationsRoleConfig;
    fullName?: string | null;
    phone?: string | null;
    username?: string | null;
    pin?: string | null;
    dateOfBirth?: string | null;
    hometown?: string | null;
    mustChangeAppPassword?: boolean;
    employmentStatus?: "active" | "suspended" | "resigned";
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    notes?: string | null;
  }
) {
  const role = input.roleConfig ?? await resolveStaffOperationsRole(supabase, input.restaurantId, input.roleCode);
  const pinPayload = input.pin
    ? (() => {
        const { pinHash, normalizedPin } = hashStaffPin(input.pin);
        return {
          pin_hash: pinHash,
          pin_lookup_hash: staffPinLookupHash(input.restaurantId, normalizedPin),
          pin_attempts: 0,
          pin_locked_until: null,
          pin_updated_at: new Date().toISOString()
        };
      })()
    : {};
  const passwordStatePayload = typeof input.mustChangeAppPassword === "boolean"
    ? { must_change_app_password: input.mustChangeAppPassword }
    : {};

  const profileResult = await supabase.from("staff_members").upsert(
    {
      restaurant_id: input.restaurantId,
      user_id: input.userId,
      role_id: role.id,
      role_code: role.code,
      full_name: nullIfBlank(input.fullName) ?? profileNameFromEmail(input.email),
      phone: nullIfBlank(input.phone),
      username: nullIfBlank(input.username),
      date_of_birth: nullIfBlank(input.dateOfBirth),
      hometown: nullIfBlank(input.hometown),
      employment_status: input.employmentStatus ?? "active",
      emergency_contact_name: nullIfBlank(input.emergencyContactName),
      emergency_contact_phone: nullIfBlank(input.emergencyContactPhone),
      notes: nullIfBlank(input.notes),
      archived_at: input.employmentStatus === "resigned" ? new Date().toISOString() : null,
      ...passwordStatePayload,
      ...pinPayload
    },
    { onConflict: "user_id" }
  ).select("id,employee_code,employee_number,date_of_birth,hometown,must_change_app_password").single();

  if (profileResult.error && !isMissingStaffOperationsTable(profileResult.error)) {
    if (profileResult.error.code === "23505" && /pin/i.test(profileResult.error.message ?? "")) {
      throw new AppError("PIN này đã được dùng bởi nhân sự khác trong quán.", 409);
    }
    throw new AppError(profileResult.error.message, 400);
  }

  return {
    role,
    profile: profileResult.data as {
      id: string;
      employee_code: string | null;
      employee_number: number | null;
      date_of_birth: string | null;
      hometown: string | null;
      must_change_app_password: boolean | null;
    } | null
  };
}

async function syncStaffPrimaryBranch(
  supabase: any,
  input: {
    restaurantId: string;
    userId: string;
    branchId?: string | null;
  }
) {
  const branchId = input.branchId ?? (await ensureDefaultStoreBranch(input.restaurantId))?.id ?? null;
  if (!branchId) return;

  const memberResult = await supabase
    .from("staff_members")
    .select("id")
    .eq("restaurant_id", input.restaurantId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (memberResult.error) {
    if (isMissingStaffOperationsTable(memberResult.error)) return;
    throw new AppError(memberResult.error.message, 400);
  }

  const memberId = memberResult.data?.id;
  if (!memberId) return;

  const pauseExistingResult = await supabase
    .from("staff_branch_assignments")
    .update({
      is_primary: false,
      assignment_status: "paused",
      ended_at: new Date().toISOString()
    })
    .eq("restaurant_id", input.restaurantId)
    .eq("staff_member_id", memberId)
    .eq("is_primary", true)
    .neq("branch_id", branchId)
    .is("ended_at", null);

  if (pauseExistingResult.error && !isMissingStaffOperationsTable(pauseExistingResult.error)) {
    throw new AppError(pauseExistingResult.error.message, 400);
  }

  const existingAssignment = await supabase
    .from("staff_branch_assignments")
    .select("id")
    .eq("restaurant_id", input.restaurantId)
    .eq("staff_member_id", memberId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (existingAssignment.error) {
    if (isMissingStaffOperationsTable(existingAssignment.error)) return;
    throw new AppError(existingAssignment.error.message, 400);
  }

  if (existingAssignment.data?.id) {
    const activateResult = await supabase
      .from("staff_branch_assignments")
      .update({
        is_primary: true,
        assignment_status: "active",
        ended_at: null,
        starts_at: new Date().toISOString()
      })
      .eq("id", existingAssignment.data.id);

    if (activateResult.error && !isMissingStaffOperationsTable(activateResult.error)) {
      throw new AppError(activateResult.error.message, 400);
    }

    return;
  }

  const insertResult = await supabase.from("staff_branch_assignments").insert({
    restaurant_id: input.restaurantId,
    staff_member_id: memberId,
    branch_id: branchId,
    is_primary: true,
    assignment_status: "active"
  });

  if (insertResult.error && !isMissingStaffOperationsTable(insertResult.error)) {
    throw new AppError(insertResult.error.message, 400);
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
  const supabase = createAdminSupabaseClient() as any;
  const normalizedEmail = input.email.toLowerCase();
  const roleConfig = await resolveStaffOperationsRole(supabase, input.restaurantId, input.roleCode);

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
      role: roleConfig.scope,
      staff_title: roleConfig.title,
      permission_profile: roleConfig.profile,
      permissions: roleConfig.permissions
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
      role: roleConfig.scope,
      restaurant_id: input.restaurantId,
      staff_title: roleConfig.title,
      permission_profile: roleConfig.profile,
      permissions: roleConfig.permissions
    })
    .select()
    .single();

  if (isMissingStaffProfileColumn(error)) {
    const fallback = await supabase
      .from("users")
      .insert({
        id: authUser.user.id,
        email: normalizedEmail,
        role: roleConfig.scope,
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

  const staffProfile = await upsertStaffOperationsProfile(supabase, {
    restaurantId: input.restaurantId,
    userId: authUser.user.id,
    email: normalizedEmail,
    roleCode: roleConfig.code,
    roleConfig,
    fullName: input.fullName,
    pin: input.pin ?? null,
    phone: input.phone ?? null,
    dateOfBirth: input.dateOfBirth ?? null,
    hometown: input.hometown ?? null,
    mustChangeAppPassword: input.mustChangeAppPassword ?? true,
    notes: input.notes ?? null
  });

  await syncStaffPrimaryBranch(supabase, {
    restaurantId: input.restaurantId,
    userId: authUser.user.id,
    branchId: input.branchId ?? null
  });

  return {
    ...data,
    employeeCode: staffProfile.profile?.employee_code ?? null,
    staffMemberId: staffProfile.profile?.id ?? null,
    mustChangeAppPassword: staffProfile.profile?.must_change_app_password ?? true
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
  const supabase = createAdminSupabaseClient() as any;
  const roleConfig = await resolveStaffOperationsRole(supabase, input.restaurantId, input.roleCode);

  if (input.userId === input.actorUserId && roleConfig.scope !== "ADMIN") {
    throw new AppError("Bạn không thể tự hạ quyền quản trị của tài khoản đang đăng nhập.", 400);
  }

  const currentMemberResult = await supabase
    .from("staff_members")
    .select("full_name,phone,username,date_of_birth,hometown,notes,employment_status,emergency_contact_name,emergency_contact_phone")
    .eq("restaurant_id", input.restaurantId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (currentMemberResult.error && !isMissingStaffOperationsTable(currentMemberResult.error)) {
    throw new AppError(currentMemberResult.error.message, 400);
  }

  const userResult = await supabase
    .from("users")
    .select("id,email,role,restaurant_id")
    .eq("id", input.userId)
    .eq("restaurant_id", input.restaurantId)
    .single();

  throwIfSupabaseError(userResult.error);
  const user = userResult.data as StaffProfileRow | null;
  if (!user) throw new AppError("Không tìm thấy nhân viên", 404);
  const currentMember = currentMemberResult.data as
    | {
        full_name: string;
        phone: string | null;
        username: string | null;
        date_of_birth: string | null;
        hometown: string | null;
        notes: string | null;
        employment_status: "active" | "suspended" | "resigned";
        emergency_contact_name: string | null;
        emergency_contact_phone: string | null;
      }
    | null;

  if (user.role === "ADMIN" && roleConfig.scope === "STAFF") {
    const { count, error } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", input.restaurantId)
      .eq("role", "ADMIN")
      .eq("account_status", "active");
    throwIfSupabaseError(error);
    if ((count ?? 0) <= 1) {
      throw new AppError("Cần giữ lại ít nhất một tài khoản quản trị đang hoạt động cho quán.", 400);
    }
  }

  let updateResult = await supabase
    .from("users")
    .update({
      role: roleConfig.scope,
      staff_title: roleConfig.title,
      permission_profile: roleConfig.profile,
      permissions: roleConfig.permissions,
      account_status: input.employmentStatus === "suspended" ? "blocked" : "active",
      blocked_at: input.employmentStatus === "suspended" ? new Date().toISOString() : null,
      blocked_reason: input.employmentStatus === "suspended" ? "Suspended from staff operations console" : null
    })
    .eq("id", input.userId)
    .eq("restaurant_id", input.restaurantId)
    .select()
    .single();

  if (isMissingStaffProfileColumn(updateResult.error)) {
    updateResult = await supabase
      .from("users")
      .update({ role: roleConfig.scope })
      .eq("id", input.userId)
      .eq("restaurant_id", input.restaurantId)
      .select()
      .single();
  }

  throwIfSupabaseError(updateResult.error);

  const { error: metadataError } = await supabase.auth.admin.updateUserById(input.userId, {
    user_metadata: {
      restaurant_id: input.restaurantId,
      role: roleConfig.scope,
      staff_title: roleConfig.title,
      permission_profile: roleConfig.profile,
      permissions: normalizeStaffPermissions(roleConfig.permissions, roleConfig.profile)
    }
  });
  if (metadataError) throw new AppError(metadataError.message, 400);

  await upsertStaffOperationsProfile(supabase, {
    restaurantId: input.restaurantId,
    userId: input.userId,
    email: user.email,
    roleCode: roleConfig.code,
    roleConfig,
    fullName: input.fullName,
    pin: input.pin ?? null,
    phone: input.phone ?? currentMember?.phone ?? null,
    dateOfBirth: input.dateOfBirth ?? currentMember?.date_of_birth ?? null,
    hometown: input.hometown ?? currentMember?.hometown ?? null,
    username: input.username ?? currentMember?.username ?? null,
    employmentStatus: input.employmentStatus,
    emergencyContactName: input.emergencyContactName ?? currentMember?.emergency_contact_name ?? null,
    emergencyContactPhone: input.emergencyContactPhone ?? currentMember?.emergency_contact_phone ?? null,
    notes: input.notes ?? currentMember?.notes ?? null
  });

  await syncStaffPrimaryBranch(supabase, {
    restaurantId: input.restaurantId,
    userId: input.userId,
    branchId: input.branchId ?? null
  });

  return updateResult.data;
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

  const supabase = createAdminSupabaseClient() as any;
  const currentMemberResult = await supabase
    .from("staff_members")
    .select("full_name")
    .eq("restaurant_id", input.restaurantId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (currentMemberResult.error && !isMissingStaffOperationsTable(currentMemberResult.error)) {
    throw new AppError(currentMemberResult.error.message, 400);
  }

  const userResult = await supabase
    .from("users")
    .select("id,email,role,restaurant_id,permission_profile")
    .eq("id", input.userId)
    .eq("restaurant_id", input.restaurantId)
    .single();

  throwIfSupabaseError(userResult.error);
  const user = userResult.data as StaffProfileRow | null;
  if (!user) throw new AppError("Không tìm thấy nhân viên", 404);
  const currentMember = currentMemberResult.data as { full_name: string } | null;

  if (user.role === "ADMIN" && input.nextState !== "active") {
    const { count, error } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", input.restaurantId)
      .eq("role", "ADMIN")
      .eq("account_status", "active");
    throwIfSupabaseError(error);
    if ((count ?? 0) <= 1) {
      throw new AppError("Cần giữ lại ít nhất một tài khoản quản trị đang hoạt động cho quán.", 400);
    }
  }

  const updates =
    input.nextState === "active"
      ? {
          account_status: "active",
          blocked_at: null,
          blocked_reason: null
        }
      : {
          account_status: "blocked",
          blocked_at: new Date().toISOString(),
          blocked_reason: nullIfBlank(input.reason) ?? (input.nextState === "archived" ? "Archived from staff operations console" : "Suspended from staff operations console")
        };

  const updateResult = await supabase
    .from("users")
    .update(updates)
    .eq("id", input.userId)
    .eq("restaurant_id", input.restaurantId)
    .select()
    .single();

  throwIfSupabaseError(updateResult.error);

  const employmentStatus = input.nextState === "archived" ? "resigned" : input.nextState === "suspended" ? "suspended" : "active";
  await upsertStaffOperationsProfile(supabase, {
    restaurantId: input.restaurantId,
    userId: input.userId,
    email: user.email,
    roleCode: user.role === "ADMIN" ? "owner" : mapPermissionProfileToRoleTemplateCode(user.permission_profile ?? "service"),
    fullName: currentMember?.full_name ?? profileNameFromEmail(user.email),
    employmentStatus,
    notes: nullIfBlank(input.reason)
  });

  const profileUpdate = await supabase
    .from("staff_members")
    .update({
      suspended_at: input.nextState === "suspended" ? new Date().toISOString() : null,
      archived_at: input.nextState === "archived" ? new Date().toISOString() : null
    })
    .eq("restaurant_id", input.restaurantId)
    .eq("user_id", input.userId);

  if (profileUpdate.error && !isMissingStaffOperationsTable(profileUpdate.error)) {
    throw new AppError(profileUpdate.error.message, 400);
  }

  const sessionUpdate = await supabase
    .from("staff_sessions")
    .update({
      forced_logout_at: input.nextState === "active" ? null : new Date().toISOString()
    })
    .eq("restaurant_id", input.restaurantId)
    .eq("staff_user_id", input.userId);

  if (sessionUpdate.error && !isMissingStaffOperationsTable(sessionUpdate.error)) {
    throw new AppError(sessionUpdate.error.message, 400);
  }

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
