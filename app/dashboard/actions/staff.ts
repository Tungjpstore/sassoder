"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { AppError } from "@/lib/response";
import {
  attendanceClockInSchema,
  attendanceClockOutSchema,
  attendanceManualAdjustmentSchema,
  attendanceApprovalReviewSchema,
  staffAccountStateSchema,
  staffAppPasswordBulkResetSchema,
  staffAppPasswordResetSchema,
  staffContractCreateSchema,
  staffDeviceCreateSchema,
  staffDeviceTrustUpdateSchema,
  staffDocumentCreateSchema,
  staffInviteSchema,
  staffIncidentStatusUpdateSchema,
  staffProfileSchema,
  staffReviewCreateSchema,
  staffRoleCloneSchema,
  staffRolePermissionUpdateSchema,
  staffRoleSchema,
  staffSessionForceLogoutSchema,
  staffShiftAssignmentCancelSchema,
  staffShiftAssignmentSchema,
  staffShiftAssignmentUpdateSchema,
  staffShiftTemplateSchema,
  staffShiftTemplateUpdateSchema,
  staffUserSchema
} from "@/lib/validators";
import {
  adjustStaffAttendanceLog,
  authorizeAttendanceManagementSession,
  clockInStaffAttendance,
  clockOutStaffAttendance,
  reviewAttendanceApproval
} from "@/features/attendance/services/attendance-service";
import { cloneStaffRole, updateStaffRolePermissions } from "@/features/roles/services/role-service";
import {
  assignStaffShift,
  cancelStaffShiftAssignment,
  createStaffShiftTemplate,
  updateStaffShiftAssignment,
  updateStaffShiftTemplate
} from "@/features/shifts/services/shift-service";
import {
  createStaffContract,
  createStaffDevice,
  createStaffDocument,
  createStaffReview
} from "@/features/staff/services/staff-admin-workflow-service";
import { updateStaffDeviceAttendanceTrust } from "@/features/staff/services/staff-device-trust-service";
import { forceStaffSessionLogout } from "@/features/staff/services/staff-session-service";
import { updateStaffIncidentReportStatus } from "@/features/staff/services/staff-self-service";
import { createTemporaryStaffAppPassword, resetStaffAppPassword } from "@/features/staff/services/staff-app-auth-service";
import { invalidateStaffOperationsBundleCache } from "@/lib/staff-operations-cache";
import { assertStaffActionPermission, assertCanAssignStaffRole } from "@/services/staff-permission-service";
import {
  createRestaurantUser,
  setRestaurantUserAccountState,
  updateRestaurantUserOperationsProfile,
  updateRestaurantUserRole
} from "@/services/restaurant-service";
import { assertRestaurantResourceLimit } from "@/services/subscription-service";
import { createStaffOperationKey, runStaffOperation } from "@/services/staff-operation-integrity-service";
import { requireOperationalStaffSession } from "./shared";

export type StaffActionState = {
  error?: string;
  success?: string;
  staffUserId?: string;
  employeeCode?: string | null;
  temporaryPassword?: string | null;
  temporaryCredentials?: Array<{
    userId: string;
    staffName: string;
    employeeCode: string;
    temporaryPassword: string;
  }>;
};

function staffActionError(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => issue.message === "Invalid input" ? "Dữ liệu nhân viên chưa hợp lệ. Vui lòng kiểm tra các trường bắt buộc." : issue.message)
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

function merchantAttendanceSession(session: Awaited<ReturnType<typeof requireOperationalStaffSession>>) {
  return authorizeAttendanceManagementSession(session);
}


async function revalidateStaffDashboards(restaurantId: string) {
  await invalidateStaffOperationsBundleCache(restaurantId);
  revalidatePath("/dashboard/staff");
  revalidatePath("/dashboard/staff/mobile");
}

function staffOperationInput({
  formData,
  session,
  operationType,
  requestPayload,
  targetStaffMemberId,
  targetUserId
}: {
  formData: FormData;
  session: Awaited<ReturnType<typeof requireOperationalStaffSession>>;
  operationType: string;
  requestPayload: unknown;
  targetStaffMemberId?: string | null;
  targetUserId?: string | null;
}) {
  return {
    restaurantId: session.restaurantId,
    actorUserId: session.userId,
    operationType,
    operationKey: createStaffOperationKey({
      formData,
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      operationType,
      requestPayload
    }),
    requestPayload,
    targetStaffMemberId,
    targetUserId
  };
}

function scrubStaffPasswordResult(result: StaffActionState) {
  return {
    ...result,
    temporaryPassword: null,
    temporaryCredentials: undefined
  };
}

export async function createStaffAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffInviteSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
      pin: formData.get("pin"),
      fullName: formData.get("fullName"),
      dateOfBirth: formData.get("dateOfBirth"),
      hometown: formData.get("hometown"),
      phone: formData.get("phone"),
      roleCode: formData.get("roleCode") || "waiter",
      branchId: formData.get("branchId"),
      notes: formData.get("notes")
    });
    await assertStaffActionPermission(session, "staff.create");
    await assertCanAssignStaffRole(session, parsed.roleCode);

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.create",
        requestPayload: { ...parsed, password: parsed.password ? "provided" : "generated" }
      }),
      async () => {
        await assertRestaurantResourceLimit({
          restaurantId: session.restaurantId,
          featureKey: "staff_management",
          table: "users",
          label: "tài khoản nhân sự"
        });

        const temporaryPassword = parsed.password ?? createTemporaryStaffAppPassword();
        const createdUser = await createRestaurantUser({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          email: parsed.email ?? createInternalStaffEmail({ restaurantId: session.restaurantId, fullName: parsed.fullName }),
          password: temporaryPassword,
          roleCode: parsed.roleCode,
          fullName: parsed.fullName,
          pin: parsed.pin || undefined,
          phone: parsed.phone,
          dateOfBirth: parsed.dateOfBirth,
          hometown: parsed.hometown,
          mustChangeAppPassword: true,
          branchId: parsed.branchId || undefined,
          notes: parsed.notes || undefined
        });

        return {
          success: "Đã tạo nhân viên và mật khẩu app lần đầu.",
          staffUserId: createdUser?.id,
          employeeCode: createdUser?.employeeCode ?? null,
          temporaryPassword
        };
      },
      { persistResult: scrubStaffPasswordResult }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function updateStaffProfileAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffProfileSchema.parse({
      userId: formData.get("userId"),
      fullName: formData.get("fullName"),
      phone: formData.get("phone"),
      dateOfBirth: formData.get("dateOfBirth"),
      hometown: formData.get("hometown"),
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
    await assertCanAssignStaffRole(session, parsed.roleCode);

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.profile.update",
        requestPayload: { ...parsed, pin: parsed.pin ? "provided" : null },
        targetUserId: parsed.userId
      }),
      async () => {
        await updateRestaurantUserOperationsProfile({
          restaurantId: session.restaurantId,
          userId: parsed.userId,
          actorUserId: session.userId,
          fullName: parsed.fullName,
          phone: parsed.phone || undefined,
          dateOfBirth: parsed.dateOfBirth || undefined,
          hometown: parsed.hometown || undefined,
          username: parsed.username || undefined,
          pin: parsed.pin || undefined,
          roleCode: parsed.roleCode,
          branchId: parsed.branchId || undefined,
          employmentStatus: parsed.employmentStatus,
          emergencyContactName: parsed.emergencyContactName || undefined,
          emergencyContactPhone: parsed.emergencyContactPhone || undefined,
          notes: parsed.notes || undefined
        });

        return { success: "Đã cập nhật hồ sơ và quyền nhân sự." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function resetStaffAppPasswordAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffAppPasswordResetSchema.parse({
      userId: formData.get("userId"),
      reason: formData.get("reason")
    });
    await assertStaffActionPermission(session, "staff.edit");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.password.reset",
        requestPayload: parsed,
        targetUserId: parsed.userId
      }),
      async () => {
        const reset = await resetStaffAppPassword({
          restaurantId: session.restaurantId,
          userId: parsed.userId,
          actorUserId: session.userId,
          reason: parsed.reason || undefined
        });

        return {
          success: `Đã đặt lại mật khẩu app cho ${reset.staffName}.`,
          employeeCode: reset.employeeCode,
          temporaryPassword: reset.temporaryPassword
        };
      },
      { persistResult: scrubStaffPasswordResult }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function resetStaffAppPasswordsAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffAppPasswordBulkResetSchema.parse({
      userIds: formData.get("userIds"),
      reason: formData.get("reason")
    });
    await assertStaffActionPermission(session, "staff.edit");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.password.bulk_reset",
        requestPayload: parsed
      }),
      async () => {
        const credentials: NonNullable<StaffActionState["temporaryCredentials"]> = [];
        for (const userId of parsed.userIds) {
          const reset = await resetStaffAppPassword({
            restaurantId: session.restaurantId,
            userId,
            actorUserId: session.userId,
            reason: parsed.reason || "Chủ quán cấp lại mật khẩu app hàng loạt"
          });
          credentials.push({
            userId,
            staffName: reset.staffName,
            employeeCode: reset.employeeCode,
            temporaryPassword: reset.temporaryPassword
          });
        }

        return {
          success: `Đã cấp lại mật khẩu app cho ${credentials.length} nhân viên.`,
          temporaryCredentials: credentials
        };
      },
      { persistResult: scrubStaffPasswordResult }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function setStaffAccountStateAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffAccountStateSchema.parse({
      userId: formData.get("userId"),
      nextState: formData.get("nextState"),
      reason: formData.get("reason")
    });
    await assertStaffActionPermission(
      session,
      parsed.nextState === "archived" ? "staff.archive" : parsed.nextState === "suspended" ? "staff.suspend" : "staff.edit"
    );

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.account_state.set",
        requestPayload: parsed,
        targetUserId: parsed.userId
      }),
      async () => {
        await setRestaurantUserAccountState({
          restaurantId: session.restaurantId,
          userId: parsed.userId,
          actorUserId: session.userId,
          nextState: parsed.nextState,
          reason: parsed.reason || undefined
        });

        return {
          success:
            parsed.nextState === "active"
              ? "Đã khôi phục tài khoản nhân sự."
              : parsed.nextState === "suspended"
                ? "Đã tạm khoá tài khoản nhân sự."
                : "Đã lưu trữ tài khoản nhân sự."
        };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function updateStaffRoleAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffRoleSchema.parse({
      userId: formData.get("userId"),
      permissionProfile: formData.get("permissionProfile")
    });
    await assertStaffActionPermission(session, "staff.roles");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.role.update",
        requestPayload: parsed,
        targetUserId: parsed.userId
      }),
      async () => {
        await updateRestaurantUserRole({
          restaurantId: session.restaurantId,
          userId: parsed.userId,
          actorUserId: session.userId,
          permissionProfile: parsed.permissionProfile
        });

        return { success: "Đã cập nhật vai trò cũ." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function updateStaffRolePermissionsAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffRolePermissionUpdateSchema.parse({
      roleId: formData.get("roleId"),
      permissions: formData.getAll("permissions")
    });
    await assertStaffActionPermission(session, "staff.roles");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.permissions.update",
        requestPayload: parsed
      }),
      async () => {
        await updateStaffRolePermissions({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          input: parsed
        });

        return { success: "Đã cập nhật ma trận quyền cho vai trò." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function cloneStaffRoleAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffRoleCloneSchema.parse({
      sourceRoleId: formData.get("sourceRoleId"),
      name: formData.get("name"),
      description: formData.get("description")
    });
    await assertStaffActionPermission(session, "staff.roles");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.role.clone",
        requestPayload: parsed
      }),
      async () => {
        await cloneStaffRole({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          input: parsed
        });

        return { success: "Đã clone vai trò mới. Bạn có thể chỉnh quyền và gán cho nhân sự." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function deleteStaffAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffUserSchema.parse({
      userId: formData.get("userId")
    });
    await assertStaffActionPermission(session, "staff.archive");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.archive",
        requestPayload: parsed,
        targetUserId: parsed.userId
      }),
      async () => {
        await setRestaurantUserAccountState({
          restaurantId: session.restaurantId,
          userId: parsed.userId,
          actorUserId: session.userId,
          nextState: "archived",
          reason: "Lưu trữ từ màn hình vận hành nhân sự"
        });

        return { success: "Đã lưu trữ nhân sự." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function createStaffShiftTemplateAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
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

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "shift.template.create",
        requestPayload: parsed
      }),
      async () => {
        await createStaffShiftTemplate({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          input: parsed
        });

        return { success: "Đã tạo mẫu ca làm." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function updateStaffShiftTemplateAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffShiftTemplateUpdateSchema.parse({
      shiftId: formData.get("shiftId"),
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

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "shift.template.update",
        requestPayload: parsed
      }),
      async () => {
        await updateStaffShiftTemplate({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          input: parsed
        });

        return { success: "Đã cập nhật ca làm và kiểm tra trùng lịch." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function assignStaffShiftAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffShiftAssignmentSchema.parse({
      staffMemberId: formData.get("staffMemberId"),
      shiftId: formData.get("shiftId"),
      scheduledDate: formData.get("scheduledDate"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, "shifts.assign");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "shift.assignment.create",
        requestPayload: parsed,
        targetStaffMemberId: parsed.staffMemberId
      }),
      async () => {
        await assignStaffShift({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          input: parsed
        });

        return { success: "Đã gán ca cho nhân sự." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function updateStaffShiftAssignmentAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffShiftAssignmentUpdateSchema.parse({
      shiftAssignmentId: formData.get("shiftAssignmentId"),
      staffMemberId: formData.get("staffMemberId"),
      shiftId: formData.get("shiftId"),
      scheduledDate: formData.get("scheduledDate"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, ["shifts.assign", "shifts.manage"], { mode: "any" });

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "shift.assignment.update",
        requestPayload: parsed,
        targetStaffMemberId: parsed.staffMemberId
      }),
      async () => {
        await updateStaffShiftAssignment({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          input: parsed
        });

        return { success: "Đã sửa phân ca và thông báo cho nhân sự." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function cancelStaffShiftAssignmentAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffShiftAssignmentCancelSchema.parse({
      shiftAssignmentId: formData.get("shiftAssignmentId"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, ["shifts.assign", "shifts.manage"], { mode: "any" });

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "shift.assignment.cancel",
        requestPayload: parsed
      }),
      async () => {
        await cancelStaffShiftAssignment({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          input: parsed
        });

        return { success: "Đã huỷ ca làm và ghi nhật ký vận hành." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function manualClockInStaffAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = attendanceClockInSchema.parse({
      staffMemberId: formData.get("staffMemberId"),
      branchId: formData.get("branchId"),
      shiftAssignmentId: formData.get("shiftAssignmentId"),
      source: "manual",
      capturedAt: new Date().toISOString(),
      note: formData.get("note"),
      deviceInfo: {
        mode: "dashboard_staff_manual",
        actorUserId: session.userId
      }
    });
    await assertStaffActionPermission(session, "attendance.edit");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "attendance.manual_clock_in",
        requestPayload: { ...parsed, capturedAt: "server_now" },
        targetStaffMemberId: parsed.staffMemberId
      }),
      async () => {
        await clockInStaffAttendance({
          session: merchantAttendanceSession(session),
          input: parsed
        });

        return { success: "Đã ghi nhận chấm công hộ và đưa vào hàng chờ đối soát." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function manualClockOutStaffAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = attendanceClockOutSchema.parse({
      attendanceLogId: formData.get("attendanceLogId"),
      staffMemberId: formData.get("staffMemberId"),
      branchId: formData.get("branchId"),
      source: "manual",
      capturedAt: new Date().toISOString(),
      note: formData.get("note"),
      deviceInfo: {
        mode: "dashboard_staff_manual",
        actorUserId: session.userId
      }
    });
    await assertStaffActionPermission(session, "attendance.edit");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "attendance.manual_clock_out",
        requestPayload: { ...parsed, capturedAt: "server_now" },
        targetStaffMemberId: parsed.staffMemberId
      }),
      async () => {
        await clockOutStaffAttendance({
          session: merchantAttendanceSession(session),
          input: parsed
        });

        return { success: "Đã ghi nhận kết ca hộ và đưa vào hàng chờ đối soát." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function adjustStaffAttendanceAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = attendanceManualAdjustmentSchema.parse({
      attendanceLogId: formData.get("attendanceLogId"),
      staffMemberId: formData.get("staffMemberId"),
      clockInAt: formData.get("clockInAt"),
      clockOutAt: formData.get("clockOutAt"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, "attendance.edit");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "attendance.adjust",
        requestPayload: parsed,
        targetStaffMemberId: parsed.staffMemberId
      }),
      async () => {
        await adjustStaffAttendanceLog({
          session: merchantAttendanceSession(session),
          input: parsed
        });

        return { success: "Đã sửa công và tạo yêu cầu đối soát trước khi tính lương." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function createStaffReviewAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffReviewCreateSchema.parse({
      staffMemberId: formData.get("staffMemberId"),
      periodLabel: formData.get("periodLabel"),
      score: formData.get("score"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, "staff.edit");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.review.create",
        requestPayload: parsed,
        targetStaffMemberId: parsed.staffMemberId
      }),
      async () => {
        await createStaffReview({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          input: parsed
        });

        return { success: "Đã lưu đánh giá nhân sự." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function createStaffContractAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
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

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.contract.create",
        requestPayload: parsed,
        targetStaffMemberId: parsed.staffMemberId
      }),
      async () => {
        await createStaffContract({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          input: parsed
        });

        return { success: "Đã tạo hồ sơ hợp đồng." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function createStaffDocumentAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffDocumentCreateSchema.parse({
      staffMemberId: formData.get("staffMemberId"),
      documentName: formData.get("documentName"),
      documentType: formData.get("documentType"),
      fileUrl: formData.get("fileUrl"),
      status: formData.get("status") || "complete",
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, "staff.edit");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.document.create",
        requestPayload: parsed,
        targetStaffMemberId: parsed.staffMemberId
      }),
      async () => {
        await createStaffDocument({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          input: parsed
        });

        return { success: "Đã thêm tài liệu nhân sự." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function createStaffDeviceAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
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

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.device.create",
        requestPayload: parsed,
        targetStaffMemberId: parsed.staffMemberId
      }),
      async () => {
        await createStaffDevice({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          input: parsed
        });

        return { success: "Đã cấp thiết bị cho nhân sự." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function updateStaffDeviceTrustAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffDeviceTrustUpdateSchema.parse({
      deviceId: formData.get("deviceId"),
      trustedForAttendance: formData.get("trustedForAttendance") === "true",
      reason: formData.get("reason")
    });
    await assertStaffActionPermission(session, "staff.edit");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.device_trust.update",
        requestPayload: parsed
      }),
      async () => {
        await updateStaffDeviceAttendanceTrust({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          input: parsed
        });

        return { success: parsed.trustedForAttendance ? "Đã duyệt thiết bị chấm công." : "Đã bỏ tin cậy thiết bị chấm công." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function reviewAttendanceApprovalAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const approvalId = z.string().uuid("Yêu cầu duyệt không hợp lệ.").parse(formData.get("approvalId"));
    const parsed = attendanceApprovalReviewSchema.parse({
      decision: formData.get("decision"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, "attendance.approve");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "attendance.approval.review",
        requestPayload: { approvalId, ...parsed }
      }),
      async () => {
        await reviewAttendanceApproval({
          session: merchantAttendanceSession(session),
          approvalId,
          input: parsed
        });

        return { success: parsed.decision === "approved" ? "Đã duyệt yêu cầu nhân sự." : "Đã từ chối yêu cầu nhân sự." };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function reviewStaffIncidentReportAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffIncidentStatusUpdateSchema.parse({
      incidentId: formData.get("incidentId"),
      status: formData.get("status"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, "staff.edit");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.incident.review",
        requestPayload: parsed
      }),
      async () => {
        await updateStaffIncidentReportStatus({
          session,
          input: parsed
        });

        return {
          success:
            parsed.status === "reviewing"
              ? "Đã chuyển báo cáo sang trạng thái đang xử lý."
              : parsed.status === "resolved"
                ? "Đã đánh dấu báo cáo sự cố đã xử lý."
                : "Đã bỏ qua báo cáo sự cố và ghi audit log."
        };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function forceStaffSessionsLogoutAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffSessionForceLogoutSchema.parse({
      staffMemberId: formData.get("staffMemberId"),
      sessionId: formData.get("sessionId"),
      reason: formData.get("reason")
    });
    await assertStaffActionPermission(session, "staff.suspend");

    const actionResult = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.sessions.force_logout",
        requestPayload: parsed,
        targetStaffMemberId: parsed.staffMemberId
      }),
      async () => {
        const result = await forceStaffSessionLogout({
          restaurantId: session.restaurantId,
          restaurantSlug: session.restaurant.slug,
          actorUserId: session.userId,
          input: parsed
        });

        return { success: `Đã buộc đăng xuất ${result.affectedSessions} phiên nhân sự.` };
      }
    );

    await revalidateStaffDashboards(session.restaurantId);
    return actionResult;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}


import {
  upsertStaffPayrollDeductions,
  upsertStaffPayrollProfile,
  type StaffPayrollDeductions
} from "@/features/staff/services/staff-payroll-service";
import {
  staffPayrollDeductionsSchema,
  staffPayrollProfileSchema
} from "@/lib/validators";

export async function updateStaffPayrollDeductionsAction(
  _prevState: StaffActionState | undefined,
  formData: FormData
): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffPayrollDeductionsSchema.parse({
      bhxhEmployeePercent: formData.get("bhxhEmployeePercent"),
      bhytEmployeePercent: formData.get("bhytEmployeePercent"),
      bhtnEmployeePercent: formData.get("bhtnEmployeePercent"),
      bhxhEmployerPercent: formData.get("bhxhEmployerPercent"),
      bhytEmployerPercent: formData.get("bhytEmployerPercent"),
      bhtnEmployerPercent: formData.get("bhtnEmployerPercent"),
      enablePersonalIncomeTax: formData.get("enablePersonalIncomeTax") === "true",
      personalRelief: formData.get("personalRelief"),
      dependentReliefPerPerson: formData.get("dependentReliefPerPerson"),
      insuranceBaseMin: formData.get("insuranceBaseMin"),
      insuranceBaseMax: formData.get("insuranceBaseMax")
    });
    await assertStaffActionPermission(session, "staff.edit");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.payroll_deductions.update",
        requestPayload: parsed
      }),
      async () => {
        await upsertStaffPayrollDeductions({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          values: parsed as Partial<StaffPayrollDeductions>
        });

        return { success: "Đã cập nhật cấu hình lương BHXH/TNCN." };
      }
    );

    revalidatePath("/dashboard/staff");
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}

export async function updateStaffPayrollProfileAction(
  _prevState: StaffActionState | undefined,
  formData: FormData
): Promise<StaffActionState> {
  try {
    const session = await requireOperationalStaffSession("staff_management");
    const parsed = staffPayrollProfileSchema.parse({
      staffMemberId: formData.get("staffMemberId"),
      baseSalary: formData.get("baseSalary"),
      hourlyRate: formData.get("hourlyRate"),
      dependentCount: formData.get("dependentCount"),
      enrolledInInsurance: formData.get("enrolledInInsurance") === "true",
      applyPersonalIncomeTax: formData.get("applyPersonalIncomeTax") === "true",
      insuranceBaseAmount: formData.get("insuranceBaseAmount"),
      note: formData.get("note")
    });
    await assertStaffActionPermission(session, "staff.edit");

    const result = await runStaffOperation<StaffActionState>(
      staffOperationInput({
        formData,
        session,
        operationType: "staff.payroll_profile.update",
        requestPayload: parsed,
        targetStaffMemberId: parsed.staffMemberId
      }),
      async () => {
        await upsertStaffPayrollProfile({
          restaurantId: session.restaurantId,
          staffMemberId: parsed.staffMemberId,
          values: {
            baseSalary: parsed.baseSalary,
            hourlyRate: parsed.hourlyRate,
            dependentCount: parsed.dependentCount,
            enrolledInInsurance: Boolean(parsed.enrolledInInsurance),
            applyPersonalIncomeTax: Boolean(parsed.applyPersonalIncomeTax),
            insuranceBaseAmount: parsed.insuranceBaseAmount,
            note: parsed.note || null
          }
        });

        return { success: "Đã cập nhật hồ sơ lương cho nhân viên." };
      }
    );

    revalidatePath("/dashboard/staff");
    return result;
  } catch (error) {
    return { error: staffActionError(error) };
  }
}
