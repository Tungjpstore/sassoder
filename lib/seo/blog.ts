export type BlogFaqItem = {
  question: string;
  answer: string;
};

export type BlogSection = {
  heading: string;
  body: string[];
};

export type BlogIllustration = {
  title: string;
  alt: string;
  caption: string;
  labels: [string, string, string, string];
};

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  category: string;
  topic: string;
  publishedAt: string;
  updatedAt: string;
  readingTimeMinutes: number;
  keywords: string[];
  takeaways: string[];
  illustration?: BlogIllustration;
  wordCount?: number;
  sections: BlogSection[];
  faq: BlogFaqItem[];
  relatedSlugs: string[];
};

export type BlogTopicHub = {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  category: string;
  topic: string;
  updatedAt: string;
  keywords: string[];
  postSlugs: string[];
  takeaways: string[];
  sections: BlogSection[];
  faq: BlogFaqItem[];
};

export const BLOG_AUTHOR_NAME = "Đội ngũ LogiVN";

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "phan-mem-goi-mon-qr-cho-quan-cafe",
    title: "Phần mềm gọi món QR cho quán cafe: khi nào nên triển khai?",
    description:
      "Hướng dẫn chủ quán cafe đánh giá thời điểm triển khai phần mềm gọi món QR, từ menu số, order realtime đến thanh toán VietQR.",
    excerpt:
      "Nếu quán bắt đầu đông vào khung giờ cao điểm, gọi món QR không chỉ là một mã đặt trên bàn. Nó là cách giảm chờ, giảm hỏi lại và gom order về một nhịp vận hành rõ ràng hơn.",
    category: "Gọi món QR",
    topic: "QR ordering",
    publishedAt: "2026-05-10",
    updatedAt: "2026-05-10",
    readingTimeMinutes: 6,
    keywords: ["phần mềm gọi món QR", "menu QR", "quán cafe", "QR ordering", "LogiVN"],
    takeaways: [
      "QR ordering hiệu quả nhất khi quán đã có menu ổn định và thường bị nghẽn ở bước nhận order.",
      "Nên bắt đầu từ một luồng nhỏ: menu QR, order realtime, xác nhận bếp và thanh toán rõ ràng.",
      "Landing page, pricing và blog cần liên kết tự nhiên để Google hiểu LogiVN là nền tảng vận hành quán, không chỉ là trang giới thiệu."
    ],
    sections: [
      {
        heading: "Vấn đề thật không nằm ở mã QR",
        body: [
          "Nhiều quán nghĩ gọi món QR là in một mã rồi để khách tự thao tác. Thực tế, phần có giá trị hơn là hệ thống phía sau: menu phải rõ, đơn phải về realtime, nhân viên biết bàn nào cần xử lý và chủ quán nhìn được nhịp bán hàng.",
          "Khi chỉ có mã QR nhưng không có dashboard vận hành, quán dễ tạo thêm một kênh nhận đơn rời rạc. LogiVN nên được định vị như một operating layer cho quán cafe và nhà hàng Việt: QR là điểm bắt đầu, vận hành đơn mới là phần tạo khác biệt."
        ]
      },
      {
        heading: "Dấu hiệu quán đã sẵn sàng",
        body: [
          "Quán nên cân nhắc triển khai khi nhân viên thường phải quay lại bàn để xác nhận món, khách chờ lâu ở giờ cao điểm, hoặc chủ quán muốn đo rõ món bán chạy theo từng khung giờ.",
          "Một tín hiệu khác là menu đã đủ ổn định. Nếu menu thay đổi mỗi ngày, hãy ưu tiên chuẩn hóa danh mục, topping và giá trước. Khi menu đã rõ, QR ordering sẽ giúp thay đổi một lần và đồng bộ ngay ở mọi bàn."
        ]
      },
      {
        heading: "Luồng triển khai gọn trong tuần đầu",
        body: [
          "Tuần đầu không nên cố mở toàn bộ tính năng. Hãy bắt đầu với các bàn có lưu lượng cao, đưa 20-40 món chính lên menu, bật nhận order realtime và đào tạo nhân viên quy trình xác nhận.",
          "Sau khi luồng tại bàn ổn, quán có thể mở thêm đặt món online, pickup, delivery hoặc đặt bàn. Cách đi từng bước giúp đội ngũ không bị choáng và giúp chủ quán đo được tác động thật."
        ]
      }
    ],
    faq: [
      {
        question: "Quán nhỏ có cần phần mềm gọi món QR không?",
        answer:
          "Có thể cần nếu quán thường đông theo khung giờ, nhân viên bị quá tải hoặc chủ quán muốn giảm sai sót khi nhận order. Nếu quán còn rất ít bàn, có thể bắt đầu bằng menu QR trước rồi mở order realtime sau."
      },
      {
        question: "Gọi món QR có thay thế nhân viên không?",
        answer:
          "Không. Gọi món QR giảm thao tác lặp lại để nhân viên tập trung phục vụ, xử lý ngoại lệ và chăm sóc trải nghiệm tại quán tốt hơn."
      }
    ],
    relatedSlugs: ["menu-qr-la-gi", "quan-ly-order-realtime-gio-cao-diem", "chi-phi-phan-mem-goi-mon-qr"]
  },
  {
    slug: "thanh-toan-vietqr-cho-nha-hang",
    title: "Thanh toán VietQR cho nhà hàng: làm sao để đối soát bớt rối?",
    description:
      "Cách thiết kế luồng VietQR cho nhà hàng, quán cafe để giảm nhầm lẫn thanh toán, đối soát rõ hơn và giữ trải nghiệm khách mượt.",
    excerpt:
      "VietQR quen thuộc với khách Việt, nhưng nếu không gắn vào order và entitlement rõ ràng, chủ quán vẫn phải đối soát thủ công sau mỗi ca.",
    category: "Thanh toán",
    topic: "VietQR",
    publishedAt: "2026-05-10",
    updatedAt: "2026-05-10",
    readingTimeMinutes: 5,
    keywords: ["VietQR nhà hàng", "thanh toán quán cafe", "đối soát thanh toán", "LogiVN"],
    takeaways: [
      "VietQR nên nằm trong cùng luồng order, không tách thành một bước thủ công bên ngoài.",
      "Thông tin thanh toán cần gắn với bàn, đơn, số tiền và trạng thái xác minh.",
      "Nội dung SEO về VietQR nên nối về pricing vì đây là truy vấn có ý định thương mại cao."
    ],
    sections: [
      {
        heading: "VietQR mạnh vì đúng thói quen khách Việt",
        body: [
          "Khách đã quen chuyển khoản bằng app ngân hàng, nên VietQR giúp giảm ma sát thanh toán mà không bắt quán đổi hành vi quá mạnh. Nhưng quen thuộc không đồng nghĩa là tự động rõ ràng.",
          "Nếu mã QR thanh toán không gắn với đơn hàng, nhân viên vẫn phải hỏi lại ảnh chuyển khoản, số tiền và bàn. Vấn đề SEO lẫn sản phẩm đều nằm ở chữ rõ ràng: LogiVN cần kể câu chuyện thanh toán gọn nhưng có kiểm soát."
        ]
      },
      {
        heading: "Ba lớp cần có để đối soát tốt hơn",
        body: [
          "Lớp đầu tiên là thông tin đơn: bàn nào, món gì, tổng tiền bao nhiêu. Lớp thứ hai là trạng thái thanh toán: khách đã tạo thanh toán, nhân viên đã xác minh, đơn đã hoàn tất hay chưa.",
          "Lớp thứ ba là báo cáo cuối ca. Chủ quán cần nhìn lại tiền mặt, VietQR, đơn online và các ngoại lệ trong cùng một nơi. Khi ba lớp này nối với nhau, đối soát bớt phụ thuộc vào trí nhớ của nhân viên."
        ]
      },
      {
        heading: "Nên truyền thông VietQR thế nào trên website?",
        body: [
          "Landing page nên nói ngắn: LogiVN hỗ trợ VietQR trong hành trình gọi món và vận hành. Blog nên giải thích sâu hơn về đối soát, sai sót thường gặp và cách thiết lập quy trình.",
          "Pricing page nên nhấn phần entitlement, vì nhiều chủ quán muốn biết gói nào mở tính năng thanh toán, nâng cấp và báo cáo phù hợp."
        ]
      }
    ],
    faq: [
      {
        question: "VietQR có phù hợp cho quán cafe nhỏ không?",
        answer:
          "Có. VietQR phù hợp với quán nhỏ vì khách đã quen chuyển khoản. Điểm cần chú ý là phải gắn thanh toán với đơn để nhân viên dễ xác minh."
      },
      {
        question: "LogiVN có thể thay thế máy POS không?",
        answer:
          "LogiVN tập trung vào gọi món QR, quản lý order, VietQR và vận hành SaaS. Với quán cần POS vật lý chuyên sâu, nên xem LogiVN như lớp vận hành số bổ sung hoặc tích hợp theo nhu cầu."
      }
    ],
    relatedSlugs: ["doi-soat-vietqr-cuoi-ca", "phan-mem-goi-mon-qr-cho-quan-cafe", "chi-phi-phan-mem-goi-mon-qr"]
  },
  {
    slug: "quan-ly-order-realtime-gio-cao-diem",
    title: "Quản lý order realtime trong giờ cao điểm: quán nên nhìn chỉ số nào?",
    description:
      "Các chỉ số vận hành giúp chủ quán cafe, nhà hàng quản lý order realtime tốt hơn trong giờ cao điểm: bàn, bếp, thanh toán và món bán chạy.",
    excerpt:
      "Giờ cao điểm không thiếu dữ liệu, chỉ thiếu một bề mặt đủ rõ để chủ quán biết điểm nghẽn nằm ở bàn, bếp, thanh toán hay nhân sự.",
    category: "Vận hành",
    topic: "Realtime operations",
    publishedAt: "2026-05-10",
    updatedAt: "2026-05-10",
    readingTimeMinutes: 7,
    keywords: ["quản lý order realtime", "dashboard quán cafe", "vận hành nhà hàng", "giờ cao điểm", "LogiVN"],
    takeaways: [
      "Realtime không chỉ là cập nhật nhanh; quan trọng là trạng thái đủ rõ để nhân viên hành động.",
      "Chủ quán nên theo dõi bàn đang chờ, đơn đang xử lý, thanh toán chưa xác minh và món bán chạy.",
      "Nội dung blog vận hành giúp LogiVN mở rộng khỏi brand query sang nhóm tìm kiếm vấn đề thực tế."
    ],
    sections: [
      {
        heading: "Realtime phải dẫn tới hành động",
        body: [
          "Một dashboard realtime tốt không chỉ làm số liệu nhảy liên tục. Nó phải trả lời câu hỏi: bây giờ đội ngũ cần làm gì tiếp theo?",
          "Trong giờ cao điểm, chủ quán không có thời gian đọc báo cáo dài. Những trạng thái như bàn mới gọi, đơn đang chờ bếp, thanh toán cần xác minh hoặc món hết hàng phải nổi lên đúng lúc."
        ]
      },
      {
        heading: "Bốn nhóm chỉ số nên ưu tiên",
        body: [
          "Nhóm đầu tiên là bàn và order: bàn nào đang chờ xác nhận, đơn nào quá lâu, khách nào gọi thêm. Nhóm thứ hai là bếp: món nào đang dồn, món nào dễ gây trễ.",
          "Nhóm thứ ba là thanh toán: đơn nào đã thanh toán, đơn nào cần xác minh VietQR. Nhóm cuối cùng là doanh thu và món bán chạy để chủ quán điều chỉnh combo, nguyên liệu và nhân sự cho ca sau."
        ]
      },
      {
        heading: "Từ dashboard đến SEO content",
        body: [
          "Các bài viết về vận hành realtime giúp LogiVN xuất hiện ở những truy vấn không chứa tên thương hiệu, ví dụ 'quản lý order giờ cao điểm' hoặc 'dashboard quán cafe'.",
          "Khi bài viết giải thích được vấn đề thật, internal link về landing và pricing trở nên tự nhiên hơn. Google có thêm ngữ cảnh, còn chủ quán có thêm lý do để thử sản phẩm."
        ]
      }
    ],
    faq: [
      {
        question: "Realtime dashboard có cần cho quán một chi nhánh không?",
        answer:
          "Có nếu quán thường đông theo khung giờ hoặc có nhiều điểm chạm như QR tại bàn, online ordering, pickup, delivery và thanh toán VietQR."
      },
      {
        question: "Chỉ số nào nên xem đầu tiên trong giờ cao điểm?",
        answer:
          "Nên xem đơn đang chờ xử lý, bàn cần hỗ trợ, thanh toán chưa xác minh và món đang bán mạnh. Đây là các tín hiệu dễ chuyển thành hành động ngay."
      }
    ],
    relatedSlugs: ["phan-mem-quan-ly-quan-cafe-nho", "dat-mon-online-cho-quan-cafe", "phan-mem-goi-mon-qr-cho-quan-cafe"]
  },
  {
    slug: "menu-qr-la-gi",
    title: "Menu QR là gì? Cách biến menu số thành luồng order rõ ràng",
    description:
      "Giải thích menu QR cho quán cafe, nhà hàng: khác gì gọi món QR, cần chuẩn bị dữ liệu nào và khi nào nên nối vào order realtime.",
    excerpt:
      "Menu QR không nên chỉ là ảnh menu đưa lên web. Khi được thiết kế đúng, nó trở thành lớp dữ liệu giúp khách chọn món nhanh và nhân viên xử lý order ít sai hơn.",
    category: "Gọi món QR",
    topic: "Menu QR",
    publishedAt: "2026-05-10",
    updatedAt: "2026-05-10",
    readingTimeMinutes: 6,
    keywords: ["menu QR là gì", "menu số", "menu QR quán cafe", "gọi món QR", "LogiVN"],
    takeaways: [
      "Menu QR là bước nền để chuẩn hóa món, giá, topping và trạng thái bán trước khi mở order realtime.",
      "Một menu số tốt cần dễ đọc trên điện thoại, có danh mục rõ và hạn chế ảnh nặng gây chậm tải.",
      "Nếu quán muốn khách tự gọi món, menu QR nên được nối với giỏ hàng, bàn, bếp và thanh toán."
    ],
    sections: [
      {
        heading: "Menu QR khác gì gọi món QR?",
        body: [
          "Menu QR là cách khách quét mã để xem menu trên điện thoại. Gọi món QR đi xa hơn: khách chọn món, gửi order, nhân viên nhận trạng thái và bếp có dữ liệu để xử lý.",
          "Vì vậy, menu QR là nền móng của hành trình số hóa nhưng chưa đủ để giảm tải vận hành. Nếu menu chỉ là file ảnh hoặc PDF, quán vẫn phải nhận order thủ công và rất khó đo món bán chạy."
        ]
      },
      {
        heading: "Dữ liệu menu cần chuẩn hóa trước",
        body: [
          "Trước khi đưa menu lên QR, chủ quán nên chuẩn hóa danh mục, tên món, mô tả ngắn, giá, topping, món hết hàng và ảnh đại diện. Đây là phần thường mất thời gian hơn việc tạo mã QR.",
          "Dữ liệu càng rõ, khách càng ít hỏi lại. Nhân viên cũng dễ xử lý ngoại lệ vì mỗi món đã có cấu trúc thống nhất thay vì ghi chú rời rạc trên giấy hoặc tin nhắn."
        ]
      },
      {
        heading: "Khi nào nên nối menu QR với order realtime?",
        body: [
          "Nếu quán chỉ muốn khách xem menu nhanh, menu QR độc lập có thể đủ. Nhưng khi quán có nhiều bàn, giờ cao điểm hoặc nhân viên thường nhập sai món, nên nối menu với giỏ hàng và order realtime.",
          "LogiVN nên được dùng như lớp tiếp theo sau menu QR: cùng một dữ liệu món, khách có thể gọi tại bàn, nhân viên nhận đơn, chủ quán theo dõi trạng thái và mở rộng sang VietQR khi sẵn sàng."
        ]
      }
    ],
    faq: [
      {
        question: "Menu QR có cần website riêng không?",
        answer:
          "Không nhất thiết. Điều quan trọng là menu phải tải nhanh, dễ đọc trên điện thoại và có URL ổn định để quét từ mã QR tại bàn hoặc trên kênh online."
      },
      {
        question: "Có nên dùng ảnh menu làm menu QR không?",
        answer:
          "Ảnh menu có thể dùng tạm, nhưng khó tìm món, khó cập nhật giá và khó nối với order. Menu dạng dữ liệu có danh mục, món và topping sẽ phù hợp hơn nếu muốn vận hành lâu dài."
      },
      {
        question: "Menu QR có giúp SEO không?",
        answer:
          "Menu QR cho từng quán thường không phải mục tiêu SEO chính của LogiVN. Giá trị SEO nằm ở nội dung giải thích vấn đề, còn menu QR là bằng chứng sản phẩm và trải nghiệm thực tế."
      }
    ],
    relatedSlugs: ["phan-mem-goi-mon-qr-cho-quan-cafe", "quan-ly-order-realtime-gio-cao-diem", "chi-phi-phan-mem-goi-mon-qr"]
  },
  {
    slug: "chi-phi-phan-mem-goi-mon-qr",
    title: "Chi phí phần mềm gọi món QR: chủ quán nên tính những khoản nào?",
    description:
      "Cách tính chi phí phần mềm gọi món QR cho quán cafe, nhà hàng: gói tháng, thiết lập menu, vận hành, thanh toán và tăng trưởng đơn hàng.",
    excerpt:
      "Giá phần mềm không chỉ là phí tháng. Chủ quán nên nhìn cả chi phí thiết lập, thời gian đào tạo, lỗi vận hành giảm được và khả năng mở rộng khi quán đông hơn.",
    category: "Chi phí & gói dịch vụ",
    topic: "Pricing intent",
    publishedAt: "2026-05-10",
    updatedAt: "2026-05-10",
    readingTimeMinutes: 7,
    keywords: ["chi phí phần mềm gọi món QR", "giá phần mềm quán cafe", "phần mềm order QR", "bảng giá LogiVN"],
    takeaways: [
      "Nên so chi phí phần mềm với thời gian nhân viên tiết kiệm được và số lỗi order giảm đi.",
      "Chi phí thật gồm phí tháng, thiết lập menu, đào tạo, thiết bị in QR và quy trình thanh toán.",
      "Nội dung chi phí nên dẫn tự nhiên về pricing vì đây là nhóm truy vấn có ý định mua cao."
    ],
    sections: [
      {
        heading: "Đừng chỉ nhìn phí tháng",
        body: [
          "Một gói phần mềm rẻ nhưng khó thiết lập có thể làm đội ngũ mất nhiều thời gian hơn. Ngược lại, một gói rõ entitlement, dễ mở rộng và có báo cáo tốt có thể tiết kiệm chi phí vận hành sau vài ca cao điểm.",
          "Khi tính chi phí, chủ quán nên đặt câu hỏi: phần mềm giúp giảm bao nhiêu lần hỏi lại món, giảm bao nhiêu đơn sai và giúp quản lý ca nhanh hơn như thế nào?"
        ]
      },
      {
        heading: "Năm khoản nên đưa vào bảng tính",
        body: [
          "Khoản đầu tiên là phí phần mềm hằng tháng. Khoản thứ hai là thời gian nhập menu, chuẩn hóa topping và in mã QR. Khoản thứ ba là đào tạo nhân viên nhận đơn, xác minh thanh toán và xử lý ngoại lệ.",
          "Khoản thứ tư là thiết bị phụ trợ như máy in bill, tablet hoặc điện thoại nhận đơn nếu quán cần. Khoản thứ năm là chi phí cơ hội khi không dùng phần mềm: khách chờ lâu, order sai hoặc không có dữ liệu món bán chạy."
        ]
      },
      {
        heading: "Khi nào nên nâng gói?",
        body: [
          "Nên nâng gói khi quán mở thêm chi nhánh, bắt đầu nhận đơn online, cần AI hỗ trợ vận hành hoặc muốn báo cáo sâu hơn cho doanh thu, món bán chạy và khung giờ cao điểm.",
          "Với LogiVN, pricing nên được giải thích bằng kịch bản vận hành thay vì chỉ liệt kê tính năng. Chủ quán cần biết gói nào hợp với quán nhỏ, gói nào hợp khi mở rộng."
        ]
      }
    ],
    faq: [
      {
        question: "Phần mềm gọi món QR có tốn phí thiết lập không?",
        answer:
          "Tùy nhà cung cấp và mức hỗ trợ. Ngay cả khi không có phí thiết lập riêng, quán vẫn nên tính thời gian chuẩn hóa menu, đào tạo nhân viên và in mã QR."
      },
      {
        question: "Quán nhỏ nên chọn gói nào trước?",
        answer:
          "Quán nhỏ nên bắt đầu với gói đủ menu QR, order realtime và thanh toán cơ bản. Sau khi luồng ổn định, mới nâng cấp báo cáo sâu, AI hoặc tính năng đa chi nhánh."
      },
      {
        question: "Có nên chọn phần mềm chỉ vì giá thấp nhất không?",
        answer:
          "Không nên. Giá thấp chỉ có ý nghĩa khi phần mềm vẫn tải nhanh, dễ dùng, hỗ trợ quy trình thật và không tạo thêm việc thủ công cho nhân viên."
      }
    ],
    relatedSlugs: ["phan-mem-goi-mon-qr-cho-quan-cafe", "menu-qr-la-gi", "thanh-toan-vietqr-cho-nha-hang"]
  },
  {
    slug: "phan-mem-quan-ly-quan-cafe-nho",
    title: "Phần mềm quản lý quán cafe nhỏ: bắt đầu từ đâu để không quá tải?",
    description:
      "Lộ trình chọn phần mềm quản lý quán cafe nhỏ: bắt đầu từ menu, order, thanh toán, báo cáo ca và chỉ mở rộng khi quy trình đã ổn.",
    excerpt:
      "Quán nhỏ không cần một hệ thống quá cồng kềnh ngay ngày đầu. Cần nhất là một luồng đủ rõ để nhân viên làm ít thao tác hơn và chủ quán nhìn được ca bán.",
    category: "Vận hành",
    topic: "Small cafe operations",
    publishedAt: "2026-05-10",
    updatedAt: "2026-05-10",
    readingTimeMinutes: 6,
    keywords: ["phần mềm quản lý quán cafe nhỏ", "quản lý quán cafe", "phần mềm quán cafe", "LogiVN"],
    takeaways: [
      "Quán nhỏ nên bắt đầu bằng menu số, order rõ trạng thái và báo cáo ca đơn giản.",
      "Không nên bật quá nhiều tính năng trước khi nhân viên quen với quy trình nhận đơn.",
      "Một hệ thống tốt phải giúp quán mở rộng dần từ tại bàn sang online ordering, delivery và đặt bàn."
    ],
    sections: [
      {
        heading: "Vấn đề của quán nhỏ là độ rõ, không phải độ nhiều",
        body: [
          "Nhiều phần mềm bán hàng cố đưa thật nhiều tính năng ngay từ đầu. Với quán cafe nhỏ, điều đó dễ làm nhân viên rối hơn, nhất là khi đội ngũ chưa quen thao tác số.",
          "Điểm nên ưu tiên là một luồng đơn giản: khách xem menu, gọi món, nhân viên xác nhận, thanh toán rõ và cuối ca có báo cáo đủ dùng."
        ]
      },
      {
        heading: "Lộ trình ba bước để bắt đầu",
        body: [
          "Bước một là chuẩn hóa menu và danh mục. Bước hai là bật order realtime cho các bàn đông khách nhất. Bước ba là nối thanh toán và báo cáo cuối ca để chủ quán không phải tổng hợp thủ công.",
          "Sau ba bước này, quán mới nên cân nhắc đặt món online, pickup, delivery hoặc đặt bàn. Mở rộng theo nhu cầu thật giúp hệ thống không trở thành một lớp phức tạp mới."
        ]
      },
      {
        heading: "LogiVN nên nằm ở đâu trong stack của quán nhỏ?",
        body: [
          "LogiVN phù hợp làm lớp vận hành số nhẹ: gọi món QR, order realtime, thanh toán VietQR, đặt món online và AI hỗ trợ khi quán bắt đầu có nhiều điểm chạm.",
          "Nếu quán đã có POS vật lý, LogiVN vẫn có thể đóng vai trò lớp trải nghiệm khách và order số. Nếu quán chưa có gì, LogiVN có thể là điểm bắt đầu để chuẩn hóa luồng bán."
        ]
      }
    ],
    faq: [
      {
        question: "Quán cafe nhỏ có cần dashboard không?",
        answer:
          "Có nếu dashboard chỉ hiển thị việc cần làm ngay: đơn mới, đơn đang chờ, thanh toán cần xác minh và báo cáo ca. Dashboard quá nhiều chỉ số có thể làm quán nhỏ bị rối."
      },
      {
        question: "Nên triển khai phần mềm trong bao lâu?",
        answer:
          "Nên triển khai theo từng tuần. Tuần đầu chuẩn hóa menu và order tại bàn, tuần sau mới mở thêm thanh toán, online ordering hoặc báo cáo sâu hơn."
      },
      {
        question: "Có cần mua thiết bị mới không?",
        answer:
          "Không phải lúc nào cũng cần. Nhiều quán có thể bắt đầu bằng điện thoại hoặc tablet sẵn có, sau đó mới bổ sung máy in hoặc màn hình bếp nếu lưu lượng đơn tăng."
      }
    ],
    relatedSlugs: ["quan-ly-order-realtime-gio-cao-diem", "dat-mon-online-cho-quan-cafe", "chi-phi-phan-mem-goi-mon-qr"]
  },
  {
    slug: "dat-mon-online-cho-quan-cafe",
    title: "Đặt món online cho quán cafe: khi nào nên mở pickup và delivery?",
    description:
      "Cách đánh giá thời điểm mở đặt món online cho quán cafe: pickup, delivery, menu riêng, thanh toán và vận hành đơn ngoài quán.",
    excerpt:
      "Đặt món online có thể tăng doanh thu ngoài giờ ngồi tại quán, nhưng chỉ hiệu quả khi menu, bếp, thanh toán và giao nhận được tách bạch đủ rõ.",
    category: "Đặt món online",
    topic: "Online ordering",
    publishedAt: "2026-05-10",
    updatedAt: "2026-05-10",
    readingTimeMinutes: 7,
    keywords: ["đặt món online quán cafe", "pickup cafe", "delivery quán cafe", "online ordering", "LogiVN"],
    takeaways: [
      "Không phải quán nào cũng nên mở delivery ngay; pickup thường là bước thử an toàn hơn.",
      "Menu online nên ưu tiên món dễ đóng gói, giá rõ và ít cần ghi chú phức tạp.",
      "Đơn online cần trạng thái riêng để không lẫn với order tại bàn trong giờ cao điểm."
    ],
    sections: [
      {
        heading: "Pickup thường là bước thử tốt hơn delivery",
        body: [
          "Pickup giúp quán kiểm tra nhu cầu đặt trước mà chưa phải xử lý toàn bộ bài toán giao hàng, phí ship và vị trí tài xế. Đây là cách mở kênh online có rủi ro thấp hơn.",
          "Khi số đơn pickup ổn định, quán mới nên mở delivery hoặc kết nối đối tác giao hàng. Nếu mở quá sớm, đội ngũ dễ bị kéo khỏi luồng phục vụ tại quán."
        ]
      },
      {
        heading: "Menu online nên khác menu tại bàn",
        body: [
          "Không phải món nào cũng phù hợp bán online. Các món dễ đổ, dễ giảm chất lượng hoặc cần phục vụ ngay nên được cân nhắc kỹ. Menu online nên ưu tiên món đóng gói tốt và thời gian chuẩn bị dự đoán được.",
          "Mô tả món, tuỳ chọn topping và ghi chú dị ứng cũng cần rõ hơn vì khách không có nhân viên bên cạnh để hỏi ngay."
        ]
      },
      {
        heading: "Đừng để đơn online lẫn với đơn tại bàn",
        body: [
          "Trong giờ cao điểm, đơn tại bàn, pickup và delivery có ưu tiên khác nhau. Nếu tất cả đổ vào cùng một danh sách không phân loại, nhân viên dễ xử lý sai thứ tự.",
          "LogiVN nên tách trạng thái và nguồn đơn để chủ quán biết đơn nào cần chuẩn bị cho khách đang ngồi, đơn nào chờ khách tới lấy và đơn nào cần bàn giao cho shipper."
        ]
      }
    ],
    faq: [
      {
        question: "Quán cafe nhỏ nên mở pickup trước hay delivery trước?",
        answer:
          "Pickup thường an toàn hơn vì ít phụ thuộc giao nhận và dễ kiểm soát chất lượng. Delivery nên mở khi quán đã có quy trình chuẩn bị đơn online ổn định."
      },
      {
        question: "Có nên dùng cùng menu cho tại bàn và online không?",
        answer:
          "Có thể dùng cùng dữ liệu gốc, nhưng nên lọc món cho kênh online. Một số món tại bàn không phù hợp đóng gói hoặc giao xa."
      },
      {
        question: "Đặt món online có ảnh hưởng SEO không?",
        answer:
          "Có ở tầng nội dung sản phẩm và landing page. Với LogiVN, các bài giải thích pickup, delivery và order online giúp mở rộng truy vấn thương mại ngoài nhóm QR ordering."
      }
    ],
    relatedSlugs: ["phan-mem-quan-ly-quan-cafe-nho", "quan-ly-order-realtime-gio-cao-diem", "thanh-toan-vietqr-cho-nha-hang"]
  },
  {
    slug: "doi-soat-vietqr-cuoi-ca",
    title: "Đối soát VietQR cuối ca: checklist cho quán cafe và nhà hàng",
    description:
      "Checklist đối soát VietQR cuối ca cho quán cafe, nhà hàng: kiểm tra đơn, số tiền, trạng thái xác minh, ngoại lệ và báo cáo.",
    excerpt:
      "VietQR giúp khách thanh toán nhanh, nhưng cuối ca vẫn cần một checklist đủ rõ để không bỏ sót đơn, nhầm số tiền hoặc xác minh thiếu giao dịch.",
    category: "Thanh toán",
    topic: "VietQR reconciliation",
    publishedAt: "2026-05-10",
    updatedAt: "2026-05-10",
    readingTimeMinutes: 6,
    keywords: ["đối soát VietQR", "checklist thanh toán nhà hàng", "VietQR quán cafe", "báo cáo cuối ca", "LogiVN"],
    takeaways: [
      "Đối soát tốt bắt đầu từ việc mỗi giao dịch VietQR gắn với một order cụ thể.",
      "Cuối ca nên kiểm tra đơn đã thanh toán, đơn chưa xác minh, tiền mặt, chuyển khoản và ngoại lệ.",
      "Checklist đối soát là content hỗ trợ mạnh cho nhóm truy vấn VietQR có ý định triển khai."
    ],
    sections: [
      {
        heading: "Vì sao VietQR vẫn cần checklist?",
        body: [
          "VietQR làm bước thanh toán nhanh hơn, nhưng không tự giải quyết toàn bộ đối soát nếu giao dịch không gắn với order, bàn hoặc mã đơn. Nhân viên vẫn có thể xác minh nhầm nếu chỉ nhìn ảnh chuyển khoản.",
          "Checklist giúp cuối ca không phụ thuộc vào trí nhớ. Nó cũng tạo thói quen vận hành rõ: giao dịch nào đã khớp, giao dịch nào cần kiểm tra lại và đơn nào còn mở."
        ]
      },
      {
        heading: "Checklist cuối ca nên gồm gì?",
        body: [
          "Trước hết, kiểm tra số đơn hoàn tất theo từng nguồn: tại bàn, pickup, delivery. Sau đó đối chiếu tổng tiền VietQR với các đơn được đánh dấu đã thanh toán và các giao dịch cần xác minh.",
          "Tiếp theo, rà soát ngoại lệ: khách chuyển thiếu, chuyển dư, chuyển nhầm nội dung, đơn huỷ sau khi thanh toán hoặc nhân viên xác minh sai trạng thái."
        ]
      },
      {
        heading: "Tự động hóa phần nào là hợp lý?",
        body: [
          "Không phải mọi thứ phải tự động ngay. Tuần đầu, chỉ cần trạng thái thanh toán gắn với order và danh sách ngoại lệ rõ. Khi quán có nhiều đơn hơn, mới cần báo cáo đối soát sâu.",
          "LogiVN có thể kể câu chuyện này trong SEO bằng cách nối bài VietQR, bài chi phí và pricing. Người đọc hiểu vấn đề trước, sau đó mới xem gói phù hợp."
        ]
      }
    ],
    faq: [
      {
        question: "Đối soát VietQR có cần làm mỗi ca không?",
        answer:
          "Nên làm mỗi ca, đặc biệt với quán có nhiều nhân viên hoặc nhiều nguồn đơn. Đối soát thường xuyên giúp phát hiện nhầm lẫn trước khi số liệu dồn lại."
      },
      {
        question: "Thông tin nào cần gắn với giao dịch VietQR?",
        answer:
          "Tối thiểu nên có mã đơn, bàn hoặc nguồn đơn, tổng tiền, trạng thái xác minh và người xử lý. Càng rõ dữ liệu, cuối ca càng dễ kiểm tra."
      },
      {
        question: "Checklist có thay thế báo cáo tự động không?",
        answer:
          "Không. Checklist là lớp thói quen vận hành. Báo cáo tự động giúp rút ngắn thời gian kiểm tra khi lượng đơn lớn hơn."
      }
    ],
    relatedSlugs: ["thanh-toan-vietqr-cho-nha-hang", "chi-phi-phan-mem-goi-mon-qr", "dat-mon-online-cho-quan-cafe"]
  },
  {
    slug: "order-tai-ban-khong-can-app",
    title: "Order tại bàn không cần app: vì sao QR ordering hợp với quán Việt?",
    description:
      "Giải thích mô hình order tại bàn không cần tải app: khách quét QR, chọn món, gửi order và nhân viên xử lý realtime trong quán.",
    excerpt:
      "Khách không muốn tải thêm app chỉ để gọi một ly nước. QR ordering tại bàn hiệu quả vì bắt đầu ngay trên trình duyệt, giảm ma sát cho khách và vẫn giữ luồng vận hành rõ cho nhân viên.",
    category: "Gọi món QR",
    topic: "Table ordering",
    publishedAt: "2026-05-11",
    updatedAt: "2026-05-11",
    readingTimeMinutes: 6,
    keywords: ["order tại bàn", "gọi món không cần app", "QR ordering tại bàn", "menu QR quán cafe", "LogiVN"],
    takeaways: [
      "Order tại bàn không cần app giảm ma sát vì khách chỉ cần quét QR và dùng trình duyệt.",
      "Luồng tốt phải nối QR, bàn, giỏ hàng, bếp và trạng thái thanh toán thay vì chỉ hiển thị menu.",
      "Nội dung này mở rộng từ truy vấn menu QR sang truy vấn có ý định triển khai vận hành tại bàn."
    ],
    sections: [
      {
        heading: "Không bắt khách tải app là một lợi thế lớn",
        body: [
          "Với quán cafe và nhà hàng, khách thường chỉ ghé trong một phiên ngắn. Nếu phải tải app, đăng ký tài khoản rồi mới gọi món, phần lớn lợi ích tốc độ sẽ biến mất.",
          "QR ordering tại bàn nên hoạt động ngay trên trình duyệt. Khách quét mã, xem menu, chọn topping, gửi order và gọi thêm nếu cần. Nhân viên vẫn có quyền xác nhận để kiểm soát ngoại lệ."
        ]
      },
      {
        heading: "Order tại bàn cần biết khách đang ngồi ở đâu",
        body: [
          "Điểm khác biệt giữa menu QR và order tại bàn là ngữ cảnh bàn. Khi QR gắn với từng bàn, đơn gửi lên dashboard đã có vị trí phục vụ, giúp nhân viên không phải hỏi lại khách.",
          "Nếu quán có khu vực ngoài trời, tầng lầu hoặc nhiều chi nhánh, ngữ cảnh này càng quan trọng. Một đơn không rõ bàn có thể làm chậm cả bếp lẫn phục vụ."
        ]
      },
      {
        heading: "Khi nào nên triển khai order tại bàn?",
        body: [
          "Nên triển khai khi quán có nhiều bàn, khách thường gọi thêm món hoặc nhân viên bị nghẽn ở bước nhận order. Quán nhỏ cũng có thể thử ở vài bàn đông nhất trước khi nhân rộng.",
          "LogiVN nên được định vị như lớp order tại bàn không cần app: khách thao tác nhẹ, nhân viên xử lý realtime, chủ quán nhìn được trạng thái và dữ liệu ca bán."
        ]
      }
    ],
    faq: [
      {
        question: "Order tại bàn có cần khách đăng nhập không?",
        answer:
          "Không nên bắt buộc trong luồng gọi món cơ bản. Khách nên quét QR và đặt món ngay; đăng nhập chỉ nên dùng cho tính năng thành viên hoặc lịch sử nâng cao."
      },
      {
        question: "QR ordering tại bàn có dùng được với menu giấy không?",
        answer:
          "Có thể dùng song song. Menu giấy giúp khách quen dễ xem nhanh, còn QR ordering giúp gửi order, cập nhật món hết và giảm thao tác ghi tay."
      },
      {
        question: "Order tại bàn khác gì đặt món online?",
        answer:
          "Order tại bàn gắn với bàn và trải nghiệm trong quán. Đặt món online thường dành cho pickup, delivery hoặc khách chưa có mặt tại quán."
      }
    ],
    relatedSlugs: ["menu-qr-la-gi", "phan-mem-goi-mon-qr-cho-quan-cafe", "quan-ly-order-realtime-gio-cao-diem"]
  },
  {
    slug: "phan-mem-order-tra-sua",
    title: "Phần mềm order trà sữa: xử lý topping, combo và giờ cao điểm thế nào?",
    description:
      "Hướng dẫn chọn phần mềm order cho quán trà sữa: topping, size, combo, QR ordering, pickup, delivery và báo cáo món bán chạy.",
    excerpt:
      "Quán trà sữa không chỉ bán món chính. Điểm khó nằm ở size, đá, đường, topping, combo và đơn dồn nhanh trong giờ tan học hoặc cuối tuần.",
    category: "Ngành hàng",
    topic: "Milk tea operations",
    publishedAt: "2026-05-11",
    updatedAt: "2026-05-11",
    readingTimeMinutes: 7,
    keywords: ["phần mềm order trà sữa", "quản lý quán trà sữa", "topping trà sữa", "QR order trà sữa", "LogiVN"],
    takeaways: [
      "Quán trà sữa cần phần mềm xử lý tốt biến thể món: size, đá, đường, topping và combo.",
      "QR ordering giúp giảm hỏi lại nhưng chỉ hiệu quả khi menu dữ liệu được chuẩn hóa trước.",
      "Báo cáo món bán chạy và topping phổ biến giúp chủ quán tối ưu nguyên liệu theo ca."
    ],
    sections: [
      {
        heading: "Topping làm phần mềm order phức tạp hơn",
        body: [
          "Một ly trà sữa có thể có nhiều biến thể: size, mức đường, mức đá, topping, ghi chú và combo. Nếu phần mềm không xử lý cấu trúc này rõ ràng, nhân viên vẫn phải hỏi lại hoặc sửa đơn thủ công.",
          "Menu dạng dữ liệu giúp mỗi tùy chọn có tên, giá và trạng thái bán riêng. Khi topping hết, quán có thể tắt ngay thay vì báo miệng cho từng nhân viên."
        ]
      },
      {
        heading: "Giờ cao điểm cần order realtime",
        body: [
          "Trà sữa thường dồn đơn ở khung giờ ngắn. QR ordering tại bàn hoặc đặt trước pickup giúp khách chọn món nhanh hơn, nhưng bếp pha chế cần thấy thứ tự, ghi chú và trạng thái rõ.",
          "Nếu đơn tại quán, pickup và delivery không được phân loại, nhân viên dễ xử lý sai ưu tiên. Phần mềm nên tách nguồn đơn và giữ trạng thái đủ đơn giản để thao tác nhanh."
        ]
      },
      {
        heading: "Báo cáo nào hữu ích cho quán trà sữa?",
        body: [
          "Ngoài doanh thu, chủ quán nên xem món bán chạy, topping phổ biến, combo hiệu quả và khung giờ dồn đơn. Các chỉ số này giúp chuẩn bị nguyên liệu và bố trí nhân sự tốt hơn.",
          "LogiVN có thể kể câu chuyện ngành hàng trà sữa như một nhánh SEO riêng: cùng nền tảng QR/order realtime, nhưng ví dụ và checklist bám sát menu nhiều biến thể."
        ]
      }
    ],
    faq: [
      {
        question: "Quán trà sữa có nên cho khách tự chọn topping bằng QR không?",
        answer:
          "Có, nếu menu được cấu trúc rõ. Khách tự chọn topping giúp giảm hỏi lại, nhưng hệ thống phải tính giá và trạng thái hết hàng chính xác."
      },
      {
        question: "Pickup có phù hợp với quán trà sữa không?",
        answer:
          "Rất phù hợp nếu quán có khách quen đặt trước. Pickup giúp giảm hàng chờ, nhưng cần thời gian hẹn lấy và trạng thái chuẩn bị rõ."
      },
      {
        question: "Bài toán khó nhất khi số hóa quán trà sữa là gì?",
        answer:
          "Thường là chuẩn hóa menu nhiều biến thể và giữ luồng xử lý đơn nhanh trong giờ cao điểm, không phải chỉ tạo mã QR."
      }
    ],
    relatedSlugs: ["order-tai-ban-khong-can-app", "dat-mon-online-cho-quan-cafe", "bao-cao-doanh-thu-quan-cafe"]
  },
  {
    slug: "dat-ban-nhan-coc-nha-hang",
    title: "Đặt bàn nhận cọc cho nhà hàng: khi nào nên đưa vào quy trình số?",
    description:
      "Cách triển khai đặt bàn nhận cọc cho nhà hàng: luồng giữ chỗ, thanh toán VietQR, xác nhận, no-show và báo cáo cuối ca.",
    excerpt:
      "Đặt bàn nhận cọc không chỉ là thu tiền trước. Nó là cách nhà hàng giảm no-show, chuẩn bị nhân sự tốt hơn và giữ trải nghiệm đặt chỗ minh bạch.",
    category: "Đặt bàn",
    topic: "Reservation deposits",
    publishedAt: "2026-05-11",
    updatedAt: "2026-05-11",
    readingTimeMinutes: 7,
    keywords: ["đặt bàn nhận cọc", "phần mềm đặt bàn nhà hàng", "nhận cọc VietQR", "giảm no-show", "LogiVN"],
    takeaways: [
      "Nhận cọc phù hợp khi nhà hàng có bàn giới hạn, khung giờ cao điểm hoặc thường gặp no-show.",
      "Luồng đặt bàn cần nối thời gian, số khách, tiền cọc, trạng thái xác nhận và chính sách hoàn hủy.",
      "Bài viết đặt bàn giúp LogiVN mở rộng SEO từ order sang reservation và thanh toán."
    ],
    sections: [
      {
        heading: "Nhận cọc giải quyết vấn đề no-show",
        body: [
          "Với nhà hàng có bàn giới hạn, một lượt đặt nhưng không đến có thể làm mất doanh thu thật. Nhận cọc giúp khách cam kết rõ hơn và giúp nhà hàng chủ động chuẩn bị bàn, bếp, nhân sự.",
          "Tuy nhiên, nếu quy trình cọc không minh bạch, khách dễ cảm thấy rườm rà. Website cần giải thích rõ khi nào cần cọc, số tiền bao nhiêu, hoàn hủy ra sao và ai xác nhận."
        ]
      },
      {
        heading: "Luồng số nên có những trạng thái nào?",
        body: [
          "Một đặt bàn nên có trạng thái: mới tạo, chờ thanh toán cọc, đã xác nhận, đã đến, no-show hoặc đã hủy. Mỗi trạng thái cần người phụ trách và thời điểm cập nhật rõ.",
          "Nếu nhận cọc bằng VietQR, giao dịch cần gắn với mã đặt bàn. Điều này giúp cuối ca đối soát dễ hơn và tránh nhầm giữa cọc, thanh toán món và các khoản phát sinh."
        ]
      },
      {
        heading: "Khi nào chưa nên nhận cọc?",
        body: [
          "Nếu quán còn nhiều bàn trống, lượt đặt chưa đều hoặc đội ngũ chưa quen xác nhận đặt chỗ, nên bắt đầu bằng form đặt bàn đơn giản trước.",
          "Khi khung giờ cao điểm đã rõ và no-show bắt đầu gây thiệt hại, nhà hàng có thể bật nhận cọc. LogiVN nên hỗ trợ cách mở dần để không làm trải nghiệm khách bị nặng."
        ]
      }
    ],
    faq: [
      {
        question: "Nhà hàng nhỏ có nên nhận cọc đặt bàn không?",
        answer:
          "Chỉ nên nhận cọc nếu bàn thường kín, no-show gây thiệt hại hoặc cần chuẩn bị nguyên liệu trước. Nếu chưa có vấn đề này, form đặt bàn đơn giản có thể đủ."
      },
      {
        question: "Có thể nhận cọc bằng VietQR không?",
        answer:
          "Có. Quan trọng là giao dịch VietQR phải gắn với mã đặt bàn, số khách, thời gian và trạng thái xác nhận để dễ đối soát."
      },
      {
        question: "Chính sách hoàn cọc nên đặt ở đâu?",
        answer:
          "Nên hiển thị ngay trong luồng đặt bàn và email hoặc tin nhắn xác nhận. Nội dung này cũng nên xuất hiện trong FAQ để khách và công cụ tìm kiếm hiểu rõ."
      }
    ],
    relatedSlugs: ["thanh-toan-vietqr-cho-nha-hang", "doi-soat-vietqr-cuoi-ca", "phan-mem-quan-ly-quan-cafe-nho"]
  },
  {
    slug: "bao-cao-doanh-thu-quan-cafe",
    title: "Báo cáo doanh thu quán cafe: xem gì sau mỗi ca để ra quyết định nhanh?",
    description:
      "Các báo cáo chủ quán cafe nên xem sau mỗi ca: doanh thu, món bán chạy, phương thức thanh toán, khung giờ cao điểm và ngoại lệ.",
    excerpt:
      "Báo cáo tốt không cần quá nhiều biểu đồ. Chủ quán cần biết ca vừa rồi bán được gì, nghẽn ở đâu, tiền đã khớp chưa và ngày mai nên điều chỉnh gì.",
    category: "Báo cáo",
    topic: "Revenue reporting",
    publishedAt: "2026-05-11",
    updatedAt: "2026-05-11",
    readingTimeMinutes: 6,
    keywords: ["báo cáo doanh thu quán cafe", "báo cáo cuối ca", "món bán chạy", "doanh thu nhà hàng", "LogiVN"],
    takeaways: [
      "Báo cáo cuối ca nên ưu tiên doanh thu, nguồn đơn, phương thức thanh toán và ngoại lệ cần xử lý.",
      "Món bán chạy và khung giờ cao điểm giúp chủ quán chuẩn bị nguyên liệu, combo và nhân sự.",
      "Nội dung báo cáo mở rộng SEO sang nhóm truy vấn quản trị sau khi quán đã vận hành QR/order."
    ],
    sections: [
      {
        heading: "Báo cáo cuối ca phải trả lời câu hỏi hành động",
        body: [
          "Chủ quán không cần một bảng số liệu quá dài sau mỗi ca. Cần nhất là biết doanh thu tổng, số đơn, nguồn đơn, phương thức thanh toán và các ngoại lệ chưa xử lý.",
          "Nếu báo cáo không dẫn tới hành động, đội ngũ sẽ bỏ qua. Một báo cáo tốt nên giúp quyết định ngày mai nhập thêm gì, đổi combo nào hoặc bố trí thêm nhân sự ở khung giờ nào."
        ]
      },
      {
        heading: "Năm nhóm chỉ số nên xem",
        body: [
          "Nhóm đầu tiên là doanh thu theo nguồn: tại bàn, online, pickup hoặc delivery. Nhóm thứ hai là phương thức thanh toán: tiền mặt, VietQR và các khoản chưa xác minh.",
          "Nhóm thứ ba là món bán chạy và topping phổ biến. Nhóm thứ tư là khung giờ cao điểm. Nhóm cuối cùng là ngoại lệ: đơn hủy, chuyển khoản lệch, món hết hàng hoặc đơn xử lý quá lâu."
        ]
      },
      {
        heading: "Từ báo cáo đến tối ưu menu",
        body: [
          "Khi dữ liệu đủ rõ, chủ quán có thể tạo combo từ món bán chạy, giảm món ít bán hoặc chuẩn bị nguyên liệu chính xác hơn. Đây là điểm phần mềm vận hành tạo giá trị sau khi QR ordering đã chạy ổn.",
          "LogiVN nên liên kết bài báo cáo với bài order realtime và VietQR để Google thấy một chuỗi vận hành hoàn chỉnh: nhận đơn, thanh toán, đối soát và ra quyết định."
        ]
      }
    ],
    faq: [
      {
        question: "Quán nhỏ có cần xem báo cáo mỗi ngày không?",
        answer:
          "Nên xem báo cáo cuối ca hoặc cuối ngày, nhưng chỉ cần vài chỉ số chính. Thói quen này giúp phát hiện vấn đề trước khi chúng tích tụ thành sai lệch lớn."
      },
      {
        question: "Báo cáo doanh thu nên tách theo nguồn đơn không?",
        answer:
          "Có. Tách tại bàn, pickup, delivery và online giúp chủ quán biết kênh nào đang hiệu quả và kênh nào đang gây nghẽn vận hành."
      },
      {
        question: "Món bán chạy có nên dùng để tạo combo không?",
        answer:
          "Có, nhưng nên xem thêm biên lợi nhuận và khả năng chuẩn bị trong giờ cao điểm. Món bán chạy chưa chắc luôn là món nên đẩy mạnh nếu làm bếp bị nghẽn."
      }
    ],
    relatedSlugs: ["quan-ly-order-realtime-gio-cao-diem", "doi-soat-vietqr-cuoi-ca", "phan-mem-order-tra-sua"]
  }
];

export const BLOG_TOPIC_HUBS: BlogTopicHub[] = [
  {
    slug: "goi-mon-qr",
    title: "Gọi món QR cho quán cafe, nhà hàng: lộ trình triển khai từ menu đến order realtime",
    description:
      "Topic hub về gọi món QR cho quán Việt: menu QR, order tại bàn không cần app, chi phí phần mềm và cách mở rộng sang vận hành realtime.",
    excerpt:
      "Cụm gọi món QR gom các bài nền tảng giúp chủ quán hiểu điểm khác nhau giữa menu QR, order tại bàn, dashboard realtime và chi phí triển khai.",
    category: "Topic hub",
    topic: "Gọi món QR",
    updatedAt: "2026-05-11",
    keywords: ["gọi món QR", "menu QR", "order tại bàn", "phần mềm gọi món QR", "QR ordering"],
    postSlugs: ["order-tai-ban-khong-can-app", "menu-qr-la-gi", "phan-mem-goi-mon-qr-cho-quan-cafe", "chi-phi-phan-mem-goi-mon-qr"],
    takeaways: [
      "Bắt đầu bằng menu dữ liệu rõ ràng trước khi mở order realtime.",
      "Order tại bàn hiệu quả nhất khi QR gắn với bàn, giỏ hàng, bếp và trạng thái phục vụ.",
      "Chi phí triển khai nên tính cả thời gian setup, đào tạo và lỗi vận hành giảm được."
    ],
    sections: [
      {
        heading: "Từ menu QR đến order realtime",
        body: [
          "Menu QR là lớp đầu tiên: khách quét mã để xem món, giá, topping và trạng thái còn bán. Nhưng nếu chỉ dừng ở menu, nhân viên vẫn phải nhận order thủ công và chủ quán chưa có dữ liệu vận hành.",
          "Gọi món QR đi xa hơn: khách chọn món, gửi order theo bàn, nhân viên xác nhận và bếp nhìn được trạng thái. Đây là lý do LogiVN nên dùng cụm nội dung này làm trụ cột SEO cho nhóm truy vấn có ý định triển khai."
        ]
      },
      {
        heading: "Nội dung nào nên đọc theo thứ tự?",
        body: [
          "Nếu chủ quán còn mới với QR, nên đọc bài menu QR trước để hiểu dữ liệu menu. Sau đó đọc bài order tại bàn không cần app để thấy luồng khách thực tế.",
          "Khi đã hiểu luồng, bài phần mềm gọi món QR và bài chi phí giúp đánh giá thời điểm triển khai, chọn gói và chuẩn bị đội ngũ trong tuần đầu."
        ]
      },
      {
        heading: "Vai trò của topic hub trong crawl efficiency",
        body: [
          "Topic hub giúp crawler đi từ một trang trụ cột tới các bài liên quan trong cùng cụm, thay vì chỉ dựa vào danh sách bài mới. Điều này giảm độ sâu crawl và làm rõ quan hệ chủ đề.",
          "Hub cũng là trang có thể cập nhật định kỳ khi LogiVN mở thêm bài về QR, topping, combo, in mã bàn hoặc tối ưu trải nghiệm gọi thêm món."
        ]
      }
    ],
    faq: [
      {
        question: "Gọi món QR khác gì menu QR?",
        answer:
          "Menu QR chủ yếu giúp khách xem menu. Gọi món QR cho phép khách chọn món, gửi order theo bàn và giúp nhân viên xử lý trạng thái realtime."
      },
      {
        question: "Quán nhỏ nên bắt đầu từ bài nào?",
        answer:
          "Nên bắt đầu từ bài menu QR và phần mềm gọi món QR cho quán cafe, sau đó mới đọc chi phí triển khai để chọn phạm vi phù hợp."
      }
    ]
  },
  {
    slug: "chuyen-doi-so-quan-cafe",
    title: "Chuyển đổi số quán cafe nhỏ: từ menu, đặt món online đến báo cáo doanh thu",
    description:
      "Topic hub cho chủ quán cafe nhỏ đang chuyển đổi số: quản lý menu, đặt món online, order trà sữa, báo cáo doanh thu và mở rộng theo từng giai đoạn.",
    excerpt:
      "Cụm chuyển đổi số giúp LogiVN xuất hiện ở các truy vấn vận hành rộng hơn QR ordering, đặc biệt với quán cafe và trà sữa nhỏ.",
    category: "Topic hub",
    topic: "Chuyển đổi số quán cafe",
    updatedAt: "2026-05-11",
    keywords: ["chuyển đổi số quán cafe", "phần mềm quản lý quán cafe nhỏ", "đặt món online", "báo cáo doanh thu quán cafe"],
    postSlugs: ["phan-mem-quan-ly-quan-cafe-nho", "dat-mon-online-cho-quan-cafe", "phan-mem-order-tra-sua", "bao-cao-doanh-thu-quan-cafe"],
    takeaways: [
      "Quán nhỏ nên chuyển đổi số theo từng lớp: menu, order, thanh toán, báo cáo.",
      "Đặt món online và pickup chỉ nên mở khi menu và trạng thái đơn đã đủ rõ.",
      "Báo cáo cuối ca là nơi chuyển dữ liệu order thành quyết định vận hành."
    ],
    sections: [
      {
        heading: "Không cần số hóa tất cả trong tuần đầu",
        body: [
          "Quán cafe nhỏ dễ bị quá tải nếu bật quá nhiều tính năng cùng lúc. Lộ trình hợp lý là chuẩn hóa menu, mở order tại bàn hoặc pickup ở phạm vi nhỏ, rồi mới nối thanh toán và báo cáo.",
          "Cách đi từng lớp giúp nhân viên quen thao tác, chủ quán đo được tác động thật và nội dung SEO của LogiVN bám sát bài toán vận hành thay vì nói chung chung."
        ]
      },
      {
        heading: "Từ cafe nhỏ đến trà sữa nhiều biến thể",
        body: [
          "Quán cafe nhỏ thường cần luồng gọn. Quán trà sữa lại cần xử lý size, đá, đường, topping và combo. Hai bối cảnh khác nhau nhưng cùng cần một dữ liệu menu sạch.",
          "Hub này nối hai nhóm nội dung để Google hiểu LogiVN không chỉ là QR menu, mà là nền tảng vận hành cho nhiều mô hình đồ uống Việt."
        ]
      },
      {
        heading: "Báo cáo là điểm neo cho quyết định",
        body: [
          "Sau khi order chạy ổn, báo cáo doanh thu, món bán chạy, nguồn đơn và ngoại lệ giúp chủ quán quyết định ca sau chuẩn bị gì. Đây là cầu nối tự nhiên từ nội dung hướng dẫn sang giá trị sản phẩm.",
          "Các bài trong hub nên tiếp tục liên kết về landing page và pricing bằng ngữ cảnh rõ, không ép CTA quá dày."
        ]
      }
    ],
    faq: [
      {
        question: "Quán cafe nhỏ nên chuyển đổi số phần nào trước?",
        answer:
          "Nên bắt đầu từ menu và order rõ trạng thái. Sau đó mới mở pickup, delivery, thanh toán hoặc báo cáo nâng cao."
      },
      {
        question: "Topic hub này có thay thế trang landing không?",
        answer:
          "Không. Hub trả lời sâu các câu hỏi tìm kiếm, còn landing page chuyển người đọc sang trải nghiệm sản phẩm và dùng thử."
      }
    ]
  },
  {
    slug: "van-hanh-nha-hang",
    title: "Vận hành nhà hàng: order realtime, VietQR, đặt bàn nhận cọc và đối soát cuối ca",
    description:
      "Topic hub về vận hành nhà hàng với LogiVN: quản lý order realtime, thanh toán VietQR, đặt bàn nhận cọc, giảm no-show và đối soát cuối ca.",
    excerpt:
      "Cụm vận hành nhà hàng mở rộng LogiVN khỏi quán cafe sang nhóm nhà hàng cần kiểm soát bàn, thanh toán, đặt chỗ và báo cáo rõ hơn.",
    category: "Topic hub",
    topic: "Vận hành nhà hàng",
    updatedAt: "2026-05-11",
    keywords: ["vận hành nhà hàng", "order realtime", "VietQR nhà hàng", "đặt bàn nhận cọc", "đối soát cuối ca"],
    postSlugs: ["quan-ly-order-realtime-gio-cao-diem", "thanh-toan-vietqr-cho-nha-hang", "dat-ban-nhan-coc-nha-hang", "doi-soat-vietqr-cuoi-ca"],
    takeaways: [
      "Nhà hàng cần trạng thái realtime để giảm nghẽn giữa bàn, bếp và thanh toán.",
      "VietQR và đặt bàn nhận cọc chỉ hiệu quả khi gắn với mã đơn hoặc mã đặt bàn.",
      "Đối soát cuối ca là bước bảo vệ dữ liệu doanh thu và trải nghiệm khách."
    ],
    sections: [
      {
        heading: "Nhà hàng cần nhìn trạng thái, không chỉ nhìn doanh thu",
        body: [
          "Trong giờ cao điểm, câu hỏi quan trọng là đơn nào đang chờ, bàn nào cần hỗ trợ, giao dịch nào chưa xác minh và đặt bàn nào cần giữ chỗ. Doanh thu cuối ngày chỉ là kết quả sau cùng.",
          "LogiVN có thể dùng hub này để gom các bài giải thích trạng thái vận hành, giúp Google hiểu sản phẩm xử lý cả order, thanh toán và đặt bàn."
        ]
      },
      {
        heading: "VietQR và đặt cọc cần gắn vào quy trình",
        body: [
          "VietQR quen thuộc với khách Việt, nhưng nếu giao dịch không gắn với order thì cuối ca vẫn rối. Đặt bàn nhận cọc cũng vậy: tiền cọc phải gắn với giờ, số khách, chính sách và trạng thái xác nhận.",
          "Khi hai luồng này nằm cùng hệ thống, nhà hàng giảm hỏi lại, giảm nhầm lẫn và dễ giải thích với khách hơn."
        ]
      },
      {
        heading: "Crawl path cho nhóm nhà hàng",
        body: [
          "Hub vận hành nhà hàng tạo một cửa vào riêng cho nhóm truy vấn nhà hàng, thay vì để mọi bài trộn trong một blog index. Từ đây crawler có thể đi tới order realtime, VietQR, đặt bàn và đối soát theo ngữ cảnh.",
          "Đây cũng là nền cho Week 4 nếu mở thêm landing theo ngành hàng hoặc theo nhu cầu như đặt bàn, thanh toán và báo cáo."
        ]
      }
    ],
    faq: [
      {
        question: "Nhà hàng nên ưu tiên order realtime hay đặt bàn trước?",
        answer:
          "Nếu nghẽn chính nằm trong giờ phục vụ, ưu tiên order realtime. Nếu mất doanh thu vì no-show hoặc bàn kín theo khung giờ, ưu tiên luồng đặt bàn và nhận cọc."
      },
      {
        question: "VietQR có đủ cho đối soát nhà hàng không?",
        answer:
          "VietQR là phương thức thanh toán, chưa đủ nếu không gắn với order, bàn, số tiền và trạng thái xác minh. Cần thêm báo cáo và checklist cuối ca."
      }
    ]
  }
];

type BlogArticleEnhancement = {
  slug: string;
  illustration: BlogIllustration;
  sections: BlogSection[];
};

const BLOG_ARTICLE_ENHANCEMENTS: BlogArticleEnhancement[] = [
  {
    slug: "phan-mem-goi-mon-qr-cho-quan-cafe",
    illustration: {
      title: "Phác hoạ luồng gọi món QR tại quán cafe",
      alt: "Sơ đồ khách quét QR, chọn món, gửi đơn về nhân viên và thanh toán VietQR trong quán cafe.",
      caption:
        "Minh hoạ cách LogiVN biến một mã QR trên bàn thành luồng vận hành có trạng thái, thay vì chỉ là một đường dẫn xem menu.",
      labels: ["Khách quét QR", "Menu dữ liệu", "Đơn về nhân viên", "VietQR và báo cáo"]
    },
    sections: [
      {
        heading: "Cấu trúc triển khai nên bắt đầu từ dữ liệu menu",
        body: [
          "Trước khi in QR cho toàn bộ bàn, quán nên kiểm tra lại dữ liệu menu như một dự án nhỏ. Tên món cần thống nhất, giá không mâu thuẫn, topping phải có lựa chọn rõ, món tạm hết cần có trạng thái để khách không gọi nhầm. Khi dữ liệu nền sạch, QR mới giúp giảm việc hỏi lại.",
          "Một cấu trúc tốt thường gồm danh mục, món chính, tuỳ chọn, ghi chú, ảnh vừa đủ nhẹ và trạng thái còn bán. Quán không nhất thiết phải đưa mọi món lên ngay ngày đầu. Bắt đầu bằng nhóm món bán chạy giúp nhân viên học quy trình nhanh hơn và giúp chủ quán đo tác động thật trước khi mở rộng."
        ]
      },
      {
        heading: "Checklist bảy ngày để không làm đội ngũ bị quá tải",
        body: [
          "Ngày đầu nên nhập menu và kiểm tra trên điện thoại thật. Ngày thứ hai in thử QR cho vài bàn đông khách. Ngày thứ ba cho nhân viên tập nhận đơn, xác nhận món và xử lý ghi chú đặc biệt. Ba ngày tiếp theo, quán theo dõi đơn bị sửa và món bị hỏi lại.",
          "Đến ngày thứ bảy, chủ quán nên nhìn lại ba con số đơn giản: số đơn đi qua QR, số lỗi giảm được và khung giờ nhân viên thấy nhẹ hơn. Nếu dữ liệu tích cực, mở rộng ra toàn bộ bàn. Nếu vẫn rối, quay lại chỉnh danh mục, mô tả món hoặc cách nhân viên xác nhận đơn."
        ]
      },
      {
        heading: "Những lỗi thường làm gọi món QR bị hiểu sai",
        body: [
          "Lỗi phổ biến nhất là coi QR như một poster kỹ thuật. Khách quét được nhưng menu khó đọc, món không có mô tả, giá thiếu tuỳ chọn và nhân viên không biết đơn vừa gửi nằm ở đâu. Khi đó trải nghiệm còn chậm hơn gọi trực tiếp vì khách phải tự đoán rồi vẫn cần nhân viên giải thích.",
          "Lỗi thứ hai là mở quá nhiều tính năng cùng lúc: đặt món tại bàn, đặt online, thanh toán và báo cáo nâng cao trong khi đội ngũ chưa quen. LogiVN nên được triển khai theo nhịp vận hành thật, chỉ bật lớp mới khi lớp trước đã rõ và tin cậy."
        ]
      }
    ]
  },
  {
    slug: "thanh-toan-vietqr-cho-nha-hang",
    illustration: {
      title: "Phác hoạ đối soát VietQR theo từng đơn",
      alt: "Sơ đồ đơn hàng gắn với mã VietQR, trạng thái xác minh, ngoại lệ và báo cáo cuối ca.",
      caption:
        "Minh hoạ cách thanh toán VietQR cần đi cùng mã đơn và trạng thái xác minh để cuối ca không phải đối chiếu thủ công bằng trí nhớ.",
      labels: ["Đơn có mã", "Khách quét VietQR", "Nhân viên xác minh", "Báo cáo cuối ca"]
    },
    sections: [
      {
        heading: "Thiết kế mã thanh toán theo ngữ cảnh đơn hàng",
        body: [
          "VietQR hiệu quả nhất khi mỗi lần thanh toán đều có ngữ cảnh rõ: mã đơn, bàn, tổng tiền, thời điểm tạo và người xác minh. Nếu quán chỉ dán một mã chuyển khoản chung ở quầy, nhân viên vẫn phải hỏi lại khách đã chuyển cho đơn nào, chuyển lúc nào và số tiền có khớp hay không.",
          "Với nhà hàng đông bàn, nên tách thanh toán thành trạng thái có thể kiểm tra. Một đơn có thể đang chờ khách chuyển, đã có tín hiệu thanh toán, đã được nhân viên xác minh hoặc cần xử lý ngoại lệ. Cách đặt tên trạng thái càng đơn giản, đội ngũ càng ít nhầm trong giờ cao điểm."
        ]
      },
      {
        heading: "Quy trình xác minh nên ngắn nhưng có bằng chứng",
        body: [
          "Nhân viên không cần một biểu mẫu dài để xác minh thanh toán. Họ cần thấy đúng đơn, đúng số tiền, phương thức VietQR và nút xác nhận rõ ràng. Nếu có sai lệch, hệ thống nên giữ đơn ở trạng thái cần kiểm tra thay vì cho qua như đơn đã thanh toán hoàn tất.",
          "Bằng chứng vận hành có thể rất nhỏ: ai xác minh, xác minh lúc nào, ghi chú ngoại lệ là gì. Những dữ liệu này giúp chủ quán tra lại khi khách hỏi, khi nhân viên đổi ca hoặc khi báo cáo cuối ngày lệch so với sao kê ngân hàng."
        ]
      },
      {
        heading: "Nội dung trên website nên nói thẳng vào nỗi lo đối soát",
        body: [
          "Chủ quán tìm VietQR thường không chỉ hỏi có thanh toán được không. Họ lo nhầm tiền, bỏ sót giao dịch, nhân viên xác minh thiếu hoặc cuối ca mất quá nhiều thời gian cộng lại. Vì vậy bài viết cần giải thích bằng tình huống thật thay vì chỉ nói tính năng thanh toán nhanh.",
          "Cách truyền thông tốt là nối VietQR với luồng gọi món, bảng quản lý đơn và báo cáo cuối ca. Khi người đọc thấy đường đi từ khách thanh toán đến chủ quán kiểm tra số liệu, họ hiểu vì sao phần mềm vận hành quan trọng hơn một mã QR chuyển khoản đơn lẻ."
        ]
      }
    ]
  },
  {
    slug: "quan-ly-order-realtime-gio-cao-diem",
    illustration: {
      title: "Phác hoạ bảng trạng thái giờ cao điểm",
      alt: "Sơ đồ bàn, bếp, thanh toán và báo cáo cùng đổ về một bảng trạng thái theo thời gian thực.",
      caption:
        "Minh hoạ cách một bảng quản lý tốt gom tín hiệu từ bàn, bếp và thanh toán để nhân viên biết việc tiếp theo cần làm.",
      labels: ["Bàn đang chờ", "Bếp đang xử lý", "Thanh toán cần xác minh", "Báo cáo ca"]
    },
    sections: [
      {
        heading: "Trạng thái phải đủ ít để nhân viên nhớ được",
        body: [
          "Một lỗi thường gặp của bảng quản lý theo thời gian thực là quá nhiều nhãn trạng thái. Khi ca đông, nhân viên không có thời gian phân biệt mười loại cảnh báo khác nhau. Tốt hơn là bắt đầu với vài trạng thái hành động: mới gọi, đang chuẩn bị, cần phục vụ, cần xác minh thanh toán và đã hoàn tất.",
          "Mỗi trạng thái nên gắn với một người hoặc một nhóm chịu trách nhiệm. Đơn mới thuộc nhân viên nhận đơn, món đang chuẩn bị thuộc bếp, thanh toán cần xác minh thuộc thu ngân hoặc quản lý ca. Khi trách nhiệm rõ, bảng quản lý không còn là nơi xem cho biết mà trở thành nhịp điều phối."
        ]
      },
      {
        heading: "Cần tách tín hiệu vận hành khỏi báo cáo sau ca",
        body: [
          "Trong giờ cao điểm, chủ quán cần tín hiệu ngắn để hành động ngay. Báo cáo doanh thu chi tiết nên để sau ca. Nếu trộn mọi số liệu vào cùng một màn hình, đội ngũ dễ bỏ lỡ việc quan trọng như bàn gọi thêm, đơn quá lâu hoặc khách đã chuyển khoản nhưng chưa được xác minh.",
          "Cấu trúc hợp lý là lớp trực ca hiển thị việc đang cần xử lý, còn lớp báo cáo ghi lại dữ liệu để xem sau. LogiVN nên giữ hai lớp này liên thông nhưng không làm chúng cạnh tranh sự chú ý của nhân viên trong thời điểm nhạy cảm nhất."
        ]
      },
      {
        heading: "Cách đo bảng quản lý có thật sự giúp quán nhanh hơn",
        body: [
          "Không nên đánh giá bảng theo thời gian cập nhật kỹ thuật đơn thuần. Hãy đo thời gian từ lúc khách gửi đơn đến lúc nhân viên xác nhận, số đơn bị hỏi lại, số thanh toán bị treo và số lần quản lý phải can thiệp thủ công. Đây là các tín hiệu phản ánh trải nghiệm thật.",
          "Sau một tuần, nếu số đơn treo giảm và nhân viên ít hỏi nhau hơn, bảng quản lý đang tạo giá trị. Nếu mọi người vẫn phải nhắn riêng để xác nhận, cần xem lại cách đặt trạng thái, thứ tự ưu tiên hoặc vị trí hiển thị cảnh báo."
        ]
      }
    ]
  },
  {
    slug: "menu-qr-la-gi",
    illustration: {
      title: "Phác hoạ menu QR dạng dữ liệu",
      alt: "Sơ đồ menu QR gồm danh mục, món, tuỳ chọn, trạng thái còn bán và đường đi sang giỏ hàng.",
      caption:
        "Minh hoạ sự khác nhau giữa một ảnh menu tĩnh và menu QR dạng dữ liệu có thể nối sang gọi món tại bàn.",
      labels: ["Danh mục", "Món và giá", "Topping", "Giỏ hàng"]
    },
    sections: [
      {
        heading: "Menu QR tốt phải dễ quét, dễ đọc và dễ sửa",
        body: [
          "Một menu QR tốt không chỉ là mã quét được. Sau khi mở trên điện thoại, khách cần nhìn thấy danh mục rõ, chữ đủ lớn, giá dễ hiểu và món bán chạy không bị chôn quá sâu. Nếu khách phải phóng to ảnh menu hoặc kéo qua lại liên tục, trải nghiệm đã thất bại trước khi bước gọi món bắt đầu.",
          "Khả năng sửa nhanh cũng rất quan trọng. Quán thay giá, ẩn món hết hàng hoặc thêm topping không nên phải in lại toàn bộ menu. Menu dạng dữ liệu giúp chủ quán chỉnh một lần và đồng bộ cho các bàn, trang đặt món online hoặc kênh chia sẻ khác."
        ]
      },
      {
        heading: "Ảnh món nên hỗ trợ quyết định, không làm trang chậm",
        body: [
          "Ảnh giúp khách chọn món nhanh hơn, nhưng ảnh quá nặng có thể làm menu tải chậm trên 4G yếu. Với quán cafe, nên ưu tiên ảnh đại diện cho nhóm món bán chạy, combo hoặc món mới thay vì cố chụp mọi món ngay từ đầu.",
          "Mỗi ảnh cần có tên món và mô tả đi cùng để khách không phụ thuộc hoàn toàn vào hình. Về mặt tìm kiếm và khả năng truy cập, mô tả văn bản vẫn là phần giúp người đọc, công cụ tìm kiếm và trợ lý thông minh hiểu nội dung chính xác hơn."
        ]
      },
      {
        heading: "Khi menu trở thành nền dữ liệu cho vận hành",
        body: [
          "Khi menu đã có cấu trúc, quán có thể nối thêm giỏ hàng, bàn, bếp, thanh toán và báo cáo. Lúc này menu không còn là tài liệu giới thiệu món mà trở thành dữ liệu vận hành. Một thay đổi nhỏ trong menu có thể ảnh hưởng trực tiếp đến đơn, nguyên liệu và doanh thu.",
          "Đây là lý do nên chuẩn hóa menu trước khi nói đến tự động hóa sâu hơn. Nếu dữ liệu món còn lộn xộn, mọi tính năng phía sau đều phải bù lỗi. Nếu dữ liệu sạch, LogiVN có thể mở rộng tự nhiên từ menu QR sang gọi món QR và thanh toán."
        ]
      }
    ]
  },
  {
    slug: "chi-phi-phan-mem-goi-mon-qr",
    illustration: {
      title: "Phác hoạ cách tính chi phí phần mềm gọi món QR",
      alt: "Sơ đồ năm nhóm chi phí gồm phí tháng, thiết lập menu, đào tạo, thiết bị và lỗi vận hành giảm được.",
      caption:
        "Minh hoạ cách chủ quán nên nhìn tổng chi phí triển khai thay vì chỉ so sánh phí thuê bao hằng tháng.",
      labels: ["Phí tháng", "Setup menu", "Đào tạo", "Lỗi giảm được"]
    },
    sections: [
      {
        heading: "Nên tính chi phí theo ca bán, không chỉ theo tháng",
        body: [
          "Một khoản phí hằng tháng nghe có vẻ cố định, nhưng giá trị của phần mềm lại xuất hiện theo từng ca bán. Nếu mỗi ca giảm được vài đơn sai, vài phút hỏi lại và một phần thời gian cộng sổ cuối ngày, khoản tiết kiệm thực tế có thể lớn hơn con số trên bảng giá.",
          "Cách tính thực tế là lấy phí phần mềm chia cho số ca vận hành trong tháng, rồi so với thời gian nhân viên tiết kiệm được ở mỗi ca. Chủ quán sẽ dễ quyết định hơn khi nhìn phần mềm như công cụ giảm ma sát vận hành, không chỉ là một khoản thuê bao."
        ]
      },
      {
        heading: "Chi phí ẩn thường nằm ở quy trình chưa rõ",
        body: [
          "Nhiều quán không mất tiền phần mềm nhưng mất tiền vì quy trình thủ công: nhân viên ghi sai món, khách chờ lâu, thanh toán nhầm, cuối ca cộng lại mất thời gian hoặc chủ quán không biết món nào nên đẩy mạnh. Đây là chi phí ẩn khó thấy nếu chỉ nhìn hoá đơn tháng.",
          "Phần mềm tốt cần làm các chi phí này hiện ra bằng số liệu. Khi biết đơn nào hay bị sửa, món nào bị chậm hoặc khung giờ nào cần thêm người, chủ quán có cơ sở để thay đổi. Đây là phần giá trị mà bảng giá nên giải thích rõ."
        ]
      },
      {
        heading: "Cách đọc bảng giá để chọn gói đúng giai đoạn",
        body: [
          "Quán mới nên chọn gói đủ để chạy menu, gọi món tại bàn và thanh toán cơ bản. Quán bắt đầu bán online nên ưu tiên trạng thái đơn, pickup, delivery và báo cáo nguồn đơn. Quán có nhiều chi nhánh hoặc nhiều điểm chạm mới cần báo cáo sâu và trợ lý thông minh.",
          "Điều quan trọng là không mua theo cảm giác nhiều tính năng hơn thì tốt hơn. Gói phù hợp là gói giải quyết điểm nghẽn hiện tại và có đường mở rộng khi quán tăng trưởng. Bài viết chi phí vì vậy nên dẫn người đọc sang bảng giá bằng tình huống vận hành cụ thể."
        ]
      }
    ]
  },
  {
    slug: "phan-mem-quan-ly-quan-cafe-nho",
    illustration: {
      title: "Phác hoạ lộ trình số hoá quán cafe nhỏ",
      alt: "Sơ đồ quán cafe nhỏ đi từ menu, đơn tại bàn, thanh toán đến báo cáo cuối ca.",
      caption:
        "Minh hoạ lộ trình triển khai từng lớp để quán nhỏ không bị quá tải khi bắt đầu dùng phần mềm quản lý.",
      labels: ["Menu gọn", "Đơn rõ trạng thái", "Thanh toán", "Báo cáo ca"]
    },
    sections: [
      {
        heading: "Quán nhỏ cần phần mềm biết tiết chế",
        body: [
          "Điểm khó của quán nhỏ không phải thiếu công cụ, mà là thiếu thời gian để học quá nhiều thao tác mới. Một phần mềm phù hợp nên che bớt độ phức tạp, chỉ đưa ra những việc cần làm trong ca: đơn mới, bàn cần phục vụ, món hết hàng và thanh toán cần xác minh.",
          "Nếu giao diện bắt nhân viên đi qua nhiều màn hình cho một thao tác đơn giản, quán nhỏ sẽ quay lại giấy bút rất nhanh. Vì vậy cấu trúc triển khai nên ưu tiên tốc độ thao tác và khả năng sửa lỗi hơn là danh sách tính năng dài."
        ]
      },
      {
        heading: "Nên chọn một điểm nghẽn để giải quyết trước",
        body: [
          "Trước khi mua hoặc bật phần mềm, chủ quán nên viết ra điểm nghẽn lớn nhất hiện tại. Nếu khách chờ gọi món, bắt đầu từ QR tại bàn. Nếu cuối ca lệch tiền, bắt đầu từ thanh toán và đối soát. Nếu không biết món nào bán tốt, bắt đầu từ báo cáo đơn giản.",
          "Cách chọn một điểm nghẽn giúp đội ngũ thấy lợi ích nhanh hơn. Khi nhân viên cảm nhận được ca bán nhẹ đi, họ sẽ dễ chấp nhận lớp tiếp theo như đặt món online, đặt bàn hoặc báo cáo chi tiết."
        ]
      },
      {
        heading: "Đừng để chuyển đổi số làm mất chất quán",
        body: [
          "Quán nhỏ thường sống nhờ cảm giác thân quen. Phần mềm không nên biến trải nghiệm thành lạnh lẽo hoặc bắt khách tự xử lý mọi thứ. QR và bảng quản lý nên giảm việc lặp lại để nhân viên có thêm thời gian chào hỏi, tư vấn món và chăm khách quen.",
          "Nội dung của LogiVN nên nhấn mạnh điểm cân bằng này. Chuyển đổi số không phải thay nhân viên bằng màn hình, mà là làm cho quy trình phía sau gọn hơn để trải nghiệm phía trước ấm hơn, nhanh hơn và ít sai hơn."
        ]
      }
    ]
  },
  {
    slug: "dat-mon-online-cho-quan-cafe",
    illustration: {
      title: "Phác hoạ luồng đặt món online cho quán cafe",
      alt: "Sơ đồ khách đặt online, quán nhận đơn, chuẩn bị pickup hoặc delivery và cập nhật trạng thái.",
      caption:
        "Minh hoạ cách đơn online nên được tách khỏi đơn tại bàn nhưng vẫn nằm trong cùng một hệ vận hành.",
      labels: ["Khách đặt trước", "Quán nhận đơn", "Pickup", "Delivery"]
    },
    sections: [
      {
        heading: "Đơn online cần lời hứa thời gian rõ ràng",
        body: [
          "Khi khách đặt online, họ không nhìn thấy nhịp quán như khi ngồi tại bàn. Vì vậy thời gian chuẩn bị, trạng thái xác nhận và cách nhận món phải rõ ngay từ đầu. Nếu quán hứa quá nhanh rồi trễ, trải nghiệm online sẽ làm hại uy tín của quán.",
          "Pickup thường dễ kiểm soát hơn vì khách chủ động đến lấy. Delivery cần thêm bán kính phục vụ, phí giao, thời gian bàn giao và chính sách khi tài xế đến muộn. Quán nên mở từng lớp để không làm bếp bị kéo khỏi khách đang ngồi tại chỗ."
        ]
      },
      {
        heading: "Menu online nên được biên tập như một kênh bán riêng",
        body: [
          "Một số món ngon tại quán nhưng không phù hợp để giao đi xa. Đồ uống dễ tách lớp, món cần dùng ngay hoặc combo cần trình bày đẹp nên được cân nhắc trước khi đưa lên kênh online. Menu online cần ưu tiên món giữ chất lượng tốt và thao tác đóng gói nhanh.",
          "Mô tả món cũng nên cụ thể hơn menu tại bàn. Khách online không có nhân viên đứng cạnh để giải thích mức ngọt, topping hay dị ứng. Càng ít mơ hồ, quán càng ít cuộc gọi xác nhận và càng dễ xử lý nhiều đơn cùng lúc."
        ]
      },
      {
        heading: "Cách đo kênh online có đáng mở rộng hay không",
        body: [
          "Sau một đến hai tuần, chủ quán nên xem số đơn online, tỷ lệ huỷ, món bán tốt, thời gian chuẩn bị và số lần khách phải hỏi lại. Nếu pickup có tín hiệu tốt nhưng delivery nhiều lỗi, có thể giữ pickup trước thay vì mở rộng vội.",
          "Kênh online nên bổ sung doanh thu mà không phá nhịp phục vụ tại quán. Nếu nhân viên phải bỏ khách tại bàn để xử lý đơn giao đi, cần tách trạng thái, phân công người nhận đơn hoặc giới hạn khung giờ nhận online."
        ]
      }
    ]
  },
  {
    slug: "doi-soat-vietqr-cuoi-ca",
    illustration: {
      title: "Phác hoạ checklist đối soát cuối ca",
      alt: "Sơ đồ kiểm tra đơn đã thanh toán, giao dịch lệch, tiền mặt và báo cáo ngoại lệ cuối ca.",
      caption:
        "Minh hoạ cách cuối ca nên đi theo checklist cố định để phát hiện giao dịch VietQR thiếu, dư hoặc chưa xác minh.",
      labels: ["Đơn hoàn tất", "VietQR khớp", "Ngoại lệ", "Khoá ca"]
    },
    sections: [
      {
        heading: "Checklist nên được viết cho người đang mệt cuối ca",
        body: [
          "Cuối ca là lúc nhân viên đã mệt, nên checklist càng phải ngắn và theo thứ tự quen thuộc. Không nên yêu cầu họ suy luận lại toàn bộ ca bán. Hãy đi từ số đơn, tổng tiền, phương thức thanh toán, giao dịch chưa xác minh và ngoại lệ cần bàn giao.",
          "Một checklist tốt giúp người mới cũng làm được, không phụ thuộc vào kinh nghiệm của một nhân viên lâu năm. Khi quy trình được chuẩn hóa, chủ quán giảm rủi ro mỗi khi đổi ca, đổi người hoặc mở thêm chi nhánh."
        ]
      },
      {
        heading: "Ngoại lệ cần được ghi lại ngay khi phát sinh",
        body: [
          "Nếu khách chuyển thiếu, chuyển dư, chuyển sai nội dung hoặc đổi món sau khi thanh toán, nhân viên nên ghi chú ngay trên đơn. Đợi đến cuối ca mới nhớ lại thường dẫn tới thiếu bằng chứng và mất thời gian hỏi nhau.",
          "Các ngoại lệ không cần quá dài, chỉ cần rõ chuyện gì xảy ra, ai xử lý và trạng thái cuối cùng. Dữ liệu này giúp báo cáo đáng tin hơn, đồng thời là căn cứ khi khách hoặc quản lý hỏi lại sau ca."
        ]
      },
      {
        heading: "Tự động hoá nên đi sau thói quen kiểm tra đúng",
        body: [
          "Nhiều quán muốn tự động hóa ngay, nhưng nếu thói quen xác minh chưa rõ thì tự động hóa chỉ làm sai nhanh hơn. Giai đoạn đầu nên dùng danh sách đơn và trạng thái thanh toán để tạo kỷ luật đối soát trước.",
          "Khi dữ liệu đủ đều, LogiVN có thể giúp rút ngắn thời gian bằng báo cáo cuối ca, lọc ngoại lệ và nhóm giao dịch theo nguồn đơn. Lúc đó tự động hóa dựa trên quy trình thật, không phải trên giả định."
        ]
      }
    ]
  },
  {
    slug: "order-tai-ban-khong-can-app",
    illustration: {
      title: "Phác hoạ gọi món tại bàn không cần app",
      alt: "Sơ đồ khách quét QR tại bàn, dùng trình duyệt, gửi đơn và gọi thêm món mà không tải app.",
      caption:
        "Minh hoạ trải nghiệm khách chỉ cần quét QR bằng điện thoại, thao tác trên trình duyệt và vẫn giữ được ngữ cảnh bàn.",
      labels: ["Quét tại bàn", "Không tải app", "Gửi đơn", "Gọi thêm"]
    },
    sections: [
      {
        heading: "Trải nghiệm đầu tiên phải nhẹ như mở một trang web",
        body: [
          "Khách ngồi xuống thường muốn xem món ngay. Nếu hệ thống yêu cầu tải app, tạo tài khoản hoặc nhập quá nhiều thông tin trước khi gọi món, quán đã đặt rào cản vào đúng thời điểm khách đang có nhu cầu cao nhất.",
          "Luồng không cần app nên mở nhanh, nhận biết bàn tự động từ QR và cho phép khách chọn món trong vài thao tác đầu tiên. Những bước như lưu lịch sử, nhận ưu đãi hoặc tạo tài khoản chỉ nên xuất hiện sau khi khách đã hoàn tất nhu cầu chính."
        ]
      },
      {
        heading: "Nhân viên vẫn giữ vai trò kiểm soát trải nghiệm",
        body: [
          "Gọi món tại bàn không có nghĩa là bỏ mặc khách với điện thoại. Nhân viên vẫn cần thấy đơn mới, xác nhận món, xử lý ghi chú đặc biệt và hỗ trợ khách lớn tuổi hoặc khách đi theo nhóm. Công nghệ nên giảm thao tác lặp lại, không thay thế sự quan sát của đội ngũ.",
          "Một quy trình tốt cho phép khách tự gọi khi họ muốn nhanh, đồng thời vẫn có nút gọi phục vụ hoặc cách nhờ nhân viên can thiệp. Sự linh hoạt này phù hợp với quán Việt, nơi trải nghiệm thân thiện vẫn là lợi thế cạnh tranh."
        ]
      },
      {
        heading: "Khi gọi thêm món trở thành tín hiệu doanh thu",
        body: [
          "Một lợi ích hay bị bỏ qua của QR tại bàn là gọi thêm món. Khi khách không phải chờ nhân viên quay lại, họ dễ gọi thêm nước, topping hoặc món tráng miệng đúng lúc. Nếu hệ thống ghi nhận được hành vi này, chủ quán có thêm dữ liệu để thiết kế combo.",
          "Bài viết này nên nhấn vào điểm không cần app vì đó là nỗi lo phổ biến của khách và chủ quán. Nhưng phần sâu hơn là vận hành: QR phải giữ ngữ cảnh bàn, đơn, nhân viên và thanh toán để tạo giá trị thật."
        ]
      }
    ]
  },
  {
    slug: "phan-mem-order-tra-sua",
    illustration: {
      title: "Phác hoạ menu trà sữa nhiều biến thể",
      alt: "Sơ đồ ly trà sữa gồm size, đường, đá, topping, combo và trạng thái chuẩn bị trong giờ cao điểm.",
      caption:
        "Minh hoạ vì sao quán trà sữa cần menu dữ liệu rõ cho từng tuỳ chọn, không chỉ một danh sách món đơn giản.",
      labels: ["Size", "Đường đá", "Topping", "Combo"]
    },
    sections: [
      {
        heading: "Biến thể món phải được thiết kế trước khi lên QR",
        body: [
          "Trà sữa là ngành hàng có nhiều tuỳ chọn nhỏ nhưng ảnh hưởng trực tiếp đến giá và tốc độ pha chế. Nếu size, đường, đá và topping chỉ nằm trong ghi chú tự do, nhân viên phải đọc lại từng đơn và rất dễ bỏ sót khi đơn dồn.",
          "Cách tốt hơn là biến mỗi tuỳ chọn thành dữ liệu có cấu trúc. Khách chọn bằng nút rõ ràng, hệ thống tính giá tự động và bếp pha chế nhìn thấy thông tin theo cùng một thứ tự. Điều này giúp giảm lỗi mà không làm khách mất quyền cá nhân hoá."
        ]
      },
      {
        heading: "Combo cần được đo bằng tốc độ chuẩn bị",
        body: [
          "Combo không chỉ là ghép món để tăng giá trị đơn. Với quán trà sữa, combo tốt còn phải dễ chuẩn bị trong giờ cao điểm. Nếu combo bán chạy nhưng làm chậm quầy pha chế, lợi ích doanh thu có thể bị triệt tiêu bởi thời gian chờ và đơn tồn.",
          "Báo cáo nên cho chủ quán thấy combo nào bán tốt, topping nào hay đi cùng nhau và khung giờ nào cần chuẩn bị nguyên liệu trước. Khi dữ liệu đủ rõ, quán có thể tạo combo vừa hấp dẫn khách vừa hợp sức vận hành."
        ]
      },
      {
        heading: "Tách dòng đơn để tránh nghẽn quầy pha chế",
        body: [
          "Đơn tại quán, pickup và delivery có nhịp khác nhau. Nếu tất cả cùng rơi vào một danh sách không ưu tiên, nhân viên dễ làm đơn giao đi trước khách đang chờ tại quán hoặc ngược lại. Trạng thái nguồn đơn giúp quầy pha chế ra quyết định nhanh hơn.",
          "LogiVN nên giải thích điều này bằng ví dụ trà sữa vì người đọc dễ hình dung: vài tuỳ chọn nhỏ có thể nhân lên thành nhiều biến thể. Phần mềm tốt phải làm phức tạp trở nên có trật tự, không đẩy gánh nặng đó sang nhân viên."
        ]
      }
    ]
  },
  {
    slug: "dat-ban-nhan-coc-nha-hang",
    illustration: {
      title: "Phác hoạ luồng đặt bàn nhận cọc",
      alt: "Sơ đồ khách chọn giờ, giữ bàn, thanh toán cọc VietQR, nhà hàng xác nhận và xử lý no-show.",
      caption:
        "Minh hoạ cách nhận cọc cần đi cùng thời gian giữ bàn, trạng thái xác nhận và chính sách hoàn huỷ rõ ràng.",
      labels: ["Chọn giờ", "Giữ bàn", "Cọc VietQR", "Xác nhận"]
    },
    sections: [
      {
        heading: "Nhận cọc chỉ nên dùng khi có lý do rõ với khách",
        body: [
          "Khách sẽ chấp nhận đặt cọc dễ hơn khi họ hiểu vì sao nhà hàng cần điều đó: bàn giới hạn, nguyên liệu chuẩn bị trước, phòng riêng hoặc khung giờ rất đông. Nếu chỉ yêu cầu cọc mà không giải thích, trải nghiệm đặt bàn có thể trở nên nặng nề.",
          "Nội dung trên website và trong luồng đặt bàn nên nói ngắn gọn về số tiền cọc, thời gian giữ bàn, điều kiện hoàn hủy và cách liên hệ khi cần đổi lịch. Minh bạch từ đầu giúp giảm tranh cãi và tăng tỷ lệ hoàn tất đặt chỗ."
        ]
      },
      {
        heading: "Trạng thái đặt bàn cần chống trùng và chống quên",
        body: [
          "Một đặt bàn nhận cọc không thể chỉ là một dòng ghi chú. Hệ thống cần biết khung giờ, số khách, khu vực bàn, trạng thái cọc và thời gian hết hạn giữ chỗ. Nếu khách chưa cọc sau thời gian quy định, bàn cần được trả lại cho lịch trống.",
          "Nhà hàng cũng cần cảnh báo trước giờ khách đến, đặc biệt với bàn lớn. Khi trạng thái rõ, nhân viên không phải hỏi lại trong nhóm chat và quản lý ca biết đặt chỗ nào đã chắc, đặt chỗ nào còn rủi ro."
        ]
      },
      {
        heading: "Báo cáo đặt bàn giúp cải thiện chính sách",
        body: [
          "Sau vài tuần, chủ nhà hàng nên xem tỷ lệ khách đặt nhưng không đến, tỷ lệ đặt có cọc hoàn tất, khung giờ hay bị huỷ và số bàn bị giữ quá lâu. Những dữ liệu này giúp điều chỉnh mức cọc hoặc thời gian giữ bàn hợp lý hơn.",
          "Nếu no-show thấp, có thể giảm độ nặng của chính sách để trải nghiệm nhẹ hơn. Nếu no-show cao ở khung giờ vàng, nhận cọc và xác nhận tự động là lớp bảo vệ doanh thu. Bài viết cần cho thấy đây là quyết định vận hành, không chỉ là tính năng thanh toán."
        ]
      }
    ]
  },
  {
    slug: "bao-cao-doanh-thu-quan-cafe",
    illustration: {
      title: "Phác hoạ báo cáo doanh thu cuối ca",
      alt: "Sơ đồ doanh thu theo nguồn đơn, món bán chạy, phương thức thanh toán và ngoại lệ cần xử lý.",
      caption:
        "Minh hoạ một báo cáo cuối ca tập trung vào quyết định ngày mai, không phải chỉ gom thật nhiều biểu đồ.",
      labels: ["Doanh thu", "Nguồn đơn", "Món bán chạy", "Ngoại lệ"]
    },
    sections: [
      {
        heading: "Báo cáo tốt bắt đầu bằng câu hỏi của chủ quán",
        body: [
          "Trước khi xem biểu đồ, chủ quán thường có vài câu hỏi rất thực tế: hôm nay bán được bao nhiêu, món nào kéo doanh thu, tiền đã khớp chưa, khung giờ nào quá tải và ngày mai cần chuẩn bị gì. Báo cáo nên trả lời những câu hỏi này trước.",
          "Nếu báo cáo mở đầu bằng quá nhiều chỉ số kỹ thuật, người dùng dễ bỏ qua. Một cấu trúc tốt đi từ tổng quan đến ngoại lệ: doanh thu và số đơn, nguồn đơn, phương thức thanh toán, món nổi bật, cuối cùng là việc cần xử lý."
        ]
      },
      {
        heading: "Món bán chạy cần đọc cùng biên lợi nhuận và khả năng phục vụ",
        body: [
          "Một món bán chạy chưa chắc là món nên đẩy mạnh nếu biên lợi nhuận thấp hoặc làm chậm quầy pha chế. Chủ quán nên đọc món bán chạy cùng nguyên liệu, thời gian chuẩn bị, tỷ lệ gọi thêm và khả năng tạo combo.",
          "Ví dụ, một đồ uống có lượng bán vừa phải nhưng thường đi kèm topping hoặc bánh ngọt có thể đáng ưu tiên hơn món bán nhiều nhưng ít lợi nhuận. Báo cáo tốt giúp chủ quán nhìn doanh thu như một hệ quyết định, không chỉ bảng xếp hạng món."
        ]
      },
      {
        heading: "Báo cáo nên tạo ra hành động cho ca sau",
        body: [
          "Cuối mỗi ca, báo cáo nên kết thúc bằng vài hành động rõ: chuẩn bị thêm nguyên liệu nào, điều chỉnh nhân sự khung giờ nào, kiểm tra giao dịch nào và thử combo nào. Nếu không có hành động, báo cáo chỉ là tài liệu lưu trữ.",
          "LogiVN có thể dùng nội dung báo cáo để kết nối toàn bộ câu chuyện sản phẩm. Gọi món QR tạo dữ liệu, VietQR làm rõ thanh toán, đối soát bảo vệ số liệu và báo cáo biến dữ liệu thành quyết định vận hành cho ngày tiếp theo."
        ]
      }
    ]
  }
];

function getBlogArticleEnhancement(slug: string) {
  return BLOG_ARTICLE_ENHANCEMENTS.find((entry) => entry.slug === slug);
}

const PUBLIC_BLOG_COPY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/AI citation readiness/gi, "khả năng tham khảo rõ ràng"],
  [/AI OCR menu/gi, "nhập menu nhanh từ ảnh"],
  [/AI hỗ trợ vận hành/gi, "trợ lý thông minh hỗ trợ vận hành"],
  [/\bAI\b/gi, "trợ lý thông minh"],
  [/\bOCR\b/gi, "nhập từ ảnh"],
  [/QR ordering/gi, "gọi món QR"],
  [/online ordering/gi, "đặt món online"],
  [/order realtime/gi, "đơn theo thời gian thực"],
  [/order online/gi, "đặt món online"],
  [/order tại bàn/gi, "gọi món tại bàn"],
  [/quản lý order/gi, "quản lý đơn"],
  [/nhận order/gi, "nhận đơn"],
  [/gửi order/gi, "gửi đơn"],
  [/order/g, "đơn"],
  [/Order/g, "Đơn"],
  [/Realtime operations/gi, "Vận hành theo thời gian thực"],
  [/realtime/gi, "theo thời gian thực"],
  [/dashboard/gi, "bảng quản lý"],
  [/operating layer/gi, "lớp vận hành số"],
  [/entitlement/gi, "nhóm tính năng"],
  [/SaaS/gi, "phần mềm"],
  [/trial/gi, "dùng thử"],
  [/Landing page/gi, "Trang giới thiệu"],
  [/landing page/gi, "trang giới thiệu"],
  [/Pricing page/gi, "Trang bảng giá"],
  [/pricing page/gi, "trang bảng giá"],
  [/pricing/gi, "bảng giá"],
  [/SEO content/gi, "nội dung tư vấn"],
  [/SEO/gi, "tìm kiếm"],
  [/Google/gi, "người đọc"],
  [/brand query/gi, "nhóm tìm kiếm theo vấn đề"],
  [/internal link/gi, "đường dẫn liên quan"],
  [/metadata/gi, "nội dung"],
  [/topical authority/gi, "độ đầy đủ chủ đề"],
  [/topic cluster/gi, "nhóm chủ đề"],
  [/topic hub/gi, "nhóm bài viết"],
  [/Topic hub/gi, "Nhóm bài viết"],
  [/hub/g, "nhóm bài viết"],
  [/Hub/g, "Nhóm bài viết"],
  [/crawl efficiency/gi, "mạch đọc"],
  [/crawl path/gi, "mạch đọc"],
  [/crawl depth/gi, "mạch đọc"],
  [/crawler/gi, "người đọc"],
  [/crawl/gi, "đọc"],
  [/Week 4/gi, "giai đoạn mở rộng"],
  [/Week 3/gi, "giai đoạn nội dung"],
  [/CTA/gi, "lời mời hành động"]
];

function sanitizePublicBlogCopy(value: string) {
  return PUBLIC_BLOG_COPY_REPLACEMENTS.reduce((copy, [pattern, replacement]) => copy.replace(pattern, replacement), value)
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeBlogSection(section: BlogSection): BlogSection {
  return {
    heading: sanitizePublicBlogCopy(section.heading),
    body: section.body.map(sanitizePublicBlogCopy)
  };
}

function sanitizeBlogFaqItem(item: BlogFaqItem): BlogFaqItem {
  return {
    question: sanitizePublicBlogCopy(item.question),
    answer: sanitizePublicBlogCopy(item.answer)
  };
}

function sanitizeBlogIllustration(illustration: BlogIllustration): BlogIllustration {
  return {
    title: sanitizePublicBlogCopy(illustration.title),
    alt: sanitizePublicBlogCopy(illustration.alt),
    caption: sanitizePublicBlogCopy(illustration.caption),
    labels: illustration.labels.map(sanitizePublicBlogCopy) as BlogIllustration["labels"]
  };
}

function countWords(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function countBlogPostWords(post: BlogPost) {
  return countWords(
    [
      post.title,
      post.description,
      post.excerpt,
      post.takeaways.join(" "),
      post.illustration ? [post.illustration.title, post.illustration.alt, post.illustration.caption, ...post.illustration.labels].join(" ") : "",
      post.sections.flatMap((section) => [section.heading, ...section.body]).join(" "),
      post.faq.flatMap((item) => [item.question, item.answer]).join(" ")
    ].join(" ")
  );
}

function sanitizeBlogPost(post: BlogPost): BlogPost {
  const enhancement = getBlogArticleEnhancement(post.slug);
  const sections = [...post.sections, ...(enhancement?.sections ?? [])].map(sanitizeBlogSection);
  const illustration = enhancement?.illustration ? sanitizeBlogIllustration(enhancement.illustration) : undefined;
  const sanitizedPost = {
    ...post,
    title: sanitizePublicBlogCopy(post.title),
    description: sanitizePublicBlogCopy(post.description),
    excerpt: sanitizePublicBlogCopy(post.excerpt),
    category: sanitizePublicBlogCopy(post.category),
    topic: sanitizePublicBlogCopy(post.topic),
    keywords: post.keywords.map(sanitizePublicBlogCopy),
    takeaways: post.takeaways.map(sanitizePublicBlogCopy),
    illustration,
    sections,
    faq: post.faq.map(sanitizeBlogFaqItem)
  };

  const wordCount = countBlogPostWords(sanitizedPost);
  return {
    ...sanitizedPost,
    readingTimeMinutes: Math.max(post.readingTimeMinutes, Math.ceil(wordCount / 130)),
    wordCount
  };
}

function sanitizeBlogTopicHub(hub: BlogTopicHub): BlogTopicHub {
  return {
    ...hub,
    title: sanitizePublicBlogCopy(hub.title),
    description: sanitizePublicBlogCopy(hub.description),
    excerpt: sanitizePublicBlogCopy(hub.excerpt),
    category: sanitizePublicBlogCopy(hub.category),
    topic: sanitizePublicBlogCopy(hub.topic),
    keywords: hub.keywords.map(sanitizePublicBlogCopy),
    takeaways: hub.takeaways.map(sanitizePublicBlogCopy),
    sections: hub.sections.map(sanitizeBlogSection),
    faq: hub.faq.map(sanitizeBlogFaqItem)
  };
}

export function getAllBlogPosts() {
  return [...BLOG_POSTS].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt)).map(sanitizeBlogPost);
}

export function getBlogPost(slug: string) {
  const post = BLOG_POSTS.find((entry) => entry.slug === slug);
  return post ? sanitizeBlogPost(post) : null;
}

export function getRelatedBlogPosts(post: BlogPost) {
  return post.relatedSlugs.map((slug) => getBlogPost(slug)).filter((relatedPost): relatedPost is BlogPost => Boolean(relatedPost));
}

export function getBlogCategories() {
  return Array.from(new Set(getAllBlogPosts().map((post) => post.category)));
}

export function getBlogTopicClusters() {
  return getBlogCategories().map((category) => {
    const posts = getAllBlogPosts().filter((post) => post.category === category);
    return {
      category,
      posts,
      primaryPost: posts[0],
      count: posts.length
    };
  });
}

export function getBlogPath(slug: string) {
  return `/blog/${slug}`;
}

export function getAllBlogTopicHubs() {
  return [...BLOG_TOPIC_HUBS].map(sanitizeBlogTopicHub);
}

export function getBlogTopicHub(slug: string) {
  const hub = BLOG_TOPIC_HUBS.find((entry) => entry.slug === slug);
  return hub ? sanitizeBlogTopicHub(hub) : null;
}

export function getBlogTopicHubPath(slug: string) {
  return `/blog/${slug}`;
}

export function getBlogPostsForTopicHub(hub: BlogTopicHub) {
  return hub.postSlugs.map((slug) => getBlogPost(slug)).filter((post): post is BlogPost => Boolean(post));
}
