import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildOwnerStaffContextLine } from "./owner-staff-context";

test("owner staff context line includes payroll-ready HR snapshot facts", () => {
  const line = buildOwnerStaffContextLine({
    memberCount: 8,
    activeCount: 7,
    onlineCount: 3,
    currentlyClockedIn: 4,
    lateCount24h: 2,
    overtimeMinutes24h: 90,
    pendingApprovalCount: 3,
    pendingApprovalByType: { overtime: 2, leave_request: 1 },
    roleBreakdown: { waiter: 4, cashier: 2 },
    assignedBranchCount: 6,
    unassignedActiveCount: 1,
    averageReviewScore: 4.2,
    lowReviewCount: 1,
    draftReviewCount: 2,
    upcomingShiftCount: 6,
    clockedInStaff: [{ name: "An", lateMinutes: 10 }],
    pendingRequests: [{ name: "Bình", type: "overtime" }],
    upcomingShifts: [{ name: "Chi", scheduledDate: "2026-05-18" }]
  });

  assert.match(line, /Nhân sự: 7\/8 active/);
  assert.match(line, /4 đang check-in/);
  assert.match(line, /3 online/);
  assert.match(line, /2 lượt muộn 24h/);
  assert.match(line, /90 phút tăng ca/);
  assert.match(line, /3 yêu cầu chờ duyệt/);
  assert.match(line, /overtime:2/);
  assert.match(line, /waiter:4/);
  assert.match(line, /1 active chưa gán chi nhánh/);
  assert.match(line, /review TB 4\.2\/5/);
  assert.match(line, /An muộn 10p/);
  assert.match(line, /Bình:overtime/);
  assert.match(line, /6 ca sắp tới/);
});

test("owner prompt router keeps Vietnamese HR keywords mapped to staff intent", () => {
  const source = readFileSync("services/ai-prompt-router.ts", "utf8");

  for (const keyword of ["nhan su", "cham cong", "di tre", "nghi phep", "doi ca", "tang ca", "bang cong"]) {
    assert.match(source, new RegExp(`"${keyword}"`));
  }
});

test("owner staff context reports HR snapshot failures instead of zero staff", () => {
  const line = buildOwnerStaffContextLine({
    schemaReady: false,
    schemaErrors: ["staff_members: permission denied"]
  });

  assert.match(line, /snapshot HR chưa sẵn sàng/);
  assert.match(line, /không được kết luận là chưa có nhân viên/);
  assert.match(line, /staff_members/);
});

test("owner staff context keeps real counts when only optional HR side data fails", () => {
  const line = buildOwnerStaffContextLine({
    schemaReady: true,
    schemaErrors: ["staff_reviews: relation missing"],
    memberCount: 2,
    activeCount: 2,
    currentlyClockedIn: 1,
    onlineCount: 1,
    pendingApprovalByType: {}
  });

  assert.match(line, /Nhân sự: 2\/2 active/);
  assert.match(line, /Một phần dữ liệu HR chưa tải được/);
});

test("owner runtime staff snapshot includes branch and performance data", () => {
  const source = readFileSync("services/ai/runtime.ts", "utf8");

  assert.match(source, /staff_branch_assignments/);
  assert.match(source, /staff_reviews/);
  assert.match(source, /unassignedActiveCount/);
  assert.match(source, /averageReviewScore/);
  assert.match(source, /safeStaffAiQuery<any\[]>\(\s*"staff_members"/);
  assert.match(source, /buildStaffAiUnavailableSnapshot/);
  assert.match(source, /Chưa tải được snapshot nhân sự thật/);
});

test("owner staff actions route branch setup and coaching blockers", () => {
  const source = readFileSync("services/ai-agent-actions.ts", "utf8");

  assert.match(source, /open-staff-branch-setup/);
  assert.match(source, /open-staff-performance-coaching/);
});
