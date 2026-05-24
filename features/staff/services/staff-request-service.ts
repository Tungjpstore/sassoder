import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ensureDefaultStoreBranch } from "@/services/branch-service";
import { writeStaffActivityLog } from "@/services/staff-activity-log-service";
import { getRestaurantEntitlement } from "@/services/subscription-service";
import type { z } from "zod";
import type { staffOperationalRequestSchema } from "@/lib/validators";

type DashboardSession = {
  userId: string;
  restaurantId: string;
  role: "ADMIN" | "STAFF";
};

type StaffOperationalRequestInput = z.infer<typeof staffOperationalRequestSchema>;

type StaffMemberRef = {
  id: string;
  user_id: string | null;
  full_name: string;
  employment_status: "active" | "suspended" | "resigned";
  archived_at: string | null;
};

type ShiftAssignmentRef = {
  id: string;
  shift_id: string;
  branch_id: string | null;
  staff_member_id: string;
  scheduled_date: string;
  status: "scheduled" | "confirmed" | "swapped" | "cancelled" | "completed";
};

type ShiftRef = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
};

type RequestDraft = {
  requestType: "leave_request" | "shift_swap" | "overtime";
  branchId: string | null;
  reason: string;
  requestedPayload: Record<string, unknown>;
  notificationTitle: string;
  notificationBody: string;
};

const leaveTypeLabels: Record<string, string> = {
  paid: "Nghỉ phép có lương",
  unpaid: "Nghỉ không lương",
  sick: "Nghỉ ốm",
  emergency: "Nghỉ gấp",
  other: "Nghỉ khác"
};

function isMissingStaffRequestSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42P01" || /attendance_approval_requests|notifications|staff_|shift_/i.test(error.message ?? "");
}

function todayIsoDate() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function dateRangeLabel(fromDate?: string | "", toDate?: string | "") {
  if (!fromDate) return "Chưa chọn ngày";
  if (!toDate || toDate === fromDate) return fromDate;
  return `${fromDate} -> ${toDate}`;
}

function daySpanInclusive(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00.000Z`).getTime();
  const to = new Date(`${toDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.floor((to - from) / 86_400_000) + 1;
}

function dateInRange(date: string, fromDate: unknown, toDate: unknown) {
  if (typeof fromDate !== "string" || !fromDate) return false;
  const endDate = typeof toDate === "string" && toDate ? toDate : fromDate;
  return fromDate <= date && date <= endDate;
}

function payloadMatches(left: Record<string, unknown>, right: Record<string, unknown>, keys: string[]) {
  return keys.every((key) => left[key] === right[key]);
}

async function assertStaffRequestWorkflow(restaurantId: string) {
  const entitlement = await getRestaurantEntitlement(restaurantId);
  if (!entitlement.allowed) {
    throw new AppError(entitlement.reason ?? "Gói LogiVN không hợp lệ.", entitlement.statusCode);
  }
  if (!entitlement.features.staff_management?.enabled) {
    throw new AppError("Quản lý nhân sự chưa được bật trên gói hiện tại.", 402);
  }
}

async function readStaffMemberForRequest(supabase: any, session: DashboardSession, staffMemberId?: string | "") {
  let query = supabase
    .from("staff_members")
    .select("id,user_id,full_name,employment_status,archived_at")
    .eq("restaurant_id", session.restaurantId);

  if (session.role === "ADMIN" && staffMemberId) {
    query = query.eq("id", staffMemberId);
  } else {
    query = query.eq("user_id", session.userId);
  }

  const result = await query.maybeSingle();
  if (result.error) throw result.error;

  const staff = result.data as StaffMemberRef | null;
  if (!staff || staff.archived_at) throw new AppError("Không tìm thấy hồ sơ nhân sự đang hoạt động.", 404);
  if (staff.employment_status !== "active") throw new AppError("Tài khoản nhân sự hiện không ở trạng thái đang làm.", 409);
  return staff;
}

async function readPrimaryBranchId(supabase: any, restaurantId: string, staffMemberId: string) {
  const result = await supabase
    .from("staff_branch_assignments")
    .select("branch_id,is_primary")
    .eq("restaurant_id", restaurantId)
    .eq("staff_member_id", staffMemberId)
    .eq("assignment_status", "active")
    .is("ended_at", null)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data?.branch_id ?? (await ensureDefaultStoreBranch(restaurantId))?.id ?? null;
}

async function readShiftForSwap(supabase: any, session: DashboardSession, staff: StaffMemberRef, shiftAssignmentId?: string | "") {
  if (!shiftAssignmentId) throw new AppError("Cần chọn ca muốn đổi.", 422);

  const assignmentResult = await supabase
    .from("shift_assignments")
    .select("id,shift_id,branch_id,staff_member_id,scheduled_date,status")
    .eq("restaurant_id", session.restaurantId)
    .eq("id", shiftAssignmentId)
    .maybeSingle();

  if (assignmentResult.error) throw assignmentResult.error;
  const assignment = assignmentResult.data as ShiftAssignmentRef | null;
  if (!assignment) throw new AppError("Không tìm thấy ca muốn đổi.", 404);
  if (session.role !== "ADMIN" && assignment.staff_member_id !== staff.id) {
    throw new AppError("Bạn chỉ có thể tạo yêu cầu đổi ca của chính mình.", 403);
  }
  if (assignment.status === "cancelled" || assignment.status === "completed") {
    throw new AppError("Ca này không còn khả dụng để đổi.", 409);
  }
  if (assignment.scheduled_date < todayIsoDate()) {
    throw new AppError("Không thể xin đổi ca đã qua.", 409);
  }

  const shiftResult = await supabase
    .from("shifts")
    .select("id,name,start_time,end_time")
    .eq("restaurant_id", session.restaurantId)
    .eq("id", assignment.shift_id)
    .maybeSingle();

  if (shiftResult.error) throw shiftResult.error;
  const shift = shiftResult.data as ShiftRef | null;
  if (!shift) throw new AppError("Không tìm thấy mẫu ca cần đổi.", 404);

  return { assignment, shift };
}

async function readTargetStaffName(supabase: any, restaurantId: string, targetStaffMemberId?: string | "") {
  if (!targetStaffMemberId) return null;

  const result = await supabase
    .from("staff_members")
    .select("id,full_name,employment_status,archived_at")
    .eq("restaurant_id", restaurantId)
    .eq("id", targetStaffMemberId)
    .maybeSingle();

  if (result.error) throw result.error;
  const staff = result.data as Pick<StaffMemberRef, "id" | "full_name" | "employment_status" | "archived_at"> | null;
  if (!staff || staff.archived_at || staff.employment_status !== "active") {
    throw new AppError("Nhân sự nhận đổi ca không khả dụng.", 404);
  }

  return staff.full_name;
}

async function assertNoPayrollRequestConflict({
  supabase,
  restaurantId,
  staffMemberId,
  input
}: {
  supabase: any;
  restaurantId: string;
  staffMemberId: string;
  input: StaffOperationalRequestInput;
}) {
  const requestDates =
    input.requestType === "leave_request"
      ? { fromDate: input.fromDate || "", toDate: input.toDate || input.fromDate || "" }
      : input.requestType === "overtime"
        ? { fromDate: input.fromDate || "", toDate: input.fromDate || "" }
        : null;

  if (!requestDates?.fromDate) return;

  const result = await supabase
    .from("attendance_approval_requests")
    .select("id,request_type,status,requested_payload")
    .eq("restaurant_id", restaurantId)
    .eq("staff_member_id", staffMemberId)
    .in("request_type", ["leave_request", "overtime"])
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false })
    .limit(80);

  if (result.error) throw result.error;

  const rows = (result.data ?? []) as Array<{
    id: string;
    request_type: "leave_request" | "overtime";
    status: "pending" | "approved";
    requested_payload: Record<string, unknown> | null;
  }>;

  if (input.requestType === "overtime") {
    const overtimeDate = input.fromDate || "";
    const conflictingLeave = rows.find((row) => {
      const payload = row.requested_payload ?? {};
      return row.request_type === "leave_request" && dateInRange(overtimeDate, payload.fromDate, payload.toDate);
    });

    if (conflictingLeave) {
      throw new AppError("Ngày này đã có nghỉ phép đang chờ/đã duyệt, không thể tạo yêu cầu tăng ca.", 409);
    }
  }

  if (input.requestType === "leave_request") {
    const conflictingOvertime = rows.find((row) => {
      const payload = row.requested_payload ?? {};
      const overtimeDate = typeof payload.overtimeDate === "string" ? payload.overtimeDate : typeof payload.fromDate === "string" ? payload.fromDate : "";
      return row.request_type === "overtime" && overtimeDate && dateInRange(overtimeDate, requestDates.fromDate, requestDates.toDate);
    });

    if (conflictingOvertime) {
      throw new AppError("Khoảng nghỉ này đã có tăng ca đang chờ/đã duyệt, cần xử lý payroll trước.", 409);
    }
  }
}

async function buildRequestDraft({
  supabase,
  session,
  staff,
  input,
  primaryBranchId
}: {
  supabase: any;
  session: DashboardSession;
  staff: StaffMemberRef;
  input: StaffOperationalRequestInput;
  primaryBranchId: string | null;
}): Promise<RequestDraft> {
  if (input.requestType === "leave_request") {
    const leaveType = input.leaveType || "unpaid";
    const fromDate = input.fromDate || "";
    const toDate = input.toDate || fromDate;
    const branchId = input.branchId || primaryBranchId;
    const label = leaveTypeLabels[leaveType] ?? leaveTypeLabels.other;
    const leaveDays = daySpanInclusive(fromDate, toDate);
    if (leaveDays > 31) throw new AppError("Một yêu cầu nghỉ phép chỉ được tối đa 31 ngày.", 422);

    return {
      requestType: "leave_request",
      branchId,
      reason: input.reason || `${label} ${dateRangeLabel(fromDate, toDate)}`,
      requestedPayload: {
        leaveType,
        leaveTypeLabel: label,
        fromDate,
        toDate,
        leaveDays,
        payrollImpact: leaveType === "paid" ? "paid_leave" : "unpaid_leave"
      },
      notificationTitle: "Yêu cầu nghỉ phép mới",
      notificationBody: `${staff.full_name} xin ${label.toLowerCase()} ${dateRangeLabel(fromDate, toDate)}.`
    };
  }

  if (input.requestType === "shift_swap") {
    const { assignment, shift } = await readShiftForSwap(supabase, session, staff, input.shiftAssignmentId);
    if (input.targetStaffMemberId && input.targetStaffMemberId === staff.id) {
      throw new AppError("Người nhận đổi ca phải khác nhân viên tạo yêu cầu.", 422);
    }
    const targetStaffName = await readTargetStaffName(supabase, session.restaurantId, input.targetStaffMemberId);

    return {
      requestType: "shift_swap",
      branchId: assignment.branch_id ?? (input.branchId ? input.branchId : primaryBranchId),
      reason: input.reason || `Xin đổi ${shift.name} ngày ${assignment.scheduled_date}`,
      requestedPayload: {
        shiftAssignmentId: assignment.id,
        shiftId: shift.id,
        shiftName: shift.name,
        scheduledDate: assignment.scheduled_date,
        startTime: shift.start_time.slice(0, 5),
        endTime: shift.end_time.slice(0, 5),
        targetStaffMemberId: input.targetStaffMemberId || null,
        targetStaffName,
        currentStatus: assignment.status
      },
      notificationTitle: "Yêu cầu đổi ca mới",
      notificationBody: `${staff.full_name} xin đổi ${shift.name} ngày ${assignment.scheduled_date}.`
    };
  }

  const overtimeDate = input.fromDate || todayIsoDate();
  const overtimeMinutes = input.overtimeMinutes ?? 0;

  return {
    requestType: "overtime",
    branchId: input.branchId || primaryBranchId,
    reason: input.reason || `Xin xác nhận tăng ca ${overtimeMinutes} phút ngày ${overtimeDate}`,
    requestedPayload: {
      overtimeDate,
      overtimeMinutes,
      payrollImpact: "overtime_payable"
    },
    notificationTitle: "Yêu cầu xác nhận tăng ca",
    notificationBody: `${staff.full_name} xin xác nhận ${overtimeMinutes} phút tăng ca ngày ${overtimeDate}.`
  };
}

async function assertNoDuplicatePendingRequest({
  supabase,
  restaurantId,
  staffMemberId,
  draft
}: {
  supabase: any;
  restaurantId: string;
  staffMemberId: string;
  draft: RequestDraft;
}) {
  const result = await supabase
    .from("attendance_approval_requests")
    .select("id,requested_payload")
    .eq("restaurant_id", restaurantId)
    .eq("staff_member_id", staffMemberId)
    .eq("request_type", draft.requestType)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  if (result.error) throw result.error;

  const existingRows = (result.data ?? []) as Array<{ id: string; requested_payload: Record<string, unknown> | null }>;
  const compareKeys =
    draft.requestType === "shift_swap"
      ? ["shiftAssignmentId"]
      : draft.requestType === "leave_request"
        ? ["fromDate", "toDate", "leaveType"]
        : ["overtimeDate"];
  const duplicate = existingRows.find((row) => payloadMatches(row.requested_payload ?? {}, draft.requestedPayload, compareKeys));
  if (duplicate) throw new AppError("Đã có yêu cầu tương tự đang chờ quản lý duyệt.", 409);
}

async function insertRequestNotification({
  supabase,
  restaurantId,
  userId,
  title,
  body,
  type,
  payload
}: {
  supabase: any;
  restaurantId: string;
  userId?: string | null;
  title: string;
  body: string;
  type: string;
  payload: Record<string, unknown>;
}) {
  const result = await supabase.from("notifications").insert({
    restaurant_id: restaurantId,
    user_id: userId ?? null,
    type,
    title,
    body,
    action_url: userId ? "/dashboard/staff/mobile" : "/dashboard/staff",
    status: "unread",
    payload
  });

  if (result.error && !isMissingStaffRequestSchema(result.error)) {
    console.error("[staff-request-service] notification failed", {
      restaurantId,
      type,
      error: result.error.message
    });
  }
}

export async function createStaffOperationalRequest({
  session,
  input
}: {
  session: DashboardSession;
  input: StaffOperationalRequestInput;
}) {
  await assertStaffRequestWorkflow(session.restaurantId);
  const supabase = createAdminSupabaseClient() as any;
  const staff = await readStaffMemberForRequest(supabase, session, input.staffMemberId);
  const primaryBranchId = await readPrimaryBranchId(supabase, session.restaurantId, staff.id);
  const draft = await buildRequestDraft({ supabase, session, staff, input, primaryBranchId });

  await assertNoPayrollRequestConflict({
    supabase,
    restaurantId: session.restaurantId,
    staffMemberId: staff.id,
    input
  });

  await assertNoDuplicatePendingRequest({
    supabase,
    restaurantId: session.restaurantId,
    staffMemberId: staff.id,
    draft
  });

  const result = await supabase
    .from("attendance_approval_requests")
    .insert({
      restaurant_id: session.restaurantId,
      attendance_log_id: null,
      staff_member_id: staff.id,
      branch_id: draft.branchId,
      request_type: draft.requestType,
      status: "pending",
      reason: draft.reason,
      requested_payload: draft.requestedPayload,
      requested_by: session.userId
    })
    .select("id,request_type,status,reason,requested_payload,created_at")
    .single();

  if (result.error) throw result.error;

  const payload = {
    approvalId: result.data.id,
    staffMemberId: staff.id,
    requestType: draft.requestType
  };

  await Promise.all([
    insertRequestNotification({
      supabase,
      restaurantId: session.restaurantId,
      type: "staff_request_submitted",
      title: draft.notificationTitle,
      body: draft.notificationBody,
      payload
    }),
    insertRequestNotification({
      supabase,
      restaurantId: session.restaurantId,
      userId: staff.user_id,
      type: "staff_request_created",
      title: "Đã gửi yêu cầu cho quản lý",
      body: draft.reason,
      payload
    }),
    writeStaffActivityLog({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      branchId: draft.branchId,
      entityType: "staff_request",
      entityId: result.data.id,
      action: "staff.request_created",
      severity: draft.requestType === "overtime" ? "warning" : "info",
      reason: draft.reason,
      afterState: result.data,
      metadata: {
        requestType: draft.requestType,
        staffMemberId: staff.id
      }
    })
  ]);

  return result.data as {
    id: string;
    request_type: RequestDraft["requestType"];
    status: "pending";
    reason: string | null;
    requested_payload: Record<string, unknown>;
    created_at: string;
  };
}
