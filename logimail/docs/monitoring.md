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
