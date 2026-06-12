# Luồng LogiMail trên `mail.logivn.com`

Tài liệu này chuẩn hóa cấu hình một subdomain cho LogiMail. Mục tiêu là dùng `mail.logivn.com` làm entrypoint chính nhưng không làm hỏng SMTP/IMAP.

## Quyết định domain

```text
Public URL: https://mail.logivn.com
PWA:        https://mail.logivn.com/dashboard
API:        https://mail.logivn.com/api/logimail
Webmail:    https://mail.logivn.com/roundcube/
SMTP:       mail.logivn.com:587 STARTTLS hoặc 465 TLS
IMAP:       mail.logivn.com:993 TLS
MX target:  mail.logivn.com
```

Cloudflare record `A mail.logivn.com` phải để `DNS only`. Không bật proxy cam cho hostname này.

## Trạng thái DNS thật 2026-06-10

DNS public hiện cho thấy `api.logivn.com`, `ws.logivn.com`, `worker.logivn.com` và `monitor.logivn.com` cùng trỏ về VPS `103.199.19.144`.

`mail.logivn.com` đã là record exact trỏ VPS `103.199.19.144`, để DNS-only và không còn rơi về wildcard/Vercel. Cloudflare Email Routing cho `logivn.com` đã tắt; MX root hiện là `10 mail.logivn.com.`.

SPF root hiện là `v=spf1 include:_spf.mx.cloudflare.net ip4:103.199.19.144 ~all`; giữ cấu hình mềm trong giai đoạn warm-up để tránh phá sender cũ nếu còn sót. Khi không còn phụ thuộc sender cũ, có thể rút gọn theo mục tiêu deliverability trong `docs/cloudflare-dns.md`.

Hệ quả: luồng inbound/outbound thật đã chạy qua BillionMail trên `mail.logivn.com`. Các thay đổi MX/SPF/DMARC tiếp theo vẫn là thao tác production-sensitive và cần backup record trước khi sửa.

## Env chuẩn

```bash
LOGIMAIL_ENV=production
LOGIMAIL_DEPLOYMENT_MODE=shared-logivn-vps
LOGIMAIL_DOMAIN=logivn.com
LOGIMAIL_MAIL_HOSTNAME=mail.logivn.com
LOGIMAIL_SMTP_HOSTNAME=mail.logivn.com
LOGIMAIL_IMAP_HOSTNAME=mail.logivn.com
LOGIMAIL_APP_HOSTNAME=mail.logivn.com
LOGIMAIL_API_HOSTNAME=mail.logivn.com
LOGIMAIL_PUBLIC_URL=https://mail.logivn.com
LOGIMAIL_API_BASE_PATH=/api/logimail
LOGIMAIL_WEBMAIL_PATH=/roundcube/
LOGIMAIL_VPS_IP=<vps-ip>
LOGIMAIL_WEB_PORT=3000
LOGIMAIL_API_PORT=8787
LOGIMAIL_INTERNAL_API_KEY=<random-server-key>

BILLIONMAIL_HOSTNAME=mail.logivn.com
BILLIONMAIL_BASE_URL=http://127.0.0.1:8081
BILLIONMAIL_REVERSE_PROXY_DOMAIN=https://mail.logivn.com
BILLIONMAIL_HTTP_PORT=8081
BILLIONMAIL_HTTPS_PORT=8443
BILLIONMAIL_SQL_PORT=127.0.0.1:25432
BILLIONMAIL_REDIS_PORT=127.0.0.1:26379

BACKUP_STORAGE_ADAPTER=worker
R2_BUCKET=logivn-backups
BACKUP_R2_PREFIX=logimail
```

Secret thật đặt trong `/etc/logimail/logimail.env`, VPS secret manager hoặc CI/CD secret store. Không commit secret.

## DNS cần có

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| A | `mail.logivn.com` | `103.199.19.144` | DNS only |
| MX | `logivn.com` | `mail.logivn.com`, priority 10 | N/A |
| TXT | `logivn.com` | `v=spf1 include:_spf.mx.cloudflare.net ip4:103.199.19.144 ~all` | N/A |
| TXT | `_dmarc.logivn.com` | `v=DMARC1; p=none; rua=mailto:postmaster@logivn.com; fo=1` | N/A |
| TXT | `default._domainkey.logivn.com` | DKIM selector `default` từ BillionMail | N/A |

Chạy plan trước khi bootstrap:

```bash
cd logimail
export CLOUDFLARE_API_TOKEN=<token-scope-hep>
export CLOUDFLARE_ZONE_ID=<zone-id>
export LOGIMAIL_DOMAIN=logivn.com
export LOGIMAIL_MAIL_HOSTNAME=mail.logivn.com
export LOGIMAIL_SMTP_HOSTNAME=mail.logivn.com
export LOGIMAIL_IMAP_HOSTNAME=mail.logivn.com
export LOGIMAIL_VPS_IP=<vps-ip>

infra/cloudflare/cloudflare-dns-plan.sh
infra/cloudflare/cloudflare-dns-bootstrap.sh
infra/cloudflare/cloudflare-dns-verify.sh
```

## VPS routing

Reverse proxy chỉ xử lý HTTP/HTTPS:

```text
127.0.0.1:3000 -> LogiMail PWA
127.0.0.1:8787 -> LogiMail API
127.0.0.1:8081 -> BillionMail/RoundCube HTTP upstream
127.0.0.1:8443 -> BillionMail HTTPS/admin upstream noi bo
```

Template Nginx: `infra/vps/nginx-mail-logivn.conf.example`.

Nếu chạy chung VPS LogiVN, BillionMail phải chuyển web UI sang loopback/high port trước khi bật Nginx/Caddy trên `80`/`443`. Scaffold hiện đặt default `HTTP_PORT=8081` và `HTTPS_PORT=8443`. SMTP/IMAP port vẫn do BillionMail/Postfix/Dovecot giữ:

```text
25, 465, 587, 143, 993
```

BillionMail admin SafePath không public mặc định trên `mail.logivn.com`; dùng SSH tunnel hoặc thêm route exact có bảo vệ sau khi đã phê duyệt. Public mặc định chỉ route LogiMail PWA/API và RoundCube.

## Systemd mẫu

```text
infra/vps/logimail-web.service.example
infra/vps/logimail-api.service.example
```

Gợi ý triển khai trên VPS:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin logimail || true
sudo mkdir -p /opt/logimail /etc/logimail
sudo chown -R logimail:logimail /opt/logimail
sudo install -m 600 .env.production.example /etc/logimail/logimail.env
```

Sau khi build/copy source vào `/opt/logimail`, enable service theo unit mẫu và kiểm tra:

```bash
curl -fsS http://127.0.0.1:8787/api/logimail/health
curl -I https://mail.logivn.com/dashboard
curl -I https://mail.logivn.com/roundcube/
```

## Verify trước khi dùng thật

- `dig +short mail.logivn.com A` trả về VPS IP.
- `dig +short logivn.com MX` trả về `10 mail.logivn.com.`.
- Cloudflare UI hiển thị `mail.logivn.com` là DNS-only.
- PTR/rDNS tại VPS provider trỏ về `mail.logivn.com`.
- `postmaster@logivn.com`, `abuse@logivn.com`, `admin@logivn.com`, `support@logivn.com` tồn tại.
- Gmail Show Original pass hoặc có giải thích rõ cho SPF/DKIM/DMARC.
- `curl https://mail.logivn.com/api/logimail/health` trả JSON health.
- Không có raw email body/attachment trong Supabase MVP.
