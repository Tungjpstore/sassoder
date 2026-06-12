# LogiMail

LogiMail là module email nội bộ tách riêng cho đội ngũ LogiVN. Mục tiêu MVP là có mail server self-hosted, dashboard PWA, backend API trung gian, schema Supabase riêng và lớp MailOps agent vận hành an toàn.

## Nguyên tắc biên giới

- LogiMail nằm trong thư mục riêng `logimail/` và không sửa bảng production chính của LogiVN.
- Mapping hạ tầng thật nằm ở `docs/logivn-real-infra-mapping.md` và phải đọc trước mọi thao tác Browser/Cloudflare/VPS.
- Ưu tiên Supabase project riêng. Nếu buộc dùng chung, chỉ dùng schema `logimail.*`.
- Luồng public mặc định dùng `mail.logivn.com`: SMTP/IMAP/MX đi thẳng về VPS DNS-only, PWA/API/webmail chỉ đi qua HTTP/HTTPS reverse proxy trên cùng VPS.
- Cloudflare token chỉ được scope `Zone:Read` và `DNS:Edit` cho zone `logivn.com`.
- `mail.logivn.com` luôn để DNS only; nếu tạo alias `smtp.logivn.com`/`imap.logivn.com` thì alias cũng phải DNS only.
- Frontend không giữ Cloudflare token, BillionMail key, SMTP/IMAP credential hoặc mailbox password.
- Supabase MVP chỉ lưu metadata, không lưu raw email body hoặc attachment.
- Script tự động chỉ tạo record mới khi chưa tồn tại; update/delete luôn cần xác nhận.

## Cấu trúc

```text
logimail/
├─ apps/logimail-web/       PWA dashboard Next.js skeleton
├─ apps/logimail-api/       API service skeleton độc lập nếu chạy trên VPS
├─ packages/                Shared package placeholder
├─ supabase/                Schema và RLS policy riêng cho LogiMail
├─ infra/vps/               Script precheck, firewall, BillionMail, backup
├─ infra/cloudflare/        Script DNS plan/bootstrap/verify an toàn
├─ infra/mailops-agent/     Policy và script cho agent vận hành least privilege
├─ docs/                    Runbook, kiến trúc, bảo mật, deliverability
└─ scripts/                 Script dev/check phụ trợ
```

## Thứ tự triển khai khuyến nghị

1. Đọc `docs/logivn-real-infra-mapping.md`, `docs/architecture.md`, `docs/security.md`, `docs/cloudflare-dns.md`.
2. Tạo Supabase project riêng hoặc chuẩn bị schema `logimail` bằng `supabase/migrations/20260609000000_logimail_mvp_schema.sql`; nếu chạy thủ công thì dùng `supabase/schema.sql` rồi `supabase/rls-policies.sql`.
3. Tạo Cloudflare API token scope hẹp, điền `.env.production` trên máy vận hành.
4. Chạy `infra/vps/precheck-server.sh` trên VPS để kiểm tra port, RAM, disk, hostname.
5. Cài Docker và BillionMail theo `docs/billionmail-setup.md`.
6. Chạy DNS plan trước: `infra/cloudflare/cloudflare-dns-plan.sh`.
7. Bootstrap DNS chỉ khi plan đúng: `infra/cloudflare/cloudflare-dns-bootstrap.sh`.
8. Lấy DKIM từ BillionMail rồi chạy `infra/cloudflare/cloudflare-dns-add-dkim.sh`.
9. Nếu gom web/API về `mail.logivn.com`, dùng `infra/vps/nginx-mail-logivn.conf.example` và systemd unit mẫu trong `infra/vps/`.
10. Verify DNS, PTR, SPF, DKIM, DMARC, port và test gửi/nhận theo `docs/mail-deliverability.md`.
11. Cài MailOps agent sau khi đã kiểm tra sudoers và kill switch.

## Kiểm tra local

Chạy toàn bộ check nhanh trước khi thao tác Supabase/Cloudflare/VPS thật:

```bash
npm run check
```

Khi chuẩn bị Supabase thật, dùng checklist `docs/supabase-go-live-checklist.md`.

## Trạng thái scaffold

Scaffold hiện tại tạo nền ổn định trước: tài liệu, script an toàn mặc định, schema, RLS, PWA skeleton và API skeleton. Chưa có lệnh nào tự thay đổi Cloudflare, VPS hoặc Supabase production.
