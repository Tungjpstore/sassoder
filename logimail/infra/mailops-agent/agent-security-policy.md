# Chính sách MailOps Agent

Agent vận hành LogiMail dùng user riêng `mailagent`, không chạy root thường trực và không có `NOPASSWD:ALL`.

## Allowed

- Chạy healthcheck VPS/BillionMail.
- Verify DNS Cloudflare và DNS public.
- Check queue Postfix.
- Chạy backup BillionMail.
- Gửi daily report Telegram nếu có env.
- Restart service whitelist: `postfix`, `dovecot`, `rspamd`, `webmail`, `core`.

## Confirmation required

- Restart service.
- Bootstrap DNS record mới.
- Update DNS record đã tồn tại.
- Restore thật.

## Denied

- `docker compose down -v`.
- Xóa volume/mailbox/domain/user.
- Dùng Cloudflare Global API Key.
- Bật proxy cho `mail`, `smtp`, `imap`.
- Đọc raw email body khi không có yêu cầu rõ.
- Gửi campaign lớn tự động.

## Kill switch

Nếu `/etc/logimail/agent-disabled` tồn tại, mọi script agent phải thoát trước khi làm việc.
