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
RESEND_API_KEY
AUTH_EMAIL_FROM
REPORT_EMAIL_FROM
MAPBOX_ACCESS_TOKEN
```

`SUPABASE_SERVICE_ROLE_KEY` chỉ dùng ở server/API routes. Không đưa key này ra client.
`PLATFORM_ADMIN_PASSWORD` và `PLATFORM_ADMIN_SESSION_SECRET` bảo vệ DevOps Control Center tại `admin.logivn.com`.
`RESEND_API_KEY` dùng để gửi OTP xác thực, báo cáo tự động và email hệ thống. `AUTH_EMAIL_FROM` là sender riêng cho OTP đăng ký/xác thực. `CRON_SECRET` bảo vệ các endpoint cron như `/api/cron/reports`, `/api/cron/ai-ops`, `/api/cron/reservations/expire` (expire giữ bàn + auto no-show) và `/api/cron/subscriptions`.
`MAPBOX_ACCESS_TOKEN` dùng ở server để định vị địa chỉ giao hàng và đo quãng đường lái xe bằng Mapbox. Không cần đặt `NEXT_PUBLIC_` cho token này.
Danh sách biến đầy đủ, scope theo môi trường và checklist rollout/rollback nằm ở `docs/infrastructure-runbook.md`.

Trên Vercel production, đặt:

```txt
NEXT_PUBLIC_APP_URL=https://logivn.com
PLATFORM_ADMIN_PASSWORD=<mật khẩu nội bộ mạnh>
PLATFORM_ADMIN_SESSION_SECRET=<chuỗi bí mật dài>
CRON_SECRET=<chuỗi bí mật dài>
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
- Production dùng `RESEND_API_KEY`/`AUTH_EMAIL_FROM` để LogiVN tự gửi OTP 6 số và link xác thực từ mã do Supabase Admin tạo. Nếu Resend lỗi hoặc sender domain chưa verify, app phải báo lỗi thật, không hiển thị trạng thái “đã gửi” giả.
- Sender production tạm dùng domain đã verify `LogiVN <no-reply@chophanmem.com>`. Chỉ đổi về `@logivn.com` sau khi domain `logivn.com` đã verified trong Resend.
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
- Với Google login, tạo OAuth Client trong Google Cloud, lấy Client ID/Secret và bật provider Google trong Supabase Auth.
- Authorized redirect URI trên Google Cloud dùng callback của Supabase: `https://<project-ref>.supabase.co/auth/v1/callback`.
- Có thể cấu hình nhanh bằng `node scripts/configure-supabase-auth.mjs` sau khi export SMTP, Google OAuth và Supabase access token. Xem chi tiết tại `docs/auth-smtp-google-setup.md`.
- Đặt `AUTH_RATE_LIMIT_SECRET` dài và riêng biệt trong Vercel để khóa rate limit đăng nhập/đăng ký/quên mật khẩu theo IP + email đã hash.

Luồng code hỗ trợ cả hai kiểu email:

- OTP nhập tay tại `/dashboard/verify-email`.
- Link xác thực có `token_hash` tại `/auth/confirm`.
- OAuth/PKCE callback tại `/auth/callback`.

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
