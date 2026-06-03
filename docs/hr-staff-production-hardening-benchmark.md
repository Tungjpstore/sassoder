# LogiVN HR Staff Production Hardening Benchmark

Ngày rà soát: 2026-06-03

## Nguồn đã kiểm chứng trực tiếp

- [OWASP API1:2023 Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/): mọi API nhận object ID phải kiểm tra quyền trên chính object đó, không chỉ kiểm tra role tổng quát.
- [OWASP API5:2023 Broken Function Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa5-broken-function-level-authorization/): chức năng nhạy cảm cần permission riêng, không dùng quyền chung cho thao tác payroll/security.
- [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html): xác thực phải chứng minh người dùng kiểm soát authenticator; AAL2 yêu cầu hai yếu tố và có lựa chọn chống phishing; vòng đời authenticator cần xử lý mất cắp/vô hiệu hóa.
- [CISA Zero Trust Maturity Model](https://www.cisa.gov/zero-trust-maturity-model): truy cập nên chuyển từ mô hình tin theo vị trí sang quyết định least-privilege theo từng request, dựa trên identity, device, data và visibility.
- [Rippling Security](https://www.rippling.com/security): HR/IT platform lớn nhấn mạnh permissions, policy automation, access/device offboarding, audit/security frameworks, incident response và employee security training.
- [ADP Time & Attendance](https://www.adp.com/what-we-offer/time-and-attendance.aspx): time & attendance gắn với payroll accuracy, compliance, scheduling, labor forecasting/budgeting, attendance policy và leave case management.

Các trang Deputy/Homebase/When I Work/UKG/BambooHR bị chặn Cloudflare/JS wall hoặc trả 404 trong môi trường công cụ hiện tại, nên không dùng làm bằng chứng đã xác minh trong đợt này.

## Benchmark áp dụng vào LogiVN

1. Authorization theo object, không chỉ theo role.
   - Mọi thao tác staff/attendance/shift phải kiểm tra `restaurant_id`, `branch_id`, `staff_member_id`, actor và permission cụ thể.
   - Không để quyền chung như `approvals.review` duyệt dữ liệu payroll-impacting.

2. Dual-control cho payroll.
   - Chấm hộ, kết ca hộ, sửa công, long shift, offline sync, outside-location, device exception đều phải `pending` trước khi tính lương.
   - Người tạo/sửa không được tự duyệt.

3. Presence proof nhiều lớp.
   - GPS bắt buộc cho non-manual attendance.
   - QR/WiFi chỉ là bằng chứng bổ sung, không phải bypass GPS.
   - QR daily phải rotate ngắn, hash token, validate branch, atomic usage count.
   - Device session phải signed, có heartbeat, force logout và device trust.

4. Stale open attendance là trạng thái vận hành riêng.
   - Không gọi chung là “đang trong ca” nếu mở quá ngưỡng.
   - Phải hiện rõ row tồn đọng, cho quản lý kết ca hộ/sửa công và chuyển payroll `pending`.

5. File/media phải đi qua upload service.
   - Không cho staff tự nhập `avatarUrl` hoặc incident attachment URL tự do.
   - Storage path phải scoped theo `{restaurantId}/{staffMemberId}` và RLS kiểm tra `auth.uid()`.

6. Export là dữ liệu nhạy cảm.
   - Timesheet/payroll export cần `attendance.view` + quyền export, không dùng mỗi `activity_logs.export`.

7. Audit trail immutable-first.
   - Mỗi clock action, manual action, permission change, approval, incident report phải có staff activity log, notification/outbox nếu liên quan owner.

## Những điểm đã đưa vào code trong đợt này

- Manual clock-in/out và long shift được chuyển sang luồng pending review.
- Manual adjustment không còn tự `approved`, có approval request riêng.
- Approval endpoint/action yêu cầu `attendance.approve`.
- Timesheet export yêu cầu `attendance.view` + `activity_logs.export`.
- Staff incident Telegram event được thêm vào schema/formatter/permission fallback của Telegram worker.
- Staff app không còn gửi avatar URL/incident attachment URL tự do.
- Storage policy staff avatar giới hạn theo own staff folder.
- QR consumption có RPC atomic `consume_staff_attendance_qr_token`.
- Mobile copy nói rõ QR/WiFi vẫn cần GPS chính xác.

## Việc còn nên làm ở đợt tiếp theo

- Tách `active_open` và `stale_open` trong data model thay vì chỉ suy ra từ `clock_out_at is null`.
- Payroll readiness nên derive từ tất cả approval requests của attendance log, không chỉ một field `approval_state`.
- Thêm upload service riêng cho incident attachments nếu cần gửi ảnh/file vào Telegram.
- Viết E2E mô phỏng concurrent QR usage, stale open recovery và manager A sửa công nhưng manager A không được tự duyệt.
- Chạy SQL inventory production trước khi deploy migration liên quan open attendance.
