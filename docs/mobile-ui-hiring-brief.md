# Brief tuyển UI Mobile cho LogiVN

## 1. Tóm tắt dự án

LogiVN là nền tảng SaaS cho nhà hàng, quán cafe và chuỗi F&B nhỏ tại Việt Nam. Sản phẩm giúp quán vận hành quy trình gọi món bằng QR, nhận đơn tại bàn, đặt món online, đặt bàn, thanh toán VietQR, quản lý bếp, bàn, nhân viên, tồn kho, báo cáo và trợ lý AI vận hành.

Mục tiêu của phần UI Mobile là thiết kế lại hoặc hoàn thiện trải nghiệm trên điện thoại để người dùng thao tác nhanh, rõ, ít lỗi trong môi trường quán đông khách. Mobile không phải bản thu nhỏ của desktop. Đây là kênh chính cho khách gọi món, nhân viên xử lý việc trong ca, và chủ quán xem nhanh tình hình khi không ngồi trước máy tính.

Trang production hiện tại: https://logivn.com

## 2. Bối cảnh sản phẩm hiện tại

Sản phẩm đang là web app xây bằng Next.js, TypeScript, Tailwind CSS và Supabase. Mobile trước mắt nên được hiểu là mobile web/PWA responsive, không phải native app độc lập, trừ khi đội phát triển quyết định tách riêng sau này.

Các nhóm route chính:

- Public website: landing page, pricing, blog, trang SEO địa phương/giải pháp/so sánh.
- Customer ordering: khách quét QR tại bàn hoặc mở link online để xem menu, chọn món, thanh toán và theo dõi đơn.
- Customer reservation: khách đặt bàn, đặt cọc VietQR nếu cần, xem trạng thái giữ bàn.
- Owner dashboard: chủ quán/quản lý vận hành đơn, bếp, bàn, menu, nhân sự, thanh toán, đặt bàn, khuyến mãi, tồn kho, báo cáo, AI.
- Staff mobile: nhân viên dùng điện thoại để chấm công, xem việc cần làm, xử lý yêu cầu trong ca, gửi đề xuất nghỉ/đổi ca/tăng ca.
- Platform admin: khu nội bộ LogiVN để theo dõi tenant, billing, AI, maps, cron, release, security. Nhóm này không phải ưu tiên mobile đầu tiên.

## 3. Người dùng mục tiêu

### Khách hàng của quán

Khách dùng điện thoại cá nhân, thường đang ngồi tại bàn hoặc đặt món từ xa. Họ cần menu rõ, thao tác chọn món nhanh, ít nhập liệu, thanh toán quen thuộc bằng VietQR hoặc tiền mặt, và luôn biết đơn đang ở trạng thái nào.

Nỗi đau chính:

- Không muốn tải app.
- Không muốn đợi nhân viên giải thích.
- Dễ bỏ cuộc nếu menu khó xem, nút nhỏ, checkout dài, hoặc thanh toán không rõ.
- Khi thanh toán/đặt cọc, cần thấy số tiền, nội dung chuyển khoản và trạng thái xác nhận thật rõ.

### Chủ quán và quản lý

Chủ quán cần nhìn nhanh nhịp vận hành: đơn mới, bàn đang phục vụ, đơn trễ, thanh toán chờ xác nhận, doanh thu, món bán chạy, tồn kho, nhân sự. Họ có thể dùng desktop khi setup, nhưng mobile vẫn phải đủ tốt để kiểm tra và xử lý nhanh trong giờ đông.

Nỗi đau chính:

- Bị rối khi đơn, bếp, thanh toán, bàn và nhân viên nằm rải rác nhiều nơi.
- Cần trạng thái realtime nhưng giao diện không được quá nặng.
- Cần dashboard đủ dày thông tin, nhưng không được biến thành bảng desktop bị ép vào màn hình nhỏ.

### Nhân viên phục vụ, bếp, thu ngân

Nhân viên cần thao tác nhanh trong ca: nhận việc, xác nhận đơn, xem món đang chờ, gọi phục vụ, xử lý thanh toán, chấm công, gửi yêu cầu đổi ca/nghỉ phép. Giao diện phải dùng được bằng một tay, khi đang di chuyển, trong mạng không ổn định.

Nỗi đau chính:

- Không có thời gian đọc nhiều.
- Cần nút rõ, phản hồi tức thì, trạng thái ưu tiên dễ nhìn.
- Có thể mất mạng tạm thời, nên cần trạng thái "chờ đồng bộ" hoặc retry rõ ràng.

## 4. Mục tiêu thiết kế Mobile UI

1. Biến LogiVN thành trải nghiệm mobile-first thực sự cho khách gọi món và nhân viên vận hành.
2. Chuẩn hóa hệ thống điều hướng mobile cho dashboard nhiều chức năng.
3. Giảm cảm giác "bảng quản trị desktop thu nhỏ" ở các màn vận hành.
4. Tạo hệ thống component mobile có thể mở rộng: card dữ liệu, hàng thao tác, bottom sheet, toast, dock hành động, form, filter, status timeline, map preview.
5. Đảm bảo UI dễ implement vào codebase hiện tại, có token màu, typography, spacing, trạng thái và handoff rõ trong Figma.

## 5. Phạm vi ưu tiên

### P0 - Bắt buộc thiết kế

- Customer QR ordering tại bàn.
- Customer online ordering cho pickup/delivery.
- Customer reservation/đặt bàn.
- Staff mobile workspace.
- Mobile dashboard shell cho chủ quán: overview, orders, kitchen, tables, payments.
- Component system mobile cốt lõi.

### P1 - Nên thiết kế trong cùng gói

- Menu management mobile.
- Promotions mobile.
- Inventory mobile.
- Staff management mobile.
- Analytics/report snapshot mobile.
- Settings/billing mobile.
- AI assistant surfaces trên mobile.

### P2 - Có thể làm sau

- Platform admin mobile.
- Landing/pricing mobile redesign sâu.
- Tablet/foldable layout nâng cao.
- Dark mode đầy đủ cho mọi surface.

## 6. Danh sách màn hình cần thiết kế

### A. Customer QR ordering tại bàn

1. Màn vào bàn qua QR: logo quán, tên bàn, trạng thái quán, CTA xem menu.
2. Menu chính: danh mục, tìm kiếm, món nổi bật, món hết hàng, badge khuyến mãi.
3. Chi tiết món: ảnh, mô tả, size/topping/modifier, ghi chú, số lượng, thêm vào giỏ.
4. Giỏ hàng: danh sách món, chỉnh số lượng, ghi chú, áp mã khuyến mãi, tổng tiền.
5. Gửi order: xác nhận món, trạng thái gửi thành công, hướng dẫn chờ quán xác nhận.
6. Theo dõi đơn: timeline đặt món, đã xác nhận, đang chuẩn bị, hoàn thành, chờ thanh toán.
7. Gọi nhân viên: chọn lý do hoặc gửi yêu cầu nhanh.
8. Chọn thanh toán: tiền mặt hoặc VietQR.
9. VietQR payment: QR code, số tiền, nội dung chuyển khoản, nút "Tôi đã thanh toán", trạng thái chờ xác nhận.
10. Thanh toán thành công và hóa đơn.
11. Lịch sử đơn tại bàn.
12. LogiBot cho khách: nút nổi, panel chat, gợi ý câu hỏi, action thêm món/mở thanh toán/gọi quán.

### B. Customer online ordering pickup/delivery

1. Trang menu online của quán.
2. Chọn hình thức nhận hàng: đến lấy hoặc giao hàng.
3. Chọn chi nhánh nếu quán có nhiều điểm bán.
4. Chọn địa chỉ giao hàng: nhập địa chỉ, map picker, gợi ý địa chỉ, quyền vị trí.
5. Delivery quote: khoảng cách, phí giao, ETA, trạng thái ngoài vùng giao.
6. Giỏ hàng và checkout: tên, số điện thoại, địa chỉ, ghi chú, mã khuyến mãi.
7. Chọn thanh toán: VietQR prepaid, thanh toán khi nhận, các phương thức ví/thẻ ở trạng thái future/disabled nếu chưa mở.
8. Theo dõi đơn delivery/pickup: trạng thái bếp, tài xế, bản đồ mini, ETA.
9. Hoàn thành đơn và receipt.
10. Empty, loading, error, retry, mất kết nối.

### C. Customer reservation

1. Trang đặt bàn của quán.
2. Chọn ngày, giờ, số khách, khu vực/ngồi trong nhà/ngoài trời nếu có.
3. Thông tin khách: tên, điện thoại, email tùy chọn, ghi chú.
4. Tóm tắt lịch đặt.
5. Cọc giữ bàn VietQR nếu chính sách yêu cầu.
6. Trạng thái chờ quán xác nhận cọc.
7. Đặt bàn thành công, checked-in, hết hạn, hủy, no-show.
8. Tìm đường đến quán và liên hệ hotline.

### D. Owner dashboard mobile

1. Mobile dashboard shell: header, bottom nav, menu tất cả chức năng, live action center, toast, quick action.
2. Overview hôm nay: doanh thu, đơn mở, bàn đang phục vụ, đơn trễ, thanh toán chờ xác nhận, readiness/setup task.
3. Orders board: filter trạng thái, filter kênh, search, list đơn dạng card, chi tiết đơn, action xác nhận/chuyển bếp/hoàn tất/hủy/xác nhận thanh toán.
4. Kitchen board: đơn theo khu vực, SLA, món đang làm, món xong, ưu tiên đơn trễ.
5. Tables & QR: trạng thái bàn, QR từng bàn, tải/in QR, bàn đang mở bill.
6. Payments: bill chờ thanh toán, VietQR chờ xác nhận, lịch sử thanh toán, trạng thái lỗi/sai số tiền.
7. Online orders: pickup/delivery, branch, dispatch/courier, map snapshot.
8. Reservations: lịch đặt, cọc, giữ bàn, check-in, no-show, chuyển sang bill.
9. Menu management: danh mục, món, ảnh, giá, topping, món hết hàng.
10. Promotions: mã giảm giá, điều kiện, trạng thái chạy/dừng.
11. Inventory: tồn kho, cảnh báo sắp hết, nhập/xuất/hủy, định lượng.
12. Staff: nhân viên, ca làm, quyền, trạng thái chấm công.
13. Analytics: snapshot doanh thu, AOV, món bán chạy, khung giờ cao điểm.
14. Settings: thông tin quán, VietQR, delivery settings, branch settings, billing.
15. AI surfaces: AI Ops, AI Menu, AI Growth, AI Support, Automation, Production readiness.

### E. Staff mobile workspace

1. Staff login/PIN login.
2. Trang ca làm hôm nay: tên nhân viên, ca hiện tại, đồng hồ, trạng thái thiết bị.
3. Chấm công: clock-in/clock-out bằng GPS, QR fallback, trạng thái ngoài vị trí, lỗi quyền vị trí.
4. Việc cần làm: đơn bếp, thanh toán chờ, yêu cầu gọi phục vụ, ưu tiên gấp.
5. Chi tiết việc: nội dung, bàn/đơn liên quan, action xử lý nhanh.
6. Yêu cầu cá nhân: nghỉ phép, đổi ca, tăng ca, lý do, ngày, trạng thái duyệt.
7. Offline queue: mất mạng, chờ đồng bộ, đồng bộ thành công/lỗi.
8. Thông báo trong ca.

## 7. Yêu cầu UX mobile

- Touch target tối thiểu 44px trên iOS và 48dp trên Android; CTA chính nên 56px trở lên.
- CTA quan trọng đặt ở vùng dễ chạm phía dưới, có safe-area cho iPhone home indicator.
- Không dùng hover làm cách duy nhất để hiểu tương tác.
- Mọi action mất hơn 100ms cần có loading/disabled state.
- Mọi lỗi cần có cách phục hồi: retry, đổi phương thức, gọi quán, quay lại bước trước.
- Không để toast, LogiBot, cart dock, bottom nav và bottom sheet che nhau.
- Không có horizontal scroll ngoài ý muốn trên 375px, 390px, 414px, 430px.
- Form mobile phải có label rõ, input phù hợp: phone dùng keyboard số/tel, tên dùng autocomplete name.
- Màn danh sách dài phải thiết kế theo card/list tối ưu mobile, không ép table desktop.
- Trạng thái realtime phải rõ: đang kết nối, đã kết nối, mất kết nối, dữ liệu cũ.
- Với thanh toán và đặt cọc, thông tin tiền và trạng thái xác nhận phải nổi bật hơn trang trí.

## 8. Hướng thiết kế hình ảnh

LogiVN nên tạo cảm giác ấm, tin cậy, gần với vận hành F&B Việt Nam nhưng vẫn đủ hiện đại để bán SaaS.

Màu hiện tại trong codebase:

- Primary green: `#0F4D3A`
- Warm background: `#FFF7EB`
- Sage secondary: `#A9C5A1`
- Accent orange: `#F28C28`
- Text dark: `#2B2B2B`

Designer có thể tinh chỉnh lại bảng màu mobile, nhưng cần giữ tinh thần thương hiệu: xanh vận hành, cam cảnh báo/hành động, nền ấm, tương phản tốt. Tránh để toàn bộ app thành một mảng màu đơn điệu. Cần có semantic colors riêng cho success, warning, danger, info, disabled.

Typography nên ưu tiên dễ đọc trên mobile. Body text không dưới 16px ở form/input. Hỗ trợ tiếng Việt tốt, dấu rõ, không dùng font quá mảnh. Có thể dùng system font hoặc Geist/system stack để dễ implement.

## 9. Component system cần bàn giao

Designer cần thiết kế tối thiểu các component sau trong Figma:

- App shell mobile: header, bottom nav, more menu, account/menu button.
- Button: primary, secondary, ghost, danger, icon-only, loading, disabled.
- Input: text, phone, textarea, search, select, segmented control, stepper số lượng.
- Card dữ liệu: order card, table card, menu item card, payment card, reservation card, staff task card.
- Status badge: order, payment, delivery, reservation, staff request, sync.
- Timeline/progress: order tracking, payment confirmation, reservation status.
- Bottom sheet, full-screen modal, confirmation dialog.
- Toast/snackbar/live alert.
- Empty state, loading skeleton, error state, offline state.
- Floating action/LogiBot trigger.
- Map preview, address search, delivery quote panel.
- QR payment block và receipt block.
- Filter chips, tabs, search/filter bar.
- Responsive data list cho dashboard thay thế table desktop.

## 10. Trạng thái bắt buộc cho mỗi flow

Mỗi màn hình quan trọng cần có:

- Default state.
- Loading/skeleton.
- Empty state.
- Error state có CTA sửa lỗi.
- Offline hoặc connection interrupted state nếu liên quan realtime/checkout/staff.
- Disabled state cho quyền/gói dịch vụ chưa mở.
- Success state.
- Destructive confirmation state nếu có hủy/xóa/từ chối.

## 11. Yêu cầu accessibility

- Contrast tối thiểu WCAG AA.
- Không dựa vào màu duy nhất để truyền trạng thái; cần label/icon.
- Icon-only button phải có tên/tooltip trong handoff.
- Text dài, tên món dài, địa chỉ dài, mã chuyển khoản dài phải có cách xuống dòng/copy/scroll hợp lý.
- Bottom sheet/dialog phải có title, close action rõ, focus order hợp lý khi implement.
- Hỗ trợ `prefers-reduced-motion`: animation chỉ dùng opacity/transform, không làm UI nhảy layout.

## 12. Yêu cầu bàn giao Figma

Freelancer/agency cần bàn giao:

1. File Figma có page rõ ràng: Cover, Design Tokens, Components, Customer, Owner Dashboard, Staff, Prototype, Handoff.
2. Component variants có naming nhất quán và auto-layout sạch.
3. Prototype click-through cho các flow P0.
4. Token màu, typography, spacing, radius, shadow, icon rules.
5. Spec responsive cho các viewport: 375, 390, 414, 430, 768.
6. Ghi chú interaction cho bottom sheet, toast, realtime status, payment flow, offline sync.
7. Asset export nếu có: icon custom, illustration, empty-state image.
8. Handoff cho developer: trạng thái, edge cases, copy tiếng Việt, rule truncate/wrap cho dữ liệu dài.

## 13. Tiêu chí nghiệm thu

Thiết kế được xem là đạt khi:

- Khách có thể đi từ quét QR đến gửi order và thanh toán mà không cần đọc hướng dẫn dài.
- Chủ quán có thể mở điện thoại và biết ngay việc nào cần xử lý trước.
- Nhân viên có thể xử lý việc trong ca bằng một tay, nút đủ lớn, trạng thái đủ rõ.
- Các flow tiền bạc như VietQR, cọc giữ bàn, xác nhận thanh toán không gây hiểu nhầm.
- Các màn dashboard mobile không dùng table desktop bị thu nhỏ.
- Có đầy đủ state để dev implement mà không phải tự bịa UI khi gặp lỗi/loading/empty/offline.
- Figma đủ rõ để estimate dev effort theo từng màn hình.

## 14. Phạm vi ngoài dự án UI này

- Không yêu cầu viết code nếu chỉ thuê UI designer.
- Không yêu cầu redesign backend, database hoặc business logic.
- Không yêu cầu native iOS/Android app nếu chưa có quyết định sản phẩm riêng.
- Không yêu cầu làm branding mới hoàn toàn, trừ khi có gói brand refresh riêng.
- Không yêu cầu thiết kế platform admin mobile trong giai đoạn đầu, trừ khi còn thời gian.

## 15. Gợi ý mô tả đăng tuyển ngắn

Chúng tôi cần thuê UI/UX designer thiết kế mobile-first cho LogiVN, một SaaS vận hành nhà hàng/quán cafe tại Việt Nam. Sản phẩm có các luồng chính: khách quét QR gọi món, đặt món online pickup/delivery, đặt bàn/cọc VietQR, dashboard chủ quán, bếp/đơn hàng/thanh toán, và staff mobile cho nhân viên trong ca.

Yêu cầu designer có kinh nghiệm với mobile app/web app phức tạp, dashboard vận hành, POS/F&B/e-commerce hoặc logistics là lợi thế. Kết quả cần là file Figma có design system mobile, prototype các flow P0, đầy đủ trạng thái loading/empty/error/offline, và handoff rõ cho đội dev Next.js/Tailwind.

Ưu tiên người hiểu touch target, safe-area, bottom navigation, bottom sheet, realtime status, form mobile, thanh toán QR và thiết kế cho môi trường thao tác nhanh.

## 16. Câu hỏi nên hỏi ứng viên

- Bạn đã từng thiết kế dashboard vận hành hoặc flow ordering/payment mobile chưa?
- Bạn sẽ xử lý dashboard nhiều chức năng trên mobile như thế nào: bottom nav, drawer, search, hay task-first navigation?
- Bạn có thể đưa ví dụ về cách thiết kế loading/error/offline state không?
- Với flow VietQR, bạn sẽ làm thế nào để khách không nhầm giữa "đã chuyển khoản" và "quán đã xác nhận"?
- Bạn bàn giao component variants và design tokens cho dev như thế nào?
- Bạn có thể làm một paid test nhỏ cho flow "QR menu -> cart -> VietQR -> tracking" không?

