# Infrastructure Runbook

## Mục tiêu

- production ổn định
- deployment nhất quán giữa local, CI và Vercel
- secrets không nằm trong source control
- rollback nhanh khi build hoặc runtime có vấn đề

## Trạng thái hiện tại

### Vercel

- Ứng dụng chạy trên Vercel với `preferredRegion = "sin1"` cho các route nhạy cảm về latency.
- `vercel.json` đang đăng ký 3 cron production:
  - `/api/cron/reports` lúc `0 1 * * *`
  - `/api/cron/reservations/expire` lúc `0 2 * * *`
  - `/api/cron/subscriptions` lúc `15 2 * * *`
- Theo tài liệu Vercel, cron dùng timezone UTC và production deployment mới chỉ cập nhật cron sau khi redeploy. Thời điểm kích hoạt không nên coi là chính xác tuyệt đối.

### Supabase

- App đang dùng Supabase cho PostgreSQL, Auth, Realtime và Storage.
- Local workspace đang link tới một remote project thật qua `supabase/.temp/*`, vì vậy migration và auth setup cần được coi là thao tác production-sensitive.
- Storage đang chạy trên Supabase buckets `menu-images` và `platform-assets`.

### Cloudflare và R2

- `logivn.com` đang active trên Cloudflare và DNS apex, `www`, wildcard `*.logivn.com` đều trỏ về Vercel.
- Tại thời điểm audit `2026-05-09`, các record này đang ở chế độ DNS-only (`proxied = false`), nên Cloudflare hiện đóng vai trò DNS nhiều hơn là reverse proxy/WAF trước Vercel.
- Account Cloudflare có R2 bucket tồn tại sẵn, nhưng repo này chưa có R2 binding, S3 client, custom domain hay code path nào đọc/ghi R2. Với LogiVN, R2 vẫn là hạ tầng chưa được tích hợp.

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
  - `AUTH_RATE_LIMIT_SECRET`
  - `MAPBOX_ACCESS_TOKEN`
- Production-only hoặc sensitive:
  - `PLATFORM_ADMIN_PASSWORD`
  - `PLATFORM_ADMIN_SESSION_SECRET`
  - `CRON_SECRET`
  - `RESEND_API_KEY`
  - `REPORT_EMAIL_FROM`
  - `BILLING_EMAIL_FROM`
- Setup/tooling only:
  - `SUPABASE_PROJECT_REF`
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_SMTP_*`
  - `GOOGLE_OAUTH_CLIENT_*`
  - `SUPABASE_AUTH_EXTRA_REDIRECT_URLS`
  - `CHROME_PATH`

### System env không cần tự khai báo

- `VERCEL_ENV`
- `VERCEL_REGION`
- `VERCEL_GIT_COMMIT_SHA`
- `NODE_ENV`

## CI/CD

### Pull request và main branch

- `.github/workflows/seo-ci.yml` hiện chạy:
  - `npm ci`
  - `npm run infra:check`
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm run seo:audit`
  - `npm run seo:agentic`
  - `npm run build`
  - `npm run lhci`
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

## Cron jobs

### Bảo vệ endpoint

- Tất cả cron route production đều yêu cầu `Authorization: Bearer $CRON_SECRET`.
- Local/dev vẫn có thể chạy route mà không cần secret để tiện kiểm thử thủ công.
- Nếu `CRON_SECRET` vắng mặt trên production, route sẽ fail-closed với lỗi 500 thay vì chạy mở.

### Khả năng scale hiện tại

- `/api/cron/reports` giờ xử lý nhiều batch trong một lần chạy thay vì dừng ở trang đầu tiên. Response trả thêm `batches` và `hasMore` để biết có còn backlog không.
- `/api/cron/reservations/expire` cũng xử lý nhiều batch trong cùng một invocation, tránh bỏ sót reservation hết hạn khi volume tăng.
- Cả 3 cron routes đều có `maxDuration = 60` để ràng buộc runtime và giảm runaway executions.

### Kiểm thử thủ công

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://logivn.com/api/cron/reports
curl -H "Authorization: Bearer $CRON_SECRET" https://logivn.com/api/cron/reservations/expire
curl -H "Authorization: Bearer $CRON_SECRET" https://logivn.com/api/cron/subscriptions
```

Chỉ nên chạy manual trên production khi chấp nhận side effect thật như gửi email hoặc cập nhật trạng thái.

## Quy trình deploy an toàn

1. Chạy local gate:
   `npm run infra:check && npm run lint && npx tsc --noEmit && npm run build`
2. Merge sau khi GitHub Actions xanh.
3. Chạy `Vercel Preflight` nếu thay đổi đụng env, cron, build config hoặc route handlers quan trọng.
4. Deploy qua Vercel Git integration.
5. Smoke check ngay sau deploy:
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

- Chưa nên chuyển media của LogiVN sang R2 chỉ vì có bucket sẵn trên account.
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
