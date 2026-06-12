# MailOps Emergency Kill Switch

## Bật

```bash
sudo mkdir -p /etc/logimail
sudo touch /etc/logimail/agent-disabled
```

## Tắt

```bash
sudo rm -f /etc/logimail/agent-disabled
```

## Kiểm tra

```bash
test -f /etc/logimail/agent-disabled && echo disabled || echo enabled
```
