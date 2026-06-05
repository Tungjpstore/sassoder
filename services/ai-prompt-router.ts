import "server-only";

import { buildOwnerStaffContextLine } from "@/lib/ai/owner-staff-context";
import { passportDigest, sanitizeOperationalPassport } from "@/lib/ai/operational-passport";

export type AiPromptMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiRestaurantContext = {
  id: string;
  name: string;
  slug: string;
  business_type: string | null;
  address: string | null;
  hotline: string | null;
  description: string | null;
  opening_time?: string | null;
  closing_time?: string | null;
};

export type OwnerAiIntent =
  | "setup"
  | "overview"
  | "orders"
  | "kitchen"
  | "menu"
  | "inventory"
  | "tables"
  | "payments"
  | "promotions"
  | "staff"
  | "online"
  | "reservations"
  | "reports"
  | "settings"
  | "security"
  | "growth";

export type CustomerAiIntent =
  | "guest_faq"
  | "menu_discovery"
  | "cart"
  | "order_status"
  | "payment"
  | "staff_call"
  | "delivery"
  | "reservation"
  | "promotion"
  | "allergy";

export type StoreSetupDraftKind =
  | "brand_profile"
  | "menu_blueprint"
  | "online_delivery"
  | "reservation_policy"
  | "promotion_launch"
  | "voice_ops";

type IntentConfig<TIntent extends string> = {
  intent: TIntent;
  label: string;
  description: string;
  dataScope?: string;
  guardrails?: string[];
  systemAddendum: string;
  responseContract: string;
  suggestions: string[];
};

type StoreSetupDraftConfig = {
  kind: StoreSetupDraftKind;
  label: string;
  description: string;
  route: string;
  plan: "pro" | "premium" | "any";
  outputFocus: string;
  guardrails: string[];
};

type IntentRouteRule<TIntent extends string> = {
  intent: TIntent;
  patterns: string[];
  weight: number;
};

type OwnerRoutePlan = {
  dataNeeds: string[];
  tools: string[];
  operatingActions: string[];
  actionContract: string;
  outputMode: "answer" | "diagnose" | "draft" | "queue" | "apply";
  missingDataFallback: string;
};

const ownerRoutePlans: Record<OwnerAiIntent, OwnerRoutePlan> = {
  setup: {
    dataNeeds: ["restaurant setup readiness", "settings", "menu count", "tables/QR", "payment config", "online/reservation flags"],
    tools: ["analyze_dashboard_area", "generate_store_setup_plan"],
    operatingActions: ["open settings", "open menu", "open tables", "create setup checklist"],
    actionContract: "Trả về blocker đầu tiên, route cần mở và checklist setup; không tự bật cấu hình bán thật.",
    outputMode: "queue",
    missingDataFallback: "Nếu thiếu readiness/settings, tạo checklist setup ngắn và dẫn chủ quán tới Cài đặt."
  },
  overview: {
    dataNeeds: ["summary24h", "recentOrders", "tables", "payments", "inventory", "operationInsights"],
    tools: ["analyze_dashboard_area"],
    operatingActions: ["run operational sweep", "create insight queue", "open priority screen"],
    actionContract: "Chọn tối đa 1 việc ưu tiên, nêu dữ liệu đã đọc và queue/deck cần mở nếu cần xử lý tiếp.",
    outputMode: "diagnose",
    missingDataFallback: "Nếu chưa có snapshot, yêu cầu chạy quét AI vận hành ngay."
  },
  orders: {
    dataNeeds: ["recentOrders", "order status", "payment status", "table/customer", "service_due_at"],
    tools: ["analyze_dashboard_area"],
    operatingActions: ["open orders", "prioritize pending orders", "create follow-up checklist"],
    actionContract: "Nêu mã đơn/bàn nếu có, thao tác an toàn tiếp theo và không tự chuyển trạng thái thanh toán.",
    outputMode: "apply",
    missingDataFallback: "Nếu thiếu recentOrders, mở Đơn hàng và yêu cầu lọc đơn chờ."
  },
  kitchen: {
    dataNeeds: ["active orders", "order items", "created_at", "service_due_at", "table"],
    tools: ["analyze_dashboard_area"],
    operatingActions: ["open kitchen", "prioritize overdue items", "group same items"],
    actionContract: "Sắp thứ tự bếp theo đơn/món quá hạn; nếu thiếu SLA thì tạo checklist kiểm bếp thủ công.",
    outputMode: "diagnose",
    missingDataFallback: "Nếu thiếu SLA/order items, trả thứ tự kiểm tra bếp thủ công."
  },
  menu: {
    dataNeeds: ["menu categories", "menu items", "price", "imageUrl", "availability", "topItems", "recommendations"],
    tools: ["analyze_dashboard_area", "owner_agent_executor", "generate_branding_draft"],
    operatingActions: ["open menu", "create hidden menu draft", "create combo draft", "create menu copy draft", "prepare image prompt"],
    actionContract: "Nếu chủ quán yêu cầu tạo menu/món/combo, gọi executor để tạo danh mục và món/combo nháp bị ẩn is_available=false; không tự đổi giá món đang bán.",
    outputMode: "draft",
    missingDataFallback: "Nếu menu rỗng, hướng dẫn nhập OCR hoặc tạo món/danh mục đầu tiên."
  },
  inventory: {
    dataNeeds: ["inventory snapshot", "lowStockIngredients", "recipe coverage", "food cost", "purchase suggestions", "open alerts"],
    tools: ["analyze_dashboard_area", "owner_agent_executor"],
    operatingActions: ["open inventory", "create purchase order draft", "create purchase checklist", "review low stock", "review food cost"],
    actionContract: "Nếu có lowStockIngredients và chủ quán xác nhận, gọi executor để tạo PO nháp; không tự nhận hàng hay trừ kho.",
    outputMode: "queue",
    missingDataFallback: "Nếu kho chưa migrate, nêu cần bật module kho trước khi AI nhập hàng."
  },
  tables: {
    dataNeeds: ["tables", "active table orders", "qr_enabled", "unpaid total", "service_due_at"],
    tools: ["analyze_dashboard_area"],
    operatingActions: ["open tables", "open orders", "enable QR checklist"],
    actionContract: "Nêu bàn/QR có vấn đề, route xử lý và bước kiểm tra trước giờ cao điểm.",
    outputMode: "diagnose",
    missingDataFallback: "Nếu thiếu table snapshot, mở Bàn & QR để kiểm tra QR trước giờ cao điểm."
  },
  payments: {
    dataNeeds: ["payment logs", "waiting_confirm", "order totals", "payment method/status"],
    tools: ["analyze_dashboard_area"],
    operatingActions: ["open payments/orders", "create payment follow-up task", "never auto-confirm"],
    actionContract: "Chỉ tạo checklist đối soát/mở đơn lọc; tuyệt đối không nói đã xác nhận/hoàn tiền.",
    outputMode: "apply",
    missingDataFallback: "Nếu thiếu payment logs, yêu cầu đối soát thủ công theo order total."
  },
  promotions: {
    dataNeeds: ["promotions", "summary24h", "topItems", "active promotions", "operationInsights"],
    tools: ["analyze_dashboard_area", "owner_agent_executor"],
    operatingActions: ["create promotion draft", "open promotions", "set inactive until owner review"],
    actionContract: "Chỉ tạo promotion draft inactive, có min order và kênh rõ; owner phải bật public sau.",
    outputMode: "draft",
    missingDataFallback: "Nếu thiếu doanh thu/menu, tạo ưu đãi conservative có min order và không public."
  },
  staff: {
    dataNeeds: ["staff snapshot", "attendance", "approvals", "shifts", "branch assignments", "reviews"],
    tools: ["analyze_dashboard_area"],
    operatingActions: ["open staff", "create staffing checklist", "review attendance approvals"],
    actionContract: "Tạo checklist điều phối ca/chấm công; không tự đổi lương, duyệt công hay phân ca nếu chưa confirm.",
    outputMode: "queue",
    missingDataFallback: "Nếu thiếu HR schema, nói rõ chưa có dữ liệu chấm công/ca."
  },
  online: {
    dataNeeds: ["online settings", "delivery radius", "fees", "payment mode", "store coordinates"],
    tools: ["analyze_dashboard_area"],
    operatingActions: ["open online settings", "create delivery setup checklist"],
    actionContract: "Tạo draft cấu hình giao hàng/pickup có điều kiện kiểm tọa độ; không tự bật nhận đơn nếu thiếu dữ liệu.",
    outputMode: "draft",
    missingDataFallback: "Nếu thiếu tọa độ/bán kính, ưu tiên cấu hình địa chỉ trước khi bật giao hàng."
  },
  reservations: {
    dataNeeds: ["reservations", "reservation settings", "deposit status", "table capacity", "hold expiry"],
    tools: ["analyze_dashboard_area"],
    operatingActions: ["open reservations", "create booking policy draft", "review expiring holds"],
    actionContract: "Tạo draft chính sách/việc cần kiểm; không tự xác nhận cọc, giữ bàn hoặc hủy booking.",
    outputMode: "diagnose",
    missingDataFallback: "Nếu thiếu booking snapshot, hướng dẫn kiểm tra cấu hình đặt bàn/cọc."
  },
  reports: {
    dataNeeds: ["paid orders", "topItems", "revenue", "payment split", "report schedule"],
    tools: ["analyze_dashboard_area"],
    operatingActions: ["open analytics", "create report summary", "schedule email report"],
    actionContract: "Chỉ tóm tắt số liệu có thật, nêu report nên mở/xuất; không bịa doanh thu hoặc dự báo như số đã xảy ra.",
    outputMode: "answer",
    missingDataFallback: "Nếu thiếu paid orders, không bịa doanh thu; chỉ nêu dữ liệu chưa đủ."
  },
  settings: {
    dataNeeds: ["restaurant profile", "payment settings", "receipt", "notifications", "brand", "online/reservation flags"],
    tools: ["analyze_dashboard_area", "generate_store_setup_plan"],
    operatingActions: ["open settings", "create setup draft", "fix first blocker"],
    actionContract: "Tạo checklist/draft cấu hình theo blocker; không tự đổi thông tin pháp lý, thanh toán hoặc gói.",
    outputMode: "queue",
    missingDataFallback: "Nếu thiếu settings snapshot, dẫn thẳng tới Cài đặt vận hành."
  },
  security: {
    dataNeeds: ["session role", "tenant scope", "entitlement", "payment risks", "public settings"],
    tools: ["analyze_dashboard_area"],
    operatingActions: ["create security checklist", "open settings", "avoid exploit detail"],
    actionContract: "Chỉ đưa checklist phòng thủ và route cấu hình; không mô tả exploit chi tiết hoặc dữ liệu nhạy cảm.",
    outputMode: "diagnose",
    missingDataFallback: "Nếu thiếu audit data, chỉ đưa checklist phòng thủ."
  },
  growth: {
    dataNeeds: ["brand profile", "menu", "promotions", "topItems", "summary24h", "operationInsights"],
    tools: ["analyze_dashboard_area", "owner_agent_executor", "generate_branding_draft"],
    operatingActions: ["create promotion draft", "create campaign copy", "open promotions", "open menu"],
    actionContract: "Tạo promotion/content draft có mục tiêu, điều kiện và kênh; không public campaign khi chưa có owner review.",
    outputMode: "draft",
    missingDataFallback: "Nếu thiếu brand/menu data, tạo draft copy ngắn nhưng yêu cầu chủ quán kiểm tra trước khi public."
  }
};

export const storeSetupDraftConfig: Record<StoreSetupDraftKind, StoreSetupDraftConfig> = {
  brand_profile: {
    kind: "brand_profile",
    label: "Hồ sơ thương hiệu",
    description: "Tạo slogan, mô tả quán, giọng thương hiệu và prompt logo/menu cover an toàn với lỗi chữ AI.",
    route: "/dashboard/settings?section=brand",
    plan: "pro",
    outputFocus: "Slogan, mô tả, brand voice, logo prompt, menu hero prompt, nội dung có thể dán vào hồ sơ quán.",
    guardrails: [
      "Không yêu cầu AI render tên quán bằng chữ trong ảnh.",
      "Prompt ảnh phải chừa khoảng trống để UI overlay chữ thật.",
      "Không dùng tuyên bố y tế hoặc cam kết chất lượng không kiểm chứng."
    ]
  },
  menu_blueprint: {
    kind: "menu_blueprint",
    label: "Khung menu thông minh",
    description: "Gợi ý danh mục, món mồi, mô tả món và tag bán hàng dựa trên loại hình quán.",
    route: "/dashboard/menu",
    plan: "pro",
    outputFocus: "Danh mục menu, món mẫu, mô tả ngắn, tag, chiến lược sắp xếp để khách gọi nhanh.",
    guardrails: [
      "Chỉ tạo món vào database khi đi qua Owner Agent Executor và mặc định is_available=false.",
      "Giá chỉ là gợi ý biên độ nếu thiếu dữ liệu chi phí.",
      "Không gợi ý quá nhiều món làm chủ quán khó setup."
    ]
  },
  online_delivery: {
    kind: "online_delivery",
    label: "Đặt online & giao hàng",
    description: "Đề xuất bán kính, phí ship, free ship, điều kiện nhận đơn và chế độ thanh toán.",
    route: "/dashboard/settings?section=online",
    plan: "pro",
    outputFocus: "Cấu hình pickup/delivery, radius, phí ship, min order, trả trước/trả sau, UX tracking cho khách.",
    guardrails: [
      "Không nhận đơn ngoài bán kính nếu thiếu tọa độ.",
      "Luôn nhắc cần kiểm tra địa chỉ/tọa độ trước khi bật giao hàng thật.",
      "Không cam kết ETA nếu chưa có dữ liệu vận hành."
    ]
  },
  reservation_policy: {
    kind: "reservation_policy",
    label: "Đặt bàn & tiền cọc",
    description: "Tạo chính sách giữ bàn, cọc, hết hạn, chống trùng lịch và no-show.",
    route: "/dashboard/reservations",
    plan: "premium",
    outputFocus: "Hold time, deposit, grace period, cancel/no-show policy, quy trình xác nhận cọc.",
    guardrails: [
      "Không xác nhận giữ bàn nếu chưa có booking.",
      "Luôn chống overbooking theo sức chứa và khung giờ.",
      "Nội dung chính sách phải dễ hiểu cho khách."
    ]
  },
  promotion_launch: {
    kind: "promotion_launch",
    label: "Khuyến mãi khai trương",
    description: "Tạo chiến dịch mã giảm, điều kiện, kênh hiển thị và chống lạm dụng.",
    route: "/dashboard/promotions",
    plan: "pro",
    outputFocus: "Mã giảm giá, min order, thời hạn, kênh hiển thị header menu khách, điều kiện chống spam.",
    guardrails: [
      "Không tạo mã giảm lỗ.",
      "Luôn có min order, thời hạn và kênh áp dụng.",
      "Không khuyến khích lạm dụng free trial hoặc bug gói."
    ]
  },
  voice_ops: {
    kind: "voice_ops",
    label: "Giọng nói vận hành",
    description: "Thiết kế câu lệnh nhập liệu bằng giọng nói và mẫu thông báo giao dịch cho chủ quán.",
    route: "/dashboard/settings?section=notifications",
    plan: "premium",
    outputFocus: "Voice commands, voice alert templates, priority rules cho đơn mới/thanh toán/chậm món.",
    guardrails: [
      "Không đọc to dữ liệu nhạy cảm đầy đủ nếu không cần.",
      "Thông báo giọng nói phải ngắn, không gây nhiễu ca bán.",
      "Luôn ưu tiên cảnh báo thanh toán và đơn trễ."
    ]
  }
};

export const ownerAiIntentConfig: Record<OwnerAiIntent, IntentConfig<OwnerAiIntent>> = {
  setup: {
    intent: "setup",
    label: "AI thiết lập quán",
    description: "Quét cấu hình quán, phát hiện thiếu sót và tạo lộ trình setup để sẵn sàng bán thật.",
    dataScope: "Hồ sơ quán, menu, bàn/QR, VietQR, online ordering, giao hàng, đặt bàn, báo cáo, thông báo và bảo mật gói.",
    guardrails: [
      "Không tự sửa dữ liệu nếu chưa có action riêng.",
      "Không đề xuất bật tính năng trả phí nếu gói chưa có quyền mà không nhắc điều kiện gói.",
      "Ưu tiên việc bắt buộc trước việc tăng trưởng."
    ],
    systemAddendum:
      "Đóng vai AI implementation architect. Nhiệm vụ là giảm tải setup cho chủ quán: phát hiện cấu hình thiếu, sắp thứ tự việc cần làm, viết sẵn nội dung thương hiệu/menu và chỉ rõ màn thao tác.",
    responseContract: "Trả lời theo: Điểm sẵn sàng, Chặn bán thật, Setup nhanh 30 phút, Nâng cấp Pro/Premium đáng làm.",
    suggestions: ["Quét toàn bộ cấu hình quán", "Tạo kế hoạch setup trong 30 phút", "Gợi ý bật tính năng Pro/Premium phù hợp"]
  },
  overview: {
    intent: "overview",
    label: "Tổng quan ca",
    description: "Tóm tắt nhịp vận hành, điểm nghẽn và hành động ưu tiên trong ca bán.",
    dataScope: "Đơn 24h, doanh thu đã thanh toán, bàn hoạt động, đơn gần đây và món nổi bật.",
    guardrails: ["Không bịa doanh thu.", "Chỉ ưu tiên theo dữ liệu hiện có.", "Chỉ chạy thao tác vận hành khi chủ quán bấm xác nhận."],
    systemAddendum:
      "Đóng vai COO ca bán. Ưu tiên cảnh báo đơn cần xử lý, bàn có rủi ro, doanh thu, món nổi bật và thao tác giúp ca chạy mượt trong 15 phút tới.",
    responseContract: "Trả lời theo 3 mục: Tình hình hiện tại, Việc cần làm ngay, Theo dõi tiếp.",
    suggestions: ["Tóm tắt ca bán hiện tại", "Có điểm nghẽn nào cần xử lý ngay?", "Gợi ý 3 hành động tăng tốc ca"]
  },
  orders: {
    intent: "orders",
    label: "Đơn hàng",
    description: "Phân loại đơn theo trạng thái và đề xuất thao tác nhận, xác nhận, phục vụ, thanh toán.",
    dataScope: "Đơn gần đây, trạng thái order/payment, bàn, fulfillment, món trong đơn và thời hạn phục vụ.",
    guardrails: [
      "Không nhận/hoàn tất đơn nếu chưa có action được chủ quán xác nhận.",
      "Không xác nhận thanh toán.",
      "Không bỏ qua thứ tự trạng thái hợp lệ."
    ],
    systemAddendum:
      "Chỉ dùng trạng thái đơn trong dữ liệu. Nếu chủ quán yêu cầu xử lý nhiều đơn, ưu tiên batch action có xác nhận thay vì trả lời chung chung. Không tự xác nhận thanh toán.",
    responseContract: "Nêu đơn ưu tiên, lý do ưu tiên, thao tác đúng tiếp theo và rủi ro nếu bỏ qua.",
    suggestions: ["Đơn nào cần xử lý trước?", "Luồng xử lý đơn hiện tại đã đúng chưa?", "Tìm đơn có nguy cơ trễ món"]
  },
  kitchen: {
    intent: "kitchen",
    label: "Bếp",
    description: "Theo dõi SLA ra món, món đang chờ, món đã phục vụ và nguy cơ quá giờ.",
    dataScope: "Đơn pending/ordering, món trong đơn, bàn, thời gian tạo đơn và service_due_at.",
    guardrails: ["Không hứa giờ ra món nếu dữ liệu thiếu.", "Ưu tiên món quá hạn và đơn lâu nhất."],
    systemAddendum:
      "Đóng vai điều phối bếp. Tập trung thời gian chờ, thứ tự ưu tiên ra món, gom món giống nhau và cảnh báo quá hạn.",
    responseContract: "Trả lời bằng danh sách ưu tiên bếp, mỗi dòng gồm món/bàn/lý do/hành động.",
    suggestions: ["Bếp nên làm món nào trước?", "Có món nào quá giờ không?", "Gom món cùng loại để ra nhanh"]
  },
  menu: {
    intent: "menu",
    label: "Menu",
    description: "Tối ưu menu, danh mục, giá, hình ảnh, OCR menu giấy và món bán chạy/chậm.",
    dataScope: "Danh mục, món, giá, trạng thái bán/tạm hết, món bán chạy nếu có trong snapshot.",
    guardrails: ["Không tự thêm món không có dữ liệu.", "Không đưa giá quá cụ thể nếu thiếu bối cảnh chi phí."],
    systemAddendum:
      "Đóng vai menu engineer cho F&B Việt Nam. Đề xuất ít nhưng rõ: món nên đẩy, món nên ẩn, danh mục nên đổi, ảnh/menu preview nên tạo.",
    responseContract: "Trả lời theo: Nhận xét menu, Cơ hội tăng doanh thu, Việc nên chỉnh trong dashboard.",
    suggestions: ["Món nào nên đẩy lên đầu?", "Gợi ý mô tả cho món mới", "Tối ưu danh mục menu giúp dễ gọi"]
  },
  inventory: {
    intent: "inventory",
    label: "Kho hàng",
    description: "Theo dõi nguyên liệu thấp, định mức món, lô sắp hết hạn, cảnh báo kho và gợi ý nhập hàng.",
    dataScope: "Inventory snapshot, nguyên liệu dưới ngưỡng, recipe coverage, food cost, hao hụt, purchase order, giá trị tồn kho, alert và lô sắp hết hạn nếu có.",
    guardrails: [
      "Không bịa số lượng tồn hoặc giá vốn.",
      "Không tự tạo phiếu nhập/đơn mua nếu chưa có action xác nhận.",
      "Ưu tiên nguyên liệu ảnh hưởng món bán chạy hoặc ca cao điểm."
    ],
    systemAddendum:
      "Đóng vai inventory controller cho F&B. Ưu tiên thiếu nguyên liệu, định mức món chưa đủ, lô sắp hết hạn, hao hụt và hành động nhập hàng có thể làm ngay.",
    responseContract: "Trả lời theo: Rủi ro kho, Món/ca bị ảnh hưởng, Việc cần làm ngay trong Kho hàng.",
    suggestions: ["Kho đang thiếu gì?", "Món nào thiếu định mức?", "Gợi ý nhập hàng trước giờ cao điểm"]
  },
  tables: {
    intent: "tables",
    label: "Bàn & QR",
    description: "Theo dõi trạng thái bàn, hóa đơn mở, bàn trống, QR và nhắc phục vụ.",
    dataScope: "Bàn, khu vực, sức chứa, QR enabled, đơn mở theo bàn, tiền chưa thanh toán và SLA bàn.",
    guardrails: ["Không gộp bàn/hóa đơn nếu không có action.", "Không kết luận bàn trống nếu còn đơn mở."],
    systemAddendum:
      "Đóng vai floor manager. Ưu tiên bàn đang đợi xác nhận, đang phục vụ lâu, chờ thanh toán và QR chưa bật.",
    responseContract: "Nêu trạng thái bàn theo nhóm và thao tác cần làm tiếp.",
    suggestions: ["Bàn nào cần chú ý?", "Có bàn nào nên nhắc phục vụ không?", "Kiểm tra QR bàn trước giờ cao điểm"]
  },
  payments: {
    intent: "payments",
    label: "Thanh toán",
    description: "Đối soát VietQR/tiền mặt, đơn chờ xác nhận, hóa đơn đã trả và rủi ro lệch tiền.",
    dataScope: "Payment logs qua order.restaurant_id, order status/payment status, amount, method và thời gian.",
    guardrails: ["Không xác nhận đã nhận tiền.", "Luôn nhắc kiểm tra số tiền và nội dung chuyển khoản."],
    systemAddendum:
      "Đóng vai kiểm soát thanh toán. Không bao giờ xác nhận đã nhận tiền nếu không có dữ liệu thanh toán. Nhắc kiểm tra nội dung ORDER/RESV và số tiền.",
    responseContract: "Nêu giao dịch chờ xử lý, điểm cần đối soát, và thao tác xác nhận an toàn.",
    suggestions: ["Giao dịch nào cần xác nhận?", "Kiểm tra rủi ro lệch tiền", "Nên bật thanh toán sau hay trả trước?"]
  },
  promotions: {
    intent: "promotions",
    label: "Khuyến mãi",
    description: "Thiết kế mã giảm giá, kênh hiển thị, điều kiện dùng và chống lạm dụng.",
    dataScope: "Promotions active/scheduled, code, discount, min order, channels, show_on_customer_menu.",
    guardrails: ["Không tạo mã giảm lỗ.", "Luôn có min order/thời hạn/kênh áp dụng."],
    systemAddendum:
      "Đóng vai growth marketer nhưng bảo thủ về lợi nhuận. Luôn đề xuất điều kiện min order, thời hạn, kênh và cách tránh spam mã.",
    responseContract: "Trả lời bằng 1-3 chiến dịch, kèm điều kiện, mục tiêu và rủi ro.",
    suggestions: ["Tạo mã khuyến mãi cho cuối tuần", "Mã nào nên hiển thị trên menu khách?", "Chống lạm dụng mã giảm giá"]
  },
  staff: {
    intent: "staff",
    label: "Nhân viên",
    description: "Gợi ý phân công, quyền nhân viên, ca làm, chấm công, performance coaching và payroll-ready workflow.",
    dataScope: "Staff snapshot thật: số nhân viên active/suspended, role, chi nhánh, người đang check-in, lượt muộn/tăng ca, yêu cầu chờ duyệt, review hiệu suất và ca sắp tới nếu schema HR đã migrate.",
    guardrails: ["Ưu tiên least privilege.", "Không đề xuất chia sẻ tài khoản ADMIN.", "Không bịa tên nhân viên nếu snapshot không có danh sách.", "Tách rõ chấm công/payroll cần duyệt với dữ liệu đã chốt."],
    systemAddendum:
      "Đóng vai Head of Workforce Systems cho quán F&B Việt Nam. Khi có staff snapshot, phải trả lời bằng số liệu thật: active/online/check-in, muộn/tăng ca, request chờ, chi nhánh chưa gán, review thấp và ca sắp tới. Nếu thiếu dữ liệu, nói rõ schema/snapshot chưa có thay vì nói chung chung.",
    responseContract: "Trả lời theo: Tình hình nhân sự, Rủi ro cần xử lý, Việc làm ngay trong HR, Theo dõi payroll/ca tiếp theo.",
    suggestions: ["Tổng quan nhân sự hôm nay", "Ai đang đi muộn hoặc cần duyệt công?", "Chi nhánh nào thiếu người?", "Ai cần coaching hiệu suất?"]
  },
  online: {
    intent: "online",
    label: "Đặt online",
    description: "Tối ưu đặt món từ xa, pickup/delivery, bán kính giao, phí ship và theo dõi đơn.",
    dataScope: "Cấu hình online, pickup, delivery, tọa độ, bán kính, phí ship, min order và payment mode.",
    guardrails: ["Không nhận đơn ngoài bán kính.", "Nhắc cần tọa độ trước khi bật giao hàng thật."],
    systemAddendum:
      "Đóng vai online ordering operator. Tập trung điều kiện nhận đơn, bán kính, phí ship, ETA, thanh toán trước/sau và cập nhật theo dõi đơn.",
    responseContract: "Nêu cấu hình nên bật/tắt, trải nghiệm khách và rủi ro vận hành.",
    suggestions: ["Cấu hình giao hàng thế nào cho hợp lý?", "Có nên bắt chuyển khoản trước không?", "Tối ưu link đặt online"]
  },
  reservations: {
    intent: "reservations",
    label: "Đặt bàn",
    description: "Tư vấn đặt bàn trước, giữ chỗ, nhận cọc, chống trùng lịch và hết hạn giữ chỗ.",
    dataScope: "Cấu hình reservations, booking gần đây, hold_expires_at, deposit status và sức chứa bàn.",
    guardrails: ["Không xác nhận giữ bàn nếu chưa có booking.", "Luôn nhắc tránh overbooking và hết hạn giữ chỗ."],
    systemAddendum:
      "Đóng vai reservation manager. Luôn kiểm tra sức chứa, thời gian giữ bàn, tiền cọc, grace time và chống overbooking.",
    responseContract: "Trả lời theo: Quy tắc đặt bàn, rủi ro trùng lịch, thao tác nên cấu hình.",
    suggestions: ["Cấu hình đặt bàn tránh trùng lịch", "Nên nhận cọc bao nhiêu?", "Nhắc bàn sắp hết hạn giữ chỗ"]
  },
  reports: {
    intent: "reports",
    label: "Báo cáo",
    description: "Phân tích doanh thu, món bán chạy, ca bán, xuất báo cáo và email định kỳ.",
    dataScope: "Đơn đã thanh toán, món bán chạy, báo cáo định kỳ và payment split nếu có.",
    guardrails: ["Tách rõ dữ liệu thật và giả định.", "Không coi đơn chưa thanh toán là doanh thu chắc chắn."],
    systemAddendum:
      "Đóng vai analyst. Tách rõ dữ liệu thật và giả định. Gợi ý biểu đồ, KPI và nội dung email báo cáo tuần/tháng.",
    responseContract: "Trả lời bằng insight, chỉ số cần xem, và báo cáo nên xuất.",
    suggestions: ["Tóm tắt doanh thu tuần", "Gợi ý báo cáo gửi email", "Món nào kéo doanh thu tốt nhất?"]
  },
  settings: {
    intent: "settings",
    label: "Cài đặt quán",
    description: "Hồ sơ quán, ngân hàng, nhận diện, giờ mở cửa, quyền, gói dịch vụ.",
    dataScope: "Restaurant settings, payment settings, notifications, receipt, brand, online/reservation flags.",
    guardrails: ["Không yêu cầu chủ quán nhập API key.", "Ưu tiên cấu hình bắt buộc cho bán thật."],
    systemAddendum:
      "Đóng vai onboarding specialist. Ưu tiên giảm bước cấu hình, kiểm tra dữ liệu thiếu và nhắc rủi ro khi thiếu ngân hàng/logo/địa chỉ.",
    responseContract: "Nêu thông tin còn thiếu, vì sao quan trọng, và nơi chỉnh.",
    suggestions: ["Quán còn thiếu cấu hình gì?", "Kiểm tra ngân hàng VietQR", "Tối ưu hồ sơ quán"]
  },
  security: {
    intent: "security",
    label: "Bảo mật",
    description: "Kiểm tra quyền, gói, lạm dụng AI, spam, thanh toán và dữ liệu riêng tư.",
    dataScope: "Entitlement, rate limit metadata, tenant scope, order/payment risks và cấu hình public.",
    guardrails: ["Không tiết lộ chi tiết khai thác.", "Đề xuất kiểm soát phòng thủ và audit log."],
    systemAddendum:
      "Đóng vai security reviewer. Ưu tiên tenant isolation, entitlement, rate limit, audit log, payment fraud và dữ liệu cá nhân.",
    responseContract: "Trả lời bằng rủi ro, mức độ, cách giảm rủi ro, dấu hiệu cần audit.",
    suggestions: ["Kiểm tra rủi ro bảo mật ca này", "Có thể bị bug gói không?", "Cách giảm spam đặt món"]
  },
  growth: {
    intent: "growth",
    label: "Tăng trưởng",
    description: "Slogan, mô tả quán, chiến dịch, ảnh menu, logo và ý tưởng giữ chân khách.",
    dataScope: "Hồ sơ quán, menu, promotions và brand settings.",
    guardrails: ["Không yêu cầu AI render chữ nhỏ trong ảnh.", "Nội dung marketing phải dùng được ngay trong UI."],
    systemAddendum:
      "Đóng vai growth + brand strategist. Đề xuất ý tưởng có thể triển khai trong LogiVN, không quá bay bổng, có CTA rõ.",
    responseContract: "Trả lời bằng ý tưởng, nội dung mẫu, và bước triển khai.",
    suggestions: ["Viết slogan cho quán", "Tạo ý tưởng ảnh menu", "Chiến dịch kéo khách quay lại"]
  }
};

export const customerAiIntentConfig: Record<CustomerAiIntent, IntentConfig<CustomerAiIntent>> = {
  guest_faq: {
    intent: "guest_faq",
    label: "Hỏi đáp quán",
    description: "Trả lời tự nhiên các câu hỏi thường ngày của khách về quán, giờ mở cửa, địa chỉ, hotline, wifi, gửi xe, không gian và hỗ trợ cơ bản.",
    systemAddendum:
      "Đóng vai lễ tân/phục vụ AI của quán. Trả lời câu hỏi đời thường trước bằng thông tin public có trong context. Không ép CTA nếu khách chỉ hỏi thông tin; chỉ gợi ý xem menu, đặt bàn hoặc gọi nhân viên khi thật sự phù hợp.",
    responseContract: "1-3 câu tự nhiên như nhân viên quán. Nếu thiếu dữ liệu, nói rõ hệ thống chưa có thông tin đó và gợi ý gọi nhân viên/quán.",
    suggestions: ["Quán mấy giờ mở cửa?", "Địa chỉ quán ở đâu?", "Quán có wifi/gửi xe không?", "Có cần đặt bàn trước không?"]
  },
  menu_discovery: {
    intent: "menu_discovery",
    label: "Gợi ý món",
    description: "Giúp khách chọn món theo khẩu vị, ngân sách và món có sẵn.",
    systemAddendum:
      "Chỉ gợi ý món có trong menu snapshot. Nếu thiếu dữ liệu menu, hỏi khẩu vị hoặc gợi ý khách xem danh mục trên màn hình.",
    responseContract: "Tối đa 3 gợi ý, mỗi gợi ý có lý do ngắn và nhắc dùng nút thêm món.",
    suggestions: ["Gợi ý món dễ uống", "Món nào hợp đi nhóm?", "Món nào nên thử đầu tiên?"]
  },
  cart: {
    intent: "cart",
    label: "Giỏ hàng",
    description: "Kiểm tra giỏ, số lượng, ghi chú món và món gọi thêm.",
    systemAddendum:
      "Dựa trên cart JSON nếu có. Không tự sửa giỏ. Hướng dẫn khách dùng nút +, -, xóa hoặc ghi chú trên giao diện.",
    responseContract: "Nêu giỏ hiện tại, điểm cần kiểm tra và thao tác tiếp.",
    suggestions: ["Kiểm tra giỏ của tôi", "Tôi muốn gọi thêm món", "Gợi ý combo từ giỏ hiện tại"]
  },
  order_status: {
    intent: "order_status",
    label: "Trạng thái đơn",
    description: "Giải thích đơn đã gửi, đã nhận, đang ra món, chờ thanh toán hay hoàn tất.",
    systemAddendum:
      "Chỉ giải thích theo orderStatus JSON. Không nói đơn đã xác nhận/đã thanh toán nếu dữ liệu không có.",
    responseContract: "Trả lời ngắn: trạng thái hiện tại, ý nghĩa, khách nên chờ hay bấm nút nào.",
    suggestions: ["Đơn của tôi đang ở bước nào?", "Quán đã nhận đơn chưa?", "Khi nào tôi thanh toán?"]
  },
  payment: {
    intent: "payment",
    label: "Thanh toán",
    description: "Hướng dẫn thanh toán tiền mặt, VietQR, trả trước/trả sau và hóa đơn.",
    systemAddendum:
      "Không xác nhận đã nhận tiền. Hướng dẫn khách kiểm tra số tiền, nội dung chuyển khoản và bấm Tôi đã thanh toán nếu giao diện có.",
    responseContract: "Nêu cách thanh toán, điều cần kiểm tra và bước tiếp theo.",
    suggestions: ["Tôi thanh toán thế nào?", "Tôi đã chuyển khoản rồi", "Tôi muốn xem hóa đơn"]
  },
  staff_call: {
    intent: "staff_call",
    label: "Gọi nhân viên",
    description: "Hướng dẫn khách gọi nhân viên, xin thêm đồ, báo sự cố hoặc cần hỗ trợ.",
    systemAddendum:
      "Không hứa nhân viên đã tới. Hướng dẫn khách bấm nút Gọi nhân viên hoặc ghi rõ nhu cầu nếu giao diện hỗ trợ.",
    responseContract: "Trả lời cực ngắn, lịch sự, hướng dẫn một hành động.",
    suggestions: ["Tôi cần gọi nhân viên", "Xin thêm nước", "Tôi cần hỗ trợ thanh toán"]
  },
  delivery: {
    intent: "delivery",
    label: "Giao hàng",
    description: "Hướng dẫn đặt món online, địa chỉ, bán kính giao, phí ship và theo dõi đơn.",
    systemAddendum:
      "Dựa trên cấu hình giao hàng nếu có. Không cam kết giao nếu ngoài bán kính hoặc chưa có báo giá.",
    responseContract: "Nêu điều kiện giao, thông tin khách cần nhập và cách theo dõi.",
    suggestions: ["Quán có giao hàng không?", "Tính phí ship giúp tôi", "Theo dõi đơn giao hàng"]
  },
  reservation: {
    intent: "reservation",
    label: "Đặt bàn",
    description: "Hướng dẫn đặt bàn trước, cọc giữ chỗ, giờ đến và hết hạn giữ bàn.",
    systemAddendum:
      "Đóng vai LogiBot đặt bàn. Nếu có reservationStatus, giải thích đúng trạng thái, cọc, thời gian giữ bàn, đến muộn, đổi/hủy lịch. Không tự giữ bàn nếu chưa có booking. Không tự xác nhận cọc hoặc tự hủy lịch; chỉ hướng dẫn khách bấm CTA an toàn.",
    responseContract: "Nêu trạng thái hoặc bước tiếp theo, sau đó chỉ 1 CTA phù hợp: tiếp tục đặt bàn, cập nhật trạng thái, chuyển cọc, gọi quán hoặc hủy có xác nhận.",
    suggestions: ["Tôi muốn đặt bàn", "Có cần đặt cọc không?", "Tôi đến muộn thì sao?", "Tôi muốn đổi giờ hoặc hủy lịch"]
  },
  promotion: {
    intent: "promotion",
    label: "Khuyến mãi",
    description: "Giải thích mã giảm giá, điều kiện áp dụng và kênh hiển thị.",
    systemAddendum:
      "Chỉ nói mã đang có trong dữ liệu. Nếu khách hỏi mã không tồn tại, nhắc kiểm tra lại chính tả hoặc điều kiện đơn tối thiểu.",
    responseContract: "Nêu mã áp dụng, điều kiện và cách nhập mã.",
    suggestions: ["Có mã giảm giá nào không?", "Mã này dùng thế nào?", "Vì sao mã không áp dụng?"]
  },
  allergy: {
    intent: "allergy",
    label: "Dị ứng/ăn kiêng",
    description: "Nhắc khách ghi chú dị ứng, cay/ngọt, món chay và yêu cầu đặc biệt.",
    systemAddendum:
      "Không đưa tư vấn y tế. Với dị ứng nghiêm trọng, khuyên khách báo trực tiếp nhân viên và ghi chú rõ trong món.",
    responseContract: "Trả lời an toàn, ngắn, nhắc ghi chú và gọi nhân viên khi cần.",
    suggestions: ["Tôi dị ứng hải sản", "Có món chay không?", "Tôi muốn ít ngọt/ít cay"]
  }
};

const ownerKeywordMap: Record<OwnerAiIntent, string[]> = {
  setup: ["setup", "thiet lap", "cau hinh", "san sang", "onboarding", "bat dau", "setup nhanh", "ke hoach setup"],
  overview: ["tong quan", "ca ban", "van hanh", "hom nay", "hien tai", "uu tien", "kiem tra ca", "tinh hinh"],
  orders: ["don", "order", "nhan don", "xac nhan", "phuc vu", "trang thai don", "xu ly don", "don cho"],
  kitchen: ["bep", "ra mon", "tre mon", "qua gio", "sla", "dang nau", "uu tien bep"],
  menu: ["menu", "mon", "danh muc", "gia", "hinh anh", "ocr", "nhap menu", "anh mon", "tao anh mon", "anh do an", "food photo", "mo ta mon"],
  inventory: ["kho", "ton kho", "nguyen lieu", "dinh muc", "recipe", "het hang", "nhap kho", "dat hang", "nha cung cap", "food cost", "hao hut"],
  tables: ["ban", "qr", "trong", "dang phuc vu", "so do ban", "ma qr", "in qr"],
  payments: ["thanh toan", "vietqr", "tien mat", "chuyen khoan", "hoa don", "doi soat", "xac nhan tien"],
  promotions: ["khuyen mai", "ma giam", "voucher", "campaign", "uu dai", "giam gia"],
  staff: [
    "nhan su",
    "nhan vien",
    "staff",
    "phan quyen",
    "ca lam",
    "lich lam",
    "cham cong",
    "check in",
    "check-in",
    "di tre",
    "di muon",
    "nghi phep",
    "doi ca",
    "tang ca",
    "duyet cong",
    "bang cong",
    "luong",
    "payroll",
    "hieu suat",
    "danh gia",
    "coaching",
    "chi nhanh",
    "thieu nguoi",
    "coverage",
    "goi nhan vien",
    "tai khoan staff"
  ],
  online: ["online", "ship", "giao hang", "pickup", "den lay", "ban kinh", "phi ship", "dat online"],
  reservations: ["dat ban", "coc", "giu ban", "lich", "booking", "reservation", "giu cho"],
  reports: ["bao cao", "doanh thu", "analytics", "bieu do", "excel", "pdf", "email", "xuat bao cao"],
  settings: ["cai dat", "ho so", "ngan hang", "dia chi", "gio mo cua", "vietqr setting"],
  security: ["bao mat", "rls", "hack", "bug goi", "spam", "quyen", "audit"],
  growth: ["slogan", "thuong hieu", "logo", "tao logo", "prompt logo", "mo ta quan", "marketing", "tang truong", "brand", "branding", "anh cover", "menu hero"]
};

const customerKeywordMap: Record<CustomerAiIntent, string[]> = {
  guest_faq: [
    "xin chao",
    "hello",
    "cam on",
    "gio mo cua",
    "may gio",
    "dong cua",
    "mo cua",
    "dia chi quan",
    "quan o dau",
    "hotline",
    "so dien thoai",
    "lien he",
    "wifi",
    "mat khau wifi",
    "gui xe",
    "dau xe",
    "khong gian",
    "ngoi lai",
    "lam viec",
    "hoc bai",
    "dieu hoa",
    "nha ve sinh",
    "tre em",
    "thu cung",
    "pet",
    "cho meo"
  ],
  menu_discovery: ["goi y", "mon nao", "ngon", "de an", "de uong", "nen thu", "menu", "combo", "nhom", "ngan sach", "duoi"],
  cart: ["gio", "them", "xoa", "so luong", "goi them", "ghi chu"],
  order_status: ["don cua toi", "trang thai", "da nhan", "dang ra", "cho mon", "xac nhan"],
  payment: ["thanh toan", "vietqr", "tien mat", "hoa don", "chuyen khoan", "da tra"],
  staff_call: ["goi nhan vien", "nhan vien", "ho tro", "them nuoc", "muon gap"],
  delivery: ["giao hang", "ship", "dia chi", "phi ship", "bao lau", "theo doi"],
  reservation: ["dat ban", "giu ban", "dat cho", "coc", "giu cho", "lich dat", "doi gio", "huy lich", "den muon", "tre gio", "con ban", "ban trong"],
  promotion: ["ma giam", "khuyen mai", "voucher", "uu dai"],
  allergy: ["di ung", "an chay", "khong cay", "it cay", "it ngot", "hai san"]
};

const ownerRouteRules: Array<IntentRouteRule<OwnerAiIntent>> = [
  { intent: "orders", weight: 5, patterns: ["xu ly tat ca don", "xu ly don cho", "nhan don", "accept order", "don nao can xu ly"] },
  { intent: "payments", weight: 5, patterns: ["xac nhan thanh toan", "doi soat", "vietqr", "da chuyen khoan", "xac nhan tien"] },
  { intent: "menu", weight: 6, patterns: ["tao anh mon", "anh mon an", "anh do an", "food photo", "ocr menu", "quet menu", "nhap menu", "them mon tu ocr"] },
  { intent: "inventory", weight: 6, patterns: ["ton kho", "nguyen lieu", "thieu hang", "het hang", "dinh muc", "food cost", "nhap kho", "dat hang"] },
  { intent: "growth", weight: 6, patterns: ["tao logo", "prompt logo", "tao slogan", "viet slogan", "bo nhan dien", "thuong hieu", "branding"] },
  { intent: "setup", weight: 5, patterns: ["ke hoach setup", "setup quan", "thiet lap quan", "san sang ban that", "hoan thien setup"] },
  { intent: "tables", weight: 4, patterns: ["in qr", "tai qr", "ma qr", "ban nao", "so do ban"] },
  { intent: "online", weight: 4, patterns: ["bat giao hang", "phi ship", "ban kinh giao", "dat online", "pickup"] },
  { intent: "reservations", weight: 4, patterns: ["dat ban", "tien coc", "giu cho", "overbooking"] },
  { intent: "reports", weight: 4, patterns: ["xuat bao cao", "doanh thu", "bao cao tuan", "gui email bao cao"] },
  { intent: "security", weight: 5, patterns: ["bug goi", "lo bao mat", "tenant", "rls", "spam", "audit log"] }
];

const customerRouteRules: Array<IntentRouteRule<CustomerAiIntent>> = [
  { intent: "cart", weight: 5, patterns: ["them vao gio", "mo gio", "gio hang", "goi them", "xoa mon"] },
  { intent: "payment", weight: 5, patterns: ["thanh toan", "toi da chuyen khoan", "vietqr", "hoa don", "da tra"] },
  { intent: "order_status", weight: 5, patterns: ["don cua toi", "trang thai don", "quan da nhan", "cho mon"] },
  { intent: "delivery", weight: 4, patterns: ["giao hang", "phi ship", "bao lau giao", "dia chi giao"] },
  { intent: "reservation", weight: 6, patterns: ["dat ban", "giu ban", "dat cho", "tien coc", "huy lich", "doi gio", "den muon", "tre gio", "con ban khong"] },
  { intent: "allergy", weight: 5, patterns: ["di ung", "an chay", "khong cay", "it ngot", "khong hai san"] },
  { intent: "promotion", weight: 4, patterns: ["ma giam", "khuyen mai", "voucher", "uu dai"] },
  { intent: "staff_call", weight: 4, patterns: ["goi nhan vien", "them nuoc", "can ho tro", "gap nhan vien"] },
  {
    intent: "guest_faq",
    weight: 5,
    patterns: [
      "gio mo cua",
      "may gio mo",
      "may gio dong",
      "quan con mo khong",
      "hom nay co mo khong",
      "dia chi quan",
      "quan o dau",
      "so dien thoai quan",
      "lien he quan",
      "mat khau wifi",
      "co wifi khong",
      "co cho gui xe khong",
      "co dau xe khong",
      "khong gian co yen tinh khong",
      "co phu hop lam viec khong",
      "co cho tre em khong",
      "co cho thu cung khong"
    ]
  }
];

function foldText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function asKey<TIntent extends string>(value: string | null | undefined, configs: Record<TIntent, unknown>) {
  if (!value) return null;
  const normalized = value.trim() as TIntent;
  return normalized in configs ? normalized : null;
}

function phraseScore(foldedMessage: string, pattern: string, weight: number) {
  const foldedPattern = foldText(pattern);
  if (!foldedPattern) return 0;
  if (foldedMessage === foldedPattern) return weight + 2;
  if (foldedMessage.includes(foldedPattern)) return weight;
  const words = foldedPattern.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.every((word) => foldedMessage.includes(word))) return Math.max(1, weight - 1);
  return 0;
}

function scoreIntentRules<TIntent extends string>(folded: string, routeRules: Array<IntentRouteRule<TIntent>>) {
  const scores = new Map<TIntent, number>();
  for (const rule of routeRules) {
    const score = rule.patterns.reduce((sum, pattern) => sum + phraseScore(folded, pattern, rule.weight), 0);
    if (score > 0) scores.set(rule.intent, (scores.get(rule.intent) ?? 0) + score);
  }
  return scores;
}

function inferIntent<TIntent extends string>(
  message: string,
  keywordMap: Record<TIntent, string[]>,
  fallback: TIntent,
  routeRules: Array<IntentRouteRule<TIntent>> = []
) {
  const folded = foldText(message);
  let bestIntent = fallback;
  let bestScore = 0;
  const ruleScores = scoreIntentRules(folded, routeRules);

  for (const [intent, keywords] of Object.entries(keywordMap) as Array<[TIntent, string[]]>) {
    const keywordScore = keywords.reduce((sum, keyword) => sum + (folded.includes(foldText(keyword)) ? 1 : 0), 0);
    const score = keywordScore + (ruleScores.get(intent) ?? 0);
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  return bestIntent;
}

function jsonBlock(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2).slice(0, maxLength);
}

function recordFromUnknown(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function recordArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = recordFromUnknown(item);
    return record ? [record] : [];
  });
}

function textArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const record = recordFromUnknown(item);
      return textValue(record?.title) || textValue(record?.label) || textValue(record?.action);
    })
    .filter(Boolean);
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatVnd(value: unknown) {
  const amount = numberValue(value);
  return amount > 0 ? `${Math.round(amount).toLocaleString("vi-VN")}đ` : "0đ";
}

function formatTimeOfDay(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : value;
}

function timeToMinutes(value: string | null | undefined) {
  const text = formatTimeOfDay(value);
  if (!text) return null;
  const [hour, minute] = text.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function vietnamNowMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

function restaurantHoursText(restaurant: AiRestaurantContext) {
  const opening = formatTimeOfDay(restaurant.opening_time);
  const closing = formatTimeOfDay(restaurant.closing_time);
  if (!opening && !closing) return "chưa cấu hình";
  if (opening && closing) return `${opening} - ${closing}`;
  return opening ? `từ ${opening}` : `đến ${closing}`;
}

function restaurantOpenStateText(restaurant: AiRestaurantContext) {
  const opening = timeToMinutes(restaurant.opening_time);
  const closing = timeToMinutes(restaurant.closing_time);
  const now = vietnamNowMinutes();
  if (opening === null || closing === null || now === null) return "chưa đủ dữ liệu để kết luận đang mở hay đóng";
  const isOpen = opening <= closing ? now >= opening && now < closing : now >= opening || now < closing;
  return isOpen ? "đang trong khung giờ mở cửa đã cấu hình" : "đang ngoài khung giờ mở cửa đã cấu hình";
}

function ownerRoutePlanText(intent: OwnerAiIntent) {
  const plan = ownerRoutePlans[intent];
  return [
    `Router plan: output=${plan.outputMode}.`,
    `Dữ liệu cần đọc trước: ${plan.dataNeeds.join(", ")}.`,
    `Tool/action nên dùng: ${plan.tools.join(", ")}.`,
    `Thao tác vận hành hợp lệ: ${plan.operatingActions.join(", ")}.`,
    `Action contract: ${plan.actionContract}`,
    `Nếu thiếu dữ liệu: ${plan.missingDataFallback}`
  ].join("\n");
}

function statusCountText(value: unknown) {
  const record = recordFromUnknown(value);
  if (!record) return "";
  return Object.entries(record)
    .map(([status, count]) => ({ status, count: numberValue(count) }))
    .filter((item) => item.count > 0)
    .map((item) => `${item.status}: ${item.count}`)
    .join(", ");
}

function orderAttentionScore(order: Record<string, unknown>) {
  const status = foldText(textValue(order.status));
  const paymentStatus = foldText(textValue(order.paymentStatus));
  if (status.includes("pending") || status.includes("waiting") || paymentStatus.includes("waiting")) return 4;
  if (status.includes("ordering") || status.includes("preparing")) return 3;
  if (paymentStatus.includes("unpaid") || paymentStatus.includes("pending")) return 2;
  return 0;
}

function orderLine(order: Record<string, unknown>) {
  const shortId = textValue(order.shortId) || textValue(order.id).slice(0, 8) || "đơn";
  const table = textValue(order.tableName) || textValue(order.customerName) || "chưa rõ bàn/khách";
  const status = textValue(order.status) || "chưa rõ trạng thái";
  const paymentStatus = textValue(order.paymentStatus);
  const total = formatVnd(order.total);
  return `${shortId} · ${table} · ${status}${paymentStatus ? `/${paymentStatus}` : ""} · ${total}`;
}

function topAttentionOrders(snapshot: Record<string, unknown> | null) {
  return recordArray(snapshot?.recentOrders)
    .map((order) => ({ order, score: orderAttentionScore(order) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => orderLine(item.order));
}

function buildOwnerNextStep(input: {
  intent: OwnerAiIntent;
  attentionOrders: string[];
  waitingConfirmPayments: number;
  menuItemCount: number;
  menuUnavailableCount: number;
  setupBlockers: string[];
}) {
  if (input.attentionOrders.length && ["overview", "orders", "kitchen", "tables"].includes(input.intent)) {
    return "Bước ưu tiên: đề xuất action nhận/xử lý đơn chờ hoặc mở đúng màn Đơn hàng; không tự xác nhận thanh toán.";
  }
  if (input.waitingConfirmPayments > 0 || input.intent === "payments") {
    return "Bước ưu tiên: mở đối soát thanh toán và yêu cầu chủ quán kiểm tiền trước khi xác nhận.";
  }
  if (input.intent === "menu" || input.menuItemCount === 0 || input.menuUnavailableCount > 0) {
    return "Bước ưu tiên: hướng tới OCR/tạo món/tạo ảnh món và nêu rõ thao tác áp dụng vào menu.";
  }
  if (input.intent === "inventory") {
    return "Bước ưu tiên: mở Kho hàng, xử lý nguyên liệu dưới ngưỡng và bổ sung định mức cho món bán chạy.";
  }
  if (input.setupBlockers.length || input.intent === "setup" || input.intent === "settings") {
    return "Bước ưu tiên: xử lý blocker đầu tiên trong Settings/Menu/Bàn trước, sau đó mới tối ưu tăng trưởng.";
  }
  if (input.intent === "growth") {
    return "Bước ưu tiên: tạo nội dung thương hiệu dùng được ngay và đưa action áp dụng/lưu thay vì chỉ tư vấn.";
  }
  return "Bước ưu tiên: trả lời bằng 1 việc cần làm ngay, kèm nút/màn thao tác an toàn.";
}

function buildOwnerContextDigest(input: { intent: OwnerAiIntent; snapshot?: unknown; context?: Record<string, unknown> }) {
  const snapshot = recordFromUnknown(input.snapshot);
  const context = recordFromUnknown(input.context);
  const scope = recordFromUnknown(snapshot?.scope);
  const summary = recordFromUnknown(snapshot?.summary24h);
  const restaurant = recordFromUnknown(snapshot?.restaurant);
  const readiness = recordFromUnknown(restaurant?.setupReadiness);
  const tables = recordFromUnknown(snapshot?.tables);
  const menu = recordFromUnknown(snapshot?.menu);
  const inventory = recordFromUnknown(snapshot?.inventory);
  const staff = recordFromUnknown(snapshot?.staff);
  const payments = recordFromUnknown(snapshot?.payments);
  const operationInsights = recordFromUnknown(snapshot?.operationInsights);
  const insightRows = recordArray(operationInsights?.insights);
  const primaryInsightId = textValue(operationInsights?.primaryInsightId);
  const primaryInsight = insightRows.find((insight) => textValue(insight.id) === primaryInsightId) ?? insightRows[0];
  const route = textValue(context?.route) || textValue(context?.currentPath) || textValue(context?.pathname);
  const scopeLabel = textValue(scope?.type) === "branch" ? `chi nhánh ${textValue(scope?.branchName) || textValue(scope?.branchId) || "được gán"}` : "toàn quán";
  const plan = ownerRoutePlans[input.intent];
  const passport = sanitizeOperationalPassport(context?.operationalPassport) || sanitizeOperationalPassport(context?.passport);
  const attentionOrders = topAttentionOrders(snapshot);
  const setupBlockers = [
    ...textArray(readiness?.launchBlockers),
    ...textArray(readiness?.criticalMissing),
    ...textArray(readiness?.nextActions)
  ].slice(0, 5);
  const waitingConfirmPayments = numberValue(payments?.waitingConfirm);
  const menuItemCount = numberValue(menu?.itemCount);
  const menuUnavailableCount = numberValue(menu?.unavailableCount);
  const orderStatus = statusCountText(summary?.statusCount);
  const paymentStatus = statusCountText(summary?.paymentStatusCount);
  const lines = [
    `Context digest ưu tiên: intent=${input.intent}, scope=${scopeLabel}${route ? `, route=${route}` : ""}.`,
    `Router hiểu nhiệm vụ: ${plan.outputMode}. Cần dữ liệu: ${plan.dataNeeds.join(", ")}. Hành động cho phép: ${plan.operatingActions.join(", ")}. Contract: ${plan.actionContract}`,
    summary
      ? `Ca 24h: ${numberValue(summary.orderCount)} đơn, doanh thu đã thanh toán ${formatVnd(summary.paidRevenue)}${orderStatus ? `, order ${orderStatus}` : ""}${paymentStatus ? `, payment ${paymentStatus}` : ""}.`
      : "Ca 24h: chưa có summary trong snapshot.",
    attentionOrders.length ? `Đơn cần chú ý: ${attentionOrders.join(" | ")}.` : "Đơn cần chú ý: chưa thấy đơn khẩn trong recentOrders.",
    tables
      ? `Bàn/QR: ${numberValue(tables.activeTableCount)}/${numberValue(tables.tableCount)} bàn đang hoạt động, ${numberValue(tables.qrDisabledCount)} QR tắt.`
      : "",
    menu ? `Menu: ${menuItemCount} món, ${menuUnavailableCount} món tạm hết/chưa bán.` : "",
    inventory
      ? `Kho: ${numberValue(inventory.lowStockCount)} nguyên liệu dưới ngưỡng, recipe coverage ${Math.round(numberValue(inventory.recipeCoveragePercent))}%, ${numberValue(inventory.openAlertCount)} alert mở, dự kiến nhập ${formatVnd(inventory.projectedPurchaseValue)}, ${numberValue(inventory.wasteSignalCount)} tín hiệu hao hụt, ${numberValue(inventory.highFoodCostItemCount)} món food cost cao.`
      : "",
    buildOwnerStaffContextLine(staff),
    payments ? `Thanh toán: ${waitingConfirmPayments} giao dịch chờ xác nhận trong snapshot.` : "",
    readiness ? `Setup: điểm ${numberValue(readiness.score)}, blocker ${setupBlockers.slice(0, 3).join(" | ") || "không có blocker rõ"}.` : "",
    operationInsights ? `AI Ops: ${textValue(operationInsights.summary) || `health ${numberValue(operationInsights.healthScore)}/100`}.` : "",
    primaryInsight
      ? `Insight ưu tiên: ${textValue(primaryInsight.title)} - ${textValue(primaryInsight.detail)} Action: ${textValue(primaryInsight.action)}.`
      : "",
    passport ? passportDigest(passport) : "",
    buildOwnerNextStep({ intent: input.intent, attentionOrders, waitingConfirmPayments, menuItemCount, menuUnavailableCount, setupBlockers })
  ];
  return lines.filter(Boolean).join("\n").slice(0, 2200);
}

function buildCustomerContextDigest(input: {
  restaurant: AiRestaurantContext;
  intent: CustomerAiIntent;
  cart?: unknown;
  orderStatus?: unknown;
  menuSnapshot?: unknown;
  reservationStatus?: unknown;
  context?: Record<string, unknown>;
}) {
  const menu = recordFromUnknown(input.menuSnapshot);
  const cart = recordFromUnknown(input.cart);
  const orderStatus = recordFromUnknown(input.orderStatus);
  const reservationStatus = recordFromUnknown(input.reservationStatus);
  const context = recordFromUnknown(input.context);
  const categories = recordArray(menu?.categories);
  const menuItemCount = numberValue(menu?.itemCount) || categories.reduce((sum, category) => sum + recordArray(category.items).length, 0);
  const promotions = recordArray(menu?.promotions);
  const cartItems = recordArray(cart?.items ?? input.cart);
  const orderState = textValue(orderStatus?.status) || textValue(orderStatus?.orderStatus);
  const paymentState = textValue(orderStatus?.paymentStatus);
  const reservationState = textValue(reservationStatus?.status);
  const reservationDepositState = textValue(reservationStatus?.depositStatus);
  const reservationStartsAt = textValue(reservationStatus?.startsAt);
  const reservationHoldExpiresAt = textValue(reservationStatus?.holdExpiresAt);
  const passport = sanitizeOperationalPassport(context?.operationalPassport) || sanitizeOperationalPassport(context?.passport);
  const nextStep =
    input.intent === "guest_faq"
      ? "Bước tiếp: trả lời trực tiếp như nhân viên quán. Không lái sang gọi món nếu khách chỉ hỏi giờ, địa chỉ, wifi, gửi xe hoặc thông tin chung."
      : input.intent === "reservation"
      ? reservationState
        ? "Bước tiếp: giải thích trạng thái lịch đặt, cọc/giữ bàn và dẫn khách tới CTA cập nhật, chuyển cọc, hủy có xác nhận hoặc gọi quán."
        : "Bước tiếp: dẫn khách chọn ngày, số khách, khung giờ và chuẩn bị số điện thoại."
      : input.intent === "cart" && cartItems.length
      ? "Bước tiếp: nhắc khách mở giỏ, kiểm tra số lượng/ghi chú rồi gửi đơn."
      : orderState || paymentState
        ? "Bước tiếp: giải thích đúng trạng thái đơn/thanh toán và dẫn tới hóa đơn hoặc nút thanh toán."
        : menuItemCount > 0
          ? "Bước tiếp: gợi ý tối đa 3 món có trong menu thật và nhắc nút thêm món."
          : "Bước tiếp: nói menu chưa đủ dữ liệu, hướng khách xem danh mục hoặc hỏi khẩu vị.";

  return [
    `Context khách ưu tiên: intent=${input.intent}.`,
    `Thông tin quán public: tên=${input.restaurant.name}; loại hình=${input.restaurant.business_type || "chưa cấu hình"}; địa chỉ=${input.restaurant.address || "chưa cấu hình"}; hotline=${input.restaurant.hotline || "chưa cấu hình"}; giờ mở cửa=${restaurantHoursText(input.restaurant)}; trạng thái giờ hiện tại=${restaurantOpenStateText(input.restaurant)}.`,
    input.restaurant.description ? `Mô tả quán: ${input.restaurant.description}` : "",
    `Menu đang có: ${categories.length} danh mục, ${menuItemCount} món, ${promotions.length} khuyến mãi.`,
    `Giỏ hàng: ${cartItems.length} dòng món.`,
    orderState || paymentState ? `Đơn hiện tại: ${orderState || "chưa rõ trạng thái"}${paymentState ? `/${paymentState}` : ""}.` : "",
    reservationState
      ? `Lịch đặt hiện tại: status=${reservationState}${reservationDepositState ? `, deposit=${reservationDepositState}` : ""}${reservationStartsAt ? `, startsAt=${reservationStartsAt}` : ""}${reservationHoldExpiresAt ? `, holdExpiresAt=${reservationHoldExpiresAt}` : ""}.`
      : input.intent === "reservation"
        ? "Lịch đặt hiện tại: chưa có booking trong context."
        : "",
    passport ? passportDigest(passport) : "",
    nextStep
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1200);
}

function buildOwnerPromptKernel(config: IntentConfig<OwnerAiIntent>, restaurant: AiRestaurantContext) {
  return [
    "Bạn là LogiVN AI Operating Copilot cho chủ quán F&B tại Việt Nam.",
    "Nhiệm vụ: biến câu hỏi thành hành động vận hành ngắn, đúng màn, đúng dữ liệu, không đốt quota bằng lời khuyên chung chung.",
    "Ngôn ngữ bắt buộc: tiếng Việt tự nhiên, gọn, rõ hành động.",
    "Tuyệt đối không dùng markdown, không dùng **, không dùng tiêu đề dài. Trả plain text ngắn.",
    "Vòng lặp agent bắt buộc: Diagnose dữ liệu -> Decide bước ưu tiên -> Guide thao tác -> Hand off sang action/card nếu cần.",
    ownerRoutePlanText(config.intent),
    "Khi chủ quán dùng động từ tạo/chạy/xử lý/lưu cho menu, kho, khuyến mãi, nhân sự, hỗ trợ, báo cáo hoặc chi nhánh: phải handoff sang owner_agent_executor/action card, không chỉ viết lời khuyên.",
    "Quy tắc router prompt: trước khi trả lời phải tự xác định intent, dữ liệu cần lấy, dữ liệu đang thiếu, action contract và mức rủi ro. Chỉ nêu kết quả cuối cho chủ quán, không lộ chain-of-thought.",
    "Chỉ dùng dữ liệu được cung cấp trong prompt. Nếu thiếu dữ liệu, nói rõ 'chưa có dữ liệu' và đề xuất màn cần cấu hình.",
    "Không tự xác nhận thanh toán, không hủy/xóa dữ liệu, không đổi gói, không hứa đã thay đổi dữ liệu nếu chưa có action chạy thành công.",
    "Không yêu cầu API key/env/token. Không suy đoán dữ liệu quán khác. Không expose raw JSON/tool output cho UI.",
    "Không hiển thị raw route/path như /menu, /promotions hoặc /dashboard/menu trong câu trả lời. Nếu cần điều hướng, nói 'mở màn Menu/Khuyến mãi/Đơn hàng' và để action card chứa link thật.",
    "Nếu prompt có Context digest, đọc nó trước JSON thô và dùng nó làm nguồn ưu tiên để quyết định màn, rủi ro và bước tiếp.",
    "Nếu người dùng đang ở một route cụ thể, trả lời như trợ lý nhúng trong màn đó; không chuyển chủ đề nếu không cần.",
    "Nếu câu hỏi liên quan OCR, logo, ảnh món, branding hoặc setup: trả lời theo hướng tạo draft/action dùng được ngay, không chỉ mô tả lý thuyết.",
    "Nếu câu hỏi liên quan xử lý đơn/bếp/thanh toán: ưu tiên action an toàn, batch action khi có nhiều đơn chờ, và nêu bước cần chủ quán xác nhận.",
    "Nếu không chắc intent: chọn hành động an toàn nhất là mở đúng màn hoặc tạo checklist ngắn; không im lặng.",
    "Ưu tiên câu trả lời scan nhanh trên màn hình quản lý: tối đa 3 dòng, ít chữ, nhiều thao tác cụ thể.",
    `Danh mục prompt: ${config.label} (${config.intent}).`,
    `Mục tiêu danh mục: ${config.description}`,
    config.dataScope ? `Phạm vi dữ liệu được phép dùng: ${config.dataScope}` : "",
    config.guardrails?.length ? `Luật an toàn riêng:\n${config.guardrails.map((item) => `- ${item}`).join("\n")}` : "",
    config.systemAddendum,
    `Contract trả lời: ${config.responseContract}`,
    `Quán: ${restaurant.name}. Slug: ${restaurant.slug}. Loại hình: ${restaurant.business_type || "chưa cấu hình"}.`,
    `Địa chỉ: ${restaurant.address || "chưa cấu hình"}. Hotline: ${restaurant.hotline || "chưa cấu hình"}.`,
    restaurant.description ? `Mô tả quán: ${restaurant.description}` : ""
  ].filter(Boolean);
}

function buildCustomerPromptKernel(config: IntentConfig<CustomerAiIntent>, restaurant: AiRestaurantContext) {
  return [
    "Bạn là LogiBot, nhân viên phục vụ/lễ tân AI của quán trên LogiVN dành cho khách hàng đang dùng điện thoại.",
    "Nhiệm vụ: trả lời đúng câu hỏi của khách trước; nếu khách muốn thao tác thì dẫn tới nút đúng trong giao diện.",
    "Ngôn ngữ bắt buộc: tiếng Việt tự nhiên, ấm, gọn như nhân viên quán thật.",
    "Tuyệt đối không dùng markdown, không dùng **, không dùng bullet dài.",
    "Với câu hỏi thường ngày như chào hỏi, giờ mở cửa, địa chỉ, hotline, wifi, gửi xe, không gian, còn mở không: trả lời trực tiếp trước, không ép CTA.",
    "Không tự tạo đơn, không tự thêm/xóa món, không xác nhận đã thanh toán. Hướng dẫn khách bấm nút trong giao diện.",
    "Chỉ gợi ý món có trong menu snapshot. Nếu thiếu dữ liệu, nói rõ và hỏi lại một câu ngắn.",
    "Chỉ nói thông tin public có trong context. Nếu quán chưa cấu hình giờ mở cửa, wifi, gửi xe hoặc thông tin tương tự, nói 'mình chưa thấy thông tin này trên hệ thống' và gợi ý gọi nhân viên/quán.",
    "Không yêu cầu thông tin nhạy cảm. Với dị ứng nghiêm trọng, khuyên khách gọi nhân viên.",
    "Không lặp lại danh sách món dài. UI có thể hiển thị CTA; câu trả lời chỉ nhắc CTA khi thật sự giúp khách làm tiếp.",
    "Nếu prompt có Context khách ưu tiên, đọc trước JSON thô và trả lời theo trạng thái menu/giỏ/đơn hiện tại.",
    `Danh mục hỗ trợ: ${config.label} (${config.intent}).`,
    config.systemAddendum,
    `Contract trả lời: ${config.responseContract}`,
    `Quán: ${restaurant.name}. Loại hình: ${restaurant.business_type || "chưa cấu hình"}.`,
    `Địa chỉ: ${restaurant.address || "chưa cấu hình"}. Hotline: ${restaurant.hotline || "chưa cấu hình"}. Giờ mở cửa: ${restaurantHoursText(restaurant)}. Trạng thái giờ hiện tại: ${restaurantOpenStateText(restaurant)}.`,
    restaurant.description ? `Mô tả quán: ${restaurant.description}` : ""
  ];
}

export function normalizeOwnerAiIntent(value: string | null | undefined, message: string) {
  return asKey(value, ownerAiIntentConfig) ?? inferIntent(message, ownerKeywordMap, "overview", ownerRouteRules);
}

export function normalizeCustomerAiIntent(value: string | null | undefined, message: string) {
  return asKey(value, customerAiIntentConfig) ?? inferIntent(message, customerKeywordMap, "guest_faq", customerRouteRules);
}

export function normalizeStoreSetupDraftKind(value: string | null | undefined) {
  return asKey(value, storeSetupDraftConfig) ?? "brand_profile";
}

export function buildOwnerAssistantMessages(input: {
  restaurant: AiRestaurantContext;
  intent: OwnerAiIntent;
  message: string;
  context?: Record<string, unknown>;
  snapshot?: unknown;
  memoryContext?: string | null;
}): AiPromptMessage[] {
  const config = ownerAiIntentConfig[input.intent];
  const contextDigest = buildOwnerContextDigest(input);
  return [
    {
      role: "system",
      content: buildOwnerPromptKernel(config, input.restaurant).join("\n")
    },
    {
      role: "user",
      content: [
        `Yêu cầu của chủ quán:\n${input.message.trim()}`,
        contextDigest ? `\n\n${contextDigest}` : "",
        input.memoryContext ? `\n\nRestaurant memory được lưu cho đúng quán:\n${input.memoryContext.slice(0, 1800)}` : "",
        input.snapshot ? `\nSnapshot vận hành đúng phạm vi tenant/chi nhánh:\n${jsonBlock(input.snapshot, 9000)}` : "",
        input.context ? `\nNgữ cảnh UI từ dashboard:\n${jsonBlock(input.context, 5000)}` : "",
        "\nHãy trả lời plain text cực gọn theo 3 dòng: Tình huống, Bước tiếp, Nút/màn nên bấm. Không markdown. Không liệt kê dài vì UI đã có nút action riêng."
        + "\nNếu intent có output=draft/apply/queue, phải nói rõ draft/queue/action nào nên được tạo hoặc mở. Không chỉ tư vấn."
      ].join("")
    }
  ];
}

export function buildCustomerAssistantMessages(input: {
  restaurant: AiRestaurantContext;
  intent: CustomerAiIntent;
  message: string;
  cart?: unknown;
  orderStatus?: unknown;
  menuSnapshot?: unknown;
  reservationStatus?: unknown;
  context?: Record<string, unknown>;
}): AiPromptMessage[] {
  const config = customerAiIntentConfig[input.intent];
  const contextDigest = buildCustomerContextDigest(input);
  return [
    {
      role: "system",
      content: buildCustomerPromptKernel(config, input.restaurant).join("\n")
    },
    {
      role: "user",
      content: [
        `Khách hỏi:\n${input.message.trim()}`,
        contextDigest ? `\n\n${contextDigest}` : "",
        input.menuSnapshot ? `\nMenu/khuyến mãi đang hiển thị:\n${jsonBlock(input.menuSnapshot, 6500)}` : "",
        input.cart ? `\nGiỏ hàng hiện tại:\n${jsonBlock(input.cart, 3000)}` : "",
        input.orderStatus ? `\nTrạng thái đơn/hóa đơn hiện tại:\n${jsonBlock(input.orderStatus, 3500)}` : "",
        input.reservationStatus ? `\nTrạng thái đặt bàn hiện tại:\n${jsonBlock(input.reservationStatus, 3500)}` : "",
        input.intent === "guest_faq"
          ? "\nTrả lời plain text tối đa 1-3 câu như nhân viên quán. Không nhắc CTA nếu khách chỉ hỏi thông tin; chỉ gợi ý xem menu, đặt bàn hoặc gọi nhân viên khi câu hỏi thật sự cần thao tác."
          : "\nTrả lời plain text tối đa 2-3 dòng. Nếu phù hợp, nhắc ngắn rằng khách có thể bấm CTA bên dưới như Thêm món, Mở giỏ, Gọi nhân viên, Tôi đã thanh toán, Hóa đơn, Cập nhật lịch đặt hoặc Huỷ lịch có xác nhận."
      ].join("")
    }
  ];
}

export function buildBrandingMessages(input: {
  restaurant: AiRestaurantContext;
  restaurantName?: string;
  businessType?: string;
  tone?: string;
  audience?: string;
}) {
  const restaurantName = input.restaurantName || input.restaurant.name;
  const businessType = input.businessType || input.restaurant.business_type || "quán cafe/nhà hàng";
  const tone = input.tone || "hiện đại, đáng tin, ấm, có tinh thần Việt nhưng không sến";
  const audience = input.audience || "khách địa phương, dân văn phòng và nhóm khách quen";
  const prompt = [
    "Tạo bộ nội dung thương hiệu có thể dùng thật cho quán F&B Việt Nam.",
    "Chỉ trả về JSON hợp lệ, không markdown.",
    "Schema: {\"slogans\":[string,string,string],\"description\":string,\"brandVoice\":string,\"logoPrompt\":string,\"menuHeroPrompt\":string,\"warnings\":[string]}",
    "Slogan: tiếng Việt tự nhiên, tối đa 54 ký tự, không sáo rỗng kiểu 'nâng tầm trải nghiệm'.",
    "Description: tối đa 500 ký tự, mô tả đúng loại hình, không cam kết chất lượng/y tế nếu thiếu căn cứ.",
    "BrandVoice: tối đa 160 ký tự, đủ rõ để nhân viên viết nội dung đồng nhất.",
    "LogoPrompt phải là creative brief chuyên nghiệp cho ảnh vuông 1024x1024: emblem/icon, silhouette rõ, scalable, dùng được làm avatar/app icon/menu badge.",
    "LogoPrompt tuyệt đối không yêu cầu AI render chữ, tên quán, typography nhỏ, QR, watermark, menu text hay số điện thoại.",
    "MenuHeroPrompt là ảnh nền/cover thương mại: có không gian âm để LogiVN overlay chữ thật, giàu cảm xúc F&B, không có text trong ảnh.",
    "Mỗi prompt ảnh phải gồm: subject, composition, visual style, color palette, lighting, material/texture, negative constraints.",
    `Tên quán: ${restaurantName}`,
    `Loại hình: ${businessType}`,
    `Phong cách: ${tone}`,
    `Khách mục tiêu: ${audience}`
  ].join("\n");

  return [
    {
      role: "system",
      content: "Bạn là brand strategist F&B Việt Nam, creative director và prompt engineer ảnh thương mại. Trả JSON thuần, sắc, không filler."
    },
    { role: "user", content: prompt }
  ] satisfies AiPromptMessage[];
}

export function buildStoreSetupPlanMessages(input: {
  restaurant: AiRestaurantContext;
  readiness: unknown;
  mode?: "audit" | "express" | "growth";
  focus?: string;
}) {
  const modeText =
    input.mode === "express"
      ? "Tạo kế hoạch setup nhanh trong 30 phút."
      : input.mode === "growth"
        ? "Tập trung tính năng Pro/Premium giúp quán tăng doanh thu và giảm công vận hành."
        : "Audit toàn diện mức sẵn sàng thương mại hóa.";

  return [
    {
      role: "system",
      content: [
        "Bạn là LogiVN AI Store Setup Architect cho chủ quán F&B Việt Nam.",
        "Bạn biến dữ liệu cấu hình hiện tại thành kế hoạch setup rõ việc, rõ màn thao tác, ưu tiên việc có tác động thương mại.",
        "Chỉ trả JSON hợp lệ, không markdown, không giải thích ngoài JSON.",
        "Không bịa dữ liệu, không nói đã cấu hình nếu readiness item chưa done.",
        "Không yêu cầu API key, không tiết lộ env, không đề xuất thao tác vượt quyền gói nếu chưa nhắc cần nâng cấp.",
        "Schema bắt buộc:",
        "{\"summary\":string,\"readinessScore\":number,\"launchBlockers\":[string],\"expressSetup\":[{\"title\":string,\"why\":string,\"where\":string,\"estimatedMinutes\":number,\"priority\":\"critical\"|\"high\"|\"medium\"|\"low\"}],\"aiAutopilot\":[{\"feature\":string,\"value\":string,\"plan\":\"pro\"|\"premium\"|\"any\"}],\"customerExperience\":[string],\"ownerMessage\":string}",
        `Quán: ${input.restaurant.name}. Loại hình: ${input.restaurant.business_type || "chưa cấu hình"}.`,
        modeText
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Focus thêm từ chủ quán: ${input.focus?.trim() || "không có"}`,
        `\nReadiness JSON:\n${jsonBlock(input.readiness, 9000)}`,
        "\nHãy tạo kế hoạch thực dụng, giúp chủ quán hoàn tất setup nhanh nhất. Mỗi where phải là route thật trong dashboard."
      ].join("")
    }
  ] satisfies AiPromptMessage[];
}

export function buildStoreSetupDraftMessages(input: {
  restaurant: AiRestaurantContext;
  readiness: unknown;
  kind: StoreSetupDraftKind;
  focus?: string;
}) {
  const config = storeSetupDraftConfig[input.kind];
  return [
    {
      role: "system",
      content: [
        "Bạn là LogiVN AI Store Setup Copilot chuyên tạo bản nháp cấu hình cho chủ quán F&B Việt Nam.",
        "Chỉ trả JSON hợp lệ, không markdown, không text ngoài JSON.",
        "Không tự ghi dữ liệu, không nói đã lưu, không yêu cầu API key/env.",
        "Tạo nội dung ngắn, có thể dùng ngay trong dashboard.",
        "Nếu đề xuất tính năng thuộc Premium/Pro, ghi rõ plan trong requiresPlan và không giả vờ gói hiện tại đã có quyền.",
        `Loại bản nháp: ${config.label} (${config.kind}).`,
        `Mục tiêu: ${config.description}`,
        `Route thao tác: ${config.route}`,
        `Gói phù hợp: ${config.plan}`,
        `Tập trung đầu ra: ${config.outputFocus}`,
        `Guardrails:\n${config.guardrails.map((item) => `- ${item}`).join("\n")}`,
        "Schema bắt buộc:",
        "{\"kind\":string,\"title\":string,\"confidence\":number,\"requiresPlan\":\"pro\"|\"premium\"|\"any\",\"route\":string,\"quickWins\":[string],\"draft\":{\"fields\":[{\"label\":string,\"value\":string,\"copySafe\":boolean}],\"settings\":[{\"key\":string,\"value\":string|number|boolean,\"reason\":string}],\"prompts\":[{\"label\":string,\"prompt\":string,\"warning\":string|null}],\"checklist\":[string]},\"ownerNote\":string}",
        `Quán: ${input.restaurant.name}. Slug: ${input.restaurant.slug}. Loại hình: ${input.restaurant.business_type || "chưa cấu hình"}.`,
        `Địa chỉ: ${input.restaurant.address || "chưa cấu hình"}. Hotline: ${input.restaurant.hotline || "chưa cấu hình"}.`,
        input.restaurant.description ? `Mô tả hiện tại: ${input.restaurant.description}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    },
    {
      role: "user",
      content: [
        `Focus thêm từ chủ quán: ${input.focus?.trim() || "không có"}`,
        `\nReadiness JSON:\n${jsonBlock(input.readiness, 9000)}`,
        "\nHãy tạo bản nháp thực dụng. Mọi route trong JSON phải là route thật của dashboard. Không bịa dữ liệu đã có; nếu thiếu, đưa vào checklist."
      ].join("")
    }
  ] satisfies AiPromptMessage[];
}

export function buildMenuOcrPrompt(input: { imageUrl?: string; imageBase64?: string; rawText?: string }) {
  const contentSource = input.rawText
    ? `Nội dung OCR thô hoặc menu cũ:\n${input.rawText}`
    : `Ảnh menu: ${input.imageUrl || input.imageBase64?.slice(0, 120) || "không có"}`;

  return [
    "Bạn là AI nhập liệu menu quán F&B Việt Nam. Trích xuất danh mục, món, giá từ menu.",
    "Chỉ trả JSON hợp lệ, không markdown.",
    "Schema: {\"categories\":[{\"name\":string,\"items\":[{\"name\":string,\"price\":number,\"description\":string|null,\"tags\":[string]}]}],\"warnings\":[string],\"confidence\":number}",
    "Giá phải là VND dạng số nguyên. Nếu không chắc, đưa vào warnings và confidence thấp.",
    "Nếu tên món và giá nằm cùng một dòng, hãy tách số cuối dòng thành price và loại phần giá khỏi name. Ví dụ \"Cà phê sữa đá 28.000\" => name \"Cà phê sữa đá\", price 28000.",
    "Không đưa tiêu đề quán, chữ MENU, số điện thoại, địa chỉ hoặc ghi chú không có giá vào danh sách items.",
    "Không tự thêm món không có trong ảnh/nội dung. Chuẩn hóa lỗi OCR phổ biến nhưng giữ tên món dễ nhận biết.",
    "Tags nên là các nhãn ngắn như bán chạy, đồ uống, món nóng, ăn nhẹ, chay, cay, signature nếu có căn cứ.",
    contentSource
  ].join("\n");
}

export function buildInventoryOcrPrompt(input: { imageUrl?: string; imageBase64?: string; rawText?: string }) {
  const contentSource = input.rawText
    ? `Nội dung hóa đơn/danh sách nhập kho thô:\n${input.rawText}`
    : `Ảnh hóa đơn/phiếu nhập kho: ${input.imageUrl || input.imageBase64?.slice(0, 120) || "không có"}`;

  return [
    "Bạn là AI nhập liệu kho cho quán F&B Việt Nam. Hãy trích xuất nguyên liệu/hàng hóa từ hóa đơn, phiếu nhập hoặc danh sách mua hàng.",
    "Chỉ trả JSON hợp lệ, không markdown, không giải thích ngoài JSON.",
    "Schema bắt buộc: {\"rows\":[{\"name\":string,\"unit\":string,\"quantity\":number,\"minimumQuantity\":number,\"referenceUnitCost\":number,\"categoryName\":string|null}],\"warnings\":[string],\"confidence\":number}",
    "name là tên nguyên liệu ngắn gọn, bỏ mã hàng nếu không cần. unit chỉ dùng ký tự latin như kg, g, ml, l, chai, lon, goi, hop, cai, thung, bao.",
    "quantity là số lượng nhập. Nếu hóa đơn có thành tiền và đơn giá, referenceUnitCost là đơn giá VND dạng số nguyên. Nếu chỉ có tổng tiền, hãy chia theo quantity khi đủ căn cứ.",
    "minimumQuantity nếu không có trong nội dung thì trả 0, không tự bịa định mức.",
    "categoryName nên là nhóm ngắn như Bar, Bếp nóng, Dairy, Bao bì, Gia vị nếu có căn cứ; nếu không chắc thì null.",
    "Không đưa VAT, tổng cộng, phí giao hàng, số điện thoại, địa chỉ, mã đơn, ngày tháng vào rows.",
    "Nếu OCR mơ hồ, vẫn trả dòng có thể đọc được và thêm cảnh báo rõ trong warnings.",
    contentSource
  ].join("\n");
}

export function buildImageGenerationPrompt(input: {
  kind: "logo" | "menu_preview" | "food_photo";
  restaurantName?: string;
  businessType?: string;
  prompt?: string;
}) {
  const restaurantName = input.restaurantName || "Vietnamese cafe/restaurant";
  const businessType = input.businessType || "F&B";
  const creativeDirection = input.prompt?.trim().replace(/\s+/g, " ").slice(0, 1500);
  const base = [
    "Create a premium commercial image for LogiVN, a Vietnamese QR ordering and restaurant operations platform.",
    `Restaurant context: ${restaurantName}. Business type: ${businessType}.`,
    "Brand atmosphere: trustworthy Vietnamese hospitality, modern but warm, not generic SaaS stock art.",
    "Core palette guidance: deep forest green, ivory rice-paper white, warm orange accent, natural food colors.",
    "Output must feel production-ready for a real restaurant dashboard, not a demo placeholder.",
    "Global negative constraints: no watermark, no QR code, no random letters, no misspelled text, no cluttered composition, no plastic-looking food, no distorted hands, no cheap 3D clipart, no generic AI mascot."
  ];

  if (creativeDirection) base.push(`Specific creative brief from app/user: ${creativeDirection}`);
  if (input.kind === "logo") {
    base.push(
      "Asset type: square logo emblem, 1024x1024.",
      "Composition: centered icon mark with strong silhouette, readable at 48px, balanced negative space, no mockup background.",
      "Style: premium vector-inspired emblem, clean geometry, subtle Vietnamese F&B cue only if tasteful, not a cartoon mascot.",
      "Materials: flat color with slight paper/ink texture, crisp edges, app-icon-ready.",
      "Hard rule: do not render the restaurant name, typography, initials, menu text or slogan in the image."
    );
  }
  if (input.kind === "menu_preview") {
    base.push(
      "Asset type: landscape menu hero cover, 1536x1024.",
      "Composition: editorial F&B scene with clear blank panel/negative space for HTML text overlay on one side.",
      "Style: premium Vietnamese restaurant photography mixed with subtle brand illustration, cinematic but practical.",
      "Lighting: soft natural window light, appetizing highlights, clean table surface.",
      "Hard rule: no readable menu item text, no fake prices, no poster typography."
    );
  }
  if (input.kind === "food_photo") {
    base.push(
      "Asset type: realistic food photo for a digital menu card, square 1024x1024.",
      "Composition: hero dish centered, 45-degree camera angle, enough margin for cropping, no text overlays.",
      "Style: natural Vietnamese food photography, appetizing steam/texture, real ingredients, honest portion size.",
      "Lighting: soft side light, warm highlights, clean shadows, commercial menu quality.",
      "Hard rule: the generated dish must match the specific dish named in the creative brief; if no dish is provided, do not invent a random dish."
    );
  }
  return base.join("\n");
}
