# Lớp API

Các route handler chạy thật nằm trong `app/api` để có thể deploy trực tiếp lên Vercel.

Thư mục này dành cho ghi chú hợp đồng API, controller adapter hoặc SDK contract trong tương lai. Nghiệp vụ nằm trong
`/services`, còn truy cập dữ liệu đi qua Supabase client trong `/lib/supabase` và các service luôn nhận phạm vi
`restaurantId`.

## Route chính

- `GET /api/health`: kiểm tra domain app, kết nối Supabase và latency cơ bản.
- `GET /auth/google`: bắt đầu Google OAuth qua Supabase.
- `GET /auth/callback`: đổi OAuth/PKCE code lấy session, tự hoàn tất registration intent nếu có.
- `GET /auth/confirm`: xác thực email link dạng `token_hash` cho OTP/magic link.
- `POST /api/orders`: tạo đơn khách hàng, có Zod validation, rate limit và idempotency key.
- `GET /api/orders/[orderId]`: lấy trạng thái đơn công khai, bắt buộc kèm `restaurantSlug`, `tableId`, `customerSessionId`.
- `POST /api/orders/[orderId]/checkout`: khách chọn VietQR hoặc tiền mặt, bắt buộc gửi kèm ngữ cảnh quán/bàn/phiên.
- `POST /api/orders/[orderId]/paid`: khách xác nhận đã chuyển khoản VietQR, bắt buộc gửi kèm ngữ cảnh quán/bàn/phiên.
- `GET /api/admin/orders`: danh sách đơn đang mở theo `restaurantId` của session.
- `POST /api/admin/orders/[orderId]/confirm-payment`: chủ quán xác nhận thanh toán.
- `POST /api/admin/orders/[orderId]/complete`: hoàn tất đơn đã thanh toán.

## Tenant routing

- `https://[slug].logivn.com/table/[tableId]` được xử lý bởi `proxy.ts` và rewrite vào `/r/[slug]/table/[tableId]`.
- `/r/[slug]/table/[tableId]` vẫn tồn tại như fallback kỹ thuật, nhưng QR bàn trong admin dùng subdomain riêng.
