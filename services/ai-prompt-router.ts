import "server-only";

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
};

export type OwnerAiIntent =
  | "setup"
  | "overview"
  | "orders"
  | "kitchen"
  | "menu"
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
      "Không tự thêm món vào database.",
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
    guardrails: ["Không bịa doanh thu.", "Chỉ ưu tiên theo dữ liệu hiện có.", "Không xác nhận thay thao tác của chủ quán."],
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
    guardrails: ["Không tự nhận đơn.", "Không xác nhận thanh toán.", "Không bỏ qua thứ tự trạng thái hợp lệ."],
    systemAddendum:
      "Chỉ dùng trạng thái đơn trong dữ liệu. Không tự nhận đơn, không tự xác nhận thanh toán. Khi cần thao tác, chỉ rõ nút hoặc khu vực trong dashboard.",
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
    description: "Gợi ý phân công, quyền nhân viên, ca làm và xử lý yêu cầu gọi nhân viên.",
    dataScope: "Role hiện có nếu snapshot cung cấp, yêu cầu gọi nhân viên, đơn/bàn cần người xử lý.",
    guardrails: ["Ưu tiên least privilege.", "Không đề xuất chia sẻ tài khoản ADMIN."],
    systemAddendum:
      "Đóng vai quản lý ca. Tập trung phân quyền tối thiểu, trách nhiệm rõ, phản hồi nhanh yêu cầu gọi nhân viên.",
    responseContract: "Nêu việc cần giao, người/role nên nhận và thời hạn xử lý.",
    suggestions: ["Phân công nhân viên trong ca đông", "Quyền STAFF nên giới hạn gì?", "Xử lý yêu cầu gọi nhân viên nhanh hơn"]
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
      "Không tự giữ bàn nếu chưa có booking. Hướng dẫn khách vào luồng đặt bàn, nhập số khách, giờ đến và thanh toán cọc nếu có.",
    responseContract: "Nêu bước đặt bàn và thông tin cần chuẩn bị.",
    suggestions: ["Tôi muốn đặt bàn", "Có cần đặt cọc không?", "Tôi đến muộn thì sao?"]
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
  setup: ["setup", "thiet lap", "cau hinh", "san sang", "onboarding", "bat dau", "setup nhanh"],
  overview: ["tong quan", "ca ban", "van hanh", "hom nay", "hien tai", "uu tien"],
  orders: ["don", "order", "nhan don", "xac nhan", "phuc vu", "trang thai don"],
  kitchen: ["bep", "ra mon", "tre mon", "qua gio", "sla", "dang nau"],
  menu: ["menu", "mon", "danh muc", "gia", "hinh anh", "ocr", "nhap menu"],
  tables: ["ban", "qr", "trong", "dang phuc vu", "so do ban"],
  payments: ["thanh toan", "vietqr", "tien mat", "chuyen khoan", "hoa don", "doi soat"],
  promotions: ["khuyen mai", "ma giam", "voucher", "campaign", "uu dai"],
  staff: ["nhan vien", "phan quyen", "ca lam", "goi nhan vien"],
  online: ["online", "ship", "giao hang", "pickup", "den lay", "ban kinh", "phi ship"],
  reservations: ["dat ban", "coc", "giu ban", "lich", "booking", "reservation"],
  reports: ["bao cao", "doanh thu", "analytics", "bieu do", "excel", "pdf", "email"],
  settings: ["cai dat", "ho so", "ngan hang", "logo", "dia chi", "gio mo cua"],
  security: ["bao mat", "rls", "hack", "bug goi", "spam", "quyen", "audit"],
  growth: ["slogan", "thuong hieu", "logo", "mo ta", "marketing", "tang truong"]
};

const customerKeywordMap: Record<CustomerAiIntent, string[]> = {
  menu_discovery: ["goi y", "mon nao", "ngon", "de an", "de uong", "nen thu", "menu"],
  cart: ["gio", "them", "xoa", "so luong", "goi them", "ghi chu"],
  order_status: ["don cua toi", "trang thai", "da nhan", "dang ra", "cho mon", "xac nhan"],
  payment: ["thanh toan", "vietqr", "tien mat", "hoa don", "chuyen khoan", "da tra"],
  staff_call: ["goi nhan vien", "nhan vien", "ho tro", "them nuoc", "muon gap"],
  delivery: ["giao hang", "ship", "dia chi", "phi ship", "bao lau", "theo doi"],
  reservation: ["dat ban", "giu ban", "dat cho", "coc"],
  promotion: ["ma giam", "khuyen mai", "voucher", "uu dai"],
  allergy: ["di ung", "an chay", "khong cay", "it cay", "it ngot", "hai san"]
};

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

function inferIntent<TIntent extends string>(message: string, keywordMap: Record<TIntent, string[]>, fallback: TIntent) {
  const folded = foldText(message);
  let bestIntent = fallback;
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(keywordMap) as Array<[TIntent, string[]]>) {
    const score = keywords.reduce((sum, keyword) => sum + (folded.includes(keyword) ? 1 : 0), 0);
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

export function normalizeOwnerAiIntent(value: string | null | undefined, message: string) {
  return asKey(value, ownerAiIntentConfig) ?? inferIntent(message, ownerKeywordMap, "overview");
}

export function normalizeCustomerAiIntent(value: string | null | undefined, message: string) {
  return asKey(value, customerAiIntentConfig) ?? inferIntent(message, customerKeywordMap, "menu_discovery");
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
}): AiPromptMessage[] {
  const config = ownerAiIntentConfig[input.intent];
  return [
    {
      role: "system",
      content: [
        "Bạn là LogiVN AI Operating Copilot cho chủ quán F&B tại Việt Nam.",
        "Ngôn ngữ bắt buộc: tiếng Việt tự nhiên, gọn, rõ hành động.",
        "Tuyệt đối không dùng markdown, không dùng **, không dùng tiêu đề dài. Trả plain text ngắn.",
        "Bạn hoạt động như AI agent theo vòng lặp: Diagnose -> Decide -> Guide -> Hand off action. Không trả lời như chatbot chung chung.",
        "Chỉ dùng dữ liệu được cung cấp trong prompt. Nếu thiếu dữ liệu, nói rõ 'chưa có dữ liệu' và đề xuất nơi cần cấu hình.",
        "Không tự nhận đơn, không tự xác nhận thanh toán, không hứa đã thay đổi dữ liệu. Chỉ hướng dẫn thao tác trong dashboard.",
        "Luôn bảo vệ dữ liệu tenant: không suy đoán dữ liệu quán khác, không nhắc tới khoá/API/env.",
        "Ưu tiên câu trả lời scan nhanh trên màn hình quản lý: tối đa 3 dòng, ít chữ, nhiều hành động cụ thể.",
        "Không nói kiểu 'hãy tự tìm'. Nếu cần thao tác, chỉ rõ màn, tên vùng, nút bấm và điều kiện an toàn.",
        "Mọi hành động nhạy cảm như xác nhận thanh toán, hủy đơn, đổi gói, xóa dữ liệu phải nêu là cần chủ quán tự xác nhận.",
        `Danh mục prompt: ${config.label} (${config.intent}).`,
        `Mục tiêu danh mục: ${config.description}`,
        config.dataScope ? `Phạm vi dữ liệu được phép dùng: ${config.dataScope}` : "",
        config.guardrails?.length ? `Luật an toàn riêng:\n${config.guardrails.map((item) => `- ${item}`).join("\n")}` : "",
        config.systemAddendum,
        `Contract trả lời: ${config.responseContract}`,
        `Quán: ${input.restaurant.name}. Slug: ${input.restaurant.slug}. Loại hình: ${input.restaurant.business_type || "chưa cấu hình"}.`,
        `Địa chỉ: ${input.restaurant.address || "chưa cấu hình"}. Hotline: ${input.restaurant.hotline || "chưa cấu hình"}.`,
        input.restaurant.description ? `Mô tả quán: ${input.restaurant.description}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    },
    {
      role: "user",
      content: [
        `Yêu cầu của chủ quán:\n${input.message.trim()}`,
        input.snapshot ? `\nSnapshot vận hành đúng restaurant_id:\n${jsonBlock(input.snapshot, 9000)}` : "",
        input.context ? `\nNgữ cảnh UI từ dashboard:\n${jsonBlock(input.context, 5000)}` : "",
        "\nHãy trả lời plain text cực gọn theo 3 dòng: Nhận định, Hành động ưu tiên, Lưu ý an toàn. Không markdown. Không liệt kê dài vì UI đã có nút action riêng."
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
}): AiPromptMessage[] {
  const config = customerAiIntentConfig[input.intent];
  return [
    {
      role: "system",
      content: [
        "Bạn là trợ lý gọi món của LogiVN dành cho khách hàng đang dùng điện thoại.",
        "Ngôn ngữ bắt buộc: tiếng Việt thân thiện, rất ngắn, dễ hiểu.",
        "Tuyệt đối không dùng markdown, không dùng **, không dùng bullet dài.",
        "Bạn là customer agent: hiểu nhu cầu, chỉ ra bước kế tiếp và hướng khách tới nút đúng trong giao diện.",
        "Không tự tạo đơn, không tự thêm/xóa món, không xác nhận đã thanh toán. Hướng dẫn khách bấm nút trong giao diện.",
        "Không yêu cầu thông tin nhạy cảm. Với dị ứng nghiêm trọng, khuyên khách gọi nhân viên.",
        "Nếu dữ liệu không có, hãy nói rõ và hỏi lại một câu ngắn.",
        "Không lặp lại danh sách món dài. UI sẽ tự hiển thị nút thêm giỏ/chọn món; câu trả lời chỉ giải thích quyết định.",
        `Danh mục hỗ trợ: ${config.label} (${config.intent}).`,
        config.systemAddendum,
        `Contract trả lời: ${config.responseContract}`,
        `Quán: ${input.restaurant.name}.`
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Khách hỏi:\n${input.message.trim()}`,
        input.menuSnapshot ? `\nMenu/khuyến mãi đang hiển thị:\n${jsonBlock(input.menuSnapshot, 6500)}` : "",
        input.cart ? `\nGiỏ hàng hiện tại:\n${jsonBlock(input.cart, 3000)}` : "",
        input.orderStatus ? `\nTrạng thái đơn/hóa đơn hiện tại:\n${jsonBlock(input.orderStatus, 3500)}` : "",
        "\nTrả lời plain text tối đa 2-3 dòng. Nếu phù hợp, nhắc ngắn rằng khách có thể bấm CTA bên dưới như Thêm món, Mở giỏ, Gọi nhân viên, Tôi đã thanh toán hoặc Hóa đơn."
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
  const prompt = [
    "Tạo bộ nội dung thương hiệu cho quán F&B Việt Nam.",
    "Chỉ trả về JSON hợp lệ, không markdown.",
    "Schema: {\"slogans\":[string,string,string],\"description\":string,\"brandVoice\":string,\"logoPrompt\":string,\"menuHeroPrompt\":string}",
    "Yêu cầu logoPrompt/menuHeroPrompt: không yêu cầu chữ nhỏ trong ảnh, không đặt text phức tạp vào ảnh; ưu tiên biểu tượng, màu sắc, bối cảnh, khoảng trống để app overlay chữ chuẩn.",
    "LogoPrompt phải mô tả biểu tượng/emblem, không yêu cầu AI render chính xác tên quán để tránh lỗi chữ.",
    "MenuHeroPrompt phải tạo ảnh nền/cover giàu cảm xúc, có chỗ trống để LogiVN chèn menu bằng HTML/CSS.",
    `Tên quán: ${input.restaurantName || input.restaurant.name}`,
    `Loại hình: ${input.businessType || input.restaurant.business_type || "quán cafe/nhà hàng"}`,
    `Phong cách: ${input.tone || "hiện đại, đáng tin, có tinh thần Việt"}`,
    `Khách mục tiêu: ${input.audience || "khách địa phương và dân văn phòng"}`
  ].join("\n");

  return [
    {
      role: "system",
      content: "Bạn là strategist thương hiệu F&B Việt Nam và prompt engineer tạo ảnh. Trả JSON thuần, súc tích, có thể dùng ngay."
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
    "Không tự thêm món không có trong ảnh/nội dung. Chuẩn hóa lỗi OCR phổ biến nhưng giữ tên món dễ nhận biết.",
    "Tags nên là các nhãn ngắn như bán chạy, đồ uống, món nóng, ăn nhẹ, chay, cay, signature nếu có căn cứ.",
    contentSource
  ].join("\n");
}

export function buildImageGenerationPrompt(input: {
  kind: "logo" | "menu_preview" | "food_photo";
  restaurantName?: string;
  businessType?: string;
  prompt?: string;
}) {
  const base = [
    "High quality commercial F&B brand image for a Vietnamese restaurant ordering platform.",
    "No small text, no long readable typography, no misspelled words, no watermark, no QR code.",
    "Leave clean empty space for the application to overlay exact Vietnamese text later.",
    "Modern premium Vietnamese hospitality, trustworthy, warm, minimal-futuristic SaaS aesthetic.",
    "Use deep green and warm orange as accents, ivory background, subtle Vietnamese cultural motifs only when tasteful.",
    `Kind: ${input.kind}.`,
    `Restaurant: ${input.restaurantName || "Vietnamese cafe/restaurant"}.`,
    `Business type: ${input.businessType || "F&B"}.`
  ];

  if (input.prompt) base.push(`Creative direction: ${input.prompt.trim().replace(/\s+/g, " ").slice(0, 1500)}`);
  if (input.kind === "logo") {
    base.push("Create an icon/emblem only. Do not render the restaurant name as text. Strong silhouette, works as app avatar.");
  }
  if (input.kind === "menu_preview") {
    base.push("Create a menu cover/hero background with food, Vietnamese hospitality atmosphere, blank content panels, no readable menu item text.");
  }
  if (input.kind === "food_photo") {
    base.push("Create a realistic appetizing food photo suitable for a digital menu card, clean composition, no text.");
  }
  return base.join(" ");
}
