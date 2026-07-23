/* staff-payroll-service — quản lý cấu hình lương BHXH/BHYT/BHTN/TNCN
 * + per-staff payroll profile (lương cơ bản, người phụ thuộc, có tham gia BHXH).
 *
 * Compute lương net theo chuẩn VN:
 *  - Tính lương gross = base + OT
 *  - Trừ BHXH 8%, BHYT 1.5%, BHTN 1% (nhân viên đóng) trên insurance_base
 *    (insurance_base = min(max(salary, base_min), base_max))
 *  - Tính thu nhập chịu thuế = gross - bảo hiểm NV - giảm trừ gia cảnh
 *  - Tính thuế TNCN luỹ tiến từng phần (Luật Thuế TNCN VN biểu thuế 7 bậc)
 *  - Lương net = gross - bảo hiểm NV - thuế TNCN
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEFAULT_PAYROLL_DEDUCTIONS,
  DEFAULT_PAYROLL_HOURLY_RATE,
  DEFAULT_PAYROLL_OT_MULTIPLIER,
  calculateMonthlyBasePay,
  calculatePayrollWorkBreakdown,
  calculatePersonalIncomeTax,
  resolvePayrollInsuranceBase,
  summarizePayroll,
  toVietnamCalendarDateKey,
  type PayrollSummary,
  type PayrollSummaryInput,
  type StaffPayrollDeductions,
  type StaffPayrollPeriod,
  type StaffPayslip,
  type StaffPayrollProfile
} from "./staff-payroll-compute";
import { writeStaffActivityLog } from "@/services/staff-activity-log-service";

// Re-export phần tính lương thuần để các importer cũ (client & server) không đổi đường dẫn.
export {
  DEFAULT_PAYROLL_DEDUCTIONS,
  DEFAULT_PAYROLL_HOURLY_RATE,
  DEFAULT_PAYROLL_OT_MULTIPLIER,
  calculatePersonalIncomeTax,
  resolvePayrollInsuranceBase,
  summarizePayroll
};
export type { PayrollSummary, PayrollSummaryInput, StaffPayrollDeductions, StaffPayrollPeriod, StaffPayslip, StaffPayrollProfile };

type PayrollAttendanceRow = {
  id: string;
  staff_member_id: string;
  branch_id: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  work_minutes: number | null;
  overtime_minutes: number | null;
  late_minutes: number | null;
  approval_state: string;
};

type PayrollStaffRow = {
  id: string;
  user_id: string;
  full_name: string;
  employee_code: string | null;
  role_code: string;
  employment_status: string;
  archived_at: string | null;
};

type PayrollApprovalRow = {
  id: string;
  staff_member_id: string;
  attendance_log_id: string | null;
  request_type: "overtime" | "leave_request" | string;
  status: "approved" | string;
  requested_payload: Record<string, unknown> | null;
};

export async function getStaffPayrollDeductions(restaurantId: string): Promise<StaffPayrollDeductions> {
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("staff_payroll_deductions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  throwIfSupabaseError(error, "Không tải được cấu hình lương");
  if (!data) return DEFAULT_PAYROLL_DEDUCTIONS;
  return mapDeductionsRow(data);
}

export async function listStaffPayrollProfiles(restaurantId: string): Promise<StaffPayrollProfile[]> {
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("staff_payroll_profiles")
    .select("*")
    .eq("restaurant_id", restaurantId);
  throwIfSupabaseError(error, "Không tải được hồ sơ lương nhân viên");
  if (!data) return [];
  return (data as any[]).map(mapProfileRow);
}

export async function listStaffPayrollPeriods(restaurantId: string): Promise<StaffPayrollPeriod[]> {
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("staff_payroll_periods")
    .select("id,period_label,period_start,period_end,status,staff_count,gross_total,net_total,employee_insurance_total,employer_insurance_total,personal_income_tax_total,created_at,closed_at")
    .eq("restaurant_id", restaurantId)
    .order("period_start", { ascending: false })
    .limit(12);
  throwIfSupabaseError(error, "Không tải được kỳ lương");
  return ((data ?? []) as any[]).map(mapPeriodRow);
}

export async function listStaffPayslips(restaurantId: string, payrollPeriodId?: string | null): Promise<StaffPayslip[]> {
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;
  let query = db
    .from("staff_payslips")
    .select("id,payroll_period_id,staff_member_id,staff_name,employee_code,branch_id,period_start,period_end,attendance_count,work_minutes,overtime_minutes,late_minutes,gross_pay,net_pay,employee_insurance_total,employer_insurance_total,personal_income_tax,status,created_at")
    .eq("restaurant_id", restaurantId)
    .order("net_pay", { ascending: false })
    .limit(80);
  if (payrollPeriodId) query = query.eq("payroll_period_id", payrollPeriodId);
  const { data, error } = await query;
  throwIfSupabaseError(error, "Không tải được phiếu lương");
  return ((data ?? []) as any[]).map(mapPayslipRow);
}

/* Self-scoped: cho phép NHÂN VIÊN xem lương của CHÍNH MÌNH (read-only) trên PWA.
 * Dùng service-role + lọc theo staff_member của user, không nới RLS ADMIN-only. */
export async function getStaffPayrollSelfView(input: {
  restaurantId: string;
  userId: string;
}): Promise<{ deductions: StaffPayrollDeductions; profile: StaffPayrollProfile | null; payslips: StaffPayslip[] }> {
  const supabase = createAdminSupabaseClient();
  const db = supabase as any;

  const memberResult = await db
    .from("staff_members")
    .select("id,archived_at,employment_status")
    .eq("restaurant_id", input.restaurantId)
    .eq("user_id", input.userId)
    .maybeSingle();
  throwIfSupabaseError(memberResult.error, "Không xác thực được hồ sơ nhân viên");

  const member = memberResult.data as { id: string; archived_at: string | null; employment_status: string } | null;
  if (!member || member.archived_at || member.employment_status !== "active") {
    return { deductions: DEFAULT_PAYROLL_DEDUCTIONS, profile: null, payslips: [] };
  }

  const [deductionsResult, profileResult, payslipsResult] = await Promise.all([
    db.from("staff_payroll_deductions").select("*").eq("restaurant_id", input.restaurantId).maybeSingle(),
    db.from("staff_payroll_profiles").select("*").eq("restaurant_id", input.restaurantId).eq("staff_member_id", member.id).maybeSingle(),
    db
      .from("staff_payslips")
      .select("id,payroll_period_id,staff_member_id,staff_name,employee_code,branch_id,period_start,period_end,attendance_count,work_minutes,overtime_minutes,late_minutes,gross_pay,net_pay,employee_insurance_total,employer_insurance_total,personal_income_tax,status,created_at")
      .eq("restaurant_id", input.restaurantId)
      .eq("staff_member_id", member.id)
      .neq("status", "void")
      .order("period_start", { ascending: false })
      .limit(6)
  ]);

  throwIfSupabaseError(deductionsResult.error, "Không tải được cấu hình lương cá nhân");
  throwIfSupabaseError(profileResult.error, "Không tải được hồ sơ lương cá nhân");
  throwIfSupabaseError(payslipsResult.error, "Không tải được phiếu lương cá nhân");

  return {
    deductions: deductionsResult.data ? mapDeductionsRow(deductionsResult.data) : DEFAULT_PAYROLL_DEDUCTIONS,
    profile: profileResult.data ? mapProfileRow(profileResult.data) : null,
    payslips: ((payslipsResult.data ?? []) as any[]).map(mapPayslipRow)
  };
}

export async function upsertStaffPayrollDeductions(input: {
  restaurantId: string;
  actorUserId: string;
  values: Partial<StaffPayrollDeductions>;
}): Promise<void> {
  const supabase = createAdminSupabaseClient();
  const db = supabase as any;
  const merged = { ...DEFAULT_PAYROLL_DEDUCTIONS, ...input.values };
  const { error } = await db.from("staff_payroll_deductions").upsert(
    {
      restaurant_id: input.restaurantId,
      bhxh_employee_percent: merged.bhxhEmployeePercent,
      bhyt_employee_percent: merged.bhytEmployeePercent,
      bhtn_employee_percent: merged.bhtnEmployeePercent,
      bhxh_employer_percent: merged.bhxhEmployerPercent,
      bhyt_employer_percent: merged.bhytEmployerPercent,
      bhtn_employer_percent: merged.bhtnEmployerPercent,
      enable_personal_income_tax: merged.enablePersonalIncomeTax,
      personal_relief: merged.personalRelief,
      dependent_relief_per_person: merged.dependentReliefPerPerson,
      insurance_base_min: merged.insuranceBaseMin,
      insurance_base_max: merged.insuranceBaseMax,
      applied_at: new Date().toISOString(),
      updated_by: input.actorUserId
    },
    { onConflict: "restaurant_id" }
  );
  if (error) throw new Error(error.message);
}

export async function upsertStaffPayrollProfile(input: {
  restaurantId: string;
  staffMemberId: string;
  values: Partial<StaffPayrollProfile>;
}): Promise<void> {
  const supabase = createAdminSupabaseClient();
  const db = supabase as any;
  const { error } = await db.from("staff_payroll_profiles").upsert(
    {
      restaurant_id: input.restaurantId,
      staff_member_id: input.staffMemberId,
      base_salary: input.values.baseSalary ?? 0,
      hourly_rate: input.values.hourlyRate ?? null,
      dependent_count: input.values.dependentCount ?? 0,
      enrolled_in_insurance: input.values.enrolledInInsurance ?? false,
      apply_personal_income_tax: input.values.applyPersonalIncomeTax ?? false,
      insurance_base_amount: input.values.insuranceBaseAmount ?? null,
      note: input.values.note ?? null
    },
    { onConflict: "restaurant_id,staff_member_id" }
  );
  if (error) throw new Error(error.message);
}

export async function createStaffPayrollPeriodDraft(input: {
  restaurantId: string;
  actorUserId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  defaultHourlyRate?: number;
  overtimeMultiplier?: number;
}): Promise<{ period: StaffPayrollPeriod; payslipCount: number }> {
  const supabase = createAdminSupabaseClient();
  const db = supabase as any;
  const periodStart = normalizeDateOnly(input.periodStart, "Ngày bắt đầu kỳ lương chưa hợp lệ.");
  const periodEnd = normalizeDateOnly(input.periodEnd, "Ngày kết thúc kỳ lương chưa hợp lệ.");
  if (periodEnd < periodStart) throw new Error("Ngày kết thúc kỳ lương phải sau ngày bắt đầu.");

  const [deductions, profilesResult, staffResult, attendanceResult, approvalsResult] = await Promise.all([
    getStaffPayrollDeductionsWithAdmin(db, input.restaurantId),
    db.from("staff_payroll_profiles").select("*").eq("restaurant_id", input.restaurantId),
    db
      .from("staff_members")
      .select("id,user_id,full_name,employee_code,role_code,employment_status,archived_at")
      .eq("restaurant_id", input.restaurantId),
    db
      .from("attendance_logs")
      .select("id,staff_member_id,branch_id,clock_in_at,clock_out_at,work_minutes,overtime_minutes,late_minutes,approval_state")
      .eq("restaurant_id", input.restaurantId)
      .gte("clock_in_at", `${periodStart}T00:00:00+07:00`)
      .lt("clock_in_at", `${addOneDay(periodEnd)}T00:00:00+07:00`)
      .not("clock_out_at", "is", null)
      .in("approval_state", ["auto_approved", "approved"]),
    db
      .from("attendance_approval_requests")
      .select("id,staff_member_id,attendance_log_id,request_type,status,requested_payload")
      .eq("restaurant_id", input.restaurantId)
      .eq("status", "approved")
      .in("request_type", ["overtime", "leave_request"])
  ]);

  throwIfSupabaseError(profilesResult.error, "Không tải được hồ sơ lương");
  throwIfSupabaseError(staffResult.error, "Không tải được nhân viên tính lương");
  throwIfSupabaseError(attendanceResult.error, "Không tải được bảng công tính lương");
  throwIfSupabaseError(approvalsResult.error, "Không tải được yêu cầu chấm công đã duyệt");

  const profiles = ((profilesResult.data ?? []) as any[]).map(mapProfileRow);
  const profileMap = new Map(profiles.map((profile) => [profile.staffMemberId, profile]));
  const staffRows = ((staffResult.data ?? []) as PayrollStaffRow[]).filter((staff) => (
    staff.role_code !== "owner"
    && !staff.archived_at
    && staff.employment_status === "active"
  ));
  const staffMap = new Map(staffRows.map((staff) => [staff.id, staff]));
  const attendanceRows = ((attendanceResult.data ?? []) as PayrollAttendanceRow[]).filter((attendance) => staffMap.has(attendance.staff_member_id));
  const rowsByStaff = groupAttendanceByStaff(attendanceRows);
  const approvedAdjustments = summarizeApprovedPayrollAdjustments(
    ((approvalsResult.data ?? []) as PayrollApprovalRow[]),
    periodStart,
    periodEnd
  );
  const defaultRate = Math.max(0, Math.round(input.defaultHourlyRate ?? DEFAULT_PAYROLL_HOURLY_RATE));
  const otMultiplier = Math.max(1, Number(input.overtimeMultiplier ?? DEFAULT_PAYROLL_OT_MULTIPLIER));
  const staffIds = new Set([...staffMap.keys(), ...profileMap.keys()]);
  const payslips = Array.from(staffIds).map((staffMemberId) => {
    const staff = staffMap.get(staffMemberId);
    if (!staff) return null;
    const adjustments = approvedAdjustments.get(staffMemberId) ?? {
      overtimeMinutes: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      paidLeaveDates: [] as string[],
      unpaidLeaveDates: [] as string[]
    };
    return buildPayslipPayload({
      restaurantId: input.restaurantId,
      staff,
      rows: rowsByStaff.get(staffMemberId) ?? [],
      profile: profileMap.get(staffMemberId) ?? null,
      deductions,
      periodStart,
      periodEnd,
      defaultRate,
      otMultiplier,
      approvedOvertimeMinutes: adjustments.overtimeMinutes,
      approvedPaidLeaveDays: adjustments.paidLeaveDays,
      approvedUnpaidLeaveDays: adjustments.unpaidLeaveDays,
      approvedPaidLeaveDates: adjustments.paidLeaveDates,
      approvedUnpaidLeaveDates: adjustments.unpaidLeaveDates
    });
  }).filter(Boolean) as Array<Record<string, unknown>>;

  const totals = summarizePayslipPayloads(payslips);
  const periodPayload = {
    restaurant_id: input.restaurantId,
    period_label: input.periodLabel.trim() || `${periodStart} - ${periodEnd}`,
    period_start: periodStart,
    period_end: periodEnd,
    status: "draft",
    staff_count: totals.staffCount,
    gross_total: totals.grossTotal,
    net_total: totals.netTotal,
    employee_insurance_total: totals.employeeInsuranceTotal,
    employer_insurance_total: totals.employerInsuranceTotal,
    personal_income_tax_total: totals.personalIncomeTaxTotal,
    snapshot: {
      generatedAt: new Date().toISOString(),
      defaultHourlyRate: defaultRate,
      overtimeMultiplier: otMultiplier,
      attendanceCount: attendanceRows.length,
      source: "server_recomputed_attendance"
    },
    created_by: input.actorUserId
  };

  const regenerationResult = await db.rpc("regenerate_staff_payroll_period_atomic", {
    p_restaurant_id: input.restaurantId,
    p_actor_user_id: input.actorUserId,
    p_period_payload: periodPayload,
    p_payslips: payslips
  });
  throwIfSupabaseError(regenerationResult.error, "Không tạo được kỳ lương và phiếu lương");
  const regeneration = regenerationResult.data?.[0] as { period: Record<string, unknown>; payslip_count: number } | undefined;
  if (!regeneration?.period) throw new Error("Không nhận được snapshot kỳ lương từ giao dịch payroll.");
  const periodRow = regeneration.period;

  await writeStaffActivityLog({
    restaurantId: input.restaurantId,
    actorUserId: input.actorUserId,
    entityType: "staff_payroll_period",
    entityId: String(periodRow.id),
    action: "staff.payroll_period_generated",
    severity: "info",
    afterState: { period: periodRow, totals, payslipCount: payslips.length },
    metadata: { source: "staff_payroll_dashboard" }
  });

  return { period: mapPeriodRow(periodRow), payslipCount: Number(regeneration.payslip_count ?? payslips.length) };
}

export async function updateStaffPayrollPeriodStatus(input: {
  restaurantId: string;
  actorUserId: string;
  payrollPeriodId: string;
  status: "draft" | "reviewing" | "closed" | "void";
}): Promise<StaffPayrollPeriod> {
  const supabase = createAdminSupabaseClient();
  const db = supabase as any;

  const periodResult = await db
    .from("staff_payroll_periods")
    .select("id,restaurant_id,period_label,period_start,period_end,status,staff_count,gross_total,net_total,employee_insurance_total,employer_insurance_total,personal_income_tax_total,created_at,closed_at")
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.payrollPeriodId)
    .maybeSingle();
  throwIfSupabaseError(periodResult.error, "Không tải được kỳ lương");

  const period = periodResult.data as any | null;
  if (!period) throw new Error("Kỳ lương không tồn tại hoặc không thuộc quán này.");
  if (period.status === input.status) return mapPeriodRow(period);
  if (period.status === "closed") throw new Error("Kỳ lương đã chốt, không thể đổi trạng thái.");
  if (period.status === "void") throw new Error("Kỳ lương đã huỷ, không thể đổi trạng thái.");

  if (input.status === "reviewing" && period.status !== "draft") {
    throw new Error("Chỉ kỳ lương nháp mới được đưa vào đối soát.");
  }
  if (input.status === "closed" && period.status !== "reviewing") {
    throw new Error("Cần đưa kỳ lương vào đối soát trước khi chốt.");
  }
  if (input.status === "draft" && period.status !== "reviewing") {
    throw new Error("Chỉ kỳ đang đối soát mới có thể trả về nháp.");
  }

  const payslipsResult = await db
    .from("staff_payslips")
    .select("id,status,gross_pay,net_pay,employee_insurance_total,employer_insurance_total,personal_income_tax")
    .eq("restaurant_id", input.restaurantId)
    .eq("payroll_period_id", input.payrollPeriodId);
  throwIfSupabaseError(payslipsResult.error, "Không tải được phiếu lương để đổi trạng thái kỳ");
  const payslips = (payslipsResult.data ?? []) as Array<{ status: StaffPayslip["status"] }>;

  if (input.status === "reviewing" && payslips.filter((payslip) => payslip.status !== "void").length === 0) {
    throw new Error("Kỳ lương chưa có phiếu lương hợp lệ để đối soát.");
  }
  if (input.status === "closed") {
    const activePayslips = payslips.filter((payslip) => payslip.status !== "void");
    if (activePayslips.length === 0) throw new Error("Kỳ lương chưa có phiếu lương hợp lệ để chốt.");
    if (activePayslips.some((payslip) => payslip.status !== "approved" && payslip.status !== "paid")) {
      throw new Error("Cần duyệt tất cả phiếu lương trước khi chốt kỳ.");
    }
  }

  const totals = summarizePayslipPayloads((payslipsResult.data ?? []).filter((payslip: any) => payslip.status !== "void"));
  const updatePayload: Record<string, unknown> = {
    status: input.status,
    staff_count: totals.staffCount,
    gross_total: totals.grossTotal,
    net_total: totals.netTotal,
    employee_insurance_total: totals.employeeInsuranceTotal,
    employer_insurance_total: totals.employerInsuranceTotal,
    personal_income_tax_total: totals.personalIncomeTaxTotal
  };
  if (input.status === "closed") {
    updatePayload.closed_by = input.actorUserId;
    updatePayload.closed_at = new Date().toISOString();
  }
  if (input.status === "draft") {
    updatePayload.closed_by = null;
    updatePayload.closed_at = null;
  }

  const updateResult = await db
    .from("staff_payroll_periods")
    .update(updatePayload)
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.payrollPeriodId)
    .select("id,period_label,period_start,period_end,status,staff_count,gross_total,net_total,employee_insurance_total,employer_insurance_total,personal_income_tax_total,created_at,closed_at")
    .single();
  throwIfSupabaseError(updateResult.error, "Không cập nhật được trạng thái kỳ lương");

  await writeStaffActivityLog({
    restaurantId: input.restaurantId,
    actorUserId: input.actorUserId,
    entityType: "staff_payroll_period",
    entityId: input.payrollPeriodId,
    action: `staff.payroll_period_${input.status}`,
    severity: input.status === "void" ? "warning" : "info",
    beforeState: { status: period.status },
    afterState: { status: input.status, totals },
    metadata: { source: "staff_payroll_dashboard" }
  });

  return mapPeriodRow(updateResult.data);
}

export async function updateStaffPayslipStatus(input: {
  restaurantId: string;
  actorUserId: string;
  payslipId: string;
  status: "draft" | "approved" | "paid" | "void";
}): Promise<StaffPayslip> {
  const supabase = createAdminSupabaseClient();
  const db = supabase as any;

  const payslipResult = await db
    .from("staff_payslips")
    .select("id,restaurant_id,payroll_period_id,staff_member_id,staff_name,employee_code,branch_id,period_start,period_end,attendance_count,work_minutes,overtime_minutes,late_minutes,gross_pay,net_pay,employee_insurance_total,employer_insurance_total,personal_income_tax,status,created_at")
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.payslipId)
    .maybeSingle();
  throwIfSupabaseError(payslipResult.error, "Không tải được phiếu lương");
  const payslip = payslipResult.data as any | null;
  if (!payslip) throw new Error("Phiếu lương không tồn tại hoặc không thuộc quán này.");
  if (payslip.status === input.status) return mapPayslipRow(payslip);
  if (payslip.status === "void") throw new Error("Phiếu lương đã huỷ, không thể đổi trạng thái.");

  const periodResult = await db
    .from("staff_payroll_periods")
    .select("id,status")
    .eq("restaurant_id", input.restaurantId)
    .eq("id", payslip.payroll_period_id)
    .maybeSingle();
  throwIfSupabaseError(periodResult.error, "Không tải được kỳ lương của phiếu");
  const period = periodResult.data as { id: string; status: StaffPayrollPeriod["status"] } | null;
  if (!period) throw new Error("Kỳ lương của phiếu không còn tồn tại.");
  if (period.status === "void") throw new Error("Kỳ lương đã huỷ, không thể cập nhật phiếu lương.");
  if (period.status === "closed" && !(payslip.status === "approved" && input.status === "paid")) {
    throw new Error("Kỳ lương đã chốt, chỉ còn được đánh dấu phiếu đã trả.");
  }
  if (input.status === "paid" && payslip.status !== "approved") {
    throw new Error("Cần duyệt phiếu lương trước khi đánh dấu đã trả.");
  }

  const updateResult = await db
    .from("staff_payslips")
    .update({ status: input.status })
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.payslipId)
    .select("id,payroll_period_id,staff_member_id,staff_name,employee_code,branch_id,period_start,period_end,attendance_count,work_minutes,overtime_minutes,late_minutes,gross_pay,net_pay,employee_insurance_total,employer_insurance_total,personal_income_tax,status,created_at")
    .single();
  throwIfSupabaseError(updateResult.error, "Không cập nhật được phiếu lương");

  if (period.status !== "closed") {
    await refreshPayrollPeriodTotals(db, input.restaurantId, payslip.payroll_period_id);
  }
  await writeStaffActivityLog({
    restaurantId: input.restaurantId,
    actorUserId: input.actorUserId,
    entityType: "staff_payslip",
    entityId: input.payslipId,
    action: `staff.payslip_${input.status}`,
    severity: input.status === "void" ? "warning" : "info",
    beforeState: { status: payslip.status },
    afterState: { status: input.status, staffName: payslip.staff_name, netPay: payslip.net_pay },
    metadata: { source: "staff_payroll_dashboard", payrollPeriodId: payslip.payroll_period_id }
  });

  return mapPayslipRow(updateResult.data);
}

function mapDeductionsRow(row: any): StaffPayrollDeductions {
  return {
    bhxhEmployeePercent: Number(row.bhxh_employee_percent ?? DEFAULT_PAYROLL_DEDUCTIONS.bhxhEmployeePercent),
    bhytEmployeePercent: Number(row.bhyt_employee_percent ?? DEFAULT_PAYROLL_DEDUCTIONS.bhytEmployeePercent),
    bhtnEmployeePercent: Number(row.bhtn_employee_percent ?? DEFAULT_PAYROLL_DEDUCTIONS.bhtnEmployeePercent),
    bhxhEmployerPercent: Number(row.bhxh_employer_percent ?? DEFAULT_PAYROLL_DEDUCTIONS.bhxhEmployerPercent),
    bhytEmployerPercent: Number(row.bhyt_employer_percent ?? DEFAULT_PAYROLL_DEDUCTIONS.bhytEmployerPercent),
    bhtnEmployerPercent: Number(row.bhtn_employer_percent ?? DEFAULT_PAYROLL_DEDUCTIONS.bhtnEmployerPercent),
    enablePersonalIncomeTax: Boolean(row.enable_personal_income_tax),
    personalRelief: Number(row.personal_relief ?? DEFAULT_PAYROLL_DEDUCTIONS.personalRelief),
    dependentReliefPerPerson: Number(row.dependent_relief_per_person ?? DEFAULT_PAYROLL_DEDUCTIONS.dependentReliefPerPerson),
    insuranceBaseMin: Number(row.insurance_base_min ?? DEFAULT_PAYROLL_DEDUCTIONS.insuranceBaseMin),
    insuranceBaseMax: Number(row.insurance_base_max ?? DEFAULT_PAYROLL_DEDUCTIONS.insuranceBaseMax)
  };
}

function mapProfileRow(row: any): StaffPayrollProfile {
  return {
    staffMemberId: String(row.staff_member_id),
    baseSalary: Number(row.base_salary ?? 0),
    hourlyRate: row.hourly_rate == null ? null : Number(row.hourly_rate),
    dependentCount: Number(row.dependent_count ?? 0),
    enrolledInInsurance: Boolean(row.enrolled_in_insurance),
    applyPersonalIncomeTax: Boolean(row.apply_personal_income_tax),
    insuranceBaseAmount: row.insurance_base_amount == null ? null : Number(row.insurance_base_amount),
    note: row.note ?? null
  };
}

function mapPeriodRow(row: any): StaffPayrollPeriod {
  return {
    id: String(row.id),
    periodLabel: String(row.period_label),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    status: row.status,
    staffCount: Number(row.staff_count ?? 0),
    grossTotal: Number(row.gross_total ?? 0),
    netTotal: Number(row.net_total ?? 0),
    employeeInsuranceTotal: Number(row.employee_insurance_total ?? 0),
    employerInsuranceTotal: Number(row.employer_insurance_total ?? 0),
    personalIncomeTaxTotal: Number(row.personal_income_tax_total ?? 0),
    createdAt: String(row.created_at),
    closedAt: row.closed_at ?? null
  };
}

function mapPayslipRow(row: any): StaffPayslip {
  return {
    id: String(row.id),
    payrollPeriodId: String(row.payroll_period_id),
    staffMemberId: String(row.staff_member_id),
    staffName: String(row.staff_name),
    employeeCode: row.employee_code ?? null,
    branchId: row.branch_id ?? null,
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    attendanceCount: Number(row.attendance_count ?? 0),
    workMinutes: Number(row.work_minutes ?? 0),
    overtimeMinutes: Number(row.overtime_minutes ?? 0),
    lateMinutes: Number(row.late_minutes ?? 0),
    grossPay: Number(row.gross_pay ?? 0),
    netPay: Number(row.net_pay ?? 0),
    employeeInsuranceTotal: Number(row.employee_insurance_total ?? 0),
    employerInsuranceTotal: Number(row.employer_insurance_total ?? 0),
    personalIncomeTax: Number(row.personal_income_tax ?? 0),
    status: row.status,
    createdAt: String(row.created_at)
  };
}

async function getStaffPayrollDeductionsWithAdmin(db: any, restaurantId: string): Promise<StaffPayrollDeductions> {
  const { data, error } = await db.from("staff_payroll_deductions").select("*").eq("restaurant_id", restaurantId).maybeSingle();
  throwIfSupabaseError(error, "Không tải được cấu hình lương");
  return data ? mapDeductionsRow(data) : DEFAULT_PAYROLL_DEDUCTIONS;
}

function normalizeDateOnly(value: string, message: string) {
  const normalized = value?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized ?? "")) throw new Error(message);
  return normalized;
}

function addOneDay(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function attendanceWorkMinutes(row: PayrollAttendanceRow) {
  if (row.work_minutes !== null && Number.isFinite(Number(row.work_minutes))) return Math.max(0, Number(row.work_minutes));
  if (!row.clock_out_at) return 0;
  const diff = new Date(row.clock_out_at).getTime() - new Date(row.clock_in_at).getTime();
  return Math.max(0, Math.round(diff / 60_000));
}

function groupAttendanceByStaff(rows: PayrollAttendanceRow[]) {
  const map = new Map<string, PayrollAttendanceRow[]>();
  rows.forEach((row) => {
    map.set(row.staff_member_id, [...(map.get(row.staff_member_id) ?? []), row]);
  });
  return map;
}

function payloadText(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return typeof value === "string" ? value.slice(0, 40) : null;
}

function payloadNumber(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = Number(payload?.[key]);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function dateOnly(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function inclusiveDateRange(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  const dates: string[] = [];
  for (const cursor = new Date(from); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function summarizeApprovedPayrollAdjustments(rows: PayrollApprovalRow[], periodStart: string, periodEnd: string) {
  const result = new Map<string, {
    overtimeMinutes: number;
    paidLeaveDays: number;
    unpaidLeaveDays: number;
    paidLeaveDates: string[];
    unpaidLeaveDates: string[];
  }>();
  for (const row of rows) {
    const payload = row.requested_payload ?? {};
    const current = result.get(row.staff_member_id) ?? {
      overtimeMinutes: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      paidLeaveDates: [],
      unpaidLeaveDates: []
    };

    if (row.request_type === "overtime" && !row.attendance_log_id) {
      const overtimeDate = dateOnly(payloadText(payload, "overtimeDate") ?? payloadText(payload, "fromDate"));
      if (overtimeDate && overtimeDate >= periodStart && overtimeDate <= periodEnd) {
        current.overtimeMinutes += payloadNumber(payload, "overtimeMinutes");
      }
    }

    if (row.request_type === "leave_request") {
      const from = dateOnly(payloadText(payload, "fromDate"));
      const to = dateOnly(payloadText(payload, "toDate")) ?? from;
      if (from && to && to >= periodStart && from <= periodEnd) {
        const clippedFrom = from < periodStart ? periodStart : from;
        const clippedTo = to > periodEnd ? periodEnd : to;
        const leaveDates = inclusiveDateRange(clippedFrom, clippedTo);
        if ((payloadText(payload, "leaveType") ?? "unpaid") === "paid") current.paidLeaveDates.push(...leaveDates);
        else current.unpaidLeaveDates.push(...leaveDates);
      }
    }

    result.set(row.staff_member_id, current);
  }

  for (const adjustment of result.values()) {
    adjustment.paidLeaveDates = [...new Set(adjustment.paidLeaveDates)].sort();
    adjustment.unpaidLeaveDates = [...new Set(adjustment.unpaidLeaveDates)].sort();
    const unpaidDates = new Set(adjustment.unpaidLeaveDates);
    if (adjustment.paidLeaveDates.some((date) => unpaidDates.has(date))) {
      throw new Error("Mâu thuẫn nghỉ phép có lương và không lương trong cùng ngày.");
    }
    adjustment.paidLeaveDays = adjustment.paidLeaveDates.length;
    adjustment.unpaidLeaveDays = adjustment.unpaidLeaveDates.length;
  }
  return result;
}

function daysInPayrollPeriod(periodStart: string, periodEnd: string) {
  const from = new Date(`${periodStart}T00:00:00.000Z`);
  const to = new Date(`${periodEnd}T00:00:00.000Z`);
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
}

function daysInMonth(periodStart: string) {
  const date = new Date(`${periodStart}T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function buildPayslipPayload({
  restaurantId,
  staff,
  rows,
  profile,
  deductions,
  periodStart,
  periodEnd,
  defaultRate,
  otMultiplier,
  approvedOvertimeMinutes,
  approvedPaidLeaveDays,
  approvedUnpaidLeaveDays,
  approvedPaidLeaveDates,
  approvedUnpaidLeaveDates
}: {
  restaurantId: string;
  staff: PayrollStaffRow;
  rows: PayrollAttendanceRow[];
  profile: StaffPayrollProfile | null;
  deductions: StaffPayrollDeductions;
  periodStart: string;
  periodEnd: string;
  defaultRate: number;
  otMultiplier: number;
  approvedOvertimeMinutes: number;
  approvedPaidLeaveDays: number;
  approvedUnpaidLeaveDays: number;
  approvedPaidLeaveDates: string[];
  approvedUnpaidLeaveDates: string[];
}) {
  const attendanceWork = rows.reduce((total, row) => total + attendanceWorkMinutes(row), 0);
  const attendanceOvertime = rows.reduce((total, row) => total + Math.max(0, Number(row.overtime_minutes ?? 0)), 0);
  const workBreakdown = calculatePayrollWorkBreakdown({
    attendanceWorkMinutes: attendanceWork,
    attendanceOvertimeMinutes: attendanceOvertime,
    approvedOvertimeMinutes,
    attendanceDates: rows.map((row) => toVietnamCalendarDateKey(row.clock_in_at)),
    approvedPaidLeaveDates,
    approvedUnpaidLeaveDates
  });
  const {
    regularWorkMinutes,
    overtimeMinutes,
    paidLeaveDaysWithoutAttendance,
    unpaidLeaveDaysWithoutAttendance,
    paidLeaveMinutes,
    workMinutes
  } = workBreakdown;
  const monthlySalary = Math.max(0, Number(profile?.baseSalary ?? 0));
  const hourlyRate = Math.max(0, profile?.hourlyRate ?? (monthlySalary > 0 ? monthlySalary / (26 * 8) : defaultRate));
  const lateMinutes = rows.reduce((total, row) => total + Math.max(0, Number(row.late_minutes ?? 0)), 0);
  const basePay = monthlySalary > 0
    ? calculateMonthlyBasePay({
      monthlySalary,
      periodDays: daysInPayrollPeriod(periodStart, periodEnd),
      calendarDaysInMonth: daysInMonth(periodStart),
      unpaidLeaveDays: unpaidLeaveDaysWithoutAttendance
    })
    : Math.round((regularWorkMinutes / 60) * hourlyRate);
  const overtimePay = Math.round((overtimeMinutes / 60) * hourlyRate * otMultiplier);
  const grossPay = basePay + overtimePay;
  const insuranceBaseSalary = resolvePayrollInsuranceBase({
    monthlySalary,
    basePay,
    grossPay,
    insuranceBaseAmount: profile?.insuranceBaseAmount
  });
  const deductionSummary = summarizePayroll({
    grossMonthlySalary: grossPay,
    baseSalary: insuranceBaseSalary,
    dependentCount: profile?.dependentCount ?? 0,
    enrolledInInsurance: profile?.enrolledInInsurance ?? false,
    applyPersonalIncomeTax: profile?.applyPersonalIncomeTax ?? false,
    insuranceBaseAmount: profile?.insuranceBaseAmount ?? null,
    deductions
  });
  const primaryBranchId = rows.find((row) => row.branch_id)?.branch_id ?? null;

  return {
    restaurant_id: restaurantId,
    staff_member_id: staff.id,
    staff_user_id: staff.user_id,
    branch_id: primaryBranchId,
    staff_name: staff.full_name,
    employee_code: staff.employee_code,
    period_start: periodStart,
    period_end: periodEnd,
    attendance_count: rows.length + paidLeaveDaysWithoutAttendance,
    work_minutes: workMinutes,
    overtime_minutes: overtimeMinutes,
    late_minutes: lateMinutes,
    gross_pay: grossPay,
    net_pay: deductionSummary.netIncome,
    employee_insurance_total: deductionSummary.totalEmployeeInsurance,
    employer_insurance_total: deductionSummary.totalEmployerInsurance,
    personal_income_tax: deductionSummary.personalIncomeTax,
    payroll_profile_snapshot: profile ?? {},
    deduction_snapshot: deductions,
    attendance_snapshot: [
      ...rows.map((row) => ({
        id: row.id,
        branchId: row.branch_id,
        clockInAt: row.clock_in_at,
        clockOutAt: row.clock_out_at,
        workMinutes: attendanceWorkMinutes(row),
        overtimeMinutes: row.overtime_minutes ?? 0,
        lateMinutes: row.late_minutes ?? 0,
        approvalState: row.approval_state
      })),
      {
        type: "approved_payroll_adjustments",
        overtimeMinutes: approvedOvertimeMinutes,
        paidLeaveDays: approvedPaidLeaveDays,
        unpaidLeaveDays: approvedUnpaidLeaveDays,
        unpaidLeaveDaysWithoutAttendance,
        paidLeaveDaysWithoutAttendance,
        paidLeaveMinutes
      }
    ],
    status: "draft"
  };
}

async function refreshPayrollPeriodTotals(db: any, restaurantId: string, payrollPeriodId: string) {
  const payslipsResult = await db
    .from("staff_payslips")
    .select("status,gross_pay,net_pay,employee_insurance_total,employer_insurance_total,personal_income_tax")
    .eq("restaurant_id", restaurantId)
    .eq("payroll_period_id", payrollPeriodId);
  throwIfSupabaseError(payslipsResult.error, "Không cập nhật được tổng kỳ lương");

  const totals = summarizePayslipPayloads((payslipsResult.data ?? []).filter((payslip: any) => payslip.status !== "void"));
  const updateResult = await db
    .from("staff_payroll_periods")
    .update({
      staff_count: totals.staffCount,
      gross_total: totals.grossTotal,
      net_total: totals.netTotal,
      employee_insurance_total: totals.employeeInsuranceTotal,
      employer_insurance_total: totals.employerInsuranceTotal,
      personal_income_tax_total: totals.personalIncomeTaxTotal
    })
    .eq("restaurant_id", restaurantId)
    .eq("id", payrollPeriodId);
  throwIfSupabaseError(updateResult.error, "Không cập nhật được tổng kỳ lương");
}

function summarizePayslipPayloads(payslips: Array<Record<string, unknown>>) {
  type Totals = {
    staffCount: number;
    grossTotal: number;
    netTotal: number;
    employeeInsuranceTotal: number;
    employerInsuranceTotal: number;
    personalIncomeTaxTotal: number;
  };

  return payslips.reduce<Totals>(
    (total, payslip) => ({
      staffCount: total.staffCount + 1,
      grossTotal: total.grossTotal + Number(payslip.gross_pay ?? 0),
      netTotal: total.netTotal + Number(payslip.net_pay ?? 0),
      employeeInsuranceTotal: total.employeeInsuranceTotal + Number(payslip.employee_insurance_total ?? 0),
      employerInsuranceTotal: total.employerInsuranceTotal + Number(payslip.employer_insurance_total ?? 0),
      personalIncomeTaxTotal: total.personalIncomeTaxTotal + Number(payslip.personal_income_tax ?? 0)
    }),
    {
      staffCount: 0,
      grossTotal: 0,
      netTotal: 0,
      employeeInsuranceTotal: 0,
      employerInsuranceTotal: 0,
      personalIncomeTaxTotal: 0
    }
  );
}
