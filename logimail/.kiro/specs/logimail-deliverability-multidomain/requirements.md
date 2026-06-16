# Requirements Document

## Introduction

Tài liệu này mô tả 20 nâng cấp lớn cho LogiMail — nền tảng email nội bộ của LogiVN — trải trên bốn trụ cột: (1) Deliverability để đưa email ra khỏi spam, (2) Tối ưu vận hành, (3) Bảo mật, và (4) Tích hợp đa domain; kèm một yêu cầu biên giới/an toàn xuyên suốt (R21). Các yêu cầu được xây dựng dựa trên hệ thống thực tế hiện có, **không** giả định greenfield:

- Backend thật là Next.js app `apps/logimail-web` với API routes tại `src/app/api/logimail/*`; `apps/logimail-api` chỉ là health skeleton.
- Schema Supabase `logimail` (~24 bảng) gồm `domains`, `mailboxes`, `deliverability_checks`, `dmarc_reports`, `bounce_events`, `email_send_logs`, `quotas`, `audit_logs`, `security_codes`, `domain_requests`, `mailbox_requests`, v.v.
- Mail engine native IMAP (imapflow) + SMTP (nodemailer) nói chuyện với BillionMail/Postfix/Dovecot/Rspamd trên VPS; mail hostname `mail.logivn.com`. DNS quản lý qua Cloudflare (scope `Zone:Read`, `DNS:Edit`).
- Console quản trị `domain.logivn.com` (duyệt yêu cầu, domain+DNS, mailbox, security codes, ops cockpit); client mail người dùng cuối `mail.logivn.com`. Phân quyền qua `logimail.profiles.role` (owner/admin/member/viewer).
- Đã ship gần đây: tách admin, console điều hành, IMAP pooling, render HTML an toàn, tải attachment, rate limiting unlock/admin, IMAP SEARCH + phân trang, bulk mail actions, tạo/đăng ký/kiểm tra DNS đa domain.

Các nâng cấp dưới đây mở rộng các bảng và service đã có (ví dụ `deliverability_checks`, `dmarc_reports`, `bounce_events`, `mailboxes.encrypted_*`) thay vì tạo mới từ đầu.

### Quy ước chung

- **Nguồn sự thật trạng thái DNS**: `domains.spf_status/dkim_status/dmarc_status/mx_status/ptr_status` lưu **trạng thái mới nhất (cache)** để hiển thị nhanh; bảng `deliverability_checks` lưu **lịch sử từng lần kiểm tra** (gồm cả `bimi_status`, `mta_sts_status`, `score`, notes). Mọi lần kiểm tra ghi một dòng mới vào `deliverability_checks` rồi cập nhật cache tương ứng trên `domains`.
- **Đối tượng gửi (Sending_Domain)**: là một *sending identity* — có thể là domain gốc hoặc một subdomain có stream type — và là đơn vị mang reputation, deliverability score, hạn mức gửi, DKIM selector riêng. Quota và score luôn gắn theo Sending_Domain (không phải theo workspace).
- **Giá trị mặc định có thể cấu hình** (override per-workspace nếu cần):
  - Ngưỡng spam nội dung gửi (R8): `>= 5.0` trên thang 0–10.
  - Ngưỡng cảnh báo hard-bounce 24h (R11): `> 5%`.
  - SLA mục tiêu xử lý yêu cầu (R11): account `4h`, domain `8h`, mailbox `2h`.
  - Rate limit endpoint nhạy cảm (R16): unlock mailbox `8/phút/IP`, hành động admin `30/phút/IP`; anti-abuse gửi `300 thư/giờ/mailbox`.
  - Idle session timeout (R17): `8 giờ` (đồng bộ với mail-session hiện tại).
  - Warm-up mặc định (R4): bắt đầu `50 thư/ngày`, nhân đôi mỗi ngày, cap tại target của plan.
- **Biên giới schema**: mọi bảng/cột mới đều nằm trong schema `logimail`, không sửa schema `public` của LogiVN.

## Glossary

- **LogiMail**: Toàn bộ nền tảng email nội bộ của LogiVN (web app `apps/logimail-web`, mail engine, console quản trị).
- **Deliverability_Engine**: Thành phần backend tính điểm và đánh giá khả năng vào inbox cho mỗi Sending_Domain; ghi lịch sử vào bảng `deliverability_checks` và cập nhật cache trạng thái trên `domains`.
- **DKIM_Manager**: Thành phần quản lý DKIM selector và khóa cho mỗi Sending_Domain.
- **Auth_Record_Service**: Thành phần dựng và xác thực các bản ghi xác thực email (SPF, DKIM, DMARC, BIMI, MTA-STS, TLS-RPT).
- **PTR_Verifier**: Thành phần kiểm tra PTR/rDNS của IP gửi so với mail hostname.
- **Warmup_Scheduler**: Thành phần điều phối lịch tăng dần hạn mức gửi (warm-up) cho IP và domain.
- **Bounce_Processor**: Thành phần phân loại và xử lý sự kiện bounce/complaint, ghi vào `bounce_events`.
- **Suppression_List**: Danh sách địa chỉ người nhận bị chặn gửi do hard bounce hoặc complaint.
- **DMARC_Ingestor**: Thành phần nạp và phân tích báo cáo DMARC aggregate, ghi vào `dmarc_reports`.
- **Placement_Tester**: Thành phần chạy kiểm thử inbox placement bằng seed-list.
- **Content_Scorer**: Thành phần chấm điểm spam cho nội dung email trước khi gửi.
- **Approval_Engine**: Thành phần xử lý hàng đợi duyệt account/domain/mailbox tại console quản trị.
- **Bulk_Service**: Thành phần thực thi thao tác hàng loạt trên domain/mailbox/yêu cầu.
- **Alerting_Service**: Thành phần phát cảnh báo dựa trên ngưỡng sức khỏe vận hành.
- **Health_Dashboard**: Bảng điều khiển hiển thị chỉ số sức khỏe gửi/nhận và deliverability.
- **SLA_Tracker**: Thành phần đo và báo cáo thời gian xử lý yêu cầu so với mục tiêu SLA.
- **Runbook_Engine**: Thành phần lưu và thực thi quy trình vận hành (playbook) có kiểm soát.
- **DNS_Provisioner**: Thành phần tạo/cập nhật bản ghi DNS qua Cloudflare API trong scope cho phép.
- **Audit_Service**: Thành phần ghi nhật ký bất biến vào `audit_logs`.
- **Credential_Vault**: Thành phần mã hóa envelope cho thông tin đăng nhập mailbox lưu tại `mailboxes.encrypted_*`.
- **Key_Rotation_Service**: Thành phần xoay vòng khóa mã hóa và DKIM.
- **RBAC_Service**: Thành phần kiểm soát truy cập theo vai trò và quyền tối thiểu.
- **Rate_Limiter**: Thành phần giới hạn tần suất gọi API và hành động nhạy cảm.
- **Anti_Abuse_Service**: Thành phần phát hiện và hạn chế hành vi lạm dụng gửi thư.
- **MFA_Service**: Thành phần xác thực đa yếu tố.
- **Session_Manager**: Thành phần quản lý phiên đăng nhập và thu hồi phiên.
- **Domain_Onboarding_Wizard**: Trình hướng dẫn thiết lập domain gửi mới từng bước.
- **Multi_Domain_Manager**: Thành phần quản lý nhiều domain/workspace gửi đồng thời.
- **Reviewer**: Người dùng có `role` owner hoặc admin thao tác tại console `domain.logivn.com`.
- **DNS_State**: Một trong các giá trị `pass`, `warning`, `fail`, `unknown`.
- **Sending_Domain**: Một sending identity mang reputation/score/quota/DKIM selector riêng — là domain gốc hoặc subdomain có stream type. Là đơn vị áp dụng quota và deliverability score trong toàn bộ tài liệu này.
- **Stream_Type**: Loại luồng gửi của một Sending_Domain, một trong `transactional` hoặc `marketing`.
- **Provisioning_Idempotency**: Tính chất một kế hoạch DNS/provisioning có thể chạy lại nhiều lần mà không tạo bản ghi trùng (chỉ tạo khi chưa tồn tại).

## Requirements

### Requirement 1: Quản lý DKIM selector theo domain

**User Story:** As a Reviewer, I want to manage a DKIM selector and key for each sending domain, so that mỗi domain ký thư bằng khóa riêng và xoay khóa được an toàn.

#### Acceptance Criteria

1. WHEN a Reviewer adds a sending domain, THE DKIM_Manager SHALL create a DKIM selector record bound to that domain identifier.
2. THE DKIM_Manager SHALL store each DKIM selector name with a value between 1 and 63 characters matching the pattern `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`.
3. WHEN a Reviewer requests the published DKIM TXT record for a domain, THE DKIM_Manager SHALL return the record content for the active selector of that domain.
4. IF two DKIM selectors with the same name are requested for the same domain, THEN THE DKIM_Manager SHALL reject the second request with a uniqueness error.
5. WHEN a DKIM key rotation completes for a domain, THE DKIM_Manager SHALL mark the previous selector as retired and the new selector as active while keeping the retired selector resolvable for 7 days.
6. WHEN a new DKIM selector is created, THE DKIM_Manager SHALL obtain the key pair from BillionMail when BillionMail manages the domain, otherwise generate an RSA-2048 key pair within LogiMail and store only the private key in the Credential_Vault.

### Requirement 2: Dựng và xác thực bản ghi xác thực email

**User Story:** As a Reviewer, I want LogiMail to generate and validate SPF, DKIM, DMARC, BIMI, MTA-STS, and TLS-RPT records, so that các domain đạt chuẩn xác thực trước khi gửi thật.

#### Acceptance Criteria

1. WHEN a Reviewer opens the authentication panel for a domain, THE Auth_Record_Service SHALL return the expected SPF, DKIM, DMARC, BIMI, MTA-STS, and TLS-RPT record content for that domain.
2. WHEN a Reviewer triggers an authentication check for a domain, THE Auth_Record_Service SHALL resolve each record from public DNS and assign a DNS_State value to each of `spf_status`, `dkim_status`, `dmarc_status`, `bimi_status`, and `mta_sts_status` in the `deliverability_checks` record.
3. IF a domain publishes more than one SPF TXT record, THEN THE Auth_Record_Service SHALL set `spf_status` to `fail` and record a note identifying the duplicate.
4. WHERE a domain has no BIMI record published, THE Auth_Record_Service SHALL set `bimi_status` to `unknown` rather than `fail`.
5. WHEN an authentication check completes, THE Deliverability_Engine SHALL compute an integer deliverability score between 0 and 100 and persist it to `deliverability_checks.score`.
6. WHEN an authentication check completes for a Sending_Domain, THE Deliverability_Engine SHALL update the latest-status cache on the related `domains` row (`spf_status`, `dkim_status`, `dmarc_status`, `mx_status`, `ptr_status`) while retaining the full per-check history in `deliverability_checks`.

### Requirement 3: Kiểm tra PTR/rDNS của IP gửi

**User Story:** As a Reviewer, I want to verify PTR/rDNS for the sending IP, so that tôi biết IP gửi khớp mail hostname trước khi tăng volume.

#### Acceptance Criteria

1. WHEN a Reviewer triggers a PTR check for a domain, THE PTR_Verifier SHALL perform a reverse lookup on the configured sending IP and compare the result to the domain mail hostname.
2. IF the reverse lookup result matches the mail hostname, THEN THE PTR_Verifier SHALL set `ptr_status` to `pass`.
3. IF the reverse lookup returns a hostname that does not match the mail hostname, THEN THE PTR_Verifier SHALL set `ptr_status` to `warning` and record the resolved hostname in the check notes.
4. IF the sending IP is not configured, THEN THE PTR_Verifier SHALL set `ptr_status` to `unknown`.

### Requirement 4: Lịch warm-up IP và domain

**User Story:** As a Reviewer, I want a warm-up schedule for new IPs and domains, so that hạn mức gửi tăng dần và bảo vệ reputation.

#### Acceptance Criteria

1. WHEN a Reviewer starts a warm-up plan for a Sending_Domain, THE Warmup_Scheduler SHALL create a daily send-limit schedule with a start value and a per-day increment, defaulting to a start of 50 messages doubling each day up to the plan target.
2. WHILE a warm-up plan is active for a Sending_Domain, THE Warmup_Scheduler SHALL set that Sending_Domain's daily send limit to the scheduled value for the current day.
3. IF the number of messages sent in a day from a Sending_Domain reaches its scheduled daily limit, THEN THE Warmup_Scheduler SHALL block additional send requests from that Sending_Domain for that day and return a quota-exceeded error.
4. WHEN a warm-up plan reaches its target daily limit, THE Warmup_Scheduler SHALL mark the plan as completed and stop further increments.

### Requirement 5: Xử lý bounce và complaint

**User Story:** As a Reviewer, I want bounces and complaints classified and acted on, so that LogiMail ngừng gửi tới địa chỉ hỏng và giữ reputation.

#### Acceptance Criteria

1. WHEN a bounce notification is received from the configured ingestion source (BillionMail/Postfix bounce webhook or SMTP send-result), THE Bounce_Processor SHALL classify the event as one of `hard`, `soft`, `complaint`, `blocked`, or `unknown` and insert a row into `bounce_events`.
2. IF a bounce notification carries a `provider_message_id` already present in `bounce_events`, THEN THE Bounce_Processor SHALL deduplicate and SHALL NOT insert a second row for the same event.
3. WHEN a bounce event is classified as `hard` or `complaint`, THE Bounce_Processor SHALL add the recipient email to the Suppression_List for the owning workspace.
4. IF a send request targets a recipient present in the Suppression_List, THEN THE Bounce_Processor SHALL block the send and record the reason as `suppressed`.
5. WHEN a Reviewer removes a recipient from the Suppression_List, THE Bounce_Processor SHALL allow subsequent send requests to that recipient.

### Requirement 6: Nạp báo cáo DMARC aggregate

**User Story:** As a Reviewer, I want DMARC aggregate reports ingested and summarized, so that tôi quyết định siết DMARC từ `p=none` sang `quarantine/reject` dựa trên dữ liệu.

#### Acceptance Criteria

1. WHEN a DMARC aggregate report is submitted to the ingestion endpoint, THE DMARC_Ingestor SHALL parse the report and insert one `dmarc_reports` row per source record with `message_count`, `pass_count`, and `fail_count`.
2. IF a submitted DMARC report fails XML parsing, THEN THE DMARC_Ingestor SHALL reject the submission and return a descriptive parse error.
3. THE DMARC_Ingestor SHALL provide a pretty printer that formats stored DMARC report records back into the aggregate report structure.
4. FOR ALL valid DMARC aggregate reports, parsing then printing then parsing SHALL produce an equivalent set of report records (round-trip property).
5. WHEN a Reviewer opens the DMARC summary for a domain, THE DMARC_Ingestor SHALL return the aggregated pass rate computed as total `pass_count` divided by total `message_count` for that domain.
6. WHEN a Reviewer opens the DMARC summary for a domain, THE DMARC_Ingestor SHALL aggregate over a bounded time window (default last 30 days) and return results paginated at no more than 200 source rows per page.

### Requirement 7: Kiểm thử inbox placement bằng seed-list

**User Story:** As a Reviewer, I want seed-list inbox placement tests, so that tôi biết thư vào Inbox hay Spam trước khi gửi diện rộng.

#### Acceptance Criteria

1. WHEN a Reviewer starts an inbox placement test for a domain, THE Placement_Tester SHALL send a test message to each address in the configured seed list and record a unique test marker.
2. WHEN placement results are collected, THE Placement_Tester SHALL report, per seed provider, the placement folder as one of `inbox`, `spam`, or `missing`.
3. WHEN a placement test completes, THE Placement_Tester SHALL persist the inbox placement rate to the related `deliverability_checks` notes.
4. IF no seed list is configured for the workspace, THEN THE Placement_Tester SHALL return a configuration error and SHALL NOT send any test message.

### Requirement 8: Chấm điểm spam nội dung trước khi gửi

**User Story:** As a sender, I want content spam scoring before sending, so that tôi sửa nội dung dễ vào spam trước khi gửi thật.

#### Acceptance Criteria

1. WHEN a sender requests a content score for a draft, THE Content_Scorer SHALL return a spam score on a 0 to 10 scale where higher indicates higher spam risk.
2. WHEN a content score is computed, THE Content_Scorer SHALL return a list of contributing rule identifiers for that score.
3. IF the computed spam score is greater than or equal to the configured send threshold (default 5.0), THEN THE Content_Scorer SHALL flag the draft as `needs_review` before sending.
4. FOR ALL drafts with identical content, THE Content_Scorer SHALL return the same spam score (deterministic scoring).

### Requirement 9: Tự động hóa hàng đợi duyệt

**User Story:** As a Reviewer, I want approval-queue automation with rules, so that các yêu cầu rủi ro thấp được xử lý nhanh và yêu cầu rủi ro cao được giữ lại.

#### Acceptance Criteria

1. WHEN an account, domain, or mailbox request is created, THE Approval_Engine SHALL evaluate the request against the configured auto-approval rules.
2. WHERE a request matches an auto-approval rule and carries no risk flags, THE Approval_Engine SHALL approve the request and record the actor as `auto-approval`.
3. IF a domain request carries one or more risk flags, THEN THE Approval_Engine SHALL keep the request in `pending` status for manual review.
4. WHEN a request is approved, THE Approval_Engine SHALL set its status to `approved`, set `reviewed_at`, and provision the related domain or mailbox record.

### Requirement 10: Thao tác hàng loạt trên domain và mailbox

**User Story:** As a Reviewer, I want bulk operations on domains and mailboxes, so that tôi xử lý nhiều mục cùng lúc thay vì từng cái.

#### Acceptance Criteria

1. WHEN a Reviewer submits a bulk action over a set of domain or mailbox identifiers, THE Bulk_Service SHALL apply the action to each valid identifier and return a per-identifier result of `succeeded` or `failed`.
2. IF an individual identifier in a bulk action fails, THEN THE Bulk_Service SHALL continue processing the remaining identifiers and report the failure reason for the failed identifier.
3. WHEN a bulk action completes, THE Audit_Service SHALL record one audit entry summarizing the action, the actor, and the count of succeeded and failed identifiers.
4. THE Bulk_Service SHALL apply each bulk action to at most 500 identifiers in a single request.

### Requirement 11: Cảnh báo, dashboard sức khỏe và SLA

**User Story:** As a Reviewer, I want alerting, health dashboards, and SLA tracking, so that tôi phát hiện sớm sự cố gửi/nhận và đo thời gian xử lý yêu cầu.

#### Acceptance Criteria

1. WHEN the Health_Dashboard is opened, THE Health_Dashboard SHALL display send volume, deliverability score per domain, bounce rate, and backup status for the active scope.
2. IF the hard-bounce rate over the last 24 hours exceeds the configured threshold (default greater than 5%), THEN THE Alerting_Service SHALL raise an alert identifying the affected workspace and the measured rate.
3. WHEN a request is approved or rejected, THE SLA_Tracker SHALL record the elapsed time between request creation and resolution.
4. IF a pending request exceeds its configured SLA target (default account 4h, domain 8h, mailbox 2h), THEN THE Alerting_Service SHALL raise an SLA-breach alert for that request.

### Requirement 12: Runbook và cấp phát DNS tự động qua Cloudflare

**User Story:** As a Reviewer, I want runbooks and automated DNS provisioning via Cloudflare, so that các quy trình vận hành lặp lại được thực thi an toàn và nhất quán.

#### Acceptance Criteria

1. WHEN a Reviewer runs a runbook, THE Runbook_Engine SHALL execute the runbook steps in defined order and record the outcome of each step.
2. WHEN a Reviewer approves a DNS provisioning plan for a domain, THE DNS_Provisioner SHALL create the planned records via the Cloudflare API within the `Zone:Read` and `DNS:Edit` scope.
3. IF a DNS provisioning plan would modify or delete an existing record, THEN THE DNS_Provisioner SHALL require explicit Reviewer confirmation before applying the change.
4. WHERE a hostname is designated as a mail transport host, THE DNS_Provisioner SHALL create the corresponding record with Cloudflare proxy disabled.
5. IF the Cloudflare API returns an error during provisioning, THEN THE DNS_Provisioner SHALL stop the plan and report which records were applied and which were not.

### Requirement 13: Mã hóa envelope thông tin đăng nhập mailbox

**User Story:** As a security owner, I want mailbox credentials protected with envelope encryption, so that thông tin IMAP/SMTP không bị lộ ở dạng thô.

#### Acceptance Criteria

1. WHEN a mailbox credential is stored, THE Credential_Vault SHALL encrypt the credential with a data key and persist only the ciphertext to `mailboxes.encrypted_imap_username`, `encrypted_imap_password`, `encrypted_smtp_username`, and `encrypted_smtp_password`.
2. WHEN a mail connection requires a credential, THE Credential_Vault SHALL decrypt the ciphertext in the backend service and SHALL NOT return the plaintext credential to any client response.
3. FOR ALL mailbox credentials, decrypting the stored ciphertext SHALL produce the original plaintext credential (round-trip property).
4. IF decryption fails for a stored credential, THEN THE Credential_Vault SHALL return a decryption error and record an audit entry without logging the ciphertext.

### Requirement 14: Xoay vòng khóa mã hóa

**User Story:** As a security owner, I want key rotation for encryption and DKIM keys, so that khóa cũ được thay định kỳ mà không gián đoạn dịch vụ.

#### Acceptance Criteria

1. WHEN a Reviewer triggers a data-key rotation, THE Key_Rotation_Service SHALL re-encrypt stored credentials with the new key and retain the prior key version until re-encryption completes.
2. WHILE a key rotation is in progress, THE Credential_Vault SHALL decrypt credentials using the key version recorded with each ciphertext.
3. WHEN a key rotation completes, THE Key_Rotation_Service SHALL record an audit entry containing the new key version identifier and the count of re-encrypted credentials.
4. IF a key rotation fails partway, THEN THE Key_Rotation_Service SHALL keep the prior key version active for all credentials not yet re-encrypted.

### Requirement 15: Phân quyền theo vai trò và quyền tối thiểu

**User Story:** As a security owner, I want RBAC with least-privilege, so that mỗi người dùng chỉ truy cập được tài nguyên trong phạm vi vai trò.

#### Acceptance Criteria

1. WHEN a user requests a console action, THE RBAC_Service SHALL authorize the action against the user `role` of owner, admin, member, or viewer.
2. IF a user with role `viewer` requests a state-changing action, THEN THE RBAC_Service SHALL deny the action and return an authorization error.
3. WHEN a user requests data for a workspace, THE RBAC_Service SHALL restrict the returned data to workspaces in which the user holds a membership.
4. WHERE an action targets administrative console functions at `domain.logivn.com`, THE RBAC_Service SHALL require the user role to be owner or admin.

### Requirement 16: Giới hạn tần suất và chống lạm dụng

**User Story:** As a security owner, I want rate limiting and anti-abuse controls, so that các endpoint nhạy cảm và hành vi gửi bất thường được kiểm soát.

#### Acceptance Criteria

1. WHEN the number of requests from a single actor to a sensitive endpoint exceeds the configured limit within the configured window (default: unlock mailbox 8/minute/IP, admin actions 30/minute/IP), THE Rate_Limiter SHALL reject further requests with a rate-limit error until the window resets.
2. WHILE an actor is rate-limited, THE Rate_Limiter SHALL include the retry-after duration in the rejection response.
3. IF the send rate for a mailbox exceeds the configured anti-abuse threshold (default 300 messages/hour/mailbox), THEN THE Anti_Abuse_Service SHALL pause sending for that mailbox and raise an alert.
4. WHEN a sensitive action is rate-limited or paused, THE Audit_Service SHALL record an audit entry with the actor and the triggering endpoint.

### Requirement 17: Nhật ký bất biến, MFA và kiểm soát phiên

**User Story:** As a security owner, I want immutable audit logs, MFA, and session controls, so that hành động quản trị được ghi nhận và phiên đăng nhập được bảo vệ.

#### Acceptance Criteria

1. WHEN any administrative action is performed, THE Audit_Service SHALL append an immutable entry to `audit_logs` containing the actor, action, target, and timestamp.
2. IF a process attempts to update or delete an existing `audit_logs` entry, THEN THE Audit_Service SHALL reject the operation.
3. WHERE MFA is enabled for a user, THE MFA_Service SHALL require a valid second factor before granting access to console actions.
4. WHEN a Reviewer revokes a user session, THE Session_Manager SHALL invalidate that session so subsequent requests using the session are rejected.
5. IF a session is idle beyond the configured timeout (default 8 hours), THEN THE Session_Manager SHALL expire the session and require re-authentication.

### Requirement 18: Quản lý đa domain, reputation và quota theo domain

**User Story:** As a Reviewer, I want to manage many sending domains with per-domain reputation and quotas, so that mỗi domain có hạn mức và sức khỏe riêng.

#### Acceptance Criteria

1. WHEN a Reviewer opens the multi-domain view, THE Multi_Domain_Manager SHALL list every domain with its workspace, status, deliverability score, and current daily send usage.
2. THE Multi_Domain_Manager SHALL maintain a separate deliverability score and daily send limit for each domain.
3. IF a domain reaches its configured daily send limit, THEN THE Multi_Domain_Manager SHALL block additional sends from that domain while allowing sends from other domains.
4. WHEN a Reviewer changes the daily send limit for one domain, THE Multi_Domain_Manager SHALL apply the change only to that domain.
5. WHEN the multi-domain view lists domains, THE Multi_Domain_Manager SHALL paginate results at no more than 100 domains per page ordered by domain name.

### Requirement 19: Trình hướng dẫn onboarding domain và tích hợp Cloudflare zone

**User Story:** As a Reviewer, I want a domain onboarding wizard with Cloudflare zone integration, so that thêm domain gửi mới theo từng bước có kiểm soát.

#### Acceptance Criteria

1. WHEN a Reviewer starts the onboarding wizard for a new domain, THE Domain_Onboarding_Wizard SHALL guide the Reviewer through domain entry, Cloudflare zone selection, DNS plan generation, and verification in defined order.
2. WHEN a Cloudflare zone is selected for a domain, THE Domain_Onboarding_Wizard SHALL store the `cloudflare_zone_id` on the related `domain_requests` record.
3. WHEN the DNS plan step completes, THE Domain_Onboarding_Wizard SHALL generate the planned records and persist them to `domain_requests.dns_plan`.
4. IF DNS verification fails for a required record, THEN THE Domain_Onboarding_Wizard SHALL keep the domain in `pending` status and report which records did not verify.
5. WHEN all required records verify, THE Domain_Onboarding_Wizard SHALL mark the domain eligible for approval.

### Requirement 20: Chiến lược subdomain cho transactional và marketing

**User Story:** As a Reviewer, I want a subdomain strategy separating transactional and marketing mail, so that reputation của thư giao dịch không bị ảnh hưởng bởi thư marketing.

#### Acceptance Criteria

1. WHEN a Reviewer configures a sending domain, THE Multi_Domain_Manager SHALL allow assigning a stream type of `transactional` or `marketing` to each sending subdomain.
2. WHEN a message is sent, THE Multi_Domain_Manager SHALL route the message through the subdomain matching the message stream type.
3. THE Multi_Domain_Manager SHALL maintain a separate deliverability score for the transactional subdomain and the marketing subdomain.
4. WHERE a subdomain is assigned the `marketing` stream type, THE Auth_Record_Service SHALL generate authentication records scoped to that subdomain rather than the root domain.

### Requirement 21: Biên giới schema và tính idempotent khi cấp phát

**User Story:** As a platform owner, I want all new data and provisioning to stay within the LogiMail boundary and be safely repeatable, so that các nâng cấp không phá vỡ production LogiVN và chạy lại an toàn.

#### Acceptance Criteria

1. WHERE a new table or column is introduced by these upgrades (for example DKIM selectors, suppression list, warm-up plans, per-domain quotas, stream type), THE migration SHALL create the object inside the `logimail` schema and SHALL NOT modify the `public` schema.
2. WHEN a DNS provisioning plan or runbook is executed more than once for the same Sending_Domain, THE DNS_Provisioner SHALL create each planned record only if an equivalent record does not already exist (Provisioning_Idempotency).
3. WHEN a provisioning step would change or remove an existing resource, THE DNS_Provisioner SHALL require explicit Reviewer confirmation before applying the change.
4. IF a re-run detects that all planned records already exist, THEN THE DNS_Provisioner SHALL report the plan as `already_applied` and make no changes.
5. WHEN any provisioning or migration action runs, THE Audit_Service SHALL record an audit entry capturing the actor, target Sending_Domain, and the created-versus-skipped record counts.
