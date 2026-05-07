import "server-only";

import type { AiAgentAction, AiAgentPlan } from "@/types/ai-agent";
import type { CustomerAiIntent, OwnerAiIntent } from "@/services/ai-prompt-router";

type OwnerAgentMeta = {
  route: string;
  title: string;
  summary: string;
  safetyNote: string;
};

const ownerAgentMeta: Record<OwnerAiIntent, OwnerAgentMeta> = {
  setup: {
    route: "/dashboard/settings",
    title: "Setup Commander",
    summary: "Quét readiness, tạo checklist và sinh bản nháp cấu hình để quán sẵn sàng bán thật.",
    safetyNote: "AI chỉ tạo bản nháp, chủ quán tự xác nhận trước khi lưu."
  },
  overview: {
    route: "/dashboard",
    title: "Shift Operator",
    summary: "Đọc nhịp ca hiện tại, gom cảnh báo và đưa một hành động ưu tiên.",
    safetyNote: "AI không tự xử lý đơn, chỉ mở đúng khu vực thao tác."
  },
  orders: {
    route: "/dashboard/orders",
    title: "Order Controller",
    summary: "Phân loại đơn, chỉ ra trạng thái tiếp theo và nút cần bấm.",
    safetyNote: "Nhận đơn, phục vụ và thanh toán vẫn cần thao tác thủ công."
  },
  kitchen: {
    route: "/dashboard/orders",
    title: "Kitchen Dispatcher",
    summary: "Ưu tiên đơn theo thời gian chờ, SLA ra món và nguy cơ quá hạn.",
    safetyNote: "AI không cam kết giờ ra món nếu dữ liệu thiếu."
  },
  menu: {
    route: "/dashboard/menu",
    title: "Menu Architect",
    summary: "Tối ưu danh mục, món, tag, mô tả và nháp menu từ AI.",
    safetyNote: "AI không tự thêm món vào database."
  },
  tables: {
    route: "/dashboard/tables",
    title: "Floor Manager",
    summary: "Theo dõi bàn, QR, hóa đơn mở và điểm cần nhân viên chú ý.",
    safetyNote: "AI không gộp/hủy bàn nếu chưa có action xác nhận."
  },
  payments: {
    route: "/dashboard/payments",
    title: "Payment Guard",
    summary: "Đối soát VietQR, tiền mặt và luồng chờ xác nhận.",
    safetyNote: "AI không bao giờ xác nhận đã nhận tiền thay chủ quán."
  },
  promotions: {
    route: "/dashboard/promotions",
    title: "Growth Campaigner",
    summary: "Tạo mã giảm có điều kiện, kênh hiển thị và chống lạm dụng.",
    safetyNote: "Khuyến mãi luôn cần min order, thời hạn và kiểm soát lợi nhuận."
  },
  staff: {
    route: "/dashboard/staff",
    title: "Staff Coordinator",
    summary: "Gợi ý phân quyền, ca làm và xử lý yêu cầu gọi nhân viên.",
    safetyNote: "AI ưu tiên least privilege, không chia sẻ tài khoản admin."
  },
  online: {
    route: "/dashboard/online",
    title: "Online Fulfillment Agent",
    summary: "Tối ưu pickup/delivery, bán kính, phí ship và tracking.",
    safetyNote: "Không bật nhận giao hàng thật nếu thiếu tọa độ/bán kính."
  },
  reservations: {
    route: "/dashboard/reservations",
    title: "Reservation Agent",
    summary: "Thiết kế giữ chỗ, tiền cọc, hết hạn và chống trùng lịch.",
    safetyNote: "AI không xác nhận giữ bàn nếu chưa có booking thật."
  },
  reports: {
    route: "/dashboard/analytics",
    title: "Revenue Analyst",
    summary: "Tóm tắt insight doanh thu, món bán chạy và báo cáo định kỳ.",
    safetyNote: "AI tách rõ doanh thu đã thanh toán và dữ liệu giả định."
  },
  settings: {
    route: "/dashboard/settings",
    title: "Settings Copilot",
    summary: "Rà soát hồ sơ quán, ngân hàng, thông báo, hóa đơn và gói dịch vụ.",
    safetyNote: "AI không yêu cầu API key hoặc thông tin bí mật."
  },
  security: {
    route: "/dashboard/settings",
    title: "Security Sentinel",
    summary: "Kiểm tra tenant scope, entitlement, spam, bug gói và thanh toán.",
    safetyNote: "AI chỉ đưa hướng phòng thủ, không mô tả khai thác chi tiết."
  },
  growth: {
    route: "/dashboard/promotions",
    title: "Brand Growth Agent",
    summary: "Tạo nội dung thương hiệu, slogan, chiến dịch và prompt ảnh an toàn.",
    safetyNote: "Prompt ảnh tránh chữ nhỏ để không lỗi typography."
  }
};

function action(input: AiAgentAction): AiAgentAction {
  return {
    safety: "safe",
    priority: "secondary",
    ...input
  };
}

function ownerOrderCode(order: Record<string, unknown>) {
  return String(order.shortId || String(order.id || "").slice(0, 8)).toUpperCase();
}

function ownerOrderMainItem(order: Record<string, unknown>) {
  const items = Array.isArray(order.items) ? (order.items as Array<Record<string, unknown>>) : [];
  const first = items[0];
  if (!first) return "";
  const quantity = Number(first.quantity ?? 0);
  return `${quantity > 0 ? `${quantity}x ` : ""}${String(first.name ?? "món")}`;
}

function buildOwnerDataActions(intent: OwnerAiIntent, snapshot?: unknown) {
  const data = (snapshot ?? {}) as {
    recentOrders?: Array<Record<string, unknown>>;
    tables?: { tables?: Array<Record<string, unknown>> };
    payments?: { waitingConfirm?: number; logs?: Array<Record<string, unknown>> };
    menu?: { unavailableCount?: number; categories?: Array<Record<string, unknown>> };
  };
  const actions: AiAgentAction[] = [];
  const orders = Array.isArray(data.recentOrders) ? data.recentOrders : [];

  if (intent === "orders" || intent === "overview" || intent === "kitchen") {
    const pending = orders.find((order) => order.status === "pending");
    if (pending?.id) {
      actions.push(
        action({
          id: `accept-order-${String(pending.id)}`,
          type: "api",
          label: `Nhận đơn #${ownerOrderCode(pending)}`,
          description: [String(pending.tableName || "Bàn"), ownerOrderMainItem(pending)].filter(Boolean).join(" · "),
          endpoint: `/api/admin/orders/${String(pending.id)}/accept`,
          body: { minutes: 15 },
          intent: "orders",
          priority: "primary",
          safety: "confirm"
        })
      );
    }

    const cooking = orders.find((order) => order.status === "ordering");
    if (cooking?.id) {
      actions.push(
        action({
          id: `complete-order-${String(cooking.id)}`,
          type: "api",
          label: `Đã phục vụ #${ownerOrderCode(cooking)}`,
          description: [String(cooking.tableName || "Bàn"), ownerOrderMainItem(cooking)].filter(Boolean).join(" · "),
          endpoint: `/api/admin/orders/${String(cooking.id)}/complete`,
          intent: "orders",
          priority: pending ? "secondary" : "primary",
          safety: "confirm"
        })
      );
    }

    const completed = orders.find((order) => order.status === "completed" || order.status === "waiting_payment");
    if (completed?.id && actions.length < 2) {
      actions.push(
        action({
          id: `open-payment-for-${String(completed.id)}`,
          type: "link",
          label: `Thanh toán #${ownerOrderCode(completed)}`,
          description: [String(completed.tableName || "Bàn"), `${Number(completed.total ?? 0).toLocaleString("vi-VN")}đ`].filter(Boolean).join(" · "),
          href: `/dashboard/orders?status=${String(completed.status)}`,
          intent: "payments",
          priority: pending || cooking ? "secondary" : "primary",
          safety: "manual_only"
        })
      );
    }
  }

  if (intent === "payments" || intent === "overview" || intent === "orders") {
    const waitingPayment = orders.find((order) => order.status === "waiting_confirm" || order.paymentStatus === "waiting_confirm");
    if (waitingPayment?.id) {
      actions.push(
        action({
          id: `confirm-payment-${String(waitingPayment.id)}`,
          type: "api",
          label: `Xác nhận tiền #${ownerOrderCode(waitingPayment)}`,
          description: `${String(waitingPayment.paymentMethod || "Thanh toán")} · ${Number(waitingPayment.total ?? 0).toLocaleString("vi-VN")}đ`,
          endpoint: `/api/admin/orders/${String(waitingPayment.id)}/confirm-payment`,
          intent: "payments",
          priority: "primary",
          safety: "manual_only"
        })
      );
    }
  }

  if ((intent === "overview" || intent === "orders") && actions.length === 0 && orders[0]?.id) {
    actions.push(
      action({
        id: `open-latest-order-${String(orders[0].id)}`,
        type: "link",
        label: `Mở đơn #${ownerOrderCode(orders[0])}`,
        description: [String(orders[0].tableName || "Bàn"), ownerOrderMainItem(orders[0])].filter(Boolean).join(" · "),
        href: `/dashboard/orders?order=${String(orders[0].id)}`,
        intent: "orders",
        priority: "primary"
      })
    );
  }

  if (intent === "tables" || intent === "overview") {
    const tables = Array.isArray(data.tables?.tables) ? data.tables.tables : [];
    const active = tables.find((table) => Number(table.activeOrderCount ?? 0) > 0);
    if (active) {
      actions.push(
        action({
          id: `open-table-${String(active.id)}`,
          type: "link",
          label: `Xem ${String(active.name || "bàn")}`,
          description: `${Number(active.activeOrderCount ?? 0)} đơn mở · ${Number(active.unpaidTotal ?? 0).toLocaleString("vi-VN")}đ`,
          href: `/dashboard/tables?table=${String(active.id)}`,
          intent: "tables"
        })
      );
    }
  }

  if (intent === "menu") {
    const categories = Array.isArray(data.menu?.categories) ? data.menu.categories : [];
    const unavailable: Array<Record<string, unknown>> = categories.flatMap((category) =>
      (Array.isArray(category.sampleItems) ? category.sampleItems : [])
        .filter((item) => !(item as Record<string, unknown>).available)
        .map((item) => ({ ...(item as Record<string, unknown>), categoryName: category.name }))
    );
    const item = unavailable[0];
    if (item) {
      actions.push(
        action({
          id: `review-menu-item-${String(item.id)}`,
          type: "link",
          label: `Kiểm tra món ${String(item.name)}`,
          description: `${String(item.categoryName || "Danh mục")} đang tạm hết hoặc ẩn khỏi menu khách.`,
          href: `/dashboard/menu?item=${String(item.id)}`,
          intent: "menu",
          priority: "primary"
        })
      );
    }
  }

  return actions;
}

export function buildOwnerAgentActions(intent: OwnerAiIntent, suggestions: string[] = [], snapshot?: unknown) {
  const route = ownerAgentMeta[intent].route;
  const dataActions = buildOwnerDataActions(intent, snapshot);
  const actions: AiAgentAction[] = [
    ...dataActions,
    action({
      id: `open-${intent}`,
      type: "link",
      label: "Mở đúng màn",
      description: "Đi thẳng tới khu vực liên quan trong dashboard.",
      href: route,
      intent,
      priority: "primary"
    })
  ];

  if (suggestions[0]) {
    actions.push(
      action({
        id: `ask-next-${intent}`,
        type: "prompt",
        label: "AI phân tích tiếp",
        description: suggestions[0],
        prompt: suggestions[0],
        intent,
        priority: "primary"
      })
    );
  }

  if (intent === "setup" || intent === "settings") {
    actions.push(
      action({
        id: "setup-plan-express",
        type: "api",
        label: "Tạo kế hoạch 30 phút",
        description: "AI quét readiness và trả checklist setup theo thứ tự.",
        endpoint: "/api/admin/ai/setup-plan",
        body: { mode: "express" },
        intent: "setup",
        priority: "primary"
      }),
      action({
        id: "draft-brand-profile",
        type: "api",
        label: "Tạo nháp thương hiệu",
        description: "Slogan, mô tả, giọng thương hiệu và prompt logo/menu cover.",
        endpoint: "/api/admin/ai/setup-draft",
        body: { kind: "brand_profile" },
        intent: "setup"
      })
    );
  }

  if (intent === "menu") {
    actions.push(
      action({
        id: "draft-menu-blueprint",
        type: "api",
        label: "Tạo khung menu",
        description: "AI đề xuất danh mục, món mẫu, mô tả và tag bán hàng.",
        endpoint: "/api/admin/ai/setup-draft",
        body: { kind: "menu_blueprint" },
        intent: "menu",
        priority: "primary"
      }),
      action({
        id: "open-menu-ocr",
        type: "link",
        label: "Mở nhập menu/OCR",
        description: "Tải ảnh menu giấy hoặc thêm món trong dashboard.",
        href: "/dashboard/menu",
        intent: "menu"
      })
    );
  }

  if (intent === "online") {
    actions.push(
      action({
        id: "draft-online-delivery",
        type: "api",
        label: "Gợi ý cấu hình ship",
        description: "Bán kính, phí ship, free ship và chế độ thanh toán.",
        endpoint: "/api/admin/ai/setup-draft",
        body: { kind: "online_delivery" },
        intent: "online",
        priority: "primary"
      }),
      action({
        id: "open-online-settings",
        type: "link",
        label: "Mở cài đặt online",
        href: "/dashboard/settings?section=online",
        intent: "online"
      })
    );
  }

  if (intent === "reservations") {
    actions.push(
      action({
        id: "draft-reservation-policy",
        type: "api",
        label: "Tạo chính sách đặt bàn",
        description: "Giữ chỗ, cọc, hết hạn và chống trùng lịch.",
        endpoint: "/api/admin/ai/setup-draft",
        body: { kind: "reservation_policy" },
        intent: "reservations",
        priority: "primary"
      })
    );
  }

  if (intent === "promotions" || intent === "growth") {
    actions.push(
      action({
        id: "draft-promotion-launch",
        type: "api",
        label: "Tạo chiến dịch mã giảm",
        description: "Mã giảm, điều kiện, kênh hiển thị và chống lạm dụng.",
        endpoint: "/api/admin/ai/setup-draft",
        body: { kind: "promotion_launch" },
        intent: "promotions",
        priority: "primary"
      }),
      action({
        id: "generate-branding",
        type: "api",
        label: "Tạo slogan/logo prompt",
        description: "Tạo nội dung thương hiệu dùng ngay.",
        endpoint: "/api/admin/ai/branding",
        body: { tone: "hiện đại, công nghệ, tinh thần Việt" },
        intent: "growth"
      })
    );
  }

  if (intent === "payments") {
    actions.push(
      action({
        id: "open-payment-settings",
        type: "link",
        label: "Kiểm tra VietQR",
        description: "Mở cấu hình ngân hàng nhận chuyển khoản.",
        href: "/dashboard/settings?section=payments",
        intent: "payments",
        safety: "manual_only"
      })
    );
  }

  if (intent === "tables") {
    actions.push(
      action({
        id: "open-qr-print",
        type: "link",
        label: "In/tải QR bàn",
        description: "Mở màn bàn & QR để tải template in.",
        href: "/dashboard/tables",
        intent: "tables",
        priority: "primary"
      })
    );
  }

  if (intent === "reports") {
    actions.push(
      action({
        id: "open-report-schedule",
        type: "link",
        label: "Lịch gửi báo cáo",
        href: "/dashboard/settings?section=notifications",
        intent: "reports"
      })
    );
  }

  if (intent === "staff") {
    actions.push(
      action({
        id: "open-staff-management",
        type: "link",
        label: "Quản lý nhân viên",
        description: "Mời nhân viên và phân quyền theo least privilege.",
        href: "/dashboard/staff",
        intent: "staff"
      })
    );
  }

  if (intent === "security") {
    actions.push(
      action({
        id: "ask-security-audit",
        type: "prompt",
        label: "Audit bảo mật nhanh",
        prompt: "Audit nhanh rủi ro tenant, bug gói, spam đặt món và thanh toán trong ca hiện tại.",
        intent: "security",
        safety: "manual_only"
      })
    );
  }

  return actions.slice(0, 5);
}

export function buildOwnerAgentPlan(intent: OwnerAiIntent, actions: AiAgentAction[]): AiAgentPlan {
  const meta = ownerAgentMeta[intent];
  const nextBestAction = actions.find((item) => item.priority === "primary") ?? actions[0] ?? null;
  return {
    title: meta.title,
    summary: meta.summary,
    focusArea: meta.route,
    nextBestActionId: nextBestAction?.id ?? null,
    safetyNote: meta.safetyNote,
    confidence: actions.length >= 3 ? "high" : actions.length > 0 ? "medium" : "low"
  };
}

const customerIntentMeta: Record<CustomerAiIntent, Omit<AiAgentPlan, "nextBestActionId">> = {
  menu_discovery: {
    title: "Menu Guide",
    summary: "Gợi ý món từ menu thật và đưa khách tới đúng danh mục/giỏ.",
    focusArea: "menu",
    safetyNote: "AI chỉ gợi ý, khách tự thêm món.",
    confidence: "medium"
  },
  cart: {
    title: "Cart Assistant",
    summary: "Giúp kiểm tra giỏ, số lượng, ghi chú và gửi đơn.",
    focusArea: "cart",
    safetyNote: "AI không tự sửa giỏ nếu khách chưa bấm.",
    confidence: "medium"
  },
  order_status: {
    title: "Order Tracker",
    summary: "Giải thích trạng thái đơn và mở màn theo dõi.",
    focusArea: "orders",
    safetyNote: "AI không nói đơn đã xác nhận nếu dữ liệu chưa có.",
    confidence: "medium"
  },
  payment: {
    title: "Payment Guide",
    summary: "Mở hóa đơn, QR hoặc hướng dẫn tiền mặt theo trạng thái thật.",
    focusArea: "payment",
    safetyNote: "AI không xác nhận đã nhận tiền.",
    confidence: "medium"
  },
  staff_call: {
    title: "Service Request",
    summary: "Gửi khách tới thao tác gọi nhân viên nhanh.",
    focusArea: "staff_call",
    safetyNote: "Có thể cần xác nhận để tránh spam gọi nhân viên.",
    confidence: "medium"
  },
  delivery: {
    title: "Delivery Guide",
    summary: "Dẫn khách tới link đặt online, địa chỉ và theo dõi giao hàng.",
    focusArea: "delivery",
    safetyNote: "Không cam kết nhận giao nếu ngoài bán kính.",
    confidence: "medium"
  },
  reservation: {
    title: "Reservation Guide",
    summary: "Dẫn khách tới đặt bàn và cọc giữ chỗ nếu quán bật.",
    focusArea: "reservation",
    safetyNote: "AI không tự giữ bàn.",
    confidence: "medium"
  },
  promotion: {
    title: "Promotion Helper",
    summary: "Giải thích mã giảm, điều kiện và đưa khách về menu/giỏ.",
    focusArea: "promotion",
    safetyNote: "Chỉ dùng mã có trong dữ liệu.",
    confidence: "medium"
  },
  allergy: {
    title: "Safe Ordering",
    summary: "Nhắc ghi chú dị ứng/ăn kiêng và gọi nhân viên khi cần.",
    focusArea: "allergy",
    safetyNote: "Không thay thế tư vấn y tế.",
    confidence: "medium"
  }
};

type CustomerActionContext = {
  menuSnapshot?: unknown;
  cart?: unknown;
  orderStatus?: unknown;
  message?: string;
};

function foldCustomerText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function collectMenuItems(menuSnapshot?: unknown) {
  const snapshot = (menuSnapshot ?? {}) as { categories?: Array<Record<string, unknown>> };
  const categories = Array.isArray(snapshot.categories) ? snapshot.categories : [];
  return categories.flatMap((category) =>
    (Array.isArray(category.items) ? category.items : []).map((item) => {
      const record = item as Record<string, unknown>;
      return {
        id: String(record.id ?? ""),
        categoryId: String(record.categoryId ?? ""),
        categoryName: String(record.categoryName ?? category.name ?? ""),
        name: String(record.name ?? ""),
        price: Number(record.price ?? 0),
        image: typeof record.image === "string" ? record.image : null
      };
    })
  ).filter((item) => item.id && item.name);
}

function customerOrderPaymentAction(orderStatus?: unknown) {
  const order = (orderStatus ?? {}) as Record<string, unknown>;
  const status = String(order.status ?? "");
  const paymentStatus = String(order.paymentStatus ?? order.payment_status ?? "");
  const paymentMethod = String(order.paymentMethod ?? order.payment_method ?? "");
  if ((status === "waiting_payment" || paymentStatus === "waiting_payment") && paymentMethod === "QR") {
    return action({
      id: "customer-mark-paid",
      type: "ui",
      label: "Tôi đã thanh toán",
      description: "Báo quán kiểm tra VietQR.",
      uiTarget: "payment",
      body: { action: "mark_paid" },
      intent: "payment",
      priority: "primary",
      safety: "confirm"
    });
  }
  return null;
}

function rankCustomerItems(menuSnapshot: unknown, message?: string) {
  const terms = foldCustomerText(message ?? "")
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length >= 2);

  return collectMenuItems(menuSnapshot)
    .map((item, index) => {
      const folded = foldCustomerText(`${item.name} ${item.categoryName}`);
      const termScore = terms.reduce((sum, term) => sum + (folded.includes(term) ? 4 : 0), 0);
      const cafeScore = /cafe|ca phe|coffee|bac xiu/.test(folded) ? 2 : 0;
      const priceScore = item.price > 0 && item.price <= 65000 ? 1 : 0;
      return { item, score: termScore + cafeScore + priceScore - index * 0.01 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.item);
}

export function buildCustomerAgentActions(intent: CustomerAiIntent, restaurantSlug: string, context: CustomerActionContext = {}) {
  const actions: AiAgentAction[] = [];
  const recommendedItems = rankCustomerItems(context.menuSnapshot, context.message);

  if (intent === "menu_discovery" || intent === "promotion" || intent === "allergy") {
    recommendedItems.forEach((item, index) => {
      actions.push(
        action({
          id: `customer-add-item-${item.id}`,
          type: "ui",
          label: `Thêm ${item.name}`,
          description: `${item.categoryName}${item.price ? ` · ${item.price.toLocaleString("vi-VN")}đ` : ""}`,
          uiTarget: "add_item",
          body: {
            menuItemId: item.id,
            categoryId: item.categoryId,
            name: item.name,
            price: item.price,
            image: item.image
          },
          intent,
          priority: index === 0 ? "primary" : "secondary"
        })
      );
    });

    actions.push(
      action({
        id: "customer-open-menu",
        type: "ui",
        label: recommendedItems.length ? "Chọn món khác" : "Xem thực đơn",
        uiTarget: "menu",
        priority: recommendedItems.length ? "secondary" : "primary"
      })
    );
  }

  if (intent === "cart" || intent === "allergy") {
    actions.push(
      action({
        id: "customer-open-cart",
        type: "ui",
        label: "Mở giỏ món",
        description: "Chỉnh số lượng, ghi chú món hoặc gửi đơn.",
        uiTarget: "cart",
        priority: "primary"
      })
    );
  }

  if (intent === "order_status" || intent === "payment") {
    const paymentAction = customerOrderPaymentAction(context.orderStatus);
    if (paymentAction) actions.push(paymentAction);

    actions.push(
      action({
        id: "customer-open-orders",
        type: "ui",
        label: "Theo dõi đơn/hóa đơn",
        uiTarget: intent === "payment" ? "payment" : "orders",
        priority: "primary"
      })
    );
  }

  if (intent === "staff_call") {
    actions.push(
      action({
        id: "customer-call-staff",
        type: "ui",
        label: "Gọi nhân viên ngay",
        description: "Gửi yêu cầu hỗ trợ tới dashboard của quán.",
        uiTarget: "staff_call",
        priority: "primary",
        safety: "confirm"
      })
    );
  }

  if (intent === "delivery") {
    actions.push(
      action({
        id: "customer-open-online",
        type: "link",
        label: "Mở link đặt online",
        href: `/r/${restaurantSlug}`,
        priority: "primary"
      })
    );
  }

  if (intent === "reservation") {
    actions.push(
      action({
        id: "customer-open-reservation",
        type: "link",
        label: "Đặt bàn trước",
        href: `/r/${restaurantSlug}/reserve`,
        priority: "primary"
      })
    );
  }

  actions.push(
    action({
      id: `customer-ask-more-${intent}`,
      type: "prompt",
      label: "AI hướng dẫn tiếp",
      prompt: "Hướng dẫn tôi bước tiếp theo thật ngắn.",
      intent
    })
  );

  return actions.slice(0, 4);
}

export function buildCustomerAgentPlan(intent: CustomerAiIntent, actions: AiAgentAction[]): AiAgentPlan {
  const meta = customerIntentMeta[intent];
  const nextBestAction = actions.find((item) => item.priority === "primary") ?? actions[0] ?? null;
  return {
    ...meta,
    nextBestActionId: nextBestAction?.id ?? null
  };
}
