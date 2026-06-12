# Kiến trúc LogiMail

## Mục tiêu

LogiMail là nền tảng email nội bộ cho LogiVN, dùng chung hạ tầng hiện có nhưng tách biệt đủ an toàn để không ảnh hưởng production chính. MVP tập trung vào gửi/nhận email thật, quản trị mailbox/domain, DNS checklist, backup, monitoring và MailOps agent.

## Quyết định kiến trúc chính

1. LogiMail là module riêng trong `logimail/`, không nhúng bừa vào lõi LogiVN.
2. Mail engine ban đầu là BillionMail trên VPS, không fork core nếu chưa có nhu cầu rõ.
3. Dashboard là PWA Next.js deploy trên Vercel hoặc VPS, ưu tiên Vercel.
4. Backend API là lớp trung gian bắt buộc giữa PWA và mail/DNS engine.
5. Supabase chỉ lưu auth và metadata; không lưu raw email body/attachment trong MVP.
6. Cloudflare DNS automation chỉ tạo record mới an toàn; update/delete cần xác nhận.
7. MailOps agent chạy least privilege, có sudo whitelist và kill switch.

## Sơ đồ lớp

```text
Nguoi dung noi bo
  -> PWA mail.logivn.com/dashboard
  -> Backend API mail.logivn.com/api/logimail
  -> Webmail mail.logivn.com/roundcube/
  -> Supabase Auth/DB metadata
  -> BillionMail/Postfix/Dovecot/Rspamd/RoundCube tren VPS
  -> Cloudflare DNS API scope hep
  -> Telegram report optional
```

## Boundary production LogiVN

- Không sửa bảng public production hiện tại.
- Không dùng service role key ở frontend.
- Không chạy migration LogiMail vào schema public.
- Không thay MX/SPF/DKIM/DMARC hiện hữu nếu chưa backup và xác nhận.
- Không bật Cloudflare proxy cho hostname mail transport.
- Không dùng `BULLMQ_PREFIX=logivn` hoặc Redis queue chính nếu chưa có thiết kế tích hợp riêng.
- Không expose BillionMail admin SafePath public mặc định trên VPS chung.

Chi tiết mapping hạ tầng thật: `docs/logivn-real-infra-mapping.md`.

## Domain và proxy policy

| Hostname | Vai trò | Cloudflare proxy |
| --- | --- | --- |
| `mail.logivn.com` | MX/mail server chính, SMTP/IMAP hostname, HTTPS entrypoint cho PWA/API/webmail | DNS only |
| `smtp.logivn.com` | Alias SMTP tùy chọn nếu muốn tách client config | DNS only |
| `imap.logivn.com` | Alias IMAP tùy chọn nếu muốn tách client config | DNS only |
| `webmail.logivn.com` | Alias webmail phase sau, không dùng mặc định | Có thể proxied nếu chỉ HTTP/HTTPS |
| `logimail.logivn.com` | Alias PWA phase sau, không dùng mặc định | Có thể proxied |
| `api-logimail.logivn.com` | Alias API phase sau, không dùng mặc định | Có thể proxied |
| `track-mail.logivn.com` | Tracking/campaign phase sau | Tùy kiến trúc |

## Luồng `mail.logivn.com` mặc định

```text
mail.logivn.com:25/465/587   -> Postfix/BillionMail SMTP
mail.logivn.com:143/993      -> Dovecot/BillionMail IMAP
mail.logivn.com/dashboard    -> Next.js PWA nội bộ
mail.logivn.com/api/logimail -> Backend API nội bộ
mail.logivn.com/roundcube/   -> RoundCube webmail từ BillionMail
```

Cloudflare record `A mail.logivn.com` phải để `proxied=false`. HTTP/HTTPS vẫn dùng được khi DNS-only, chỉ là traffic không đi qua Cloudflare reverse proxy.

Trên VPS chung LogiVN, Nginx giữ public `80/443`; BillionMail web/admin dùng upstream nội bộ `8081/8443` và SMTP/IMAP vẫn đi thẳng qua port mail.

## Luồng API chuẩn

```text
PWA -> Backend API -> Verify Supabase JWT -> Check permission -> Service adapter -> BillionMail/IMAP/SMTP/Cloudflare
```

Frontend không gọi trực tiếp SMTP/IMAP/BillionMail/Cloudflare.

## Non-goals MVP

- Chưa lưu inbox raw body vào Supabase.
- Chưa có campaign/newsletter public quy mô lớn.
- Chưa tự động sửa DNS record đã tồn tại.
- Chưa dùng domain chính cho gửi bulk.
- Chưa cấp quyền root toàn phần cho agent.

## Phase triển khai

1. Architecture, docs, schema, script safety.
2. VPS precheck, Docker, BillionMail, firewall.
3. Cloudflare DNS plan/bootstrap/verify.
4. PWA Supabase Auth và dashboard metadata.
5. Backend API nối Supabase, Cloudflare, BillionMail.
6. MailOps agent, backup, Telegram report.
7. Hardening, deliverability, warm-up.
