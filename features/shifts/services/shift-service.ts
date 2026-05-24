import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ensureDefaultStoreBranch } from "@/services/branch-service";
import { getRestaurantEntitlement } from "@/services/subscription-service";
import type { z } from "zod";
import type { staffShiftAssignmentCancelSchema, staffShiftAssignmentSchema, staffShiftTemplateSchema } from "@/lib/validators";

type StaffShiftTemplateInput = z.infer<typeof staffShiftTemplateSchema>;
type StaffShiftAssignmentInput = z.infer<typeof staffShiftAssignmentSchema>;
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

  const [staffResult, shiftResult, existingAssignmentsResult] = await Promise.all([
    supabase
      .from("staff_members")
      .select("id,user_id,full_name,restaurant_id,employment_status,archived_at")
      .eq("restaurant_id", restaurantId)
      .eq("id", input.staffMemberId)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select("id,branch_id,name,start_time,end_time")
      .eq("restaurant_id", restaurantId)
      .eq("id", input.shiftId)
      .maybeSingle(),
    supabase
      .from("shift_assignments")
      .select("id,shift_id,scheduled_date,status")
      .eq("restaurant_id", restaurantId)
      .eq("staff_member_id", input.staffMemberId)
      .gte("scheduled_date", addDays(input.scheduledDate, -1))
      .lte("scheduled_date", addDays(input.scheduledDate, 1))
      .neq("status", "cancelled")
  ]);

  if (staffResult.error) throw staffResult.error;
  if (shiftResult.error) throw shiftResult.error;
  if (existingAssignmentsResult.error) throw existingAssignmentsResult.error;

  const staff = staffResult.data as { user_id: string; employment_status: string; archived_at: string | null } | null;
  const shift = shiftResult.data as ShiftRow | null;
  const existingAssignments = (existingAssignmentsResult.data ?? []) as ShiftAssignmentRow[];

  if (!staff || staff.archived_at || staff.employment_status !== "active") {
    throw new AppError("Nhân sự không khả dụng để phân ca.", 404);
  }
  if (!shift) throw new AppError("Không tìm thấy ca làm.", 404);

  if (existingAssignments.some((assignment) => assignment.shift_id === shift.id && assignment.scheduled_date === input.scheduledDate)) {
    throw new AppError("Nhân sự đã được gán ca này trong ngày đã chọn.", 409);
  }

  const existingShiftIds = [...new Set(existingAssignments.map((assignment) => assignment.shift_id))];
  if (existingShiftIds.length > 0) {
    const existingShiftsResult = await supabase
      .from("shifts")
      .select("id,name,start_time,end_time")
      .in("id", existingShiftIds);

    if (existingShiftsResult.error) throw existingShiftsResult.error;

    const existingShiftById = new Map(((existingShiftsResult.data ?? []) as ShiftRow[]).map((item) => [item.id, item]));
    const overlappedAssignment = existingAssignments.find((assignment) => {
      const existingShift = existingShiftById.get(assignment.shift_id);
      return existingShift ? shiftsOverlap(shift, input.scheduledDate, existingShift, assignment.scheduled_date) : false;
    });

    if (overlappedAssignment) {
      const overlappedShift = existingShiftById.get(overlappedAssignment.shift_id);
      throw new AppError(`Ca mới bị trùng giờ với ${overlappedShift?.name ?? "ca đã xếp"}.`, 409);
    }
  }

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
      staff_member_id: input.staffMemberId,
      scheduled_date: input.scheduledDate,
      status: "scheduled",
      source: "manual",
      note: input.note || null,
      created_by: actorUserId
    })
    .select("id,shift_id,branch_id,staff_member_id,scheduled_date,status,source,note")
    .single();

  if (result.error) throw result.error;

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
      staffMemberId: input.staffMemberId,
      error: notificationResult.error.message
    });
  }

  return result.data;
}
