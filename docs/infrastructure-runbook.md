# Infrastructure Runbook

## Mục tiêu

- production ổn định
- deployment nhất quán giữa local, CI và Vercel
- secrets không nằm trong source control
- rollback nhanh khi build hoặc runtime có vấn đề

## Trạng thái hiện tại

### Vercel

- Ứng dụng chạy trên Vercel với `preferredRegion = "sin1"` cho các route nhạy cảm về latency.
- `vercel.json` đang đăng ký 4 cron production:
  - `/api/cron/reports` lúc `0 1 * * *`
  - `/api/cron/ai-ops` lúc `30 1 * * *`
  - `/api/cron/reservations/expire` lúc `45 1 * * *`
  - `/api/cron/subscriptions` lúc `15 2 * * *`
- Theo tài liệu Vercel, cron dùng timezone UTC và production deployment mới chỉ cập nhật cron sau khi redeploy. Thời điểm kích hoạt không nên coi là chính xác tuyệt đối.

### Supabase

- App đang dùng Supabase cho PostgreSQL, Auth, Realtime và Storage.
- Local workspace đang link tới một remote project thật qua `supabase/.temp/*`, vì vậy migration và auth setup cần được coi là thao tác production-sensitive.
- Storage đang chạy trên Supabase buckets `menu-images` và `platform-assets`.

### Cloudflare và R2

- `logivn.com` đang active trên Cloudflare và DNS apex, `www`, wildcard `*.logivn.com` đều trỏ về Vercel.
- Tại thời điểm audit `2026-05-09`, các record này đang ở chế độ DNS-only (`proxied = false`), nên Cloudflare hiện đóng vai trò DNS nhiều hơn là reverse proxy/WAF trước Vercel.
- Backup/DR production đang dùng Cloudflare R2 qua Worker gateway `logivn-backup-r2-gateway`. VPS chỉ cần `BACKUP_R2_GATEWAY_URL`, `BACKUP_R2_GATEWAY_TOKEN`, `R2_BUCKET` và `BACKUP_R2_PREFIX`; không cần AWS hay access key S3 dài hạn.
- Adapter S3-compatible/R2 access-key trong script backup chỉ giữ để mở rộng sau này hoặc làm fallback có chủ đích. Không đặt đây là đường mặc định cho production hiện tại.

## Nguồn sự thật cho môi trường

- `.env.example` là contract chuẩn để khai báo env.
- `npm run infra:check` sẽ fail nếu code/script đọc `process.env.*` mà `.env.example` chưa khai báo.
- GitHub Actions cũng chạy `npm run infra:check` để chặn drift trước khi merge.

### Runtime env cần chú ý

- Shared Vercel runtime:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_APP_URL`
  - `STAFF_ATTENDANCE_QR_SECRET`
  - `STAFF_ATTENDANCE_SESSION_SECRET`
  - `AUTH_RATE_LIMIT_SECRET`
  - `STAFF_PIN_PEPPER`
  - `MAPBOX_ACCESS_TOKEN`
- Production-only hoặc sensitive:
  - `PLATFORM_ADMIN_PASSWORD`
  - `PLATFORM_ADMIN_SESSION_SECRET`
  - `CRON_SECRET`
  - `EMAIL_PROVIDER`
  - `RESEND_API_KEY`
  - `AWS_SES_REGION`
  - `AWS_SES_ACCESS_KEY_ID`
  - `AWS_SES_SECRET_ACCESS_KEY`
  - `REPORT_EMAIL_FROM`
  - `BILLING_EMAIL_FROM`
  - `AI_OPS_MORNING_BRIEF_EMAIL_ENABLED`
  - `AI_OPS_MORNING_BRIEF_FROM`
- Setup/tooling only:
  - `SUPABASE_PROJECT_REF`
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_SMTP_*`
  - `SUPABASE_AUTH_EXTRA_REDIRECT_URLS`
  - `CHROME_PATH`
- Runtime Google OAuth trực tiếp:
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `GOOGLE_OAUTH_STATE_SECRET`
  - `GOOGLE_DIRECT_OAUTH_STRICT` nếu muốn bắt buộc `GOOGLE_OAUTH_STATE_SECRET` cả ngoài production
  - `GOOGLE_LEGACY_SUPABASE_OAUTH_ENABLED` chỉ đặt `1` khi rollback tạm sang `/auth/google/supabase`

### System env không cần tự khai báo

- `VERCEL_ENV`
- `VERCEL_REGION`
- `VERCEL_GIT_COMMIT_SHA`
- `NODE_ENV`

## CI/CD

### Pull request và main branch

- `.github/workflows/seo-ci.yml` hiện là release CI cơ bản và chạy:
  - `npm ci`
  - `npm run infra:check`
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm test`
  - `npm audit --audit-level=high`
  - `npm run billing:verify` khi GitHub secrets có đủ Supabase env
  - `npm run seo:week5`
  - `npm run seo:agentic`
  - `npm run build`
- Workflow có `concurrency` để hủy run cũ cùng branch, giúp tiết kiệm minutes và tránh đọc nhầm kết quả stale.

### Vercel preflight

- `.github/workflows/vercel-preflight.yml` là workflow manual để kiểm tra build đúng với env trên Vercel mà chưa deploy.
- Workflow này yêu cầu 3 GitHub secrets:
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
- Các bước chính:
  - `vercel pull --yes --environment=<preview|production>`
  - `vercel build` hoặc `vercel build --prod`
  - upload `.vercel/output/` làm artifact để xem config thực tế đã sinh ra

### External release blocker preflight

- `npm run release:blockers` ghi report read-only vào `reports/release/` và kiểm tra Supabase branch/backups/dry-run, Docker dump readiness, authenticated QA sign-off và monitoring sign-off.
- `npm run release:blockers:strict` dùng cùng kiểm tra nhưng exit non-zero nếu còn blocker.
- Script này không tạo Supabase branch, không restore backup và không apply migration; các thao tác có chi phí/rủi ro vẫn cần release owner phê duyệt riêng.

Các trường vận hành cần có trong release env hoặc `.env.release.local` trước khi đóng alerting blocker:

- `MONITORING_WATCH_OWNER`
- `MONITORING_ALERT_EMAIL`
- `MONITORING_LOG_DRAIN_DESTINATION`
- `MONITORING_5XX_THRESHOLD`
- `MONITORING_FIRST_HOUR_WATCH_START`
- `MONITORING_FIRST_HOUR_WATCH_OWNER`

## Cron jobs

### Bảo vệ endpoint

- Tất cả cron route production đều yêu cầu `Authorization: Bearer $CRON_SECRET`.
- Local/dev vẫn có thể chạy route mà không cần secret để tiện kiểm thử thủ công.
- Nếu `CRON_SECRET` vắng mặt trên production, route sẽ fail-closed với lỗi 500 thay vì chạy mở.

### Khả năng scale hiện tại

- `/api/cron/reports` giờ xử lý nhiều batch trong một lần chạy thay vì dừng ở trang đầu tiên. Response trả thêm `batches` và `hasMore` để biết có còn backlog không.
- `/api/cron/ai-ops` tạo lại AI Ops Radar cho các quán `active`, lưu lifecycle vào `ai_operation_insights`, và trả summary theo tenant để kiểm tra nhanh.
- `/api/cron/ai-ops` cũng ghi `ai_morning_brief_runs` khi chạy intent `overview`. Email Morning Brief dùng `ai_morning_brief_preferences` theo từng quán; `AI_OPS_MORNING_BRIEF_EMAIL_ENABLED=true` là global gate cho cron, còn manual trigger có `email=true` sẽ ép gửi theo preference/người nhận hiện tại.
- `/api/cron/ai-ops` tạo thêm branch-scoped insights khi chạy `overview`. Các insight này dùng schema sẵn có `ai_operation_insights.branch_id` và `scope_key=branch:<branch_id>`, không cần migration mới. Có thể tắt bằng `branches=false` hoặc giới hạn số chi nhánh mỗi quán bằng `branchLimit` / `maxBranches`.
- Inventory intent trong `/api/cron/ai-ops` đọc thêm tín hiệu economics từ các bảng kho hiện có: projected purchase value, reorder urgency, waste/hao hụt, price spike, supplier delay và food cost cao. Phần này không thêm migration mới, nhưng cần các migration inventory/warehouse/alert hiện có đã được apply.
- `/dashboard/ai-ops` có branch attribution drill-down 7 ngày cho pickup, dine-in và delivery. Panel này chỉ đọc `orders.branch_id`, `branch_assignment_source`, `fulfillment_type` và `store_branches`, không ghi dữ liệu và không cần cron riêng.
- `/dashboard/ai-ops` hiển thị AI automation workflows dạng confirm-first checklist cho kho, marketing và nhân sự. Lớp hiện tại chỉ đọc snapshot vận hành, sinh checklist/action link/prompt và không tự ghi DB hoặc gọi side effect khi chưa có xác nhận.
- `/dashboard/ai-ops` có branch performance comparison 7 ngày cho doanh thu, service time, stock risk và staff coverage. Panel này đọc `orders`, `stock_balances`, `staff_branch_assignments`, `staff_sessions`, `attendance_logs`, `attendance_approval_requests`; nếu một nhóm bảng chưa migrate, panel vẫn hiển thị phần còn lại kèm warning nội bộ.
- Migration `orders_branch_attribution` thêm `orders.branch_id` và `branch_assignment_source` để branch AI đọc attribution trực tiếp. Cần apply migration này trước khi deploy code ghi các field branch mới vào đơn hàng.
- Migration `table_branch_assignment` thêm `tables.branch_id` để QR bàn gắn về đúng chi nhánh. Apply sau `orders_branch_attribution` và trước deploy code dashboard table/pickup branch picker để attribution dine-in và pickup không bị rơi về fallback.
- Chủ quán quản lý inbox, người nhận và retry email tại `/dashboard/ai-ops`. Nếu schema chưa migrate, trang vẫn load ở trạng thái cảnh báo và cron chỉ ghi phần đã sẵn sàng.
- `/api/cron/reservations/expire` cũng xử lý nhiều batch trong cùng một invocation, tránh bỏ sót reservation hết hạn khi volume tăng.
- Cả 4 cron routes đều có `maxDuration = 60` để ràng buộc runtime và giảm runaway executions.
- Mỗi cron route ghi `cron_run_logs` bằng service-role sau khi vượt qua `CRON_SECRET`. `admin.logivn.com/ops` dùng bảng này để hiển thị lần chạy gần nhất, next-run ETA, age, duration, failure streak, recent history, summary và lỗi cuối cùng.

### Kiểm thử thủ công

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://logivn.com/api/cron/reports
curl -H "Authorization: Bearer $CRON_SECRET" https://logivn.com/api/cron/ai-ops
curl -H "Authorization: Bearer $CRON_SECRET" "https://logivn.com/api/cron/ai-ops?limit=5&intent=inventory"
curl -H "Authorization: Bearer $CRON_SECRET" "https://logivn.com/api/cron/ai-ops?limit=5&brief=true&email=false"
curl -H "Authorization: Bearer $CRON_SECRET" "https://logivn.com/api/cron/ai-ops?limit=5&brief=true&email=true"
curl -H "Authorization: Bearer $CRON_SECRET" "https://logivn.com/api/cron/ai-ops?limit=5&branches=false"
curl -H "Authorization: Bearer $CRON_SECRET" "https://logivn.com/api/cron/ai-ops?limit=5&branchLimit=3"
curl -H "Authorization: Bearer $CRON_SECRET" https://logivn.com/api/cron/reservations/expire
curl -H "Authorization: Bearer $CRON_SECRET" https://logivn.com/api/cron/subscriptions
```

Chỉ nên chạy manual trên production khi chấp nhận side effect thật như gửi email hoặc cập nhật trạng thái.

## Quy trình deploy an toàn

1. Chạy local gate:
   `npm run infra:check && npm run lint && npx tsc --noEmit --pretty false --incremental false && npm test && npm audit --audit-level=high && npm run billing:verify && NEXT_PRIVATE_BUILD_WORKER=0 npm run build`
2. Merge sau khi GitHub Actions xanh.
3. Nếu deploy gồm HR/staff operations, rà thêm `docs/staff-operations-release-checklist.md` trước khi mở traffic.
4. Chạy `Vercel Preflight` nếu thay đổi đụng env, cron, build config hoặc route handlers quan trọng.
5. Deploy qua Vercel Git integration.
6. Smoke check ngay sau deploy:
   - `GET /api/health`
   - đăng nhập `/dashboard`
   - một route customer quan trọng
   - cron endpoint bằng manual trigger nếu rollout liên quan tới background jobs

## Rollback

- Code rollback: dùng Vercel rollback về deployment production trước đó hoặc redeploy commit cuối cùng đang ổn.
- Config rollback: nếu thay env, rollback code là chưa đủ; phải so lại Vercel Environment Variables.
- Database rollback:
  - Supabase migrations trong repo là forward-first.
  - Không giả định rằng rollback code sẽ tự đảo schema.
  - Với migration rủi ro, cần viết plan rollback hoặc migration follow-up trước khi chạy production.

## Quyết định cho Cloudflare và R2

- Giữ Worker gateway là đường production cho backup/DR vào R2; không phụ thuộc AWS CLI hoặc AWS service.
- Chưa nên chuyển media của LogiVN sang R2 chỉ vì backup đã dùng R2.
- Chỉ cân nhắc migration khi có ít nhất một trong các điều kiện:
  - chi phí egress hoặc storage của Supabase tăng rõ rệt
  - cần lifecycle/archive policy riêng cho media
  - cần domain media độc lập với khả năng cache edge dài hạn
- Trước khi bật R2 cho app, cần chốt trước:
  - bucket naming theo environment
  - public CDN hay signed URL
  - đường dẫn upload và backfill từ Supabase Storage
  - lifecycle rules và ownership của asset metadata

## Rủi ro còn lại

- `subscriptions` cron vẫn gửi reminder email trong cùng invocation. Nếu số tenant tăng mạnh, nên tách email fan-out sang queue hoặc thêm batch loop riêng.
- Cloudflare đang DNS-only, nên lợi ích proxy/WAF/CDN phía Cloudflare chưa được tận dụng. Nếu muốn bật proxy, cần test lại wildcard subdomain, headers và caching với Vercel trước.
