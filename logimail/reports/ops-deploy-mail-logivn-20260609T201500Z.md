# LogiMail deployment report - mail.logivn.com

Thời điểm: 2026-06-09T20:15:00Z

## Đã hoàn thành

- Triển khai LogiMail PWA/API lên VPS tại `/opt/logimail`.
- Tạo system user `logimail`, runtime env tại `/etc/logimail/logimail.env` với quyền `root:logimail 640`.
- Cài systemd units:
  - `logimail-web.service` tại `127.0.0.1:3000`
  - `logimail-api.service` tại `127.0.0.1:8787`
- Lấy Let's Encrypt cert cho `mail.logivn.com`, hết hạn ngày 2026-09-07.
- Bật Nginx cho `mail.logivn.com`:
  - `/dashboard`, `/login`, `/register`, assets PWA -> LogiMail web
  - `/api/logimail/` -> LogiMail API
  - `/roundcube/` -> RoundCube qua PHP-FPM socket BillionMail
- Sửa RoundCube reverse proxy:
  - static file dùng host path `/opt/BillionMail/webmail-data/public_html/`
  - FastCGI `SCRIPT_FILENAME` dùng container path `/var/www/html/public_html/...`
- Giữ BillionMail admin chỉ ở loopback: `127.0.0.1:8081` và `127.0.0.1:8443`.
- Thêm domain `logivn.com` trong BillionMail.
- Tạo mailbox vận hành tối thiểu trong BillionMail:
  - `postmaster@logivn.com`
  - `abuse@logivn.com`
  - `admin@logivn.com`
- Tạo thêm mailbox nghiệp vụ cho luồng LogiMail:
  - `support@logivn.com`
  - `dev@logivn.com`
  - `hello@logivn.com`
  - `billing@logivn.com`
  - `security@logivn.com`
  - `partner@logivn.com`
  - `noreply@logivn.com`
- Sinh DKIM selector `default` cho `logivn.com`, publish TXT `default._domainkey.logivn.com` trên Cloudflare và restart riêng Rspamd để nạp config signing.
- Tắt Cloudflare Email Routing cho `logivn.com` và cutover root MX sang BillionMail: `10 mail.logivn.com.`.
- Thêm `CLOUDFLARE_ZONE_ID` và `CLOUDFLARE_API_TOKEN` scope hẹp vào `/etc/logimail/logimail.env`; automation Cloudflare trong app đã ready.

## File root-only trên VPS

Các file này có chứa secret hoặc DNS value dài, không in public:

- `/root/logimail-billionmail-admin.txt`
- `/root/logimail-billionmail-mailboxes.txt`
- `/root/logimail-billionmail-dns-records-logivn.com.txt`
- `/etc/logimail/logimail.env`
- `/etc/logimail/logimail.env.bak-20260610161533`
- `/root/logimail-backups/20260609T200448Z/nginx-before-mail-logivn.tgz`

## Kiểm tra đã chạy

- Local: `npm --prefix logimail run check` -> pass.
- VPS: `npm install`, Next production build, API typecheck -> pass.
- Public HTTPS:
  - `https://mail.logivn.com/dashboard` -> 200
  - `https://mail.logivn.com/dashboard/domains/mail-logivn-com` -> 200
  - `https://mail.logivn.com/dashboard/mailboxes/support%40mail.logivn.com` -> 200
  - `https://mail.logivn.com/roundcube/` -> 200
  - `https://mail.logivn.com/roundcube/skins/elastic/styles/styles.min.css` -> 200
- API health:
  - BillionMail ready: true
  - Cloudflare zone id: set
  - Cloudflare API token: set; Cloudflare API DNS sample check returned `success=true`
- Mailbox auth qua Dovecot:
  - `postmaster@logivn.com` -> ok
  - `abuse@logivn.com` -> ok
  - `admin@logivn.com` -> ok
- Public DNS:
  - `mail.logivn.com A` -> `103.199.19.144`
  - PTR `103.199.19.144` -> `mail.logivn.com` on 1.1.1.1 and 8.8.8.8
  - root MX -> `10 mail.logivn.com.` on 1.1.1.1, 1.0.0.1, and 9.9.9.9
  - root SPF is `v=spf1 include:_spf.mx.cloudflare.net ip4:103.199.19.144 ~all`
  - `_dmarc.logivn.com` is `v=DMARC1; p=none; rua=mailto:postmaster@logivn.com; fo=1`
  - `default._domainkey.logivn.com` is public and matches the BillionMail DKIM value hash
- Mail smoke:
  - unauthenticated local SMTP to port 25 returned `451 4.7.1 Try again later`, consistent with anti-spam/greylisting behavior
  - authenticated submission on `127.0.0.1:587` as `admin@logivn.com` delivered to `admin@logivn.com` INBOX
  - delivered authenticated smoke message includes `DKIM-Signature`
  - outbound to `tungbipdz@gmail.com` was accepted by Gmail SMTP with `dsn=2.0.0` and `250 2.0.0 OK`
  - Gmail showed `được gửi bởi: logivn.com`, `xác thực bởi: logivn.com`, TLS standard encryption
  - first Gmail test after SPF/DMARC still landed in Spam, then was moved to Inbox/not-spam trained
  - final Gmail test `logimail-gmail-final-20260610052455` landed in Inbox
  - inbound Gmail test `logimail-inbound-gmail-20260610085135` from `tungbipdz@gmail.com` delivered to `support@logivn.com`; Dovecot saved it in Maildir.
  - outbound `support@logivn.com` test `logimail-support-outbound-20260610085428` was accepted by Gmail but initially labeled Spam; it was marked not spam in Gmail.
  - final `support@logivn.com` test `logimail-support-final-20260610085627` landed in Gmail Inbox.
  - Postfix queue was empty after final tests.
- Public ports:
  - 465, 587, 993, 995, 110, 143 reachable from local check
  - 25 timed out from local check, but Postfix is listening on VPS
  - 8081, 8443, 3000, 8787 closed/timed out publicly

## Tái xác thực sau khi tạo Cloudflare token

Kiểm tra lại ngày 2026-06-10T09:21Z:

- Local `npm --prefix logimail run check` pass đầy đủ: web/API typecheck, 10 web API smoke checks, shell syntax, secret scan, restore dry-run sample, `npm audit` 0 vulnerabilities.
- Public health `https://mail.logivn.com/api/logimail/health` trả `ok=true`, BillionMail `ready=true`, Cloudflare `ready=true`.
- `https://mail.logivn.com/dashboard` và `https://mail.logivn.com/roundcube/` đều trả HTTP 200.
- Public DNS qua `1.1.1.1`: MX root là `10 mail.logivn.com.`, `mail.logivn.com A` là `103.199.19.144`, SPF/DMARC đúng cấu hình warm-up hiện tại.
- VPS: `nginx`, `logimail-web.service`, `logimail-api.service` đều `active`.
- BillionMail Docker services `core`, `postfix`, `dovecot`, `pgsql`, `redis`, `rspamd`, `webmail` đều `Up`.
- Postfix queue rỗng.

## Cutover inbound

Root MX của `logivn.com` đã chuyển khỏi Cloudflare Email Routing sang BillionMail trên `mail.logivn.com`. Cloudflare Email Routing đã tắt cho domain này để MX không còn bị khóa. SPF vẫn giữ `include:_spf.mx.cloudflare.net` tạm thời trong giai đoạn chuyển tiếp/warm-up; có thể rút gọn sau khi xác nhận không còn sender cũ.

## Việc còn lại trước khi dùng thật

1. Tiếp tục warm-up IP/domain bằng lượng gửi thấp, nội dung thật, recipient đã đồng ý; không gửi campaign lớn khi reputation còn mới.
2. Theo dõi DMARC aggregate reports, Gmail spam placement, Postfix queue, và blacklist trong 7-14 ngày trước khi siết SPF `-all` hoặc DMARC `quarantine/reject`.
3. Nếu cần mailbox/alias mới, tạo trong BillionMail rồi test Dovecot auth + inbound/outbound trước khi đưa vào flow app.
4. Khi cần mở rộng DNS automation ngoài DNS records, rotate token Cloudflare bằng scope hẹp mới thay vì nâng quyền token hiện tại tùy tiện.
