export type StaffOwnerBoundaryInput = {
  actorIsCanonicalOwner?: boolean;
  targetIsCanonicalOwner?: boolean;
  actorRoleCode?: string | null;
  targetRoleCode?: string | null;
  requestedRoleCode?: string | null;
  rejectCanonicalOwnerTarget?: boolean;
};

export function isOwnerRoleCode(roleCode: string | null | undefined) {
  return roleCode === "owner";
}

export function canActorMutateStaffOwnerBoundary({
  actorIsCanonicalOwner = false,
  targetIsCanonicalOwner = false,
  actorRoleCode,
  targetRoleCode,
  requestedRoleCode,
  rejectCanonicalOwnerTarget = false
}: StaffOwnerBoundaryInput) {
  const touchesOwner = targetIsCanonicalOwner || isOwnerRoleCode(targetRoleCode) || isOwnerRoleCode(requestedRoleCode);
  if (!touchesOwner) return true;
  if (!actorIsCanonicalOwner) return false;
  if (isOwnerRoleCode(requestedRoleCode) && !targetIsCanonicalOwner) return false;
  if (targetIsCanonicalOwner && rejectCanonicalOwnerTarget) return false;
  if (targetIsCanonicalOwner && requestedRoleCode && !isOwnerRoleCode(requestedRoleCode)) return false;
  return true;
}
