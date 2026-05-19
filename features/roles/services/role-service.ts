import "server-only";

import type { z } from "zod";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  STAFF_PERMISSION_KEYS,
  STAFF_ROLE_TEMPLATES,
  getStaffPermissionPreset,
  getStaffRoleTemplate,
  isDangerPermission,
  type StaffPermissionKey,
  type StaffPermissionProfile
} from "@/lib/staff-permissions";
import type { staffRoleCloneSchema, staffRolePermissionUpdateSchema } from "@/lib/validators";
import { getRestaurantEntitlement } from "@/services/subscription-service";
import { writeStaffActivityLog } from "@/services/staff-activity-log-service";

type StaffRolePermissionUpdateInput = z.infer<typeof staffRolePermissionUpdateSchema>;
type StaffRoleCloneInput = z.infer<typeof staffRoleCloneSchema>;

type StaffRoleRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  legacy_permission_profile: StaffPermissionProfile;
  role_scope: "ADMIN" | "STAFF";
  is_system: boolean;
  preview_actions: string[] | null;
};

type StaffRolePermissionRow = {
  permission_key: StaffPermissionKey;
};

const ownerRequiredPermissions = new Set<StaffPermissionKey>([
  "dashboard.view",
  "staff.view",
  "staff.edit",
  "staff.roles",
  "activity_logs.view",
  "settings.billing.manage"
]);

function isMissingRoleSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST204" || error.code === "42P01" || /staff_roles|staff_role_permissions|permission_key/i.test(message);
}

function dedupePermissions(permissions: StaffPermissionKey[]) {
  const allowed = new Set<string>(STAFF_PERMISSION_KEYS);
  return [...new Set(permissions)].filter((permission): permission is StaffPermissionKey => allowed.has(permission));
}

function sortPermissions(permissions: StaffPermissionKey[]) {
  const order = new Map(STAFF_PERMISSION_KEYS.map((permission, index) => [permission, index]));
  return [...permissions].sort((left, right) => (order.get(left) ?? 999) - (order.get(right) ?? 999));
}

function roleSlug(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 22) || "vai-tro"
  );
}

async function assertPremiumCustomPermissions(restaurantId: string) {
  const entitlement = await getRestaurantEntitlement(restaurantId);
  if (entitlement.planCode !== "premium") {
    throw new AppError("Ma trận quyền tuỳ chỉnh chỉ khả dụng trên gói Premium.", 402);
  }
}

async function readRole(supabase: any, restaurantId: string, roleId: string) {
  const roleResult = await supabase
    .from("staff_roles")
    .select("id,code,name,description,legacy_permission_profile,role_scope,is_system,preview_actions")
    .eq("restaurant_id", restaurantId)
    .eq("id", roleId)
    .eq("is_active", true)
    .maybeSingle();

  if (roleResult.error) {
    if (isMissingRoleSchema(roleResult.error)) {
      throw new AppError("Chưa có schema phân quyền nhân sự. Vui lòng chạy migration trước.", 500);
    }
    throw roleResult.error;
  }

  const role = roleResult.data as StaffRoleRow | null;
  if (!role) throw new AppError("Không tìm thấy vai trò hoặc vai trò đã bị tắt.", 404);
  return role;
}

async function readRolePermissions(supabase: any, restaurantId: string, role: StaffRoleRow) {
  const permissionResult = await supabase
    .from("staff_role_permissions")
    .select("permission_key")
    .eq("restaurant_id", restaurantId)
    .eq("role_id", role.id);

  if (permissionResult.error) {
    if (isMissingRoleSchema(permissionResult.error)) return getStaffRoleTemplate(role.code).permissions;
    throw permissionResult.error;
  }

  const rows = (permissionResult.data ?? []) as StaffRolePermissionRow[];
  const template = STAFF_ROLE_TEMPLATES.find((item) => item.code === role.code);
  const fallback = template?.permissions ?? getStaffPermissionPreset(role.legacy_permission_profile).permissions;
  return sortPermissions(rows.length > 0 ? rows.map((row) => row.permission_key) : fallback);
}

function assertOwnerGuard(role: StaffRoleRow, permissions: StaffPermissionKey[]) {
  if (role.code !== "owner") return;

  const next = new Set(permissions);
  const missing = [...ownerRequiredPermissions].filter((permission) => !next.has(permission));
  if (missing.length > 0) {
    throw new AppError("Vai trò Chủ quán phải giữ quyền quản trị, phân quyền, nhật ký và quản lý gói dịch vụ.", 400);
  }
}

function changeSeverity(role: StaffRoleRow, added: StaffPermissionKey[], removed: StaffPermissionKey[]) {
  if (role.code === "owner") return "critical" as const;
  return [...added, ...removed].some(isDangerPermission) ? "critical" : "warning";
}

export async function updateStaffRolePermissions({
  restaurantId,
  actorUserId,
  input
}: {
  restaurantId: string;
  actorUserId: string;
  input: StaffRolePermissionUpdateInput;
}) {
  await assertPremiumCustomPermissions(restaurantId);

  const supabase = createAdminSupabaseClient() as any;
  const role = await readRole(supabase, restaurantId, input.roleId);
  const currentPermissions = await readRolePermissions(supabase, restaurantId, role);
  const nextPermissions = sortPermissions(dedupePermissions(input.permissions));

  assertOwnerGuard(role, nextPermissions);

  const current = new Set(currentPermissions);
  const next = new Set(nextPermissions);
  const added = nextPermissions.filter((permission) => !current.has(permission));
  const removed = currentPermissions.filter((permission) => !next.has(permission));

  if (added.length === 0 && removed.length === 0) {
    return {
      role,
      permissions: currentPermissions,
      added,
      removed
    };
  }

  if (added.length > 0) {
    const insertResult = await supabase.from("staff_role_permissions").upsert(
      added.map((permission) => ({
        restaurant_id: restaurantId,
        role_id: role.id,
        permission_key: permission
      })),
      { onConflict: "role_id,permission_key" }
    );

    if (insertResult.error) throw insertResult.error;
  }

  if (removed.length > 0) {
    const deleteResult = await supabase
      .from("staff_role_permissions")
      .delete()
      .eq("restaurant_id", restaurantId)
      .eq("role_id", role.id)
      .in("permission_key", removed);

    if (deleteResult.error) throw deleteResult.error;
  }

  const updateRoleResult = await supabase
    .from("staff_roles")
    .update({ updated_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId)
    .eq("id", role.id);

  if (updateRoleResult.error) throw updateRoleResult.error;

  await writeStaffActivityLog({
    restaurantId,
    actorUserId,
    entityType: "staff_role",
    entityId: role.id,
    action: "roles.permissions_updated",
    severity: changeSeverity(role, added, removed),
    reason: "Cập nhật ma trận quyền từ Staff Operations",
    beforeState: {
      role,
      permissions: currentPermissions
    },
    afterState: {
      role,
      permissions: nextPermissions,
      added,
      removed
    },
    metadata: {
      source: "staff_role_service",
      roleCode: role.code,
      dangerChanged: [...added, ...removed].filter(isDangerPermission)
    }
  });

  return {
    role,
    permissions: nextPermissions,
    added,
    removed
  };
}

export async function cloneStaffRole({
  restaurantId,
  actorUserId,
  input
}: {
  restaurantId: string;
  actorUserId: string;
  input: StaffRoleCloneInput;
}) {
  await assertPremiumCustomPermissions(restaurantId);

  const supabase = createAdminSupabaseClient() as any;
  const sourceRole = await readRole(supabase, restaurantId, input.sourceRoleId);
  const sourcePermissions = await readRolePermissions(supabase, restaurantId, sourceRole);
  const code = `custom-${roleSlug(input.name)}-${Date.now().toString(36)}`.slice(0, 40);
  const preview = `Bản sao từ ${sourceRole.name}`;

  const insertRoleResult = await supabase
    .from("staff_roles")
    .insert({
      restaurant_id: restaurantId,
      code,
      name: input.name,
      description: input.description || `Vai trò tuỳ chỉnh được clone từ ${sourceRole.name}.`,
      legacy_permission_profile: sourceRole.legacy_permission_profile,
      role_scope: sourceRole.role_scope,
      is_system: false,
      sort_order: 1000,
      preview_actions: [preview]
    })
    .select("id,code,name,description,legacy_permission_profile,role_scope,is_system,preview_actions")
    .single();

  if (insertRoleResult.error) throw insertRoleResult.error;

  const clonedRole = insertRoleResult.data as StaffRoleRow;
  const insertPermissionsResult = await supabase.from("staff_role_permissions").insert(
    sourcePermissions.map((permission) => ({
      restaurant_id: restaurantId,
      role_id: clonedRole.id,
      permission_key: permission
    }))
  );

  if (insertPermissionsResult.error) throw insertPermissionsResult.error;

  await writeStaffActivityLog({
    restaurantId,
    actorUserId,
    entityType: "staff_role",
    entityId: clonedRole.id,
    action: "roles.cloned",
    severity: sourcePermissions.some(isDangerPermission) ? "warning" : "info",
    reason: `Clone vai trò từ ${sourceRole.name}`,
    beforeState: {
      role: sourceRole,
      permissions: sourcePermissions
    },
    afterState: {
      role: clonedRole,
      permissions: sourcePermissions
    },
    metadata: {
      source: "staff_role_service",
      sourceRoleId: sourceRole.id,
      sourceRoleCode: sourceRole.code
    }
  });

  return {
    role: clonedRole,
    permissions: sourcePermissions
  };
}
