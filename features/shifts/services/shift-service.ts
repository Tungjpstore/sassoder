import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ensureDefaultStoreBranch } from "@/services/branch-service";
import { getRestaurantEntitlement } from "@/services/subscription-service";
import type { z } from "zod";
import type {
  staffShiftAssignmentCancelSchema,
  staffShiftAssignmentSchema,
  staffShiftAssignmentUpdateSchema,
  staffShiftTemplateSchema,
  staffShiftTemplateUpdateSchema
} from "@/lib/validators";

type StaffShiftTemplateInput = z.infer<typeof staffShiftTemplateSchema>;
type StaffShiftTemplateUpdateInput = z.infer<typeof staffShiftTemplateUpdateSchema>;
type StaffShiftAssignmentInput = z.infer<typeof staffShiftAssignmentSchema>;
type StaffShiftAssignmentUpdateInput = z.infer<typeof staffShiftAssignmentUpdateSchema>;
type StaffShiftAssignmentCancelInput = z.infer<typeof staffShiftAssignmentCancelSchema>;

type ShiftRow = {
  id: string;
  branch_id: string | null;
  name: string;
  start_time: string;
  end_time: string;
};

type ShiftAssignmentRow = {
  id: string;
  shift_id: string;
  scheduled_date: string;
  status: "scheduled" | "confirmed" | "swapped" | "cancelled" | "completed";
};

type ShiftAssignmentDetailRow = ShiftAssignmentRow & {
  branch_id: string | null;
  staff_member_id: string;
  source: "manual" | "template" | "copy_week" | "swap" | "system";
  note: string | null;
};

type StaffAssignableRow = {
  id: string;
  user_id: string | null;
  full_name: string | null;
  employment_status: string;
  archived_at: string | null;
};

function normalizeShiftTime(value: string) {
  return value.length === 5 ? `${value}:00` : value;
}

function timeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function dateToDayNumber(value: string) {
  return Math.floor(Date.parse(`${value}T00:00:00.000Z`) / 86_400_000);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shiftInterval(shift: Pick<ShiftRow, "start_time" | "end_time">, scheduledDate: string) {
  const dayStart = dateToDayNumber(scheduledDate) * 24 * 60;
  const start = dayStart + timeToMinutes(shift.start_time);
  const rawEnd = dayStart + timeToMinutes(shift.end_time);
  return {
    start,
    end: rawEnd <= start ? rawEnd + 24 * 60 : rawEnd
  };
}

function shiftsOverlap(
  left: Pick<ShiftRow, "start_time" | "end_time">,
  leftDate: string,
  right: Pick<ShiftRow, "start_time" | "end_time">,
  rightDate: string
) {
  const leftInterval = shiftInterval(left, leftDate);
  const rightInterval = shiftInterval(right, rightDate);
  return leftInterval.start < rightInterval.end && rightInterval.start < leftInterval.end;
}

function isShiftAssignmentOverlapError(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "23P01" || /shift assignment overlaps|shift_assignments_unique_active_slot/i.test(message);
}

function normalizeShiftCode(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  return slug || "ca-lam";
}

async function assertStaffShiftScheduling(restaurantId: string) {
  const entitlement = await getRestaurantEntitlement(restaurantId);
  if (!entitlement.allowed) {
    throw new AppError(entitlement.reason ?? "Gói LogiVN không hợp lệ.", entitlement.statusCode);
  }
  if (!entitlement.features.staff_management?.enabled) {
    throw new AppError("Quản lý nhân sự chưa được bật trên gói hiện tại.", 402);
  }
}

async function resolveDefaultBranch(supabase: any, restaurantId: string, branchId?: string | "") {
  if (branchId) return branchId;

  const defaultBranch = await ensureDefaultStoreBranch(restaurantId);
  if (defaultBranch?.id) return defaultBranch.id;

  const result = await supabase
    .from("store_branches")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data?.id ?? null;
}

async function insertShiftActivity({
  supabase,
  restaurantId,
  actorUserId,
  branchId,
  entityId,
  action,
  beforeState,
  afterState,
  reason
}: {
  supabase: any;
  restaurantId: string;
  actorUserId: string;
  branchId?: string | null;
  entityId: string;
  action: string;
  beforeState?: unknown;
  afterState: unknown;
  reason?: string | null;
}) {
  const result = await supabase.from("staff_activity_logs").insert({
    restaurant_id: restaurantId,
    actor_user_id: actorUserId,
    branch_id: branchId ?? null,
    entity_type: action.startsWith("shifts.assign") ? "shift_assignment" : "shift",
    entity_id: entityId,
    action,
    severity: "warning",
    reason: reason ?? null,
    before_state: beforeState ?? null,
    after_state: afterState,
    metadata: {
      source: "staff_shift_service"
    }
  });

  if (result.error) throw result.error;
}

async function readAssignableStaff(supabase: any, restaurantId: string, staffMemberId: string) {
  const staffResult = await supabase
    .from("staff_members")
    .select("id,user_id,full_name,restaurant_id,employment_status,archived_at")
    .eq("restaurant_id", restaurantId)
    .eq("id", staffMemberId)
    .maybeSingle();

  if (staffResult.error) throw staffResult.error;
  const staff = staffResult.data as StaffAssignableRow | null;
  if (!staff || staff.archived_at || staff.employment_status !== "active") {
    throw new AppError("Nhân sự không khả dụng để phân ca.", 404);
  }

  return staff;
}

async function assertNoShiftAssignmentOverlap({
  supabase,
  restaurantId,
  staffMemberId,
  shift,
  scheduledDate,
  excludeAssignmentId
}: {
  supabase: any;
  restaurantId: string;
  staffMemberId: string;
  shift: ShiftRow;
  scheduledDate: string;
  excludeAssignmentId?: string;
}) {
  let query = supabase
    .from("shift_assignments")
    .select("id,shift_id,scheduled_date,status")
    .eq("restaurant_id", restaurantId)
    .eq("staff_member_id", staffMemberId)
    .gte("scheduled_date", addDays(scheduledDate, -1))
    .lte("scheduled_date", addDays(scheduledDate, 1))
    .neq("status", "cancelled");

  if (excludeAssignmentId) query = query.neq("id", excludeAssignmentId);

  const existingAssignmentsResult = await query;
  if (existingAssignmentsResult.error) throw existingAssignmentsResult.error;

  const existingAssignments = (existingAssignmentsResult.data ?? []) as ShiftAssignmentRow[];
  if (existingAssignments.some((assignment) => assignment.shift_id === shift.id && assignment.scheduled_date === scheduledDate)) {
    throw new AppError("Nhân sự đã được gán ca này trong ngày đã chọn.", 409);
  }

  const existingShiftIds = [...new Set(existingAssignments.map((assignment) => assignment.shift_id))];
  if (existingShiftIds.length === 0) return;

  const existingShiftsResult = await supabase
    .from("shifts")
    .select("id,name,start_time,end_time")
    .in("id", existingShiftIds);

  if (existingShiftsResult.error) throw existingShiftsResult.error;

  const existingShiftById = new Map(((existingShiftsResult.data ?? []) as ShiftRow[]).map((item) => [item.id, item]));
  const overlappedAssignment = existingAssignments.find((assignment) => {
    const existingShift = existingShiftById.get(assignment.shift_id);
    return existingShift ? shiftsOverlap(shift, scheduledDate, existingShift, assignment.scheduled_date) : false;
  });

  if (overlappedAssignment) {
    const overlappedShift = existingShiftById.get(overlappedAssignment.shift_id);
    throw new AppError(`Ca mới bị trùng giờ với ${overlappedShift?.name ?? "ca đã xếp"}.`, 409);
  }
}

async function assertShiftTemplateUpdateSafe({
  supabase,
  restaurantId,
  shiftId,
  nextShift
}: {
  supabase: any;
  restaurantId: string;
  shiftId: string;
  nextShift: ShiftRow;
}) {
  const assignmentsResult = await supabase
    .from("shift_assignments")
    .select("id,shift_id,scheduled_date,status,staff_member_id")
    .eq("restaurant_id", restaurantId)
    .eq("shift_id", shiftId)
    .in("status", ["scheduled", "confirmed", "swapped"]);

  if (assignmentsResult.error) throw assignmentsResult.error;
  const assignments = (assignmentsResult.data ?? []) as Array<ShiftAssignmentRow & { staff_member_id: string }>;
  if (assignments.length === 0) return;

  for (const assignment of assignments) {
    await assertNoShiftAssignmentOverlap({
      supabase,
      restaurantId,
      staffMemberId: assignment.staff_member_id,
      shift: nextShift,
      scheduledDate: assignment.scheduled_date,
      excludeAssignmentId: assignment.id
    });
  }
}

export async function createStaffShiftTemplate({
  restaurantId,
  actorUserId,
  input
}: {
  restaurantId: string;
  actorUserId: string;
  input: StaffShiftTemplateInput;
}) {
  await assertStaffShiftScheduling(restaurantId);
  const supabase = createAdminSupabaseClient() as any;
  const branchId = await resolveDefaultBranch(supabase, restaurantId, input.branchId);
  const baseCode = normalizeShiftCode(input.name);
  const code = `${baseCode}-${Date.now().toString(36)}`.slice(0, 40);

  const result = await supabase
    .from("shifts")
    .insert({
      restaurant_id: restaurantId,
      branch_id: branchId,
      code,
      name: input.name,
      start_time: normalizeShiftTime(input.startTime),
      end_time: normalizeShiftTime(input.endTime),
      allowed_late_minutes: input.allowedLateMinutes,
      overtime_threshold_minutes: input.overtimeThresholdMinutes,
      attendance_radius_meters: input.attendanceRadiusMeters,
      recurring_weekdays: input.recurringWeekdays,
      is_template: true,
      metadata: {
        createdFrom: "staff_operations"
      }
    })
    .select("id,branch_id,code,name,start_time,end_time,allowed_late_minutes,overtime_threshold_minutes,attendance_radius_meters,recurring_weekdays,is_template")
    .single();

  if (result.error) throw result.error;

  await insertShiftActivity({
    supabase,
    restaurantId,
    actorUserId,
    branchId,
    entityId: result.data.id,
    action: "shifts.template_created",
    afterState: result.data
  });

  return result.data;
}

export async function updateStaffShiftTemplate({
  restaurantId,
  actorUserId,
  input
}: {
  restaurantId: string;
  actorUserId: string;
  input: StaffShiftTemplateUpdateInput;
}) {
  await assertStaffShiftScheduling(restaurantId);
  const supabase = createAdminSupabaseClient() as any;
  const existingResult = await supabase
    .from("shifts")
    .select("id,branch_id,code,name,start_time,end_time,allowed_late_minutes,overtime_threshold_minutes,attendance_radius_meters,recurring_weekdays,is_template")
    .eq("restaurant_id", restaurantId)
    .eq("id", input.shiftId)
    .maybeSingle();

  if (existingResult.error) throw existingResult.error;
  const existing = existingResult.data as (ShiftRow & {
    code: string;
    allowed_late_minutes: number;
    overtime_threshold_minutes: number;
    attendance_radius_meters: number;
    recurring_weekdays: number[] | null;
    is_template: boolean;
  }) | null;

  if (!existing) throw new AppError("Không tìm thấy ca làm cần sửa.", 404);

  const branchId = await resolveDefaultBranch(supabase, restaurantId, input.branchId);
  const nextShift: ShiftRow = {
    id: existing.id,
    branch_id: branchId,
    name: input.name,
    start_time: normalizeShiftTime(input.startTime),
    end_time: normalizeShiftTime(input.endTime)
  };

  await assertShiftTemplateUpdateSafe({
    supabase,
    restaurantId,
    shiftId: existing.id,
    nextShift
  });

  const updateResult = await supabase
    .from("shifts")
    .update({
      branch_id: branchId,
      name: input.name,
      start_time: nextShift.start_time,
      end_time: nextShift.end_time,
      allowed_late_minutes: input.allowedLateMinutes,
      overtime_threshold_minutes: input.overtimeThresholdMinutes,
      attendance_radius_meters: input.attendanceRadiusMeters,
      recurring_weekdays: input.recurringWeekdays
    })
    .eq("restaurant_id", restaurantId)
    .eq("id", existing.id)
    .select("id,branch_id,code,name,start_time,end_time,allowed_late_minutes,overtime_threshold_minutes,attendance_radius_meters,recurring_weekdays,is_template")
    .single();

  if (updateResult.error) throw updateResult.error;

  await insertShiftActivity({
    supabase,
    restaurantId,
    actorUserId,
    branchId,
    entityId: existing.id,
    action: "shifts.template_updated",
    beforeState: existing,
    afterState: updateResult.data,
    reason: "Sửa ca từ lịch vận hành nhân sự"
  });

  return updateResult.data;
}

export async function cancelStaffShiftAssignment({
  restaurantId,
  actorUserId,
  input
}: {
  restaurantId: string;
  actorUserId: string;
  input: StaffShiftAssignmentCancelInput;
}) {
  await assertStaffShiftScheduling(restaurantId);
  const supabase = createAdminSupabaseClient() as any;

  const assignmentResult = await supabase
    .from("shift_assignments")
    .select("id,shift_id,branch_id,staff_member_id,scheduled_date,status,source,note")
    .eq("restaurant_id", restaurantId)
    .eq("id", input.shiftAssignmentId)
    .maybeSingle();

  if (assignmentResult.error) throw assignmentResult.error;
  const assignment = assignmentResult.data as ShiftAssignmentDetailRow | null;

  if (!assignment) throw new AppError("Không tìm thấy ca làm cần huỷ.", 404);
  if (assignment.status === "cancelled") throw new AppError("Ca làm này đã được huỷ trước đó.", 409);
  if (assignment.status === "completed") throw new AppError("Không thể huỷ ca đã hoàn thành.", 409);

  const updatedResult = await supabase
    .from("shift_assignments")
    .update({
      status: "cancelled",
      note: input.note || assignment.note || null
    })
    .eq("restaurant_id", restaurantId)
    .eq("id", assignment.id)
    .select("id,shift_id,branch_id,staff_member_id,scheduled_date,status,source,note")
    .single();

  if (updatedResult.error) throw updatedResult.error;
  const updatedAssignment = updatedResult.data as ShiftAssignmentDetailRow;

  await insertShiftActivity({
    supabase,
    restaurantId,
    actorUserId,
    branchId: assignment.branch_id,
    entityId: assignment.id,
    action: "shifts.assignment_cancelled",
    beforeState: assignment,
    afterState: updatedAssignment,
    reason: input.note || "Huỷ ca từ lịch vận hành nhân sự"
  });

  const [staffResult, shiftResult] = await Promise.all([
    supabase
      .from("staff_members")
      .select("user_id,full_name")
      .eq("restaurant_id", restaurantId)
      .eq("id", assignment.staff_member_id)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select("name")
      .eq("restaurant_id", restaurantId)
      .eq("id", assignment.shift_id)
      .maybeSingle()
  ]);

  if (staffResult.error) throw staffResult.error;
  if (shiftResult.error) throw shiftResult.error;

  const staff = staffResult.data as { user_id: string | null; full_name: string | null } | null;
  const shift = shiftResult.data as { name: string | null } | null;

  if (staff?.user_id) {
    const notificationResult = await supabase.from("notifications").insert({
      restaurant_id: restaurantId,
      user_id: staff.user_id,
      type: "shift_cancelled",
      title: "Ca làm đã được huỷ",
      body: `${shift?.name ?? "Ca làm"} ngày ${assignment.scheduled_date}`,
      action_url: "/dashboard/staff/mobile",
      status: "unread",
      payload: {
        shiftAssignmentId: assignment.id,
        shiftId: assignment.shift_id,
        scheduledDate: assignment.scheduled_date
      }
    });

    if (notificationResult.error) {
      console.error("[shift-service] failed to create shift cancellation notification", {
        restaurantId,
        staffMemberId: assignment.staff_member_id,
        error: notificationResult.error.message
      });
    }
  }

  return updatedAssignment;
}

export async function updateStaffShiftAssignment({
  restaurantId,
  actorUserId,
  input
}: {
  restaurantId: string;
  actorUserId: string;
  input: StaffShiftAssignmentUpdateInput;
}) {
  await assertStaffShiftScheduling(restaurantId);
  const supabase = createAdminSupabaseClient() as any;

  const [assignmentResult, shiftResult] = await Promise.all([
    supabase
      .from("shift_assignments")
      .select("id,shift_id,branch_id,staff_member_id,scheduled_date,status,source,note")
      .eq("restaurant_id", restaurantId)
      .eq("id", input.shiftAssignmentId)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select("id,branch_id,name,start_time,end_time")
      .eq("restaurant_id", restaurantId)
      .eq("id", input.shiftId)
      .maybeSingle()
  ]);

  if (assignmentResult.error) throw assignmentResult.error;
  if (shiftResult.error) throw shiftResult.error;

  const assignment = assignmentResult.data as ShiftAssignmentDetailRow | null;
  const shift = shiftResult.data as ShiftRow | null;
  if (!assignment) throw new AppError("Không tìm thấy ca phân công cần sửa.", 404);
  if (!shift) throw new AppError("Không tìm thấy mẫu ca mới.", 404);
  if (assignment.status === "cancelled") throw new AppError("Không thể sửa ca đã huỷ.", 409);
  if (assignment.status === "completed") throw new AppError("Không thể sửa ca đã hoàn thành.", 409);

  const staff = await readAssignableStaff(supabase, restaurantId, input.staffMemberId);
  await assertNoShiftAssignmentOverlap({
    supabase,
    restaurantId,
    staffMemberId: staff.id,
    shift,
    scheduledDate: input.scheduledDate,
    excludeAssignmentId: assignment.id
  });

  const branchId = shift.branch_id ?? (await resolveDefaultBranch(supabase, restaurantId, "")) ?? null;
  const updateResult = await supabase
    .from("shift_assignments")
    .update({
      shift_id: shift.id,
      branch_id: branchId,
      staff_member_id: staff.id,
      scheduled_date: input.scheduledDate,
      source: assignment.source === "swap" ? "swap" : "manual",
      note: input.note || assignment.note || null
    })
    .eq("restaurant_id", restaurantId)
    .eq("id", assignment.id)
    .select("id,shift_id,branch_id,staff_member_id,scheduled_date,status,source,note")
    .single();

  if (updateResult.error) {
    if (isShiftAssignmentOverlapError(updateResult.error)) {
      throw new AppError("Ca mới bị trùng giờ với một ca đã xếp. Vui lòng chọn ca hoặc ngày khác.", 409);
    }
    throw updateResult.error;
  }
  const updatedAssignment = updateResult.data as ShiftAssignmentDetailRow;

  await insertShiftActivity({
    supabase,
    restaurantId,
    actorUserId,
    branchId,
    entityId: assignment.id,
    action: "shifts.assignment_updated",
    beforeState: assignment,
    afterState: updatedAssignment,
    reason: input.note || "Sửa phân ca từ lịch vận hành nhân sự"
  });

  if (staff.user_id) {
    const notificationResult = await supabase.from("notifications").insert({
      restaurant_id: restaurantId,
      user_id: staff.user_id,
      type: "shift_updated",
      title: "Ca làm của bạn vừa được cập nhật",
      body: `${shift.name} ngày ${input.scheduledDate}`,
      action_url: "/dashboard/staff/mobile",
      status: "unread",
      payload: {
        shiftAssignmentId: assignment.id,
        shiftId: shift.id,
        scheduledDate: input.scheduledDate,
        branchId
      }
    });

    if (notificationResult.error) {
      console.error("[shift-service] failed to create shift update notification", {
        restaurantId,
        staffMemberId: staff.id,
        error: notificationResult.error.message
      });
    }
  }

  return updatedAssignment;
}

export async function assignStaffShift({
  restaurantId,
  actorUserId,
  input
}: {
  restaurantId: string;
  actorUserId: string;
  input: StaffShiftAssignmentInput;
}) {
  await assertStaffShiftScheduling(restaurantId);
  const supabase = createAdminSupabaseClient() as any;

  const [shiftResult] = await Promise.all([
    supabase
      .from("shifts")
      .select("id,branch_id,name,start_time,end_time")
      .eq("restaurant_id", restaurantId)
      .eq("id", input.shiftId)
      .maybeSingle()
  ]);

  if (shiftResult.error) throw shiftResult.error;

  const shift = shiftResult.data as ShiftRow | null;
  if (!shift) throw new AppError("Không tìm thấy ca làm.", 404);

  const staff = await readAssignableStaff(supabase, restaurantId, input.staffMemberId);
  await assertNoShiftAssignmentOverlap({
    supabase,
    restaurantId,
    staffMemberId: staff.id,
    shift,
    scheduledDate: input.scheduledDate
  });

  const branchId =
    shift.branch_id ??
    (await resolveDefaultBranch(supabase, restaurantId, "")) ??
    null;

  const result = await supabase
    .from("shift_assignments")
    .insert({
      restaurant_id: restaurantId,
      shift_id: shift.id,
      branch_id: branchId,
      staff_member_id: staff.id,
      scheduled_date: input.scheduledDate,
      status: "scheduled",
      source: "manual",
      note: input.note || null,
      created_by: actorUserId
    })
    .select("id,shift_id,branch_id,staff_member_id,scheduled_date,status,source,note")
    .single();

  if (result.error) {
    if (isShiftAssignmentOverlapError(result.error)) {
      throw new AppError("Ca mới bị trùng giờ với một ca đã xếp. Vui lòng chọn ca hoặc ngày khác.", 409);
    }
    throw result.error;
  }

  await insertShiftActivity({
    supabase,
    restaurantId,
    actorUserId,
    branchId,
    entityId: result.data.id,
    action: "shifts.assignment_created",
    afterState: result.data,
    reason: input.note || null
  });

  if (staff.user_id) {
    const notificationResult = await supabase.from("notifications").insert({
      restaurant_id: restaurantId,
      user_id: staff.user_id,
      type: "shift_assigned",
      title: "Bạn vừa được gán ca mới",
      body: `${shift.name} ngày ${input.scheduledDate}`,
      action_url: "/dashboard/staff/mobile",
      status: "unread",
      payload: {
        shiftAssignmentId: result.data.id,
        shiftId: shift.id,
        scheduledDate: input.scheduledDate,
        branchId
      }
    });

    if (notificationResult.error) {
      console.error("[shift-service] failed to create shift notification", {
        restaurantId,
        staffMemberId: staff.id,
        error: notificationResult.error.message
      });
    }
  }

  return result.data;
}
