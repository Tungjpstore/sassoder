import { SEO_INTENT_PAGE_EXPANSIONS } from "@/lib/seo/intent-page-expansions";
import { sanitizePublicMarketingCopy } from "@/lib/seo/public-copy";

export type SeoIntentFaqItem = {
  question: string;
  answer: string;
};

export type SeoIntentSection = {
  eyebrow: string;
  heading: string;
  body: string[];
  bullets: string[];
};

export type SeoIntentPage = {
  slug: string;
  path: string;
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
  takeaways: string[];
  proofPoints: Array<{ label: string; value: string }>;
  sketch: {
    title: string;
    alt: string;
    caption: string;
    labels: [string, string, string, string];
  };
  sections: SeoIntentSection[];
  faq: SeoIntentFaqItem[];
  relatedBlogSlugs: string[];
  relatedHubSlugs: string[];
  cta: {
    primaryLabel: string;
    primaryPath: string;
    secondaryLabel: string;
    secondaryPath: string;
  };
};

export const SEO_INTENT_PAGES: SeoIntentPage[] = [
  {
    slug: "goi-mon-qr-cho-quan-cafe",
    path: "/giai-phap/goi-mon-qr-cho-quan-cafe",
    title: "Gọi món QR cho quán cafe: order tại bàn",
    description:
      "Giải pháp gọi món QR cho quán cafe: menu số, order tại bàn, trạng thái realtime, thanh toán rõ ràng và lộ trình triển khai gọn với LogiVN.",
    eyebrow: "Giải pháp cho quán cafe",
    h1: "Gọi món QR cho quán cafe mà không làm đội ngũ bị rối",
    summary:
      "Trang này dành cho chủ quán cafe muốn chuyển từ menu giấy và ghi order thủ công sang luồng QR tại bàn có trạng thái rõ, dễ đào tạo nhân viên và dễ đo hiệu quả sau từng ca.",
    updatedAt: "2026-05-12",
    priority: 0.76,
    changeFrequency: "weekly",
    keywords: ["gọi món QR cho quán cafe", "phần mềm gọi món QR", "menu QR", "order tại bàn", "LogiVN"],
    targetQueries: ["phần mềm gọi món QR cho quán cafe", "gọi món bằng QR cho quán cafe", "menu QR order tại bàn"],
    takeaways: [
      "QR chỉ hiệu quả khi đơn về đúng bàn, đúng trạng thái và đúng người xử lý.",
      "Quán cafe nên bắt đầu từ menu, nhóm món, topping và luồng xác nhận đơn trước khi mở rộng thanh toán.",
      "LogiVN giúp kết nối khách, nhân viên và chủ quán trong cùng một nhịp vận hành."
    ],
    proofPoints: [
      { label: "Điểm nghẽn", value: "giờ cao điểm" },
      { label: "Luồng chính", value: "quét QR -> gửi đơn -> xác nhận" },
      { label: "Theo dõi", value: "trạng thái realtime" }
    ],
    sketch: {
      title: "Luồng gọi món QR tại bàn",
      alt: "Sơ đồ phác họa khách quét QR, chọn món, đơn về nhân viên và chủ quán xem báo cáo.",
      caption: "Mô hình phù hợp cho quán cafe cần giảm chờ, giảm hỏi lại và gom dữ liệu order về một nơi.",
      labels: ["QR bàn", "Menu", "Đơn", "Báo cáo"]
    },
    sections: [
      {
        eyebrow: "Bài toán",
        heading: "Khi quán đông, vấn đề không chỉ là thiếu người nhận order",
        body: [
          "Nhiều quán cafe bắt đầu nghĩ đến QR khi khách phải chờ lâu hoặc nhân viên đi vòng quá nhiều lần giữa bàn, quầy và bếp. Nếu chỉ đặt một mã QR dẫn tới ảnh menu, quán vẫn phải ghi lại đơn bằng tay và vẫn dễ sai ở bước xác nhận.",
          "Điểm cần tối ưu là luồng vận hành phía sau mã QR. Khách cần xem menu rõ, chọn món nhanh, nhân viên cần biết bàn nào vừa gửi đơn, còn chủ quán cần nhìn được món bán chạy và khung giờ nghẽn để điều chỉnh ca sau."
        ],
        bullets: ["Giảm lượt hỏi lại món và topping.", "Giữ đơn theo bàn thay vì theo tin nhắn rời.", "Tạo dữ liệu bán hàng có thể xem lại."]
      },
      {
        eyebrow: "Triển khai",
        heading: "Bắt đầu bằng menu sạch trước khi mở rộng tính năng",
        body: [
          "Tuần đầu nên tập trung chuẩn hóa danh mục, tên món, giá, topping và trạng thái còn bán. Khi dữ liệu menu sạch, QR ordering mới giúp thay đổi một lần và đồng bộ ngay cho mọi bàn.",
          "Sau đó quán mở order tại bàn, thiết lập bước xác nhận đơn và huấn luyện nhân viên xử lý trạng thái. Cách đi này ít rủi ro hơn việc bật đồng thời quá nhiều kênh bán."
        ],
        bullets: ["Chuẩn hóa menu và topping.", "In QR theo bàn hoặc khu vực.", "Theo dõi đơn mới bằng dashboard realtime."]
      },
      {
        eyebrow: "SEO intent",
        heading: "Trang giải pháp nối từ bài blog sang nhu cầu mua thật",
        body: [
          "Các bài blog giải thích khái niệm menu QR, order tại bàn và chi phí triển khai. Trang giải pháp này đóng vai trò cầu nối cho người đã hiểu vấn đề và đang tìm một phần mềm phù hợp để thử.",
          "Vì vậy nội dung không lặp lại blog, mà tập trung vào tình huống quyết định: quán có nên triển khai chưa, chuẩn bị gì trước và LogiVN giúp giảm rủi ro vận hành như thế nào."
        ],
        bullets: ["Anchor rõ cho truy vấn thương mại.", "Liên kết ngược về topic hub gọi món QR.", "Có FAQ để phục vụ answer engine."]
      },
      {
        eyebrow: "Kết quả",
        heading: "Dấu hiệu cần đo sau khi chạy thử",
        body: [
          "Sau vài ngày, quán nên đo thời gian khách gửi đơn, tỷ lệ đơn cần nhân viên hỏi lại, số món bị hết nhưng chưa cập nhật và doanh thu theo khung giờ. Đây là dữ liệu thực tế hơn cảm nhận chung.",
          "Nếu các chỉ số này tốt lên, quán có thể mở thêm thanh toán VietQR, đặt món online hoặc báo cáo nâng cao mà không làm đội ngũ bị quá tải."
        ],
        bullets: ["Thời gian nhận đơn ngắn hơn.", "Ít sai sót ở topping và ghi chú.", "Chủ quán có dữ liệu cuối ca rõ hơn."]
      }
    ],
    faq: [
      {
        question: "Quán cafe nhỏ có cần gọi món QR không?",
        answer:
          "Nếu quán thường đông theo khung giờ, nhân viên phải hỏi lại món hoặc chủ quán muốn đo dữ liệu bán hàng rõ hơn, gọi món QR là bước đáng thử."
      },
      {
        question: "Gọi món QR có thay thế hoàn toàn nhân viên không?",
        answer:
          "Không. QR giúp khách chủ động gửi đơn, còn nhân viên vẫn xác nhận, phục vụ và xử lý ngoại lệ. Mục tiêu là giảm thao tác lặp lại, không bỏ vai trò phục vụ."
      },
      {
        question: "Nên xem trang nào tiếp theo?",
        answer: "Nên đọc topic hub gọi món QR, bài menu QR là gì và trang bảng giá để chọn phạm vi triển khai phù hợp."
      }
    ],
    relatedBlogSlugs: ["phan-mem-goi-mon-qr-cho-quan-cafe", "menu-qr-la-gi", "order-tai-ban-khong-can-app"],
    relatedHubSlugs: ["goi-mon-qr"],
    cta: {
      primaryLabel: "Xem bảng giá gọi món QR",
      primaryPath: "/pricing",
      secondaryLabel: "Đọc hub gọi món QR",
      secondaryPath: "/blog/goi-mon-qr"
    }
  },
  {
    slug: "thanh-toan-vietqr-cho-nha-hang",
    path: "/giai-phap/thanh-toan-vietqr-cho-nha-hang",
    title: "Thanh toán VietQR cho nhà hàng: đối soát",
    description:
      "Tối ưu thanh toán VietQR cho nhà hàng với quy trình nhận đơn, xác nhận thanh toán, đối soát cuối ca và giảm sai lệch vận hành bằng LogiVN.",
    eyebrow: "Giải pháp thanh toán",
    h1: "Thanh toán VietQR cho nhà hàng cần rõ từ bàn đến cuối ca",
    summary:
      "Trang này tập trung vào bài toán nhà hàng đã có đơn, bàn và nhân viên phục vụ, nhưng muốn thanh toán chuyển khoản gọn hơn mà vẫn kiểm soát được trạng thái và đối soát.",
    updatedAt: "2026-05-12",
    priority: 0.74,
    changeFrequency: "weekly",
    keywords: ["thanh toán VietQR nhà hàng", "đối soát VietQR", "QR payment", "phần mềm nhà hàng", "LogiVN"],
    targetQueries: ["thanh toán VietQR cho nhà hàng", "đối soát VietQR cuối ca", "phần mềm thanh toán QR nhà hàng"],
    takeaways: [
      "VietQR nên nằm trong cùng luồng đơn, bàn và hóa đơn thay vì tách thành ảnh chuyển khoản rời.",
      "Đối soát cuối ca cần gắn thanh toán với đơn cụ thể để tránh nhầm bàn hoặc nhầm số tiền.",
      "LogiVN giúp nhà hàng giữ trải nghiệm thanh toán quen thuộc nhưng có trạng thái vận hành rõ hơn."
    ],
    proofPoints: [
      { label: "Tình huống", value: "khách muốn chuyển khoản" },
      { label: "Rủi ro", value: "nhầm bàn hoặc thiếu đối soát" },
      { label: "Mục tiêu", value: "thanh toán gọn, kiểm tra rõ" }
    ],
    sketch: {
      title: "Luồng VietQR gắn với đơn",
      alt: "Sơ đồ phác họa hóa đơn, mã VietQR, xác nhận thanh toán và đối soát cuối ca.",
      caption: "VietQR hiệu quả nhất khi mã thanh toán gắn với đơn và được kiểm tra trong cùng nhịp vận hành.",
      labels: ["Hóa đơn", "VietQR", "Xác nhận", "Đối soát"]
    },
    sections: [
      {
        eyebrow: "Bài toán",
        heading: "Chuyển khoản dễ nhận nhưng khó kiểm nếu nằm ngoài hệ thống",
        body: [
          "Khách Việt quen thanh toán bằng chuyển khoản, nhưng nhà hàng dễ gặp cảnh nhân viên phải kiểm tra ảnh giao dịch, hỏi lại số tiền hoặc đối chiếu tin nhắn ngân hàng sau giờ cao điểm.",
          "Nếu VietQR chỉ là một mã tĩnh đặt ở quầy, quán vẫn thiếu mối liên hệ giữa thanh toán, bàn, đơn và nhân viên xác nhận. Đó là lý do thanh toán cần được xem như một phần của quy trình vận hành."
        ],
        bullets: ["Gắn thanh toán với hóa đơn cụ thể.", "Giảm nhầm lẫn giữa các bàn.", "Có dấu vết đối soát cuối ca."]
      },
      {
        eyebrow: "Quy trình",
        heading: "Từ gọi món đến thanh toán phải cùng một mạch dữ liệu",
        body: [
          "Một luồng tốt bắt đầu từ đơn đã được xác nhận, hóa đơn được tổng hợp rõ và khách chọn phương thức thanh toán phù hợp. Khi dùng VietQR, nhân viên cần biết đơn nào đang chờ thanh toán và đơn nào đã xử lý xong.",
          "Cách tổ chức này giúp chủ quán nhìn cuối ca không chỉ là tổng doanh thu, mà còn biết giao dịch nào cần kiểm tra thêm, bàn nào đã đóng và khoản nào chưa khớp."
        ],
        bullets: ["Hóa đơn rõ trước khi tạo mã.", "Trạng thái thanh toán dễ kiểm tra.", "Báo cáo cuối ca ít phải ghép thủ công."]
      },
      {
        eyebrow: "Kết nối nội dung",
        heading: "Trang này phục vụ nhóm truy vấn có ý định triển khai cao",
        body: [
          "Người tìm thanh toán VietQR cho nhà hàng thường đã vượt qua giai đoạn tìm hiểu khái niệm. Họ cần biết triển khai có ảnh hưởng tới nhân viên không, đối soát ra sao và có phù hợp thói quen khách Việt không.",
          "Vì vậy trang giải pháp cần liên kết tới các bài về VietQR, đối soát cuối ca và đặt bàn nhận cọc để Google hiểu đây là cụm vận hành tài chính, không chỉ là một tính năng thanh toán."
        ],
        bullets: ["Bắt truy vấn thương mại rõ.", "Nối sang hub vận hành nhà hàng.", "Tăng khả năng được trích dẫn trong AI search."]
      },
      {
        eyebrow: "Theo dõi",
        heading: "Các chỉ số nên xem sau khi bật VietQR",
        body: [
          "Nhà hàng nên xem số đơn thanh toán bằng VietQR, số giao dịch cần kiểm lại, thời gian đóng bàn sau khi khách yêu cầu thanh toán và số lỗi nhầm bàn trong ca.",
          "Khi dữ liệu này ổn định, nhà hàng có thể mở thêm đặt cọc, đặt bàn trước hoặc gói báo cáo cao hơn mà không làm kế toán cuối ngày phức tạp hơn."
        ],
        bullets: ["Tỷ lệ giao dịch khớp đơn.", "Thời gian đóng bàn.", "Số ngoại lệ cần quản lý kiểm tra."]
      }
    ],
    faq: [
      {
        question: "VietQR có phù hợp nhà hàng phục vụ tại bàn không?",
        answer: "Có, miễn là mã thanh toán được đặt trong luồng hóa đơn và trạng thái đơn, thay vì chỉ là mã chuyển khoản tĩnh ở quầy."
      },
      {
        question: "Đối soát VietQR cuối ca cần chuẩn bị gì?",
        answer: "Cần danh sách đơn đã thanh toán, trạng thái bàn, số tiền từng hóa đơn và quy trình đánh dấu ngoại lệ để quản lý kiểm tra lại."
      },
      {
        question: "Trang này khác gì bài blog VietQR?",
        answer: "Bài blog giải thích khái niệm và kinh nghiệm; trang giải pháp tập trung vào quyết định triển khai và luồng vận hành bằng LogiVN."
      }
    ],
    relatedBlogSlugs: ["thanh-toan-vietqr-cho-nha-hang", "doi-soat-vietqr-cuoi-ca", "dat-ban-nhan-coc-nha-hang"],
    relatedHubSlugs: ["van-hanh-nha-hang"],
    cta: {
      primaryLabel: "Xem gói hỗ trợ VietQR",
      primaryPath: "/pricing",
      secondaryLabel: "Đọc hub nhà hàng",
      secondaryPath: "/blog/van-hanh-nha-hang"
    }
  },
  {
    slug: "phan-mem-quan-ly-quan-tra-sua",
    path: "/giai-phap/phan-mem-quan-ly-quan-tra-sua",
    title: "Phần mềm quản lý quán trà sữa",
    description:
      "Giải pháp quản lý quán trà sữa với menu nhiều biến thể, topping, order tại bàn, đặt món online, VietQR và báo cáo doanh thu bằng LogiVN.",
    eyebrow: "Giải pháp cho trà sữa",
    h1: "Quản lý quán trà sữa cần bắt đầu từ menu nhiều biến thể",
    summary:
      "Trà sữa có size, đá, đường, topping, combo và giờ cao điểm rất rõ. Trang này giúp chủ quán nhìn cách LogiVN biến menu phức tạp thành luồng order dễ thao tác hơn.",
    updatedAt: "2026-05-12",
    priority: 0.73,
    changeFrequency: "weekly",
    keywords: ["phần mềm quản lý quán trà sữa", "phần mềm order trà sữa", "menu topping", "báo cáo doanh thu", "LogiVN"],
    targetQueries: ["phần mềm quản lý quán trà sữa", "phần mềm order trà sữa", "quản lý topping trà sữa"],
    takeaways: [
      "Topping và biến thể là điểm khác biệt lớn giữa trà sữa và cafe thông thường.",
      "Order tại bàn hoặc online chỉ chạy mượt khi menu được cấu trúc rõ.",
      "Báo cáo giúp chủ quán biết combo, topping và khung giờ nào đang tạo doanh thu tốt."
    ],
    proofPoints: [
      { label: "Menu", value: "size, đá, đường, topping" },
      { label: "Kênh bán", value: "tại bàn và online" },
      { label: "Báo cáo", value: "món, topping, khung giờ" }
    ],
    sketch: {
      title: "Menu trà sữa nhiều lựa chọn",
      alt: "Sơ đồ phác họa menu trà sữa, topping, order, thanh toán và báo cáo doanh thu.",
      caption: "Khi menu nhiều biến thể được chuẩn hóa, nhân viên và khách đều thao tác ít lỗi hơn.",
      labels: ["Menu", "Topping", "Order", "Doanh thu"]
    },
    sections: [
      {
        eyebrow: "Đặc thù",
        heading: "Trà sữa khó ở số lựa chọn chứ không chỉ ở số món",
        body: [
          "Một ly trà sữa có thể có nhiều biến thể về size, đá, đường, topping và ghi chú riêng. Nếu nhân viên ghi tay hoặc khách nhắn tự do, lỗi dễ xuất hiện ở bước chuyển order sang quầy pha chế.",
          "Phần mềm quản lý tốt cần giúp quán chuẩn hóa lựa chọn ngay từ menu, để khách chọn đúng cấu hình và nhân viên không phải diễn giải lại từng dòng ghi chú."
        ],
        bullets: ["Giảm lỗi topping và ghi chú.", "Menu dễ cập nhật khi hết món.", "Combo rõ hơn cho khách mới."]
      },
      {
        eyebrow: "Vận hành",
        heading: "Order tại bàn và online phải dùng cùng một dữ liệu menu",
        body: [
          "Nếu quán vừa bán tại chỗ vừa nhận đơn online, dữ liệu menu không nên tách thành nhiều bản. Khi giá hoặc topping đổi, chủ quán cần sửa một lần và đồng bộ sang mọi điểm chạm.",
          "LogiVN nên được dùng như lớp vận hành chung: QR tại bàn, link đặt món online, thanh toán và báo cáo cùng đọc từ một cấu trúc menu thống nhất."
        ],
        bullets: ["Một menu cho nhiều kênh.", "Theo dõi trạng thái đơn rõ.", "Hạn chế cập nhật giá thủ công nhiều nơi."]
      },
      {
        eyebrow: "Tăng trưởng",
        heading: "Báo cáo giúp quán biết nên đẩy combo nào",
        body: [
          "Sau khi order chạy ổn, dữ liệu bán hàng giúp chủ quán xem món nào kéo doanh thu, topping nào được chọn nhiều và khung giờ nào cần thêm người.",
          "Thông tin này phục vụ cả vận hành lẫn marketing: quán có thể tạo combo, ưu tiên món biên lợi nhuận tốt hoặc điều chỉnh tồn kho theo nhịp bán thật."
        ],
        bullets: ["Theo dõi món bán chạy.", "Đo topping phổ biến.", "Chuẩn bị nguyên liệu sát thực tế hơn."]
      },
      {
        eyebrow: "Crawl",
        heading: "Trang giải pháp tạo cửa vào riêng cho ngành trà sữa",
        body: [
          "Blog hiện có bài về phần mềm order trà sữa và báo cáo doanh thu. Trang này gom intent thương mại để Google hiểu LogiVN có khả năng phục vụ mô hình trà sữa, không chỉ quán cafe chung chung.",
          "Khi liên kết về hub chuyển đổi số quán cafe, trang này cũng giúp crawler đi từ ngành cụ thể sang cụm nội dung rộng hơn về menu, order online và báo cáo."
        ],
        bullets: ["Mở rộng từ cafe sang trà sữa.", "Tăng internal link tới bài báo cáo.", "Có FAQ rõ cho truy vấn chuyển đổi."]
      }
    ],
    faq: [
      {
        question: "Quán trà sữa nhỏ có cần phần mềm riêng không?",
        answer:
          "Nếu menu có nhiều topping, size hoặc kênh bán, phần mềm giúp giảm lỗi order và giúp chủ quán theo dõi doanh thu theo biến thể tốt hơn."
      },
      {
        question: "LogiVN có phù hợp đặt món online cho trà sữa không?",
        answer: "Có thể dùng LogiVN để chuẩn hóa menu, nhận đơn và theo dõi trạng thái; phạm vi triển khai nên bắt đầu nhỏ trước khi mở rộng nhiều kênh."
      },
      {
        question: "Nên đo gì khi triển khai?",
        answer: "Nên đo số lỗi topping, món bán chạy, doanh thu theo khung giờ và tỷ lệ đơn online so với đơn tại quán."
      }
    ],
    relatedBlogSlugs: ["phan-mem-order-tra-sua", "bao-cao-doanh-thu-quan-cafe", "dat-mon-online-cho-quan-cafe"],
    relatedHubSlugs: ["chuyen-doi-so-quan-cafe"],
    cta: {
      primaryLabel: "Xem bảng giá cho quán đồ uống",
      primaryPath: "/pricing",
      secondaryLabel: "Đọc hub quán cafe",
      secondaryPath: "/blog/chuyen-doi-so-quan-cafe"
    }
  },
  {
    slug: "dat-ban-nhan-coc-nha-hang",
    path: "/giai-phap/dat-ban-nhan-coc-nha-hang",
    title: "Đặt bàn nhận cọc cho nhà hàng",
    description:
      "Giải pháp đặt bàn nhận cọc cho nhà hàng: gom yêu cầu đặt trước, xác nhận khách, theo dõi cọc, giảm no-show và nối với vận hành bàn bằng LogiVN.",
    eyebrow: "Giải pháp đặt bàn",
    h1: "Đặt bàn nhận cọc giúp nhà hàng kiểm soát no-show tốt hơn",
    summary:
      "Trang này dành cho nhà hàng có đặt bàn trước, nhóm khách đông hoặc khung giờ cao điểm cần xác nhận chắc hơn trước khi giữ chỗ và chuẩn bị nhân sự.",
    updatedAt: "2026-05-12",
    priority: 0.72,
    changeFrequency: "weekly",
    keywords: ["đặt bàn nhận cọc", "giảm no-show nhà hàng", "đặt bàn nhà hàng", "quản lý bàn", "LogiVN"],
    targetQueries: ["đặt bàn nhận cọc nhà hàng", "phần mềm đặt bàn nhận cọc", "giảm no-show nhà hàng"],
    takeaways: [
      "Nhận cọc không chỉ là thanh toán, mà là cách xác nhận ý định đến thật của khách.",
      "Thông tin đặt bàn cần nối với trạng thái bàn, nhân viên và thanh toán để không bị rời rạc.",
      "Trang giải pháp này nối nội dung đặt bàn với VietQR và hub vận hành nhà hàng."
    ],
    proofPoints: [
      { label: "Rủi ro", value: "no-show giờ cao điểm" },
      { label: "Dữ liệu", value: "khách, giờ, số người, cọc" },
      { label: "Kết nối", value: "bàn và thanh toán" }
    ],
    sketch: {
      title: "Luồng đặt bàn có cọc",
      alt: "Sơ đồ phác họa khách đặt bàn, xác nhận cọc, giữ bàn và phục vụ tại nhà hàng.",
      caption: "Đặt cọc rõ ràng giúp nhà hàng chuẩn bị bàn, nhân sự và nguyên liệu tự tin hơn.",
      labels: ["Yêu cầu", "Cọc", "Giữ bàn", "Phục vụ"]
    },
    sections: [
      {
        eyebrow: "Bài toán",
        heading: "No-show làm nhà hàng mất cả bàn, nhân sự và cơ hội bán",
        body: [
          "Với nhà hàng có ít bàn đẹp hoặc đông vào cuối tuần, một lượt khách đặt rồi không đến có thể làm mất cơ hội nhận khách khác. Nhân viên cũng khó biết nên giữ bàn bao lâu nếu thông tin xác nhận rời rạc qua điện thoại hoặc tin nhắn.",
          "Đặt bàn nhận cọc giúp tăng cam kết, nhưng chỉ hiệu quả khi thông tin khách, thời gian, số người, số tiền cọc và trạng thái bàn được quản lý trong cùng một nơi."
        ],
        bullets: ["Giảm bàn bị giữ ảo.", "Chuẩn bị nhân sự đúng hơn.", "Có dữ liệu xác nhận trước giờ phục vụ."]
      },
      {
        eyebrow: "Luồng chuẩn",
        heading: "Từ yêu cầu đặt bàn đến phục vụ cần có trạng thái rõ",
        body: [
          "Một quy trình tốt nên bắt đầu từ yêu cầu đặt bàn, kiểm tra khung giờ, gửi hướng dẫn cọc, xác nhận đã nhận cọc và đưa bàn vào danh sách chuẩn bị.",
          "Khi khách đến, nhân viên không phải tìm lại lịch sử tin nhắn. Bàn đã có trạng thái, ghi chú và thông tin thanh toán để phục vụ nhanh hơn."
        ],
        bullets: ["Gom lịch đặt bàn.", "Theo dõi trạng thái cọc.", "Nối đặt bàn với vận hành tại quán."]
      },
      {
        eyebrow: "Nội dung liên quan",
        heading: "Đặt bàn nhận cọc nên đi cùng VietQR và đối soát",
        body: [
          "Cọc thường đi qua chuyển khoản hoặc VietQR, nên nội dung đặt bàn cần liên kết tự nhiên với trang thanh toán VietQR và bài đối soát cuối ca.",
          "Cụm này giúp Google hiểu LogiVN không chỉ xử lý order tại bàn, mà còn hỗ trợ giai đoạn trước khi khách tới quán và giai đoạn kiểm tra thanh toán."
        ],
        bullets: ["Nối intent đặt bàn với thanh toán.", "Tăng chiều sâu hub nhà hàng.", "Giúp crawler thấy quan hệ trước và sau bữa ăn."]
      },
      {
        eyebrow: "Đo lường",
        heading: "Nhà hàng nên đo hiệu quả theo tuần",
        body: [
          "Sau khi triển khai, nhà hàng nên theo dõi tỷ lệ khách đặt không đến, tỷ lệ cọc đã xác nhận, số bàn được giải phóng đúng lúc và phản hồi của nhân viên lễ tân.",
          "Nếu tỷ lệ no-show giảm và nhân viên ít phải kiểm tra thủ công hơn, quán có thể mở rộng quy trình cho nhóm khách lớn, ngày lễ hoặc phòng riêng."
        ],
        bullets: ["Tỷ lệ no-show.", "Số cọc xác nhận đúng hạn.", "Thời gian xử lý đặt bàn của nhân viên."]
      }
    ],
    faq: [
      {
        question: "Nhà hàng nhỏ có nên nhận cọc đặt bàn không?",
        answer: "Nên cân nhắc khi quán thường kín bàn, có nhóm đông hoặc thường bị khách đặt rồi không đến vào khung giờ quan trọng."
      },
      {
        question: "Nhận cọc có làm khách khó chịu không?",
        answer:
          "Nếu thông tin rõ ràng, số tiền hợp lý và chính sách đổi hủy minh bạch, cọc thường giúp hai bên chắc chắn hơn thay vì tạo thêm ma sát."
      },
      {
        question: "Đặt bàn nhận cọc liên quan gì tới SEO?",
        answer:
          "Đây là truy vấn có ý định triển khai cao. Một trang riêng giúp LogiVN có cửa vào cho nhóm nhà hàng quan tâm no-show và quản lý bàn."
      }
    ],
    relatedBlogSlugs: ["dat-ban-nhan-coc-nha-hang", "thanh-toan-vietqr-cho-nha-hang", "doi-soat-vietqr-cuoi-ca"],
    relatedHubSlugs: ["van-hanh-nha-hang"],
    cta: {
      primaryLabel: "Xem bảng giá cho nhà hàng",
      primaryPath: "/pricing",
      secondaryLabel: "Đọc hub vận hành nhà hàng",
      secondaryPath: "/blog/van-hanh-nha-hang"
    }
  },
  {
    slug: "order-online-cho-quan-cafe",
    path: "/giai-phap/order-online-cho-quan-cafe",
    title: "Order online cho quán cafe: pickup và delivery",
    description:
      "Giải pháp order online cho quán cafe: nhận đơn pickup, delivery, gom menu QR, trạng thái đơn và thanh toán vào cùng một quy trình vận hành bằng LogiVN.",
    eyebrow: "Giải pháp order online",
    h1: "Order online cho quán cafe cần gọn như bán tại quán",
    summary:
      "Trang này dành cho chủ quán cafe muốn mở thêm kênh đặt món online nhưng không muốn tạo một luồng vận hành rời khỏi menu, bếp và báo cáo hiện tại.",
    updatedAt: "2026-05-16",
    priority: 0.75,
    changeFrequency: "weekly",
    keywords: ["order online quán cafe", "đặt món online", "pickup cafe", "delivery cafe", "LogiVN"],
    targetQueries: ["order online cho quán cafe", "phần mềm đặt món online quán cafe", "quản lý đơn pickup delivery cafe"],
    takeaways: [
      "Order online nên dùng chung menu và trạng thái với kênh tại bàn để tránh nhập lại dữ liệu.",
      "Pickup và delivery cần có trạng thái đơn rõ để nhân viên biết đơn nào đang chuẩn bị, đã xong hoặc cần xác nhận.",
      "LogiVN giúp quán cafe mở kênh online theo từng bước mà không tách khỏi nhịp vận hành trong quán."
    ],
    proofPoints: [
      { label: "Kênh bán", value: "pickup và delivery" },
      { label: "Dữ liệu", value: "menu, đơn, trạng thái" },
      { label: "Mục tiêu", value: "không tách khỏi vận hành tại quán" }
    ],
    sketch: {
      title: "Luồng order online cho cafe",
      alt: "Sơ đồ phác họa khách đặt món online, đơn về dashboard, nhân viên chuẩn bị và khách nhận món.",
      caption: "Order online hiệu quả hơn khi dùng chung menu và trạng thái với luồng bán tại quán.",
      labels: ["Menu", "Đơn online", "Chuẩn bị", "Nhận món"]
    },
    sections: [
      {
        eyebrow: "Bài toán",
        heading: "Mở thêm kênh online nhưng không được tạo thêm một bảng quản lý rời",
        body: [
          "Nhiều quán cafe bắt đầu nhận đơn qua tin nhắn, cuộc gọi hoặc form riêng. Cách này dễ khởi động nhưng nhanh chóng tạo ra vấn đề: nhân viên phải kiểm tra nhiều nơi, khách hỏi trạng thái đơn và chủ quán khó biết doanh thu online thật sự đóng góp bao nhiêu.",
          "Một luồng order online tốt nên đi từ cùng dữ liệu menu, cùng trạng thái đơn và cùng báo cáo. Như vậy quán có thể mở pickup hoặc delivery mà không phải vận hành như một cửa hàng thứ hai."
        ],
        bullets: ["Dùng chung menu thay vì nhập lại món.", "Theo dõi trạng thái đơn online rõ.", "Gom doanh thu online vào báo cáo chung."]
      },
      {
        eyebrow: "Triển khai",
        heading: "Bắt đầu bằng pickup trước khi mở rộng giao hàng",
        body: [
          "Pickup thường là bước ít rủi ro vì quán không cần xử lý quá nhiều biến số giao hàng. Chủ quán có thể thử với nhóm món bán chạy, giờ nhận đơn rõ ràng và quy trình xác nhận đơn đơn giản.",
          "Khi đội ngũ đã quen với trạng thái online, quán mới nên mở delivery, phí giao hàng hoặc khu vực phục vụ. Cách đi từng lớp giúp dữ liệu sạch và nhân viên không bị quá tải."
        ],
        bullets: ["Chọn món bán online trước.", "Đặt khung giờ nhận đơn rõ.", "Theo dõi đơn mới trên dashboard."]
      },
      {
        eyebrow: "Tín hiệu tìm kiếm",
        heading: "Order online là nhóm truy vấn có nhu cầu triển khai cao",
        body: [
          "Người tìm order online cho quán cafe thường đã có nhu cầu mở thêm doanh thu ngoài khách ngồi tại quán. Họ không chỉ hỏi khái niệm, mà muốn biết phần mềm có giúp quản lý đơn, menu và thanh toán gọn hơn không.",
          "Trang này nối từ bài đặt món online, hub chuyển đổi số và bảng giá để Google hiểu LogiVN phục vụ nhu cầu mở kênh bán thật, không chỉ là nội dung hướng dẫn chung."
        ],
        bullets: ["Bắt long-tail có ý định mua.", "Liên kết với blog đặt món online.", "Dẫn về pricing khi chủ quán muốn thử."]
      },
      {
        eyebrow: "Đo lường",
        heading: "Chỉ số nên xem sau tuần đầu nhận đơn online",
        body: [
          "Sau một tuần, quán nên xem số đơn online, tỷ lệ đơn bị hủy, thời gian chuẩn bị món, món bán tốt qua online và khung giờ có nhu cầu cao.",
          "Nếu dữ liệu tích cực, chủ quán có thể mở thêm combo, khuyến mãi hoặc khu vực giao hàng. Nếu dữ liệu chưa tốt, quán vẫn biết nên sửa menu, hình ảnh món hay quy trình xác nhận."
        ],
        bullets: ["Số đơn online theo ngày.", "Tỷ lệ đơn hoàn tất.", "Món và khung giờ có nhu cầu cao."]
      }
    ],
    faq: [
      {
        question: "Quán cafe nhỏ có nên mở order online không?",
        answer: "Nên thử nếu quán đã có menu ổn định và có khách quen muốn đặt trước. Bắt đầu bằng pickup giúp giảm rủi ro hơn so với mở delivery ngay."
      },
      {
        question: "Order online có cần tách menu riêng không?",
        answer:
          "Không nên tách hoàn toàn. Quán có thể chọn một phần menu để bán online, nhưng dữ liệu món, giá và trạng thái nên nằm trong cùng hệ thống để dễ cập nhật."
      },
      {
        question: "LogiVN hỗ trợ gì cho order online?",
        answer: "LogiVN giúp quán tạo menu online, nhận đơn, theo dõi trạng thái và nối dữ liệu với báo cáo vận hành chung."
      }
    ],
    relatedBlogSlugs: ["dat-mon-online-cho-quan-cafe", "phan-mem-quan-ly-quan-cafe-nho", "quan-ly-order-realtime-gio-cao-diem"],
    relatedHubSlugs: ["chuyen-doi-so-quan-cafe"],
    cta: {
      primaryLabel: "Xem gói cho order online",
      primaryPath: "/pricing",
      secondaryLabel: "Đọc bài đặt món online",
      secondaryPath: "/blog/dat-mon-online-cho-quan-cafe"
    }
  },
  {
    slug: "bao-cao-doanh-thu-quan-cafe",
    path: "/giai-phap/bao-cao-doanh-thu-quan-cafe",
    title: "Báo cáo doanh thu quán cafe theo ngày",
    description:
      "Giải pháp báo cáo doanh thu quán cafe: xem đơn, món bán chạy, khung giờ cao điểm, thanh toán và dữ liệu cuối ca trong LogiVN.",
    eyebrow: "Giải pháp báo cáo",
    h1: "Báo cáo doanh thu quán cafe phải trả lời được ca nào đang hiệu quả",
    summary:
      "Trang này giúp chủ quán cafe nhìn báo cáo không chỉ là tổng tiền cuối ngày, mà là dữ liệu món, giờ bán, kênh order và thanh toán để ra quyết định nhanh hơn.",
    updatedAt: "2026-05-16",
    priority: 0.74,
    changeFrequency: "weekly",
    keywords: ["báo cáo doanh thu quán cafe", "món bán chạy", "doanh thu theo ca", "dashboard quán cafe", "LogiVN"],
    targetQueries: ["báo cáo doanh thu quán cafe", "phần mềm báo cáo doanh thu cafe", "xem món bán chạy quán cafe"],
    takeaways: [
      "Báo cáo tốt cần nối đơn, món, thanh toán và khung giờ trong cùng một bức tranh.",
      "Chủ quán nên xem món bán chạy, giờ cao điểm và ngoại lệ thanh toán thay vì chỉ xem tổng tiền.",
      "LogiVN biến dữ liệu vận hành hằng ngày thành tín hiệu dễ hành động hơn."
    ],
    proofPoints: [
      { label: "Chỉ số", value: "doanh thu, món, khung giờ" },
      { label: "Tần suất", value: "cuối ca và theo tuần" },
      { label: "Hành động", value: "combo, nhân sự, nguyên liệu" }
    ],
    sketch: {
      title: "Dashboard doanh thu quán cafe",
      alt: "Sơ đồ phác họa đơn hàng, thanh toán, món bán chạy và báo cáo doanh thu cuối ca.",
      caption: "Báo cáo hữu ích nhất khi chủ quán nhìn được nguyên nhân phía sau con số doanh thu.",
      labels: ["Đơn", "Thanh toán", "Món bán", "Báo cáo"]
    },
    sections: [
      {
        eyebrow: "Bài toán",
        heading: "Tổng doanh thu cuối ngày chưa đủ để điều hành tốt hơn",
        body: [
          "Nhiều chủ quán chỉ xem cuối ngày hôm nay bán được bao nhiêu. Con số đó quan trọng, nhưng chưa trả lời vì sao doanh thu tăng, món nào kéo khách quay lại hoặc khung giờ nào cần thêm nhân sự.",
          "Khi đơn, món và thanh toán được ghi nhận trong cùng hệ thống, báo cáo có thể chỉ ra điểm cần hành động. Đây là khác biệt giữa ghi nhận doanh thu và quản trị vận hành."
        ],
        bullets: ["Biết món nào đang bán tốt.", "Nhìn giờ cao điểm rõ hơn.", "Tách được doanh thu tại bàn và online."]
      },
      {
        eyebrow: "Luồng dữ liệu",
        heading: "Báo cáo bắt đầu từ order sạch và trạng thái thanh toán rõ",
        body: [
          "Nếu đơn bị ghi thiếu món hoặc thanh toán không gắn với hóa đơn, báo cáo cuối ca sẽ luôn cần sửa thủ công. Vì vậy bước nền là chuẩn hóa menu, nhận đơn theo trạng thái và xác nhận thanh toán đúng lúc.",
          "Khi dữ liệu vào sạch, chủ quán có thể xem báo cáo nhanh hơn, ít phụ thuộc vào file riêng hoặc tin nhắn cuối ngày."
        ],
        bullets: ["Menu và giá đồng bộ.", "Đơn có trạng thái xử lý.", "Thanh toán có dấu vết xác nhận."]
      },
      {
        eyebrow: "Nội dung SEO",
        heading: "Truy vấn báo cáo doanh thu thường đến từ chủ quán đã có vấn đề thật",
        body: [
          "Người tìm báo cáo doanh thu quán cafe thường đang gặp khó trong đối soát, theo dõi món bán chạy hoặc quản lý ca. Đây là nhóm từ khóa có giá trị vì nhu cầu gắn với quyết định chọn phần mềm.",
          "Trang giải pháp này liên kết tới bài báo cáo doanh thu, bài quản lý order realtime và hub chuyển đổi số để tạo cụm nội dung rõ ràng hơn cho Google."
        ],
        bullets: ["Bắt nhu cầu quản trị rõ.", "Tăng liên kết tới nội dung vận hành.", "Đưa người đọc về pricing đúng ngữ cảnh."]
      },
      {
        eyebrow: "Ứng dụng",
        heading: "Báo cáo nên dẫn đến quyết định trong tuần kế tiếp",
        body: [
          "Sau khi xem dữ liệu, chủ quán có thể điều chỉnh combo, chuẩn bị nguyên liệu, thay đổi lịch nhân sự hoặc đẩy món bán chạy lên vị trí nổi bật trong menu.",
          "Nếu báo cáo không dẫn tới hành động, nó chỉ là bảng số. LogiVN nên được định vị như lớp biến dữ liệu hằng ngày thành quyết định vận hành."
        ],
        bullets: ["Điều chỉnh combo.", "Dự báo nguyên liệu.", "Sắp ca theo giờ cao điểm."]
      }
    ],
    faq: [
      {
        question: "Báo cáo doanh thu quán cafe nên xem theo ngày hay theo tuần?",
        answer: "Nên xem nhanh theo ngày để xử lý ca, rồi xem theo tuần để phát hiện xu hướng món bán chạy, khung giờ cao điểm và hiệu quả kênh online."
      },
      {
        question: "Quán nhỏ có cần dashboard báo cáo không?",
        answer: "Có nếu chủ quán muốn giảm ghi chép thủ công và hiểu rõ món, giờ bán, thanh toán thay vì chỉ nhìn tổng tiền cuối ngày."
      },
      {
        question: "Báo cáo trong LogiVN lấy dữ liệu từ đâu?",
        answer: "Báo cáo dựa trên dữ liệu menu, order, trạng thái thanh toán và các luồng vận hành được ghi nhận trong hệ thống."
      }
    ],
    relatedBlogSlugs: ["bao-cao-doanh-thu-quan-cafe", "quan-ly-order-realtime-gio-cao-diem", "phan-mem-quan-ly-quan-cafe-nho"],
    relatedHubSlugs: ["chuyen-doi-so-quan-cafe"],
    cta: {
      primaryLabel: "Xem gói có báo cáo",
      primaryPath: "/pricing",
      secondaryLabel: "Đọc bài báo cáo doanh thu",
      secondaryPath: "/blog/bao-cao-doanh-thu-quan-cafe"
    }
  },
  {
    slug: "menu-qr-cho-nha-hang",
    path: "/giai-phap/menu-qr-cho-nha-hang",
    title: "Menu QR cho nhà hàng: từ xem món đến gửi order",
    description:
      "Giải pháp menu QR cho nhà hàng: chuẩn hóa món, nhóm danh mục, giảm hỏi lại, nối menu số với order tại bàn và thanh toán bằng LogiVN.",
    eyebrow: "Giải pháp menu QR",
    h1: "Menu QR cho nhà hàng cần đi xa hơn một file PDF",
    summary:
      "Trang này dành cho nhà hàng muốn chuyển menu giấy sang menu QR nhưng vẫn giữ trải nghiệm phục vụ tại bàn rõ ràng, có trạng thái order và dễ cập nhật món.",
    updatedAt: "2026-05-16",
    priority: 0.73,
    changeFrequency: "weekly",
    keywords: ["menu QR nhà hàng", "menu số nhà hàng", "gọi món QR nhà hàng", "order tại bàn", "LogiVN"],
    targetQueries: ["menu QR cho nhà hàng", "phần mềm menu QR nhà hàng", "menu số gọi món tại bàn"],
    takeaways: [
      "Menu QR tốt phải dễ đọc trên điện thoại, nhẹ và có cấu trúc món rõ.",
      "Nhà hàng nên nối menu QR với giỏ hàng và trạng thái order nếu muốn giảm hỏi lại.",
      "LogiVN giúp menu số trở thành điểm bắt đầu của luồng phục vụ, không chỉ là trang xem món."
    ],
    proofPoints: [
      { label: "Nền tảng", value: "danh mục và món rõ" },
      { label: "Trải nghiệm", value: "khách chọn trên điện thoại" },
      { label: "Mở rộng", value: "order và thanh toán" }
    ],
    sketch: {
      title: "Menu QR nối với order",
      alt: "Sơ đồ phác họa menu QR, khách chọn món, order về nhân viên và thanh toán.",
      caption: "Menu QR có giá trị hơn khi dữ liệu món nối thẳng vào quy trình phục vụ.",
      labels: ["Menu QR", "Chọn món", "Order", "Thanh toán"]
    },
    sections: [
      {
        eyebrow: "Bài toán",
        heading: "PDF menu giúp xem nhanh nhưng không giảm tải vận hành",
        body: [
          "Nhiều nhà hàng dùng mã QR dẫn tới PDF hoặc ảnh menu. Cách này giảm chi phí in ấn, nhưng khách vẫn phải gọi nhân viên để đặt món, nhân viên vẫn ghi lại và bếp vẫn nhận thông tin qua luồng cũ.",
          "Nếu mục tiêu là giảm sai sót và tăng tốc phục vụ, menu QR cần có cấu trúc dữ liệu: danh mục, món, mô tả, giá, trạng thái còn bán và khả năng gửi order."
        ],
        bullets: ["Không phụ thuộc vào file ảnh nặng.", "Cập nhật món một lần.", "Có thể mở order tại bàn khi sẵn sàng."]
      },
      {
        eyebrow: "Chuẩn bị",
        heading: "Nhà hàng nên chuẩn hóa menu trước khi in QR",
        body: [
          "Bước khó nhất không phải tạo mã QR, mà là chuẩn hóa tên món, nhóm món, giá, ghi chú, ảnh và món hết hàng. Nếu dữ liệu menu rối, trải nghiệm QR cũng rối.",
          "Khi menu sạch, nhà hàng có thể thử ở một khu vực trước, theo dõi phản hồi của khách và mở rộng dần sang toàn bộ bàn."
        ],
        bullets: ["Nhóm món theo hành vi chọn.", "Viết mô tả ngắn dễ hiểu.", "Giữ ảnh nhẹ để tải nhanh."]
      },
      {
        eyebrow: "Ý định tìm kiếm",
        heading: "Menu QR là cửa vào trước khi chủ quán tìm phần mềm order",
        body: [
          "Nhiều chủ nhà hàng bắt đầu bằng câu hỏi menu QR là gì hoặc làm menu QR thế nào. Sau khi hiểu, họ mới quan tâm order tại bàn, VietQR và báo cáo.",
          "Trang giải pháp này đóng vai trò cầu nối từ nhu cầu xem menu sang nhu cầu triển khai phần mềm vận hành đầy đủ hơn."
        ],
        bullets: ["Bắt truy vấn đầu phễu.", "Liên kết tới gọi món QR.", "Dẫn sang pricing khi người đọc muốn triển khai."]
      },
      {
        eyebrow: "Đo hiệu quả",
        heading: "Menu QR nên được đo bằng hành vi khách, không chỉ lượt quét",
        body: [
          "Lượt quét QR chỉ cho biết khách mở menu. Nhà hàng nên xem thêm thời gian chọn món, số lượt gọi nhân viên để hỏi lại, món được xem nhiều và tỷ lệ chuyển sang gửi order.",
          "Những dữ liệu này giúp quán biết menu đã đủ dễ hiểu chưa và có nên nối sang order tại bàn hay không."
        ],
        bullets: ["Lượt xem danh mục.", "Tỷ lệ gửi order.", "Số câu hỏi lặp lại của khách."]
      }
    ],
    faq: [
      {
        question: "Menu QR có cần thay thế hoàn toàn menu giấy không?",
        answer: "Không bắt buộc. Nhà hàng có thể dùng song song lúc đầu, nhưng menu QR giúp cập nhật nhanh và chuẩn bị nền để mở order tại bàn."
      },
      {
        question: "Menu QR khác gọi món QR thế nào?",
        answer: "Menu QR chủ yếu để xem món; gọi món QR cho phép khách chọn món, gửi order và nối dữ liệu với nhân viên, bếp và thanh toán."
      },
      {
        question: "Làm sao để menu QR tải nhanh?",
        answer: "Tránh dùng file ảnh hoặc PDF quá nặng, tối ưu ảnh món và giữ cấu trúc danh mục rõ ràng trên mobile."
      }
    ],
    relatedBlogSlugs: ["menu-qr-la-gi", "phan-mem-goi-mon-qr-cho-quan-cafe", "order-tai-ban-khong-can-app"],
    relatedHubSlugs: ["goi-mon-qr"],
    cta: {
      primaryLabel: "Xem gói menu QR",
      primaryPath: "/pricing",
      secondaryLabel: "Đọc menu QR là gì",
      secondaryPath: "/blog/menu-qr-la-gi"
    }
  },
  {
    slug: "quan-ly-order-realtime-nha-hang",
    path: "/giai-phap/quan-ly-order-realtime-nha-hang",
    title: "Quản lý order realtime cho nhà hàng",
    description:
      "Giải pháp quản lý order realtime cho nhà hàng: theo dõi bàn, bếp, thanh toán, đơn online và điểm nghẽn giờ cao điểm bằng LogiVN.",
    eyebrow: "Giải pháp realtime",
    h1: "Quản lý order realtime cho nhà hàng phải làm nổi bật việc cần xử lý ngay",
    summary:
      "Trang này tập trung vào nhà hàng có nhiều bàn, nhiều trạng thái và nhiều điểm nghẽn trong giờ cao điểm, cần một dashboard đủ rõ để nhân viên hành động nhanh.",
    updatedAt: "2026-05-16",
    priority: 0.72,
    changeFrequency: "weekly",
    keywords: ["quản lý order realtime", "dashboard nhà hàng", "quản lý đơn nhà hàng", "giờ cao điểm", "LogiVN"],
    targetQueries: ["quản lý order realtime nhà hàng", "dashboard quản lý đơn nhà hàng", "phần mềm theo dõi order realtime"],
    takeaways: [
      "Realtime chỉ có giá trị khi trạng thái dẫn tới hành động cụ thể cho nhân viên.",
      "Nhà hàng nên nhìn bàn chờ xử lý, đơn đang bếp, thanh toán chưa xác minh và đơn online trong cùng một màn hình.",
      "LogiVN giúp giảm việc hỏi nhau thủ công bằng trạng thái rõ trong từng ca."
    ],
    proofPoints: [
      { label: "Điểm nghẽn", value: "bàn, bếp, thanh toán" },
      { label: "Tốc độ", value: "cập nhật theo trạng thái" },
      { label: "Mục tiêu", value: "xử lý đúng việc trước" }
    ],
    sketch: {
      title: "Dashboard order realtime",
      alt: "Sơ đồ phác họa bàn, bếp, thanh toán và đơn online hội tụ vào dashboard realtime.",
      caption: "Dashboard realtime cần ưu tiên trạng thái cần hành động thay vì chỉ hiển thị nhiều số.",
      labels: ["Bàn", "Bếp", "Thanh toán", "Dashboard"]
    },
    sections: [
      {
        eyebrow: "Bài toán",
        heading: "Giờ cao điểm làm lộ ra mọi chỗ rời rạc trong quy trình",
        body: [
          "Khi nhà hàng đông, một đơn chậm, một bàn cần hỗ trợ hoặc một thanh toán chưa xác minh đều có thể làm trải nghiệm khách giảm mạnh. Nếu dữ liệu nằm ở nhiều nơi, nhân viên phải hỏi nhau liên tục.",
          "Quản lý order realtime cần gom các trạng thái quan trọng vào một bề mặt dễ đọc, để đội ngũ biết việc nào cần xử lý trước và việc nào đã hoàn tất."
        ],
        bullets: ["Giảm hỏi nhau trong ca.", "Ưu tiên đơn đang chờ lâu.", "Theo dõi thanh toán chưa xác minh."]
      },
      {
        eyebrow: "Thiết kế trạng thái",
        heading: "Không phải mọi số liệu realtime đều đáng đưa lên màn hình chính",
        body: [
          "Một dashboard tốt không cố hiển thị mọi dữ liệu. Nó cần làm nổi bật đơn mới, đơn quá lâu, bàn cần phục vụ, món đang nghẽn và thanh toán cần kiểm tra.",
          "Những thông tin khác có thể nằm ở báo cáo hoặc màn chi tiết. Cách phân lớp này giúp nhân viên tập trung trong giờ cao điểm."
        ],
        bullets: ["Đơn mới và đơn trễ.", "Bàn cần hỗ trợ.", "Thanh toán cần xác nhận."]
      },
      {
        eyebrow: "SEO intent",
        heading: "Realtime là cầu nối giữa gọi món QR và vận hành nhà hàng",
        body: [
          "Người tìm quản lý order realtime thường đã gặp vấn đề thực tế: đơn thất lạc, bếp chậm, thanh toán rối hoặc chủ quán không nhìn được ca đang chạy.",
          "Trang này nối các bài về order realtime, VietQR và đối soát để Google hiểu LogiVN giải quyết cả chuỗi vận hành, không chỉ một tính năng đơn lẻ."
        ],
        bullets: ["Nối cụm QR với cụm vận hành.", "Bắt truy vấn quản trị rõ.", "Tăng chiều sâu internal link."]
      },
      {
        eyebrow: "Đo lường",
        heading: "Sau khi bật realtime, nhà hàng nên đo điểm nghẽn theo ca",
        body: [
          "Nhà hàng nên xem số đơn xử lý quá lâu, thời gian từ gửi order đến xác nhận, số thanh toán chờ kiểm tra và khung giờ nhân viên thường bị quá tải.",
          "Nếu các chỉ số này giảm, realtime không chỉ là tính năng kỹ thuật mà là tác động vận hành thật."
        ],
        bullets: ["Thời gian xác nhận đơn.", "Số đơn quá lâu.", "Số thanh toán cần kiểm tra."]
      }
    ],
    faq: [
      {
        question: "Realtime dashboard có cần cho nhà hàng một chi nhánh không?",
        answer: "Có nếu nhà hàng có nhiều bàn, nhiều nhân viên hoặc thường đông theo khung giờ. Một chi nhánh vẫn có thể hưởng lợi khi trạng thái đơn rõ hơn."
      },
      {
        question: "Realtime có làm nhân viên bị quá tải thông tin không?",
        answer: "Có thể nếu thiết kế sai. Dashboard nên ưu tiên trạng thái cần hành động, không hiển thị mọi số liệu cùng lúc."
      },
      {
        question: "LogiVN theo dõi realtime những gì?",
        answer: "LogiVN tập trung vào đơn, bàn, thanh toán, kênh online và các tín hiệu vận hành cần xử lý trong ca."
      }
    ],
    relatedBlogSlugs: ["quan-ly-order-realtime-gio-cao-diem", "thanh-toan-vietqr-cho-nha-hang", "doi-soat-vietqr-cuoi-ca"],
    relatedHubSlugs: ["van-hanh-nha-hang"],
    cta: {
      primaryLabel: "Xem gói vận hành realtime",
      primaryPath: "/pricing",
      secondaryLabel: "Đọc bài order realtime",
      secondaryPath: "/blog/quan-ly-order-realtime-gio-cao-diem"
    }
  },
  ...SEO_INTENT_PAGE_EXPANSIONS
];

function cloneIntentPage(page: SeoIntentPage): SeoIntentPage {
  return {
    ...page,
    title: sanitizePublicMarketingCopy(page.title),
    description: sanitizePublicMarketingCopy(page.description),
    eyebrow: sanitizePublicMarketingCopy(page.eyebrow),
    h1: sanitizePublicMarketingCopy(page.h1),
    summary: sanitizePublicMarketingCopy(page.summary),
    keywords: page.keywords.map(sanitizePublicMarketingCopy),
    targetQueries: page.targetQueries.map(sanitizePublicMarketingCopy),
    takeaways: page.takeaways.map(sanitizePublicMarketingCopy),
    proofPoints: page.proofPoints.map((item) => ({
      label: sanitizePublicMarketingCopy(item.label),
      value: sanitizePublicMarketingCopy(item.value)
    })),
    sketch: {
      title: sanitizePublicMarketingCopy(page.sketch.title),
      alt: sanitizePublicMarketingCopy(page.sketch.alt),
      caption: sanitizePublicMarketingCopy(page.sketch.caption),
      labels: page.sketch.labels.map(sanitizePublicMarketingCopy) as [string, string, string, string]
    },
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
    relatedBlogSlugs: [...page.relatedBlogSlugs],
    relatedHubSlugs: [...page.relatedHubSlugs],
    cta: {
      primaryLabel: sanitizePublicMarketingCopy(page.cta.primaryLabel),
      primaryPath: page.cta.primaryPath,
      secondaryLabel: sanitizePublicMarketingCopy(page.cta.secondaryLabel),
      secondaryPath: page.cta.secondaryPath
    }
  };
}

export function getAllSeoIntentPages() {
  return SEO_INTENT_PAGES.map(cloneIntentPage);
}

export function getFeaturedSeoIntentPages(limit = 8) {
  return getAllSeoIntentPages()
    .sort((left, right) => right.priority - left.priority)
    .slice(0, limit);
}

export function getSeoIntentPage(slug: string) {
  const page = SEO_INTENT_PAGES.find((entry) => entry.slug === slug);
  return page ? cloneIntentPage(page) : null;
}

export function getSeoIntentPagePath(slug: string) {
  return `/giai-phap/${slug}`;
}
