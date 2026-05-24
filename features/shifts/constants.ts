export const SHIFT_PRESETS = ["morning", "afternoon", "night", "custom"] as const;
export const SHIFT_STATUSES = ["scheduled", "confirmed", "swapped", "cancelled", "completed"] as const;

export const SHIFT_PRESET_LABELS: Record<(typeof SHIFT_PRESETS)[number], string> = {
  morning: "Ca sáng",
  afternoon: "Ca chiều",
  night: "Ca tối",
  custom: "Ca tuỳ chỉnh"
};
