import "server-only";

import type { Database } from "@/types/supabase";

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];

export type SetupReadinessItem = {
  key: string;
  label: string;
  group: "profile" | "brand" | "menu" | "tables" | "payments" | "online" | "reservations" | "reports" | "security";
  status: "done" | "missing" | "warning";
  priority: "critical" | "high" | "medium" | "low";
  action: string;
  route: string;
  weight: number;
};

export type StoreSetupReadiness = {
  score: number;
  completedWeight: number;
  totalWeight: number;
  completedCount: number;
  totalCount: number;
  criticalMissing: SetupReadinessItem[];
  nextActions: SetupReadinessItem[];
  items: SetupReadinessItem[];
  groupSummary: Array<{
    group: SetupReadinessItem["group"];
    done: number;
    total: number;
    score: number;
  }>;
};

export type StoreSetupMetrics = {
  tableCount: number;
  menuItemCount: number;
  categoryCount?: number;
  staffCount?: number;
  promotionCount?: number;
};

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function statusFrom(condition: boolean, warning = false): SetupReadinessItem["status"] {
  if (condition) return "done";
  return warning ? "warning" : "missing";
}

function item(input: Omit<SetupReadinessItem, "status"> & { done: boolean; warning?: boolean }): SetupReadinessItem {
  const { done, warning, ...rest } = input;
  return {
    ...rest,
    status: statusFrom(done, warning)
  };
}

export function buildStoreSetupReadiness(restaurant: RestaurantRow, metrics: StoreSetupMetrics): StoreSetupReadiness {
  const items: SetupReadinessItem[] = [
    item({
      key: "profile-name",
      group: "profile",
      label: "Tên và loại hình quán",
      done: hasText(restaurant.name) && Boolean(restaurant.business_type),
      priority: "critical",
      action: "Cập nhật tên quán và loại hình để AI gợi ý menu/giá đúng ngữ cảnh.",
      route: "/dashboard/settings?section=profile",
      weight: 10
    }),
    item({
      key: "profile-contact",
      group: "profile",
      label: "Hotline và email nhận thông báo",
      done: hasText(restaurant.hotline) && hasText(restaurant.contact_email),
      priority: "high",
      action: "Thêm hotline và email để in hóa đơn, gửi báo cáo và hỗ trợ khách.",
      route: "/dashboard/settings?section=profile",
      weight: 8
    }),
    item({
      key: "profile-address",
      group: "profile",
      label: "Địa chỉ quán",
      done: hasText(restaurant.address),
      priority: restaurant.delivery_enabled ? "critical" : "medium",
      action: "Thêm địa chỉ để tạo QR/link, hóa đơn và tính khoảng cách giao hàng.",
      route: "/dashboard/settings?section=profile",
      weight: 8
    }),
    item({
      key: "brand-logo",
      group: "brand",
      label: "Logo và mô tả thương hiệu",
      done: hasText(restaurant.logo_url) && hasText(restaurant.description),
      priority: "medium",
      action: "Dùng AI tạo mô tả/slogan/logo prompt, sau đó tải logo thật lên hồ sơ quán.",
      route: "/dashboard/settings?section=brand",
      weight: 5
    }),
    item({
      key: "menu-items",
      group: "menu",
      label: "Menu có món thật",
      done: metrics.menuItemCount > 0,
      priority: "critical",
      action: "Thêm món thủ công hoặc dùng AI OCR menu giấy tại /dashboard/menu.",
      route: "/dashboard/menu",
      weight: 14
    }),
    item({
      key: "tables",
      group: "tables",
      label: "Bàn và QR",
      done: metrics.tableCount > 0,
      priority: "critical",
      action: "Tạo bàn, kiểm tra QR và in template QR để khách scan gọi món.",
      route: "/dashboard/tables",
      weight: 14
    }),
    item({
      key: "payments-vietqr",
      group: "payments",
      label: "Ngân hàng VietQR",
      done: hasText(restaurant.bank_code) && hasText(restaurant.bank_account) && hasText(restaurant.bank_account_name),
      priority: "critical",
      action: "Cấu hình ngân hàng nhận tiền để VietQR, cọc đặt bàn và gia hạn hoạt động đúng.",
      route: "/dashboard/settings?section=payments",
      weight: 13
    }),
    item({
      key: "notifications",
      group: "security",
      label: "Thông báo đơn và thanh toán",
      done: restaurant.notify_new_order && restaurant.notify_payment_waiting,
      warning: true,
      priority: "high",
      action: "Bật thông báo để không bỏ sót đơn mới hoặc đơn chờ xác nhận thanh toán.",
      route: "/dashboard/settings?section=notifications",
      weight: 7
    }),
    item({
      key: "online-mode",
      group: "online",
      label: "Đặt món online/pickup/delivery",
      done: !restaurant.online_ordering_enabled || restaurant.pickup_enabled || restaurant.delivery_enabled,
      warning: restaurant.online_ordering_enabled,
      priority: restaurant.online_ordering_enabled ? "critical" : "low",
      action: "Nếu bật đặt online, cần chọn ít nhất một luồng: khách đến lấy hoặc giao hàng.",
      route: "/dashboard/settings?section=online",
      weight: restaurant.online_ordering_enabled ? 8 : 3
    }),
    item({
      key: "delivery-coordinates",
      group: "online",
      label: "Tọa độ và phí giao hàng",
      done:
        !restaurant.delivery_enabled ||
        (typeof restaurant.store_lat === "number" &&
          typeof restaurant.store_lng === "number" &&
          Number(restaurant.delivery_radius_km) > 0 &&
          Number(restaurant.delivery_fee_per_km) >= 0),
      warning: restaurant.delivery_enabled,
      priority: restaurant.delivery_enabled ? "critical" : "low",
      action: "Tự lấy tọa độ từ địa chỉ, đặt bán kính giao và phí ship để tránh nhận đơn ngoài vùng.",
      route: "/dashboard/settings?section=online",
      weight: restaurant.delivery_enabled ? 8 : 3
    }),
    item({
      key: "reservations",
      group: "reservations",
      label: "Đặt bàn và cọc giữ chỗ",
      done: !restaurant.reservations_enabled || Number(restaurant.reservation_hold_minutes) > 0,
      warning: restaurant.reservations_enabled,
      priority: restaurant.reservations_enabled ? "high" : "low",
      action: "Nếu bật đặt bàn, cấu hình thời gian giữ chỗ, thời lượng bàn, grace time và cọc nếu cần.",
      route: "/dashboard/reservations",
      weight: restaurant.reservations_enabled ? 7 : 2
    }),
    item({
      key: "reports",
      group: "reports",
      label: "Báo cáo và hóa đơn",
      done: hasText(restaurant.receipt_footer) && hasText(restaurant.contact_email),
      warning: true,
      priority: "medium",
      action: "Cấu hình dòng cuối hóa đơn và email để nhận báo cáo tuần/tháng.",
      route: "/dashboard/settings?section=receipt",
      weight: 5
    })
  ];

  const totalWeight = items.reduce((sum, next) => sum + next.weight, 0);
  const completedWeight = items.reduce((sum, next) => sum + (next.status === "done" ? next.weight : 0), 0);
  const groups = [...new Set(items.map((next) => next.group))];

  return {
    score: totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0,
    completedWeight,
    totalWeight,
    completedCount: items.filter((next) => next.status === "done").length,
    totalCount: items.length,
    criticalMissing: items.filter((next) => next.status !== "done" && next.priority === "critical"),
    nextActions: items
      .filter((next) => next.status !== "done")
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5),
    items,
    groupSummary: groups.map((group) => {
      const groupItems = items.filter((next) => next.group === group);
      const done = groupItems.filter((next) => next.status === "done").length;
      return {
        group,
        done,
        total: groupItems.length,
        score: Math.round((done / groupItems.length) * 100)
      };
    })
  };
}
