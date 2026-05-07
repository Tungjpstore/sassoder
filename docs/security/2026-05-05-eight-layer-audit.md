# LogiVN Security Audit 8 Lớp - 2026-05-05

Phạm vi: 4 luồng chính của hệ thống LogiVN gồm landing/CMS nền tảng, `/admin` control plane, `/dashboard` của quán và luồng khách gọi món/đặt online/đặt bàn.

## 1. Auth Và Phiên Đăng Nhập

- `/dashboard` dùng Supabase Auth, đọc session server-side bằng `getClaims()` rồi fallback `getUser()`.
- `/admin` dùng cookie HTTP-only, ký HMAC, path giới hạn `/admin`.
- User bị `blocked` hoặc quán bị `deleted` không còn nhận session hợp lệ.
- Cần giữ `PLATFORM_ADMIN_PASSWORD` và `PLATFORM_ADMIN_SESSION_SECRET` mạnh trên Vercel.
- Landing CMS dùng cache tag `platform-site-config`; khi `/admin` lưu setting sẽ revalidate tag + route `/` để nội dung cập nhật mà không hit DB mỗi request.

## 2. Tenant Isolation Và RLS

- RLS đã bật cho các bảng vận hành chính: restaurants, users, tables, menu, orders, payments, reservations, reports.
- Policy tenant dựa trên `current_restaurant_id()`.
- Service-role chỉ dùng trong server-only modules, không import vào client.
- Tham chiếu chuẩn: Supabase RLS và API key/service-role docs.

## 3. Entitlement Gói Dịch Vụ

- Thêm `assertRestaurantEntitlement()` trong `services/subscription-service.ts`.
- Các thao tác vận hành tạo giá trị đã fail-closed nếu quán hết trial, hết hạn, pending payment, suspended hoặc deleted:
  - tạo/sửa menu, bàn, QR, khuyến mãi, nhân viên
  - bật đặt món online, đặt bàn, lịch báo cáo
  - khách tạo order tại bàn, order online, đặt bàn, gọi nhân viên
  - admin quán xử lý order/payment/reservation/service request qua API
- `/dashboard/settings?section=billing` vẫn mở để quán gia hạn.

## 4. Billing Và Chống Bug Gói

- Migration `20260505123000_subscription_entitlement_hardening.sql` thêm RPC `confirm_subscription_payment_atomic()`.
- Xác minh thanh toán gói khóa row payment + subscription trong một transaction SQL để tránh double confirm/double extend.
- Backfill trial Pro cho các quán cũ chưa có subscription để tránh khóa oan sau migration.
- Platform audit log ghi các action nhạy cảm của `/admin`.
- Cron `/api/cron/subscriptions` tự chuyển trial quá hạn sang `expired` và subscription quá hạn sang `past_due`.

## 5. Input Validation Và Abuse Control

- Zod đang bảo vệ server actions/API body chính.
- Có rate limit theo IP cho login, register, OTP, order, remote order, reservation, service request.
- Registration intent + trial claim ghi email/IP hash để phát hiện lạm dụng trial.

## 6. Upload/Storage

- Menu image và platform assets kiểm tra MIME + size trước khi upload.
- Bucket tách biệt `menu-images` và `platform-assets`.
- Scanner đã báo `document.write`; đã thay bằng Blob URL khi in poster QR để giảm XSS surface.

## 7. Vercel/HTTP Headers/CSP

- `next.config.ts` có HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- CSP đã nâng từ frame/object/base-only sang `default-src`, `script-src`, `img-src`, `connect-src`, `form-action`.
- Connect/image vẫn cho phép Supabase, Mapbox, VietQR, QR server và HTTPS assets cần thiết.

## 8. Observability, Audit Và Vận Hành

- `/admin/security` hiển thị audit 8 lớp, env status, lạm dụng trial, đăng ký gần đây và audit log.
- Bảng `platform_audit_logs` ghi thay đổi setting, plan, tenant/user status và xác minh thanh toán subscription.
- Báo cáo định kỳ có log gửi báo cáo riêng cho dashboard quán.

## Kết Quả Scan

- `npm audit`: 0 critical/high/moderate/low theo scanner nội bộ.
- False positive:
  - `.agents/skills/vulnerability-scanner/scripts/security_scan.py` là chính script scanner, không thuộc runtime app.
  - `components/dashboard/login-form.tsx` bị nhận nhầm chữ “G” icon Google thành credential.
- Local secret:
  - `.env.local` có Supabase service role và Mapbox token thật nhưng đang được `.gitignore` loại trừ.
  - Nếu file này từng bị chia sẻ ra ngoài, cần rotate key ở Supabase/Mapbox ngay.

## Tài Liệu Chuẩn Dùng Đối Chiếu

- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase API keys/service role: https://supabase.com/docs/guides/api/api-keys
- Next.js custom headers: https://nextjs.org/docs/app/api-reference/config/next-config-js/headers
- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

## Việc Cần Theo Dõi Tiếp

- Rotate key nếu nghi ngờ `.env.local` từng được gửi cho bên thứ ba.
- Tách `/admin` thành 2 lớp quyền nếu có nhiều dev nội bộ: owner, operator, support.
- Thêm IP/device risk scoring cho trial abuse.
- Thêm báo cáo bảo mật định kỳ gửi email platform owner.
