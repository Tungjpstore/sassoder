# Cloudflare DNS cho LogiMail

## Token bắt buộc

Tạo API token riêng:

```text
Name: logimail-dns-manager
Template/Permissions: Edit zone DNS / Zone.DNS:Edit
Scope: Specific zone logivn.com
```

Không dùng Global API Key.

Token production đã tạo ngày 2026-06-10 bằng Cloudflare template `Edit zone DNS`, giới hạn riêng zone `logivn.com`. Token đã được test bằng Cloudflare API `dns_records?per_page=1` và trả `success=true`.

## DNS public hiện tại

Kiểm tra ngày 2026-06-10 sau cutover inbound:

- `api.logivn.com`, `ws.logivn.com`, `worker.logivn.com`, `monitor.logivn.com` đang trỏ về VPS `103.199.19.144`.
- `mail.logivn.com` trỏ exact về VPS `103.199.19.144` và để DNS-only.
- Cloudflare Email Routing cho `logivn.com` đã tắt để mở khóa MX.
- MX root `logivn.com` đã cutover sang BillionMail: `10 mail.logivn.com.`
- SPF root đang là `v=spf1 include:_spf.mx.cloudflare.net ip4:103.199.19.144 ~all`; giá trị này cho phép VPS gửi outbound và đang giữ mềm trong giai đoạn warm-up. Sau khi chắc chắn không còn sender root qua Cloudflare hoặc dịch vụ cũ, có thể siết về `v=spf1 mx ip4:103.199.19.144 ~all` hoặc `-all`.
- `_dmarc.logivn.com` có TXT `v=DMARC1; p=none; rua=mailto:postmaster@logivn.com; fo=1` ở chế độ quan sát.
- `default._domainkey.logivn.com` đã được publish cho BillionMail selector `default` trong bước triển khai ngày 2026-06-10.

Vì vậy `mail.logivn.com` đang nhận SMTP/IMAP/webmail production cho luồng LogiMail. Resolver public đã trả `10 mail.logivn.com.` trên Cloudflare `1.1.1.1`, Quad9 `9.9.9.9`, và Google DNS trong đợt kiểm tra cutover.

Sau khi có token scope hẹp, chạy báo cáo read-only trước mọi bootstrap:

```bash
infra/cloudflare/cloudflare-dns-existing-report.sh
```

## Record MVP

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| A | `mail.logivn.com` | VPS IP | DNS only |
| MX | `logivn.com` | `mail.logivn.com`, priority 10 | N/A |
| TXT | `logivn.com` | `v=spf1 mx ip4:VPS_IP -all` | N/A |
| TXT | `_dmarc.logivn.com` | `v=DMARC1; p=none; rua=mailto:postmaster@logivn.com; fo=1` | N/A |
| TXT | `default._domainkey.logivn.com` | DKIM public key từ BillionMail | N/A |

Sau cutover inbound, vẫn giữ SPF mềm thêm một giai đoạn để theo dõi reputation. Khi không còn phụ thuộc sender cũ, rút gọn SPF theo mục tiêu production ở bảng trên.

Với cấu hình một subdomain, SMTP và IMAP client cũng dùng `mail.logivn.com`:

```text
SMTP host: mail.logivn.com, port 587 STARTTLS hoặc 465 TLS
IMAP host: mail.logivn.com, port 993 TLS
Web/PWA:   https://mail.logivn.com/dashboard
API:       https://mail.logivn.com/api/logimail
Webmail:   https://mail.logivn.com/roundcube/
```

Không bật Cloudflare proxy cho `mail.logivn.com` vì hostname này nhận SMTP/IMAP/MX.

## Alias tùy chọn

Nếu sau này muốn cấu hình mail client dễ đọc hơn, có thể thêm alias:

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| A | `smtp.logivn.com` | VPS IP | DNS only |
| A | `imap.logivn.com` | VPS IP | DNS only |

Các alias này không bắt buộc trong cấu hình hiện tại.

Nếu muốn tách dashboard/API sang host riêng ở phase sau, tạo hostname mới như `logimail.logivn.com` hoặc `api-logimail.logivn.com`. Không dùng `mail.logivn.com` để trỏ sang Vercel trong khi MX vẫn dùng hostname này.

## Automation policy

Allowed without confirmation:

- Tạo record mới nếu chưa tồn tại.
- Verify DNS.
- Báo cáo record sai.
- Tạo DKIM nếu có public key thật.
- Chạy `cloudflare-dns-existing-report.sh` read-only.

Requires confirmation:

- Update record đã tồn tại.
- Xóa record.
- Sửa MX/SPF/DKIM/DMARC.
- Đổi proxy status.
- Đổi IP mail server.
- Nâng DMARC từ `none` lên `quarantine` hoặc `reject`.

## Trạng thái API automation

`/etc/logimail/logimail.env` trên VPS đã có `CLOUDFLARE_ZONE_ID` và `CLOUDFLARE_API_TOKEN` cho zone `logivn.com`. Token được lưu trong file env root-only, không commit vào repo. Backup trước lần sửa token là `/etc/logimail/logimail.env.bak-20260610161533`.

Health public hiện trả Cloudflare `ready=true`. Nếu sau này app cần thêm thao tác đọc metadata zone ngoài DNS records, tạo token mới có quyền bổ sung và rotate qua env root-only.

Denied:

- Sửa nameserver.
- Xóa zone.
- Dùng Global API Key.
- Bật proxy cho `mail`, `smtp`, `imap`.
- Ghi đè DKIM/SPF/DMARC cũ không backup.

## DKIM từ BillionMail

BillionMail `bm.sh show-record` sinh DKIM selector `default` và in TXT host `default._domainkey`. Copy giá trị một dòng bắt đầu bằng `v=DKIM1` vào env:

```bash
export DKIM_SELECTOR=default
export DKIM_DOMAIN=logivn.com
export DKIM_PUBLIC_KEY='v=DKIM1; ...'
infra/cloudflare/cloudflare-dns-add-dkim.sh
```

Nếu record DKIM đã tồn tại, script sẽ skip và yêu cầu dùng flow update có xác nhận.
