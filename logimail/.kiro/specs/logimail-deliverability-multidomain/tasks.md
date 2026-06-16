# Implementation Plan

## Overview

Thứ tự triển khai: schema/migrations → service libs (kèm property/unit tests) → API routes → console UI → cron workers → tích hợp & hardening. Mọi bảng/cột mới nằm trong schema `logimail`. Test property-based được đánh dấu ⚠ (cần cảnh báo khi chạy). Mỗi task gắn requirement và property tương ứng để truy vết.

## Tasks

- [x] 1. Migrations nền tảng trong schema `logimail`
  - Tạo migration mở rộng `domains` (`parent_domain_id`, `stream_type`, `bimi_status`, `mta_sts_status`, `sending_ip`).
  - Tạo bảng `dkim_selectors`, `domain_quotas`, `warmup_plans`, `suppression_list`, `encryption_keys`, `alerts`, `runbook_runs`, `seed_placement_tests`; thêm `mailboxes.credential_key_version`, `bounce_events.provider_message_id` + unique index dedupe.
  - Thêm rules chặn UPDATE/DELETE trên `audit_logs`; thêm index `dmarc_reports(domain_id, created_at)`.
  - Viết migration test xác nhận object nằm trong schema `logimail` và audit immutability hoạt động.
  - _Requirements: 21.1, 17.2_

- [x] 2. Credential_Vault envelope encryption + Key_Rotation_Service
  - [x] 2.1 Nâng `lib/mail-credentials.ts` sang envelope (KEK env + DEK per-record + `key_version`), giữ tương thích đọc ciphertext `v1` cũ.
    - _Requirements: 13.1, 13.2, 13.4_
  - [x] 2.2 ⚠ Property test envelope round-trip `decrypt(encrypt(c)) == c` qua nhiều `key_version`; ciphertext không chứa plaintext.
    - _Requirements: 13.3 / Property 2_
  - [x] 2.3 `lib/security/key-rotation.ts`: tạo version mới, re-encrypt theo lô, giữ version cũ cho record chưa xử lý, ghi audit count.
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 3. RBAC_Service, Rate_Limiter, Anti_Abuse, Audit
  - [x] 3.1 Mở rộng `lib/admin-access.ts` cho role `owner/admin/member/viewer` + helper `requireRole`; chặn viewer thực hiện state-change; giới hạn data theo membership.
    - _Requirements: 15.1, 15.2, 15.3, 15.4_
  - [x] 3.2 Mở rộng `lib/rate-limit.ts` thêm scope mới; `lib/anti-abuse.ts` đếm send-rate/mailbox (300/giờ) → pause + alert; ghi audit.
    - _Requirements: 16.1, 16.2, 16.3, 16.4_
  - [x] 3.3 Unit test RBAC matrix + rate-limit window + anti-abuse threshold.
    - _Requirements: 15.2, 16.1, 16.3_

- [x] 4. DKIM_Manager
  - Tạo `lib/deliverability/dkim.ts`: CRUD selector (validate pattern/length, unique theo domain), lấy/sinh khóa (BillionMail hoặc RSA-2048 nội bộ → private key vào Credential_Vault), rotate giữ selector cũ resolvable 7 ngày.
  - ⚠ Property test selector uniqueness theo domain.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5 / Property 5_

- [x] 5. Auth_Record_Service + PTR_Verifier + Deliverability_Engine
  - [x] 5.1 `lib/deliverability/auth-records.ts`: build expected SPF/DKIM/DMARC/BIMI/MTA-STS/TLS-RPT; `checkAuthRecords` resolve DNS, ghi `deliverability_checks`, cập nhật cache `domains.*_status`; SPF trùng → fail; BIMI thiếu → unknown.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_
  - [x] 5.2 `lib/deliverability/ptr.ts`: reverse lookup `sending_ip` so mail hostname → pass/warning/unknown + note.
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 5.3 `lib/deliverability/score.ts`: tính score nguyên 0–100, persist `deliverability_checks.score`.
    - _Requirements: 2.5 / Property 10_

- [x] 6. Warmup_Scheduler + per-domain quota enforcement
  - [x] 6.1 `lib/deliverability/warmup.ts`: tạo/đẩy `warmup_plans`, set `domain_quotas.daily_send_limit` theo ngày; completed khi đạt target.
    - _Requirements: 4.1, 4.2, 4.4_
  - [x] 6.2 Chèn enforcement vào `sendMailThroughMailbox`: resolve Sending_Domain theo stream type, kiểm `domain_quotas` (reset theo `usage_date`) + tăng `used_today`; vượt → `quota_exceeded`.
    - _Requirements: 4.3, 18.3, 20.2 / Property 6, Property 9_
  - [x] 6.3 ⚠ Property test quota monotonic & bounded + per-domain isolation.
    - _Requirements: 4.3, 18.3, 20.3 / Property 6, Property 9_

- [x] 7. Bounce_Processor + Suppression_List
  - `lib/deliverability/bounce.ts`: phân loại event, dedupe theo `provider_message_id`, ghi `bounce_events`; hard/complaint → thêm `suppression_list`; chèn check suppression vào send path; gỡ suppression cho gửi lại.
  - ⚠ Property test suppression enforcement.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5 / Property 7_

- [x] 8. DMARC_Ingestor
  - [x] 8.1 `lib/deliverability/dmarc.ts`: `parseAggregateReport(xml)` + `printAggregateReport(records)`; ghi `dmarc_reports`; summary pass-rate giới hạn 30 ngày + phân trang 200.
    - _Requirements: 6.1, 6.2, 6.5, 6.6_
  - [x] 8.2 ⚠ Property test round-trip `parse(print(parse(xml)))`.
    - _Requirements: 6.3, 6.4 / Property 1_

- [x] 9. Placement_Tester + Content_Scorer
  - [x] 9.1 `lib/deliverability/placement.ts`: gửi seed-list, thu inbox/spam/missing, ghi tỉ lệ vào `deliverability_checks.notes`; thiếu seed-list → lỗi cấu hình, không gửi.
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [x] 9.2 `lib/deliverability/content-score.ts`: chấm spam 0–10 deterministic + rule ids; ≥ threshold (5.0) → `needs_review`.
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 9.3 ⚠ Property test content score determinism.
    - _Requirements: 8.4 / Property 3_

- [x] 10. Approval_Engine automation + Bulk_Service
  - [x] 10.1 Mở rộng `lib/admin-service.ts`: `evaluateAutoApproval` (rule + risk flags), auto-approve actor=`auto-approval`, giữ pending khi có risk; provision khi approved.
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 10.2 `runBulk(action, ids[])` cap 500, per-id result, tiếp tục khi lỗi, ghi 1 audit tổng hợp.
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 11. DNS_Provisioner (Cloudflare) + Runbook_Engine
  - [x] 11.1 `lib/ops/dns-provisioner.ts`: liệt kê record zone, chỉ tạo khi chưa tồn tại (idempotent), mail host `proxied=false`, sửa/xóa cần confirm, lỗi → dừng + báo applied/skipped/failed, re-run đủ → `already_applied`.
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 21.2, 21.3, 21.4, 21.5_
  - [x] 11.2 ⚠ Property/integration test provisioning idempotency (chạy ≥2 lần).
    - _Requirements: 21.2, 21.4 / Property 4_
  - [x] 11.3 `lib/ops/runbook.ts`: chạy steps theo thứ tự, ghi `runbook_runs` outcome mỗi bước.
    - _Requirements: 12.1_

- [x] 12. Alerting_Service + SLA_Tracker + Health_Dashboard data
  - `lib/ops/alerting.ts`: bounce rate 24h (>5%) → alert; SLA elapsed khi resolve; pending quá hạn (4h/8h/2h) → SLA-breach alert; ghi `alerts`.
  - Mở rộng `/api/logimail/admin/overview` để dashboard có send volume + score/domain + bounce rate + backup.
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 13. Multi_Domain_Manager + Domain_Onboarding_Wizard + Stream routing
  - [x] 13.1 `lib/multi-domain.ts`: list Sending_Domain (phân trang 100) kèm workspace/status/score/usage; quota/score per-domain; đổi limit chỉ 1 domain.
    - _Requirements: 18.1, 18.2, 18.4, 18.5_
  - [x] 13.2 Stream subdomain: gán `stream_type`, route theo stream khi gửi, score riêng, auth records scope theo subdomain marketing.
    - _Requirements: 20.1, 20.2, 20.3, 20.4_
  - [x] 13.3 `lib/onboarding.ts`: wizard domain→zone→dns_plan→verify; lưu `cloudflare_zone_id`/`dns_plan` vào `domain_requests`; verify fail → pending + báo record; đủ → eligible.
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [x] 14. MFA + Session_Manager
  - `lib/security/session.ts`: tích hợp Supabase MFA (yêu cầu second factor cho console khi bật), revoke session, idle timeout 8h.
  - _Requirements: 17.3, 17.4, 17.5_

- [x] 15. API routes
  - Tạo các route handler theo bảng API Surface: `/admin/domains/[id]/{dkim,auth-records,auth-check,warmup,dns-provision,placement-test}`, `/admin/{suppression,dmarc/summary,requests/auto-rules,bulk,alerts,runbooks/[key]/run,keys/rotate,sessions}`, `/ingest/{dmarc,bounce}` (signed key), `/mail/content-score`. Gắn `requireAdmin`/`requireMailSession`/`requireRole` đúng cấp, ghi audit.
  - _Requirements: 1.3, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1, 9.1, 10.1, 11.2, 12.2, 14.1, 16.1, 17.1, 18.1, 19.1_

- [x] 16. Console UI (domain.logivn.com) action-first
  - Bổ sung vào console: khu Deliverability (auth records + check + score + PTR + DKIM), Warm-up, Suppression, DMARC summary, Alerts, Onboarding wizard, Sessions, Key rotation; nút action gọi route mới; hiển thị per-domain quota/score.
  - _Requirements: 2.1, 5.4, 6.5, 11.1, 18.1, 19.1_

- [x] 17. Cron workers
  - Thêm `cron/warmup-tick`, `cron/alerts-scan`, `cron/key-rotation-step`, `cron/placement-collect` (đăng ký `vercel.json` hoặc worker VPS); mỗi job ghi audit/log.
  - _Requirements: 4.2, 7.2, 11.4, 14.1_

- [x] 18. Tích hợp & hardening cuối
  - Chạy `npm run typecheck`/`build` cho logimail-web; smoke test các route admin; chạy toàn bộ unit + ⚠ property test; xác nhận audit immutability + biên giới schema.
  - _Requirements: 6.4, 8.4, 13.3, 17.2, 21.1, 21.2 / Property 1, Property 2, Property 3, Property 4, Property 7, Property 8_

## Notes

- Mỗi task con đánh dấu ⚠ là property-based test — khi chạy phải kèm cảnh báo về thời gian/độ phủ.
- Tất cả thao tác vận hành nguy hiểm (provision sửa/xóa, key rotate, bulk, runbook) yêu cầu header xác nhận `x-logimail-confirm` và ghi `audit_logs`.
- Không sửa schema `public`; mọi đối tượng mới ở schema `logimail` (R21).
- Verify trực tiếp (auth-check, gửi vượt quota, key rotation + IMAP login) cần staging mail server + Supabase project có schema `logimail`.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"], "rationale": "Schema nền tảng phải có trước" },
    { "wave": 2, "tasks": ["2", "3"], "rationale": "Bảo mật nền: vault/rotation, RBAC/rate-limit/audit" },
    { "wave": 3, "tasks": ["4", "5", "6", "7", "8"], "rationale": "Service deliverability cốt lõi (phụ thuộc schema + vault)" },
    { "wave": 4, "tasks": ["9", "10", "11", "12", "13", "14"], "rationale": "Service vận hành/đa domain (phụ thuộc wave 3)" },
    { "wave": 5, "tasks": ["15"], "rationale": "API routes nối tất cả service" },
    { "wave": 6, "tasks": ["16", "17"], "rationale": "Console UI + cron dựa trên API/service" },
    { "wave": 7, "tasks": ["18"], "rationale": "Tích hợp & hardening cuối" }
  ]
}
```
