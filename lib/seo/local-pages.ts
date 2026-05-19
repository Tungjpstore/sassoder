import { sanitizePublicMarketingCopy } from "@/lib/seo/public-copy";

export type LocalSeoSection = {
  eyebrow: string;
  heading: string;
  body: string[];
  bullets: string[];
};

export type LocalSeoPage = {
  slug: string;
  path: string;
  cityName: string;
  shortCityName: string;
  regionLabel: string;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  summary: string;
  updatedAt: string;
  priority: number;
  changeFrequency: "weekly" | "monthly";
  keywords: string[];
  targetQueries: string[];
  marketSignals: Array<{ label: string; value: string }>;
  operatingModel: {
    title: string;
    caption: string;
    labels: [string, string, string, string];
  };
  localAngles: string[];
  sections: LocalSeoSection[];
  faq: Array<{ question: string; answer: string }>;
  relatedIntentSlugs: string[];
  relatedComparisonSlugs: string[];
  cta: {
    primaryLabel: string;
    primaryPath: string;
    secondaryLabel: string;
    secondaryPath: string;
  };
};

export const LOCAL_SEO_PAGES: LocalSeoPage[] = [
  {
    slug: "tphcm",
    path: "/dia-phuong/tphcm",
    cityName: "TP.HCM",
    shortCityName: "Sài Gòn",
    regionLabel: "Miền Nam",
    title: "Phần mềm quản lý quán cafe, nhà hàng tại TP.HCM",
    description:
      "LogiVN hỗ trợ quán cafe, trà sữa, quán ăn và nhà hàng tại TP.HCM triển khai QR ordering, VietQR, quản lý bàn, nhân viên, tồn kho và AI vận hành.",
    eyebrow: "Local SEO TP.HCM",
    h1: "Phần mềm quản lý quán cafe, trà sữa và nhà hàng tại TP.HCM",
    summary:
      "TP.HCM có nhiều mô hình F&B trong cùng một ngày: take-away buổi sáng, khách ngồi làm việc, nhóm bạn buổi tối và chuỗi nhỏ nhiều chi nhánh. LogiVN giúp chủ quán bắt đầu bằng QR ordering, VietQR và dashboard gọn trước khi mở rộng vận hành.",
    updatedAt: "2026-05-17",
    priority: 0.76,
    changeFrequency: "weekly",
    keywords: ["phần mềm quản lý quán cafe TP.HCM", "QR order quán cafe Sài Gòn", "phần mềm nhà hàng TP.HCM", "VietQR quán cafe", "LogiVN"],
    targetQueries: ["phần mềm quản lý quán cafe TP.HCM", "app quản lý quán cafe Sài Gòn", "phần mềm quản lý nhà hàng TP.HCM"],
    marketSignals: [
      { label: "Mô hình nổi bật", value: "take-away, ngồi lại, chuỗi nhỏ" },
      { label: "Điểm nghẽn", value: "giờ cao điểm và thanh toán" },
      { label: "Nên bắt đầu", value: "menu QR, bàn, VietQR" }
    ],
    operatingModel: {
      title: "Luồng vận hành F&B tại TP.HCM",
      caption: "Trang địa phương tốt cần nói đúng nhịp vận hành thành phố, không chỉ thay tên địa danh trong tiêu đề.",
      labels: ["Cafe", "Take-away", "VietQR", "Chi nhánh"]
    },
    localAngles: [
      "Quán khu văn phòng cần order nhanh và thanh toán rõ vào giờ sáng/trưa.",
      "Quán ngồi lại cần trạng thái bàn, gọi thêm món và báo cáo theo khung giờ.",
      "Chuỗi nhỏ cần đồng bộ menu, giá, combo và doanh thu giữa các điểm bán."
    ],
    sections: [
      {
        eyebrow: "Bối cảnh địa phương",
        heading: "TP.HCM có nhiều nhịp khách nên phần mềm phải linh hoạt theo ca",
        body: [
          "Một quán cafe tại TP.HCM có thể phục vụ khách mang đi buổi sáng, khách ngồi làm việc giữa ngày và nhóm bạn buổi tối. Nếu quy trình order, thanh toán và báo cáo không nằm chung một hệ thống, chủ quán rất khó biết ca nào thật sự đang nghẽn.",
          "LogiVN phù hợp cách triển khai từng lớp: chuẩn hóa menu, bật QR theo bàn hoặc khu vực, theo dõi đơn realtime và dùng VietQR để giảm thao tác cuối ca."
        ],
        bullets: ["Theo dõi đơn theo khung giờ.", "Phù hợp cả take-away và ngồi lại.", "Giảm nhầm order lúc quán đông."]
      },
      {
        eyebrow: "Triển khai",
        heading: "Nên bắt đầu bằng một khu vực hoặc mô hình khách rõ nhất",
        body: [
          "Quán khu văn phòng có thể ưu tiên order nhanh và VietQR. Quán trong khu dân cư có thể ưu tiên menu QR dễ xem và báo cáo món bán chạy. Quán gần trường học có thể cần combo, topping và tốc độ xử lý cao.",
          "Trang này không giả định LogiVN có mặt vật lý ở mọi quận. Giá trị nằm ở bối cảnh triển khai phần mềm cho quán F&B tại TP.HCM và lộ trình thử nhỏ, đo được."
        ],
        bullets: ["Ưu tiên theo khu vực khách.", "Không bật mọi module cùng lúc.", "Đo tác động sau từng ca."]
      },
      {
        eyebrow: "Mở rộng",
        heading: "TP.HCM là nơi nhiều quán bắt đầu mở chi nhánh thứ hai",
        body: [
          "Khi mở thêm điểm bán, vấn đề không chỉ là nhận nhiều đơn hơn. Chủ quán cần đồng bộ menu, giá, combo, phương thức thanh toán, tồn kho cơ bản và báo cáo giữa các chi nhánh.",
          "LogiVN có thể trở thành lớp dữ liệu chung cho chuỗi cafe, trà sữa hoặc quán ăn nhỏ trước khi quán cần một hệ thống POS chuyên sâu hơn."
        ],
        bullets: ["Đồng bộ menu lõi.", "So sánh doanh thu chi nhánh.", "Dễ mở rộng nhân sự và báo cáo."]
      }
    ],
    faq: [
      {
        question: "LogiVN có phù hợp quán cafe tại TP.HCM không?",
        answer: "Có. LogiVN phù hợp quán cần menu QR, order tại bàn, VietQR, báo cáo theo ca hoặc đang chuẩn bị mở thêm chi nhánh nhỏ tại TP.HCM."
      },
      {
        question: "Trang này có phải cam kết LogiVN có văn phòng ở TP.HCM không?",
        answer: "Không. Đây là trang local SEO theo nhu cầu phần mềm tại TP.HCM, tập trung vào bối cảnh vận hành địa phương và cách triển khai online."
      },
      {
        question: "Quán tại TP.HCM nên thử tính năng nào trước?",
        answer: "Nên bắt đầu từ menu QR, order tại bàn hoặc VietQR vì đây là các luồng dễ đo hiệu quả trong ca bán thật."
      }
    ],
    relatedIntentSlugs: ["phan-mem-quan-ly-quan-cafe-tphcm", "quan-ly-quan-cafe", "vietqr-quan-cafe", "quan-ly-order-realtime-nha-hang"],
    relatedComparisonSlugs: ["logivn-vs-kiotviet", "logivn-vs-cukcuk"],
    cta: {
      primaryLabel: "Xem gói cho quán TP.HCM",
      primaryPath: "/pricing",
      secondaryLabel: "Xem giải pháp cafe TP.HCM",
      secondaryPath: "/giai-phap/phan-mem-quan-ly-quan-cafe-tphcm"
    }
  },
  {
    slug: "ha-noi",
    path: "/dia-phuong/ha-noi",
    cityName: "Hà Nội",
    shortCityName: "Hà Nội",
    regionLabel: "Miền Bắc",
    title: "Phần mềm quản lý quán cafe, nhà hàng tại Hà Nội",
    description:
      "LogiVN giúp quán cafe, trà sữa, quán ăn và nhà hàng tại Hà Nội quản lý QR ordering, bàn, VietQR, nhân viên, tồn kho và báo cáo vận hành.",
    eyebrow: "Local SEO Hà Nội",
    h1: "Phần mềm quản lý quán cafe, trà sữa và nhà hàng tại Hà Nội",
    summary:
      "Hà Nội có nhiều mô hình F&B theo khu phố, văn phòng, trường học và nhà hàng gia đình. LogiVN giúp quán triển khai QR ordering, VietQR và dashboard vận hành mà không làm đội ngũ phải thay đổi quá mạnh ngay từ đầu.",
    updatedAt: "2026-05-17",
    priority: 0.74,
    changeFrequency: "weekly",
    keywords: ["phần mềm quản lý quán cafe Hà Nội", "QR order quán cafe Hà Nội", "phần mềm nhà hàng Hà Nội", "VietQR nhà hàng", "LogiVN"],
    targetQueries: ["phần mềm quản lý quán cafe Hà Nội", "app quản lý nhà hàng Hà Nội", "QR order quán cafe Hà Nội"],
    marketSignals: [
      { label: "Mô hình nổi bật", value: "phố nhỏ, văn phòng, nhà hàng gia đình" },
      { label: "Điểm nghẽn", value: "bàn, order thêm, ca tối" },
      { label: "Nên bắt đầu", value: "table management và VietQR" }
    ],
    operatingModel: {
      title: "Luồng vận hành F&B tại Hà Nội",
      caption: "Hà Nội cần phần mềm đủ gọn cho quán nhỏ nhưng đủ rõ cho nhà hàng có nhiều bàn và nhiều trạng thái phục vụ.",
      labels: ["Bàn", "Order thêm", "Ca tối", "Báo cáo"]
    },
    localAngles: [
      "Quán cafe phố nhỏ cần menu QR dễ xem, ít bước và không phụ thuộc thiết bị nặng.",
      "Nhà hàng gia đình cần quản lý bàn, gọi thêm món và thanh toán VietQR rõ ràng.",
      "Quán gần văn phòng hoặc trường học cần xử lý khung giờ cao điểm nhanh hơn."
    ],
    sections: [
      {
        eyebrow: "Bối cảnh địa phương",
        heading: "Hà Nội có nhiều quán nhỏ nhưng nhịp phục vụ không hề đơn giản",
        body: [
          "Một quán cafe hoặc nhà hàng tại Hà Nội thường vận hành trong không gian vừa phải nhưng có nhiều trạng thái: khách ngồi lâu, gọi thêm món, đổi bàn, thanh toán theo nhóm hoặc đặt trước.",
          "LogiVN giúp đưa menu, bàn, đơn và thanh toán vào một mạch dữ liệu để nhân viên biết việc cần xử lý, còn chủ quán nhìn được ca nào đang tạo doanh thu tốt."
        ],
        bullets: ["Quản lý bàn rõ hơn.", "Giảm hỏi lại order thêm.", "Báo cáo theo ca dễ đọc."]
      },
      {
        eyebrow: "Triển khai",
        heading: "Quán tại Hà Nội nên ưu tiên bàn và thanh toán trước khi mở rộng",
        body: [
          "Nếu quán có nhiều bàn, việc đầu tiên nên là gắn QR theo bàn và chuẩn hóa trạng thái đơn. Khi luồng này chạy ổn, VietQR và báo cáo cuối ca sẽ dễ triển khai hơn.",
          "Với quán cafe nhỏ, LogiVN có thể bắt đầu nhẹ bằng menu QR và order tại bàn, sau đó mở nhân sự, tồn kho hoặc AI khi dữ liệu đã đủ sạch."
        ],
        bullets: ["QR theo bàn.", "VietQR gắn với hóa đơn.", "Mở rộng AI sau khi có dữ liệu."]
      },
      {
        eyebrow: "Tăng trưởng",
        heading: "Dữ liệu theo ca giúp chủ quán Hà Nội ra quyết định ít cảm tính hơn",
        body: [
          "Thay vì chỉ nhìn tổng doanh thu cuối ngày, chủ quán cần biết món nào bán tốt theo khung giờ, nhân viên nào thường xử lý đơn, và ca nào có nhiều thanh toán cần kiểm lại.",
          "Đây là nền để dùng AI assistant thực dụng: tóm tắt doanh thu, gợi ý combo, cảnh báo giờ cao điểm và nhắc việc cần kiểm tra."
        ],
        bullets: ["Tách doanh thu theo khung giờ.", "Nhìn món bán chạy.", "AI hỗ trợ quyết định sau ca."]
      }
    ],
    faq: [
      {
        question: "Quán cafe tại Hà Nội có cần QR ordering không?",
        answer: "Có nếu quán thường đông theo khung giờ, nhân viên phải ghi order tay hoặc chủ quán muốn có dữ liệu order, bàn và thanh toán rõ hơn."
      },
      {
        question: "LogiVN có phù hợp nhà hàng gia đình tại Hà Nội không?",
        answer: "Có. Nhà hàng gia đình có thể bắt đầu từ quản lý bàn, order tại bàn, VietQR và báo cáo cuối ca trước khi mở thêm nhân viên hoặc tồn kho."
      },
      {
        question: "Có cần máy POS riêng để dùng LogiVN không?",
        answer: "Không bắt buộc. LogiVN định vị web-first, phù hợp quán muốn thử QR ordering và dashboard trước khi đầu tư thêm phần cứng."
      }
    ],
    relatedIntentSlugs: ["quan-ly-ban-nha-hang", "phan-mem-quan-ly-nha-hang", "phan-mem-order-tai-ban", "ai-cho-quan-cafe"],
    relatedComparisonSlugs: ["logivn-vs-cukcuk", "logivn-vs-ipos"],
    cta: {
      primaryLabel: "Xem gói cho quán Hà Nội",
      primaryPath: "/pricing",
      secondaryLabel: "Xem quản lý bàn",
      secondaryPath: "/giai-phap/quan-ly-ban-nha-hang"
    }
  },
  {
    slug: "da-nang",
    path: "/dia-phuong/da-nang",
    cityName: "Đà Nẵng",
    shortCityName: "Đà Nẵng",
    regionLabel: "Miền Trung",
    title: "Phần mềm quản lý quán cafe, nhà hàng tại Đà Nẵng",
    description:
      "LogiVN hỗ trợ quán cafe, trà sữa, quán ăn và nhà hàng tại Đà Nẵng triển khai menu QR, order tại bàn, VietQR, reservation và báo cáo.",
    eyebrow: "Local SEO Đà Nẵng",
    h1: "Phần mềm quản lý quán cafe, trà sữa và nhà hàng tại Đà Nẵng",
    summary:
      "Đà Nẵng có nhịp F&B gắn với khách địa phương, khách du lịch, khu biển và khu trung tâm. LogiVN giúp quán quản lý menu QR, order, đặt bàn, VietQR và báo cáo trong một trải nghiệm web-first dễ thử.",
    updatedAt: "2026-05-17",
    priority: 0.72,
    changeFrequency: "weekly",
    keywords: ["phần mềm quản lý quán cafe Đà Nẵng", "QR order nhà hàng Đà Nẵng", "phần mềm nhà hàng Đà Nẵng", "đặt bàn nhà hàng", "LogiVN"],
    targetQueries: ["phần mềm quản lý quán cafe Đà Nẵng", "QR order nhà hàng Đà Nẵng", "app quản lý quán ăn Đà Nẵng"],
    marketSignals: [
      { label: "Mô hình nổi bật", value: "du lịch, khu biển, trung tâm" },
      { label: "Điểm nghẽn", value: "menu, đặt bàn, biến động khách" },
      { label: "Nên bắt đầu", value: "QR menu và reservation" }
    ],
    operatingModel: {
      title: "Luồng vận hành F&B tại Đà Nẵng",
      caption: "Quán tại Đà Nẵng cần linh hoạt giữa khách địa phương, khách du lịch và các khung giờ biến động theo mùa.",
      labels: ["Menu QR", "Đặt bàn", "VietQR", "Báo cáo"]
    },
    localAngles: [
      "Nhà hàng khu du lịch cần menu dễ xem và order rõ cho nhóm khách đông.",
      "Quán cafe trung tâm cần xử lý giờ cao điểm nhưng vẫn giữ trải nghiệm gọn.",
      "Quán có đặt bàn nên gom reservation, order và thanh toán vào cùng một mạch."
    ],
    sections: [
      {
        eyebrow: "Bối cảnh địa phương",
        heading: "Đà Nẵng cần phần mềm đủ linh hoạt cho cả khách quen và khách du lịch",
        body: [
          "Một nhà hàng hoặc quán cafe tại Đà Nẵng có thể có ngày rất đều, nhưng cũng có khung giờ hoặc mùa cao điểm tăng mạnh. Nếu menu, đặt bàn và thanh toán tách rời, nhân viên dễ bị rối khi khách đến theo nhóm.",
          "LogiVN giúp chuẩn hóa menu, nhận order tại bàn, theo dõi trạng thái và gợi ý báo cáo để chủ quán biết ca nào cần thêm người hoặc điều chỉnh món."
        ],
        bullets: ["Menu QR dễ cập nhật.", "Order theo bàn rõ.", "Báo cáo hỗ trợ mùa cao điểm."]
      },
      {
        eyebrow: "Reservation",
        heading: "Đặt bàn nên được xem là một phần của vận hành, không phải ghi chú rời",
        body: [
          "Với nhà hàng tại khu trung tâm hoặc khu biển, đặt bàn trước giúp quán chuẩn bị tốt hơn. Nhưng nếu reservation nằm trong sổ tay hoặc tin nhắn riêng, đội ngũ khó nối với order và thanh toán.",
          "LogiVN nên được triển khai để gom đặt bàn, trạng thái bàn, order và thanh toán vào một dashboard chung."
        ],
        bullets: ["Giảm quên lịch đặt.", "Nối đặt bàn với bàn thật.", "Dễ kiểm tra doanh thu theo nhóm khách."]
      },
      {
        eyebrow: "AI vận hành",
        heading: "Dữ liệu mùa vụ là nền để AI gợi ý tốt hơn",
        body: [
          "Khi quán có dữ liệu order, khung giờ, món bán chạy và trạng thái bàn, AI assistant có thể tóm tắt xu hướng thay vì chỉ trả lời chung chung.",
          "Với Đà Nẵng, giá trị nằm ở việc nhìn biến động theo ngày, theo mùa, theo khu vực khách và biến nó thành hành động vận hành cụ thể."
        ],
        bullets: ["Nhìn khung giờ biến động.", "Gợi ý combo hoặc món chủ lực.", "Chuẩn bị nhân sự theo tín hiệu."]
      }
    ],
    faq: [
      {
        question: "LogiVN có phù hợp nhà hàng tại Đà Nẵng không?",
        answer: "Có, đặc biệt với nhà hàng cần menu QR, order tại bàn, đặt bàn, VietQR và báo cáo để xử lý khách theo nhóm hoặc mùa cao điểm."
      },
      {
        question: "Quán cafe tại Đà Nẵng nên bắt đầu bằng gì?",
        answer: "Nên bắt đầu bằng menu QR, order tại bàn và VietQR. Nếu có khách đặt trước, thêm reservation vào giai đoạn tiếp theo."
      },
      {
        question: "AI trong LogiVN giúp gì cho quán tại Đà Nẵng?",
        answer: "AI có thể hỗ trợ đọc báo cáo, gợi ý khung giờ cần chú ý, món bán tốt và việc cần kiểm tra sau ca khi quán đã có dữ liệu."
      }
    ],
    relatedIntentSlugs: ["qr-order-nha-hang", "dat-ban-nhan-coc-nha-hang", "thanh-toan-vietqr-cho-nha-hang", "bao-cao-doanh-thu-quan-cafe"],
    relatedComparisonSlugs: ["logivn-vs-cukcuk", "logivn-vs-sapo"],
    cta: {
      primaryLabel: "Xem gói cho quán Đà Nẵng",
      primaryPath: "/pricing",
      secondaryLabel: "Xem đặt bàn online",
      secondaryPath: "/giai-phap/dat-ban-nhan-coc-nha-hang"
    }
  },
  {
    slug: "can-tho",
    path: "/dia-phuong/can-tho",
    cityName: "Cần Thơ",
    shortCityName: "Cần Thơ",
    regionLabel: "Miền Tây",
    title: "Phần mềm quản lý quán cafe, quán ăn tại Cần Thơ",
    description:
      "LogiVN hỗ trợ quán cafe, trà sữa, quán ăn và nhà hàng tại Cần Thơ quản lý menu QR, order tại bàn, VietQR, nhân viên và báo cáo.",
    eyebrow: "Local SEO Cần Thơ",
    h1: "Phần mềm quản lý quán cafe, trà sữa và quán ăn tại Cần Thơ",
    summary:
      "Cần Thơ phù hợp với lộ trình số hóa gọn: menu QR dễ xem, order tại bàn, VietQR và báo cáo rõ cho chủ quán. LogiVN giúp quán nhỏ bắt đầu nhẹ nhưng vẫn có nền để mở rộng nhân viên, tồn kho và AI sau này.",
    updatedAt: "2026-05-17",
    priority: 0.7,
    changeFrequency: "monthly",
    keywords: ["phần mềm quản lý quán cafe Cần Thơ", "QR order Cần Thơ", "phần mềm quán ăn Cần Thơ", "VietQR quán ăn", "LogiVN"],
    targetQueries: ["phần mềm quản lý quán cafe Cần Thơ", "app quản lý quán ăn Cần Thơ", "QR order quán cafe Cần Thơ"],
    marketSignals: [
      { label: "Mô hình nổi bật", value: "quán nhỏ, gia đình, trà sữa" },
      { label: "Điểm nghẽn", value: "ghi order tay và đối soát" },
      { label: "Nên bắt đầu", value: "menu QR và báo cáo" }
    ],
    operatingModel: {
      title: "Luồng vận hành F&B tại Cần Thơ",
      caption: "Quán tại Cần Thơ nên bắt đầu bằng các bước có tác động rõ nhưng ít làm đội ngũ bị quá tải.",
      labels: ["Menu", "Order", "VietQR", "Cuối ca"]
    },
    localAngles: [
      "Quán nhỏ cần phần mềm dễ học, không đòi hỏi thay đổi quy trình quá mạnh.",
      "Quán ăn gia đình cần giảm ghi order tay và kiểm thanh toán cuối ca.",
      "Trà sữa hoặc cafe có topping cần menu rõ, trạng thái món và báo cáo món bán chạy."
    ],
    sections: [
      {
        eyebrow: "Bối cảnh địa phương",
        heading: "Cần Thơ phù hợp với lộ trình số hóa nhẹ, dễ thấy hiệu quả",
        body: [
          "Nhiều quán cafe, trà sữa và quán ăn tại Cần Thơ cần phần mềm không quá nặng: dễ tạo menu, dễ nhận order và dễ kiểm tiền cuối ca.",
          "LogiVN tập trung vào các điểm chạm có tác động nhanh: menu QR, order tại bàn, VietQR và báo cáo. Khi quán quen dữ liệu, có thể mở thêm nhân viên, tồn kho hoặc AI."
        ],
        bullets: ["Ít ma sát khi bắt đầu.", "Dễ đào tạo nhân viên.", "Đo hiệu quả sau từng ca."]
      },
      {
        eyebrow: "Quán nhỏ",
        heading: "Giảm ghi order tay là bước có ROI rõ nhất",
        body: [
          "Ghi order tay dễ sai khi quán đông, đặc biệt với món có topping, ghi chú hoặc nhiều lựa chọn. QR ordering giúp khách chọn trực tiếp và nhân viên xác nhận trên dashboard.",
          "Điều quan trọng là không biến QR thành một ảnh menu tĩnh. Order phải đi vào luồng xử lý để chủ quán có dữ liệu cuối ngày."
        ],
        bullets: ["Khách chọn món rõ hơn.", "Nhân viên xác nhận nhanh hơn.", "Chủ quán có dữ liệu thay vì giấy rời."]
      },
      {
        eyebrow: "Thanh toán",
        heading: "VietQR cần gắn với hóa đơn để cuối ca không phải dò lại",
        body: [
          "Chuyển khoản đã quen thuộc, nhưng nếu không gắn với đơn, chủ quán vẫn phải dò ảnh giao dịch hoặc tin nhắn ngân hàng.",
          "LogiVN giúp đặt VietQR trong cùng trải nghiệm order và thanh toán để việc kiểm tra cuối ca nhẹ hơn."
        ],
        bullets: ["Giảm nhầm số tiền.", "Biết đơn nào đã thanh toán.", "Đối soát cuối ca rõ hơn."]
      }
    ],
    faq: [
      {
        question: "Quán ăn nhỏ tại Cần Thơ có nên dùng LogiVN không?",
        answer: "Có nếu quán muốn giảm ghi order tay, dùng VietQR rõ hơn và có báo cáo doanh thu dễ đọc sau ca."
      },
      {
        question: "LogiVN có khó triển khai cho nhân viên mới không?",
        answer: "Không nên triển khai quá nhiều module cùng lúc. Quán có thể bắt đầu bằng menu QR và order tại bàn để nhân viên quen dần."
      },
      {
        question: "Có thể mở rộng lên tồn kho và AI sau không?",
        answer: "Có. Khi dữ liệu menu, order và thanh toán đã ổn, quán có thể mở thêm tồn kho, nhân viên, báo cáo sâu và AI assistant."
      }
    ],
    relatedIntentSlugs: ["phan-mem-quan-ly-quan-an-nho", "menu-qr-quan-an", "phan-mem-order-tai-ban", "vietqr-quan-cafe"],
    relatedComparisonSlugs: ["logivn-vs-posapp", "logivn-vs-sapo"],
    cta: {
      primaryLabel: "Xem gói cho quán Cần Thơ",
      primaryPath: "/pricing",
      secondaryLabel: "Xem quán ăn nhỏ",
      secondaryPath: "/giai-phap/phan-mem-quan-ly-quan-an-nho"
    }
  },
  {
    slug: "hai-phong",
    path: "/dia-phuong/hai-phong",
    cityName: "Hải Phòng",
    shortCityName: "Hải Phòng",
    regionLabel: "Duyên hải Bắc Bộ",
    title: "Phần mềm quản lý quán cafe, nhà hàng tại Hải Phòng",
    description:
      "LogiVN hỗ trợ quán cafe, quán ăn và nhà hàng tại Hải Phòng triển khai QR order, VietQR, quản lý bàn, nhân viên, tồn kho và báo cáo.",
    eyebrow: "Local SEO Hải Phòng",
    h1: "Phần mềm quản lý quán cafe, quán ăn và nhà hàng tại Hải Phòng",
    summary:
      "Hải Phòng có nhiều mô hình quán ăn, cafe và nhà hàng phục vụ theo nhóm khách, bàn và khung giờ rõ. LogiVN giúp quán bắt đầu bằng order tại bàn, VietQR và báo cáo realtime để giảm rối trong ca bán.",
    updatedAt: "2026-05-17",
    priority: 0.69,
    changeFrequency: "monthly",
    keywords: ["phần mềm quản lý quán cafe Hải Phòng", "QR order nhà hàng Hải Phòng", "phần mềm quán ăn Hải Phòng", "VietQR nhà hàng", "LogiVN"],
    targetQueries: ["phần mềm quản lý quán cafe Hải Phòng", "app quản lý nhà hàng Hải Phòng", "QR order quán ăn Hải Phòng"],
    marketSignals: [
      { label: "Mô hình nổi bật", value: "quán ăn, nhà hàng, cafe nhóm" },
      { label: "Điểm nghẽn", value: "bàn, order thêm, thanh toán" },
      { label: "Nên bắt đầu", value: "order tại bàn và báo cáo" }
    ],
    operatingModel: {
      title: "Luồng vận hành F&B tại Hải Phòng",
      caption: "Quán tại Hải Phòng cần quản lý tốt bàn, nhóm khách và thanh toán để cuối ca ít phải dò lại.",
      labels: ["Bàn", "Nhóm khách", "VietQR", "Doanh thu"]
    },
    localAngles: [
      "Quán ăn và nhà hàng cần order tại bàn rõ để giảm nhầm món khi khách đi theo nhóm.",
      "Cafe có khách ngồi lâu cần trạng thái bàn và gọi thêm món dễ theo dõi.",
      "Chủ quán cần báo cáo cuối ca đủ rõ để biết món bán chạy và ca nào cần thêm nhân sự."
    ],
    sections: [
      {
        eyebrow: "Bối cảnh địa phương",
        heading: "Hải Phòng cần phần mềm rõ ở bàn, order thêm và thanh toán",
        body: [
          "Với quán ăn, cafe và nhà hàng phục vụ theo nhóm khách, việc ghi order tay hoặc nhận thanh toán rời có thể tạo nhiều lỗi nhỏ: nhầm bàn, thiếu món, thanh toán chưa khớp.",
          "LogiVN giúp đưa order tại bàn, VietQR và báo cáo vào cùng dashboard để nhân viên xử lý nhanh hơn và chủ quán có dữ liệu sau ca."
        ],
        bullets: ["Giảm nhầm bàn.", "Theo dõi order thêm.", "Thanh toán cuối ca rõ hơn."]
      },
      {
        eyebrow: "Nhà hàng",
        heading: "Order tại bàn giúp giữ nhịp phục vụ khi khách đi theo nhóm",
        body: [
          "Khách đi theo nhóm thường gọi thêm món, đổi món hoặc tách thanh toán. Nếu không có trạng thái đơn rõ, nhân viên phải nhớ quá nhiều chi tiết trong đầu.",
          "QR ordering không thay thế phục vụ, nhưng giúp khách gửi yêu cầu rõ hơn và giúp nhân viên biết bàn nào cần hành động."
        ],
        bullets: ["Đơn gắn với bàn.", "Nhân viên xác nhận trạng thái.", "Giảm ghi chú rời."]
      },
      {
        eyebrow: "Báo cáo",
        heading: "Báo cáo nên trả lời câu hỏi vận hành, không chỉ tổng doanh thu",
        body: [
          "Chủ quán cần biết món nào bán tốt, ca nào đông, thanh toán nào cần kiểm và nhân viên nào đang xử lý nhiều đơn. Những câu hỏi này cần dữ liệu order và thanh toán nằm cùng hệ thống.",
          "Khi có dữ liệu sạch, AI assistant của LogiVN có thể hỗ trợ tóm tắt ca bán và gợi ý việc cần kiểm tra tiếp."
        ],
        bullets: ["Món bán chạy.", "Doanh thu theo ca.", "AI tóm tắt việc cần kiểm."]
      }
    ],
    faq: [
      {
        question: "LogiVN có phù hợp quán ăn tại Hải Phòng không?",
        answer: "Có. LogiVN phù hợp quán ăn hoặc nhà hàng cần order tại bàn, quản lý trạng thái bàn, thanh toán VietQR và báo cáo cuối ca."
      },
      {
        question: "QR order có làm mất chất phục vụ không?",
        answer: "Không. QR order giúp khách gửi món rõ hơn, còn nhân viên vẫn xác nhận, phục vụ và xử lý ngoại lệ trong ca."
      },
      {
        question: "Quán tại Hải Phòng nên chọn Pro hay Premium?",
        answer: "Pro phù hợp khi bắt đầu với QR ordering và menu. Premium phù hợp nếu cần AI, nhân viên, tồn kho và báo cáo sâu hơn."
      }
    ],
    relatedIntentSlugs: ["phan-mem-quan-ly-nha-hang", "qr-order-nha-hang", "quan-ly-ban-nha-hang", "bao-cao-doanh-thu-quan-cafe"],
    relatedComparisonSlugs: ["logivn-vs-cukcuk", "logivn-vs-ipos"],
    cta: {
      primaryLabel: "Xem gói cho quán Hải Phòng",
      primaryPath: "/pricing",
      secondaryLabel: "Xem QR order nhà hàng",
      secondaryPath: "/giai-phap/qr-order-nha-hang"
    }
  }
];

function cloneLocalSeoPage(page: LocalSeoPage): LocalSeoPage {
  return {
    ...page,
    title: sanitizePublicMarketingCopy(page.title),
    description: sanitizePublicMarketingCopy(page.description),
    eyebrow: sanitizePublicMarketingCopy(page.eyebrow),
    h1: sanitizePublicMarketingCopy(page.h1),
    summary: sanitizePublicMarketingCopy(page.summary),
    keywords: page.keywords.map(sanitizePublicMarketingCopy),
    targetQueries: page.targetQueries.map(sanitizePublicMarketingCopy),
    marketSignals: page.marketSignals.map((item) => ({
      label: sanitizePublicMarketingCopy(item.label),
      value: sanitizePublicMarketingCopy(item.value)
    })),
    operatingModel: {
      title: sanitizePublicMarketingCopy(page.operatingModel.title),
      caption: sanitizePublicMarketingCopy(page.operatingModel.caption),
      labels: page.operatingModel.labels.map(sanitizePublicMarketingCopy) as [string, string, string, string]
    },
    localAngles: page.localAngles.map(sanitizePublicMarketingCopy),
    sections: page.sections.map((section) => ({
      eyebrow: sanitizePublicMarketingCopy(section.eyebrow),
      heading: sanitizePublicMarketingCopy(section.heading),
      body: section.body.map(sanitizePublicMarketingCopy),
      bullets: section.bullets.map(sanitizePublicMarketingCopy)
    })),
    faq: page.faq.map((item) => ({
      question: sanitizePublicMarketingCopy(item.question),
      answer: sanitizePublicMarketingCopy(item.answer)
    })),
    relatedIntentSlugs: [...page.relatedIntentSlugs],
    relatedComparisonSlugs: [...page.relatedComparisonSlugs],
    cta: {
      primaryLabel: sanitizePublicMarketingCopy(page.cta.primaryLabel),
      primaryPath: page.cta.primaryPath,
      secondaryLabel: sanitizePublicMarketingCopy(page.cta.secondaryLabel),
      secondaryPath: page.cta.secondaryPath
    }
  };
}

export function getAllLocalSeoPages() {
  return LOCAL_SEO_PAGES.map(cloneLocalSeoPage);
}

export function getLocalSeoPage(slug: string) {
  const page = LOCAL_SEO_PAGES.find((entry) => entry.slug === slug);
  return page ? cloneLocalSeoPage(page) : null;
}

export function getLocalSeoPagePath(slug: string) {
  return `/dia-phuong/${slug}`;
}
