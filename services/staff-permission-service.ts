import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  DEFAULT_ELIGIBLE_STAFF_PERMISSIONS,
  STAFF_ROLE_TEMPLATES,
  getStaffPermissionPreset,
  getStaffRoleTemplate,
  mapPermissionProfileToRoleTemplateCode,
  normalizeStaffPermissions,
  staffPermissionLabel,
  type StaffPermissionKey,
  type StaffPermissionProfile
} from "@/lib/staff-permissions";
import type { SessionProfile } from "@/types/domain";
import { assertCanonicalRestaurantOwner } from "@/services/staff-owner-boundary-service";

type PermissionMode = "all" | "any";

type StaffPermissionOptions = {
  mode?: PermissionMode;
};

type StaffUserPermissionRow = {
  id: string;
  role: "ADMIN" | "STAFF";
  permission_profile?: StaffPermissionProfile | null;
  permissions?: unknown;
  account_status?: "active" | "blocked";
};

type StaffMemberPermissionRow = {
  id: string;
  role_id: string | null;
  role_code: string;
  employment_status: "active" | "suspended" | "resigned";
  archived_at: string | null;
};

type StaffRolePermissionRow = {
  code: string;
  legacy_permission_profile: StaffPermissionProfile;
  role_scope: "ADMIN" | "STAFF";
  is_active: boolean;
};

type PermissionRow = {
  permission_key: StaffPermissionKey;
};

type RestaurantOwnerRow = {
  owner_user_id: string | null;
};

function isMissingPermissionSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST204" || error.code === "42P01" || /staff_members|staff_roles|staff_role_permissions|permission_key/i.test(message);
}

function normalizeRequiredPermissions(permission: StaffPermissionKey | StaffPermissionKey[]) {
  return Array.isArray(permission) ? permission : [permission];
}

function withDefaultEligibleStaffPermissions(permissions: StaffPermissionKey[]) {
  return Array.from(new Set([...permissions, ...DEFAULT_ELIGIBLE_STAFF_PERMISSIONS]));
}

function mergeEffectivePermissions(...permissionSets: StaffPermissionKey[][]) {
  return withDefaultEligibleStaffPermissions(Array.from(new Set(permissionSets.flat())));
}

/**
 * Sàn quyền cho tài khoản quản trị nhà hàng.
 *
 * Chủ quán (role_code = "owner") và mọi tài khoản users.role = "ADMIN" PHẢI luôn
 * giữ được quyền quản lý nhân sự, kể cả khi hồ sơ staff_members bị cấu hình sai
 * (role_code lệch, role_id null, staff_role_permissions bị xoá bớt, hoặc users.permissions rỗng).
 *
 * - roleCode = "owner"  -> sàn = template owner (toàn quyền, gồm cả gói dịch vụ).
 * - ADMIN khác          -> sàn = template manager (toàn quyền vận hành, không chạm gói dịch vụ).
 *
 * Đây là sàn cộng thêm (floor), không thay thế quyền đã có; quyền tuỳ biến vẫn được giữ.
 */
function applyAdministratorPermissionFloor(
  userRole: "ADMIN" | "STAFF",
  roleCode: string | null | undefined,
  permissions: StaffPermissionKey[]
) {
  if (userRole !== "ADMIN" && roleCode !== "owner") return permissions;
  const floorCode = roleCode === "owner" ? "owner" : "manager";
  const floorTemplate = STAFF_ROLE_TEMPLATES.find((role) => role.code === floorCode);
  if (!floorTemplate) return permissions;
  return mergeEffectivePermissions(permissions, floorTemplate.permissions);
}

async function readPermissionsForRole({
  supabase,
  restaurantId,
  roleId,
  roleCode,
  fallbackProfile
}: {
  supabase: any;
  restaurantId: string;
  roleId?: string | null;
  roleCode?: string | null;
  fallbackProfile: StaffPermissionProfile | string | null | undefined;
}) {
  if (roleId) {
    const [roleResult, permissionResult] = await Promise.all([
      supabase
        .from("staff_roles")
        .select("code,legacy_permission_profile,role_scope,is_active")
        .eq("restaurant_id", restaurantId)
        .eq("id", roleId)
        .maybeSingle(),
      supabase
        .from("staff_role_permissions")
        .select("permission_key")
        .eq("restaurant_id", restaurantId)
        .eq("role_id", roleId)
    ]);

    if (roleResult.error && !isMissingPermissionSchema(roleResult.error)) throw roleResult.error;
    if (permissionResult.error && !isMissingPermissionSchema(permissionResult.error)) throw permissionResult.error;

    const role = roleResult.data as StaffRolePermissionRow | null;
    const rows = (permissionResult.data ?? []) as PermissionRow[];
    if (role?.is_active && rows.length > 0) {
      return withDefaultEligibleStaffPermissions(normalizeStaffPermissions(rows.map((row) => row.permission_key), role.legacy_permission_profile));
    }
    if (role?.is_active) {
      const template = STAFF_ROLE_TEMPLATES.find((item) => item.code === role.code);
      return withDefaultEligibleStaffPermissions(template?.permissions ?? getStaffPermissionPreset(role.legacy_permission_profile).permissions);
    }
  }

  if (roleCode) {
    const template = STAFF_ROLE_TEMPLATES.find((role) => role.code === roleCode);
    if (template) return withDefaultEligibleStaffPermissions(template.permissions);
  }

  return withDefaultEligibleStaffPermissions(normalizeStaffPermissions(null, fallbackProfile));
}

export async function getStaffEffectivePermissions(session: SessionProfile) {
  const supabase = createAdminSupabaseClient() as any;
  const [userResult, memberResult, restaurantResult] = await Promise.all([
    supabase
      .from("users")
      .select("id,role,permission_profile,permissions,account_status")
      .eq("restaurant_id", session.restaurantId)
      .eq("id", session.userId)
      .maybeSingle(),
    supabase
      .from("staff_members")
      .select("id,role_id,role_code,employment_status,archived_at")
      .eq("restaurant_id", session.restaurantId)
      .eq("user_id", session.userId)
      .maybeSingle(),
    supabase
      .from("restaurants")
      .select("owner_user_id")
      .eq("id", session.restaurantId)
      .maybeSingle()
  ]);

  if (userResult.error) throw userResult.error;
  if (memberResult.error && !isMissingPermissionSchema(memberResult.error)) throw memberResult.error;
  if (restaurantResult.error) throw restaurantResult.error;

  const user = userResult.data as StaffUserPermissionRow | null;
  if (!user || user.account_status === "blocked") {
    throw new AppError("Tài khoản không còn khả dụng để thao tác vận hành.", 403);
  }

  const member = memberResult.data as StaffMemberPermissionRow | null;
  if (member?.archived_at || member?.employment_status === "resigned" || member?.employment_status === "suspended") {
    throw new AppError("Hồ sơ nhân sự đang bị khoá hoặc đã nghỉ.", 403);
  }

  const fallbackRoleCode = user.role === "ADMIN" ? mapPermissionProfileToRoleTemplateCode(user.permission_profile ?? "manager") : mapPermissionProfileToRoleTemplateCode(user.permission_profile ?? "service");
  const canonicalOwner = (restaurantResult.data as RestaurantOwnerRow | null)?.owner_user_id === session.userId;
  const storedRoleCode = member?.role_code ?? fallbackRoleCode;
  const roleCode = canonicalOwner ? "owner" : storedRoleCode === "owner" ? "manager" : storedRoleCode;
  const accountFallback = member ? null : fallbackRoleCode;
  const accountPermissions = mergeEffectivePermissions(normalizeStaffPermissions(user.permissions, accountFallback));
  const rolePermissions = member
    ? await readPermissionsForRole({
        supabase,
        restaurantId: session.restaurantId,
        roleId: member.role_id,
        roleCode,
        fallbackProfile: user.permission_profile ?? fallbackRoleCode
      })
    : accountPermissions;
  const permissions = mergeEffectivePermissions(rolePermissions, accountPermissions);
  const effectivePermissions = applyAdministratorPermissionFloor(user.role, roleCode, permissions);

  return {
    staffMemberId: member?.id ?? null,
    roleCode,
    permissions: effectivePermissions
  };
}

export async function assertStaffActionPermission(
  session: SessionProfile,
  requiredPermission: StaffPermissionKey | StaffPermissionKey[],
  options: StaffPermissionOptions = {}
) {
  const required = normalizeRequiredPermissions(requiredPermission);
  const mode = options.mode ?? "all";
  const context = await getStaffEffectivePermissions(session);
  const granted = new Set(context.permissions);
  const allowed = mode === "any" ? required.some((permission) => granted.has(permission)) : required.every((permission) => granted.has(permission));

  if (!allowed) {
    const label = required.map(staffPermissionLabel).join(mode === "any" ? " hoặc " : ", ");
    throw new AppError(`Tài khoản chưa có quyền: ${label}.`, 403);
  }

  return context;
}

export async function assertCanAssignStaffRole(
  session: SessionProfile,
  roleCode: string
) {
  const template = STAFF_ROLE_TEMPLATES.find((role) => role.code === roleCode);
  if (template?.role === "ADMIN") {
    const supabase = createAdminSupabaseClient() as any;
    await assertCanonicalRestaurantOwner({
      supabase,
      restaurantId: session.restaurantId,
      userId: session.userId,
      action: "tạo hoặc gán vai trò quản trị"
    });
    return assertStaffActionPermission(session, "staff.roles");
  }

  const supabase = createAdminSupabaseClient() as any;
  const roleResult = await supabase
    .from("staff_roles")
    .select("role_scope")
    .eq("restaurant_id", session.restaurantId)
    .eq("code", roleCode)
    .eq("is_active", true)
    .maybeSingle();

  if (roleResult.error && !isMissingPermissionSchema(roleResult.error)) {
    throw roleResult.error;
  }

  if (roleResult.data?.role_scope === "ADMIN") {
    await assertCanonicalRestaurantOwner({
      supabase,
      restaurantId: session.restaurantId,
      userId: session.userId,
      action: "tạo hoặc gán vai trò quản trị tùy chỉnh"
    });
    return assertStaffActionPermission(session, "staff.roles");
  }
}
