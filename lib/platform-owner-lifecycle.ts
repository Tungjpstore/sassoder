export type CanonicalOwnerLifecycleState = {
  tenantId: string;
  tenantStatus: "active" | "suspended" | "deleted";
  ownerUserId: string | null;
  ownerTenantId: string | null;
  ownerRole: "ADMIN" | "STAFF" | null;
  ownerAccountStatus: "active" | "blocked" | null;
  ownerStaffRoleCode: string | null;
  ownerEmploymentStatus: string | null;
  ownerStaffArchivedAt: string | null;
};

export function tenantActivationOwnerIssue(state: CanonicalOwnerLifecycleState) {
  if (!state.ownerUserId) return "Tenant chưa có canonical owner.";
  if (state.ownerTenantId !== state.tenantId) return "Canonical owner không thuộc tenant.";
  if (state.ownerRole !== "ADMIN") return "Canonical owner không còn quyền ADMIN.";
  if (state.ownerAccountStatus !== "active") return "Canonical owner đang bị khóa.";
  if (state.ownerStaffRoleCode !== "owner") return "Hồ sơ nhân sự canonical owner không hợp lệ.";
  if (state.ownerEmploymentStatus !== "active" || state.ownerStaffArchivedAt) {
    return "Hồ sơ nhân sự canonical owner không hoạt động.";
  }
  return null;
}

export function platformUserBlockIssue({
  targetUserId,
  ownerUserId,
  tenantStatus
}: {
  targetUserId: string;
  ownerUserId: string | null;
  tenantStatus: CanonicalOwnerLifecycleState["tenantStatus"];
}) {
  if (tenantStatus === "active" && ownerUserId === targetUserId) {
    return "Không thể khóa canonical owner khi tenant đang hoạt động. Hãy tạm dừng tenant hoặc chuyển quyền sở hữu trước.";
  }
  return null;
}
