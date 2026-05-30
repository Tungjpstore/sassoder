export const STAFF_OPERATIONS_REALTIME_TABLES = [
  "users",
  "staff_members",
  "staff_branch_assignments",
  "shift_assignments",
  "attendance_logs",
  "attendance_approval_requests",
  "staff_activity_logs",
  "notifications"
] as const;

export function staffOperationsChannelName(restaurantId: string) {
  return `staff-operations:${restaurantId}`;
}
