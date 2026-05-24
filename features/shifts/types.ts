export type ShiftPreset = (typeof import("./constants").SHIFT_PRESETS)[number];
export type ShiftStatus = (typeof import("./constants").SHIFT_STATUSES)[number];

export type ShiftScheduleWindow = {
  startTime: string;
  endTime: string;
  allowedLateMinutes: number;
  overtimeThresholdMinutes: number;
};
