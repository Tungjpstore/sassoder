import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  DEFAULT_ELIGIBLE_STAFF_PERMISSIONS,
  STAFF_ROLE_TEMPLATES,
  getStaffPermissionPreset,
  mapPermissionProfileToRoleTemplateCode,
  normalizeStaffPermissions,
  staffPermissionLabel,
  type StaffPermissionKey,
  type StaffPermissionProfile
} from "@/lib/staff-permissions";
import type { SessionProfile } from "@/types/domain";

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
  const [userResult, memberResult] = await Promise.all([
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
      .maybeSingle()
  ]);

  if (userResult.error) throw userResult.error;
  if (memberResult.error && !isMissingPermissionSchema(memberResult.error)) throw memberResult.error;

  const user = userResult.data as StaffUserPermissionRow | null;
  if (!user || user.account_status === "blocked") {
    throw new AppError("Tài khoản không còn khả dụng để thao tác vận hành.", 403);
  }

  const member = memberResult.data as StaffMemberPermissionRow | null;
  if (member?.archived_at || member?.employment_status === "resigned" || member?.employment_status === "suspended") {
    throw new AppError("Hồ sơ nhân sự đang bị khoá hoặc đã nghỉ.", 403);
  }

  const fallbackRoleCode = user.role === "ADMIN" ? "owner" : mapPermissionProfileToRoleTemplateCode(user.permission_profile ?? "service");
  const roleCode = member?.role_code ?? fallbackRoleCode;
  const permissions = member
    ? await readPermissionsForRole({
        supabase,
        restaurantId: session.restaurantId,
        roleId: member.role_id,
        roleCode,
        fallbackProfile: user.permission_profile ?? fallbackRoleCode
      })
    : withDefaultEligibleStaffPermissions(normalizeStaffPermissions(user.permissions, fallbackRoleCode));

  return {
    staffMemberId: member?.id ?? null,
    roleCode,
    permissions
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
