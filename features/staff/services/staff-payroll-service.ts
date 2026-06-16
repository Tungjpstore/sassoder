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
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEFAULT_PAYROLL_DEDUCTIONS,
  calculatePersonalIncomeTax,
  summarizePayroll,
  type PayrollSummary,
  type PayrollSummaryInput,
  type StaffPayrollDeductions,
  type StaffPayrollProfile
} from "./staff-payroll-compute";

// Re-export phần tính lương thuần để các importer cũ (client & server) không đổi đường dẫn.
export {
  DEFAULT_PAYROLL_DEDUCTIONS,
  calculatePersonalIncomeTax,
  summarizePayroll
};
export type { PayrollSummary, PayrollSummaryInput, StaffPayrollDeductions, StaffPayrollProfile };

export async function getStaffPayrollDeductions(restaurantId: string): Promise<StaffPayrollDeductions> {
  const supabase = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from("staff_payroll_deductions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error || !data) return DEFAULT_PAYROLL_DEDUCTIONS;
  return mapDeductionsRow(data);
}

export async function listStaffPayrollProfiles(restaurantId: string): Promise<StaffPayrollProfile[]> {
  const supabase = await createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from("staff_payroll_profiles")
    .select("*")
    .eq("restaurant_id", restaurantId);
  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(mapProfileRow);
}

/* Self-scoped: cho phép NHÂN VIÊN xem lương của CHÍNH MÌNH (read-only) trên PWA.
 * Dùng service-role + lọc theo staff_member của user, không nới RLS ADMIN-only. */
export async function getStaffPayrollSelfView(input: {
  restaurantId: string;
  userId: string;
}): Promise<{ deductions: StaffPayrollDeductions; profile: StaffPayrollProfile | null }> {
  const supabase = createAdminSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const memberResult = await db
    .from("staff_members")
    .select("id,archived_at,employment_status")
    .eq("restaurant_id", input.restaurantId)
    .eq("user_id", input.userId)
    .maybeSingle();

  const member = memberResult.data as { id: string; archived_at: string | null; employment_status: string } | null;
  if (!member || member.archived_at) return { deductions: DEFAULT_PAYROLL_DEDUCTIONS, profile: null };

  const [deductionsResult, profileResult] = await Promise.all([
    db.from("staff_payroll_deductions").select("*").eq("restaurant_id", input.restaurantId).maybeSingle(),
    db.from("staff_payroll_profiles").select("*").eq("restaurant_id", input.restaurantId).eq("staff_member_id", member.id).maybeSingle()
  ]);

  return {
    deductions: deductionsResult.data ? mapDeductionsRow(deductionsResult.data) : DEFAULT_PAYROLL_DEDUCTIONS,
    profile: profileResult.data ? mapProfileRow(profileResult.data) : null
  };
}

export async function upsertStaffPayrollDeductions(input: {
  restaurantId: string;
  actorUserId: string;
  values: Partial<StaffPayrollDeductions>;
}): Promise<void> {
  const supabase = createAdminSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
