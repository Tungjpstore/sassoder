import assert from "node:assert/strict";
import test from "node:test";
import { buildStaffAttendanceMachine } from "@/features/staff/components/mobile/staff-attendance-machine";
import { shouldQueueAttendanceOffline } from "@/features/attendance/hooks/use-offline-attendance-queue";

const activeAttendance = {
  id: "attendance-open-1",
  staffMemberId: "staff-1",
  fullName: "Nhân viên A",
  branchId: "branch-open",
  branchName: "Chi nhánh đang làm",
  shiftName: "Ca tối",
  state: "on_time" as const,
  source: "gps" as const,
  approvalState: "auto_approved" as const,
  clockInAt: "2026-06-18T10:00:00.000Z",
  clockOutAt: null,
  lateMinutes: 0,
  overtimeMinutes: 0,
  distanceMeters: 12
};

const trustedDeviceTrust = {
  status: "trusted" as const,
  deviceId: "device-1",
  fingerprint: "fingerprint-1",
  trustedForAttendance: true,
  restrictionActive: false,
  approvalRequired: false,
  blocked: false,
  message: "",
  flags: []
};

test("staff mobile QR flow asks for a fresh scan before submitting attendance", () => {
  const machine = buildStaffAttendanceMachine({
    activeAttendance: null,
    selectedBranchId: "branch-1",
    selectedBranchName: "Chi nhánh 1",
    canUseGps: true,
    selectedSource: "qr",
    qrReady: false,
    deviceTrust: trustedDeviceTrust,
    hasFingerprint: true,
    isOnline: true,
    queueLength: 0,
    syncing: false,
    processing: false
  });

  assert.equal(machine.action, "clock_in");
  assert.equal(machine.source, "qr");
  assert.equal(machine.state, "needs_location_or_qr");
  assert.equal(machine.primaryLabel, "Quét QR");
  assert.match(machine.detail, /quét mã mới nhất/);
});

test("staff mobile WiFi flow blocks when the device is offline", () => {
  const machine = buildStaffAttendanceMachine({
    activeAttendance,
    selectedBranchId: activeAttendance.branchId,
    selectedBranchName: activeAttendance.branchName,
    canUseGps: true,
    selectedSource: "wifi",
    qrReady: false,
    deviceTrust: trustedDeviceTrust,
    hasFingerprint: true,
    isOnline: false,
    queueLength: 0,
    syncing: false,
    processing: false
  });

  assert.equal(machine.action, "clock_out");
  assert.equal(machine.source, "wifi");
  assert.equal(machine.canSubmit, false);
  assert.equal(machine.primaryLabel, "Cần online");
  assert.match(machine.detail, /WiFi vẫn cần GPS/);
});

test("staff mobile offline queue accepts only premium GPS attendance, never QR or WiFi", () => {
  assert.equal(shouldQueueAttendanceOffline({ error: new Error("Network failed"), isPremium: true, isOnline: false, source: "gps" }), true);
  assert.equal(shouldQueueAttendanceOffline({ error: new Error("Network failed"), isPremium: false, isOnline: false, source: "gps" }), false);
  assert.equal(shouldQueueAttendanceOffline({ error: new Error("Network failed"), isPremium: true, isOnline: false, source: "qr" }), false);
  assert.equal(shouldQueueAttendanceOffline({ error: new Error("Network failed"), isPremium: true, isOnline: false, source: "wifi" }), false);
});
