import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { SessionProfile } from "@/types/domain";

type SupabaseError = { code?: string; message?: string } | null | undefined;

function isMissingStaffBranchSchema(error: SupabaseError) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST204" || error.code === "42P01" || /staff_members|staff_branch_assignments|shift_assignments|branch_id/i.test(message);
}

function firstOrNull<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function getStaffAuthorizedBranchIds(session: SessionProfile) {
  const supabase = createAdminSupabaseClient() as any;
  const memberResult = await supabase
    .from("staff_members")
    .select("id,role_code,employment_status,archived_at")
    .eq("restaurant_id", session.restaurantId)
    .eq("user_id", session.userId)
    .maybeSingle();

  if (memberResult.error) {
    if (isMissingStaffBranchSchema(memberResult.error)) {
      throw new AppError("Chưa có schema phân quyền chi nhánh cho nhân sự.", 503);
    }
    throw memberResult.error;
  }

  const member = memberResult.data as { id: string; role_code: string; employment_status: string; archived_at: string | null } | null;
  if (!member) {
    if (session.role === "ADMIN") return null;
    throw new AppError("Hồ sơ nhân sự không khả dụng để thao tác chi nhánh.", 403);
  }

  if (member.archived_at || member.employment_status !== "active") {
    throw new AppError("Hồ sơ nhân sự không khả dụng để thao tác chi nhánh.", 403);
  }

  if (member.role_code === "owner") return null;

  const today = new Date().toISOString().slice(0, 10);
  const [assignmentResult, shiftResult, branchResult] = await Promise.all([
    supabase
      .from("staff_branch_assignments")
      .select("branch_id")
      .eq("restaurant_id", session.restaurantId)
      .eq("staff_member_id", member.id)
      .eq("assignment_status", "active")
      .is("ended_at", null),
    supabase
      .from("shift_assignments")
      .select("branch_id")
      .eq("restaurant_id", session.restaurantId)
      .eq("staff_member_id", member.id)
      .neq("status", "cancelled")
      .gte("scheduled_date", today),
    supabase
      .from("store_branches")
      .select("id")
      .eq("restaurant_id", session.restaurantId)
      .eq("is_active", true)
      .limit(2)
  ]);

  for (const result of [assignmentResult, shiftResult, branchResult]) {
    if (result.error) {
      if (isMissingStaffBranchSchema(result.error)) {
        throw new AppError("Chưa có schema phân quyền chi nhánh cho nhân sự.", 503);
      }
      throw result.error;
    }
  }

  const branchIds = new Set<string>();
  for (const row of assignmentResult.data ?? []) {
    if (row.branch_id) branchIds.add(row.branch_id as string);
  }
  for (const row of shiftResult.data ?? []) {
    if (row.branch_id) branchIds.add(row.branch_id as string);
  }

  if (branchIds.size === 0 && branchResult.data?.length === 1) {
    branchIds.add(branchResult.data[0].id as string);
  }

  return branchIds;
}

export async function assertStaffCanAccessBranch(session: SessionProfile, branchId?: string | null) {
  const branchIds = await getStaffAuthorizedBranchIds(session);
  if (branchIds === null) return;

  if (!branchId) {
    if (branchIds.size === 1) return;
    throw new AppError("Dữ liệu chưa có chi nhánh nên nhân viên không thể thao tác an toàn.", 403);
  }

  if (!branchIds.has(branchId)) {
    throw new AppError("Bạn không có quyền thao tác dữ liệu ngoài chi nhánh được gán.", 403);
  }
}

export async function assertStaffCanAccessOrder(session: SessionProfile, orderId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const result = await supabase
    .from("orders")
    .select("id,branch_id")
    .eq("restaurant_id", session.restaurantId)
    .eq("id", orderId)
    .maybeSingle();

  if (result.error) {
    if (isMissingStaffBranchSchema(result.error)) {
      throw new AppError("Đơn hàng chưa có dữ liệu chi nhánh để kiểm tra quyền nhân viên.", 503);
    }
    throw result.error;
  }
  if (!result.data?.id) throw new AppError("Không tìm thấy đơn hàng.", 404);

  await assertStaffCanAccessBranch(session, result.data.branch_id as string | null);
}

export async function assertStaffCanAccessReservation(session: SessionProfile, reservationId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const result = await supabase
    .from("reservations")
    .select("id,locks:reservation_table_locks(status,table:tables(branch_id))")
    .eq("restaurant_id", session.restaurantId)
    .eq("id", reservationId)
    .maybeSingle();

  if (result.error) {
    if (isMissingStaffBranchSchema(result.error)) {
      throw new AppError("Đặt bàn chưa có dữ liệu chi nhánh để kiểm tra quyền nhân viên.", 503);
    }
    throw result.error;
  }
  if (!result.data?.id) throw new AppError("Không tìm thấy đặt bàn.", 404);

  const branchIds = await getStaffAuthorizedBranchIds(session);
  if (branchIds === null) return;

  const reservationBranchIds = new Set<string>();
  for (const lock of (result.data.locks ?? []) as Array<{
    status?: string | null;
    table?: { branch_id?: string | null } | Array<{ branch_id?: string | null }> | null;
  }>) {
    if (lock.status !== "active") continue;
    const table = firstOrNull(lock.table);
    if (table?.branch_id) reservationBranchIds.add(table.branch_id);
  }

  if (reservationBranchIds.size === 0) {
    if (branchIds.size !== 1) {
      throw new AppError("Dữ liệu đặt bàn chưa có chi nhánh nên nhân viên không thể thao tác an toàn.", 403);
    }
    return;
  }

  for (const branchId of reservationBranchIds) {
    if (!branchIds.has(branchId)) {
      throw new AppError("Bạn không có quyền thao tác dữ liệu ngoài chi nhánh được gán.", 403);
    }
  }
}

export async function assertStaffCanAccessTables(session: SessionProfile, tableIds: string[]) {
  const normalizedTableIds = [...new Set(tableIds.filter(Boolean))];
  if (normalizedTableIds.length === 0) return;
  const supabase = createAdminSupabaseClient() as any;
  const result = await supabase
    .from("tables")
    .select("id,branch_id")
    .eq("restaurant_id", session.restaurantId)
    .in("id", normalizedTableIds);

  if (result.error) {
    if (isMissingStaffBranchSchema(result.error)) {
      throw new AppError("Bàn chưa có dữ liệu chi nhánh để kiểm tra quyền nhân viên.", 503);
    }
    throw result.error;
  }
  if ((result.data ?? []).length !== normalizedTableIds.length) {
    throw new AppError("Không tìm thấy bàn trong nhà hàng này.", 404);
  }

  for (const table of result.data as Array<{ id: string; branch_id?: string | null }>) {
    await assertStaffCanAccessBranch(session, table.branch_id ?? null);
  }
}

export async function assertStaffCanAccessServiceRequest(session: SessionProfile, requestId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const result = await supabase
    .from("service_requests")
    .select("id,table:tables(branch_id)")
    .eq("restaurant_id", session.restaurantId)
    .eq("id", requestId)
    .maybeSingle();

  if (result.error) {
    if (isMissingStaffBranchSchema(result.error)) {
      throw new AppError("Yêu cầu hỗ trợ chưa có dữ liệu chi nhánh để kiểm tra quyền nhân viên.", 503);
    }
    throw result.error;
  }
  if (!result.data?.id) throw new AppError("Không tìm thấy yêu cầu hỗ trợ.", 404);

  const table = firstOrNull(result.data.table as { branch_id?: string | null } | Array<{ branch_id?: string | null }> | null);
  await assertStaffCanAccessBranch(session, table?.branch_id ?? null);
}
