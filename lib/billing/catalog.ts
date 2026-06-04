import type { BillingFeatureKey, BillingPlanDefinition, FeatureDescriptor } from "@/lib/billing/types";

export const featureCatalog: Record<BillingFeatureKey, FeatureDescriptor> = {
  tables: {
    key: "tables",
    label: "Số lượng bàn",
    description: "Quản lý sơ đồ bàn, QR theo khu vực và năng lực phục vụ.",
    group: "core",
    badge: "PRO",
    upgradeHeadline: "Mở rộng số lượng bàn khi quán tăng trưởng",
    upgradeBullets: ["Tăng layout trong giới hạn gói", "Phù hợp quán đông bàn hoặc nhiều tầng", "Giữ gọi món QR mượt khi mở rộng"]
  },
  staff: {
    key: "staff",
    label: "Nhân viên",
    description: "Tài khoản vận hành, phân vai và kiểm soát ca làm.",
    group: "core",
    badge: "PRO",
    upgradeHeadline: "Thêm nhân sự theo quy mô vận hành",
    upgradeBullets: ["Mở rộng theo ca", "Phân vai sâu hơn", "Sẵn sàng cho vận hành nhiều người"]
  },
  qr_ordering: {
    key: "qr_ordering",
    label: "Gọi món QR",
    description: "Khách quét QR, gọi món và thanh toán nhanh.",
    group: "core",
    badge: "PRO",
    upgradeHeadline: "Giữ gọi món QR là xương sống của quán",
    upgradeBullets: ["Khách tự gọi món", "Giảm áp lực nhân viên", "Tăng tốc phục vụ giờ cao điểm"]
  },
  payment_qr: {
    key: "payment_qr",
    label: "Thanh toán QR",
    description: "Tạo luồng thanh toán QR thân thiện với khách Việt.",
    group: "core",
    badge: "PRO",
    upgradeHeadline: "Giữ luồng thanh toán QR sẵn sàng cho mọi ca bán",
    upgradeBullets: ["Hợp thói quen VietQR", "Dễ đối soát", "Tối ưu checkout nhanh"]
  },
  menu_management: {
    key: "menu_management",
    label: "Quản lý menu",
    description: "Chỉnh món, giá và trạng thái bán theo thời gian thực.",
    group: "core",
    badge: "PRO",
    upgradeHeadline: "Giữ menu sống theo nhịp quán",
    upgradeBullets: ["Đổi món nhanh", "Giảm sai sót gọi món", "Tăng tốc onboarding menu"]
  },
  online_ordering: {
    key: "online_ordering",
    label: "Đặt món online",
    description: "Nhận đơn pickup và delivery trong cùng hệ thống.",
    group: "core",
    badge: "PRO",
    upgradeHeadline: "Mở rộng kênh doanh thu ngoài tại quán",
    upgradeBullets: ["Đến lấy + giao hàng", "Giảm thao tác thủ công", "Đồng bộ với bảng quản lý"]
  },
  order_realtime: {
    key: "order_realtime",
    label: "Đơn hàng realtime",
    description: "Bảng đơn hàng, bếp, thanh toán và cập nhật trạng thái theo thời gian thực.",
    group: "core",
    badge: "PRO",
    upgradeHeadline: "Giữ đơn hàng realtime là quyền vận hành nền tảng",
    upgradeBullets: ["Theo dõi đơn ngay khi khách gửi", "Đồng bộ bếp và thanh toán", "Không khóa sai khi quán đang ở gói Pro"]
  },
  inventory_basic: {
    key: "inventory_basic",
    label: "Kho cơ bản",
    description: "Danh sách nguyên liệu, tồn cơ bản và cảnh báo thiếu hàng cho quán nhỏ.",
    group: "inventory",
    badge: "PRO",
    upgradeHeadline: "Giữ kho đơn giản cho mọi chủ quán",
    upgradeBullets: ["Theo dõi nguyên liệu chính", "Nhìn hàng sắp thiếu", "Ghi nhận nhập/xuất cơ bản"]
  },
  inventory_premium: {
    key: "inventory_premium",
    label: "Trung tâm vận hành kho",
    description: "PO, nhà cung cấp, lô/HSD, kiểm kê, điều chuyển, hao hụt và kiểm soát cost.",
    group: "inventory",
    badge: "PREMIUM",
    upgradeHeadline: "Biến kho thành trung tâm kiểm soát thất thoát và giá vốn",
    upgradeBullets: ["Đề xuất mua hàng theo tồn thấp", "Theo dõi lô, HSD và điều chuyển", "Kiểm soát hao hụt, variance và food cost"]
  },
  inventory_ai_ocr: {
    key: "inventory_ai_ocr",
    label: "AI đọc hóa đơn kho",
    description: "Đọc hóa đơn nhập hàng và dựng nháp nhập kho bằng AI.",
    group: "inventory",
    badge: "AI",
    upgradeHeadline: "Rút ngắn nhập kho bằng AI đọc hóa đơn",
    upgradeBullets: ["Đọc hóa đơn nhập hàng", "Tạo nháp nguyên liệu và số lượng", "Giảm lỗi nhập tay giờ cao điểm"]
  },
  inventory_ai_intelligence: {
    key: "inventory_ai_intelligence",
    label: "AI tối ưu tồn kho",
    description: "AI gợi ý PO, phát hiện bất thường và tóm tắt việc cần làm trong kho.",
    group: "inventory",
    badge: "AI",
    upgradeHeadline: "Để AI chỉ ra kho cần mua gì và rủi ro nào đáng xử lý",
    upgradeBullets: ["Gợi ý PO từ tồn thấp", "Phát hiện waste, price spike và thiếu hàng", "Tóm tắt ưu tiên vận hành kho"]
  },
  basic_analytics: {
    key: "basic_analytics",
    label: "Analytics cơ bản",
    description: "Theo dõi đơn, doanh thu và tín hiệu vận hành nền tảng.",
    group: "analytics",
    badge: "PRO",
    upgradeHeadline: "Nhìn được vận hành thay vì đoán",
    upgradeBullets: ["Theo dõi doanh thu", "Biết trạng thái đơn", "Đủ cho quán đang tăng trưởng"]
  },
  ai_menu_generation: {
    key: "ai_menu_generation",
    label: "Tạo menu thông minh",
    description: "Gợi ý tên món, mô tả món và cấu trúc menu.",
    group: "ai",
    badge: "AI",
    upgradeHeadline: "Tăng tốc tạo menu bằng trợ lý thông minh",
    upgradeBullets: ["Tạo mô tả món nhanh", "Giữ giọng thương hiệu nhất quán", "Tiết kiệm thời gian setup"]
  },
  ai_chatbot: {
    key: "ai_chatbot",
    label: "Trợ lý hỏi đáp",
    description: "Trợ lý thông minh trả lời nhanh cho chủ quán hoặc khách hàng.",
    group: "ai",
    badge: "AI",
    upgradeHeadline: "Mở rộng trợ lý thông minh cho quán bận",
    upgradeBullets: ["Hỗ trợ hỏi đáp nhanh", "Giảm thao tác lặp lại", "Tăng trải nghiệm chuyên nghiệp"]
  },
  ai_image_generation: {
    key: "ai_image_generation",
    label: "Tạo ảnh thông minh",
    description: "Tạo ảnh món, banner và hình ảnh chiến dịch cho quán.",
    group: "ai",
    badge: "PREMIUM",
    upgradeHeadline: "Mở khóa tạo ảnh cho menu và marketing",
    upgradeBullets: ["Ảnh món đẹp hơn", "Banner promo nhanh hơn", "Tăng cảm giác premium cho thương hiệu"]
  },
  branding_basic: {
    key: "branding_basic",
    label: "Branding cơ bản",
    description: "Màu, logo và bề mặt cơ bản của thương hiệu.",
    group: "brand",
    badge: "PRO",
    upgradeHeadline: "Giữ thương hiệu quán đồng nhất trên mọi điểm chạm",
    upgradeBullets: ["Logo và màu sắc cơ bản", "Bảng quản lý gọn và đồng bộ", "Hợp quán Việt hiện đại"]
  },
  export_pdf: {
    key: "export_pdf",
    label: "Xuất báo cáo PDF",
    description: "Xuất báo cáo và tài liệu vận hành nhanh.",
    group: "analytics",
    badge: "PRO",
    upgradeHeadline: "Xuất dữ liệu gọn gàng cho chủ quán",
    upgradeBullets: ["Dễ chia sẻ", "Dễ lưu trữ", "Hỗ trợ họp và kiểm tra nội bộ"]
  },
  advanced_automation: {
    key: "advanced_automation",
    label: "Tự động hóa nâng cao",
    description: "Tự động hóa nhiều bước vận hành, marketing và follow-up.",
    group: "automation",
    badge: "PREMIUM",
    upgradeHeadline: "Mở khóa automation nâng cao cho quán bận",
    upgradeBullets: ["Tự động hóa nhiều bước", "Giảm việc tay", "Tối ưu trải nghiệm lặp lại"]
  },
  ai_analytics: {
    key: "ai_analytics",
    label: "Báo cáo thông minh",
    description: "Đọc dữ liệu bán hàng, dự báo và chỉ ra insight.",
    group: "analytics",
    badge: "PREMIUM",
    upgradeHeadline: "Mở khóa báo cáo thông minh nâng cao",
    upgradeBullets: ["Dự báo doanh thu", "Tìm insight bán hàng", "Nhìn hành vi khách rõ hơn"]
  },
  ai_marketing: {
    key: "ai_marketing",
    label: "Marketing thông minh",
    description: "Gợi ý chiến dịch, nội dung và thông điệp tăng chuyển đổi.",
    group: "growth",
    badge: "PREMIUM",
    upgradeHeadline: "Biến dữ liệu quán thành chiến dịch marketing nhanh",
    upgradeBullets: ["Copy chiến dịch", "Gợi ý ưu đãi", "Tăng chuyển đổi mùa thấp điểm"]
  },
  ai_branding: {
    key: "ai_branding",
    label: "Nhận diện thông minh",
    description: "Giúp định hình nhận diện, giọng nói và ý tưởng hình ảnh.",
    group: "brand",
    badge: "PREMIUM",
    upgradeHeadline: "Nâng thương hiệu quán bằng nhận diện thông minh",
    upgradeBullets: ["Moodboard nhanh", "Tone of voice rõ hơn", "Đẹp hơn mà vẫn tiết kiệm"]
  },
  ai_automation: {
    key: "ai_automation",
    label: "Tự động hóa thông minh",
    description: "Quy trình gợi ý cho tác vụ lặp lại và khuyến nghị hành động.",
    group: "automation",
    badge: "PREMIUM",
    upgradeHeadline: "Để LogiVN hỗ trợ phần việc lặp lại thay quán",
    upgradeBullets: ["Đỡ thao tác tay", "Hành động theo dữ liệu", "Tăng tính nhất quán"]
  },
  advanced_reports: {
    key: "advanced_reports",
    label: "Báo cáo nâng cao",
    description: "Báo cáo nhiều chiều cho chủ quán cần đọc sâu hơn.",
    group: "analytics",
    badge: "PREMIUM",
    upgradeHeadline: "Đọc sâu hiệu quả vận hành và doanh thu",
    upgradeBullets: ["Nhiều góc nhìn hơn", "Hữu ích cho chủ quán bận", "Ra quyết định nhanh hơn"]
  },
  loyalty_system: {
    key: "loyalty_system",
    label: "Chăm sóc khách quay lại",
    description: "Giữ khách quay lại bằng cơ chế tích lũy và ưu đãi.",
    group: "growth",
    badge: "PREMIUM",
    upgradeHeadline: "Tăng khách quay lại bằng chương trình thân thiết",
    upgradeBullets: ["Giữ khách trung thành", "Tăng tỷ lệ quay lại", "Tạo thói quen quay lại"]
  },
  advanced_qr_branding: {
    key: "advanced_qr_branding",
    label: "Nhận diện QR nâng cao",
    description: "QR mang nhận diện mạnh hơn và cá nhân hóa tốt hơn.",
    group: "brand",
    badge: "PREMIUM",
    upgradeHeadline: "Làm gọi món QR trông premium hơn",
    upgradeBullets: ["Nhận diện mạnh hơn", "Chuyên nghiệp hơn", "Tăng cảm giác tin cậy"]
  },
  custom_domain: {
    key: "custom_domain",
    label: "Tên miền riêng",
    description: "Tên miền riêng cho trải nghiệm đặt món và thương hiệu.",
    group: "brand",
    badge: "PREMIUM",
    upgradeHeadline: "Đưa thương hiệu lên tên miền riêng",
    upgradeBullets: ["Tin cậy hơn", "Đẹp hơn trong mắt khách", "Phù hợp quán xây thương hiệu lâu dài"]
  },
  realtime_insight: {
    key: "realtime_insight",
    label: "Tín hiệu theo thời gian thực",
    description: "Tín hiệu theo thời gian thực về doanh thu, tốc độ phục vụ và hành vi.",
    group: "analytics",
    badge: "PREMIUM",
    upgradeHeadline: "Thấy tín hiệu quan trọng ngay khi quán đang đông",
    upgradeBullets: ["Phản ứng nhanh", "Biết điểm nghẽn", "Ra quyết định tại thời điểm nóng"]
  },
  advanced_ai_assistant: {
    key: "advanced_ai_assistant",
    label: "Trợ lý nâng cao",
    description: "Trợ lý sâu hơn cho vận hành, tăng trưởng và tư vấn cho chủ quán.",
    group: "ai",
    badge: "PREMIUM",
    upgradeHeadline: "Nâng trợ lý từ tiện ích lên người đồng hành vận hành",
    upgradeBullets: ["Hiểu quán sâu hơn", "Tư vấn tốt hơn", "Phù hợp owner bận"]
  },
  advanced_permissions: {
    key: "advanced_permissions",
    label: "Phân quyền nâng cao",
    description: "Phân quyền chi tiết theo vai trò và bề mặt dữ liệu.",
    group: "core",
    badge: "PREMIUM",
    upgradeHeadline: "Kiểm soát quyền truy cập tốt hơn khi đội ngũ lớn lên",
    upgradeBullets: ["Ít rủi ro hơn", "Rõ trách nhiệm hơn", "Phù hợp quán nhiều ca"]
  },
  automation_workflow: {
    key: "automation_workflow",
    label: "Quy trình tự động",
    description: "Bộ dựng quy trình tự động hóa nhiều bước.",
    group: "automation",
    badge: "PREMIUM",
    upgradeHeadline: "Xây quy trình vận hành mà không cần vá thủ công",
    upgradeBullets: ["Chuẩn hóa tác vụ", "Giảm thao tác lặp lại", "Sẵn sàng mở rộng vận hành"]
  }
};

export const planCatalog: Record<"pro" | "premium", BillingPlanDefinition> = {
  pro: {
    code: "pro",
    name: "LogiVN Pro",
    price: 99_000,
    accent: "from-[#0F4D3A] via-[#1F6A53] to-[#F28C28]",
    heroLabel: "Tối ưu cho quán đang tăng trưởng",
    summary: "Đủ mạnh cho gọi món QR, bán online, trợ lý cơ bản và vận hành hằng ngày.",
    highlights: ["20 bàn", "10 nhân viên", "500 món menu", "Gọi món QR", "Xuất PDF giới hạn"],
    entitlements: {
      tables: { included: true, limit: 20, unit: "bàn" },
      staff: { included: true, limit: 10, unit: "nhân viên" },
      qr_ordering: { included: true },
      payment_qr: { included: true },
      menu_management: { included: true, limit: 500, unit: "món" },
      online_ordering: { included: true },
      order_realtime: { included: true },
      inventory_basic: { included: true },
      inventory_premium: { included: false, accessMode: "locked_plan", preview: "PO, kiểm kê, điều chuyển, lô/HSD, alerts và cost control nâng cao." },
      inventory_ai_ocr: { included: false, accessMode: "locked_plan", preview: "AI đọc hóa đơn nhập kho và tạo nháp nhập hàng." },
      inventory_ai_intelligence: { included: false, accessMode: "locked_plan", preview: "AI gợi ý PO, phát hiện bất thường và tóm tắt ưu tiên kho." },
      basic_analytics: { included: true },
      ai_menu_generation: { included: true, quota: { key: "ai_menu_generation", label: "Tạo menu thông minh", limit: 60, unit: "lượt", window: "monthly" } },
      ai_chatbot: { included: true, quota: { key: "ai_chatbot", label: "Trợ lý hỏi đáp", limit: 500, unit: "lượt", window: "monthly" } },
      ai_image_generation: { included: false, accessMode: "trial", quota: { key: "ai_image_generation_trial", label: "Tạo ảnh dùng thử", limit: 1, unit: "lần", window: "lifetime" }, preview: "Tạo ảnh món, poster và hình ảnh chiến dịch." },
      branding_basic: { included: true },
      export_pdf: { included: true, quota: { key: "export_pdf", label: "Xuất PDF", limit: 20, unit: "lần", window: "monthly" } },
      advanced_automation: { included: false, accessMode: "locked_plan", preview: "Workflow tự động nhắc việc, recap và marketing." },
      ai_analytics: { included: false, accessMode: "trial", quota: { key: "ai_analytics_trial", label: "Báo cáo thông minh dùng thử", limit: 1, unit: "lần", window: "lifetime" }, preview: "Dự báo doanh thu, insight khách và cảnh báo vận hành." },
      ai_marketing: { included: false, accessMode: "locked_plan", preview: "Chiến dịch marketing cho mùa thấp điểm và upsell." },
      ai_branding: { included: false, accessMode: "trial", quota: { key: "ai_branding_trial", label: "Nhận diện thông minh dùng thử", limit: 1, unit: "lần", window: "lifetime" }, preview: "Ý tưởng thương hiệu, slogan và hình ảnh cho quán." },
      ai_automation: { included: false, accessMode: "locked_plan", preview: "Tự động đề xuất và chạy quy trình tăng trưởng." },
      advanced_reports: { included: false, accessMode: "locked_plan", preview: "Báo cáo nhiều chiều cho chủ quán và quản lý." },
      loyalty_system: { included: false, accessMode: "locked_plan", preview: "Tích điểm và giữ khách quay lại." },
      advanced_qr_branding: { included: false, accessMode: "locked_plan", preview: "QR branded đồng bộ trải nghiệm thương hiệu." },
      custom_domain: { included: false, accessMode: "locked_plan", preview: "Domain riêng cho quán." },
      realtime_insight: { included: false, accessMode: "locked_plan", preview: "Tín hiệu tức thời cho giờ cao điểm." },
      advanced_ai_assistant: { included: false, accessMode: "locked_plan", preview: "Trợ lý tư vấn nâng cao cho chủ quán." },
      advanced_permissions: { included: false, accessMode: "locked_plan", preview: "Phân quyền chi tiết theo vai trò." },
      automation_workflow: { included: false, accessMode: "locked_plan", preview: "Bộ dựng quy trình tự động hóa." }
    }
  },
  premium: {
    code: "premium",
    name: "LogiVN Premium",
    price: 199_000,
    accent: "from-[#0B2F25] via-[#0F4D3A] to-[#F28C28]",
    heroLabel: "Cho quán muốn trợ lý sâu hơn và tự động hóa mạnh hơn",
    summary: "Mở khóa báo cáo thông minh, marketing thông minh, tự động hóa, nhận diện nâng cao và giới hạn vận hành lớn hơn.",
    highlights: ["300 bàn", "50 nhân viên", "2.000 món menu", "Báo cáo thông minh", "Quy trình tự động"],
    entitlements: {
      tables: { included: true, limit: 300, unit: "bàn" },
      staff: { included: true, limit: 50, unit: "nhân viên" },
      qr_ordering: { included: true },
      payment_qr: { included: true },
      menu_management: { included: true, limit: 2000, unit: "món" },
      online_ordering: { included: true },
      order_realtime: { included: true },
      inventory_basic: { included: true },
      inventory_premium: { included: true },
      inventory_ai_ocr: { included: true, quota: { key: "inventory_ai_ocr", label: "AI đọc hóa đơn kho", limit: 300, unit: "lượt", window: "monthly" } },
      inventory_ai_intelligence: { included: true, quota: { key: "inventory_ai_intelligence", label: "AI tối ưu tồn kho", limit: 120, unit: "lượt", window: "monthly" } },
      basic_analytics: { included: true },
      ai_menu_generation: { included: true, quota: { key: "ai_menu_generation", label: "Tạo menu thông minh", limit: 300, unit: "lượt", window: "monthly" } },
      ai_chatbot: { included: true, quota: { key: "ai_chatbot", label: "Trợ lý hỏi đáp", limit: 5000, unit: "lượt", window: "monthly" } },
      ai_image_generation: { included: true, quota: { key: "ai_image_generation", label: "Tạo ảnh thông minh", limit: 120, unit: "ảnh", window: "monthly" } },
      branding_basic: { included: true },
      export_pdf: { included: true, quota: { key: "export_pdf", label: "Xuất PDF", limit: 200, unit: "lần", window: "monthly" } },
      advanced_automation: { included: true, quota: { key: "advanced_automation", label: "Tự động hóa nâng cao", limit: 300, unit: "lượt", window: "monthly" } },
      ai_analytics: { included: true, quota: { key: "ai_analytics", label: "Báo cáo thông minh", limit: 120, unit: "lượt", window: "monthly" } },
      ai_marketing: { included: true, quota: { key: "ai_marketing", label: "Marketing thông minh", limit: 150, unit: "lượt", window: "monthly" } },
      ai_branding: { included: true, quota: { key: "ai_branding", label: "Nhận diện thông minh", limit: 60, unit: "lượt", window: "monthly" } },
      ai_automation: { included: true, quota: { key: "ai_automation", label: "Tự động hóa thông minh", limit: 300, unit: "lượt", window: "monthly" } },
      advanced_reports: { included: true },
      loyalty_system: { included: true },
      advanced_qr_branding: { included: true },
      custom_domain: { included: true },
      realtime_insight: { included: true },
      advanced_ai_assistant: { included: true, quota: { key: "advanced_ai_assistant", label: "Trợ lý nâng cao", limit: 2000, unit: "lượt", window: "monthly" } },
      advanced_permissions: { included: true },
      automation_workflow: { included: true }
    }
  }
};
