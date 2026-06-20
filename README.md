# SaaS Gọi Món QR

MVP sẵn sàng triển khai cho hệ thống gọi món bằng QR dành cho nhà hàng/quán cafe, dùng Next.js và Supabase.

Production domain hiện tại: [https://logivn.com](https://logivn.com)

## Công Nghệ

- Next.js App Router, TypeScript, Tailwind CSS
- Supabase PostgreSQL, Auth, Realtime, Storage
- Zustand cho trạng thái giỏ hàng của khách
- Zod để kiểm tra dữ liệu đầu vào
- Vercel cho giao diện, Supabase cho backend/database, Cloudflare cho DNS/CDN

## Cấu Trúc

```txt
app/          Trang, route, server action, API route
components/   Thành phần giao diện cho quản trị, khách hàng và UI dùng chung
lib/          Supabase client, kiểm tra dữ liệu, phản hồi API, VietQR, tiện ích
services/     Nghiệp vụ và truy cập dữ liệu Supabase
types/        Kiểu dữ liệu nghiệp vụ và kiểu dữ liệu Supabase
supabase/     SQL schema, RLS, Realtime, Storage, dữ liệu mẫu
api/          Ghi chú hợp đồng API
```

## Cấu Hình Triển Khai

Sao chép `.env.example` thành `.env.local`:

```bash
cp .env.example .env.local
```

Điền các biến:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
PLATFORM_ADMIN_PASSWORD
PLATFORM_ADMIN_SESSION_SECRET
VIETQR_BANK
VIETQR_ACCOUNT
VIETQR_ACCOUNT_NAME
CRON_SECRET
EMAIL_PROVIDER
RESEND_API_KEY
AUTH_EMAIL_FROM
REPORT_EMAIL_FROM
AWS_SES_REGION
AWS_SES_ACCESS_KEY_ID
AWS_SES_SECRET_ACCESS_KEY
AWS_SES_IDENTITY
MAPBOX_ACCESS_TOKEN
```

`SUPABASE_SERVICE_ROLE_KEY` chỉ dùng ở server/API routes. Không đưa key này ra client.
`PLATFORM_ADMIN_PASSWORD` và `PLATFORM_ADMIN_SESSION_SECRET` bảo vệ DevOps Control Center tại `admin.logivn.com`.
Transactional email mặc định dùng Resend qua `EMAIL_PROVIDER=resend` + `RESEND_API_KEY`; khi AWS SES đã verified có thể đổi sang `EMAIL_PROVIDER=ses` + `AWS_SES_*`. `AUTH_EMAIL_FROM` là sender riêng cho OTP đăng ký/xác thực. `CRON_SECRET` bảo vệ các endpoint cron như `/api/cron/reports`, `/api/cron/ai-ops`, `/api/cron/reservations/expire` (expire giữ bàn + auto no-show) và `/api/cron/subscriptions`.
`MAPBOX_ACCESS_TOKEN` dùng ở server để định vị địa chỉ giao hàng và đo quãng đường lái xe bằng Mapbox. Không cần đặt `NEXT_PUBLIC_` cho token này.
Danh sách biến đầy đủ, scope theo môi trường và checklist rollout/rollback nằm ở `docs/infrastructure-runbook.md`.

Kiểm tra trạng thái AWS SES trước khi chuyển production:

```bash
npm run aws:ses:check -- --region=us-east-1 --identity=no-reply@logivn.com
```

Lệnh này chỉ đọc trạng thái `GetAccount`, quota gửi và identity verification; không gửi email và không tạo tài nguyên AWS. Chỉ đổi `EMAIL_PROVIDER=ses` khi SES đã bật sending, identity sender/domain đã verified, và nếu cần gửi ra khách thật thì tài khoản SES đã ra khỏi sandbox.

Ảnh món/logo/ảnh AI mặc định vẫn lưu ở Supabase Storage. Khi đã tạo S3 bucket và CloudFront distribution/OAC, có thể bật upload server-side sang AWS bằng:

```txt
MENU_IMAGE_STORAGE_PROVIDER=s3
AWS_S3_REGION=us-east-1
AWS_S3_BUCKET=<bucket-assets>
AWS_S3_ACCESS_KEY_ID=<scoped-access-key>
AWS_S3_SECRET_ACCESS_KEY=<scoped-secret>
AWS_S3_PUBLIC_BASE_URL=https://<cloudfront-domain>
AWS_S3_KEY_PREFIX=logivn-assets
```

Luồng upload trực tiếp từ browser hiện vẫn dùng Supabase signed upload; adapter S3 trước mắt phục vụ các upload server-side như logo onboarding, ảnh AI được persist và các form server action.

Event nền hiện mặc định publish qua internal gateway/VPS. Khi muốn tận dụng AWS cho worker async, tạo SQS queue rồi bật:

```txt
# VPS worker first
OPERATIONAL_EVENT_SQS_CONSUMER_ENABLED=true
OPERATIONAL_EVENT_SQS_QUEUE_URL=https://sqs.<region>.amazonaws.com/<account>/<queue-name>
AWS_SQS_REGION=<region>
AWS_SQS_ACCESS_KEY_ID=<scoped-access-key>
AWS_SQS_SECRET_ACCESS_KEY=<scoped-secret>

# Vercel app after the VPS worker reports configured=true
OPERATIONAL_EVENT_QUEUE_PROVIDER=sqs
OPERATIONAL_EVENT_SQS_CONSUMER_CONFIRMED=true
OPERATIONAL_EVENT_SQS_QUEUE_URL=https://sqs.<region>.amazonaws.com/<account>/<queue-name>
AWS_SQS_REGION=<region>
AWS_SQS_ACCESS_KEY_ID=<scoped-access-key>
AWS_SQS_SECRET_ACCESS_KEY=<scoped-secret>
```

Với FIFO queue, app tự gửi `MessageDeduplicationId` theo `eventId` và `MessageGroupId` theo restaurant/tenant. VPS worker đọc SQS bằng long polling, route event vào BullMQ bằng cùng `publishOperationalEvent` của gateway, và chỉ `DeleteMessage` sau khi enqueue thành công. Nếu chưa bật consumer, không bật `OPERATIONAL_EVENT_QUEUE_PROVIDER=sqs` trên Vercel vì outbox sẽ coi event là đã publish sau khi SQS nhận message. Trên production, `OPERATIONAL_EVENT_SQS_CONSUMER_CONFIRMED=true` là guard bắt buộc để app publish trực tiếp vào SQS; chỉ đặt sau khi `/ready` của worker báo consumer enabled/configured/running và `lastError=null`.

OCR menu/hóa đơn với ảnh dùng AWS Textract để đọc chữ trước, sau đó AI hiện tại chỉ chuẩn hóa text thành JSON:

```txt
OCR_PROVIDER=textract
AI_OCR_TEXT_PROVIDER=gemini
AWS_TEXTRACT_REGION=us-east-1
AWS_TEXTRACT_ACCESS_KEY_ID=<scoped-access-key>
AWS_TEXTRACT_SECRET_ACCESS_KEY=<scoped-secret>
```

Nếu request chỉ có `rawText`, app vẫn dùng AI text bình thường. Nếu request có ảnh mà Textract chưa cấu hình hoặc không đọc được chữ, app báo lỗi rõ để người dùng chụp lại/dán text; không fallback sang MiMo vision vì MiMo 2.5 hiện không hỗ trợ OCR ảnh ổn định cho luồng này. Biến `AI_OCR_TEXT_PROVIDER` chỉ điều khiển bước chuẩn hóa text OCR thành JSON; production nên ưu tiên `gemini`, sau đó router tự fallback sang provider text khác.

Production OCR chỉ nhận ảnh tối đa 5MB cho Textract, fetch ảnh URL có timeout ngắn và chặn URL nội bộ/private network. Nên ưu tiên upload ảnh trực tiếp từ dashboard (`imageBase64`) hoặc URL public từ storage/CDN của hệ thống.

Smoke test Textract bằng ảnh cục bộ:

```bash
npm run aws:textract:check -- --image=./path/to/menu-or-invoice.jpg
```

Trên Vercel production, đặt:

```txt
NEXT_PUBLIC_APP_URL=https://logivn.com
PLATFORM_ADMIN_PASSWORD=<mật khẩu nội bộ mạnh>
PLATFORM_ADMIN_SESSION_SECRET=<chuỗi bí mật dài>
CRON_SECRET=<chuỗi bí mật dài>
EMAIL_PROVIDER=resend
RESEND_API_KEY=<Resend API key>
AUTH_EMAIL_FROM=LogiVN <no-reply@chophanmem.com>
REPORT_EMAIL_FROM=LogiVN <reports@logivn.com>
MAPBOX_ACCESS_TOKEN=<Mapbox access token>
```

Để SaaS subdomain hoạt động, cần gắn wildcard domain `*.logivn.com` vào project Vercel và trỏ DNS/nameserver theo cấu hình Vercel. Khi đó mỗi quán dùng URL dạng:

```txt
https://ten-quan.logivn.com/table/{tableId}
```

## Chạy Local

```bash
npm install
npm run dev
```

Các đường dẫn chính:

- Trang quản trị: `/dashboard`
- DevOps Control Center của LogiVN: `https://admin.logivn.com`
- Đăng ký tài khoản: `/dashboard/register`
- Onboarding tạo quán: `/dashboard/onboarding`
- Cài đặt VietQR: `/dashboard/settings`
- Khách gọi món qua subdomain: `https://[slug].logivn.com/table/[tableId]`
- Fallback kỹ thuật: `/r/[slug]/table/[tableId]`
- Health check production: `/api/health`

## Onboarding

- Người dùng đăng ký tại `/dashboard/register`.
- Đăng ký bằng email/mật khẩu sẽ gửi OTP email trước; chỉ sau khi xác thực OTP hệ thống mới tạo quán và quyền ADMIN.
- Người dùng cũng có thể đăng nhập bằng Google qua Supabase OAuth. Tài khoản Google chưa có quán sẽ được chuyển đến onboarding.
- Sau đăng nhập mà chưa có quán, hệ thống chuyển đến `/dashboard/onboarding`.
- Onboarding tự sinh subdomain từ tên quán, kiểm tra trùng qua `/api/restaurants/slug`, chọn loại hình kinh doanh và số bàn.
- Form onboarding là wizard nhiều bước, có progress và tự lưu bản nháp trên trình duyệt.
- Khi hoàn tất, hệ thống tự tạo hồ sơ ADMIN, quán, bàn, danh mục mẫu và món mẫu theo loại hình.
- Khi tạo quán, hệ thống tự cấp subscription mặc định `LogiVN Pro` với 30 ngày dùng thử.

## DevOps Control Center `admin.logivn.com`

`admin.logivn.com` là control plane nội bộ của LogiVN, tách biệt với dashboard vận hành của từng quán:

- Quản lý nội dung website, landing page, logo, banner và thông tin công ty.
- Quản lý gói dịch vụ SaaS, mặc định `LogiVN Pro` giá `99.000đ/tháng`, trial 30 ngày.
- Quản lý thanh toán gói qua VietQR của LogiVN; dev xác minh thủ công rồi kích hoạt/gia hạn subscription.
- Quản lý vòng đời cửa hàng ở mức metadata: xem thông tin quán, tạm dừng, mở lại hoặc xoá mềm.
- Quản lý user ở mức nền tảng: chặn/mở chặn tài khoản khi có lạm dụng.
- Theo dõi tín hiệu lạm dụng trial, đăng ký chờ OTP và tình trạng cấu hình bảo mật.

`admin.logivn.com` không hiển thị đơn hàng, bill hay doanh thu riêng tư của quán. Các dữ liệu vận hành đó chỉ nằm trong `/dashboard` của tenant.

Để bật đầy đủ tính năng này trên Supabase, chạy migration:

```txt
supabase/migrations/20260505110000_platform_admin_billing.sql
```

## Cấu Hình Supabase Auth

Trong Supabase Dashboard:

- Bật Email provider và email confirmation.
- Production dùng transactional email provider (`EMAIL_PROVIDER=resend` hoặc `EMAIL_PROVIDER=ses`) để LogiVN tự gửi OTP 6 số và link xác thực từ mã do Supabase Admin tạo. Nếu provider lỗi hoặc sender domain chưa verify, app phải báo lỗi thật, không hiển thị trạng thái “đã gửi” giả.
- Sender production tạm dùng domain đã verify `LogiVN <no-reply@chophanmem.com>`. Chỉ đổi về `@logivn.com` sau khi domain `logivn.com` đã verified trong Resend hoặc AWS SES.
- Custom SMTP của Supabase vẫn nên cấu hình như tuyến dự phòng cho các email Auth ngoài luồng app. SMTP mặc định của Supabase chỉ phù hợp thử nghiệm và có giới hạn gửi rất thấp.
- Template `Confirm signup` trong `supabase/templates/confirmation.html` vẫn nên được đồng bộ để dự phòng có cả OTP 6 số và nút xác thực.
- Bật password hardening trong Supabase Auth: mật khẩu tối thiểu 10 ký tự, yêu cầu chữ hoa/chữ thường/chữ số, bật refresh-token rotation và bật leaked password protection.
- Redirect URLs cần có:
  - `https://logivn.com/auth/callback**`
  - `https://logivn.com/auth/confirm**`
  - `https://*.logivn.com/auth/callback**`
  - `https://*.logivn.com/auth/confirm**`
  - `https://logi.vn.com/auth/callback**` nếu domain phụ này được cấu hình DNS/Vercel
  - `https://logi.vn.com/auth/confirm**` nếu domain phụ này được cấu hình DNS/Vercel
  - `http://localhost:3000/auth/callback**`
  - `http://localhost:3000/auth/confirm**`
- Với Google login trực tiếp, tạo OAuth Client trong Google Cloud, đưa `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_STATE_SECRET` lên Vercel, và thêm Web Client ID đó vào trường `Client IDs` của provider Google trong Supabase Auth để Supabase chấp nhận `signInWithIdToken`.
- Authorized redirect URI trên Google Cloud dùng domain LogiVN: `https://logivn.com/auth/google/callback`. Có thể thêm `http://localhost:3000/auth/google/callback` cho local dev.
- Không dùng callback `https://<project-ref>.supabase.co/auth/v1/callback` cho luồng Google chính, vì mục tiêu là màn hình Google hiển thị LogiVN thay vì Supabase project domain.
- Production yêu cầu đủ `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_STATE_SECRET`; nếu thiếu, `/auth/google` fail closed về login với lỗi cấu hình. Route legacy `/auth/google/supabase` mặc định bị tắt và chỉ bật rollback bằng `GOOGLE_LEGACY_SUPABASE_OAUTH_ENABLED=1`.
- Có thể cấu hình nhanh bằng `node scripts/configure-supabase-auth.mjs` sau khi export SMTP, Google OAuth và Supabase access token. Xem chi tiết tại `docs/auth-smtp-google-setup.md`.
- Đặt `AUTH_RATE_LIMIT_SECRET` dài và riêng biệt trong Vercel để khóa rate limit đăng nhập/đăng ký/quên mật khẩu theo IP + email đã hash.

Luồng code hỗ trợ cả hai kiểu email:

- OTP nhập tay tại `/dashboard/verify-email`.
- Link xác thực có `token_hash` tại `/auth/confirm`.
- Google OAuth trực tiếp tại `/auth/google` -> `/auth/google/callback`, có one-time HttpOnly state cookie chống replay/CSRF, sau đó tạo Supabase session bằng `signInWithIdToken`.
- OAuth/PKCE callback tại `/auth/callback` vẫn được giữ cho legacy Supabase OAuth nếu cần rollback.

## Luồng Thanh Toán

VietQR được tạo theo mẫu:

```txt
https://img.vietqr.io/image/{BANK}-{ACCOUNT}-compact2.png?amount={amount}&addInfo=ORDER-{orderId}
```

- Khách bấm `Tôi đã thanh toán` -> `waiting_confirm`
- Chủ quán bấm `Xác nhận thanh toán` -> `paid`
- Chủ quán bấm `Hoàn tất đơn` -> `completed`
- Mã VietQR ưu tiên dùng thông tin ngân hàng riêng của quán trong `/dashboard/settings`; nếu chưa có thì fallback về biến môi trường.

## Realtime

- Màn hình đơn hàng của quản trị dùng Supabase Realtime theo `restaurant_id`.
- Trạng thái đơn của khách dùng Supabase Realtime Broadcast theo topic riêng `customer-order:{orderId}`.
- Không dùng polling.

## Bảo Mật

- Bật RLS trên mọi bảng.
- Nhân viên/quản trị chỉ quản lý dữ liệu thuộc `restaurant_id` của mình.
- Public không đọc trực tiếp bảng menu/bàn/order bằng anon key; dữ liệu khách đi qua Next.js API routes đã filter theo quán và bàn.
- Realtime khách dùng broadcast theo order id, tránh cấp anon SELECT trực tiếp trên bảng `orders`.
- Mutation của khách hàng đi qua Next.js API routes với Zod validation, rate limit, idempotency key.
- Thao tác thanh toán của khách phải gửi kèm `restaurantSlug`, `tableId` và `customerSessionId` để giảm rủi ro lạm dụng order id.
- App redirect canonical các domain `*.vercel.app` về `https://logivn.com` trong production.
- Header bảo mật cơ bản được cấu hình trong `next.config.ts`.
- `admin.logivn.com` dùng cookie HTTP-only riêng và chỉ gọi service-role ở server; dữ liệu trả về đã loại bỏ đơn hàng/doanh thu riêng tư của tenant.
- Billing SaaS có bảng `restaurant_subscriptions`, `subscription_payment_logs` và `trial_claims` để audit gia hạn, xác minh VietQR và phát hiện lạm dụng dùng thử.

## Kiểm Tra

```bash
npm run infra:check
npm run lint
npm run build
npm audit --omit=dev
```
