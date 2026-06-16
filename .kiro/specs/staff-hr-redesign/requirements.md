# Requirements Document

## Introduction

Tài liệu này mô tả yêu cầu cho đợt "thay máu" toàn diện về UI/UX/layout của HAI bề mặt quản lý nhân sự (HR): (1) workspace HR phía admin và (2) ứng dụng PWA dành cho nhân viên. Mục tiêu cốt lõi là đồng bộ chặt chẽ giữa hai bề mặt: dùng chung một ngôn ngữ thiết kế (design tokens), chung ngữ nghĩa hiển thị (nhãn + màu + icon) cho các khái niệm dùng chung, và nhất quán theo thời gian thực.

Hiện trạng kiến trúc làm nền cho các yêu cầu:

- **Admin HR**: `components/dashboard-v2/real/staff-workspace-v2.tsx` (~3800 dòng) dùng design token `var(--d-*)` và bộ primitive v2 (Drawer/Modal/Button/Badge). Các view: Đội ngũ, Ca làm, Lương, Chấm công, Nâng cao (AdvancedStaffPanel: incidents/contracts/documents/reviews/devices/roles).
- **PWA nhân viên**: `features/staff/components/staff-mobile-redesign-workspace.tsx` + `features/staff/components/mobile/*` dùng hệ thiết kế RIÊNG `staff-brand-*` + mã màu hex cứng (ví dụ `#0F4D3A`) khai báo trong `app/globals.css`, kèm các override `dashboard-density` với `!important`. Bottom-nav 4 tab; máy trạng thái chấm công `staff-attendance-machine.ts`.
- **Component trùng lặp cần loại bỏ**: `staff-redesign-workspace.tsx`, `staff-operations-workspace.tsx`, `staff-mobile-workspace.tsx`, `staff-ui-reset-placeholder.tsx`.
- **Logic nghiệp vụ dùng chung**: `lib/staff-permissions.ts` (danh mục vai trò/quyền), `features/staff/services/staff-payroll-compute.ts`, các dịch vụ chấm công, `getStaffOperationsBundle`.

Phạm vi nỗ lực này là UI/UX/layout + kiến trúc frontend dùng chung. Hợp đồng API backend và schema DB giữ nguyên 1:1 (không thay đổi) trừ khi được xác nhận rõ ràng về sau.

**Out of scope (ngoài phạm vi):**

- Thay đổi backend/API contract hoặc schema cơ sở dữ liệu.
- Đường ống chạy lương (payroll-run pipeline) — là một nỗ lực riêng trong tương lai.

## Glossary

- **HR_Workspace**: Bề mặt quản lý nhân sự phía admin, hiện thực tại `components/dashboard-v2/real/staff-workspace-v2.tsx`.
- **PWA_Staff_App**: Ứng dụng web tiến bộ (PWA) dành cho nhân viên, hiện thực tại `features/staff/components/staff-mobile-redesign-workspace.tsx`.
- **Design_Token**: Biến CSS dạng `var(--d-*)` mô tả màu sắc, khoảng cách, bo góc, đổ bóng, chuyển động và các giá trị nền tảng của hệ thiết kế dùng chung.
- **Shared_Design_System**: Tập hợp Design_Token và quy ước thị giác được CẢ HAI bề mặt sử dụng.
- **HR_UI_Kit**: Bộ component giao diện dùng chung (ví dụ StatusPill, ShiftChip, AttendanceClock) chạy được trên cả HR_Workspace và PWA_Staff_App.
- **View_Model_Module**: Module ánh xạ dữ liệu nghiệp vụ (domain) sang biểu diễn hiển thị `{label, tone, icon}`, được import bởi cả hai bề mặt.
- **StatusPill**: Thành phần hiển thị một trạng thái dưới dạng nhãn + màu (tone) + icon nhất quán.
- **ShiftChip**: Thành phần hiển thị thông tin một ca làm việc.
- **AttendanceClock**: Thành phần đồng hồ chấm công (hero clock) hiển thị thời gian thực và nguồn xác thực (GPS/QR/WiFi).
- **Attendance_State**: Trạng thái chấm công của nhân viên do `staff-attendance-machine.ts` quản lý (ví dụ chưa vào ca, đang làm, đã ra ca).
- **Approval_Request**: Yêu cầu cần duyệt (ví dụ nghỉ phép, đổi ca, sửa chấm công) hiển thị qua ApprovalCard.
- **Concept_Surface_Mapping**: Bảng ánh xạ một khái niệm dùng chung tới cách render của khái niệm đó trên từng bề mặt, dùng để bảo đảm hiển thị đồng nhất.
- **Realtime_Channel**: Kênh đồng bộ thời gian thực hiện có mà hệ thống dùng để phản ánh thay đổi giữa hai bề mặt.
- **Permission_Gating**: Cơ chế kiểm soát hiển thị/thao tác dựa trên vai trò và quyền trong `lib/staff-permissions.ts`.
- **Role_Module**: Một khối nội dung/chức năng vận hành của PWA_Staff_App gắn với một nghiệp vụ cụ thể (ví dụ Bếp, Thu ngân, Phục vụ, Giao hàng, Kế toán, Marketing, Điều hành), được mở khoá theo quyền hiệu lực của nhân viên.
- **Module_Registry**: Bảng đăng ký toàn bộ Role_Module khả dụng của PWA_Staff_App, mỗi mục khai báo định danh, nhãn, icon, quyền yêu cầu (gate) và độ ưu tiên hiển thị.
- **Effective_Permissions**: Tập quyền hiệu lực cuối cùng của một tài khoản, do `getStaffEffectivePermissions` (services/staff-permission-service.ts) phân giải từ vai trò + quyền tài khoản, có áp sàn quyền cho tài khoản quản trị.
- **Baseline_Module**: Role_Module luôn hiển thị cho mọi nhân viên bất kể vai trò (tối thiểu: Hôm nay/chấm công và Hồ sơ).
- **Anti_Fraud_Rule**: Quy tắc chống gian lận chấm công hiện có (ví dụ kiểm tra GPS/QR/WiFi).
- **Touch_Target**: Vùng chạm tối thiểu trên thiết bị cảm ứng, đo bằng pixel.
- **Safe_Area**: Vùng an toàn của màn hình thiết bị (notch, home indicator) phản ánh qua `env(safe-area-inset-*)`.

## Requirements

### Requirement 1: Hệ thiết kế dùng chung (Shared Design System)

**User Story:** As một kỹ sư frontend, I want một bộ Design_Token thống nhất phục vụ cả desktop và mobile, so that hai bề mặt dùng chung ngôn ngữ thiết kế và không còn lệ thuộc mã màu cứng.

#### Acceptance Criteria

1. THE Shared_Design_System SHALL định nghĩa các Design_Token `var(--d-*)` bao gồm token touch target tối thiểu (giá trị ≥ 44px theo cả chiều rộng và chiều cao), token safe-area inset cho cả 4 cạnh (top, right, bottom, left), token chiều cao bottom-nav (giá trị trong khoảng 56px đến 80px), và token kích thước hero clock, trong đó mỗi token có đúng một giá trị mặc định xác định.
2. THE PWA_Staff_App SHALL tham chiếu toàn bộ giá trị màu sắc, khoảng cách, bo góc và đổ bóng thông qua Design_Token `var(--d-*)`, với 0 lần khai báo lớp `staff-brand-*` và 0 mã màu hex viết cứng trong các tệp kiểu của ứng dụng.
3. WHEN một thành phần của PWA_Staff_App render màu thương hiệu, THE PWA_Staff_App SHALL lấy giá trị từ Design_Token tương ứng thay vì bất kỳ giá trị hex viết trực tiếp nào (ví dụ `#0F4D3A`).
4. THE Shared_Design_System SHALL áp dụng mọi kiểu hiển thị với 0 khai báo `!important` trong các tệp kiểu thuộc phạm vi hệ thiết kế.
5. WHERE một bề mặt cần biến thể giao diện riêng, THE Shared_Design_System SHALL cung cấp biến thể đó qua Design_Token có phạm vi (scoped token) kế thừa từ cùng tập token gốc `var(--d-*)`, thay vì một hệ token tách rời.
6. WHEN hệ token được mở rộng cho nhu cầu mobile, THE HR_Workspace SHALL tiếp tục render với 0 sai khác trực quan (visual regression) so với ảnh chụp tham chiếu trước khi mở rộng, khi sử dụng cùng các Design_Token `var(--d-*)`.
7. IF một Design_Token được tham chiếu nhưng chưa được định nghĩa trong Shared_Design_System, THEN THE Shared_Design_System SHALL áp dụng giá trị mặc định dự phòng (fallback) đã khai báo và ghi nhận một chỉ báo lỗi cho biết token bị thiếu, mà không làm gián đoạn quá trình render.

### Requirement 2: Bộ component HR dùng chung (HR UI Kit)

**User Story:** As một kỹ sư frontend, I want một HR_UI_Kit dùng chung cho cả hai bề mặt, so that các thành phần giao diện được tái sử dụng và hiển thị nhất quán.

#### Acceptance Criteria

1. THE HR_UI_Kit SHALL cung cấp tối thiểu 11 component dùng chung gồm StatusPill, ShiftChip, AttendanceClock, ApprovalCard, StaffIdentityCard, MetricStrip, PermissionMatrix, FormField, ListRow, EmptyState và Sheet/Drawer/Modal, mỗi component được định danh duy nhất và có thể import từ HR_UI_Kit.
2. WHEN HR_Workspace render một khái niệm dùng chung (status, shift, attendance, approval, staff identity, metric, permission, form field, list row, empty state, overlay), THE HR_Workspace SHALL sử dụng component tương ứng từ HR_UI_Kit thay vì component tự định nghĩa cục bộ.
3. WHEN PWA_Staff_App render một khái niệm dùng chung (status, shift, attendance, approval, staff identity, metric, permission, form field, list row, empty state, overlay), THE PWA_Staff_App SHALL sử dụng component tương ứng từ HR_UI_Kit thay vì component tự định nghĩa cục bộ.
4. WHEN một component của HR_UI_Kit được render, THE HR_UI_Kit SHALL lấy 100% giá trị thị giác (màu sắc, khoảng cách, kiểu chữ, bo góc) từ Design_Token của Shared_Design_System và SHALL KHÔNG dùng giá trị thị giác hard-code nằm ngoài Design_Token.
5. WHEN cùng một component của HR_UI_Kit được render với cùng dữ liệu đầu vào trên cả HR_Workspace và PWA_Staff_App, THE HR_UI_Kit SHALL tạo ra nhãn văn bản giống nhau từng ký tự, cùng một tone màu (cùng Design_Token màu) và cùng một icon (cùng định danh icon).
6. IF dữ liệu đầu vào của một component thiếu trường bắt buộc hoặc chứa giá trị nằm ngoài tập giá trị được hỗ trợ, THEN THE HR_UI_Kit SHALL render trạng thái thay thế xác định (fallback) và giữ nguyên bố cục mà không gây lỗi render, đồng thời hiển thị chỉ báo cho biết dữ liệu không hợp lệ.

### Requirement 3: Module view-model nghiệp vụ dùng chung

**User Story:** As một kỹ sư frontend, I want một View_Model_Module ánh xạ dữ liệu nghiệp vụ sang biểu diễn hiển thị, so that nhãn và màu cho các khái niệm dùng chung không bao giờ lệch nhau giữa hai bề mặt.

#### Acceptance Criteria

1. THE View_Model_Module SHALL ánh xạ mỗi Attendance_State sang một biểu diễn `{label, tone, icon}`, trong đó label là chuỗi không rỗng dài tối đa 50 ký tự, tone là một giá trị thuộc tập tone đã định nghĩa của hệ thiết kế, và icon là một định danh icon không rỗng.
2. THE View_Model_Module SHALL ánh xạ mỗi loại Approval_Request sang một biểu diễn `{label, tone, icon}` theo cùng ràng buộc ở tiêu chí 1.
3. THE View_Model_Module SHALL ánh xạ mỗi vai trò trong `lib/staff-permissions.ts` sang một biểu diễn `{label, tone, icon}` theo cùng ràng buộc ở tiêu chí 1.
4. THE View_Model_Module SHALL ánh xạ mỗi trạng thái lương (payroll status) sang một biểu diễn `{label, tone, icon}` theo cùng ràng buộc ở tiêu chí 1.
5. WHEN HR_Workspace cần hiển thị một khái niệm dùng chung, THE HR_Workspace SHALL lấy biểu diễn hiển thị của khái niệm đó từ View_Model_Module.
6. WHEN PWA_Staff_App cần hiển thị một khái niệm dùng chung, THE PWA_Staff_App SHALL lấy biểu diễn hiển thị của khái niệm đó từ View_Model_Module.
7. IF một giá trị nghiệp vụ không có ánh xạ trong View_Model_Module, THEN THE View_Model_Module SHALL trả về một biểu diễn fallback xác định gồm `{label, tone, icon}` mà không phát sinh lỗi làm gián đoạn render.
8. WHEN cùng một giá trị nghiệp vụ được biểu diễn trên cả HR_Workspace và PWA_Staff_App, THE View_Model_Module SHALL trả về cùng một biểu diễn `{label, tone, icon}` (giống nhau từng ký tự nhãn, cùng tone, cùng định danh icon) cho cả hai bề mặt.

### Requirement 4: Đại tu layout HR_Workspace (admin)

**User Story:** As một quản lý nhân sự, I want HR_Workspace được bố cục ưu tiên vận hành với các khu vực rõ ràng, so that tôi nắm nhanh tình hình trong ngày và thao tác hiệu quả.

#### Acceptance Criteria

1. WHEN một quản lý nhân sự mở HR_Workspace, THE HR_Workspace SHALL hiển thị snapshot "Hôm nay" ở vị trí trên cùng (above the fold) bao gồm tối thiểu các chỉ số: số nhân viên đang trong ca, số nhân viên vắng/đi muộn, số yêu cầu chấm công chờ duyệt, và số ca chưa có người nhận, với dữ liệu giới hạn trong ngày làm việc hiện tại (00:00–23:59 theo múi giờ địa phương).
2. THE HR_Workspace SHALL tổ chức nội dung thành đúng 5 khu vực có nhãn rõ ràng theo thứ tự: Đội ngũ, Ca & Lịch, Chấm công & Duyệt, Lương, và Hồ sơ & Tuân thủ.
3. WHILE chiều rộng khung hiển thị nhỏ hơn 768px, THE HR_Workspace SHALL hiển thị dữ liệu dạng bảng dưới dạng thẻ (card) thay vì bảng, với mỗi bản ghi tương ứng một thẻ.
4. WHILE chiều rộng khung hiển thị lớn hơn hoặc bằng 768px, THE HR_Workspace SHALL hiển thị dữ liệu dạng bảng dưới dạng bảng (table).
5. WHEN một quản lý nhân sự mở chi tiết một nhân viên, THE HR_Workspace SHALL hiển thị một drawer có phần header định danh nhân viên (StaffIdentityCard) và trạng thái ca được cập nhật trong vòng tối đa 5 giây kể từ khi trạng thái ca thay đổi.
6. IF dữ liệu snapshot "Hôm nay" hoặc trạng thái ca không tải được, THEN THE HR_Workspace SHALL hiển thị thông báo lỗi cho biết dữ liệu không khả dụng và giữ nguyên bố cục 5 khu vực mà không làm hỏng giao diện.
7. WHEN quá trình đại tu layout hoàn tất, THE HR_Workspace SHALL hiển thị đầy đủ các view nghiệp vụ hiện có (Đội ngũ, Ca làm, Lương, Chấm công, Nâng cao) với chức năng tương đương trước khi đại tu.

### Requirement 5: Đại tu layout PWA_Staff_App (nhân viên)

**User Story:** As một nhân viên, I want ứng dụng PWA có bố cục mới tối ưu cho thao tác di động, so that tôi chấm công, xem ca và gửi yêu cầu thuận tiện trên điện thoại.

#### Acceptance Criteria

1. THE PWA_Staff_App SHALL hiển thị thanh bottom-nav cố định ở cạnh dưới màn hình, trong đó thành phần các tab được phân giải theo vai trò/quyền của nhân viên (xem Requirement 10), luôn bao gồm tab "Hôm nay" và tab "Hồ sơ", chứa tối đa 5 tab, và luôn có đúng một tab ở trạng thái active tại mọi thời điểm.
2. THE PWA_Staff_App SHALL hiển thị một AttendanceClock dạng hero ở đầu tab "Hôm nay", hiển thị thời gian hiện tại cập nhật mỗi 1 giây, kèm đúng 3 chip nguồn xác thực: GPS, QR và WiFi.
3. WHEN một nhân viên chạm vào một chip nguồn xác thực (GPS, QR hoặc WiFi), THE PWA_Staff_App SHALL hiển thị trạng thái của chip đó là một trong các giá trị: khả dụng, không khả dụng, hoặc đang kiểm tra.
4. WHEN một nhân viên mở tab "Ca & Chấm công", THE PWA_Staff_App SHALL hiển thị lịch ca của 7 ngày trong tuần hiện tại (Thứ Hai đến Chủ Nhật), mỗi ngày hiển thị các ca được phân công hoặc nhãn cho biết không có ca.
5. WHEN một nhân viên mở tab "Yêu cầu", THE PWA_Staff_App SHALL hiển thị danh sách các Approval_Request của nhân viên đó dưới dạng ApprovalCard, mỗi card hiển thị tối thiểu loại yêu cầu, ngày tạo và trạng thái duyệt.
6. IF không có Approval_Request nào để hiển thị trong tab "Yêu cầu", THEN THE PWA_Staff_App SHALL hiển thị thông báo trạng thái rỗng cho biết không có yêu cầu nào.
7. THE PWA_Staff_App SHALL cung cấp trong tab "Hồ sơ" ba chức năng riêng biệt: đổi mật khẩu, xem lương ở chế độ chỉ đọc (không có thành phần cho phép chỉnh sửa), và báo cáo sự cố (incident report).
8. THE PWA_Staff_App SHALL render mọi giá trị thị giác (màu sắc, khoảng cách, kiểu chữ) từ Design_Token của Shared_Design_System, không sử dụng giá trị thị giác cố định nằm ngoài Design_Token.
9. THE PWA_Staff_App SHALL được xây dựng theo nguyên tắc mobile-first và SHALL KHÔNG hiển thị bố cục desktop nhiều cột (multi-column) hay sidebar dành riêng cho desktop; toàn bộ nội dung SHALL trình bày trong một cột dọc duy nhất với chiều rộng tối đa giới hạn (≤ 640px) căn giữa, ở mọi kích thước khung hiển thị.

### Requirement 6: Đồng bộ liên bề mặt theo thời gian thực

**User Story:** As một người dùng của hệ thống HR, I want các khái niệm dùng chung hiển thị đồng nhất và thay đổi được phản ánh theo thời gian thực giữa hai bề mặt, so that admin và nhân viên luôn nhìn thấy cùng một sự thật.

#### Acceptance Criteria

1. THE Concept_Surface_Mapping SHALL định nghĩa, với mỗi khái niệm dùng chung, cách render khái niệm đó trên HR_Workspace và trên PWA_Staff_App.
2. WHERE một khái niệm xuất hiện trên cả hai bề mặt, THE Concept_Surface_Mapping SHALL quy định cùng nhãn (giống nhau từng ký tự), cùng tone màu (cùng mã tone) và cùng định danh icon cho khái niệm đó.
3. WHEN một quản lý nhân sự duyệt một Approval_Request trên HR_Workspace, THE PWA_Staff_App SHALL phản ánh trạng thái đã duyệt qua Realtime_Channel trong vòng tối đa 3 giây kể từ khi thao tác duyệt hoàn tất.
4. WHEN một quản lý nhân sự phân ca trên HR_Workspace, THE PWA_Staff_App SHALL phản ánh ca được phân qua Realtime_Channel trong vòng tối đa 3 giây kể từ khi thao tác phân ca hoàn tất.
5. WHEN một quản lý nhân sự đặt lại mật khẩu của một nhân viên trên HR_Workspace, THE PWA_Staff_App SHALL phản ánh thay đổi đó qua Realtime_Channel trong vòng tối đa 3 giây kể từ khi thao tác hoàn tất.
6. WHEN một nhân viên thực hiện chấm công trên PWA_Staff_App, THE HR_Workspace SHALL phản ánh Attendance_State mới qua Realtime_Channel trong vòng tối đa 3 giây kể từ khi chấm công hoàn tất.
7. IF Realtime_Channel không khả dụng hoặc đồng bộ vượt quá 3 giây, THEN THE bề mặt nhận SHALL hiển thị chỉ báo trạng thái chưa đồng bộ và giữ nguyên dữ liệu đã hiển thị trước đó.
8. WHEN Realtime_Channel kết nối lại, THE bề mặt nhận SHALL áp dụng các thay đổi đang chờ và xóa chỉ báo chưa đồng bộ trong vòng tối đa 3 giây.

### Requirement 7: Khả năng truy cập và đáp ứng (Accessibility & Responsive)

**User Story:** As một người dùng, I want giao diện đáp ứng và dễ truy cập trên mọi thiết bị, so that tôi sử dụng được thoải mái bất kể kích thước màn hình hay phương thức nhập liệu.

#### Acceptance Criteria

1. THE Shared_Design_System SHALL cấp cho mọi phần tử tương tác một Touch_Target có chiều rộng và chiều cao tối thiểu 44 CSS pixel, và khoảng cách tối thiểu 8 CSS pixel giữa hai Touch_Target liền kề.
2. WHEN một phần tử tương tác nhận focus bằng bàn phím, THE Shared_Design_System SHALL hiển thị chỉ báo focus-visible có độ dày đường viền tối thiểu 2 CSS pixel và đạt tỷ lệ tương phản tối thiểu 3:1 so với màu nền liền kề.
3. THE Shared_Design_System SHALL bảo đảm tỷ lệ tương phản màu giữa văn bản và nền đạt tối thiểu 4.5:1 cho văn bản thường (kích thước dưới 18pt hoặc dưới 14pt in đậm) và tối thiểu 3:1 cho văn bản lớn (từ 18pt hoặc 14pt in đậm trở lên).
4. THE PWA_Staff_App SHALL áp dụng padding tôn trọng Safe_Area của thiết bị thông qua `env(safe-area-inset-*)` cho cả bốn cạnh (top, right, bottom, left) sao cho không có phần tử tương tác nào bị che bởi vùng notch, thanh trạng thái, hoặc thanh điều hướng hệ thống.
5. WHEN một khu vực nội dung đang tải, không có dữ liệu, hoặc gặp lỗi, THE HR_UI_Kit SHALL hiển thị tương ứng đúng một trong ba trạng thái loading, empty, hoặc error với cùng một bố cục và thành phần thị giác nhất quán trên mọi khu vực nội dung, trong đó trạng thái error bao gồm thông báo cho biết nguyên nhân lỗi và một hành động thử lại.
6. THE Shared_Design_System SHALL định nghĩa các token chuyển động (motion token) quy định thời lượng (duration) và đường cong gia tốc (easing) cho hiệu ứng giao diện, với giá trị thời lượng nằm trong khoảng 100 đến 500 mili giây.
7. WHILE thiết bị bật thiết lập `prefers-reduced-motion: reduce`, THE Shared_Design_System SHALL vô hiệu hóa hoặc giảm hiệu ứng chuyển động xuống thời lượng tối đa 0 mili giây.

### Requirement 8: Dọn dẹp component cũ (Legacy Cleanup)

**User Story:** As một kỹ sư bảo trì, I want loại bỏ các component trùng lặp đã chết, so that codebase gọn gàng và không gây nhầm lẫn.

#### Acceptance Criteria

1. THE HR_Workspace và PWA_Staff_App SHALL không chứa bất kỳ câu lệnh import, export, render, hay tham chiếu định danh nào (tĩnh hoặc động) tới các component `staff-redesign-workspace.tsx`, `staff-operations-workspace.tsx`, `staff-mobile-workspace.tsx`, và `staff-ui-reset-placeholder.tsx`, được xác minh bằng số lượng kết quả tìm kiếm toàn bộ mã nguồn bằng 0 cho mỗi tên file.
2. WHEN tất cả 4 component trùng lặp đã chết được loại bỏ, THE bộ kiểm thử bảo vệ (guard tests) hiện có SHALL hoàn tất với 100% số test case vượt qua và 0 test case thất bại.
3. WHEN quá trình dọn dẹp hoàn tất, THE build và type-check của HR_Workspace và PWA_Staff_App SHALL hoàn tất với 0 lỗi và 0 cảnh báo về module hoặc tham chiếu bị thiếu.
4. IF một component trong số 4 component trùng lặp vẫn còn ít nhất 1 tham chiếu (import, export, render, hoặc tham chiếu định danh) tại bất kỳ vị trí nào trong mã nguồn, THEN THE quá trình dọn dẹp SHALL giữ lại file component đó nguyên vẹn cho tới khi mọi tham chiếu được chuyển sang HR_UI_Kit.
5. IF việc loại bỏ một component khiến bất kỳ guard test nào chuyển từ vượt qua sang thất bại, THEN THE quá trình dọn dẹp SHALL khôi phục (rollback) việc loại bỏ component đó về trạng thái trước khi xóa và giữ nguyên các component còn lại.

### Requirement 9: Ràng buộc phi chức năng và không hồi quy

**User Story:** As một chủ sở hữu hệ thống, I want đợt đại tu giao diện không làm thay đổi backend hay phá vỡ các luồng nghiệp vụ hiện có, so that hệ thống vẫn an toàn và ổn định.

#### Acceptance Criteria

1. THE đợt đại tu SHALL giữ nguyên 1:1 hợp đồng API backend hiện có, bao gồm tên endpoint, phương thức, cấu trúc tham số yêu cầu và cấu trúc dữ liệu phản hồi, không thêm/xóa/đổi tên bất kỳ trường nào.
2. THE đợt đại tu SHALL giữ nguyên 1:1 schema cơ sở dữ liệu hiện có, không thêm/xóa/đổi tên bảng, cột, kiểu dữ liệu, ràng buộc hoặc chỉ mục.
3. THE HR_Workspace và PWA_Staff_App SHALL giữ nguyên cơ chế Permission_Gating dựa trên `lib/staff-permissions.ts`, sao cho với mỗi vai trò người dùng, tập hành động được phép và bị chặn giống hệt hành vi trước đợt đại tu.
4. THE PWA_Staff_App SHALL giữ nguyên các Anti_Fraud_Rule chấm công hiện có, sao cho với cùng một dữ liệu đầu vào chấm công, kết quả chấp nhận hoặc từ chối giống hệt hành vi trước đợt đại tu.
5. WHEN một nhân viên trải qua luồng tạo nhân viên, phân quyền, gán mã nhân viên (employee-code), hoặc đăng nhập lần đầu (first-login) trên PWA_Staff_App, THE hệ thống SHALL hoàn tất luồng đó với cùng kết quả đầu ra và cùng trạng thái dữ liệu cuối cùng như hành vi trước đợt đại tu, không phát sinh lỗi mới.
6. WHERE một thay đổi đòi hỏi điều chỉnh backend/API hoặc schema cơ sở dữ liệu, THE đợt đại tu SHALL hoãn thay đổi đó và không áp dụng cho tới khi nhận được xác nhận chấp thuận rõ ràng bằng văn bản từ chủ sở hữu hệ thống.
7. IF một thay đổi giao diện làm sai lệch hợp đồng API, schema cơ sở dữ liệu, Permission_Gating hoặc Anti_Fraud_Rule so với hành vi hiện tại, THEN THE đợt đại tu SHALL chặn việc đưa thay đổi đó vào và phát thông báo chỉ rõ thành phần bị vi phạm, đồng thời giữ nguyên trạng thái hệ thống hiện có.

### Requirement 10: PWA theo vai trò, vận hành theo quy trình (Role-based operational app)

**User Story:** As một nhân viên với một vai trò cụ thể (bếp, thu ngân, phục vụ, giao hàng, kế toán, marketing, quản lý), I want PWA_Staff_App chỉ hiển thị đúng các khối nội dung và chức năng phục vụ công việc của vai trò mình, so that tôi thao tác đúng quy trình mà không bị nhiễu bởi tính năng không liên quan.

#### Acceptance Criteria

1. THE PWA_Staff_App SHALL phân giải tập Role_Module hiển thị từ Effective_Permissions của nhân viên (do `getStaffEffectivePermissions` cung cấp), thay vì hiển thị một bố cục cố định giống nhau cho mọi vai trò.
2. THE Module_Registry SHALL khai báo cho mỗi Role_Module một quyền yêu cầu (gate) thuộc tập `StaffPermissionKey`, một định danh duy nhất, một nhãn, một icon và một độ ưu tiên hiển thị xác định.
3. WHEN Effective_Permissions của nhân viên chứa quyền gate của một Role_Module, THE PWA_Staff_App SHALL cho phép truy cập Role_Module đó; WHEN Effective_Permissions KHÔNG chứa quyền gate, THE PWA_Staff_App SHALL ẩn hoàn toàn Role_Module đó khỏi bottom-nav và khỏi mọi điểm điều hướng.
4. THE PWA_Staff_App SHALL luôn hiển thị các Baseline_Module (tối thiểu "Hôm nay" gồm chấm công và "Hồ sơ") cho mọi nhân viên, kể cả nhân viên không có bất kỳ quyền vận hành chuyên biệt nào.
5. THE Module_Registry SHALL ánh xạ tối thiểu các Role_Module vận hành sau tới quyền gate tương ứng: Bếp → `kitchen.view`; Thu ngân → `payments.confirm`; Phục vụ → `tables.manage`; Giao hàng → `online.manage`; Kế toán → `reports.view`; Marketing → `promotions.manage`; Điều hành (duyệt & phân ca) → `approvals.review`.
6. WHEN nhiều Role_Module được mở khoá vượt quá số ô còn lại của bottom-nav (sau khi trừ các Baseline_Module), THE PWA_Staff_App SHALL chọn các Role_Module theo độ ưu tiên giảm dần để giữ tổng số tab ≤ 5, và SHALL đưa các Role_Module còn lại vào một điểm truy cập phụ (ví dụ trong tab "Hôm nay") thay vì loại bỏ.
7. WHEN một nhân viên mở một Role_Module, THE PWA_Staff_App SHALL chỉ hiển thị các hành động mà Effective_Permissions của nhân viên cho phép, và SHALL ẩn hoặc vô hiệu hoá các hành động không được phép.
8. THE Role_Module gating của PWA_Staff_App SHALL nhất quán với Permission_Gating phía server (server actions/route handlers), sao cho một hành động bị ẩn trên giao diện cũng bị từ chối ở phía server nếu được gọi trực tiếp, và một hành động hiển thị cũng được server chấp nhận với cùng Effective_Permissions.
9. IF Effective_Permissions không tải được hoặc rỗng, THEN THE PWA_Staff_App SHALL hiển thị chỉ các Baseline_Module kèm chỉ báo cho biết quyền chưa sẵn sàng, mà không để lộ Role_Module vận hành nào.
10. WHEN Effective_Permissions của một nhân viên thay đổi (ví dụ admin đổi vai trò) và được phản ánh qua Realtime_Channel, THE PWA_Staff_App SHALL phân giải lại tập Role_Module hiển thị để khớp với quyền mới trong vòng tối đa 3 giây mà không cần đăng nhập lại.
