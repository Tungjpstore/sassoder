import assert from "node:assert/strict";
import test from "node:test";
import {
  attendanceApprovalReviewSchema,
  attendanceClockInSchema,
  attendanceManualAdjustmentSchema,
  staffAttendanceQrTokenCreateSchema,
  staffDeviceCreateSchema,
  staffDeviceTrustUpdateSchema,
  staffDocumentCreateSchema,
  staffInviteSchema,
  staffOperationalRequestSchema,
  staffSessionForceLogoutSchema,
  staffShiftAssignmentSchema,
  staffShiftAssignmentUpdateSchema,
  staffShiftTemplateUpdateSchema
} from "@/lib/validators";

const staffMemberId = "11111111-1111-4111-8111-111111111111";
const branchId = "22222222-2222-4222-8222-222222222222";
const shiftAssignmentId = "33333333-3333-4333-8333-333333333333";
const targetStaffMemberId = "44444444-4444-4444-8444-444444444444";

test("staff invite schema accepts add-staff form payload without optional pin field", () => {
  const parsed = staffInviteSchema.parse({
    email: null,
    password: null,
    pin: null,
    fullName: "Nguyễn Văn A",
    dateOfBirth: "1998-05-20",
    hometown: "Nam Định",
    phone: "0912 345 678",
    roleCode: "manager",
    branchId: "",
    notes: "part-time cuối tuần"
  });

  assert.equal(parsed.pin, "");
  assert.equal(parsed.email, undefined);
  assert.equal(parsed.password, undefined);
  assert.equal(parsed.phone, "0912 345 678");
});

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

test("attendance manual adjustment requires real log, staff and audit reason", () => {
  const parsed = attendanceManualAdjustmentSchema.parse({
    attendanceLogId: shiftAssignmentId,
    staffMemberId,
    clockInAt: "2026-05-30T08:05",
    clockOutAt: "2026-05-30T16:10",
    note: "Quản lý xác nhận quên bấm kết ca"
  });

  assert.equal(parsed.attendanceLogId, shiftAssignmentId);
  assert.equal(parsed.staffMemberId, staffMemberId);
  assert.equal(attendanceManualAdjustmentSchema.safeParse({ ...parsed, clockOutAt: "2026-05-30T07:59" }).success, false);
  assert.equal(attendanceManualAdjustmentSchema.safeParse({ ...parsed, clockInAt: "2026-05-30T08:05:00+07:00", clockOutAt: "2026-05-30T09:05:00+07:00" }).success, true);
  assert.equal(attendanceManualAdjustmentSchema.safeParse({ ...parsed, note: "" }).success, false);
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
  assert.equal(staffDeviceTrustUpdateSchema.parse({ deviceId: staffMemberId, trustedForAttendance: "false" }).trustedForAttendance, false);
  assert.equal(staffDeviceTrustUpdateSchema.safeParse({ trustedForAttendance: true }).success, false);
});

test("staff document and device schemas support real security workflows", () => {
  const document = staffDocumentCreateSchema.parse({
    staffMemberId,
    documentName: "CCCD mặt trước",
    documentType: "identity_card",
    status: "missing",
    fileUrl: ""
  });

  assert.equal(document.status, "missing");
  assert.equal(staffDocumentCreateSchema.safeParse({ ...document, status: "draft" }).success, false);

  const device = staffDeviceCreateSchema.parse({
    staffMemberId,
    deviceName: "iPhone thu ngân",
    deviceType: "phone",
    trustedForAttendance: "false",
    issuedAt: "2026-05-30"
  });

  assert.equal(device.trustedForAttendance, false);
  assert.equal(staffDeviceCreateSchema.safeParse({ ...device, trustedForAttendance: "true" }).success, false);
  assert.equal(staffDeviceCreateSchema.parse({ ...device, trustedForAttendance: "true", deviceFingerprint: "device-fp-123456" }).trustedForAttendance, true);

  const forceLogout = staffSessionForceLogoutSchema.parse({ staffMemberId, reason: "Đổi thiết bị" });
  assert.equal(forceLogout.staffMemberId, staffMemberId);
});

test("staff shift update schemas support real edit workflows", () => {
  const template = staffShiftTemplateUpdateSchema.parse({
    shiftId: shiftAssignmentId,
    name: "Ca chiều",
    branchId,
    startTime: "14:00",
    endTime: "22:00",
    recurringWeekdays: "[1,2,3,4,5]"
  });

  assert.equal(template.shiftId, shiftAssignmentId);
  assert.deepEqual(template.recurringWeekdays, [1, 2, 3, 4, 5]);
  assert.equal(staffShiftTemplateUpdateSchema.safeParse({ ...template, endTime: "14:00" }).success, false);

  const assignment = staffShiftAssignmentUpdateSchema.parse({
    shiftAssignmentId,
    staffMemberId,
    shiftId: targetStaffMemberId,
    scheduledDate: "2026-05-30",
    note: "Đổi sang ca chiều"
  });

  assert.equal(assignment.shiftAssignmentId, shiftAssignmentId);
  assert.equal(assignment.scheduledDate, "2026-05-30");
});

test("staff shift assignment schema supports create workflows", () => {
  const assignment = staffShiftAssignmentSchema.parse({
    staffMemberId,
    shiftId: targetStaffMemberId,
    scheduledDate: "2026-05-30",
    note: "Gán ca từ lịch Staff"
  });

  assert.equal(assignment.staffMemberId, staffMemberId);
  assert.equal(assignment.shiftId, targetStaffMemberId);
  assert.equal(assignment.note, "Gán ca từ lịch Staff");
  assert.equal(staffShiftAssignmentSchema.safeParse({ ...assignment, staffMemberId: "" }).success, false);
  assert.equal(staffShiftAssignmentSchema.safeParse({ ...assignment, scheduledDate: "30/05/2026" }).success, false);
});

test("staff shift service hardens assignment edge cases", async () => {
  const source = await import("node:fs").then((fs) => fs.readFileSync("features/shifts/services/shift-service.ts", "utf8"));

  assert.match(source, /readAssignableStaff\(supabase, restaurantId, input\.staffMemberId\)/);
  assert.match(source, /assertNoShiftAssignmentOverlap/);
  assert.match(source, /if \(staff\.user_id\)/);
  assert.match(source, /isShiftAssignmentOverlapError/);
  assert.match(source, /Ca mới bị trùng giờ với một ca đã xếp/);
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

test("staff operations exposes QR production readiness before creating daily codes", async () => {
  const [typesSource, serviceSource, workspaceSource] = await Promise.all([
    import("node:fs").then((fs) => fs.readFileSync("features/staff/types.ts", "utf8")),
    import("node:fs").then((fs) => fs.readFileSync("features/staff/services/staff-operations-service.ts", "utf8")),
    import("node:fs").then((fs) => fs.readFileSync("features/staff/components/staff-redesign-workspace.tsx", "utf8"))
  ]);

  assert.match(typesSource, /StaffOpsConfigReadiness/);
  assert.match(serviceSource, /STAFF_ATTENDANCE_QR_SECRET/);
  assert.match(serviceSource, /opsConfig: resolveStaffOpsConfigReadiness\(\)/);
  assert.match(workspaceSource, /qrConfigBlocked/);
  assert.match(workspaceSource, /Thiếu QR secret/);
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
  assert.match(attendanceSource, /attendance\.adjusted/);
  assert.match(attendanceSource, /manual_attendance_edit/);
  assert.match(attendanceSource, /GPS chưa đủ dữ liệu chi nhánh hoặc thiết bị/);
  assert.match(qrSource, /\.is\("consumed_at", null\)/);
  assert.match(qrSource, /process\.env\.STAFF_ATTENDANCE_QR_SECRET\?\.trim\(\)/);
  assert.match(qrSource, /NODE_ENV === "production"[\s\S]*Thiếu STAFF_ATTENDANCE_QR_SECRET/);
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
