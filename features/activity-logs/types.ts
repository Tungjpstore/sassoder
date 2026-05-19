export type ActivityLogSeverity = (typeof import("./constants").ACTIVITY_LOG_SEVERITIES)[number];
export type ActivityLogEntityType = (typeof import("./constants").ACTIVITY_LOG_ENTITY_TYPES)[number];

export type ActivityLogSnapshot = {
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};
