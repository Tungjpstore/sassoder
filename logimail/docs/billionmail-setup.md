# Cài đặt BillionMail cho LogiMail

## Chuẩn bị

- VPS tối thiểu MVP: 4 vCPU, 6GB RAM, 60GB SSD.
- Hostname mail: `mail.logivn.com`.
- Port cần kiểm tra: 25, 465, 587, 993, 80, 443 và các upstream nội bộ `3000`, `8787`, `8081`, `8443`, `25432`, `26379`.
- PTR/rDNS phải trỏ về `mail.logivn.com` tại VPS provider.

## Nguồn chính thức đã kiểm tra

- Repo bạn cung cấp: `https://github.com/Billionmail/BillionMail`.
- README hiện cũng trỏ lệnh clone qua `https://github.com/aaPanel/BillionMail`; hai đường dẫn đang cùng dòng dự án. Khi chạy production nên pin branch/tag hoặc commit.
- Remote HEAD của repo hiện là `dev`; `update.sh` lại fetch/merge từ `main`. Khi production, hãy pin branch/tag rõ ràng thay vì clone mơ hồ.
- `install.sh` yêu cầu root, hệ 64-bit và hỗ trợ `x86_64`, `aarch64`.
- `install.sh` có side effects lớn: cài package hệ thống, cài/start Docker, mở firewall, tạo self-signed SSL, chạy `docker compose pull/up -d`, tạo symlink `/usr/bin/bm`.
- `env_init` có default `ADMIN_USERNAME=billion`, `ADMIN_PASSWORD=billion`, `SafePath=billion`; LogiMail phải đổi trước khi chạy thật.
- `docker-compose.yml` publish SMTP `25`, SMTPS `465`, submission `587`, IMAP `143`, IMAPS `993`, POP `110`, POPS `995`, HTTP `80`, HTTPS `443`; Postgres và Redis bind loopback mặc định qua `127.0.0.1:25432` và `127.0.0.1:26379`.
- Trên VPS chung LogiVN, không dùng default HTTP/HTTPS `80/443` của BillionMail. Scaffold `install-billionmail.sh` đặt `HTTP_PORT=8081`, `HTTPS_PORT=8443` để Nginx LogiVN giữ public `80/443`.
- RoundCube webmail dùng request path `/roundcube/`.
- Script quản lý chính là `bm.sh`: `bm default`, `bm show-record`, `bm update`.

## Cài đặt tham khảo an toàn

```bash
cd /opt
git clone --branch dev https://github.com/Billionmail/BillionMail.git BillionMail
cd /opt/BillionMail
cp env_init .env
```

Trong `.env`, đặt tối thiểu:

```text
ADMIN_USERNAME=<admin-rieng>
ADMIN_PASSWORD=<password-random-manh>
SafePath=<random-path>
BILLIONMAIL_HOSTNAME=mail.logivn.com
TZ=Asia/Ho_Chi_Minh
HTTP_PORT=8081
HTTPS_PORT=8443
SQL_PORT=127.0.0.1:25432
REDIS_PORT=127.0.0.1:26379
```

Không giữ default `billion/billion/billion`.

Nếu dùng script LogiMail thay vì chỉnh tay, export trước:

```bash
export LOGIMAIL_DOMAIN=logivn.com
export LOGIMAIL_MAIL_HOSTNAME=mail.logivn.com
export BILLIONMAIL_HTTP_PORT=8081
export BILLIONMAIL_HTTPS_PORT=8443
sudo -E infra/vps/install-billionmail.sh
```

## Khởi chạy

```bash
cd /opt/BillionMail
docker compose up -d
```

Không chạy `bash install.sh` trong CI/máy dev. Nếu chọn full installer của BillionMail, chạy trên VPS thật sau khi đã đọc side effects ở trên.

Nếu repo cung cấp `bm.sh`, dùng nó để lấy dashboard URL/admin path theo hướng dẫn chính thức của BillionMail.

```bash
cd /opt/BillionMail
bash bm.sh default
```

Trên shared VPS, admin URL từ `bm default` hoặc `/root/logimail-billionmail-admin.txt` nên dùng qua SSH tunnel trước:

```bash
ssh -L 8443:127.0.0.1:8443 root@103.199.19.144
```

Sau đó mở `https://127.0.0.1:8443/<SafePath>`. Không expose SafePath public nếu chưa có Basic Auth, IP allowlist, Cloudflare Access hoặc VPN.

## Cấu hình domain đầu tiên

1. Add domain nhận/gửi chính là `logivn.com`; hostname máy mail là `mail.logivn.com`.
2. Tạo mailbox đầu tiên: `postmaster@logivn.com`, `abuse@logivn.com`, `admin@logivn.com`.
3. Tạo mailbox nghiệp vụ tối thiểu cho vận hành: `support@logivn.com`, `dev@logivn.com`, `hello@logivn.com`, `billing@logivn.com`, `security@logivn.com`, `partner@logivn.com`, `noreply@logivn.com`.
4. Lấy DNS record/DKIM public key từ BillionMail bằng UI hoặc `bash bm.sh show-record`.
5. Thêm DKIM bằng `infra/cloudflare/cloudflare-dns-add-dkim.sh`.
6. Verify SPF/DKIM/DMARC/MX.

Với luồng một subdomain, cấu hình client dùng cùng hostname:

```text
SMTP: mail.logivn.com:587 STARTTLS hoặc 465 TLS
IMAP: mail.logivn.com:993 TLS
Webmail: https://mail.logivn.com/roundcube/
Dashboard LogiMail: https://mail.logivn.com/dashboard
API LogiMail: https://mail.logivn.com/api/logimail
```

## Test gửi nhận

- Gửi từ mailbox LogiMail sang Gmail.
- Trong Gmail, mở Show Original để kiểm tra SPF/DKIM/DMARC.
- Gửi từ Gmail về mailbox LogiMail.
- Kiểm tra RoundCube/webmail nhận được email.
- Kiểm tra queue bằng script `infra/mailops-agent/check-mail-queue.sh`.

Kết quả test vận hành ngày 2026-06-10:

- SPF root đã thêm IP VPS: `v=spf1 include:_spf.mx.cloudflare.net ip4:103.199.19.144 ~all`.
- DMARC đã thêm ở chế độ quan sát: `v=DMARC1; p=none; rua=mailto:postmaster@logivn.com; fo=1`.
- DKIM selector `default` public và Gmail hiển thị thư được gửi/xác thực bởi `logivn.com`.
- Test cuối tới `tungbipdz@gmail.com` với marker `logimail-gmail-final-20260610052455` được Gmail nhận và nằm trong Inbox.
- Cloudflare Email Routing đã tắt cho `logivn.com`; root MX đã cutover sang `10 mail.logivn.com.`.
- Inbound Gmail -> LogiMail đã nhận và lưu vào `support@logivn.com` với marker `logimail-inbound-gmail-20260610085135`; Postfix chuyển LMTP sang Dovecot và trả `Saved`.
- Outbound `support@logivn.com` -> `tungbipdz@gmail.com` marker đầu `logimail-support-outbound-20260610085428` được Gmail nhận nhưng vào Spam; đã bấm `Báo cáo không phải thư rác` trong Gmail.
- Test cuối sau not-spam training `logimail-support-final-20260610085627` được Gmail nhận trong Inbox; Postfix trả `250 2.0.0 OK` và mail queue rỗng.

## Reverse proxy

BillionMail có tài liệu reverse proxy trong `docs/REVERSE_PROXY.md`. Nếu gom webmail/PWA/API về `mail.logivn.com`, cần một reverse proxy HTTP/HTTPS phía trước và giữ SMTP/IMAP đi thẳng tới Postfix/Dovecot.

Template tham khảo: `infra/vps/nginx-mail-logivn.conf.example`.

Cần chú ý:

- Nếu BillionMail đang bind trực tiếp port `80`/`443`, phải đổi web UI của BillionMail sang loopback/high port trước khi bật Nginx/Caddy trên `80`/`443`.
- Public reverse proxy mặc định chỉ expose `/roundcube/` cho webmail. BillionMail admin SafePath không public mặc định.
- Khi serve RoundCube qua Nginx host, static file dùng host path `/opt/BillionMail/webmail-data/public_html/`, nhưng FastCGI `SCRIPT_FILENAME` phải dùng path trong container `/var/www/html/public_html/...` vì PHP-FPM chạy trong container RoundCube.
- Forward `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` và WebSocket headers.
- Trong UI BillionMail, setting `reverse_proxy_domain` phải có scheme: `https://mail.logivn.com`.
- Cloudflare `A mail.logivn.com` vẫn để DNS-only.

## Volume cần hiểu trước backup

Theo compose upstream, các phần quan trọng gồm `postgresql-data`, `vmail-data`, `ssl`, `conf`, `core-data`, `rspamd-data`, `webmail-data`, `postfix-data`, `redis-data`, `logs` và `.env`.

## Không làm trong MVP

- Không sửa core BillionMail.
- Không mở relay public.
- Không gửi campaign lớn khi IP/domain mới.
- Không bỏ qua warm-up/reputation chỉ vì Gmail đã vào Inbox trong smoke test; tăng volume chậm và theo dõi DMARC/report/queue.
- Không expose dashboard BillionMail public nếu chưa có bảo vệ bổ sung.
- Không chạy `bm update` trong production nếu chưa backup `.env`, compose và volume mail.
- Kiểm tra nghĩa vụ AGPLv3 trước khi sửa/phân phối core BillionMail.
