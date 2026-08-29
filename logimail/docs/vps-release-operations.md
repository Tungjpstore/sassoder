# Van hanh release LogiMail tren VPS

Tai lieu nay chi quy dinh release code LogiMail. No khong thay doi DNS,
BillionMail volume, schema Supabase hay bat cu service nao khi chua co lenh cua
operator.

## Mo hinh artifact

Moi release da build nam tai `/opt/logimail/releases/<release-id>`. Thu muc
release co `RELEASE_MANIFEST.txt` voi Git SHA, hash lockfile, hash migration (duong
dan migration tuong doi, on dinh giua cac thu muc staging),
Node/npm version va hash cua tap ten bien environment; manifest khong ghi value
hay secret. Sau khi build, release bi xoa quyen ghi. Service luon chay qua
`/opt/logimail/current`, con `/opt/logimail/rollback` luu artifact truoc do.

Ca ba template systemd web/API/push-worker da dung `WorkingDirectory` nay. Can
doi unit sang template moi mot lan trong maintenance window truoc release dau
tien; khong thay `/opt/logimail` dang chay thanh symlink va khong ghi de source
cu tai cho.

Sau khi stage/activate release dau tien nhung truoc restart service, copy ba
template unit va chi reload systemd daemon (khong restart trong buoc nay):

```bash
sudo install -o root -g root -m 0644 /opt/logimail/current/infra/vps/logimail-web.service.example /etc/systemd/system/logimail-web.service
sudo install -o root -g root -m 0644 /opt/logimail/current/infra/vps/logimail-api.service.example /etc/systemd/system/logimail-api.service
sudo install -o root -g root -m 0644 /opt/logimail/current/infra/vps/logimail-push-worker.service.example /etc/systemd/system/logimail-push-worker.service
sudo systemctl daemon-reload
```

## Release gate

1. Chon worktree sach, chi co thay doi LogiMail da duoc review.
2. Kiem tra env production va migration compatibility. Script release khong
   chay migration.
3. Tao backup BillionMail co remote encryption va restore dry-run moi nhat.
4. Staging phai pass `npm ci`, `npm run check`, web build va smoke auth/mail.
5. Kiem tra con it nhat 4 GiB trong filesystem cua release root va khong vuot qua
   20 artifact; helper se tu choi stage khi mot trong hai retention guard nay
   khong dat. Cac thao tac stage/activate/rollback dung flock tren release root
   de khong tranh chap giua hai operator.

## Tao artifact va kich hoat

Chay bang root tren VPS sau khi source da duoc chuyen den mot thu muc tam, vi
du `/srv/logimail-source`. Khong stage tu `/opt/logimail/current`.

```bash
cd /srv/logimail-source
sudo /srv/logimail-source/infra/vps/release-logimail.sh stage /srv/logimail-source 20260722T150000Z-<git-sha>
sudo /srv/logimail-source/infra/vps/release-logimail.sh activate 20260722T150000Z-<git-sha>
```

`activate` chi chuyen symlink atomically va **khong restart service mac dinh**.
Dung duong dan source cho bootstrap dau tien vi `/opt/logimail/current` chua ton
tai. Tu release thu hai tro di, co the goi helper qua `current`.
Khi preflight da xong, restart theo thu tu API, push-worker, web va kiem tra
status trong mot thao tac:

```bash
sudo LOGIMAIL_RELEASE_RESTART_SERVICES=1 \
  /opt/logimail/current/infra/vps/release-logimail.sh activate 20260722T150000Z-<git-sha>
sudo /opt/logimail/current/infra/vps/release-logimail.sh status
```

Sau do kiem tra health cong khai, login + reload session, reset password,
mailbox scope va SMTP/IMAP self-mail. Theo doi journal API/worker/web it nhat
15 phut. Giu lai toi thieu ba artifact va khong xoa release co the la rollback.

## Rollback

Neu health, auth hoac mail smoke loi sau restart, chuyen lai mot lan:

```bash
sudo LOGIMAIL_RELEASE_RESTART_SERVICES=1 \
  /opt/logimail/current/infra/vps/release-logimail.sh rollback
```

Rollback chi doi code/dependency symlink va khong phuc hoi database/mail
volume. Neu release co migration, dung lai va danh gia backward compatibility;
chi restore du lieu trong maintenance window sau khi tao backup hien trang.

## Fail2ban cho Docker mail ports

Mau fail2ban o `infra/vps/fail2ban/` mac dinh tat hai jail Postfix/Dovecot.
Production BillionMail ghi log host vao `/opt/BillionMail/logs/postfix/mail.log`
va `/opt/BillionMail/logs/dovecot/mail.log`; phai chay `fail2ban-regex` tren hai
file nay truoc khi enable. Action custom
chi tao chain `f2b-logimail-postfix`/`f2b-logimail-dovecot`, jump tu
`DOCKER-USER` cho dung cac port SMTP/IMAP va `REJECT` ket noi TCP moi cua IP bi
ban. No khong thay default policy, khong dung default `DROP`, va ho tro ca
iptables/ip6tables neu chain Docker ton tai.

Quy trinh review, chua apply tu dong:

```bash
sudo install -D -o root -g root -m 0750 infra/vps/fail2ban/logimail-docker-user.sh /usr/local/libexec/logimail/fail2ban-docker-user.sh
sudo install -D -o root -g root -m 0644 infra/vps/fail2ban/action.d/logimail-docker-user.conf /etc/fail2ban/action.d/logimail-docker-user.conf
sudo install -D -o root -g root -m 0644 infra/vps/fail2ban/jail.d/logimail-mail.local.example /etc/fail2ban/jail.d/logimail-mail.local
sudo fail2ban-client -d
```

Sau khi `fail2ban-client -d` va mot controlled auth-failure test da xac nhan
filter/logpath, doi **mot** `enabled = false` thanh `enabled = true`, reload
Fail2ban, va kiem tra `iptables -S DOCKER-USER` cung `ip6tables -S DOCKER-USER`.
Rollback la dat lai `enabled = false`, `fail2ban-client reload`, sau do xoa
file action/jail chi khi khong con jail nao dang dung no. Khong flush
`DOCKER-USER`; chain nay thuoc ca VPS dung chung.
