# Monitoring LogiMail

## Health checks

- CPU/RAM/disk VPS.
- Docker containers BillionMail.
- BillionMail services từ compose: `pgsql`, `redis`, `rspamd`, `dovecot`, `postfix`, `webmail`, `core`.
- Port 25/465/587/993/80/443.
- Mail queue.
- DNS A/MX/SPF/DKIM/DMARC.
- PTR/rDNS.
- SSL certificate.
- Backup gần nhất.
- Blacklist status.
- Bounce rate nếu có.

## Telegram report

Nếu có env:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

MailOps agent có thể gửi report hằng ngày. Không gửi secret trong message.

LogiVN root còn có Platform DevOps bot riêng. Nếu muốn forward alert LogiMail vào lớp đó, dùng webhook/key server-side riêng:

```text
LOGIMAIL_PLATFORM_ALERTS_ENABLED=true
LOGIMAIL_PLATFORM_ALERT_FORWARD_URL=https://api.logivn.com/events
LOGIMAIL_PLATFORM_ALERT_FORWARD_KEY=<scoped-key>
```

Không dùng tenant Telegram bot/session của LogiVN cho alert mail server.

## Mức cảnh báo MVP

- Disk > 80%: cảnh báo.
- Disk > 90%: khẩn cấp.
- Queue tăng liên tục: kiểm tra spam/bounce/provider.
- Port 25 fail: kiểm tra firewall/provider.
- DNS auth fail: kiểm tra SPF/DKIM/DMARC.
- Backup quá 24h: cảnh báo.

## Production gates bắt buộc

Không coi health API `ready` là bằng chứng mail stack sẵn sàng nếu chưa qua các gate sau:

1. `LOGIMAIL_INGEST_KEY` phải được cấu hình và nguồn bounce/complaint của Postfix/BillionMail phải gọi được `/api/logimail/ingest/bounce`. Nếu chưa có bridge/webhook, suppression tự động được xem là **disabled**.
2. `docker exec billionmail-postfix-billionmail-1 postqueue -p` phải chạy thành công. Queue rỗng chỉ là ảnh chụp hiện tại; cần cảnh báo khi số lượng hoặc tuổi thư tăng liên tục.
3. Cron `alerts-scan` phải trả HTTP 2xx. `logimail-run-cron` ghi cả HTTP status và response body khi lỗi; không chấp nhận log chỉ có `curl: (22)` mà không có nguyên nhân.
4. Phải có ít nhất một backup BillionMail mới hơn 24 giờ, checksum/manifest hợp lệ và một restore dry-run gần nhất. Backup chung của project LogiVN không được mặc định coi là backup mailbox.
5. Kiểm tra cả SMTP/IMAP TLS từ bên ngoài và container runtime từ bên trong. Container chỉ ở trạng thái `running` nhưng không có Docker healthcheck phải được đánh dấu `degraded`, không phải `ready`.

Lệnh kiểm tra read-only tối thiểu:

```bash
curl -fsS https://mail.logivn.com/api/logimail/health
docker exec billionmail-postfix-billionmail-1 postqueue -p
docker exec billionmail-core-billionmail-1 fail2ban-client status
find /var/backups/logimail -maxdepth 1 -type f -name 'billionmail-*.manifest.txt' -mtime -1 -print
tail -n 120 /var/log/logimail/cron.log
```

Nếu `LOGIMAIL_INGEST_KEY`, backup artifact hoặc queue probe chưa sẵn sàng, dashboard/runbook phải hiển thị rõ `degraded` hoặc `not_configured`; không suy diễn từ việc port đang listen.
