# SES Production Readiness Plan

Updated: 2026-06-22

## Mục tiêu

Đưa quy trình email của LogiVN về trạng thái có thể chứng minh với AWS rằng hệ thống gửi mail là hợp lệ, có kiểm soát reputation, có xử lý bounce/complaint, có quản lý consent/preference, và không dùng SES cho unsolicited bulk mail.

Khi hoàn tất kế hoạch này, LogiVN có thể mở lại yêu cầu SES Production Access bằng một evidence package thay vì chỉ trả lời mô tả bằng lời.

## Trạng thái hiện tại

- AWS SES case `178190906800099` đã bị từ chối lại sau appeal ngày 2026-06-22.
- `logivn.com` đã DKIM verified trong SES `us-east-1`, nhưng domain verification không đồng nghĩa với production sending access.
- App production không được bật `EMAIL_PROVIDER=ses` cho đến khi AWS duyệt production access.
- Hạ tầng mail đang có đường thay thế tốt hơn để xây lịch sử gửi sạch: LogiMail/BillionMail trên `mail.logivn.com`, Resend cho transactional app mail nếu key/domain sẵn sàng.
- LogiMail đã có nhiều mảnh cần thiết: mailbox `postmaster@`, `abuse@`, `support@`, DKIM/SPF/DMARC, warm-up, bounce/suppression, deliverability score, placement test và DMARC processing.

## Phạm vi

### Bao gồm

- Chuẩn hóa taxonomy email của LogiVN.
- Công khai chính sách và sender identity.
- Bật preference/unsubscribe cho email không bắt buộc.
- Gắn suppression/bounce/complaint vào đường gửi app.
- Warm-up và tạo evidence bằng Resend/LogiMail trước khi xin SES lại.
- Chuẩn bị SES re-application package.

### Không bao gồm

- Không tiếp tục gửi appeal SES ngay lập tức khi chưa có bằng chứng mới.
- Không chuyển inbound mail sang SES Receiving trong giai đoạn này.
- Không gửi marketing campaign lạnh, purchased list, scraped list hoặc affiliate campaign.
- Không dùng SES làm fallback bí mật khi account chưa được production access.

## Quyết định vận hành

1. Email production hiện tại dùng Resend hoặc LogiMail/BillionMail, không dùng SES.
2. `noreply@logivn.com` chỉ dùng cho email hệ thống thật sự không cần hội thoại. Email support/billing/onboarding ưu tiên `support@logivn.com`, `billing@logivn.com`, hoặc `hello@logivn.com` để tăng khả năng reply và trust.
3. Tách email thành 3 nhóm:
   - Required transactional: OTP, login/security, password reset, billing receipt, account status.
   - Operational configurable: reports, owner/staff notifications, reservation/order digests.
   - Marketing/growth: newsletter, promotion, product announcement. Nhóm này mặc định off cho đến khi có opt-in/unsubscribe hoàn chỉnh.
4. Chỉ xin SES lại sau khi có tối thiểu 14-30 ngày dữ liệu sạch: hard bounce thấp, complaint gần 0, queue ổn, không blacklist, sample content rõ ràng.

## Phase 0 - Đóng băng rủi ro SES

### Việc cần làm

- Giữ `EMAIL_PROVIDER` production ở Resend/LogiMail, không set `ses`.
- Ghi trạng thái SES là `blocked_by_aws_review` trong runbook/admin readiness.
- Không tạo thêm IAM key SES mới nếu chưa cần gửi thật.
- Giữ DKIM identity SES đã verified để dùng lại sau.

### Acceptance criteria

- `npm run aws:production:check -- --env-file=/tmp/logivn-production.env` không báo SES là ready khi AWS chưa duyệt.
- Production email smoke vẫn đi qua provider hiện tại, không qua SES.
- Runbook ghi rõ SES denied và không dùng production.

## Phase 1 - Chuẩn hóa chính sách công khai

### Việc cần làm

- Kiểm tra và hoàn thiện `/privacy` và `/terms` trên `logivn.com`.
- Thêm hoặc cập nhật phần email policy trong Privacy/Terms:
  - LogiVN gửi transactional email để vận hành tài khoản/dịch vụ.
  - Người dùng có thể tắt email báo cáo/thông báo không bắt buộc.
  - Email bảo mật/billing có thể bắt buộc để vận hành dịch vụ.
  - Liên hệ abuse/postmaster/support rõ ràng.
- Đảm bảo footer/landing có link Privacy/Terms hoạt động.
- Công khai contact mail hợp lệ: `support@logivn.com`, `abuse@logivn.com`, `postmaster@logivn.com`.

### Acceptance criteria

- `/privacy` và `/terms` trả HTTP 200 trên production.
- Nội dung mô tả rõ email categories và preference controls.
- `support@`, `abuse@`, `postmaster@` nhận được mail inbound qua LogiMail.

## Phase 2 - Consent, preference và unsubscribe

### Việc cần làm

- Tạo bảng/field quản lý email preferences theo user/restaurant:
  - `security_email_enabled` luôn true hoặc không cho tắt.
  - `billing_email_enabled` theo policy, mặc định true.
  - `operational_digest_enabled` mặc định theo tenant/user role.
  - `marketing_email_enabled` mặc định false trừ khi opt-in rõ ràng.
- Thêm UI trong dashboard settings để owner/staff chỉnh operational/report emails.
- Thêm unsubscribe/preference link vào email không bắt buộc.
- Log lại consent source: registration, invitation, dashboard setting, admin import, API.
- Chặn gửi marketing nếu không có opt-in.

### Acceptance criteria

- Người dùng có thể tắt scheduled reports/optional notifications từ dashboard.
- Email optional có link preference/unsubscribe hoạt động.
- Transactional email bắt buộc không bị route qua marketing unsubscribe logic.
- Có audit log khi preference thay đổi.

## Phase 3 - Suppression, bounce và complaint enforcement

### Việc cần làm

- Dùng lại LogiMail suppression/bounce engine hiện có làm source of truth hoặc bridge nó sang main app.
- Trước mỗi lần gửi mail app, kiểm tra suppression list theo recipient email.
- Ghi delivery log cho mỗi email: provider, message id, category, recipient hash/email, status.
- Với Resend:
  - Bật webhook bounce/complaint/delivery nếu plan/domain hỗ trợ.
  - Ingest webhook vào bảng bounce/suppression.
- Với LogiMail/BillionMail:
  - Tiếp tục dùng bounce processor hiện có.
  - Đảm bảo hard bounce và complaint tự thêm vào suppression.
- Với SES sau này:
  - Chỉ bật khi đã cấu hình SNS/EventBridge/SQS hoặc webhook để nhận bounce/complaint.

### Acceptance criteria

- Recipient trong suppression list không nhận email mới.
- Hard bounce và complaint tự suppress.
- Soft bounce không suppress ngay, nhưng tăng cảnh báo theo ngưỡng.
- Admin có trang xem suppression và gỡ suppression có audit.

## Phase 4 - Warm-up bằng provider hiện tại

### Việc cần làm

- Dùng LogiMail/Resend để gửi lượng thấp, nội dung thật, recipient có quan hệ thật.
- Không gửi bulk campaign.
- Warm-up tối thiểu 14 ngày, tốt hơn 30 ngày trước khi xin SES lại.
- Dùng mailbox/sender thân thiện:
  - `support@logivn.com` cho hỗ trợ/onboarding.
  - `billing@logivn.com` cho billing.
  - `hello@logivn.com` cho thông báo nhẹ.
  - hạn chế `noreply@`.
- Thu thập số liệu hàng ngày:
  - sent count
  - delivered/accepted count
  - hard bounce rate
  - complaint count/rate
  - suppression count
  - Gmail inbox/spam placement sample
  - blacklist status
  - Postfix queue status nếu dùng LogiMail

### Acceptance criteria

- 14-30 ngày không có complaint đáng kể.
- Hard bounce rate ở mức rất thấp và có bằng chứng suppression hoạt động.
- Không có blacklist nghiêm trọng với domain/IP.
- Ít nhất 3 sample email thật có nội dung tốt và headers pass SPF/DKIM/DMARC.

## Phase 5 - Nội dung email và template governance

### Việc cần làm

- Chuẩn hóa template cho từng email category:
  - Account verification
  - Login/security alert
  - Password reset
  - Billing notice/receipt
  - Operational daily report
  - Reservation/order notification
- Mỗi template cần có:
  - subject rõ ràng, không clickbait
  - From phù hợp
  - Reply-To nếu cần
  - footer với company/contact
  - preference/unsubscribe với email optional
  - không nhúng secret/token dài trong log hoặc support evidence
- Thêm content lint cơ bản cho link đáng ngờ, từ khóa spam, thiếu footer/preference.

### Acceptance criteria

- Có thư mục hoặc registry template có owner rõ.
- Mọi optional/report template có preference link.
- Sample package có 3-5 template dùng để gửi AWS.

## Phase 6 - Evidence package trước khi xin SES lại

Tạo một thư mục evidence, ví dụ `reports/ses-readiness/YYYYMMDD/`, gồm:

- Summary 1 trang:
  - product: LogiVN restaurant SaaS
  - domain: `logivn.com`
  - sending purpose: transactional/account/operational only
  - no purchased/scraped lists
  - expected daily volume
- Public policy links:
  - Privacy
  - Terms
  - support/abuse/postmaster contacts
- DNS/auth evidence:
  - SPF
  - DKIM
  - DMARC
  - MX/PTR nếu dùng LogiMail
- Deliverability evidence:
  - 14-30 day sent/bounce/complaint metrics
  - suppression screenshots/export summary
  - sample successful headers from Gmail Show Original
  - blacklist checks
- Product controls:
  - preference UI screenshots
  - unsubscribe/preference route screenshots
  - suppression/admin screen screenshots
- Sample email content:
  - account verification
  - billing notice
  - operational report
  - security alert

### Acceptance criteria

- Evidence không chứa API key, password, OTP thật, full customer PII, signed URLs hoặc raw private recipient lists.
- Có đủ số liệu định lượng để AWS thấy quy trình không chỉ là cam kết.

## Phase 7 - Xin SES lại

### Điều kiện mở case mới hoặc reply case cũ

Chỉ làm khi tất cả điều kiện này đạt:

- Privacy/Terms/email policy public.
- Preference/unsubscribe hoạt động cho optional email.
- Bounce/complaint/suppression enforcement đã test.
- Có 14-30 ngày warm-up sạch.
- Evidence package hoàn chỉnh.
- App production vẫn có fallback provider nếu SES chưa duyệt.

### Nội dung yêu cầu SES mới

- Nêu rõ lần trước bị deny và LogiVN đã bổ sung controls nào.
- Đính kèm/tóm tắt evidence package.
- Xin limit thấp trước, ví dụ dưới 1,000 email/day.
- Cam kết chỉ gửi transactional/operational email.
- Nêu rõ bounce/complaint handling đã chạy trước khi switch sang SES.

### Acceptance criteria

- AWS duyệt production access hoặc yêu cầu thêm thông tin cụ thể.
- Nếu AWS tiếp tục deny nhưng không đưa lý do cụ thể, tiếp tục dùng Resend/LogiMail và không tốn thêm thời gian trong 30 ngày tiếp theo.

## Rollout sau khi SES được duyệt

1. Tạo IAM policy SES gửi mail tối thiểu, không dùng admin key.
2. Bật SES event publishing cho bounce/complaint/delivery.
3. Set env staging/preview trước:
   - `EMAIL_PROVIDER=ses`
   - `AWS_SES_REGION=us-east-1`
   - `AWS_SES_ACCESS_KEY_ID`
   - `AWS_SES_SECRET_ACCESS_KEY`
   - `AWS_SES_IDENTITY`
4. Gửi smoke email tới seed list nội bộ.
5. Bật production với canary: chỉ một vài category trước, ví dụ billing/report, chưa bật toàn bộ auth ngay.
6. Theo dõi 48-72h:
   - send errors
   - bounce/complaint
   - inbox placement
   - auth pass
7. Nếu lỗi tăng, rollback `EMAIL_PROVIDER` về Resend/LogiMail.

## Rủi ro và cách xử lý

| Rủi ro | Tác động | Giảm thiểu |
|---|---|---|
| AWS tiếp tục deny | Không dùng SES được | Dùng Resend/LogiMail làm provider chính; xin lại sau khi có thêm evidence |
| Email optional không có unsubscribe | Tăng complaint, AWS deny | Phase 2 là blocker trước khi xin lại |
| Bounce không suppress | Reputation xấu | Phase 3 là blocker trước warm-up |
| IP/domain LogiMail còn mới | Mail vào spam | Warm-up thấp, nội dung thật, theo dõi placement |
| Lẫn transactional và marketing | Vi phạm policy | Email taxonomy + template registry + gating opt-in |
| Lộ PII trong evidence | Rủi ro privacy | Chỉ dùng summary, redacted screenshots, recipient hash/sample nội bộ |

## Definition of Done

Kế hoạch này hoàn tất khi có thể trả lời AWS bằng bằng chứng cụ thể:

- Đây là hệ thống SaaS thật đang chạy tại `logivn.com`.
- Người nhận đến từ registration/invitation/action trong app, không phải purchased list.
- Có preference/unsubscribe cho email không bắt buộc.
- Có bounce/complaint ingestion và suppression enforcement.
- Có public policy/contact rõ ràng.
- Có 14-30 ngày metrics gửi sạch.
- Có sample template và headers pass SPF/DKIM/DMARC.
- Có fallback provider nên không cần ép SES bằng mọi giá.
