# Mapping hạ tầng thật LogiVN cho LogiMail

Tài liệu này ghi lại những luồng thật đã kiểm trong repo LogiVN tổng và DNS public, rồi chốt cách áp vào LogiMail mà không làm ảnh hưởng production chính.

Ngày kiểm tra DNS public gần nhất: 2026-06-10.

## Snapshot hiện tại

| Khu vực | LogiVN đang có | Áp cho LogiMail |
| --- | --- | --- |
| Domain chính | `logivn.com`, wildcard `*.logivn.com` đang phục vụ app chính/Vercel | `mail.logivn.com` đã là record exact về VPS, DNS-only, không rơi vào wildcard Vercel |
| VPS public | `api.logivn.com`, `ws.logivn.com`, `worker.logivn.com`, `monitor.logivn.com` đều resolve `103.199.19.144` | Đây là IP VPS hiện thấy từ DNS public; dùng làm default local plan, production env vẫn phải xác nhận trong Cloudflare/VPS provider |
| Email routing hiện tại | MX `logivn.com` đã cutover sang `10 mail.logivn.com.`; Cloudflare Email Routing đã tắt cho domain này | BillionMail/Postfix/Dovecot đang nhận inbound thật trên VPS |
| SPF hiện tại | TXT root có `v=spf1 include:_spf.mx.cloudflare.net ip4:103.199.19.144 ~all` | Giữ mềm trong warm-up; rút gọn sau khi xác nhận không còn sender cũ |
| DMARC/DKIM | `_dmarc.logivn.com` có `p=none`; `default._domainkey.logivn.com` có DKIM selector `default` từ BillionMail | Theo dõi report trước khi nâng DMARC; không thay DKIM nếu chưa rotate trong BillionMail |
| Vercel | App chính ở region `sin1`, cron production nằm trong `vercel.json` | Không gắn `mail.logivn.com` vào Vercel khi host này nhận SMTP/IMAP/MX |
| Supabase | PostgreSQL/Auth/Realtime/Storage là nguồn dữ liệu chính của LogiVN | Ưu tiên project riêng; nếu dùng chung chỉ dùng schema `logimail` và service role server-side |
| VPS services | Redis, gateway, socket, worker, AI/image service, Telegram bots, Uptime Kuma, Grafana, Prometheus, Alertmanager | LogiMail tránh port hiện có; không trộn queue hoặc Redis prefix với `logivn` |
| Backup | Cloudflare R2 qua Worker gateway, bucket `logivn-backups`, prefix `logivn` | Dùng cùng gateway nếu được cấp token riêng, nhưng prefix phải là `logimail` và mailbox backup phải mã hóa trước khi offsite |
| Telegram ops | Có tenant bot và Platform DevOps bot riêng | MVP dùng Telegram riêng hoặc forward platform alert có key riêng; không dùng tenant session |
| Transactional email | App chính dùng Resend/SES; sender `@logivn.com` chưa nên đổi nếu chưa verify/warm-up | BillionMail có thể trở thành SMTP sau phase warm-up, không cutover Auth email ngay |

## Port và process trên VPS chung

Các port LogiVN đã dùng hoặc nên tránh:

| Port | Chủ sở hữu hiện tại |
| --- | --- |
| `3001` | Uptime Kuma |
| `3002` | Grafana |
| `3100` | LogiVN gateway |
| `3200` | LogiVN socket |
| `3300` | AI service |
| `3400` | Image service |
| `3500` | Worker |
| `3600` | Tenant Telegram bot |
| `3650` | Platform Telegram bot |
| `5540` | RedisInsight |
| `9090` | Prometheus |
| `9093` | Alertmanager |

LogiMail shared-VPS defaults:

```text
LogiMail PWA upstream:       127.0.0.1:3000
LogiMail API upstream:       127.0.0.1:8787
BillionMail HTTP upstream:   127.0.0.1:8081
BillionMail HTTPS/admin:     127.0.0.1:8443
BillionMail Postgres:        127.0.0.1:25432
BillionMail Redis:           127.0.0.1:26379
SMTP/SMTPS/submission:       25, 465, 587
IMAP/IMAPS/POP/POPS:         143, 993, 110, 995
```

Trên VPS chung, Nginx của LogiVN tiếp tục giữ `80/443`. BillionMail không được bind trực tiếp `80/443`; script `infra/vps/install-billionmail.sh` đã đặt default `HTTP_PORT=8081` và `HTTPS_PORT=8443`.

## DNS policy sau cutover

Đã hoàn tất ngày 2026-06-10:

- Exact `A mail.logivn.com -> 103.199.19.144`, `proxied=false`.
- MX root `logivn.com -> mail.logivn.com`, priority `10`.
- TXT `_dmarc.logivn.com` ở `p=none`.
- TXT DKIM selector `default` sau khi lấy public key thật từ BillionMail.

Allowed không cần sửa record cũ:

- Verify DNS public.
- Tạo record mới không xung đột nếu có kế hoạch rõ ràng.
- Chạy report read-only trước/sau thay đổi.

Cần xác nhận trước:

- Sửa MX root hiện đang trỏ `mail.logivn.com`.
- Sửa SPF root đang ở cấu hình warm-up.
- Bật/tắt proxy status cho bất kỳ record liên quan mail.
- Đổi IP `mail.logivn.com`.
- Nâng DMARC từ `none` sang `quarantine` hoặc `reject`.

Denied:

- Bật Cloudflare proxy cho `mail.logivn.com`, `smtp.logivn.com`, `imap.logivn.com`.
- Dùng Cloudflare Global API Key.
- Xóa MX/SPF/DKIM/DMARC hiện hữu bằng automation.

## Mapping dữ liệu và secret

| Luồng | Source truth | LogiMail contract |
| --- | --- | --- |
| Internal API auth | `LOGIVN_INTERNAL_API_KEY` bảo vệ gateway root | Dùng `LOGIMAIL_INTERNAL_API_KEY` cho API LogiMail; chỉ dùng gateway LogiVN qua `LOGIMAIL_PLATFORM_ALERT_FORWARD_KEY` nếu bật forward alert |
| Redis/BullMQ | Root dùng `REDIS_PASSWORD`, `REDIS_DB=0`, `BULLMQ_PREFIX=logivn` | LogiMail dùng `BULLMQ_PREFIX=logimail` nếu cần queue riêng; không dùng Redis nội bộ BillionMail cho app queue |
| Supabase | Root env: URL, anon, service-role | LogiMail PWA chỉ có URL/anon; API/server giữ service-role; schema `logimail` nếu chung project |
| Cloudflare | Token DNS scope hẹp theo zone | Token riêng từ template `Edit zone DNS`, scope only `logivn.com`, không Global API Key |
| R2 backup | Worker gateway + bearer token | Prefix `logimail`, token có thể riêng; không upload mailbox tar không mã hóa |
| Telegram | Platform bot tách tenant bot | Direct bot riêng cho MVP, hoặc forward platform alert qua API có key riêng |

## Checklist Browser sau khi bạn đăng nhập

Cloudflare:

- Export/ghi lại record hiện tại của `logivn.com`, `mail.logivn.com`, MX, SPF, DMARC, DKIM trước mỗi lần sửa.
- Kiểm tra wildcard `*.logivn.com` không ảnh hưởng exact `mail.logivn.com`.
- Token Cloudflare automation đã tạo và lưu root-only trong `/etc/logimail/logimail.env`; nếu cần rotate, dùng template `Edit zone DNS`, scope only `logivn.com`, không dùng Global API Key.
- Không đổi MX/SPF/DMARC tiếp nếu chưa có backup và kế hoạch rollback.

VPS/provider:

- Xác nhận IP production vẫn là `103.199.19.144` hoặc cập nhật env nếu khác.
- Kiểm tra outbound/inbound port `25`, `465`, `587`, `993`.
- Đặt PTR/rDNS về `mail.logivn.com` trước khi gửi thật.
- Kiểm tra RAM/CPU/disk vì VPS 4 vCPU/6GB/60GB rất sát nếu chạy cả LogiVN stack và BillionMail.

Supabase:

- Ưu tiên tạo project riêng cho LogiMail.
- Nếu dùng chung project LogiVN, chạy schema/RLS trong `logimail.*`, không sửa bảng production chính.
- Auth redirect cho `https://mail.logivn.com/login`, callback/confirm nếu dùng Supabase flow trên host này.

Vercel:

- Không add `mail.logivn.com` vào project Vercel nếu host này nhận mail transport.
- Nếu muốn PWA trên Vercel sau này, dùng host riêng như `logimail.logivn.com`, còn `mail.logivn.com` vẫn DNS-only về mail VPS.

BillionMail:

- Pin branch/tag/commit trước production; upstream README hiện trỏ `aaPanel/BillionMail`, repo user đưa là cùng dòng dự án.
- Không chạy `bash install.sh` nếu chưa chấp nhận side effect cài package, Docker, firewall, SSL và symlink `bm`.
- Đổi `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SafePath`, `HTTP_PORT`, `HTTPS_PORT` trước `docker compose up -d`.
- Lấy DKIM bằng UI hoặc `bm show-record`, không tự đoán DKIM.

## Quyết định triển khai hiện tại

MVP nên chạy theo shared VPS mode nhưng tách project/file:

- `/opt/logimail` cho PWA/API/MailOps agent.
- `/opt/BillionMail` cho mail engine.
- `/etc/logimail/logimail.env` cho env riêng.
- `mail.logivn.com` DNS-only về VPS.
- Nginx public `80/443` route path `/dashboard`, `/api/logimail`, `/roundcube/`.
- BillionMail admin SafePath không public mặc định; dùng SSH tunnel hoặc route exact được bảo vệ sau khi có phê duyệt.

Nếu VPS thật chỉ còn ít RAM/disk hoặc port 25 bị provider chặn, tách BillionMail sang VPS mail riêng là phương án ít rủi ro hơn.
