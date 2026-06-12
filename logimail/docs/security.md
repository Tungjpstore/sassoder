# Bảo mật LogiMail

## Nguyên tắc

- Least privilege cho user, token, service và agent.
- Không secret ở frontend.
- Không lưu plaintext mailbox password.
- Không lưu raw email body/attachment trong Supabase MVP.
- Audit log mọi hành động quan trọng bằng service-role server-side; metadata CRUD vẫn phân quyền bằng user JWT/RLS.
- Rate limit endpoint gửi mail, DNS bootstrap, backup, restart.

## Secrets management

- Cloudflare token chỉ ở VPS/API server hoặc secret manager.
- Supabase service role chỉ ở server-side.
- BillionMail API key chỉ ở backend/API server.
- Encryption key để mã hóa credential phải xoay được.
- Không in token ra logs.

## Supabase

- Dùng project riêng nếu có thể.
- Nếu dùng chung, tạo schema `logimail` riêng.
- Bật RLS cho tất cả bảng metadata.
- Chỉ expose schema `logimail` trong Data API; không expose `logimail_private` vì schema này chứa trigger/helper `security definer`.
- Owner/admin xem audit logs; member chỉ xem workspace mình thuộc về.
- API route phải verify JWT bằng Supabase trước khi trả dữ liệu hoặc nhận tác vụ ghi.
- Hành động nguy hiểm phải có confirmation header hoặc xác nhận vận hành riêng, không chỉ dựa vào việc người dùng đã đăng nhập.

## Mail server

- Kiểm tra open relay.
- Bật firewall UFW hoặc tương đương.
- Đổi mật khẩu admin BillionMail.
- Không expose dashboard admin public nếu chưa có Cloudflare Access/VPN/IP allowlist.
- Tạo `postmaster@` và `abuse@`.
- Đổi `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SafePath` từ `env_init`; không giữ default BillionMail.
- Compose upstream mount `/var/run/docker.sock:ro` vào `core-billionmail`; coi đây là bề mặt nhạy cảm khi hardening VPS.
- Review license AGPLv3 trước khi sửa hoặc phân phối core BillionMail.

## Cloudflare

- Không dùng Global API Key.
- Không bật proxy cho `mail`, `smtp`, `imap`.
- Backup record trước khi update.
- DMARC nâng cấp từ `none` sang `quarantine/reject` theo dữ liệu thực tế.

## Agent

- User riêng `mailagent`.
- Không `NOPASSWD:ALL`.
- Chỉ sudo script whitelist.
- Có kill switch `/etc/logimail/agent-disabled`.
- Không đọc raw email user nếu chưa có yêu cầu rõ.

## Frontend dependency note

Scaffold hiện pin `next@16.3.0-canary.46` vì `next@latest` tại thời điểm dựng kéo `postcss@8.4.31`, bị npm audit cảnh báo moderate. Khi Next stable phát hành bản dùng PostCSS `>=8.5.10`, đổi khỏi canary trước production.
