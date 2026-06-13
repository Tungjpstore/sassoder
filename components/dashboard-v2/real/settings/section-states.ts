/* SectionStates — tính state badge cho từng section của Settings v2.
 * Đặt trong file riêng để adapter (client) và route (server) dùng chung.
 */

import type { Database } from "@/types/supabase";
import type { listStoreBranchesForManagement } from "@/services/branch-service";
import type { getRestaurantEntitlement } from "@/services/subscription-service";

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
type Entitlement = Awaited<ReturnType<typeof getRestaurantEntitlement>>;
type BranchSummaries = Awaited<ReturnType<typeof listStoreBranchesForManagement>>;

export type SettingsSectionKey =
  | "profile"
  | "ai_setup"
  | "hours"
  | "branches"
  | "tables"
  | "online"
  | "payments"
  | "billing"
  | "notifications"
  | "permissions"
  | "receipt"
  | "brand";

export type SettingsSectionTone = "ok" | "orange" | "info" | "neutral";

export type SettingsSectionState = {
  label: string;
  detail: string;
  tone: SettingsSectionTone;
};

export type SettingsSectionStates = Record<SettingsSectionKey, SettingsSectionState>;

function timeShort(value: string | null) {
  return value?.slice(0, 5) ?? "";
}

export function buildSettingsSectionStates(input: {
  restaurant: RestaurantRow;
  branches: BranchSummaries;
  entitlement: Entitlement;
  tableCount: number;
  notifyCoverage?: number;
}): SettingsSectionStates {
  const { restaurant, branches, entitlement, tableCount } = input;
  const profileLocationReady = Boolean(restaurant.address && restaurant.store_lat !== null && restaurant.store_lng !== null);
  const profileMissing =
    [restaurant.business_type, restaurant.hotline, restaurant.contact_email].filter((v) => !v).length +
    (profileLocationReady ? 0 : 1);
  const paymentConfigured = Boolean(restaurant.bank_code && restaurant.bank_account && restaurant.bank_account_name);
  const hoursConfigured = Boolean(restaurant.opening_time && restaurant.closing_time);
  const notifyCoverage = input.notifyCoverage ?? [restaurant.notify_new_order, restaurant.notify_payment_waiting].filter(Boolean).length;
  const onlineFlows = [restaurant.pickup_enabled, restaurant.delivery_enabled].filter(Boolean).length;
  const activeBranches = branches.filter((b) => b.is_active).length;
  const primary = branches.find((b) => b.is_primary && b.is_active) ?? branches.find((b) => b.is_active);

  return {
    profile:
      profileMissing === 0
        ? { label: "Đủ thông tin", detail: "Tên, liên hệ và toạ độ đều đã đầy đủ.", tone: "ok" }
        : { label: `Thiếu ${profileMissing} mục`, detail: "Bổ sung hồ sơ và ghim vị trí để mọi luồng khách dùng cùng một địa chỉ.", tone: "orange" },
    ai_setup:
      restaurant.logo_url && (restaurant.description || restaurant.receipt_footer)
        ? { label: "Brand sẵn sàng", detail: "Logo và slogan/mô tả đã đồng bộ với hồ sơ quán.", tone: "ok" }
        : { label: "Cần nhận diện", detail: "Tạo slogan, mô tả và logo rồi áp dụng vào hồ sơ quán.", tone: "neutral" },
    hours:
      hoursConfigured
        ? { label: "Đã cấu hình", detail: `${timeShort(restaurant.opening_time)} - ${timeShort(restaurant.closing_time)}`, tone: "ok" }
        : { label: "Chưa đủ giờ bán", detail: "Cần giờ mở và đóng cửa để đồng bộ trải nghiệm khách.", tone: "neutral" },
    branches:
      activeBranches > 0 && primary
        ? { label: `${activeBranches} hoạt động`, detail: `Mặc định: ${primary.name}.`, tone: "info" }
        : { label: "Đang khởi tạo", detail: "Hệ thống sẽ tạo một chi nhánh chính cho quán hiện hành.", tone: "orange" },
    tables:
      tableCount > 0
        ? { label: `${tableCount} bàn`, detail: restaurant.allow_legacy_qr ? "QR cũ đang bật cho khách quen." : "QR cũ đang tắt.", tone: "ok" }
        : { label: "Chưa có bàn", detail: "Tạo sơ đồ bàn trước khi in QR hoặc phục vụ tại chỗ.", tone: "orange" },
    online:
      !restaurant.online_ordering_enabled
        ? { label: "Đang tắt", detail: "Bật khi quán sẵn sàng nhận pickup hoặc delivery.", tone: "neutral" }
        : onlineFlows > 0
          ? { label: "Đang bán online", detail: `${onlineFlows === 2 ? "Pickup và delivery" : restaurant.pickup_enabled ? "Pickup" : "Delivery"} đang hoạt động.`, tone: "ok" }
          : { label: "Thiếu luồng phục vụ", detail: "Đã bật online nhưng chưa chọn pickup hoặc delivery.", tone: "orange" },
    payments:
      paymentConfigured
        ? { label: "VietQR sẵn sàng", detail: "Tài khoản nhận tiền đã đủ cho đơn tại bàn và đơn online.", tone: "ok" }
        : { label: "Thiếu tài khoản", detail: "Cần mã ngân hàng, số tài khoản và tên chủ tài khoản.", tone: "orange" },
    notifications:
      notifyCoverage === 2
        ? { label: "Cảnh báo đã bật", detail: "Đơn mới và đơn chờ thanh toán đã bật trong app.", tone: "ok" }
        : { label: "Thiếu luồng cảnh báo", detail: "Bật đủ cảnh báo trong app và kiểm tra Web Push trên thiết bị trực ca.", tone: "orange" },
    permissions: { label: "Đi tới staff", detail: "Thêm admin hoặc staff khi quán mở rộng quy mô.", tone: "neutral" },
    receipt:
      restaurant.receipt_footer || restaurant.receipt_show_qr
        ? { label: "Đã có mẫu in", detail: restaurant.receipt_show_qr ? "Hoá đơn đang kèm QR." : "Có thể thêm QR để dẫn khách quay lại.", tone: "ok" }
        : { label: "Mẫu in cơ bản", detail: "Có thể thêm lời cảm ơn và QR để hoàn thiện trải nghiệm sau bán.", tone: "neutral" },
    brand:
      restaurant.logo_url
        ? { label: "Có nhận diện", detail: "Logo đã hiện diện, tiếp theo có thể tinh chỉnh màu thương hiệu.", tone: "ok" }
        : { label: "Chưa có logo", detail: "Cập nhật màu và logo để đồng bộ toàn bộ điểm chạm.", tone: "neutral" },
    billing:
      !entitlement.allowed
        ? { label: "Cần gia hạn", detail: entitlement.reason ?? "Gói LogiVN chưa hợp lệ.", tone: "orange" }
        : entitlement.warning
          ? { label: "Sắp hết hạn", detail: entitlement.warning.message, tone: "orange" }
          : { label: "Đang hoạt động", detail: `${entitlement.planName} · ${entitlement.daysLeft} ngày còn lại`, tone: "ok" }
  };
}

export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSectionKey> = [
  "profile",
  "ai_setup",
  "hours",
  "branches",
  "tables",
  "online",
  "payments",
  "billing",
  "notifications",
  "permissions",
  "receipt",
  "brand"
];

export function isSettingsSection(value: string | string[] | undefined): value is SettingsSectionKey {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && (SETTINGS_SECTIONS as readonly string[]).includes(v);
}


/* Billing step keys + normalizer — đặt ở file server-safe để route page có thể
 * gọi mà không kéo theo client-only component. */
export type BillingStepKey = "current" | "compare" | "payment" | "processing" | "history" | "detail" | "manage";

const BILLING_STEPS: ReadonlyArray<BillingStepKey> = ["current", "compare", "payment", "processing", "history", "detail", "manage"];

export function normalizeBillingStep(value: string | string[] | undefined): BillingStepKey {
  const step = Array.isArray(value) ? value[0] : value;
  return typeof step === "string" && (BILLING_STEPS as readonly string[]).includes(step) ? (step as BillingStepKey) : "current";
}
