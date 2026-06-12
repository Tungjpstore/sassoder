# MailOps Agent Security Policy

## Agent được phép

- Healthcheck VPS.
- Kiểm tra Docker containers BillionMail.
- Verify DNS Cloudflare.
- Tạo DNS record mới theo template an toàn nếu chưa tồn tại.
- Verify SPF/DKIM/DMARC/MX/A/PTR.
- Check port 25/465/587/993.
- Check mail queue.
- Chạy backup.
- Tạo daily report và gửi Telegram.
- Restart service whitelist nếu được phép.

## Agent cần xác nhận

- Update DNS record đã tồn tại.
- Xóa DNS record.
- Sửa MX/SPF/DKIM/DMARC.
- Đổi IP mail server.
- Nâng DMARC policy.
- Xóa mailbox/domain/user.
- Restart dịch vụ ngoài whitelist.

## Agent bị cấm

- Chạy root toàn quyền.
- `NOPASSWD:ALL`.
- Xóa Docker volume.
- `docker compose down -v`.
- Dùng Cloudflare Global API Key.
- Bật proxy cho `mail`, `smtp`, `imap`.
- Đọc raw email user nếu chưa có yêu cầu rõ.
- Gửi campaign lớn tự động.
