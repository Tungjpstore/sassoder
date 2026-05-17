import assert from "node:assert/strict";
import test from "node:test";
import { staffOperationalRequestSchema } from "@/lib/validators";

const staffMemberId = "11111111-1111-4111-8111-111111111111";
const branchId = "22222222-2222-4222-8222-222222222222";
const shiftAssignmentId = "33333333-3333-4333-8333-333333333333";
const targetStaffMemberId = "44444444-4444-4444-8444-444444444444";

test("staff request schema accepts payroll-ready leave requests", () => {
  const parsed = staffOperationalRequestSchema.parse({
    requestType: "leave_request",
    staffMemberId,
    branchId,
    leaveType: "paid",
    fromDate: "2026-05-18",
    toDate: "2026-05-19",
    reason: "Nghỉ phép gia đình"
  });

  assert.equal(parsed.requestType, "leave_request");
  assert.equal(parsed.leaveType, "paid");
  assert.equal(parsed.fromDate, "2026-05-18");
  assert.equal(parsed.toDate, "2026-05-19");
});

test("staff request schema rejects leave requests with an inverted date range", () => {
  const result = staffOperationalRequestSchema.safeParse({
    requestType: "leave_request",
    staffMemberId,
    fromDate: "2026-05-20",
    toDate: "2026-05-19"
  });

  assert.equal(result.success, false);
  assert.match(JSON.stringify(result.error.flatten()), /Ngày kết thúc nghỉ/);
});

test("staff request schema requires a shift assignment for swap requests", () => {
  assert.equal(staffOperationalRequestSchema.safeParse({ requestType: "shift_swap", staffMemberId }).success, false);

  const parsed = staffOperationalRequestSchema.parse({
    requestType: "shift_swap",
    staffMemberId,
    branchId,
    shiftAssignmentId,
    targetStaffMemberId,
    reason: "Đổi ca tối"
  });

  assert.equal(parsed.shiftAssignmentId, shiftAssignmentId);
  assert.equal(parsed.targetStaffMemberId, targetStaffMemberId);
});

test("staff request schema accepts bounded overtime requests only", () => {
  const parsed = staffOperationalRequestSchema.parse({
    requestType: "overtime",
    staffMemberId,
    branchId,
    fromDate: "2026-05-18",
    overtimeMinutes: "90",
    reason: "Đóng ca muộn"
  });

  assert.equal(parsed.overtimeMinutes, 90);
  assert.equal(staffOperationalRequestSchema.safeParse({ ...parsed, overtimeMinutes: 5 }).success, false);
  assert.equal(staffOperationalRequestSchema.safeParse({ ...parsed, overtimeMinutes: 900 }).success, false);
});
