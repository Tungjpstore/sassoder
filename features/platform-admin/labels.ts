import type { ProjectSurface, Tenant } from "@/features/platform-admin/types";

export const projectSurfaceKindLabel: Record<ProjectSurface["kind"], string> = {
  frontend: "Giao diện",
  backend: "Dịch vụ backend",
  data: "Dữ liệu",
  automation: "Tự động hoá",
  integration: "Tích hợp ngoài"
};

export const moduleStatusLabel: Record<string, string> = {
  live: "Đang chạy",
  configured: "Đã cấu hình",
  partial: "Một phần",
  static: "Quản lý bằng code",
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
  legacy: "Fallback cũ",
  mixed: "Cầu nối chuyển tiếp",
  v2: "Billing v2"
};

export const cutoverStatusLabel: Record<string, string> = {
  healthy: "Ổn định",
  partial: "Đang chuyển tiếp",
  needs_attention: "Cần xử lý"
};
