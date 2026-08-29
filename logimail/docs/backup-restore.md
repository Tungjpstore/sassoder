# Backup và Restore LogiMail

## Thành phần cần backup

- `/opt/BillionMail/.env`.
- `docker-compose.yml` và custom config.
- PostgreSQL volume của BillionMail.
- `vmail` hoặc mailbox data volume.
- SSL/cert data.
- Supabase schema/migrations LogiMail.
- Cloudflare DNS export JSON.
- MailOps config và sudoers whitelist.

Theo `docker-compose.yml` upstream của BillionMail, tên thư mục volume quan trọng thường là:

```text
postgresql-data
postgresql-socket
redis-data
rspamd-data
vmail-data
postfix-data
webmail-data
core-data
ssl
conf
logs
```

## Nơi lưu backup

Không để backup chỉ nằm trên cùng VPS. Chuẩn bị một trong các option:

- Cloudflare R2 qua Worker gateway hiện có của LogiVN.
- S3.
- Backblaze B2.
- VPS backup khác.
- Snapshot provider kèm export định kỳ.

Production LogiVN đang ưu tiên Worker gateway để VPS không giữ R2 S3 key dài hạn. LogiMail nên dùng cùng kiểu contract nhưng prefix riêng:

```text
BACKUP_STORAGE_ADAPTER=worker
BACKUP_R2_GATEWAY_URL=<worker-url>
BACKUP_R2_GATEWAY_TOKEN=<token-rieng-hoac-duoc-cap>
R2_BUCKET=logivn-backups
BACKUP_R2_PREFIX=logimail
LOGIMAIL_BACKUP_REMOTE=r2-gateway
LOGIMAIL_BACKUP_ENCRYPTION_KEY=<openssl-rand-base64-48-or-longer>
```

Không upload mailbox tar chứa `.env`, mailbox data hoặc credential ra R2 nếu chưa mã hóa. Script `infra/vps/backup-billionmail.sh` hiện tạo local tar, checksum và manifest; nếu bật `LOGIMAIL_BACKUP_REMOTE=r2-gateway`, script sẽ mã hóa tar bằng `LOGIMAIL_BACKUP_ENCRYPTION_KEY` trước khi upload qua Worker gateway.

## Restore dry-run

Restore dry-run phải kiểm tra:

- File backup tồn tại và đọc được.
- Manifest có checksum.
- Có đủ env/config cần thiết.
- Không ghi đè volume thật nếu chưa xác nhận.

Kiểm tra backup local chưa mã hóa:

```bash
export LOGIMAIL_RESTORE_ARCHIVE=/var/backups/logimail/billionmail-YYYYMMDD-HHMMSS.tar.gz
infra/vps/restore-dry-run.sh
```

Kiểm tra backup mã hóa tải từ R2 gateway:

```bash
export LOGIMAIL_RESTORE_ARCHIVE=/tmp/billionmail-YYYYMMDD-HHMMSS.tar.gz.enc
export LOGIMAIL_BACKUP_ENCRYPTION_KEY=<matching-encryption-key>
infra/vps/restore-dry-run.sh
```

Script tự nhận archive kết thúc bằng `.enc`, verify checksum của file mã hóa nếu có `${LOGIMAIL_RESTORE_ARCHIVE}.sha256`, decrypt vào thư mục tạm, rồi chỉ list nội dung tar. Nếu có checksum của tar gốc, đặt:

```bash
export LOGIMAIL_RESTORE_PLAIN_CHECKSUM=/tmp/billionmail-YYYYMMDD-HHMMSS.tar.gz.sha256
```

Không dùng restore dry-run để mount hoặc ghi đè volume thật; restore thật phải có runbook riêng, cửa sổ bảo trì và backup hiện trạng.

## Gate trước khi bật nút backup trong production

Route `/api/logimail/ops/backup` chỉ tạo `backup_jobs.status=requested`; nó không tự đọc volume BillionMail. Chỉ bật UI/automation như một backup thật khi toàn bộ điều kiện sau đã đạt:

- Có worker/timer riêng chạy `infra/mailops-agent/backup.sh` bằng quyền đủ đọc `/opt/BillionMail`.
- `LOGIMAIL_BACKUP_REMOTE` được bật có chủ đích; `BACKUP_R2_GATEWAY_URL`, token và `LOGIMAIL_BACKUP_ENCRYPTION_KEY` đều có trong secret store server-side.
- Worker chuyển job `requested -> running -> completed|failed`, ghi `artifact_uri`, checksum và lỗi có thể hành động. Job nằm mãi ở `requested` phải phát cảnh báo.
- `/var/backups/logimail` tồn tại với quyền hạn chế và retention local rõ ràng. Không dùng các tar code release trong `/opt` làm bằng chứng backup mailbox.
- Restore dry-run đã chạy với artifact tải lại từ remote, không chỉ với sample tar local.

Khi các gate chưa đủ, UI phải ghi `Backup worker chưa cấu hình` thay vì báo thành công sau khi chỉ tạo job metadata.

## Chính sách an toàn

- Backup script không in secret.
- Backup nên mã hóa nếu chứa mailbox data hoặc `.env`.
- Restore thật cần cửa sổ bảo trì và backup hiện trạng trước.
- Không chạy `docker compose down -v` trong automation.
- Trước khi chạy `bm update`, tạo backup và ghi lại output `bm default` nhưng không chia sẻ password công khai.
- Giữ prefix R2 `logimail`, không dùng prefix root `logivn` để tránh trộn retention/artifact.
- Không lưu `LOGIMAIL_BACKUP_ENCRYPTION_KEY` trong R2 bucket hoặc trong file backup.

## Timer production va retention

Mau unit/timer tai `infra/vps/logimail-backup.service.example` va
`infra/vps/logimail-backup.timer.example` chay backup hang ngay, co jitter,
catch-up sau reboot va lock de hai lan chay khong tranh chap. Timer khong duoc
tu dong cai dat boi repository nay.

Tren VPS, sau khi da tao `/etc/logimail/backup.env` root-only va kiem tra
remote encryption, operator co the cai dat thu cong:

```bash
sudo install -o root -g root -m 0644 infra/vps/logimail-backup.service.example /etc/systemd/system/logimail-backup.service
sudo install -o root -g root -m 0644 infra/vps/logimail-backup.timer.example /etc/systemd/system/logimail-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now logimail-backup.timer
sudo systemctl list-timers logimail-backup.timer
```

`/etc/logimail/backup.env` can co it nhat `LOGIMAIL_BACKUP_REMOTE=r2-gateway`,
`BACKUP_STORAGE_ADAPTER=worker`, endpoint/token gateway va encryption key. Dat
`LOGIMAIL_BACKUP_RETENTION_DAYS=14` (mac dinh) hoac mot so nguyen khong am.
Sau khi artifact moi tao, da pass gzip/checksum va upload remote thanh cong,
script chi xoa cac file `billionmail-<timestamp>` qua han trong
`LOGIMAIL_BACKUP_DIR`; khong dong cham file khac.

Kiem tra truoc va sau khi bat timer:

```bash
sudo systemctl start logimail-backup.service
sudo journalctl -u logimail-backup.service -n 100 --no-pager
sudo find /var/backups/logimail -maxdepth 1 -type f -name 'billionmail-*.sha256' -print
```

Rollback timer chi la `sudo systemctl disable --now logimail-backup.timer`.
Khong xoa artifact truoc khi da xac minh backup remote va restore dry-run.
