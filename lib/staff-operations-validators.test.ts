import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildStaffAttendanceMachine } from "@/features/staff/components/mobile/staff-attendance-machine";
import { normalizeStaffPermissions } from "@/lib/staff-permissions";
import {
  attendanceApprovalReviewSchema,
  attendanceClockInSchema,
  attendanceClockOutSchema,
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
  assert.equal(staffAttendanceQrTokenCreateSchema.parse({ branchId }).expiresInMinutes, 1);
  assert.equal(staffAttendanceQrTokenCreateSchema.parse({ branchId }).mode, "daily_branch");
  assert.equal(staffAttendanceQrTokenCreateSchema.parse({ branchId, expiresInMinutes: "5" }).expiresInMinutes, 5);
  assert.equal(staffAttendanceQrTokenCreateSchema.parse({ branchId, mode: "single_use" }).mode, "single_use");
  assert.equal(staffAttendanceQrTokenCreateSchema.safeParse({ branchId, expiresInMinutes: 0 }).success, false);
  assert.equal(staffAttendanceQrTokenCreateSchema.safeParse({ branchId, expiresInMinutes: 6 }).success, false);

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
    lat: 21.01,
    lng: 105.81,
    accuracyMeters: 18,
    qrToken: "stqr_abcdefghijklmnopqrstuvwxyz1234567890",
    deviceInfo: { deviceFingerprint: "staff-device-abcdef" }
  });
  assert.equal(parsed.source, "qr");
  assert.match(parsed.qrToken ?? "", /^stqr_/);

  const wifiParsed = attendanceClockInSchema.parse({
    staffMemberId,
    branchId,
    source: "wifi",
    lat: 21.01,
    lng: 105.81,
    accuracyMeters: 18,
    deviceInfo: { deviceFingerprint: "staff-device-abcdef" }
  });
  assert.equal(wifiParsed.source, "wifi");
});

test("attendance capture rejects weak anti-fraud payloads before writing logs", () => {
  const base = {
    staffMemberId,
    branchId,
    deviceInfo: { deviceFingerprint: "staff-device-abcdef" }
  };

  assert.equal(attendanceClockInSchema.safeParse({ ...base, source: "gps", lat: 21.01, lng: 105.81 }).success, false);
  assert.equal(attendanceClockInSchema.safeParse({ ...base, source: "qr", qrToken: "stqr_abcdefghijklmnopqrstuvwxyz1234567890" }).success, false);
  assert.equal(attendanceClockInSchema.safeParse({ ...base, source: "wifi" }).success, false);
  assert.equal(attendanceClockInSchema.safeParse({ ...base, source: "offline_sync", accuracyMeters: 18 }).success, false);
  assert.equal(attendanceClockInSchema.safeParse({ ...base, source: "offline_sync", lat: 21.01, lng: 105.81, accuracyMeters: 18 }).success, true);
  assert.equal(attendanceClockOutSchema.safeParse({ ...base, source: "gps", lat: 21.01, lng: 105.81, accuracyMeters: 18 }).success, true);
  assert.equal(attendanceClockOutSchema.safeParse({ ...base, source: "qr", qrToken: "stqr_abcdefghijklmnopqrstuvwxyz1234567890", lat: 21.01, lng: 105.81, accuracyMeters: 18, deviceInfo: {} }).success, false);
  assert.equal(attendanceClockInSchema.safeParse({ ...base, source: "wifi", lat: 21.01, lng: 105.81, accuracyMeters: 18, deviceInfo: {} }).success, false);
  assert.equal(attendanceClockInSchema.safeParse({ staffMemberId, branchId, source: "manual", deviceInfo: {} }).success, true);
});

test("staff attendance machine does not auto-submit stale QR unless QR is selected", () => {
  const base = {
    activeAttendance: null,
    selectedBranchId: branchId,
    selectedBranchName: "LogiVN Cầu Giấy",
    canUseGps: true,
    qrReady: true,
    deviceTrust: null,
    hasFingerprint: true,
    isOnline: true,
    queueLength: 0,
    syncing: false,
    processing: false
  };

  const defaultMachine = buildStaffAttendanceMachine(base);
  assert.equal(defaultMachine.source, "gps");
  assert.equal(defaultMachine.primaryLabel, "Vào ca");

  const wifiMachine = buildStaffAttendanceMachine({ ...base, selectedSource: "wifi" });
  assert.equal(wifiMachine.source, "wifi");
  assert.equal(wifiMachine.canSubmit, true);

  const qrMachine = buildStaffAttendanceMachine({ ...base, selectedSource: "qr", qrReady: false });
  assert.equal(qrMachine.source, "qr");
  assert.equal(qrMachine.canSubmit, true);
  assert.equal(qrMachine.primaryLabel, "Quét QR");
});

test("staff mobile attendance QR UI has a real scanner path and stale-token recovery", () => {
  const source = readFileSync("features/staff/components/staff-mobile-redesign-workspace.tsx", "utf8");

  assert.match(source, /function QrScannerSheet/);
  assert.match(source, /decodeQrFromCanvasSource/);
  assert.match(source, /import\("jsqr"\)/);
  assert.match(source, /setQrScannerOpen\(true\)/);
  assert.match(source, /clearQrTokenAfterFailure/);
  assert.match(source, /clearStaffQrParamsFromUrl/);
  assert.match(source, /selectedClockSource/);
  assert.match(source, /staffGpsMaxAccuracyMeters\s*=\s*80/);
  assert.match(source, /maximumAge:\s*0/);
  assert.match(source, /gps = await readGpsPosition\(\)/);
  assert.match(source, /attendanceSessionToken/);
  assert.doesNotMatch(source, /Dán link QR|Chọn ảnh|Dùng mã này/);
  assert.match(source, /Đã ghi nhận nhưng đang chờ quản lý duyệt/);
});

test("legacy full staff permissions unlock granular HR actions", () => {
  const permissions = normalizeStaffPermissions(["staff.manage"], "service");

  assert.ok(permissions.includes("staff.view"));
  assert.ok(permissions.includes("staff.create"));
  assert.ok(permissions.includes("staff.edit"));
  assert.ok(permissions.includes("staff.archive"));
  assert.ok(permissions.includes("attendance.edit"));
  assert.ok(permissions.includes("shifts.assign"));
});

test("staff HR workspace access and actions are permission-first, not ADMIN-only", () => {
  const staffPageSource = readFileSync("app/dashboard/staff/page.tsx", "utf8");
  const dashboardPageSource = readFileSync("app/dashboard/page.tsx", "utf8");
  const actionsSource = readFileSync("app/dashboard/actions/staff.ts", "utf8");
  const dashboardAccessSource = readFileSync("lib/dashboard-access.ts", "utf8");
  const permissionServiceSource = readFileSync("services/staff-permission-service.ts", "utf8");

  assert.match(staffPageSource, /requireDashboardPermissionAccess\("staff_management", \["staff\.view", "staff\.manage"\]\)/);
  assert.doesNotMatch(staffPageSource, /requireDashboardAdminAccess\("staff_management"\)/);
  assert.match(dashboardPageSource, /canOpenHrWorkspace/);
  assert.match(dashboardPageSource, /redirect\(\(await canOpenHrWorkspace\(session\)\) \? "\/dashboard\/staff" : "\/dashboard\/staff\/mobile"\)/);
  assert.match(actionsSource, /requireOperationalStaffSession\("staff_management"\)/);
  assert.doesNotMatch(actionsSource, /requireOperationalAdminSession\("staff_management"\)/);
  assert.match(actionsSource, /assertStaffActionPermission\(session, "staff\.create"\)/);
  assert.match(actionsSource, /assertStaffActionPermission\(session, "staff\.edit"\)/);
  assert.match(dashboardAccessSource, /assertStaffActionPermission\(access\.session, permission/);
  assert.match(permissionServiceSource, /accountPermissions/);
  assert.match(permissionServiceSource, /adminBaselinePermissions/);
  assert.match(permissionServiceSource, /mergeEffectivePermissions\(rolePermissions, accountPermissions\)/);
});

test("staff operations APIs use granular HR permissions without ADMIN-only gates", () => {
  const routeFiles = [
    "app/api/admin/staff-operations/route.ts",
    "app/api/admin/staff-operations/attendance-qr-tokens/route.ts",
    "app/api/admin/staff-operations/attendance-qr-tokens/qr-image/route.ts",
    "app/api/admin/staff-operations/attendance-wifi-networks/route.ts",
    "app/api/admin/staff-operations/session/force-logout/route.ts",
    "app/api/admin/staff-operations/activity/export/route.ts",
    "app/api/admin/staff-operations/timesheets/export/route.ts",
    "app/api/admin/attendance/approvals/[approvalId]/review/route.ts"
  ];

  const routeSources = routeFiles.map((file) => [file, readFileSync(file, "utf8")] as const);
  for (const [file, source] of routeSources) {
    assert.doesNotMatch(source, /adminOnly:\s*true/, file);
    assert.doesNotMatch(source, /adminOnly:\s*scope === "admin"/, file);
    assert.match(source, /permission:/, file);
  }

  assert.match(readFileSync("app/api/admin/staff-operations/route.ts", "utf8"), /permission: scope === "self" \? "attendance\.clock" : "staff\.view"/);
  assert.match(readFileSync("app/api/admin/staff-operations/activity/export/route.ts", "utf8"), /permission: "activity_logs\.export"/);
  assert.match(readFileSync("app/api/admin/staff-operations/timesheets/export/route.ts", "utf8"), /permission: "activity_logs\.export"/);
  assert.match(readFileSync("app/api/admin/attendance/approvals/[approvalId]/review/route.ts", "utf8"), /permissionMode: "any"/);
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
  assert.match(source, /function BranchStatusScreen\(/);
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
  const [attendanceSource, qrSource, pinSource, sessionSource, clockInRoute, clockOutRoute] = await Promise.all([
    import("node:fs").then((fs) => fs.readFileSync("features/attendance/services/attendance-service.ts", "utf8")),
    import("node:fs").then((fs) => fs.readFileSync("features/attendance/services/attendance-qr-service.ts", "utf8")),
    import("node:fs").then((fs) => fs.readFileSync("features/staff/services/staff-pin-service.ts", "utf8")),
    import("node:fs").then((fs) => fs.readFileSync("features/staff/services/staff-session-service.ts", "utf8")),
    import("node:fs").then((fs) => fs.readFileSync("app/api/admin/attendance/clock-in/route.ts", "utf8")),
    import("node:fs").then((fs) => fs.readFileSync("app/api/admin/attendance/clock-out/route.ts", "utf8"))
  ]);

  assert.match(attendanceSource, /maxTrustedClientCaptureAgeMs\s*=\s*15 \* 60 \* 1000/);
  assert.match(attendanceSource, /source !== "offline_sync"[\s\S]*maxTrustedClientCaptureAgeMs/);
  assert.match(attendanceSource, /return new Date\(now\)/);
  assert.match(attendanceSource, /assertClockOutAfterClockIn/);
  assert.match(attendanceSource, /authorizeAttendanceManagementSession/);
  assert.match(attendanceSource, /attendanceManagementAuthorized/);
  assert.match(attendanceSource, /function canManageAttendance/);
  assert.match(attendanceSource, /maxGpsAccuracyMeters\s*=\s*80/);
  assert.match(attendanceSource, /maxAttendanceRadiusMeters\s*=\s*150/);
  assert.match(attendanceSource, /normalizeAttendanceRadiusMeters/);
  assert.match(attendanceSource, /isLocationBoundAttendanceSource/);
  assert.match(attendanceSource, /GPS sai số quá cao/);
  assert.match(attendanceSource, /GPS chấm công cần thiết bị tin cậy/);
  assert.match(attendanceSource, /QR chấm công cần vị trí GPS hợp lệ/);
  assert.match(attendanceSource, /assertNotSelfManualAttendance/);
  assert.match(attendanceSource, /Không thể tự duyệt công hoặc yêu cầu nhân sự của chính mình/);
  assert.doesNotMatch(attendanceSource, /source === "manual" && session\.role !== "ADMIN"/);
  assert.doesNotMatch(attendanceSource, /source !== "gps" \|\| session\.role === "ADMIN"/);
  assert.doesNotMatch(attendanceSource, /session\.role !== "ADMIN"\) throw new AppError\("Cần quyền quản trị để sửa công/);
  assert.doesNotMatch(attendanceSource, /session\.role !== "ADMIN"\) throw new AppError\("Cần quyền quản trị để duyệt chấm công/);
  assert.match(attendanceSource, /attendance\.adjusted/);
  assert.match(attendanceSource, /manual_attendance_edit/);
  assert.match(attendanceSource, /GPS chưa đủ dữ liệu chi nhánh hoặc thiết bị/);
  assert.match(qrSource, /\.is\("consumed_at", null\)/);
  assert.match(qrSource, /dailyBranchQrValiditySeconds\s*=\s*90/);
  assert.match(qrSource, /resetPolicy:\s*"rotating_90s"/);
  assert.match(qrSource, /usage_count:\s*0/);
  assert.doesNotMatch(qrSource, /vietnamDayBoundary/);
  assert.match(qrSource, /process\.env\.STAFF_ATTENDANCE_QR_SECRET\?\.trim\(\)/);
  assert.match(qrSource, /NODE_ENV === "production"[\s\S]*Thiếu STAFF_ATTENDANCE_QR_SECRET/);
  assert.match(qrSource, /Mã QR chấm công đã được sử dụng/);
  assert.match(sessionSource, /STAFF_ATTENDANCE_SESSION_SECRET/);
  assert.match(sessionSource, /createStaffAttendanceSessionToken/);
  assert.match(sessionSource, /attendanceSessionToken/);
  assert.match(sessionSource, /requireSignedToken/);
  assert.match(clockInRoute, /requireSignedToken:\s*input\.source !== "manual"/);
  assert.match(clockOutRoute, /requireSignedToken:\s*input\.source !== "manual"/);
  assert.match(pinSource, /buildStaffPinUnknownRateLimitInput/);
  assert.match(pinSource, /staff_auth\.pin_unknown_locked/);
});

test("offline attendance queue never converts QR or WiFi scans into offline sync", async () => {
  const source = await import("node:fs").then((fs) => fs.readFileSync("features/attendance/hooks/use-offline-attendance-queue.ts", "utf8"));

  assert.match(source, /type OfflineAttendanceSource = "gps"/);
  assert.match(source, /source === "gps" && isPremium/);
  assert.match(source, /item\.source === "gps"/);
});
