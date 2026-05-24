export type StaffContractTemplateCode =
  | "restaurant_fixed_term"
  | "restaurant_indefinite"
  | "restaurant_part_time"
  | "restaurant_probation";

export type StaffContractTemplate = {
  code: StaffContractTemplateCode;
  title: string;
  contractType: "official" | "probation" | "part_time" | "service" | "other";
  summary: string;
  defaultWorkingTime: string;
  defaultRestTime: string;
  requiredClauses: string[];
};

export const STAFF_CONTRACT_TEMPLATES: StaffContractTemplate[] = [
  {
    code: "restaurant_fixed_term",
    title: "HĐLĐ xác định thời hạn",
    contractType: "official",
    summary: "Mẫu phổ biến cho nhân viên phục vụ, thu ngân, bếp trong quán/cửa hàng có thời hạn rõ ràng.",
    defaultWorkingTime: "Theo lịch ca được phân công trên LogiVN, có thể xoay ca theo nhu cầu vận hành và thông báo trước cho người lao động.",
    defaultRestTime: "Nghỉ giữa ca, nghỉ hằng tuần và nghỉ lễ theo Bộ luật Lao động, nội quy quán và lịch vận hành được công bố.",
    requiredClauses: [
      "Thông tin người sử dụng lao động và người ký đại diện.",
      "Thông tin người lao động: họ tên, ngày sinh, giới tính, nơi cư trú, CCCD/hộ chiếu.",
      "Công việc, địa điểm làm việc, chi nhánh hoặc phạm vi xoay ca.",
      "Thời hạn hợp đồng, lương, phụ cấp, hình thức và kỳ trả lương.",
      "Thời giờ làm việc, nghỉ ngơi, bảo hộ lao động, BHXH/BHYT/BHTN, đào tạo."
    ]
  },
  {
    code: "restaurant_indefinite",
    title: "HĐLĐ không xác định thời hạn",
    contractType: "official",
    summary: "Dành cho nhân sự ổn định dài hạn như quản lý, bếp chính, thu ngân trưởng.",
    defaultWorkingTime: "Theo lịch ca vận hành của quán và thỏa thuận điều phối giữa hai bên.",
    defaultRestTime: "Theo quy định pháp luật lao động, nội quy lao động và thông báo ca làm từng kỳ.",
    requiredClauses: [
      "Không xác định thời điểm chấm dứt hiệu lực hợp đồng.",
      "Quyền điều phối chi nhánh/ca làm trong phạm vi vận hành hợp lý.",
      "Cơ chế nâng lương, phụ cấp, thưởng, kỷ luật và bảo mật kinh doanh nếu có."
    ]
  },
  {
    code: "restaurant_part_time",
    title: "HĐLĐ bán thời gian/theo ca",
    contractType: "part_time",
    summary: "Phù hợp nhân viên part-time, sinh viên, nhân sự làm theo giờ trong quán cà phê/trà sữa.",
    defaultWorkingTime: "Theo số giờ/ca thực tế được gán trên LogiVN; có thể đổi ca khi được quản lý xác nhận.",
    defaultRestTime: "Nghỉ giữa ca theo độ dài ca làm và lịch hoạt động của quán.",
    requiredClauses: [
      "Đơn giá lương theo giờ/ca hoặc lương khoán theo thỏa thuận.",
      "Cách xác nhận công, đi muộn, về sớm, tăng ca và đổi ca đột xuất.",
      "Điều kiện tham gia bảo hiểm nếu đáp ứng ngưỡng pháp luật hiện hành."
    ]
  },
  {
    code: "restaurant_probation",
    title: "Thỏa thuận thử việc",
    contractType: "probation",
    summary: "Dành cho giai đoạn thử việc trước khi ký HĐLĐ chính thức.",
    defaultWorkingTime: "Theo lịch đào tạo và ca thử việc được quản lý phân công.",
    defaultRestTime: "Theo lịch vận hành quán và quy định nghỉ ngơi tối thiểu.",
    requiredClauses: [
      "Thời gian thử việc, vị trí thử việc, mức lương thử việc.",
      "Tiêu chí đánh giá sau thử việc: thái độ, tốc độ phục vụ, tuân thủ quy trình, trung thực tiền hàng.",
      "Kết quả thử việc và thời điểm thông báo ký hợp đồng chính thức hoặc dừng hợp tác."
    ]
  }
];

export function getStaffContractTemplate(code: StaffContractTemplateCode | string | null | undefined) {
  return STAFF_CONTRACT_TEMPLATES.find((template) => template.code === code) ?? STAFF_CONTRACT_TEMPLATES[0];
}
