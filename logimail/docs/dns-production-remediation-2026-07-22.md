# Runbook remediation DNS production LogiMail

Ngày lập: 2026-07-22  
Phạm vi: chỉ zone `logivn.com` phục vụ LogiMail  
Trạng thái: kế hoạch read-only, chưa được phép thay đổi DNS production

## Mục tiêu và nguyên tắc an toàn

Mục tiêu của đợt này là đưa luồng mail production về một cấu hình xác định, có thể kiểm chứng và rollback được:

- Một đường nhận mail chính thức qua `mail.logivn.com`.
- Chính xác một bản ghi SPF cho root domain.
- DKIM RSA tối thiểu 2048-bit và có quy trình xoay khóa không làm gián đoạn chữ ký.
- DMARC được siết theo dữ liệu thực tế, không chuyển thẳng từ `p=none` sang `p=reject`.
- MTA-STS có DNS policy id hợp lệ, endpoint HTTPS trả policy thật, và TLS-RPT có nơi nhận báo cáo.

Không chạy các thao tác `POST`, `PUT`, `PATCH` hoặc `DELETE` tới Cloudflare trong giai đoạn preflight. Mọi lần thay đổi MX, SPF, DKIM, DMARC hoặc MTA-STS phải có snapshot, diff theo record id, cửa sổ bảo trì, người phê duyệt và lệnh rollback đã chuẩn bị trước.

## Snapshot public ngày 2026-07-22

Các kiểm tra `dig` và HTTPS read-only cho thấy:

| Hạng mục | Trạng thái hiện tại | Rủi ro |
| --- | --- | --- |
| MX | `10 mail.logivn.com.` và `10 mail.oqumail.com.` | Hai máy khác nhau có cùng priority; remote MTA có thể chọn bất kỳ máy nào. |
| A | `mail.logivn.com -> 103.199.19.144`; `mail.oqumail.com -> 91.98.127.86` | Xác nhận đây là hai mail stack độc lập trước khi loại record cũ. |
| SPF | `v=spf1 include:_spf.mx.cloudflare.net ip4:103.199.19.144 ~all` và `v=spf1 mx a:mail.oqumail.com ~all` | Nhiều SPF record gây SPF `PermError`. |
| DKIM | `default._domainkey.logivn.com`, RSA 1024-bit | Khóa yếu so với baseline production hiện đại; cần rotation có overlap. |
| DMARC | `v=DMARC1; p=none; rua=mailto:dmarc@logivn.com` | Chỉ quan sát, chưa bảo vệ domain khỏi spoofing. |
| MTA-STS DNS | Không có record explicit; truy vấn public rơi vào wildcard `CNAME *.logivn.com` tới Vercel, không có TXT `v=STSv1` | Không có policy id hợp lệ. Record TXT exact sẽ override wildcard. |
| MTA-STS HTTPS | `https://mta-sts.logivn.com/.well-known/mta-sts.txt` trả HTTP 404 | Sender không thể tải policy. |
| TLS-RPT | Không có record explicit; truy vấn public rơi vào wildcard `CNAME *.logivn.com` tới Vercel, không có TXT `v=TLSRPTv1` | Không nhận được báo cáo lỗi TLS. Record TXT exact sẽ override wildcard. |

Ba TXT verification không phải SPF đang tồn tại ở root domain phải được giữ nguyên. Không xóa TXT theo tên `logivn.com` hàng loạt.

## Quyết định bắt buộc trước khi thay đổi

Chưa xóa MX/SPF liên quan `oqumail.com` cho đến khi có đủ bằng chứng sau:

1. BillionMail tại `mail.logivn.com` có toàn bộ mailbox/alias đang hoạt động và nhận được thư test từ ít nhất Gmail, Outlook và một MTA độc lập.
2. Không còn mailbox, alias, catch-all, forwarder hoặc outbound sender hợp lệ nào phụ thuộc `mail.oqumail.com`.
3. Log của cả hai hệ thống trong ít nhất 72 giờ xác nhận không còn delivery hợp lệ chỉ xuất hiện ở OquMail.
4. `postmaster@logivn.com`, `abuse@logivn.com`, `dmarc@logivn.com` và địa chỉ TLS-RPT đích tồn tại, được theo dõi.
5. Chủ dịch vụ phê duyệt rõ lựa chọn `mail.logivn.com` là MX chính thức.

Nếu OquMail vẫn cần làm fallback trong thời gian di trú, không để cùng priority. Thiết kế tạm thời phải là `10 mail.logivn.com.` và `20 mail.oqumail.com.`, đồng thời kiểm tra OquMail thực sự chấp nhận và đồng bộ mail cho domain. Nếu không có cơ chế đồng bộ mailbox, fallback MX chỉ làm thất lạc thư theo một cách khó quan sát và không nên giữ.

## Desired state

### Pha 1: khôi phục tính xác định, không siết policy

| Type | Name | Desired content | Ghi chú |
| --- | --- | --- | --- |
| A | `mail.logivn.com` | `103.199.19.144` | DNS-only, không proxy qua Cloudflare. |
| MX | `logivn.com` | `10 mail.logivn.com.` | Chỉ một MX sau khi gate OquMail đạt. |
| TXT | `logivn.com` | `v=spf1 mx ip4:103.199.19.144 ~all` | Chính xác một SPF; giữ `~all` trong giai đoạn ổn định. |
| TXT | `_dmarc.logivn.com` | `v=DMARC1; p=none; rua=mailto:dmarc@logivn.com; fo=1` | Chỉ dùng khi `dmarc@` tồn tại và được đọc. |

SPF ở bảng là baseline đề xuất dựa trên mail stack hiện tại. Trước khi áp dụng, lập inventory mọi sender hợp lệ. Nếu còn Google Workspace, Zoho, CRM, transactional provider hoặc dịch vụ khác gửi bằng `@logivn.com`, hợp nhất cơ chế cần thiết vào **một** SPF record và kiểm tra giới hạn 10 DNS lookup. Không giữ hai SPF record để hỗ trợ hai provider.

### Pha 2: xoay DKIM

Ưu tiên tạo selector mới, ví dụ `lm202607`, thay vì ghi đè `default`:

```text
TXT lm202607._domainkey.logivn.com "v=DKIM1; k=rsa; p=<public-key-2048-bit-từ-BillionMail>"
```

Giá trị placeholder không được đưa lên DNS. Public key phải lấy trực tiếp từ BillionMail và được kiểm tra modulus 2048-bit trước khi publish.

Thứ tự rotation:

1. Tạo key/selector mới trong BillionMail nhưng chưa đổi signer.
2. Publish TXT selector mới và chờ các resolver authoritative/public trả đúng giá trị.
3. Chuyển signer sang selector mới.
4. Gửi thư marker tới Gmail/Outlook và xác nhận header `DKIM-Signature` có `d=logivn.com; s=lm202607` và DKIM pass.
5. Giữ selector `default` cũ ít nhất 7 ngày để thư đang queue vẫn xác minh được, sau đó mới xóa.

Nếu BillionMail chỉ hỗ trợ selector `default`, phải có runbook riêng để đổi key signer và TXT trong cùng cửa sổ bảo trì; lưu cả private/public key cũ để rollback. Không dùng `cloudflare-dns-add-dkim.sh` để ghi đè vì script sẽ cố ý skip record đang tồn tại.

### Pha 3: MTA-STS và TLS-RPT

Staging endpoint trước, DNS sau. Endpoint phải trả HTTP 200, HTTPS certificate hợp lệ, không redirect sang login và body chính xác:

```text
version: STSv1
mode: testing
mx: mail.logivn.com
max_age: 86400
```

Sau khi endpoint đã hoạt động, desired records là:

```text
TXT _mta-sts.logivn.com "v=STSv1; id=20260722T000000Z"
TXT _smtp._tls.logivn.com "v=TLSRPTv1; rua=mailto:tlsrpt@logivn.com"
```

Không có CNAME explicit cần xóa tại `_mta-sts` hoặc `_smtp._tls`; kết quả CNAME public hiện tại đến từ wildcard `*.logivn.com`. Trong Cloudflare, tạo TXT exact tại hai tên này sẽ override wildcard theo DNS precedence. Chỉ giữ wildcard cho các hostname khác; không xóa wildcard trong change set MTA-STS/TLS-RPT.

Sau tối thiểu 7 ngày ở `mode: testing`, không có TLS failure chưa giải thích và mọi MX đều có TLS hợp lệ, chuyển policy sang:

```text
version: STSv1
mode: enforce
mx: mail.logivn.com
max_age: 604800
```

Mỗi lần đổi body policy phải đổi `id` của TXT `_mta-sts` sau khi endpoint mới đã trả 200.

### Pha 4: siết DMARC

Chỉ bắt đầu sau khi SPF có đúng một record, DKIM 2048-bit đã ký ổn định và báo cáo DMARC cho thấy ít nhất 7 ngày liên tiếp có từ 98% luồng hợp lệ pass alignment:

1. `p=quarantine; pct=25` trong tối thiểu 72 giờ.
2. `p=quarantine; pct=100` trong tối thiểu 7 ngày.
3. `p=reject; pct=25` trong tối thiểu 72 giờ.
4. `p=reject; pct=100` khi không còn nguồn gửi hợp lệ chưa nhận diện.

Giữ `rua=mailto:dmarc@logivn.com; fo=1` trong mọi pha. Không bật `adkim=s` hoặc `aspf=s` trong cùng lần chuyển policy đầu tiên.

## Preflight read-only

Chạy từ root repo LogiMail. Không in token vào terminal/log và không dùng Global API Key.

```bash
cd /Users/tunbee27/Documents/logivn/logimail
export LOGIMAIL_DOMAIN=logivn.com
export LOGIMAIL_MAIL_HOSTNAME=mail.logivn.com
export LOGIMAIL_VPS_IP=103.199.19.144
bash infra/cloudflare/cloudflare-dns-existing-report.sh
bash infra/cloudflare/cloudflare-dns-plan.sh
```

Hai script trên chỉ gọi Cloudflare GET. Report phải được lưu vào hồ sơ thay đổi bảo mật và gồm record id của tất cả MX/TXT liên quan. Sau đó đối chiếu public DNS qua nhiều resolver:

```bash
dig @1.1.1.1 +noall +answer logivn.com MX
dig @8.8.8.8 +noall +answer logivn.com MX
dig @1.1.1.1 +noall +answer logivn.com TXT
dig @8.8.8.8 +noall +answer logivn.com TXT
dig @1.1.1.1 +noall +answer default._domainkey.logivn.com TXT
dig @1.1.1.1 +noall +answer _dmarc.logivn.com TXT
dig @1.1.1.1 +noall +answer _mta-sts.logivn.com TXT
dig @1.1.1.1 +noall +answer _smtp._tls.logivn.com TXT
curl -sS -D - https://mta-sts.logivn.com/.well-known/mta-sts.txt
```

Trên VPS, dùng các lệnh read-only sau để xác nhận mail stack và nguồn DKIM:

```bash
cd /opt/BillionMail
bash bm.sh show-record
docker compose ps
postqueue -p
```

Trước cửa sổ thay đổi, snapshot toàn bộ zone bằng Cloudflare GET, lưu file permission `0600`, tính checksum và tạo manifest riêng cho từng record bị tác động gồm `id`, `type`, `name`, `content`, `priority`, `proxied`, `ttl`. Snapshot phải chứa cả verification TXT cần giữ, không chỉ MX/SPF.

## Diff dự kiến cần phê duyệt

Với giả định đã xác nhận BillionMail là hệ thống duy nhất:

| Hành động | Record hiện tại | Record sau thay đổi |
| --- | --- | --- |
| DELETE | `MX logivn.com 10 mail.oqumail.com.` | Không còn record này. |
| DELETE | `TXT logivn.com "v=spf1 mx a:mail.oqumail.com ~all"` | Không còn record này. |
| UPDATE | SPF còn lại có `include:_spf.mx.cloudflare.net` | Một SPF canonical theo sender inventory, mặc định `v=spf1 mx ip4:103.199.19.144 ~all`. |
| CREATE | Selector DKIM 2048-bit mới | Publish trước khi đổi signer. |
| DELETE trì hoãn | `default._domainkey` RSA 1024-bit | Chỉ xóa sau thời gian overlap. |
| UPDATE trì hoãn | DMARC `p=none` | Siết theo rollout ở trên, không cùng lúc với cleanup MX/SPF. |
| CREATE | TXT `_mta-sts` exact | TXT `v=STSv1; id=...`, chỉ sau khi endpoint trả 200; record exact override wildcard. |
| CREATE | TXT `_smtp._tls` exact | TXT `v=TLSRPTv1; rua=...`, chỉ sau khi mailbox đích tồn tại; record exact override wildcard. |

Không gộp MX/SPF cleanup, DKIM rotation, MTA-STS enforce và DMARC reject vào cùng một lần thay đổi. Mỗi pha cần một diff và verification riêng để khoanh vùng rollback.

## Giới hạn của automation hiện tại

- `cloudflare-dns-existing-report.sh` phù hợp để inventory read-only và lấy record id.
- `cloudflare-dns-plan.sh` phù hợp để tham khảo, nhưng plan mặc định dùng SPF `-all` và DMARC `postmaster@`; không xem output này là desired state production nếu chưa inventory sender.
- `cloudflare-dns-verify.sh` chỉ kiểm tra record tồn tại và đọc record đầu tiên; nó không fail khi có duplicate MX/SPF, không kiểm tra độ dài DKIM và không kiểm tra MTA-STS endpoint.
- `cloudflare-dns-update-confirmed.sh` sẽ dừng khi query trả nhiều record và không có chức năng delete; không dùng script này để xử lý duplicate hiện tại.
- `cloudflare-dns-bootstrap.sh` chỉ tạo record thiếu và skip record tồn tại; không dùng cho remediation production.
- `apps/logimail-web/src/lib/ops/dns-plan.ts` gom record cùng slot vào một `Map`, nên duplicate có thể bị che khuất trong diff.
- `apps/logimail-web/src/lib/ops/dns-provisioner.ts` không phân trang quá 100 record và `allowModify` hiện không thực hiện update record; kết quả có thể trông như thành công dù modification chưa được áp dụng.
- API DNS provision nhận `zoneId` và `planned` từ request. Không dùng admin UI/API này cho đợt remediation cho đến khi có allowlist zone/domain, diff đầy đủ và delete/update transaction có audit.

Vì các giới hạn trên, apply production chỉ được thực hiện bằng một change set đã review theo record id trong Cloudflare Dashboard hoặc bằng script delete/update mới có backup và confirm rõ ràng. Tài liệu này không cấp quyền apply.

## Verification sau từng pha

### DNS

- Resolver authoritative, `1.1.1.1` và `8.8.8.8` trả cùng record set sau thời gian TTL.
- MX chỉ còn topology đã phê duyệt và mọi target phân giải đúng IP.
- Root domain có chính xác một TXT bắt đầu bằng `v=spf1`; các TXT verification vẫn còn.
- Mail transport hostname ở trạng thái DNS-only.
- DKIM selector đang ký có public key 2048-bit và thư thật verify pass.
- DMARC có đúng một record, parse được và mailbox `rua` nhận report.
- `_mta-sts` có đúng một TXT `v=STSv1`; endpoint trả HTTP 200 với policy body mong đợi.
- `_smtp._tls` có đúng một TXT `v=TLSRPTv1`; mailbox báo cáo tồn tại.

### Mail flow

- Gmail, Outlook gửi vào một mailbox LogiMail và nhận phản hồi thành công.
- LogiMail gửi ra Gmail/Outlook; Show Original cho SPF, DKIM và DMARC pass.
- SMTP 587 STARTTLS, SMTP 465 TLS và IMAP 993 TLS vẫn bắt tay được với certificate đúng hostname.
- Postfix queue không tăng bất thường; log không có spike `550`, `554`, relay denied hoặc TLS policy failure.
- Không có thư hợp lệ mới chỉ xuất hiện ở OquMail sau khi cleanup.

Giữ marker, timestamp, Message-ID và kết quả header cho từng test trong hồ sơ thay đổi; không đưa credential hoặc nội dung thư nhạy cảm vào repo.

## Rollback

Chuẩn bị payload rollback từ snapshot trước khi apply. Record bị xóa phải được recreate bằng `POST` từ các field cũ; record bị update phải được `PUT` về content/priority/proxied/ttl cũ. ID của record recreate có thể thay đổi, vì vậy manifest sau rollback phải được cập nhật.

Rollback theo loại sự cố:

1. **Inbound lỗi sau MX cleanup:** recreate MX OquMail đúng content/priority cũ, rồi kiểm tra lại cả hai hệ thống. Chỉ làm nếu OquMail vẫn còn hoạt động và dữ liệu mailbox có thể nhận được.
2. **SPF fail sau hợp nhất:** restore đúng một SPF trước thay đổi đã được xác định là canonical. Không restore trạng thái hai SPF vì đó vẫn là `PermError`; nếu cần OquMail, hợp nhất cơ chế của nó vào một record.
3. **DKIM fail:** chuyển signer về selector/key cũ trước, xác minh thư marker, giữ cả hai public selector trong thời gian xử lý.
4. **DMARC chặn thư hợp lệ:** đưa policy về `p=none` với cùng `rua`, chờ TTL và phân tích nguồn gửi thiếu alignment.
5. **MTA-STS lỗi:** khôi phục endpoint 200 ngay. Nếu cần vô hiệu hóa, publish policy `mode: none`, giảm `max_age` hợp lý và đổi TXT policy id; không chỉ xóa TXT/endpoint vì sender có thể còn cache policy cũ.
6. **TLS-RPT lỗi:** record có thể xóa hoặc sửa mailbox đích mà không đổi mail routing, nhưng vẫn phải theo change set đã phê duyệt.

Kích hoạt rollback nếu inbound/outbound test bắt buộc thất bại, queue tăng liên tục, SPF/DKIM/DMARC của thư marker không pass, hoặc xuất hiện lỗi TLS/MX chưa giải thích trong cửa sổ theo dõi. Sau rollback, chạy lại toàn bộ verification và ghi nhận record id mới.

## Cửa phê duyệt cuối

Chỉ chuyển từ read-only sang apply khi hồ sơ có đủ:

- Snapshot zone và checksum.
- Sender/mailbox/alias inventory.
- Diff theo từng record id và thứ tự thao tác.
- Payload rollback đã review.
- Kết quả test BillionMail trước thay đổi.
- Người phê duyệt MX chính thức và thời gian bảo trì.
- Người trực theo dõi mail flow, queue, DMARC và TLS-RPT sau thay đổi.

Cho đến khi hoàn thành các mục trên, trạng thái hợp lệ duy nhất của runbook là `NO-APPLY`.
