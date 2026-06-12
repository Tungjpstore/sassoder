# Deliverability cho LogiMail

## Checklist nền tảng

- Port 25 inbound/outbound phải mở ở VPS provider và firewall.
- PTR/rDNS phải chỉnh tại VPS provider, Cloudflare không chỉnh được.
- `mail.logivn.com` phải DNS only. Nếu tạo alias `smtp.logivn.com` hoặc `imap.logivn.com`, hai alias đó cũng phải DNS only.
- MX trỏ về `mail.logivn.com`.
- SMTP/IMAP client mặc định dùng `mail.logivn.com`, không bắt buộc tạo alias riêng.
- SPF có `mx` và `ip4:VPS_IP`.
- DKIM lấy từ BillionMail sau khi add domain.
- DMARC bắt đầu `p=none` để quan sát trước khi siết.
- `postmaster@` và `abuse@` nên tồn tại.

## Warm-up ban đầu

Với VPS 4 vCPU / 6GB RAM / 60GB SSD:

- 10-20 mailbox nội bộ.
- Quota 500MB-1GB/mailbox.
- 200-1000 email/ngày trong giai đoạn đầu.
- Tăng dần sau khi reputation ổn.

## Test bắt buộc

1. Gmail Show Original: SPF/DKIM/DMARC phải pass hoặc giải thích được lỗi.
2. mail-tester: kiểm tra điểm spam và DNS.
3. Blacklist check: kiểm tra IP/domain.
4. Inbound test: Gmail gửi vào LogiMail.
5. Outbound test: LogiMail gửi ra Gmail.
6. Queue test: không có mail kẹt bất thường.

## Trạng thái kiểm thử 2026-06-10

- MX public của `logivn.com` đang là `10 mail.logivn.com.`.
- `mail.logivn.com` DNS-only và trỏ `103.199.19.144`.
- PTR/rDNS của `103.199.19.144` trỏ về `mail.logivn.com`.
- SPF root hiện là `v=spf1 include:_spf.mx.cloudflare.net ip4:103.199.19.144 ~all`; giữ mềm trong giai đoạn warm-up, chưa siết `-all`.
- DMARC `_dmarc.logivn.com` đang `p=none` để quan sát.
- DKIM selector `default` đã public và Gmail xác thực `logivn.com`.
- Inbound Gmail -> `support@logivn.com` marker `logimail-inbound-gmail-20260610085135` đã lưu trong Maildir.
- Outbound `support@logivn.com` -> Gmail marker `logimail-support-final-20260610085627` đã vào Gmail Inbox sau khi not-spam training.
- Postfix queue rỗng sau test cuối.

## Warm-up sau cutover

- Giữ volume thấp trong 7-14 ngày đầu, ưu tiên thư thật tới người nhận đã tương tác.
- Theo dõi Gmail spam placement cho từng mailbox mới; nếu mailbox đầu tiên vào Spam, đánh dấu not-spam bằng tài khoản nhận test rồi gửi lại marker mới.
- Chỉ siết SPF từ `~all` sang `-all` và DMARC từ `p=none` sang `quarantine/reject` sau khi có dữ liệu DMARC/report ổn định.
- Không dùng `noreply@logivn.com` cho tương tác đầu tiên với khách hàng; dùng `support@` hoặc `hello@` để tăng khả năng reply và reputation.

## Rủi ro thường gặp

- VPS provider chặn port 25 outbound.
- PTR/rDNS không khớp hostname.
- Cloudflare proxy bị bật nhầm cho SMTP/IMAP.
- SPF trùng nhiều TXT record gây fail.
- DKIM selector sai tên.
- Gửi quá nhiều khi IP mới.
