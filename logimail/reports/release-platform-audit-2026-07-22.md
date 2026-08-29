# LogiMail release/platform audit (2026-07-22)

## Phạm vi

Audit chỉ đọc GitHub Actions, Vercel, Supabase, Cloudflare và VPS runtime của LogiMail. Không thay đổi external state, DNS, services hay dữ liệu mail.

## Kết luận điều hành

- **Production thật là VPS**, không phải Vercel: `mail.logivn.com` trỏ `103.199.19.144`, trả Nginx; public health, BillionMail và Cloudflare đều ready.
- **Release không tái lập được**: `/opt/logimail` không có Git SHA/release manifest. Web chạy build mới ngày 22/07, còn API/push-worker chạy source từ 08/07.
- **Không có pipeline LogiMail**: workflow VPS chỉ theo dõi `infra/vps/**` và deploy app chính vào `/opt/logivn`; root CI không chạy `logimail/npm run check`.
- **Vercel CLI lệch account/team**: CLI trả `Not authorized`; root link là `qr-restaurant-saas`, nested link là `logimail-web`, nhưng token hiện tại thuộc account/team khác.
- **Supabase CLI lệch project/quyền**: app production dùng ref `tfhqatvevbrbzaaqjhfa`, CLI account hiện chỉ thấy hai project `fball-*` và migration list trả 403.
- **VPS còn blocker vận hành**: Nginx config drift, cron có nhiều 502, backup chỉ local/chưa restore drill, systemd security score `8.4 EXPOSED`, deploy user có `NOPASSWD: ALL`.

## Findings

### P0/P1 - Không có release identity và rollback nguyên tử

- `/opt/logimail` không có `.git`, revision file hay manifest.
- Hash package trên VPS không khớp working tree hiện tại và không map được về commit trong history.
- Deploy hiện tại copy/patch trực tiếp vào `/opt/logimail`.
- Rollback tạm chỉ giữ một phần web files và `.next`; không bao phủ API, worker, dependencies, env, systemd, Nginx hoặc migration.
- Source API/worker trên đĩa đã đổi nhưng process chưa restart từ 08/07; lần restart tiếp theo có thể kích hoạt code chưa được phát hành đồng bộ.

### P1 - GitHub/Vercel không phải đường deploy LogiMail

- `.github/workflows/vps-deploy.yml` chỉ trigger `infra/vps/**`, dùng `APP_ROOT=/opt/logivn`.
- `.github/workflows/vercel-preflight.yml` chạy ở repo root và dùng project secrets của app chính.
- 100 GitHub/Vercel deployments gần nhất đều thuộc `qr-restaurant-saas`; không thấy deployment `logimail-web`.
- `main` không có branch protection; environments `Preview`/`Production` không có approval rule.
- Running `vercel` ở repo root có nguy cơ tác động project nhà hàng, không phải LogiMail.
- Cron trong `apps/logimail-web/vercel.json` chưa phải cron production vì production web hiện ở VPS; cần chọn một owner duy nhất giữa VPS cron và Vercel.

### P1 - Supabase CLI mismatch, runtime schema P0 đã hiện diện

- Local và VPS đều dùng ref `tfhqatvevbrbzaaqjhfa`.
- Supabase CLI account không có project này; `supabase migration list --linked` trả 403.
- Truy vấn PostgREST read-only trả HTTP 200 cho:
  - `profiles.platform_role`
  - `security_codes.target_email`
  - `mailboxes.session_version`
  - RPC `bump_mailbox_session_version`
- Các dấu hiệu trên xác nhận runtime đã có migration P0, nhưng chưa thay thế việc đối chiếu remote migration history.

### P1 - Nginx và cron drift

- Active Nginx config ở `sites-enabled` là regular file, không phải symlink tới `sites-available`; hai file có hash khác nhau.
- Active config có literal `\\n` làm proxy buffer directives bị comment; vẫn dùng `$proxy_add_x_forwarded_for`, khác template đã harden.
- `cron.log` có 105 lần HTTP 502, tương ứng khoảng 35 lượt với 3 retry; nhiều khả năng route `alerts-scan`.
- Cron runner production là bản cũ, không ghi đủ HTTP status/body/action để chẩn đoán.
- Chưa có logrotate riêng cho LogiMail.

### P1 - Backup chưa đạt production

- `LOGIMAIL_BACKUP_REMOTE=disabled`.
- `/var/backups/logimail` không tồn tại dù env trỏ tới đó.
- Chỉ có một tar local khoảng 30,6 MB chứa cả `.env` và live PostgreSQL/vmail.
- Checksum pass nhưng chưa chứng minh snapshot DB nhất quán, restore được hoặc có off-site copy.
- Không có timer/cron backup LogiMail riêng.

### P2 - Quyền và hardening

- SSH đã tắt root/password login và chỉ cho `deploy`, nhưng `deploy` có `NOPASSWD: ALL`; mất key tương đương mất root.
- Web/API/worker chạy user `logimail`, có `NoNewPrivileges`, `PrivateTmp`, `ProtectHome`, nhưng systemd-analyze vẫn chấm `8.4 EXPOSED`.
- Thiếu capability bounding, `PrivateDevices`, kernel protections, `UMask`, resource limits và address-family/system-call restrictions phù hợp.
- Fail2ban active nhưng chỉ có jail `sshd`; chưa có jail `postfix`, `dovecot` hoặc `nginx-http-auth`.
- UFW báo chỉ mở `22/80/443`, nhưng Docker publish trực tiếp `25/465/587/110/143/993/995` trên IPv4/IPv6; chain `DOCKER-USER` đang trống nên policy UFW không kiểm soát các port mail này.
- Việc mở SMTP/IMAP là có chủ đích, nhưng cần inventory container/log source trước khi thêm rate limit, mail-auth jails và DOCKER-USER rules; không đặt default DROP mù vì VPS còn container ngoài LogiMail.

### DNS/Cloudflare parity

- VPS env Supabase ref đúng; Cloudflare token verify active, zone `logivn.com` active.
- `mail.logivn.com` A/PTR trỏ `103.199.19.144`; mail transport phải tiếp tục DNS-only.
- Public DNS còn duplicate MX (`mail.oqumail.com`, `mail.logivn.com`) và duplicate SPF.
- Không cleanup DNS trước khi inventory sender/receiver OquMail và snapshot record IDs.

## Checklist deploy LogiMail

### 0. Release gate

1. Tạo worktree/release branch từ commit đã chọn; chỉ stage `logimail/**`, không dùng `git add -A` trên worktree đang trộn task.
2. Ghi Git SHA, Node/npm version, lockfile SHA-256, migration set và test artifact.
3. Chạy trong `logimail/`: `npm ci`, `npm run check`, typecheck API/web, web build và smoke API.
4. Không coi root Release CI là bằng chứng LogiMail cho tới khi có workflow riêng.

### 1. Artifact bất biến

1. Tạo `/opt/logimail-releases/<UTC>-<git-sha>`; không ghi đè trực tiếp `/opt/logimail`.
2. Đồng bộ source đã kiểm thử, loại `.git`, `.env*`, `node_modules`, `.next` và file tạm.
3. Chạy `npm ci`, checks và build trong release directory với env production.
4. Ghi manifest gồm SHA, lock hash, build ID, migration id và hash env đã loại secret.
5. Một lần chuyển systemd sang `WorkingDirectory=/opt/logimail-current`; các release sau chỉ đổi symlink atomically.

### 2. Backup và preflight

1. Snapshot current release, systemd units, Nginx config và metadata env mode/owner; không in secret.
2. Tạo backup BillionMail/PostgreSQL nhất quán, mã hóa, checksum, manifest và upload remote prefix `logimail`.
3. Chạy restore dry-run từ artifact tải lại, không chỉ tar local.
4. Preflight release trên port/working directory isolated nếu có thể.
5. Sau khi login đúng Supabase account:

```bash
supabase link --project-ref tfhqatvevbrbzaaqjhfa
supabase migration list --linked
supabase db push --dry-run --linked
```

### 3. Activate

1. Lưu symlink release trước, chuyển `logimail-current` sang release mới.
2. Restart tuần tự API, push-worker, web; xác nhận từng service active.
3. Verify public/local health và journal 5-15 phút.
4. Smoke thật: login, reload session, reset password, mailbox scope, unlock, gửi self-mail, nhận IMAP, queue/bounce.
5. Kiểm tra từng cron route; không phát hành khi alerts-scan còn 502 chưa có nguyên nhân.
6. Giữ ít nhất 3 release artifact.

## Checklist rollback

1. Ghi health/journal/error và release manifest hiện tại.
2. Chuyển `logimail-current` về symlink trước; restart API/worker/web và chạy health/auth/mail smoke.
3. Nếu lỗi chỉ là code/dependency, không restore DB/mail volume.
4. Chỉ restore dữ liệu khi migration đã thay đổi schema/data, có backup hiện trạng và cửa sổ bảo trì.
5. Nếu lỗi Nginx, restore snapshot, chạy `nginx -t`, rồi reload; active/available phải dùng một symlink.
6. Lập incident note gồm release SHA, migration status, backup artifact, thời điểm và người phê duyệt.

## Việc cần làm trước auto-deploy

- Thêm workflow riêng theo path `logimail/**`, chạy full checks/build và publish artifact immutable.
- Tạo GitHub Environment/secrets riêng cho LogiMail; bật branch protection, required checks và Production approval.
- Đăng nhập Vercel đúng account `Tungjpstore`, xác minh project `logimail-web`; giữ `mail.logivn.com` ở VPS DNS-only, chỉ dùng Vercel cho preview/hostname web riêng.
- Đăng nhập Supabase organization có project `tfhqatvevbrbzaaqjhfa`, đối chiếu migration history trước migration mới.
- Chuẩn hóa Nginx, sửa cron 502, thêm logrotate.
- Thay `NOPASSWD: ALL` bằng sudo allowlist; harden systemd có rollout/rollback.
- Thêm fail2ban cho mail auth từ log source thật của BillionMail; quản lý Docker-published ports bằng DOCKER-USER sau khi snapshot toàn bộ container/IPv4/IPv6 rules, giữ SMTP/IMAP cần thiết và không ảnh hưởng stack LogiVN khác.
- Bật backup mã hóa off-site và restore drill.
- Xử lý duplicate MX/SPF sau inventory OquMail; không gộp với DKIM rotation/DMARC enforcement.

## Tài liệu tham chiếu

- `logimail/README_DEPLOYMENT.md`
- `logimail/docs/logivn-real-infra-mapping.md`
- `logimail/docs/backup-restore.md`
- `logimail/docs/supabase-go-live-checklist.md`
- `logimail/infra/vps/logimail-web.service.example`
- `logimail/infra/vps/logimail-api.service.example`
- `logimail/infra/vps/nginx-mail-logivn.conf.example`
- `.github/workflows/vps-deploy.yml`
- `.github/workflows/vercel-preflight.yml`
