import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const attendanceServiceSource = readFileSync("features/attendance/services/attendance-service.ts", "utf8");
const eventBusSource = readFileSync("services/operational-event-bus.ts", "utf8");
const selfServiceSource = readFileSync("features/staff/services/staff-self-service.ts", "utf8");
const telegramConnectionSource = readFileSync("services/telegram-connection-service.ts", "utf8");
const migrationSql = readFileSync("supabase/migrations/20260618095338_staff_hr_attendance_event_outbox.sql", "utf8");

function functionBody(source: string, name: string) {
  const match = new RegExp(`(?:export\\s+)?async function ${name}\\(`).exec(source);
  assert.ok(match?.index !== undefined, `${name} should exist`);

  const paramsStart = source.indexOf("(", match.index);
  let parenDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (parenDepth === 0) {
      paramsEnd = index;
      break;
    }
  }

  const bodyStart = paramsEnd >= 0 ? source.indexOf("{", paramsEnd) : -1;
  assert.ok(bodyStart > match.index, `${name} should have a body`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index + 1);
  }

  throw new Error(`Could not parse body for ${name}`);
}

test("operational event bus exposes a durable outbox-only path for staff attendance", () => {
  assert.match(eventBusSource, /export async function recordOperationalEventOutbox/);
  assert.match(eventBusSource, /recordOperationalOutbox\(normalizeOperationalEvent\(event\)\)/);
  assert.match(eventBusSource, /type: "staff\.checked_out"/);
  assert.match(eventBusSource, /type === "staff\.checked_out"/);
});

test("attendance clock-in and clock-out enqueue durable staff attendance events", () => {
  assert.match(attendanceServiceSource, /recordOperationalEventOutbox/);
  assert.match(attendanceServiceSource, /async function enqueueAttendanceOperationalEvent/);
  assert.match(attendanceServiceSource, /type: "staff\.checked_in"/);
  assert.match(attendanceServiceSource, /eventId: `staff\.checked_in:\$\{attendance\.id\}`/);
  assert.match(attendanceServiceSource, /type: "staff\.checked_out"/);
  assert.match(attendanceServiceSource, /eventId: `staff\.checked_out:\$\{updatedAttendance\.id\}`/);
  assert.match(attendanceServiceSource, /context,\s*eventId: event\.eventId,\s*type: event\.type/s);
});

test("attendance approval creation publishes staff request events for Telegram/realtime", () => {
  const helperBody = functionBody(attendanceServiceSource, "enqueueAttendanceApprovalEvent");
  assert.match(helperBody, /type: "staff\.request_created"/);
  assert.match(helperBody, /staffRequest:/);
  assert.match(helperBody, /"publish"/);

  for (const functionName of [
    "createOutsideLocationApproval",
    "createShiftOverrideApproval",
    "createDeviceRestrictionApproval",
    "createAttendanceSourceApproval",
    "notifyManualAdjustmentApproval"
  ]) {
    assert.match(functionBody(attendanceServiceSource, functionName), /enqueueAttendanceApprovalEvent\(/, `${functionName} should enqueue a staff request event`);
  }
});

test("staff incident reports await the operational event path instead of fire-and-forget", () => {
  const body = functionBody(selfServiceSource, "createStaffIncidentReport");
  assert.match(body, /await publishOperationalEvent\(/);
  assert.doesNotMatch(body, /void publishOperationalEvent\(/);
});

test("staff checked-out Telegram policy is seeded for existing and future restaurants", () => {
  assert.match(telegramConnectionSource, /eventType: "staff\.checked_out"/);
  assert.match(telegramConnectionSource, /label: "Nhân sự kết ca"/);
  assert.match(migrationSql, /'staff\.checked_out'/);
  assert.match(migrationSql, /public\.telegram_notification_policies/);
  assert.match(migrationSql, /on conflict \(restaurant_id, \(coalesce\(branch_id/i);
  assert.match(migrationSql, /required_permission = excluded\.required_permission/i);
});
