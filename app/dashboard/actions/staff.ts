"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "@/lib/response";
import { staffInviteSchema, staffRoleSchema, staffUserSchema } from "@/lib/validators";
import { createRestaurantUser, deleteRestaurantUser, updateRestaurantUserRole } from "@/services/restaurant-service";
import { assertRestaurantResourceLimit } from "@/services/subscription-service";
import { requireOperationalAdminSession } from "./shared";

export type StaffActionState = {
  error?: string;
  success?: string;
};

function staffActionError(error: unknown) {
  if (error instanceof ZodError) return "Dữ liệu nhân viên không hợp lệ. Vui lòng kiểm tra email, mật khẩu và chức danh.";
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  return "Không thể xử lý nhân viên lúc này.";
}

export async function createStaffAction(_prevState: StaffActionState | undefined, formData: FormData): Promise<StaffActionState> {
  try {
    const session = await requireOperationalAdminSession("staff_management");
    const parsed = staffInviteSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
      permissionProfile: formData.get("permissionProfile") || "service"
    });
    await assertRestaurantResourceLimit({
      restaurantId: session.restaurantId,
      featureKey: "staff_management",
      table: "users",
      label: "tài khoản nhân viên"
    });

    await createRestaurantUser({
      restaurantId: session.restaurantId,
      email: parsed.email,
      password: parsed.password,
      permissionProfile: parsed.permissionProfile
    });

    revalidatePath("/dashboard/staff");
    return { success: "Đã tạo tài khoản nhân viên." };
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

    await updateRestaurantUserRole({
      restaurantId: session.restaurantId,
      userId: parsed.userId,
      actorUserId: session.userId,
      permissionProfile: parsed.permissionProfile
    });

    revalidatePath("/dashboard/staff");
    return { success: "Đã cập nhật chức danh và quyền truy cập." };
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

    await deleteRestaurantUser({
      restaurantId: session.restaurantId,
      userId: parsed.userId,
      actorUserId: session.userId
    });

    revalidatePath("/dashboard/staff");
    return { success: "Đã xoá tài khoản nhân viên." };
  } catch (error) {
    return { error: staffActionError(error) };
  }
}
