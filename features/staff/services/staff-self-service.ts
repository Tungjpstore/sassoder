import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { publishOperationalEvent, recordOperationalEventOutbox, type OperationalEvent } from "@/services/operational-event-bus";
import { writeStaffActivityLog } from "@/services/staff-activity-log-service";
import { uploadStaffAvatarFile } from "@/features/staff/services/staff-avatar-service";
import { assertStaffActionPermission } from "@/services/staff-permission-service";
import type { SessionProfile } from "@/types/domain";

function isMissingStaffSelfServiceSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST204" || error.code === "42P01" || /staff_incident_reports|staff_members|staff_branch_assignments|avatar_url/i.test(message);
}

async function resolveOwnStaffMember(supabase: any, session: SessionProfile) {
  const result = await supabase
    .from("staff_members")
    .select("id,full_name,employee_code,employment_status,archived_at")
    .eq("restaurant_id", session.restaurantId)
    .eq("user_id", session.userId)
    .maybeSingle();

  if (result.error) throw new AppError("Không tải được hồ sơ nhân viên.", 400);
  if (!result.data) throw new AppError("Tài khoản chưa được gán hồ sơ nhân viên.", 404);
  if (result.data.archived_at || result.data.employment_status !== "active") {
    throw new AppError("Hồ sơ nhân sự không còn hoạt động.", 403);
  }
  const branchResult = await supabase
    .from("staff_branch_assignments")
    .select("branch_id,is_primary,assignment_status,ended_at")
    .eq("restaurant_id", session.restaurantId)
    .eq("staff_member_id", result.data.id);

  if (branchResult.error && !isMissingStaffSelfServiceSchema(branchResult.error)) {
    throw new AppError("Không tải được chi nhánh nhân viên.", 400);
  }

  return {
    ...result.data,
    branch: branchResult.data ?? []
  } as {
    id: string;
    full_name: string;
    employee_code: string | null;
    employment_status: "active" | "suspended" | "resigned";
    archived_at: string | null;
    branch: Array<{ branch_id: string; is_primary: boolean; assignment_status: string; ended_at: string | null }>;
  };
}

export async function updateStaffSelfProfile({
  session,
  input
}: {
  session: SessionProfile;
  input: {
    fullName: string;
    phone?: string | null;
    dateOfBirth?: string | null;
    hometown?: string | null;
  };
}) {
  const supabase = createAdminSupabaseClient() as any;
  const member = await resolveOwnStaffMember(supabase, session);
  const result = await supabase
    .from("staff_members")
    .update({
      full_name: input.fullName,
      phone: input.phone || null,
      date_of_birth: input.dateOfBirth || null,
      hometown: input.hometown || null
    })
    .eq("restaurant_id", session.restaurantId)
    .eq("id", member.id)
    .select("id,full_name,phone,date_of_birth,hometown,avatar_url")
    .single();

  if (result.error) {
    if (isMissingStaffSelfServiceSchema(result.error)) throw new AppError("Schema hồ sơ nhân viên chưa sẵn sàng.", 400);
    throw new AppError(result.error.message, 400);
  }

  await writeStaffActivityLog({
    restaurantId: session.restaurantId,
    actorUserId: session.userId,
    entityType: "staff_member",
    entityId: member.id,
    action: "staff_self.profile_updated",
    severity: "info",
    reason: "Nhân viên tự cập nhật hồ sơ trong staff app.",
    afterState: result.data,
    metadata: { source: "staff_mobile_profile" }
  });

  return result.data;
}

export async function uploadStaffSelfAvatar({
  session,
  file
}: {
  session: SessionProfile;
  file: FormDataEntryValue | null;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const member = await resolveOwnStaffMember(supabase, session);
  const avatarUrl = await uploadStaffAvatarFile({
    restaurantId: session.restaurantId,
    staffMemberId: member.id,
    file
  });

  const result = await supabase
    .from("staff_members")
    .update({ avatar_url: avatarUrl })
    .eq("restaurant_id", session.restaurantId)
    .eq("id", member.id)
    .select("id,avatar_url")
    .single();

  if (result.error) {
    if (isMissingStaffSelfServiceSchema(result.error)) throw new AppError("Schema ảnh đại diện nhân viên chưa sẵn sàng.", 400);
    throw new AppError(result.error.message, 400);
  }

  await writeStaffActivityLog({
    restaurantId: session.restaurantId,
    actorUserId: session.userId,
    entityType: "staff_member",
    entityId: member.id,
    action: "staff_self.avatar_uploaded",
    severity: "info",
    reason: "Nhân viên tải ảnh đại diện từ staff app.",
    afterState: result.data,
    metadata: { source: "staff_mobile_profile", uploadType: "file" }
  });

  return { avatarUrl };
}

/**
 * Admin/quản lý tải ảnh đại diện hộ một nhân sự (luồng quản lý nhân viên).
 * Gác quyền `staff.edit`; cập nhật avatar_url của đúng staff member trong nhà hàng.
 */
export async function uploadStaffMemberAvatarByAdmin({
  session,
  staffMemberId,
  file
}: {
  session: SessionProfile;
  staffMemberId: string;
  file: FormDataEntryValue | null;
}) {
  if (!staffMemberId) throw new AppError("Thiếu mã nhân sự để cập nhật ảnh.", 400);
  await assertStaffActionPermission(session, "staff.edit");

  const supabase = createAdminSupabaseClient() as any;
  const target = await supabase
    .from("staff_members")
    .select("id,full_name,archived_at")
    .eq("restaurant_id", session.restaurantId)
    .eq("id", staffMemberId)
    .maybeSingle();

  if (target.error) {
    if (isMissingStaffSelfServiceSchema(target.error)) throw new AppError("Schema hồ sơ nhân viên chưa sẵn sàng.", 400);
    throw new AppError(target.error.message, 400);
  }
  if (!target.data) throw new AppError("Không tìm thấy nhân sự để cập nhật ảnh.", 404);

  const avatarUrl = await uploadStaffAvatarFile({
    restaurantId: session.restaurantId,
    staffMemberId,
    file
  });

  const result = await supabase
    .from("staff_members")
    .update({ avatar_url: avatarUrl })
    .eq("restaurant_id", session.restaurantId)
    .eq("id", staffMemberId)
    .select("id,avatar_url")
    .single();

  if (result.error) {
    if (isMissingStaffSelfServiceSchema(result.error)) throw new AppError("Schema ảnh đại diện nhân viên chưa sẵn sàng.", 400);
    throw new AppError(result.error.message, 400);
  }

  await writeStaffActivityLog({
    restaurantId: session.restaurantId,
    actorUserId: session.userId,
    entityType: "staff_member",
    entityId: staffMemberId,
    action: "staff.avatar_uploaded",
    severity: "info",
    reason: "Quản lý cập nhật ảnh đại diện cho nhân sự.",
    afterState: result.data,
    metadata: { source: "dashboard_staff_management", uploadType: "file" }
  });

  return { avatarUrl };
}

export async function createStaffIncidentReport({
  session,
  input
}: {
  session: SessionProfile;
  input: {
    staffMemberId: string;
    branchId?: string | null;
    title: string;
    description: string;
    severity: "low" | "normal" | "high" | "urgent";
  };
}) {
  const supabase = createAdminSupabaseClient() as any;
  const member = await resolveOwnStaffMember(supabase, session);
  if (member.id !== input.staffMemberId) throw new AppError("Bạn chỉ có thể gửi báo cáo cho hồ sơ của chính mình.", 403);

  const activeBranches = member.branch?.filter((branch) => branch.assignment_status === "active" && !branch.ended_at) ?? [];
  const activeBranch = activeBranches.find((branch) => branch.is_primary) ?? activeBranches[0];
  if (input.branchId && !activeBranches.some((branch) => branch.branch_id === input.branchId)) {
    throw new AppError("Bạn chỉ có thể gửi báo cáo cho chi nhánh đang được phân công.", 403);
  }
  const branchId = input.branchId || activeBranch?.branch_id || null;

  const result = await supabase
    .from("staff_incident_reports")
    .insert({
      restaurant_id: session.restaurantId,
      staff_member_id: member.id,
      branch_id: branchId,
      title: input.title,
      description: input.description,
      severity: input.severity,
      attachment_url: null,
      status: "open"
    })
    .select("id,title,severity,status,created_at")
    .single();

  if (result.error) {
    if (isMissingStaffSelfServiceSchema(result.error)) throw new AppError("Schema báo cáo sự cố chưa sẵn sàng.", 400);
    throw new AppError(result.error.message, 400);
  }

  await Promise.all([
    writeStaffActivityLog({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      branchId,
      entityType: "staff_incident_report",
      entityId: result.data.id,
      action: "staff_self.incident_reported",
      severity: input.severity === "urgent" || input.severity === "high" ? "warning" : "info",
      reason: input.title,
      afterState: result.data,
      metadata: { source: "staff_mobile_incident", employeeCode: member.employee_code }
    }),
    supabase.from("notifications").insert({
      restaurant_id: session.restaurantId,
      user_id: null,
      type: "staff_incident_report",
      title: `Sự cố từ ${member.full_name}`,
      body: input.title,
      status: "unread",
      action_url: "/dashboard/staff?view=requests",
      payload: {
        incidentReportId: result.data.id,
        staffMemberId: member.id,
        employeeCode: member.employee_code,
        severity: input.severity
      }
    })
  ]);

  const incidentEvent = {
    type: "staff.incident_reported",
    eventId: `staff.incident_reported:${result.data.id}`,
    restaurantId: session.restaurantId,
    branchId,
    source: "staff",
    actor: { type: "staff", userId: session.userId, role: session.role },
    staffIncident: {
      id: result.data.id,
      staffMemberId: member.id,
      staffName: member.full_name,
      employeeCode: member.employee_code,
      title: input.title,
      description: input.description,
      severity: input.severity,
      status: result.data.status,
      attachmentUrl: null
    }
  } satisfies OperationalEvent;

  await recordOperationalEventOutbox(incidentEvent);
  await publishOperationalEvent(incidentEvent).catch((error) => {
    console.error("[staff-self-service] telegram staff incident event failed", {
      restaurantId: session.restaurantId,
      incidentReportId: result.data.id,
      error: error instanceof Error ? error.message : "unknown"
    });
  });

  return result.data;
}

export async function updateStaffIncidentReportStatus({
  session,
  input
}: {
  session: SessionProfile;
  input: {
    incidentId: string;
    status: "reviewing" | "resolved" | "dismissed";
    note?: string | null;
  };
}) {
  const supabase = createAdminSupabaseClient() as any;
  const existingResult = await supabase
    .from("staff_incident_reports")
    .select("id,restaurant_id,staff_member_id,branch_id,title,description,severity,status,attachment_url,created_at,updated_at,resolved_at")
    .eq("restaurant_id", session.restaurantId)
    .eq("id", input.incidentId)
    .maybeSingle();

  if (existingResult.error) {
    if (isMissingStaffSelfServiceSchema(existingResult.error)) throw new AppError("Schema báo cáo sự cố chưa sẵn sàng.", 400);
    throw new AppError(existingResult.error.message, 400);
  }

  const existing = existingResult.data as {
    id: string;
    staff_member_id: string;
    branch_id: string | null;
    title: string;
    description: string;
    severity: "low" | "normal" | "high" | "urgent";
    status: "open" | "reviewing" | "resolved" | "dismissed";
    attachment_url: string | null;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
  } | null;

  if (!existing) throw new AppError("Không tìm thấy báo cáo sự cố.", 404);
  if (existing.status === "resolved" || existing.status === "dismissed") {
    throw new AppError("Báo cáo sự cố này đã được đóng.", 409);
  }

  const closing = input.status === "resolved" || input.status === "dismissed";
  const updateResult = await supabase
    .from("staff_incident_reports")
    .update({
      status: input.status,
      resolved_at: closing ? new Date().toISOString() : null,
      resolved_by: closing ? session.userId : null
    })
    .eq("restaurant_id", session.restaurantId)
    .eq("id", input.incidentId)
    .select("id,staff_member_id,branch_id,title,description,severity,status,attachment_url,created_at,updated_at,resolved_at")
    .single();

  if (updateResult.error) {
    if (isMissingStaffSelfServiceSchema(updateResult.error)) throw new AppError("Schema báo cáo sự cố chưa sẵn sàng.", 400);
    throw new AppError(updateResult.error.message, 400);
  }

  await writeStaffActivityLog({
    restaurantId: session.restaurantId,
    actorUserId: session.userId,
    branchId: existing.branch_id,
    entityType: "staff_incident_report",
    entityId: existing.id,
    action: input.status === "reviewing" ? "staff_incident.reviewing" : input.status === "resolved" ? "staff_incident.resolved" : "staff_incident.dismissed",
    severity: input.status === "dismissed" ? "warning" : "info",
    reason: input.note || null,
    beforeState: existing,
    afterState: updateResult.data,
    metadata: { source: "staff_owner_requests" }
  });

  return updateResult.data;
}
