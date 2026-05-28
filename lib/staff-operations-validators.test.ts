import assert from "node:assert/strict";
import test from "node:test";
import { attendanceApprovalReviewSchema, attendanceClockInSchema, staffAttendanceQrTokenCreateSchema, staffDeviceTrustUpdateSchema, staffOperationalRequestSchema } from "@/lib/validators";

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

test("attendance QR schemas require real branch tokens", () => {
  assert.equal(staffAttendanceQrTokenCreateSchema.parse({ branchId }).expiresInMinutes, 5);
  assert.equal(staffAttendanceQrTokenCreateSchema.parse({ branchId }).mode, "daily_branch");
  assert.equal(staffAttendanceQrTokenCreateSchema.parse({ branchId, expiresInMinutes: "10" }).expiresInMinutes, 10);
  assert.equal(staffAttendanceQrTokenCreateSchema.parse({ branchId, mode: "single_use" }).mode, "single_use");
  assert.equal(staffAttendanceQrTokenCreateSchema.safeParse({ branchId, expiresInMinutes: 0 }).success, false);
  assert.equal(staffAttendanceQrTokenCreateSchema.safeParse({ branchId, expiresInMinutes: 16 }).success, false);

  const missingQr = attendanceClockInSchema.safeParse({
    staffMemberId,
    branchId,
    source: "qr",
    deviceInfo: { deviceFingerprint: "staff-device-abcdef" }
  });
  assert.equal(missingQr.success, false);
  assert.match(JSON.stringify(missingQr.error.flatten()), /mã QR hợp lệ/);

  const parsed = attendanceClockInSchema.parse({
    staffMemberId,
    branchId,
    source: "qr",
    qrToken: "stqr_abcdefghijklmnopqrstuvwxyz1234567890",
    deviceInfo: { deviceFingerprint: "staff-device-abcdef" }
  });
  assert.equal(parsed.source, "qr");
  assert.match(parsed.qrToken ?? "", /^stqr_/);

  const wifiParsed = attendanceClockInSchema.parse({
    staffMemberId,
    branchId,
    source: "wifi",
    deviceInfo: { deviceFingerprint: "staff-device-abcdef" }
  });
  assert.equal(wifiParsed.source, "wifi");
});

test("staff device trust schema supports attendance binding", () => {
  const parsed = staffDeviceTrustUpdateSchema.parse({
    deviceId: staffMemberId,
    trustedForAttendance: "true",
    reason: "Duyệt điện thoại chính"
  });

  assert.equal(parsed.trustedForAttendance, true);
  assert.equal(staffDeviceTrustUpdateSchema.safeParse({ trustedForAttendance: true }).success, false);
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

test("staff attendance service hardens timestamp, GPS, QR and PIN abuse paths", async () => {
  const [attendanceSource, qrSource, pinSource] = await Promise.all([
    import("node:fs").then((fs) => fs.readFileSync("features/attendance/services/attendance-service.ts", "utf8")),
    import("node:fs").then((fs) => fs.readFileSync("features/attendance/services/attendance-qr-service.ts", "utf8")),
    import("node:fs").then((fs) => fs.readFileSync("features/staff/services/staff-pin-service.ts", "utf8"))
  ]);

  assert.match(attendanceSource, /maxTrustedClientCaptureAgeMs\s*=\s*15 \* 60 \* 1000/);
  assert.match(attendanceSource, /source !== "offline_sync"[\s\S]*maxTrustedClientCaptureAgeMs/);
  assert.match(attendanceSource, /return new Date\(now\)/);
  assert.match(attendanceSource, /assertClockOutAfterClockIn/);
  assert.match(attendanceSource, /GPS chưa đủ dữ liệu chi nhánh hoặc thiết bị/);
  assert.match(qrSource, /\.is\("consumed_at", null\)/);
  assert.match(qrSource, /Mã QR chấm công đã được sử dụng/);
  assert.match(pinSource, /buildStaffPinUnknownRateLimitInput/);
  assert.match(pinSource, /staff_auth\.pin_unknown_locked/);
});

test("offline attendance queue never converts QR or WiFi scans into offline sync", async () => {
  const source = await import("node:fs").then((fs) => fs.readFileSync("features/attendance/hooks/use-offline-attendance-queue.ts", "utf8"));

  assert.match(source, /type OfflineAttendanceSource = "gps"/);
  assert.match(source, /source === "gps" && isPremium/);
  assert.match(source, /item\.source === "gps"/);
});
