import assert from "node:assert/strict";
import test from "node:test";
import {
  STAFF_ONLINE_WINDOW_MS,
  isStaffRecentlyActive,
  describeAttendanceState,
  describeAttendanceSource,
  describeApprovalType,
  describeApprovalStatus,
  describeShiftStatus,
  describeRole,
  describeTodayAttendance,
  staffToneToBadgeTone,
  type StaffDescriptor,
  type StaffTone
} from "@/features/staff/ui/staff-view-model";

const TONES: StaffTone[] = ["jade", "info", "ok", "orange", "danger", "neutral"];

function assertValid(d: StaffDescriptor, ctx: string) {
  assert.ok(d.label.length > 0 && d.label.length <= 50, `${ctx}: label không hợp lệ (${d.label})`);
  assert.ok(TONES.includes(d.tone), `${ctx}: tone ngoài tập (${d.tone})`);
}

test("isStaffRecentlyActive theo cửa sổ online dùng chung", () => {
  const now = Date.now();
  assert.equal(isStaffRecentlyActive(null, now), false);
  assert.equal(isStaffRecentlyActive(new Date(now - 1000).toISOString(), now), true);
  assert.equal(isStaffRecentlyActive(new Date(now - STAFF_ONLINE_WINDOW_MS - 1000).toISOString(), now), false);
});

test("mọi descriptor nghiệp vụ hợp lệ (label + tone)", () => {
  for (const s of ["on_time", "late", "early_leave", "overtime", "absent"] as const) assertValid(describeAttendanceState(s), `attendance:${s}`);
  assertValid(describeAttendanceState(null), "attendance:null");
  for (const s of ["gps", "qr", "wifi", "manual", "offline_sync"] as const) assertValid(describeAttendanceSource(s), `source:${s}`);
  for (const t of ["outside_location", "attendance_edit", "overtime", "shift_override", "manual_clock_in", "leave_request", "shift_swap", "device_restriction"] as const) assertValid(describeApprovalType(t), `approval:${t}`);
  for (const s of ["pending", "approved", "rejected", "cancelled"] as const) assertValid(describeApprovalStatus(s), `apprStatus:${s}`);
  for (const s of ["scheduled", "confirmed", "swapped", "cancelled", "completed"] as const) assertValid(describeShiftStatus(s), `shift:${s}`);
  for (const r of ["owner", "manager", "cashier", "waiter", "kitchen", "delivery", "marketing", "accountant"]) assertValid(describeRole(r), `role:${r}`);
});

test("fallback + parity xác định", () => {
  assert.equal(describeRole("xyz", "Tự định nghĩa").label, "Tự định nghĩa");
  assert.equal(describeRole("owner").label, "Chủ quán");
  assert.equal(describeAttendanceState("absent").tone, "danger");
  assert.deepEqual(describeApprovalType("leave_request"), describeApprovalType("leave_request"));
  assert.equal(staffToneToBadgeTone("jade"), "jade");
});

test("describeTodayAttendance kèm số phút", () => {
  assert.equal(describeTodayAttendance({ todayAttendanceState: "late", lateMinutesToday: 12, overtimeMinutesToday: 0 }).label, "Trễ 12 phút");
  assert.equal(describeTodayAttendance({ todayAttendanceState: "overtime", lateMinutesToday: 0, overtimeMinutesToday: 30 }).label, "Tăng ca 30 phút");
  assert.equal(describeTodayAttendance({ todayAttendanceState: "on_time", lateMinutesToday: 0, overtimeMinutesToday: 0 }).label, "Đúng giờ");
});
