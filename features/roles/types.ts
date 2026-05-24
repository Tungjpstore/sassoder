import type { StaffPermissionKey, StaffPermissionProfile, StaffRoleTemplateCode } from "@/lib/staff-permissions";

export type RoleTemplate = {
  code: StaffRoleTemplateCode;
  profile: StaffPermissionProfile;
  permissions: StaffPermissionKey[];
};
