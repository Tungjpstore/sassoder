import "server-only";

import { AppError } from "@/lib/response";
import { canActorMutateStaffOwnerBoundary } from "@/lib/staff-owner-boundary";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type StaffOwnerBoundaryOptions = {
  supabase: any;
  restaurantId: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  requestedRoleCode?: string | null;
  rejectCanonicalOwnerTarget?: boolean;
  action: string;
};

type StaffOwnerRow = {
  user_id: string;
  role_code: string | null;
};

export async function assertStaffOwnerMutationAllowed({
  supabase,
  restaurantId,
  actorUserId,
  targetUserId,
  requestedRoleCode,
  rejectCanonicalOwnerTarget,
  action
}: StaffOwnerBoundaryOptions) {
  const userIds = Array.from(new Set([actorUserId, targetUserId].filter((id): id is string => Boolean(id))));
  const [restaurantResult, result] = await Promise.all([
    supabase
      .from("restaurants")
      .select("owner_user_id")
      .eq("id", restaurantId)
      .maybeSingle(),
    userIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
        .from("staff_members")
        .select("user_id,role_code")
        .eq("restaurant_id", restaurantId)
        .in("user_id", userIds)
  ]);

  if (restaurantResult.error || result.error) throw new AppError("Không xác thực được ranh giới tài khoản chủ quán.", 400);

  const rows = (result.data ?? []) as StaffOwnerRow[];
  const canonicalOwnerUserId = (restaurantResult.data as { owner_user_id?: string | null } | null)?.owner_user_id ?? null;
  const actorRoleCode = rows.find((row) => row.user_id === actorUserId)?.role_code ?? null;
  const targetRoleCode = rows.find((row) => row.user_id === targetUserId)?.role_code ?? null;
  const actorIsCanonicalOwner = Boolean(actorUserId && canonicalOwnerUserId === actorUserId);
  const targetIsCanonicalOwner = Boolean(targetUserId && canonicalOwnerUserId === targetUserId);

  if (!canActorMutateStaffOwnerBoundary({
    actorIsCanonicalOwner,
    targetIsCanonicalOwner,
    actorRoleCode,
    targetRoleCode,
    requestedRoleCode,
    rejectCanonicalOwnerTarget
  })) {
    throw new AppError(`Chỉ chủ quán mới được thực hiện thao tác ${action} với tài khoản chủ quán.`, 403);
  }

  return { actorIsCanonicalOwner, targetIsCanonicalOwner, actorRoleCode, targetRoleCode };
}

export async function assertCanonicalRestaurantOwner({
  supabase,
  restaurantId,
  userId,
  action
}: {
  supabase: any;
  restaurantId: string;
  userId: string;
  action: string;
}) {
  const restaurantResult = await supabase
    .from("restaurants")
    .select("owner_user_id")
    .eq("id", restaurantId)
    .maybeSingle();

  if (restaurantResult.error) throw new AppError("Không xác thực được chủ sở hữu nhà hàng.", 400);
  const ownerUserId = restaurantResult.data?.owner_user_id as string | null | undefined;
  if (!ownerUserId || ownerUserId !== userId) {
    throw new AppError(`Chỉ chủ quán mới được thực hiện thao tác ${action}.`, 403);
  }

  const ownerResult = await supabase
    .from("users")
    .select("id,email")
    .eq("restaurant_id", restaurantId)
    .eq("id", ownerUserId)
    .maybeSingle();

  if (ownerResult.error || !ownerResult.data?.email) {
    throw new AppError("Không tải được danh tính chủ sở hữu nhà hàng.", 400);
  }

  return { userId: ownerUserId, email: ownerResult.data.email as string };
}

/** Keep service-role ownership reads behind the server-side service boundary. */
export async function assertCanonicalRestaurantOwnerForTenant({
  restaurantId,
  userId,
  action
}: {
  restaurantId: string;
  userId: string;
  action: string;
}) {
  return assertCanonicalRestaurantOwner({
    supabase: createAdminSupabaseClient(),
    restaurantId,
    userId,
    action
  });
}
