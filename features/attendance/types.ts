export type AttendanceState = (typeof import("./constants").ATTENDANCE_STATUSES)[number];
export type AttendanceApprovalType = (typeof import("./constants").ATTENDANCE_APPROVAL_TYPES)[number];

export type AttendanceRadiusPolicy = {
  minMeters: 50;
  maxMeters: 150;
};
