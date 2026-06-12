# Emergency Kill Switch

Kill switch dừng mọi script MailOps agent không khẩn cấp.

## Bật kill switch

```bash
sudo mkdir -p /etc/logimail
sudo touch /etc/logimail/agent-disabled
```

## Tắt kill switch

```bash
sudo rm -f /etc/logimail/agent-disabled
```

## Script phải kiểm tra

Mọi script agent phải kiểm tra biến hoặc file:

```text
LOGIMAIL_AGENT_KILL_SWITCH=/etc/logimail/agent-disabled
```

Nếu file tồn tại, script thoát với thông báo rõ ràng và không thay đổi trạng thái.
