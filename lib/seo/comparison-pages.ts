export type ComparisonMatrixRow = {
  criterion: string;
  logivn: string;
  competitor: string;
  note: string;
};

export type ComparisonPage = {
  slug: string;
  path: string;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  summary: string;
  competitorName: string;
  competitorShort: string;
  updatedAt: string;
  priority: number;
  changeFrequency: "weekly" | "monthly";
  keywords: string[];
  targetQueries: string[];
  verdict: {
    bestForLogivn: string;
    bestForCompetitor: string;
    decisionRule: string;
  };
  proofPoints: Array<{ label: string; value: string }>;
  matrix: ComparisonMatrixRow[];
  sections: Array<{
    eyebrow: string;
    heading: string;
    body: string[];
    bullets: string[];
  }>;
  faq: Array<{ question: string; answer: string }>;
  relatedIntentSlugs: string[];
  cta: {
    primaryLabel: string;
    primaryPath: string;
    secondaryLabel: string;
    secondaryPath: string;
  };
};

const sharedRows = {
  qrFirst: {
    criterion: "QR ordering tại bàn",
    logivn: "Thiết kế QR-first: khách scan, chọn món, đơn gắn bàn và đi vào dashboard vận hành.",
    note: "Quan trọng nhất với quán muốn giảm ghi order tay nhưng vẫn giữ nhân viên trong luồng phục vụ."
  },
  aiFirst: {
    criterion: "AI vận hành",
    logivn: "Định vị AI như trợ lý đọc menu, order, báo cáo, staff và tồn kho để gợi ý việc cần kiểm tra.",
    note: "Phù hợp quán muốn bước vào AI-era SaaS bằng use case thực tế, không chỉ chatbot trang trí."
  },
  webFirst: {
    criterion: "Triển khai nhẹ",
    logivn: "Web-first, QR-first, phù hợp bắt đầu bằng menu, bàn, VietQR và báo cáo trước khi mở rộng module.",
    note: "Giảm ma sát cho chủ quán nhỏ, đội ngũ part-time và mô hình chưa muốn đầu tư phần cứng lớn."
  },
  pricing: {
    criterion: "Chi phí công khai",
    logivn: "Gói Pro 99K và Premium 199K giúp chủ quán nhìn nhanh mức đầu tư ban đầu.",
    note: "Trang so sánh nên đưa người đọc về pricing khi họ đã rõ tiêu chí chọn."
  }
};

export const COMPARISON_PAGES: ComparisonPage[] = [
  {
    slug: "logivn-vs-kiotviet",
    path: "/so-sanh/logivn-vs-kiotviet",
    title: "LogiVN vs KiotViet cho quán cafe, nhà hàng",
    description:
      "So sánh LogiVN và KiotViet theo góc QR ordering, AI vận hành, VietQR, nhân viên, tồn kho, báo cáo và tốc độ triển khai cho quán F&B Việt.",
    eyebrow: "So sánh phần mềm F&B",
    h1: "LogiVN vs KiotViet: chọn QR-first hay hệ sinh thái POS rộng hơn?",
    summary:
      "Trang này giúp chủ quán cafe, trà sữa và nhà hàng nhỏ so sánh LogiVN với KiotViet theo tiêu chí vận hành thực tế: gọi món QR, order tại bàn, AI, báo cáo, nhân sự, tồn kho và chi phí thử nghiệm.",
    competitorName: "KiotViet",
    competitorShort: "hệ sinh thái POS và bán hàng phổ biến tại Việt Nam",
    updatedAt: "2026-05-16",
    priority: 0.74,
    changeFrequency: "monthly",
    keywords: ["LogiVN vs KiotViet", "so sánh KiotViet", "phần mềm quản lý quán cafe", "QR ordering", "LogiVN"],
    targetQueries: ["LogiVN vs KiotViet", "so sánh LogiVN và KiotViet", "KiotViet alternative cho quán cafe"],
    verdict: {
      bestForLogivn:
        "Chọn LogiVN nếu ưu tiên QR ordering tại bàn, trải nghiệm web nhẹ, AI vận hành và mức giá dễ thử cho quán cafe, trà sữa hoặc nhà hàng nhỏ.",
      bestForCompetitor:
        "Cân nhắc KiotViet nếu quán cần một hệ sinh thái POS rộng, quen thuộc và có nhu cầu quản trị bán hàng ngoài phạm vi QR-first.",
      decisionRule:
        "Nếu pain chính là gọi món, bàn, VietQR, AI và giảm thao tác trong ca, LogiVN là hướng đi gọn hơn để thử trước."
    },
    proofPoints: [
      { label: "LogiVN mạnh ở", value: "QR-first, AI-first, web-first" },
      { label: "KiotViet thường được cân nhắc vì", value: "hệ sinh thái POS rộng" },
      { label: "Quyết định theo", value: "mức cần nhẹ hay cần rộng" }
    ],
    matrix: [
      { ...sharedRows.qrFirst, competitor: "Phù hợp chủ quán muốn POS/bán hàng quen thuộc và có thể cần nhiều module ngoài QR ordering." },
      { ...sharedRows.aiFirst, competitor: "Nên đánh giá theo nhu cầu AI cụ thể của quán và mức độ dữ liệu vận hành đang có." },
      { ...sharedRows.webFirst, competitor: "Phù hợp khi quán muốn một hệ thống POS rộng hơn và sẵn sàng đầu tư thời gian cấu hình." },
      { ...sharedRows.pricing, competitor: "Nên kiểm tra báo giá, phần cứng, dịch vụ triển khai và module cần dùng trước khi so sánh tổng chi phí." }
    ],
    sections: [
      {
        eyebrow: "Tóm tắt",
        heading: "Đừng so sánh bằng danh sách tính năng dài, hãy bắt đầu từ điểm nghẽn trong ca bán",
        body: [
          "Chủ quán thường tìm KiotViet hoặc một giải pháp thay thế khi ca bán bắt đầu rối: nhân viên ghi order tay, bàn cần thanh toán, món hết chưa cập nhật hoặc cuối ngày phải dò doanh thu.",
          "LogiVN nên được so sánh theo một góc rõ hơn: nếu quán muốn bắt đầu nhẹ bằng QR ordering, VietQR, dashboard và AI insight, phần mềm không cần trở thành một bộ POS quá nặng ngay từ ngày đầu."
        ],
        bullets: ["So sánh theo pain thật.", "Tách nhu cầu POS rộng khỏi nhu cầu QR-first.", "Đưa người đọc về pricing khi đã rõ tiêu chí."]
      },
      {
        eyebrow: "Khi chọn LogiVN",
        heading: "LogiVN phù hợp nếu quán muốn thử nhanh một luồng order hiện đại",
        body: [
          "Một chủ quán cafe nhỏ có thể bắt đầu bằng menu sạch, QR theo bàn, VietQR và báo cáo cuối ca. Khi dữ liệu ổn, quán mới mở thêm AI, nhân viên, tồn kho hoặc reservation.",
          "Lợi thế của cách này là đội ngũ không bị đổi quá nhiều quy trình cùng lúc. Nhân viên vẫn phục vụ, nhưng giảm thao tác lặp lại ở nhận order, kiểm thanh toán và tổng kết cuối ngày."
        ],
        bullets: ["QR ordering là bước đầu rõ nhất.", "Premium mở AI và vận hành sâu hơn.", "Phù hợp founder muốn đo hiệu quả trước."]
      },
      {
        eyebrow: "Khi chọn KiotViet",
        heading: "KiotViet đáng cân nhắc nếu quán cần một hệ sinh thái POS rộng hơn",
        body: [
          "Không phải quán nào cũng có cùng ưu tiên. Nếu chủ quán cần một hệ sinh thái POS quen thuộc, nhiều nhu cầu bán hàng rộng và có đội ngũ sẵn sàng triển khai đầy đủ, KiotViet có thể nằm trong shortlist.",
          "Điểm quan trọng là không chọn theo tên phần mềm lớn hay nhỏ, mà chọn theo việc quán đang cần giảm ma sát ở đâu trong 30 ngày tới."
        ],
        bullets: ["Xem phạm vi module cần dùng.", "Tính cả chi phí triển khai và đào tạo.", "So với LogiVN theo use case QR-first."]
      },
      {
        eyebrow: "Kết luận",
        heading: "Nếu mục tiêu là startup-style F&B operations, LogiVN nên là lựa chọn để thử trước",
        body: [
          "LogiVN không cần thắng bằng việc có mọi module ngay lập tức. Trang so sánh này nên giúp người đọc hiểu LogiVN thắng ở tốc độ thử, trải nghiệm QR-first, AI-era positioning và chi phí công khai dễ bắt đầu.",
          "CTA hợp lý là xem bảng giá hoặc tạo quán thử, vì người đọc truy vấn so sánh thường đã ở gần quyết định mua hơn người đọc blog giáo dục."
        ],
        bullets: ["Định vị rõ khác biệt.", "Giảm cognitive load.", "Dẫn về signup/pricing."]
      }
    ],
    faq: [
      {
        question: "LogiVN có thay thế KiotViet không?",
        answer:
          "Tùy nhu cầu. LogiVN phù hợp nếu quán ưu tiên QR ordering, AI vận hành, VietQR và triển khai nhẹ. Nếu cần một hệ sinh thái POS rộng hơn, chủ quán nên so sánh thêm phạm vi module và chi phí triển khai."
      },
      {
        question: "Nên chọn LogiVN hay KiotViet cho quán cafe nhỏ?",
        answer:
          "Nếu quán cafe nhỏ muốn bắt đầu bằng order tại bàn, menu QR, thanh toán VietQR và báo cáo dễ đọc, LogiVN là hướng thử gọn. Nếu quán cần nhiều nghiệp vụ POS rộng, hãy lập bảng nhu cầu trước khi chọn."
      },
      {
        question: "Điểm khác biệt lớn nhất của LogiVN là gì?",
        answer:
          "LogiVN định vị QR-first, AI-first và web-first cho F&B Việt, với gói công khai 99K và 199K để chủ quán thử nhanh trước khi mở rộng vận hành."
      }
    ],
    relatedIntentSlugs: ["quan-ly-quan-cafe", "goi-mon-qr-cho-quan-cafe", "ai-cho-quan-cafe", "quan-ly-ton-kho-nha-hang"],
    cta: {
      primaryLabel: "Xem bảng giá LogiVN",
      primaryPath: "/pricing",
      secondaryLabel: "Xem giải pháp quán cafe",
      secondaryPath: "/giai-phap/quan-ly-quan-cafe"
    }
  },
  {
    slug: "logivn-vs-cukcuk",
    path: "/so-sanh/logivn-vs-cukcuk",
    title: "LogiVN vs CukCuk cho nhà hàng, cafe",
    description:
      "So sánh LogiVN và CukCuk theo QR order, quản lý bàn, VietQR, AI assistant, báo cáo, nhân viên và triển khai cho quán F&B nhỏ.",
    eyebrow: "So sánh phần mềm nhà hàng",
    h1: "LogiVN vs CukCuk: chọn vận hành QR-first hay bộ quản trị nhà hàng đầy đủ hơn?",
    summary:
      "Trang này dành cho chủ nhà hàng và quán cafe đang cân nhắc CukCuk nhưng muốn hiểu khi nào LogiVN là lựa chọn gọn hơn cho QR ordering, AI, VietQR và dashboard vận hành hằng ngày.",
    competitorName: "CukCuk",
    competitorShort: "phần mềm quản lý nhà hàng/cafe được nhiều chủ quán cân nhắc",
    updatedAt: "2026-05-16",
    priority: 0.73,
    changeFrequency: "monthly",
    keywords: ["LogiVN vs CukCuk", "so sánh CukCuk", "phần mềm quản lý nhà hàng", "QR order nhà hàng", "LogiVN"],
    targetQueries: ["LogiVN vs CukCuk", "so sánh LogiVN và CukCuk", "CukCuk alternative cho nhà hàng"],
    verdict: {
      bestForLogivn:
        "Chọn LogiVN nếu quán muốn triển khai nhanh QR order theo bàn, VietQR, AI assistant, staff và inventory trong một trải nghiệm web hiện đại.",
      bestForCompetitor:
        "Cân nhắc CukCuk nếu ưu tiên bộ quản trị nhà hàng quen thuộc, phạm vi tính năng rộng và quy trình vận hành đã sẵn sàng cho hệ thống đầy đủ hơn.",
      decisionRule:
        "Nếu mục tiêu 30 ngày là giảm lỗi order, giảm chờ thanh toán và nhìn rõ báo cáo cuối ca, LogiVN là lựa chọn nhẹ để kiểm chứng trước."
    },
    proofPoints: [
      { label: "LogiVN tập trung", value: "QR order, AI, VietQR" },
      { label: "CukCuk thường được cân nhắc", value: "quản trị nhà hàng đầy đủ" },
      { label: "Nên quyết định bằng", value: "tốc độ triển khai trong ca thật" }
    ],
    matrix: [
      { ...sharedRows.qrFirst, competitor: "Nên kiểm tra luồng order theo bàn, xác nhận đơn và trải nghiệm nhân viên trong giờ cao điểm." },
      { ...sharedRows.aiFirst, competitor: "Nên so sánh theo use case AI vận hành cụ thể như báo cáo, combo, giờ cao điểm và tồn kho." },
      { ...sharedRows.webFirst, competitor: "Phù hợp nếu quán đã sẵn sàng triển khai một bộ quản trị nhà hàng rộng hơn." },
      { ...sharedRows.pricing, competitor: "Nên tính tổng chi phí theo module, thiết bị, triển khai và đào tạo trước khi chọn." }
    ],
    sections: [
      {
        eyebrow: "Tóm tắt",
        heading: "So sánh LogiVN và CukCuk nên bắt đầu từ quy trình phục vụ tại bàn",
        body: [
          "Nhà hàng có nhiều trạng thái hơn quán bán lẻ: khách gọi thêm, đổi món, đặt bàn, thanh toán, bếp xử lý và nhân viên phục vụ. Vì vậy so sánh phần mềm cần đi qua một ca bán thật.",
          "LogiVN tập trung vào luồng gọn: QR theo bàn, nhân viên xác nhận, VietQR và dashboard realtime. Đây là cách phù hợp nếu quán muốn thấy tác động nhanh trước khi mở rộng quản trị."
        ],
        bullets: ["Đo theo thời gian xác nhận đơn.", "Kiểm tra thanh toán cuối ca.", "Xem nhân viên có dùng được trong giờ đông không."]
      },
      {
        eyebrow: "Khi chọn LogiVN",
        heading: "LogiVN hợp với quán muốn modernize trải nghiệm gọi món trước",
        body: [
          "Nếu quán đang bị nghẽn ở nhận order và thanh toán, một hệ thống QR-first có thể tạo kết quả sớm hơn một dự án thay đổi toàn bộ vận hành.",
          "Khi dữ liệu order đã sạch, chủ quán có nền để mở AI, tồn kho, nhân sự và báo cáo nâng cao. Đây là lộ trình phù hợp với quán nhỏ và vừa muốn đi từng lớp."
        ],
        bullets: ["Bắt đầu bằng QR order.", "Mở rộng AI khi đã có dữ liệu.", "Dễ giải thích cho đội ngũ mới."]
      },
      {
        eyebrow: "Khi chọn CukCuk",
        heading: "CukCuk đáng cân nhắc khi quán cần phạm vi quản trị rộng từ đầu",
        body: [
          "Nếu quán đã có đội ngũ quản lý rõ, cần nhiều nghiệp vụ vận hành nhà hàng ngay từ đầu và sẵn sàng dành thời gian cấu hình, CukCuk có thể nằm trong nhóm cần đánh giá.",
          "Điểm cần làm là viết ra các module bắt buộc, các module có thể để sau và chi phí tổng trong ba tháng đầu."
        ],
        bullets: ["Liệt kê nghiệp vụ bắt buộc.", "Kiểm thử với nhân viên thật.", "So sánh tổng chi phí sở hữu."]
      },
      {
        eyebrow: "Kết luận",
        heading: "LogiVN nên thắng ở sự rõ ràng và tốc độ thử",
        body: [
          "Trang so sánh này phục vụ người đã có ý định mua. Copy nên đưa họ từ câu hỏi LogiVN hay CukCuk sang tiêu chí quyết định: cần hệ thống rộng hay cần QR-first nhanh, đẹp và dễ thử.",
          "CTA nên nhấn vào bảng giá hoặc tạo quán thử, vì đây là bước ít ma sát nhất sau khi người đọc hiểu khác biệt."
        ],
        bullets: ["Answer-first.", "Không công kích đối thủ.", "Đưa về pricing/signup."]
      }
    ],
    faq: [
      {
        question: "LogiVN khác CukCuk ở đâu?",
        answer:
          "LogiVN tập trung vào QR ordering, AI vận hành, VietQR và triển khai web-first cho quán F&B Việt. CukCuk thường được cân nhắc khi chủ quán muốn một bộ quản trị nhà hàng rộng hơn."
      },
      {
        question: "Nhà hàng nhỏ nên chọn bên nào?",
        answer:
          "Nhà hàng nhỏ nên chọn theo điểm nghẽn lớn nhất. Nếu nghẽn ở gọi món tại bàn, thanh toán và báo cáo cuối ca, LogiVN là hướng thử nhanh. Nếu cần nhiều nghiệp vụ quản trị ngay, hãy so sánh thêm phạm vi triển khai."
      },
      {
        question: "Có thể dùng LogiVN trước rồi mở rộng sau không?",
        answer:
          "Có. LogiVN phù hợp lộ trình bắt đầu bằng QR order, VietQR và dashboard, sau đó mở AI, staff, inventory và reservation khi dữ liệu đã ổn."
      }
    ],
    relatedIntentSlugs: ["phan-mem-quan-ly-nha-hang", "qr-order-nha-hang", "quan-ly-ban-nha-hang", "ai-cho-quan-cafe"],
    cta: {
      primaryLabel: "So sánh gói LogiVN",
      primaryPath: "/pricing",
      secondaryLabel: "Xem QR order nhà hàng",
      secondaryPath: "/giai-phap/qr-order-nha-hang"
    }
  },
  {
    slug: "logivn-vs-sapo",
    path: "/so-sanh/logivn-vs-sapo",
    title: "LogiVN vs Sapo cho quán cafe, trà sữa",
    description:
      "So sánh LogiVN và Sapo cho chủ quán cafe, trà sữa, quán ăn nhỏ theo QR order, VietQR, AI, báo cáo, nhân viên và chi phí triển khai.",
    eyebrow: "So sánh SaaS vận hành",
    h1: "LogiVN vs Sapo: chọn nền tảng F&B QR-first hay hệ sinh thái bán hàng đa kênh?",
    summary:
      "Trang này giúp chủ quán đang cân nhắc Sapo hiểu khi nào LogiVN phù hợp hơn: quán cần order tại bàn, menu QR, VietQR, AI insight và vận hành F&B nhẹ trước.",
    competitorName: "Sapo",
    competitorShort: "hệ sinh thái bán hàng đa kênh được nhiều doanh nghiệp Việt biết tới",
    updatedAt: "2026-05-16",
    priority: 0.72,
    changeFrequency: "monthly",
    keywords: ["LogiVN vs Sapo", "so sánh Sapo", "Sapo alternative", "phần mềm quán cafe", "LogiVN"],
    targetQueries: ["LogiVN vs Sapo", "so sánh LogiVN và Sapo", "Sapo alternative cho quán cafe"],
    verdict: {
      bestForLogivn:
        "Chọn LogiVN nếu trọng tâm là vận hành F&B tại quán: QR order, bàn, VietQR, AI, staff, inventory và báo cáo theo ca.",
      bestForCompetitor:
        "Cân nhắc Sapo nếu nhu cầu chính là bán hàng đa kênh hoặc hệ sinh thái thương mại rộng hơn ngoài trải nghiệm order tại bàn.",
      decisionRule:
        "Nếu khách ngồi tại bàn và nhân viên phục vụ là trung tâm vận hành, hãy ưu tiên công cụ được thiết kế cho nhịp F&B trước."
    },
    proofPoints: [
      { label: "LogiVN dành cho", value: "F&B tại quán, QR-first" },
      { label: "Sapo thường gắn với", value: "bán hàng đa kênh" },
      { label: "Tiêu chí chọn", value: "nhịp phục vụ hay bán đa kênh" }
    ],
    matrix: [
      { ...sharedRows.qrFirst, competitor: "Nên đánh giá kỹ trải nghiệm order tại bàn nếu quán phục vụ khách ngồi lâu và gọi thêm nhiều lần." },
      { ...sharedRows.aiFirst, competitor: "Nên so sánh AI theo dữ liệu F&B cụ thể, không chỉ khả năng tự động hóa chung." },
      { ...sharedRows.webFirst, competitor: "Phù hợp nếu trọng tâm không chỉ là F&B tại bàn mà còn nhiều kênh bán khác." },
      { ...sharedRows.pricing, competitor: "Nên so sánh tổng chi phí theo kênh bán, module và phạm vi triển khai thực tế." }
    ],
    sections: [
      {
        eyebrow: "Tóm tắt",
        heading: "So sánh LogiVN và Sapo là so sánh trọng tâm vận hành",
        body: [
          "Một quán cafe có khách ngồi tại bàn, gọi thêm món, thanh toán chuyển khoản và cần báo cáo cuối ca khác với một mô hình bán hàng đa kênh rộng hơn.",
          "LogiVN nên được đặt vào nhóm F&B operations: QR ordering, table management, VietQR, AI assistant và dashboard cho chủ quán."
        ],
        bullets: ["Xác định mô hình bán chính.", "Ưu tiên nhịp phục vụ tại bàn.", "Không chọn bằng số lượng module."]
      },
      {
        eyebrow: "Khi chọn LogiVN",
        heading: "LogiVN hợp với quán muốn tăng tốc trải nghiệm tại quán",
        body: [
          "Nếu khách chủ yếu đến quán, scan QR, gọi món và thanh toán tại bàn, LogiVN có thể tạo giá trị trực tiếp ở các thao tác lặp lại nhất.",
          "AI và báo cáo trong LogiVN cũng nên được nhìn như lớp đọc dữ liệu sau ca, giúp chủ quán biết món bán chạy, giờ đông và việc cần kiểm tra."
        ],
        bullets: ["Dành cho order tại bàn.", "Có AI vận hành gắn dữ liệu quán.", "Dễ đưa nhân viên vào luồng mới."]
      },
      {
        eyebrow: "Khi chọn Sapo",
        heading: "Sapo đáng cân nhắc nếu bán đa kênh là bài toán chính",
        body: [
          "Nếu quán vận hành nhiều kênh bán, nhiều điểm chạm thương mại ngoài phục vụ tại bàn và cần hệ sinh thái rộng, Sapo có thể là một lựa chọn cần so sánh.",
          "Với F&B nhỏ, câu hỏi nên là: trong 30 ngày tới, phần mềm cần giảm nghẽn ở bàn và order, hay cần mở rộng kênh bán?"
        ],
        bullets: ["Phù hợp bài toán thương mại rộng.", "Cần kiểm tra phạm vi F&B cụ thể.", "Tính chi phí theo kênh bán."]
      },
      {
        eyebrow: "Kết luận",
        heading: "LogiVN nên nói rõ: F&B trước, QR trước, AI thực dụng trước",
        body: [
          "Một trang so sánh tốt không cần làm đối thủ xấu đi. Nó cần giúp chủ quán hiểu LogiVN sinh ra cho nhịp phục vụ F&B hiện đại, nơi QR, VietQR và AI nằm trong cùng luồng.",
          "Khi người đọc thấy sự khác biệt này, CTA về pricing 99K/199K trở nên rõ hơn."
        ],
        bullets: ["Định vị category rõ.", "Giữ copy ngắn.", "Tối ưu chuyển đổi cuối trang."]
      }
    ],
    faq: [
      {
        question: "LogiVN có phải giải pháp thay thế Sapo cho quán cafe không?",
        answer:
          "LogiVN có thể là lựa chọn thay thế nếu quán cafe ưu tiên QR order, VietQR, AI và vận hành tại quán. Nếu nhu cầu chính là hệ sinh thái bán hàng đa kênh, chủ quán nên so sánh thêm phạm vi module."
      },
      {
        question: "Quán trà sữa nên ưu tiên tiêu chí nào?",
        answer:
          "Nên ưu tiên menu nhiều biến thể, topping, order nhanh, trạng thái đơn và báo cáo theo khung giờ. Đây là nhóm tiêu chí LogiVN đang tập trung cho F&B."
      },
      {
        question: "Giá LogiVN có dễ thử hơn không?",
        answer:
          "LogiVN có gói công khai Pro 99K và Premium 199K. Chủ quán vẫn nên so sánh tổng chi phí theo module, thiết bị và dịch vụ triển khai nếu đặt cạnh các hệ thống khác."
      }
    ],
    relatedIntentSlugs: ["phan-mem-quan-ly-quan-tra-sua", "order-online-cho-quan-cafe", "vietqr-quan-cafe", "bao-cao-doanh-thu-quan-cafe"],
    cta: {
      primaryLabel: "Xem Pro và Premium",
      primaryPath: "/pricing",
      secondaryLabel: "Xem giải pháp trà sữa",
      secondaryPath: "/giai-phap/phan-mem-quan-ly-quan-tra-sua"
    }
  },
  {
    slug: "logivn-vs-ipos",
    path: "/so-sanh/logivn-vs-ipos",
    title: "LogiVN vs iPOS cho nhà hàng, cafe",
    description:
      "So sánh LogiVN và iPOS theo nhu cầu POS nhà hàng, QR order, quản lý bàn, VietQR, AI vận hành, báo cáo, nhân viên và tồn kho.",
    eyebrow: "So sánh POS nhà hàng",
    h1: "LogiVN vs iPOS: chọn POS chuyên sâu hay lớp vận hành QR-first nhẹ hơn?",
    summary:
      "Trang này dành cho chủ nhà hàng và quán cafe đang cân nhắc iPOS nhưng muốn xem LogiVN có phù hợp hơn khi ưu tiên QR order, VietQR, AI và triển khai web-first.",
    competitorName: "iPOS",
    competitorShort: "giải pháp POS nhà hàng thường được cân nhắc trong ngành F&B",
    updatedAt: "2026-05-16",
    priority: 0.72,
    changeFrequency: "monthly",
    keywords: ["LogiVN vs iPOS", "so sánh iPOS", "iPOS alternative", "POS nhà hàng", "LogiVN"],
    targetQueries: ["LogiVN vs iPOS", "so sánh LogiVN và iPOS", "iPOS alternative cho nhà hàng"],
    verdict: {
      bestForLogivn:
        "Chọn LogiVN nếu quán muốn bắt đầu bằng QR ordering, VietQR, báo cáo, AI và nhân sự/tồn kho theo lộ trình nhẹ.",
      bestForCompetitor:
        "Cân nhắc iPOS nếu nhà hàng cần một POS chuyên sâu hơn, có yêu cầu phần cứng hoặc quy trình vận hành lớn ngay từ đầu.",
      decisionRule:
        "Nếu quán cần kiểm chứng QR-first trước khi đầu tư sâu vào POS, LogiVN là lựa chọn ít ma sát hơn."
    },
    proofPoints: [
      { label: "LogiVN định vị", value: "lớp vận hành nhẹ cho F&B" },
      { label: "iPOS thường được cân nhắc", value: "POS nhà hàng chuyên sâu" },
      { label: "Tiêu chí chính", value: "thử nhanh hay triển khai sâu" }
    ],
    matrix: [
      { ...sharedRows.qrFirst, competitor: "Nên kiểm tra mức độ QR order cần gắn với POS, bếp, bàn và phần cứng hiện tại." },
      { ...sharedRows.aiFirst, competitor: "Nên so sánh theo khả năng đọc dữ liệu order, báo cáo, staff và tồn kho để tạo insight." },
      { ...sharedRows.webFirst, competitor: "Phù hợp nếu quán cần POS chuyên sâu và có đội ngũ vận hành hệ thống đầy đủ." },
      { ...sharedRows.pricing, competitor: "Nên tính cả chi phí phần mềm, thiết bị, triển khai và hỗ trợ trong ba tháng đầu." }
    ],
    sections: [
      {
        eyebrow: "Tóm tắt",
        heading: "So sánh LogiVN và iPOS nên tách rõ POS chuyên sâu và QR-first SaaS",
        body: [
          "Nhà hàng lớn có thể cần POS chuyên sâu, phần cứng và quy trình nhiều lớp. Nhưng quán nhỏ và vừa đôi khi chỉ cần giảm lỗi order, giảm chờ thanh toán và xem dữ liệu cuối ca rõ hơn.",
          "LogiVN tập trung vào lớp vận hành nhẹ trước: QR tại bàn, VietQR, dashboard, AI và mở rộng dần theo mức trưởng thành vận hành."
        ],
        bullets: ["Tách nhu cầu phần cứng khỏi nhu cầu order.", "Đo hiệu quả trong ca thật.", "Không triển khai quá nặng từ đầu."]
      },
      {
        eyebrow: "Khi chọn LogiVN",
        heading: "LogiVN phù hợp khi quán muốn hiện đại hóa từng lớp",
        body: [
          "Bắt đầu bằng QR order và menu sạch giúp quán có dữ liệu thật. Sau đó chủ quán mới quyết định mở thêm Premium, AI, staff, inventory hoặc reservation.",
          "Cách đi này hợp với founder mindset: thử nhanh, đo rõ, mở rộng khi có tín hiệu."
        ],
        bullets: ["Ít thay đổi cùng lúc.", "Giữ trải nghiệm phục vụ Việt.", "Mở rộng theo dữ liệu."]
      },
      {
        eyebrow: "Khi chọn iPOS",
        heading: "iPOS đáng cân nhắc nếu bài toán POS chuyên sâu đã rõ",
        body: [
          "Nếu nhà hàng đã xác định cần một POS chuyên sâu, tích hợp phần cứng hoặc quy trình nhiều khu vực, iPOS có thể là một lựa chọn cần đánh giá.",
          "Trước khi quyết định, chủ quán nên chạy checklist: số chi nhánh, thiết bị cần dùng, quy trình bếp, thanh toán, tồn kho và năng lực đào tạo nhân viên."
        ],
        bullets: ["Xác định yêu cầu phần cứng.", "Kiểm thử quy trình bếp và bàn.", "Tính tổng chi phí triển khai."]
      },
      {
        eyebrow: "Kết luận",
        heading: "LogiVN thắng khi người đọc cần lựa chọn nhẹ để bắt đầu ngay",
        body: [
          "Trang này nên chuyển người đọc từ câu hỏi iPOS hay LogiVN sang câu hỏi tốt hơn: quán cần một POS sâu ngay hay cần một lớp vận hành QR-first để kiểm chứng hiệu quả?",
          "Nếu câu trả lời là kiểm chứng nhanh, CTA tốt nhất là xem pricing hoặc tạo quán dùng thử."
        ],
        bullets: ["Nói rõ use case.", "Giữ tone premium, không công kích.", "Dẫn về hành động thử."]
      }
    ],
    faq: [
      {
        question: "LogiVN có phải POS như iPOS không?",
        answer:
          "LogiVN là nền tảng vận hành F&B web-first, tập trung vào QR order, VietQR, AI và dashboard. Có thể xem LogiVN như lớp POS nhẹ cho quán muốn triển khai nhanh trước."
      },
      {
        question: "Nhà hàng nào nên cân nhắc iPOS?",
        answer:
          "Nhà hàng cần POS chuyên sâu, phần cứng hoặc quy trình nhiều lớp nên đưa iPOS vào shortlist. Chủ quán vẫn nên so sánh tổng chi phí và tốc độ triển khai với LogiVN."
      },
      {
        question: "LogiVN phù hợp nhà hàng nhỏ không?",
        answer:
          "Có. LogiVN phù hợp nhà hàng nhỏ và vừa muốn bắt đầu từ QR order, bàn, VietQR, báo cáo và AI trước khi mở rộng vận hành."
      }
    ],
    relatedIntentSlugs: ["phan-mem-pos-quan-cafe", "phan-mem-quan-ly-nha-hang", "qr-order-nha-hang", "quan-ly-order-realtime-nha-hang"],
    cta: {
      primaryLabel: "Xem giá POS nhẹ",
      primaryPath: "/pricing",
      secondaryLabel: "Xem POS cafe",
      secondaryPath: "/giai-phap/phan-mem-pos-quan-cafe"
    }
  },
  {
    slug: "logivn-vs-posapp",
    path: "/so-sanh/logivn-vs-posapp",
    title: "LogiVN vs PosApp cho quán ăn, cafe",
    description:
      "So sánh LogiVN và PosApp cho quán ăn, cafe, trà sữa theo QR order, VietQR, AI, quản lý bàn, báo cáo, nhân viên và tồn kho.",
    eyebrow: "So sánh POS quán nhỏ",
    h1: "LogiVN vs PosApp: chọn POS dễ tiếp cận hay SaaS F&B QR-first?",
    summary:
      "Trang này giúp chủ quán ăn nhỏ, cafe và trà sữa so sánh LogiVN với PosApp theo tiêu chí dễ thử, QR ordering, VietQR, AI vận hành và báo cáo thực dụng.",
    competitorName: "PosApp",
    competitorShort: "giải pháp POS được nhiều quán nhỏ cân nhắc khi bắt đầu số hóa",
    updatedAt: "2026-05-16",
    priority: 0.71,
    changeFrequency: "monthly",
    keywords: ["LogiVN vs PosApp", "so sánh PosApp", "PosApp alternative", "phần mềm quán ăn nhỏ", "LogiVN"],
    targetQueries: ["LogiVN vs PosApp", "so sánh LogiVN và PosApp", "PosApp alternative cho quán ăn"],
    verdict: {
      bestForLogivn:
        "Chọn LogiVN nếu quán muốn một trải nghiệm QR-first hiện đại, AI-ready, có pricing rõ và phù hợp chủ quán nhỏ muốn thử nhanh.",
      bestForCompetitor:
        "Cân nhắc PosApp nếu chủ quán đang tìm một POS dễ tiếp cận và muốn đánh giá theo nhu cầu bán hàng truyền thống.",
      decisionRule:
        "Nếu điểm nghẽn lớn nhất là order tại bàn, thanh toán VietQR và báo cáo cuối ca, LogiVN nên là lựa chọn thử trước."
    },
    proofPoints: [
      { label: "LogiVN tập trung", value: "quán nhỏ muốn vận hành hiện đại" },
      { label: "PosApp thường được cân nhắc", value: "POS dễ tiếp cận" },
      { label: "Quyết định theo", value: "QR-first hay POS truyền thống" }
    ],
    matrix: [
      { ...sharedRows.qrFirst, competitor: "Nên so sánh trải nghiệm QR theo bàn và cách đơn đi vào luồng nhân viên." },
      { ...sharedRows.aiFirst, competitor: "Nên kiểm tra nhu cầu AI thực tế: báo cáo, gợi ý combo, giờ cao điểm và tồn kho." },
      { ...sharedRows.webFirst, competitor: "Phù hợp nếu quán ưu tiên POS truyền thống dễ tiếp cận hơn là trải nghiệm QR-first." },
      { ...sharedRows.pricing, competitor: "Nên tính tổng chi phí và phạm vi tính năng cần dùng, không chỉ giá tháng đầu." }
    ],
    sections: [
      {
        eyebrow: "Tóm tắt",
        heading: "Quán nhỏ cần phần mềm dùng được ngay trong ca, không chỉ nhìn ổn trên brochure",
        body: [
          "So sánh LogiVN và PosApp nên đi qua một ca bán thật: khách gọi món, nhân viên xác nhận, thanh toán chuyển khoản và chủ quán xem doanh thu cuối ngày.",
          "LogiVN đặt trọng tâm vào QR-first và AI-ready. Điều này phù hợp nếu quán muốn tạo cảm giác startup hiện đại nhưng vẫn giữ vận hành dễ hiểu cho nhân viên."
        ],
        bullets: ["Kiểm tra thao tác trong ca.", "Đo số lỗi order.", "Xem báo cáo có trả lời được câu hỏi của chủ quán không."]
      },
      {
        eyebrow: "Khi chọn LogiVN",
        heading: "LogiVN hợp với quán muốn khác biệt trải nghiệm khách",
        body: [
          "Menu QR, order tại bàn và VietQR tạo cảm giác hiện đại ngay ở điểm chạm khách hàng. Với quán cafe hoặc trà sữa, trải nghiệm này cũng giúp giảm chờ và giảm ghi chú sai.",
          "Sau đó AI assistant và báo cáo giúp chủ quán hiểu ca bán thay vì chỉ có danh sách hóa đơn."
        ],
        bullets: ["Khách thấy sự hiện đại ngay.", "Nhân viên giảm thao tác lặp lại.", "Chủ quán có insight sau ca."]
      },
      {
        eyebrow: "Khi chọn PosApp",
        heading: "PosApp đáng cân nhắc nếu quán muốn POS truyền thống dễ tiếp cận",
        body: [
          "Nếu chủ quán ưu tiên một hướng POS quen thuộc, cần so sánh PosApp theo thao tác bán hàng, thanh toán, thiết bị và chi phí triển khai.",
          "Nhưng nếu mục tiêu là tạo luồng QR order hiện đại và AI-ready, LogiVN cần được đặt vào shortlist vì khác biệt định vị rõ hơn."
        ],
        bullets: ["Xem nhu cầu bán hàng truyền thống.", "Kiểm tra chi phí thiết bị nếu có.", "So với QR-first theo trải nghiệm khách."]
      },
      {
        eyebrow: "Kết luận",
        heading: "LogiVN nên thắng bằng clarity cho chủ quán nhỏ",
        body: [
          "Chủ quán nhỏ không có thời gian đọc một bảng tính năng dài. Trang so sánh cần trả lời nhanh: khi nào chọn LogiVN, khi nào cân nhắc PosApp và bước tiếp theo là gì.",
          "Với LogiVN, bước tiếp theo nên là pricing hoặc tạo quán thử vì chi phí công khai làm quyết định nhẹ hơn."
        ],
        bullets: ["Answer-first.", "CTA rõ.", "Giữ tone founder-friendly."]
      }
    ],
    faq: [
      {
        question: "LogiVN khác PosApp như thế nào?",
        answer:
          "LogiVN tập trung QR-first, AI-ready và web-first cho quán F&B. PosApp thường được cân nhắc như một lựa chọn POS dễ tiếp cận. Chủ quán nên chọn theo điểm nghẽn vận hành chính."
      },
      {
        question: "Quán ăn nhỏ nên thử LogiVN trước không?",
        answer:
          "Nếu quán muốn giảm ghi order tay, dùng VietQR rõ hơn và xem báo cáo cuối ca, LogiVN là lựa chọn đáng thử trước nhờ gói công khai và luồng triển khai nhẹ."
      },
      {
        question: "Có cần thay toàn bộ quy trình khi dùng LogiVN không?",
        answer:
          "Không. Quán có thể bắt đầu từ menu và QR ordering ở một khu vực, sau đó mở rộng sang AI, nhân viên, tồn kho hoặc reservation khi đội ngũ đã quen."
      }
    ],
    relatedIntentSlugs: ["phan-mem-quan-ly-quan-an-nho", "menu-qr-quan-an", "phan-mem-order-tai-ban", "vietqr-quan-cafe"],
    cta: {
      primaryLabel: "Tạo quán dùng thử",
      primaryPath: "/dashboard/register?plan=pro",
      secondaryLabel: "Xem gói cho quán ăn",
      secondaryPath: "/giai-phap/phan-mem-quan-ly-quan-an-nho"
    }
  }
];

function cloneComparisonPage(page: ComparisonPage): ComparisonPage {
  return {
    ...page,
    keywords: [...page.keywords],
    targetQueries: [...page.targetQueries],
    verdict: { ...page.verdict },
    proofPoints: page.proofPoints.map((item) => ({ ...item })),
    matrix: page.matrix.map((item) => ({ ...item })),
    sections: page.sections.map((section) => ({
      ...section,
      body: [...section.body],
      bullets: [...section.bullets]
    })),
    faq: page.faq.map((item) => ({ ...item })),
    relatedIntentSlugs: [...page.relatedIntentSlugs],
    cta: { ...page.cta }
  };
}

export function getAllComparisonPages() {
  return COMPARISON_PAGES.map(cloneComparisonPage);
}

export function getComparisonPage(slug: string) {
  const page = COMPARISON_PAGES.find((entry) => entry.slug === slug);
  return page ? cloneComparisonPage(page) : null;
}

export function getComparisonPagePath(slug: string) {
  return `/so-sanh/${slug}`;
}
