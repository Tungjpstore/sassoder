# Supabase Go-Live Checklist cho LogiMail

Checklist này dùng trước khi nối LogiMail PWA/API vào Supabase thật. Mặc định ưu tiên Supabase project riêng; nếu dùng chung project LogiVN thì chỉ thao tác trong schema `logimail` và `logimail_private`.

## 1. Trước khi mở Browser

- Chạy local check:

```bash
cd logimail
npm run check
```

- Xác nhận không có secret thật trong repo:

```bash
bash scripts/check-secrets.sh
```

- Chuẩn bị các giá trị để điền vào secret manager/VPS/Vercel, không dán vào chat:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

## 2. Chọn project Supabase

Option khuyến nghị:

- Tạo project riêng tên `logimail` hoặc `logivn-logimail`.
- Dùng Auth riêng, Data API riêng, service-role riêng.

Option dùng chung LogiVN project:

- Không sửa bảng/schema production chính.
- Không expose thêm schema production khác.
- Chỉ chạy migration tạo `logimail` và `logimail_private`.

## 3. Chạy migration

Trong SQL editor hoặc pipeline migration riêng, chạy:

```sql
-- file local:
-- supabase/migrations/20260609000000_logimail_mvp_schema.sql
```

Sau khi chạy, kiểm tra tối thiểu:

```sql
select schema_name
from information_schema.schemata
where schema_name in ('logimail', 'logimail_private');

select tablename, rowsecurity
from pg_tables
where schemaname = 'logimail'
order by tablename;
```

Kỳ vọng:

- Có đủ hai schema `logimail`, `logimail_private`.
- Tất cả bảng trong `logimail` có RLS bật.
- Không có bảng production chính của LogiVN bị thay đổi.

## 4. Cấu hình Data API

Trong Supabase Dashboard:

```text
Project Settings -> API -> Exposed schemas
```

Thêm:

```text
logimail
```

Không thêm:

```text
logimail_private
```

Lý do: `logimail_private` chứa trigger/helper `security definer`; giữ schema này ngoài Data API để giảm bề mặt rủi ro.

## 5. Cấu hình Auth URL

Trong Supabase Auth URL/redirect settings, thêm các URL của luồng gom về `mail.logivn.com`:

```text
https://mail.logivn.com/login
https://mail.logivn.com/register
https://mail.logivn.com/dashboard
https://mail.logivn.com/auth/callback
```

Nếu test local PWA trước production, thêm tạm:

```text
http://localhost:3000/login
http://localhost:3000/register
http://localhost:3000/dashboard
http://localhost:3000/auth/callback
```

Gỡ local URLs khỏi production policy nếu không còn cần.

## 6. Cấu hình env server-side

Đặt trên môi trường chạy LogiMail API/PWA server:

```text
NEXT_PUBLIC_SUPABASE_URL=<project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-server-side-only>
```

Quy tắc:

- `NEXT_PUBLIC_*` có thể xuất hiện ở frontend.
- `SUPABASE_SERVICE_ROLE_KEY` chỉ đặt ở VPS/Vercel/server secret manager.
- Không commit `.env` thật.

## 7. Smoke test sau khi cấu hình

Local contract vẫn phải pass:

```bash
cd logimail
npm run smoke:api:web
```

Sau khi app thật chạy, kiểm tra health endpoint:

```bash
curl -fsS https://mail.logivn.com/api/logimail/health
```

Kỳ vọng:

```json
{
  "ok": true,
  "data": {
    "service": "logimail-web-api",
    "status": "ready",
    "missing": []
  }
}
```

Sau đó đăng nhập bằng Supabase Auth và thử metadata route bằng user JWT:

```bash
curl -fsS https://mail.logivn.com/api/logimail/me \
  -H 'Authorization: Bearer <user-jwt>'
```

Không dùng service-role key trong curl/client test.

## 8. RLS sanity checks

Tạo hai user test nếu có thể:

- User A tạo workspace.
- User B đăng nhập nhưng chưa là member.

Kỳ vọng:

- User A thấy workspace/domain/mailbox của mình.
- User B không thấy workspace của User A.
- User B chỉ thấy mailbox khi được gán trong `mailbox_permissions` hoặc được thêm vào workspace.
- Request thiếu JWT trả `401`.
- Request `restart-safe` thiếu `x-logimail-confirm=I_UNDERSTAND_LOGIMAIL_RISK` trả `428`.

## 9. Rollback mềm

Nếu Data API hoặc RLS sai:

- Gỡ `logimail` khỏi Exposed schemas để chặn API surface.
- Không xóa schema ngay nếu cần điều tra audit/log.
- Tắt env `SUPABASE_SERVICE_ROLE_KEY` trên app nếu nghi lộ server secret.
- Giữ nguyên Cloudflare DNS và BillionMail; Supabase metadata không nên ảnh hưởng mail transport.

## 10. Điều chưa làm ở bước này

- Chưa đổi MX/SPF/DKIM/DMARC production của `logivn.com`.
- Chưa tạo side effect Cloudflare từ API route.
- Chưa tạo mailbox thật trong BillionMail từ PWA metadata.
- Chưa lưu raw email body/attachment vào Supabase.
