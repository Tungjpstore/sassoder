export const ATTENDANCE_STATUSES = ["on_time", "late", "early_leave", "overtime", "absent"] as const;
export const ATTENDANCE_APPROVAL_TYPES = [
  "outside_location",
  "attendance_edit",
  "overtime",
  "shift_override",
  "manual_clock_in"
] as const;

export const ATTENDANCE_STATE_LABELS: Record<(typeof ATTENDANCE_STATUSES)[number], string> = {
  on_time: "Đúng giờ",
  late: "Đi muộn",
  early_leave: "Về sớm",
  overtime: "Tăng ca",
  absent: "Vắng mặt"
};
