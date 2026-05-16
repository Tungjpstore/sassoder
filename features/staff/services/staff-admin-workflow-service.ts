import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getStaffContractTemplate } from "@/features/staff/constants/contract-templates";
import { getRestaurantEntitlement } from "@/services/subscription-service";
import { writeStaffActivityLog } from "@/services/staff-activity-log-service";
import type { z } from "zod";
import type {
  staffContractCreateSchema,
  staffDeviceCreateSchema,
  staffDocumentCreateSchema,
  staffReviewCreateSchema
} from "@/lib/validators";

type StaffReviewCreateInput = z.infer<typeof staffReviewCreateSchema>;
type StaffContractCreateInput = z.infer<typeof staffContractCreateSchema>;
type StaffDocumentCreateInput = z.infer<typeof staffDocumentCreateSchema>;
type StaffDeviceCreateInput = z.infer<typeof staffDeviceCreateSchema>;

type StaffMemberRef = {
  id: string;
  user_id: string | null;
  full_name: string;
  archived_at: string | null;
};

async function assertStaffAdminWorkflow(restaurantId: string) {
  const entitlement = await getRestaurantEntitlement(restaurantId);
  if (!entitlement.allowed) {
    throw new AppError(entitlement.reason ?? "Gói LogiVN không hợp lệ.", entitlement.statusCode);
  }
  if (!entitlement.features.staff_management?.enabled) {
    throw new AppError("Quản lý nhân sự chưa được bật trên gói hiện tại.", 402);
  }
}

async function readStaffMember(supabase: any, restaurantId: string, staffMemberId: string) {
  const result = await supabase
    .from("staff_members")
    .select("id,user_id,full_name,archived_at")
    .eq("restaurant_id", restaurantId)
    .eq("id", staffMemberId)
    .maybeSingle();

  if (result.error) throw result.error;
  const staff = result.data as StaffMemberRef | null;
  if (!staff || staff.archived_at) throw new AppError("Không tìm thấy nhân sự đang hoạt động.", 404);
  return staff;
}

async function notifyStaff({
  supabase,
  restaurantId,
  staff,
  type,
  title,
  body
}: {
  supabase: any;
  restaurantId: string;
  staff: StaffMemberRef | null;
  type: string;
  title: string;
  body: string;
}) {
  if (!staff?.user_id) return;

  const result = await supabase.from("notifications").insert({
    restaurant_id: restaurantId,
    user_id: staff.user_id,
    type,
    title,
    body,
    action_url: "/dashboard/staff/mobile",
    status: "unread",
    payload: {
      staffMemberId: staff.id
    }
  });

  if (result.error) {
    console.error("[staff-admin-workflow] notification failed", {
      restaurantId,
      staffMemberId: staff.id,
      type,
      error: result.error.message
    });
  }
}

export async function createStaffReview({
  restaurantId,
  actorUserId,
  input
}: {
  restaurantId: string;
  actorUserId: string;
  input: StaffReviewCreateInput;
}) {
  await assertStaffAdminWorkflow(restaurantId);
  const supabase = createAdminSupabaseClient() as any;
  const staff = await readStaffMember(supabase, restaurantId, input.staffMemberId);

  const result = await supabase
    .from("staff_reviews")
    .insert({
      restaurant_id: restaurantId,
      staff_member_id: staff.id,
      period_label: input.periodLabel,
      score: input.score,
      status: "completed",
      note: input.note || null,
      created_by: actorUserId
    })
    .select("id,staff_member_id,period_label,score,status,note,created_at")
    .single();

  if (result.error) throw result.error;

  await writeStaffActivityLog({
    restaurantId,
    actorUserId,
    entityType: "staff_review",
    entityId: result.data.id,
    action: "staff.review_created",
    severity: input.score < 3 ? "warning" : "info",
    reason: input.note || null,
    afterState: result.data
  });

  await notifyStaff({
    supabase,
    restaurantId,
    staff,
    type: "staff_review_created",
    title: "Bạn có đánh giá nhân sự mới",
    body: `${input.periodLabel}: ${input.score}/5`
  });

  return result.data;
}

export async function createStaffContract({
  restaurantId,
  actorUserId,
  input
}: {
  restaurantId: string;
  actorUserId: string;
  input: StaffContractCreateInput;
}) {
  await assertStaffAdminWorkflow(restaurantId);
  const supabase = createAdminSupabaseClient() as any;
  const staff = await readStaffMember(supabase, restaurantId, input.staffMemberId);
  const template = getStaffContractTemplate(input.templateCode);
  const salaryAmount = typeof input.salaryAmount === "number" ? input.salaryAmount : null;

  const result = await supabase
    .from("staff_contracts")
    .insert({
      restaurant_id: restaurantId,
      staff_member_id: staff.id,
      contract_type: template.contractType,
      template_code: template.code,
      contract_number: input.contractNumber || null,
      job_title: input.jobTitle || null,
      work_location: input.workLocation || null,
      salary_amount: salaryAmount,
      salary_currency: "VND",
      salary_payment_method: input.salaryPaymentMethod || null,
      working_time: input.workingTime || template.defaultWorkingTime,
      rest_time: input.restTime || template.defaultRestTime,
      e_signature_status: input.eSignatureStatus,
      e_contract_provider: input.eContractProvider || null,
      e_contract_id: input.eContractId || null,
      signed_document_url: input.signedDocumentUrl || null,
      signature_audit: [
        {
          at: new Date().toISOString(),
          actorUserId,
          action: input.eSignatureStatus === "draft" ? "contract_draft_created" : "contract_signature_flow_created",
          templateCode: template.code
        }
      ],
      content_snapshot: {
        templateTitle: template.title,
        templateSummary: template.summary,
        requiredClauses: template.requiredClauses,
        staffMemberId: staff.id,
        staffName: staff.full_name,
        jobTitle: input.jobTitle || null,
        workLocation: input.workLocation || null,
        salaryAmount,
        salaryCurrency: "VND",
        salaryPaymentMethod: input.salaryPaymentMethod || null,
        workingTime: input.workingTime || template.defaultWorkingTime,
        restTime: input.restTime || template.defaultRestTime,
        legalNote: "Template tham khảo theo các nội dung chủ yếu của hợp đồng lao động; cần doanh nghiệp rà soát trước khi ký chính thức."
      },
      start_date: input.startDate,
      end_date: input.endDate || null,
      status: input.eSignatureStatus === "signed" ? "active" : "draft",
      note: input.note || null,
      created_by: actorUserId
    })
    .select("id,staff_member_id,contract_type,template_code,contract_number,job_title,work_location,salary_amount,salary_payment_method,working_time,rest_time,start_date,end_date,status,e_signature_status,e_contract_provider,e_contract_id,signed_document_url,note,created_at")
    .single();

  if (result.error) throw result.error;

  await writeStaffActivityLog({
    restaurantId,
    actorUserId,
    entityType: "staff_contract",
    entityId: result.data.id,
    action: "staff.contract_created",
    severity: input.eSignatureStatus === "signed" ? "info" : "warning",
    reason: input.note || null,
    afterState: result.data
  });

  await notifyStaff({
    supabase,
    restaurantId,
    staff,
    type: "staff_contract_created",
    title: input.eSignatureStatus === "draft" ? "Bạn có bản nháp hợp đồng mới" : "Bạn có hợp đồng cần kiểm tra/ký",
    body: `${template.title} bắt đầu ${input.startDate}`
  });

  return result.data;
}

export async function createStaffDocument({
  restaurantId,
  actorUserId,
  input
}: {
  restaurantId: string;
  actorUserId: string;
  input: StaffDocumentCreateInput;
}) {
  await assertStaffAdminWorkflow(restaurantId);
  const supabase = createAdminSupabaseClient() as any;
  const staff = await readStaffMember(supabase, restaurantId, input.staffMemberId);

  const result = await supabase
    .from("staff_documents")
    .insert({
      restaurant_id: restaurantId,
      staff_member_id: staff.id,
      document_name: input.documentName,
      document_type: input.documentType,
      file_url: input.fileUrl || null,
      status: "complete",
      note: input.note || null,
      created_by: actorUserId
    })
    .select("id,staff_member_id,document_name,document_type,file_url,file_size_bytes,status,note,created_at")
    .single();

  if (result.error) throw result.error;

  await writeStaffActivityLog({
    restaurantId,
    actorUserId,
    entityType: "staff_document",
    entityId: result.data.id,
    action: "staff.document_created",
    severity: "info",
    reason: input.note || null,
    afterState: result.data
  });

  await notifyStaff({
    supabase,
    restaurantId,
    staff,
    type: "staff_document_created",
    title: "Tài liệu nhân sự đã được thêm",
    body: input.documentName
  });

  return result.data;
}

export async function createStaffDevice({
  restaurantId,
  actorUserId,
  input
}: {
  restaurantId: string;
  actorUserId: string;
  input: StaffDeviceCreateInput;
}) {
  await assertStaffAdminWorkflow(restaurantId);
  const supabase = createAdminSupabaseClient() as any;
  const staff = input.staffMemberId ? await readStaffMember(supabase, restaurantId, input.staffMemberId) : null;

  const result = await supabase
    .from("staff_devices")
    .insert({
      restaurant_id: restaurantId,
      staff_member_id: staff?.id ?? null,
      device_name: input.deviceName,
      device_type: input.deviceType,
      serial_number: input.serialNumber || null,
      issued_at: input.issuedAt,
      status: "assigned",
      note: input.note || null,
      created_by: actorUserId
    })
    .select("id,staff_member_id,device_name,device_type,serial_number,issued_at,status,note,created_at")
    .single();

  if (result.error) throw result.error;

  await writeStaffActivityLog({
    restaurantId,
    actorUserId,
    entityType: "staff_device",
    entityId: result.data.id,
    action: "staff.device_assigned",
    severity: "info",
    reason: input.note || null,
    afterState: result.data
  });

  await notifyStaff({
    supabase,
    restaurantId,
    staff,
    type: "staff_device_assigned",
    title: "Bạn vừa được cấp thiết bị",
    body: input.deviceName
  });

  return result.data;
}
