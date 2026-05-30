import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { writeStaffActivityLog } from "@/services/staff-activity-log-service";
import type { SessionProfile } from "@/types/domain";

function isMissingStaffSelfServiceSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST204" || error.code === "42P01" || /staff_incident_reports|staff_members|staff_branch_assignments|avatar_url/i.test(message);
}

async function resolveOwnStaffMember(supabase: any, session: SessionProfile) {
  const result = await supabase
    .from("staff_members")
    .select("id,full_name,employee_code")
    .eq("restaurant_id", session.restaurantId)
    .eq("user_id", session.userId)
    .maybeSingle();

  if (result.error) throw new AppError("Không tải được hồ sơ nhân viên.", 400);
  if (!result.data) throw new AppError("Tài khoản chưa được gán hồ sơ nhân viên.", 404);
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
    avatarUrl?: string | null;
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
      hometown: input.hometown || null,
      avatar_url: input.avatarUrl || null
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
    attachmentUrl?: string | null;
  };
}) {
  const supabase = createAdminSupabaseClient() as any;
  const member = await resolveOwnStaffMember(supabase, session);
  if (member.id !== input.staffMemberId) throw new AppError("Bạn chỉ có thể gửi báo cáo cho hồ sơ của chính mình.", 403);

  const activeBranch = member.branch?.find((branch) => branch.assignment_status === "active" && !branch.ended_at && branch.is_primary) ?? member.branch?.find((branch) => branch.assignment_status === "active" && !branch.ended_at);
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
      attachment_url: input.attachmentUrl || null,
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

  return result.data;
}
