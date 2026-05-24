import type { ProjectSurface, Tenant } from "@/features/platform-admin/types";

export const projectSurfaceKindLabel: Record<ProjectSurface["kind"], string> = {
  frontend: "Frontend",
  backend: "Backend",
  data: "Data",
  automation: "Automation",
  integration: "Integration"
};

export const moduleStatusLabel: Record<string, string> = {
  live: "Đang chạy",
  configured: "Đã cấu hình",
  partial: "Một phần",
  static: "Code-managed",
  planned: "Đã lên kế hoạch",
  blocked: "Chưa mở",
  needs_config: "Cần cấu hình",
  needs_review: "Cần rà soát"
};

export const tenantStatusLabel: Record<Tenant["platformStatus"], string> = {
  active: "Đang hoạt động",
  suspended: "Tạm dừng",
  deleted: "Đã xoá mềm"
};

export const subscriptionStatusLabel: Record<string, string> = {
  trialing: "Đang dùng thử",
  pending_payment: "Chờ thanh toán",
  active: "Đang gia hạn",
  past_due: "Quá hạn",
  suspended: "Tạm dừng",
  cancelled: "Đã huỷ",
  expired: "Hết hạn"
};

export const paymentStatusLabel: Record<string, string> = {
  waiting_confirm: "Chờ xác minh",
  confirmed: "Đã xác minh",
  rejected: "Từ chối",
  expired: "Hết hạn"
};

export const cutoverSourceLabel: Record<string, string> = {
  legacy: "Legacy fallback",
  mixed: "Mixed bridge",
  v2: "Billing v2"
};

export const cutoverStatusLabel: Record<string, string> = {
  healthy: "Ổn định",
  partial: "Đang chuyển tiếp",
  needs_attention: "Cần xử lý"
};
