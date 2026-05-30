"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { AppError } from "@/lib/response";
import {
  attendanceClockInSchema,
  attendanceClockOutSchema,
  attendanceApprovalReviewSchema,
  staffAccountStateSchema,
  staffContractCreateSchema,
  staffDeviceCreateSchema,
  staffDeviceTrustUpdateSchema,
  staffDocumentCreateSchema,
  staffInviteSchema,
  staffProfileSchema,
  staffReviewCreateSchema,
  staffRoleCloneSchema,
  staffRolePermissionUpdateSchema,
  staffRoleSchema,
  staffSessionForceLogoutSchema,
  staffShiftAssignmentCancelSchema,
  staffShiftAssignmentSchema,
  staffShiftTemplateSchema,
  staffUserSchema
} from "@/lib/validators";
import { clockInStaffAttendance, clockOutStaffAttendance, reviewAttendanceApproval } from "@/features/attendance/services/attendance-service";
import { cloneStaffRole, updateStaffRolePermissions } from "@/features/roles/services/role-service";
import { assignStaffShift, cancelStaffShiftAssignment, createStaffShiftTemplate } from "@/features/shifts/services/shift-service";
import {
  createStaffContract,
  createStaffDevice,
  createStaffDocument,
  createStaffReview
} from "@/features/staff/services/staff-admin-workflow-service";
import { updateStaffDeviceAttendanceTrust } from "@/features/staff/services/staff-device-trust-service";
import { forceStaffSessionLogout } from "@/features/staff/services/staff-session-service";
import { assertStaffActionPermission } from "@/services/staff-permission-service";
import {
  createRestaurantUser,
  setRestaurantUserAccountState,
  updateRestaurantUserOperationsProfile,
  updateRestaurantUserRole
} from "@/services/restaurant-service";
import { assertRestaurantResourceLimit } from "@/services/subscription-service";
import { requireOperationalAdminSession } from "./shared";

export type StaffActionState = {
  error?: string;
  success?: string;
  staffUserId?: string;
};

function staffActionError(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => issue.message)
      .filter(Boolean)
      .join(" ") || "Dữ liệu nhân sự không hợp lệ. Vui lòng kiểm tra lại form.";
  }
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  return "Không thể xử lý nhân sự lúc này.";
}

function slugForInternalStaffEmail(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return normalized || "nhan-vien";
}

function createInternalStaffEmail({ restaurantId, fullName }: { restaurantId: string; fullName: string }) {
  const restaurantToken = restaurantId.replace(/-/g, "").slice(0, 10);
  const staffToken = slugForInternalStaffEmail(fullName);
  const suffix = Date.now().toString(36);
  return `${staffToken}.${restaurantToken}.${suffix}@staff.logivn.vn`;
}

function createTemporaryStaffPassword() {
  return `LogiVN-${randomBytes(12).toString("base64url")}9aA`;
}

export async function createStaffAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffInviteSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
      pin: formData.get("pin"),
      fullName: formData.get("fullName"),
      phone: formData.get("phone"),
      roleCode: formData.get("roleCode") || "waiter",
      branchId: formData.get("branchId"),
      notes: formData.get("notes")
    });
    await assertStaffActionPermission(session, "staff.create");

    await assertRestaurantResourceLimit({
      restaurantId: session.restaurantId,
      featureKey: "staff_management",
      table: "users",
      label: "tài khoản nhân sự"
    });

    const createdUser = await createRestaurantUser({
      restaurantId: session.restaurantId,
      email: parsed.email ?? createInternalStaffEmail({ restaurantId: session.restaurantId, fullName: parsed.fullName }),
      password: parsed.password ?? createTemporaryStaffPassword(),
      roleCode: parsed.roleCode,
      fullName: parsed.fullName,
      pin: parsed.pin || undefined,
      phone: parsed.phone || undefined,
      branchId: parsed.branchId || undefined,
      notes: parsed.notes || undefined
    });

    revalidatePath("/dashboard/staff");
    return { success: "Đã tạo hồ sơ nhân sự.", staffUserId: createdUser?.id };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function updateStaffProfileAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffProfileSchema.parse({
      userId: formData.get("userId"),
      fullName: formData.get("fullName"),
      phone: formData.get("phone"),
      username: formData.get("username"),
      pin: formData.get("pin"),
      roleCode: formData.get("roleCode"),
      branchId: formData.get("branchId"),
      employmentStatus: formData.get("employmentStatus") || "active",
      emergencyContactName: formData.get("emergencyContactName"),
      emergencyContactPhone: formData.get("emergencyContactPhone"),
      notes: formData.get("notes")
    });
    await assertStaffActionPermission(session, "staff.edit");

    await updateRestaurantUserOperationsProfile({
      restaurantId: session.restaurantId,
      userId: parsed.userId,
      actorUserId: session.userId,
      fullName: parsed.fullName,
      phone: parsed.phone || undefined,
      username: parsed.username || undefined,
      pin: parsed.pin || undefined,
      roleCode: parsed.roleCode,
      branchId: parsed.branchId || undefined,
      employmentStatus: parsed.employmentStatus,
      emergencyContactName: parsed.emergencyContactName || undefined,
      emergencyContactPhone: parsed.emergencyContactPhone || undefined,
      notes: parsed.notes || undefined
    });

    revalidatePath("/dashboard/staff");
    return { success: "Đã cập nhật hồ sơ và quyền nhân sự." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function setStaffAccountStateAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffAccountStateSchema.parse({
      userId: formData.get("userId"),
      nextState: formData.get("nextState"),
      reason: formData.get("reason")
    });
    await assertStaffActionPermission(
      session,
      parsed.nextState === "archived" ? "staff.archive" : parsed.nextState === "suspended" ? "staff.suspend" : "staff.edit"
    );

    await setRestaurantUserAccountState({
      restaurantId: session.restaurantId,
      userId: parsed.userId,
      actorUserId: session.userId,
      nextState: parsed.nextState,
      reason: parsed.reason || undefined
    });

    revalidatePath("/dashboard/staff");
    return {
      success:
        parsed.nextState === "active"
          ? "Đã khôi phục tài khoản nhân sự."
          : parsed.nextState === "suspended"
            ? "Đã tạm khoá tài khoản nhân sự."
            : "Đã lưu trữ tài khoản nhân sự."
    };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function updateStaffRoleAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffRoleSchema.parse({
      userId: formData.get("userId"),
      permissionProfile: formData.get("permissionProfile")
    });
    await assertStaffActionPermission(session, "staff.roles");

    await updateRestaurantUserRole({
      restaurantId: session.restaurantId,
      userId: parsed.userId,
      actorUserId: session.userId,
      permissionProfile: parsed.permissionProfile
    });

    revalidatePath("/dashboard/staff");
    return { success: "Đã cập nhật vai trò cũ." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function updateStaffRolePermissionsAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffRolePermissionUpdateSchema.parse({
      roleId: formData.get("roleId"),
      permissions: formData.getAll("permissions")
    });
    await assertStaffActionPermission(session, "staff.roles");

    await updateStaffRolePermissions({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      input: parsed
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/staff/mobile");
    return { success: "Đã cập nhật ma trận quyền cho vai trò." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function cloneStaffRoleAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffRoleCloneSchema.parse({
      sourceRoleId: formData.get("sourceRoleId"),
      name: formData.get("name"),
      description: formData.get("description")
    });
    await assertStaffActionPermission(session, "staff.roles");

    await cloneStaffRole({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      input: parsed
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/staff/mobile");
    return { success: "Đã clone vai trò mới. Bạn có thể chỉnh quyền và gán cho nhân sự." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function deleteStaffAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffUserSchema.parse({
      userId: formData.get("userId")
    });
    await assertStaffActionPermission(session, "staff.archive");

    await setRestaurantUserAccountState({
      restaurantId: session.restaurantId,
      userId: parsed.userId,
      actorUserId: session.userId,
      nextState: "archived",
      reason: "Lưu trữ từ màn hình vận hành nhân sự"
    });

    revalidatePath("/dashboard/staff");
    return { success: "Đã lưu trữ nhân sự." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function createStaffShiftTemplateAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffShiftTemplateSchema.parse({
      name: formData.get("name"),
      branchId: formData.get("branchId"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      allowedLateMinutes: formData.get("allowedLateMinutes") || 10,
      overtimeThresholdMinutes: formData.get("overtimeThresholdMinutes") || 30,
      attendanceRadiusMeters: formData.get("attendanceRadiusMeters") || 80,
      recurringWeekdays: formData.get("recurringWeekdays")
    });
    await assertStaffActionPermission(session, "shifts.manage");

    await createStaffShiftTemplate({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      input: parsed
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/staff/mobile");
    return { success: "Đã tạo mẫu ca làm." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function assignStaffShiftAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffShiftAssignmentSchema.parse({
      staffMemberId: formData.get("staffMemberId"),
      shiftId: formData.get("shiftId"),
      scheduledDate: formData.get("scheduledDate"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, "shifts.assign");

    await assignStaffShift({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      input: parsed
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/staff/mobile");
    return { success: "Đã gán ca cho nhân sự." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function cancelStaffShiftAssignmentAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffShiftAssignmentCancelSchema.parse({
      shiftAssignmentId: formData.get("shiftAssignmentId"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, ["shifts.assign", "shifts.manage"], { mode: "any" });

    await cancelStaffShiftAssignment({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      input: parsed
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/staff/mobile");
    return { success: "Đã huỷ ca làm và ghi nhật ký vận hành." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function manualClockInStaffAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = attendanceClockInSchema.parse({
      staffMemberId: formData.get("staffMemberId"),
      branchId: formData.get("branchId"),
      shiftAssignmentId: formData.get("shiftAssignmentId"),
      source: "manual",
      capturedAt: new Date().toISOString(),
      note: formData.get("note") || "Chấm công thủ công từ dashboard nhân sự",
      deviceInfo: {
        mode: "dashboard_staff_manual",
        actorUserId: session.userId
      }
    });
    await assertStaffActionPermission(session, "attendance.edit");

    await clockInStaffAttendance({
      session,
      input: parsed
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/staff/mobile");
    return { success: "Đã chấm công thủ công và ghi audit log." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function manualClockOutStaffAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = attendanceClockOutSchema.parse({
      attendanceLogId: formData.get("attendanceLogId"),
      staffMemberId: formData.get("staffMemberId"),
      branchId: formData.get("branchId"),
      source: "manual",
      capturedAt: new Date().toISOString(),
      note: formData.get("note") || "Kết ca thủ công từ dashboard nhân sự",
      deviceInfo: {
        mode: "dashboard_staff_manual",
        actorUserId: session.userId
      }
    });
    await assertStaffActionPermission(session, "attendance.edit");

    await clockOutStaffAttendance({
      session,
      input: parsed
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/staff/mobile");
    return { success: "Đã kết ca thủ công và cập nhật công." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function createStaffReviewAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffReviewCreateSchema.parse({
      staffMemberId: formData.get("staffMemberId"),
      periodLabel: formData.get("periodLabel"),
      score: formData.get("score"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, "staff.edit");

    await createStaffReview({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      input: parsed
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/staff/mobile");
    return { success: "Đã lưu đánh giá nhân sự." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function createStaffContractAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffContractCreateSchema.parse({
      staffMemberId: formData.get("staffMemberId"),
      contractType: formData.get("contractType") || undefined,
      templateCode: formData.get("templateCode"),
      contractNumber: formData.get("contractNumber"),
      jobTitle: formData.get("jobTitle"),
      workLocation: formData.get("workLocation"),
      salaryAmount: formData.get("salaryAmount"),
      salaryPaymentMethod: formData.get("salaryPaymentMethod"),
      workingTime: formData.get("workingTime"),
      restTime: formData.get("restTime"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      eSignatureStatus: formData.get("eSignatureStatus"),
      eContractProvider: formData.get("eContractProvider"),
      eContractId: formData.get("eContractId"),
      signedDocumentUrl: formData.get("signedDocumentUrl"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, "staff.edit");

    await createStaffContract({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      input: parsed
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/staff/mobile");
    return { success: "Đã tạo hồ sơ hợp đồng." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function createStaffDocumentAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffDocumentCreateSchema.parse({
      staffMemberId: formData.get("staffMemberId"),
      documentName: formData.get("documentName"),
      documentType: formData.get("documentType"),
      fileUrl: formData.get("fileUrl"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, "staff.edit");

    await createStaffDocument({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      input: parsed
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/staff/mobile");
    return { success: "Đã thêm tài liệu nhân sự." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function createStaffDeviceAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffDeviceCreateSchema.parse({
      staffMemberId: formData.get("staffMemberId"),
      deviceName: formData.get("deviceName"),
      deviceType: formData.get("deviceType"),
      serialNumber: formData.get("serialNumber"),
      deviceFingerprint: formData.get("deviceFingerprint"),
      trustedForAttendance: formData.get("trustedForAttendance") === "true",
      issuedAt: formData.get("issuedAt"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, "staff.edit");

    await createStaffDevice({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      input: parsed
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/staff/mobile");
    return { success: "Đã cấp thiết bị cho nhân sự." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function updateStaffDeviceTrustAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffDeviceTrustUpdateSchema.parse({
      deviceId: formData.get("deviceId"),
      trustedForAttendance: formData.get("trustedForAttendance") === "true",
      reason: formData.get("reason")
    });
    await assertStaffActionPermission(session, "staff.edit");

    await updateStaffDeviceAttendanceTrust({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      input: parsed
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/staff/mobile");
    return { success: parsed.trustedForAttendance ? "Đã duyệt thiết bị chấm công." : "Đã bỏ tin cậy thiết bị chấm công." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function reviewAttendanceApprovalAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const approvalId = z.string().uuid("Yêu cầu duyệt không hợp lệ.").parse(formData.get("approvalId"));
    const parsed = attendanceApprovalReviewSchema.parse({
      decision: formData.get("decision"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, ["attendance.approve", "approvals.review"], { mode: "any" });

    await reviewAttendanceApproval({
      session,
      approvalId,
      input: parsed
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/staff/mobile");
    return { success: parsed.decision === "approved" ? "Đã duyệt yêu cầu nhân sự." : "Đã từ chối yêu cầu nhân sự." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function forceStaffSessionsLogoutAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffSessionForceLogoutSchema.parse({
      staffMemberId: formData.get("staffMemberId"),
      sessionId: formData.get("sessionId"),
      reason: formData.get("reason")
    });
    await assertStaffActionPermission(session, "staff.suspend");

    const result = await forceStaffSessionLogout({
      restaurantId: session.restaurantId,
      restaurantSlug: session.restaurant.slug,
      actorUserId: session.userId,
      input: parsed
    });

    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/staff/mobile");
    return { success: `Đã buộc đăng xuất ${result.affectedSessions} phiên nhân sự.` };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}
