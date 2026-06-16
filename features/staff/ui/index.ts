/* HR UI Kit — barrel. Điểm nhập DUY NHẤT dùng chung cho HR_Workspace (admin) và
 * PWA_Staff_App. Nguồn ngữ nghĩa (label/tone/icon) từ staff-view-model. */

// View-model dùng chung (Req 3): types + helpers + describe* + tone mapping.
export * from "./staff-view-model";

// Component dùng chung (Req 2).
export { StatusPill } from "./status-pill";
export { ShiftChip, MetricStrip, ListRow, StaffIdentityCard, ApprovalCard, FormField } from "./primitives";
export { AttendanceClock } from "./attendance-clock";
export type { AttendanceSourceChip, AttendanceSourceKey, AttendanceSourceStatus } from "./attendance-clock";
export { PermissionMatrix } from "./permission-matrix";

// Re-export primitives/overlay v2 để kit là một điểm nhập duy nhất.
export { EmptyState, Badge, MetricCard } from "@/components/dashboard-v2/primitives";
export { Button, ButtonLink } from "@/components/dashboard-v2/button";
export { Drawer, Sheet, Modal } from "@/components/dashboard-v2/overlay";
