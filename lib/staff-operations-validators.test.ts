import assert from "node:assert/strict";
import test from "node:test";
import { attendanceApprovalReviewSchema, staffOperationalRequestSchema } from "@/lib/validators";

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
  assert.equal(staffOperationalRequestSchema.safeParse({
    requestType: "shift_swap",
    staffMemberId,
    shiftAssignmentId,
    targetStaffMemberId: staffMemberId
  }).success, false);

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

test("staff request schema caps leave ranges for payroll safety", () => {
  const result = staffOperationalRequestSchema.safeParse({
    requestType: "leave_request",
    staffMemberId,
    branchId,
    leaveType: "paid",
    fromDate: "2026-05-01",
    toDate: "2026-06-15"
  });

  assert.equal(result.success, false);
  assert.match(JSON.stringify(result.error.flatten()), /tối đa 31 ngày/);
});

test("attendance approval rejection requires an audit note", () => {
  assert.equal(attendanceApprovalReviewSchema.safeParse({ decision: "approved" }).success, true);

  const rejected = attendanceApprovalReviewSchema.safeParse({ decision: "rejected", note: "" });
  assert.equal(rejected.success, false);
  assert.match(JSON.stringify(rejected.error.flatten()), /Từ chối yêu cầu cần ghi lý do/);
});

test("staff request workflow guards payroll conflicts before insert", async () => {
  const source = await import("node:fs").then((fs) => fs.readFileSync("features/staff/services/staff-request-service.ts", "utf8"));

  assert.match(source, /assertNoPayrollRequestConflict/);
  assert.match(source, /Ngày này đã có nghỉ phép đang chờ\/đã duyệt/);
  assert.match(source, /Khoảng nghỉ này đã có tăng ca đang chờ\/đã duyệt/);
  assert.match(source, /leaveDays/);
});

test("staff operations workspace does not keep archived duplicate screen drafts", async () => {
  const source = await import("node:fs").then((fs) => fs.readFileSync("features/staff/components/staff-operations-workspace.tsx", "utf8"));

  assert.doesNotMatch(source, /PermissionsScreenPreview|PermissionsScreenArchive/);
  assert.doesNotMatch(source, /BranchCommandCenterScreenLegacy|BranchCommandCenterScreenSearchDraft|BranchCommandCenterScreenArchive/);
  assert.match(source, /function PermissionsScreen\(/);
  assert.match(source, /function BranchCommandCenterScreen\(/);
});
