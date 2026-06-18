/* staff-payroll-compute — phần tính lương THUẦN (không phụ thuộc server).
 *
 * Tách khỏi staff-payroll-service để client component có thể dùng
 * summarizePayroll/types mà không kéo theo "server-only" (supabase/server,
 * supabase/admin) vào bundle trình duyệt.
 *
 * Compute lương net theo chuẩn VN:
 *  - Tính lương gross = base + OT
 *  - Trừ BHXH 8%, BHYT 1.5%, BHTN 1% (nhân viên đóng) trên insurance_base
 *    (insurance_base = min(max(salary, base_min), base_max))
 *  - Tính thu nhập chịu thuế = gross - bảo hiểm NV - giảm trừ gia cảnh
 *  - Tính thuế TNCN luỹ tiến từng phần (Luật Thuế TNCN VN biểu thuế 7 bậc)
 *  - Lương net = gross - bảo hiểm NV - thuế TNCN
 */

export type StaffPayrollDeductions = {
  bhxhEmployeePercent: number;
  bhytEmployeePercent: number;
  bhtnEmployeePercent: number;
  bhxhEmployerPercent: number;
  bhytEmployerPercent: number;
  bhtnEmployerPercent: number;
  enablePersonalIncomeTax: boolean;
  personalRelief: number;
  dependentReliefPerPerson: number;
  insuranceBaseMin: number;
  insuranceBaseMax: number;
};

export type StaffPayrollProfile = {
  staffMemberId: string;
  baseSalary: number;
  hourlyRate: number | null;
  dependentCount: number;
  enrolledInInsurance: boolean;
  applyPersonalIncomeTax: boolean;
  insuranceBaseAmount: number | null;
  note: string | null;
};

export type StaffPayrollPeriod = {
  id: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "reviewing" | "closed" | "void";
  staffCount: number;
  grossTotal: number;
  netTotal: number;
  employeeInsuranceTotal: number;
  employerInsuranceTotal: number;
  personalIncomeTaxTotal: number;
  createdAt: string;
  closedAt: string | null;
};

export type StaffPayslip = {
  id: string;
  payrollPeriodId: string;
  staffMemberId: string;
  staffName: string;
  employeeCode: string | null;
  branchId: string | null;
  periodStart: string;
  periodEnd: string;
  attendanceCount: number;
  workMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  grossPay: number;
  netPay: number;
  employeeInsuranceTotal: number;
  employerInsuranceTotal: number;
  personalIncomeTax: number;
  status: "draft" | "approved" | "paid" | "void";
  createdAt: string;
};

export const DEFAULT_PAYROLL_DEDUCTIONS: StaffPayrollDeductions = {
  bhxhEmployeePercent: 8.0,
  bhytEmployeePercent: 1.5,
  bhtnEmployeePercent: 1.0,
  bhxhEmployerPercent: 17.5,
  bhytEmployerPercent: 3.0,
  bhtnEmployerPercent: 1.0,
  enablePersonalIncomeTax: false,
  personalRelief: 11_000_000,
  dependentReliefPerPerson: 4_400_000,
  insuranceBaseMin: 4_960_000,
  insuranceBaseMax: 99_200_000
};

export const DEFAULT_PAYROLL_HOURLY_RATE = 30_000;
export const DEFAULT_PAYROLL_OT_MULTIPLIER = 1.5;

/* Biểu thuế TNCN luỹ tiến từng phần (Điều 22 Luật Thuế TNCN VN) — đơn vị: ₫ / tháng */
const PIT_BRACKETS: Array<{ upTo: number; rate: number; deduction: number }> = [
  { upTo: 5_000_000, rate: 0.05, deduction: 0 },
  { upTo: 10_000_000, rate: 0.10, deduction: 250_000 },
  { upTo: 18_000_000, rate: 0.15, deduction: 750_000 },
  { upTo: 32_000_000, rate: 0.20, deduction: 1_650_000 },
  { upTo: 52_000_000, rate: 0.25, deduction: 3_250_000 },
  { upTo: 80_000_000, rate: 0.30, deduction: 5_850_000 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.35, deduction: 9_850_000 }
];

export function calculatePersonalIncomeTax(taxableMonthlyIncome: number): number {
  if (taxableMonthlyIncome <= 0) return 0;
  for (const bracket of PIT_BRACKETS) {
    if (taxableMonthlyIncome <= bracket.upTo) {
      return Math.max(0, Math.round(taxableMonthlyIncome * bracket.rate - bracket.deduction));
    }
  }
  return 0;
}

export type PayrollSummaryInput = {
  grossMonthlySalary: number;
  baseSalary: number;
  dependentCount: number;
  enrolledInInsurance: boolean;
  applyPersonalIncomeTax: boolean;
  insuranceBaseAmount?: number | null;
  deductions: StaffPayrollDeductions;
};

export type PayrollSummary = {
  gross: number;
  insuranceBase: number;
  bhxhEmployee: number;
  bhytEmployee: number;
  bhtnEmployee: number;
  totalEmployeeInsurance: number;
  bhxhEmployer: number;
  bhytEmployer: number;
  bhtnEmployer: number;
  totalEmployerInsurance: number;
  personalRelief: number;
  dependentRelief: number;
  taxableIncome: number;
  personalIncomeTax: number;
  netIncome: number;
};

export function summarizePayroll(input: PayrollSummaryInput): PayrollSummary {
  const { deductions, grossMonthlySalary, applyPersonalIncomeTax, dependentCount, enrolledInInsurance } = input;
  const baseForInsurance = input.insuranceBaseAmount ?? input.baseSalary ?? grossMonthlySalary;
  const insuranceBase = enrolledInInsurance
    ? Math.min(Math.max(baseForInsurance, deductions.insuranceBaseMin), deductions.insuranceBaseMax)
    : 0;

  const bhxhEmployee = Math.round(insuranceBase * (deductions.bhxhEmployeePercent / 100));
  const bhytEmployee = Math.round(insuranceBase * (deductions.bhytEmployeePercent / 100));
  const bhtnEmployee = Math.round(insuranceBase * (deductions.bhtnEmployeePercent / 100));
  const totalEmployeeInsurance = bhxhEmployee + bhytEmployee + bhtnEmployee;

  const bhxhEmployer = Math.round(insuranceBase * (deductions.bhxhEmployerPercent / 100));
  const bhytEmployer = Math.round(insuranceBase * (deductions.bhytEmployerPercent / 100));
  const bhtnEmployer = Math.round(insuranceBase * (deductions.bhtnEmployerPercent / 100));
  const totalEmployerInsurance = bhxhEmployer + bhytEmployer + bhtnEmployer;

  const personalRelief = applyPersonalIncomeTax && deductions.enablePersonalIncomeTax ? deductions.personalRelief : 0;
  const dependentRelief = applyPersonalIncomeTax && deductions.enablePersonalIncomeTax
    ? deductions.dependentReliefPerPerson * Math.max(0, dependentCount)
    : 0;
  const taxableIncome = applyPersonalIncomeTax && deductions.enablePersonalIncomeTax
    ? Math.max(0, grossMonthlySalary - totalEmployeeInsurance - personalRelief - dependentRelief)
    : 0;
  const personalIncomeTax = applyPersonalIncomeTax && deductions.enablePersonalIncomeTax
    ? calculatePersonalIncomeTax(taxableIncome)
    : 0;

  return {
    gross: grossMonthlySalary,
    insuranceBase,
    bhxhEmployee,
    bhytEmployee,
    bhtnEmployee,
    totalEmployeeInsurance,
    bhxhEmployer,
    bhytEmployer,
    bhtnEmployer,
    totalEmployerInsurance,
    personalRelief,
    dependentRelief,
    taxableIncome,
    personalIncomeTax,
    netIncome: Math.max(0, grossMonthlySalary - totalEmployeeInsurance - personalIncomeTax)
  };
}
