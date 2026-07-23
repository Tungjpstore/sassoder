import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateMonthlyBasePay,
  calculatePayrollWorkBreakdown,
  resolvePayrollInsuranceBase,
  toVietnamCalendarDateKey
} from "./staff-payroll-compute";

test("attendance timestamps use the Vietnam calendar date boundary", () => {
  assert.equal(toVietnamCalendarDateKey("2026-07-09T17:30:00Z"), "2026-07-10");
  assert.equal(toVietnamCalendarDateKey("2026-07-09T16:59:59Z"), "2026-07-09");
});

test("unpaid leave never creates paid work minutes", () => {
  const result = calculatePayrollWorkBreakdown({
    attendanceWorkMinutes: 0,
    attendanceOvertimeMinutes: 0,
    approvedOvertimeMinutes: 0,
    attendanceDates: [],
    approvedPaidLeaveDates: [],
    approvedUnpaidLeaveDates: ["2026-07-10"]
  });

  assert.equal(result.paidLeaveMinutes, 0);
  assert.equal(result.regularWorkMinutes, 0);
  assert.equal(result.workMinutes, 0);
  assert.equal(result.unpaidLeaveDaysWithoutAttendance, 1);
});

test("approved unpaid leave reduces a monthly salary by the daily rate", () => {
  assert.equal(calculateMonthlyBasePay({
    monthlySalary: 31_000_000,
    periodDays: 31,
    calendarDaysInMonth: 31,
    unpaidLeaveDays: 2
  }), 29_000_000);
});

test("insurance base follows prorated salary unless explicitly overridden", () => {
  assert.equal(resolvePayrollInsuranceBase({
    monthlySalary: 31_000_000,
    basePay: 29_000_000,
    grossPay: 29_000_000
  }), 29_000_000);
  assert.equal(resolvePayrollInsuranceBase({
    monthlySalary: 31_000_000,
    basePay: 29_000_000,
    grossPay: 29_000_000,
    insuranceBaseAmount: 12_000_000
  }), 12_000_000);
  assert.equal(resolvePayrollInsuranceBase({
    monthlySalary: 0,
    basePay: 0,
    grossPay: 2_400_000
  }), 2_400_000);
});

test("standalone approved overtime does not reduce regular attendance", () => {
  const result = calculatePayrollWorkBreakdown({
    attendanceWorkMinutes: 8 * 60,
    attendanceOvertimeMinutes: 0,
    approvedOvertimeMinutes: 2 * 60,
    attendanceDates: ["2026-07-10"],
    approvedPaidLeaveDates: [],
    approvedUnpaidLeaveDates: []
  });

  assert.equal(result.regularWorkMinutes, 8 * 60);
  assert.equal(result.overtimeMinutes, 2 * 60);
});

test("attendance overtime is removed from regular minutes exactly once", () => {
  const result = calculatePayrollWorkBreakdown({
    attendanceWorkMinutes: 10 * 60,
    attendanceOvertimeMinutes: 2 * 60,
    approvedOvertimeMinutes: 0,
    attendanceDates: ["2026-07-10"],
    approvedPaidLeaveDates: [],
    approvedUnpaidLeaveDates: []
  });

  assert.equal(result.regularWorkMinutes, 8 * 60);
  assert.equal(result.overtimeMinutes, 2 * 60);
});
