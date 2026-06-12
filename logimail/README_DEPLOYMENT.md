# LogiMail Deployment Runbook

Runbook này dành cho triển khai MVP nội bộ. Mọi bước có thể ảnh hưởng DNS, mail server hoặc dữ liệu thật cần được chạy bởi người có quyền vận hành.

## 1. Chuẩn bị local

```bash
cd logimail
cp .env.example .env
```

Điền các biến không nhạy cảm trước. Secret thật chỉ đặt ở máy vận hành, VPS, Vercel hoặc secret manager, không commit.

## 2. Chuẩn bị Cloudflare

Tạo token riêng:

```text
Name: logimail-dns-manager
Permissions: Zone:Zone:Read, Zone:DNS:Edit
Scope: Specific zone logivn.com
```

Không dùng Global API Key.

## 3. Chuẩn bị Supabase

Ưu tiên Supabase project riêng cho LogiMail. Nếu dùng chung LogiVN project, chỉ chạy SQL trong schema `logimail`.

Checklist thao tác chi tiết nằm tại `docs/supabase-go-live-checklist.md`.

```bash
# chọn một trong hai cách, chạy trong project LogiMail hoặc schema logimail của project dùng chung
supabase/migrations/20260609000000_logimail_mvp_schema.sql

# hoặc chạy thủ công theo thứ tự trong Supabase SQL editor
supabase/schema.sql
supabase/rls-policies.sql
```

API metadata MVP dùng Supabase anon client kèm user JWT và `db.schema=logimail`, nên RLS là lớp phân quyền chính. Các route sản phẩm `/api/logimail/workspaces`, `/domains`, `/mailboxes`, `/me` chạy trong Next.js web app để dùng chung auth/session boundary với PWA. `SUPABASE_SERVICE_ROLE_KEY` chỉ đặt server-side để ghi audit log best-effort, không dùng trong frontend.

Luồng đăng ký công khai của LogiMail không dùng form SaaS chung và không dùng Google OAuth. User chọn `localPart@verified-domain`, nhập mã bảo mật một-lần và mật khẩu; server route `/api/logimail/auth/register` kiểm domain đã approved/active/registration_enabled, chặn local-part hệ thống, rate-limit theo IP, consume mã trong `logimail.security_codes`, tạo mailbox thật qua BillionMail, rồi tạo Supabase Auth user đã confirmed bằng service role. Mỗi mã có `max_uses = 1`; khi mã được dùng hoặc hết hạn, backend tự tạo mã thay thế để admin xem trong `admin.logivn.com` và LogiDev Telegram bot.

Trong Supabase Dashboard, thêm `logimail` vào **Project Settings -> API -> Exposed schemas**. Không expose `logimail_private`; schema này chỉ chứa trigger/helper `security definer`. Migration đã grant quyền bảng cho role `authenticated` và revoke role `anon` để request thiếu JWT không đọc/ghi metadata.

Cấu hình Auth redirect cho host gom luồng:

```text
https://mail.logivn.com/login
https://mail.logivn.com/register
https://mail.logivn.com/auth/register
https://mail.logivn.com/auth/callback
https://mail.logivn.com/dashboard
```

Nếu dùng chung Supabase project LogiVN, không chỉnh bảng/schema production chính và không cấp service-role cho frontend.

## 4. Chuẩn bị VPS

Trên VPS, copy env production và chạy kiểm tra:

```bash
export LOGIMAIL_DOMAIN=logivn.com
export LOGIMAIL_MAIL_HOSTNAME=mail.logivn.com
export LOGIMAIL_SMTP_HOSTNAME=mail.logivn.com
export LOGIMAIL_IMAP_HOSTNAME=mail.logivn.com
export LOGIMAIL_APP_HOSTNAME=mail.logivn.com
export LOGIMAIL_API_HOSTNAME=mail.logivn.com
export LOGIMAIL_VPS_IP=<vps-ip>
export LOGIMAIL_DEPLOYMENT_MODE=shared-logivn-vps
infra/vps/precheck-server.sh
```

Nếu precheck ổn, tiếp tục theo `docs/billionmail-setup.md`.

DNS public kiểm ngày 2026-06-09 đang cho thấy VPS LogiVN ở `103.199.19.144`, nhưng production env vẫn phải xác nhận lại trong Cloudflare/VPS provider trước khi deploy.

Lưu ý: full installer `bash install.sh` của BillionMail có thể cài Docker, mở firewall, tạo SSL tự ký, start containers và tạo `/usr/bin/bm`. Scaffold LogiMail dùng flow thủ công `cp env_init .env` + chỉnh env + `docker compose up -d` để dễ kiểm soát hơn.

## 5. DNS plan và bootstrap

Luôn chạy plan trước bootstrap:

```bash
export CLOUDFLARE_API_TOKEN=<token-scope-hep>
export CLOUDFLARE_ZONE_ID=<zone-id>
export LOGIMAIL_DOMAIN=logivn.com
export LOGIMAIL_VPS_IP=<vps-ip>
infra/cloudflare/cloudflare-dns-existing-report.sh
infra/cloudflare/cloudflare-dns-plan.sh
infra/cloudflare/cloudflare-dns-bootstrap.sh
```

Các hostname SMTP/IMAP/mail luôn được tạo `proxied=false`.

## 6. Deploy PWA

Luồng hiện tại dùng một subdomain chính: `https://mail.logivn.com`.

Khuyến nghị cho cấu hình này: chạy PWA trên VPS hoặc container nội bộ tại `127.0.0.1:3000`, sau đó reverse proxy qua Nginx/Caddy:

```text
https://mail.logivn.com/dashboard  -> LogiMail PWA
https://mail.logivn.com/login      -> LogiMail PWA
https://mail.logivn.com/register   -> LogiMail PWA
https://mail.logivn.com/auth/register -> LogiMail PWA
```

Template Nginx có sẵn tại `infra/vps/nginx-mail-logivn.conf.example`.

Không map `mail.logivn.com` sang Vercel nếu hostname này đang là MX/mail transport, vì `mail.logivn.com` phải trỏ DNS-only về VPS.

Hiện `mail.logivn.com` đang rơi về wildcard/Vercel và MX root đang dùng Cloudflare Email Routing. Vì vậy bước cutover DNS phải đi qua backup record và xác nhận thủ công, không xem đây là thay đổi bình thường.

## 7. Deploy API

API vận hành nhẹ chạy nội bộ tại `127.0.0.1:8787`; các API sản phẩm còn lại đi qua Next.js web app tại `127.0.0.1:3000`:

```text
https://mail.logivn.com/api/logimail/health -> apps/logimail-api
https://mail.logivn.com/api/logimail/*      -> apps/logimail-web Next API routes
```

Systemd unit mẫu:

```text
infra/vps/logimail-web.service.example
infra/vps/logimail-api.service.example
```

BillionMail/RoundCube tiếp tục chạy trên VPS. Nếu cần webmail public, dùng path upstream của BillionMail:

```text
https://mail.logivn.com/roundcube/
```

Admin BillionMail không public mặc định. Dùng SSH tunnel tới `127.0.0.1:8443` hoặc thêm route exact cho SafePath sau khi có bảo vệ bổ sung.

## 8. Kiểm tra trước khi dùng thật

- Gửi email đến Gmail và kiểm tra Show Original.
- Nhận email từ Gmail vào mailbox nội bộ.
- Kiểm tra SPF, DKIM, DMARC pass.
- Kiểm tra PTR/rDNS tại VPS provider.
- Kiểm tra blacklist và mail-tester.
- Xác nhận `postmaster@logivn.com` và `abuse@logivn.com` tồn tại.
- Xác nhận backup chạy và restore dry-run có log.
- Xác nhận không có record Cloudflare proxied cho hostname nhận SMTP/IMAP.
- Xác nhận không dùng `BULLMQ_PREFIX=logivn` cho LogiMail queue nếu bật queue riêng.
