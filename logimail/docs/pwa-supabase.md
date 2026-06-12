# PWA Dashboard và Supabase

## Stack

- Next.js App Router.
- TypeScript.
- Tailwind/shadcn-ready.
- Supabase Auth.
- Supabase metadata schema `logimail`.
- PWA manifest và service worker cơ bản.

## Pages MVP

Public base URL mặc định: `https://mail.logivn.com`.

- `https://mail.logivn.com/login`
- `https://mail.logivn.com/register`
- `https://mail.logivn.com/dashboard`
- `https://mail.logivn.com/dashboard/domains`
- `https://mail.logivn.com/dashboard/domains/[id]`
- `https://mail.logivn.com/dashboard/mailboxes`
- `https://mail.logivn.com/dashboard/mailboxes/[id]`
- `https://mail.logivn.com/dashboard/team`
- `https://mail.logivn.com/dashboard/dns`
- `https://mail.logivn.com/dashboard/ops`
- `https://mail.logivn.com/dashboard/settings`

API base path mặc định: `https://mail.logivn.com/api/logimail`.

## Auth boundary

- Client dùng anon key để login/register.
- Server/API verify Supabase JWT bằng `auth.getUser(token)` trước khi đọc hoặc ghi metadata.
- API metadata hiện dùng anon client kèm bearer token của user và schema `logimail`, để RLS là lớp phân quyền chính.
- Service role key chỉ server-side; metadata CRUD vẫn dùng user JWT/RLS, còn audit insert dùng service-role nếu `SUPABASE_SERVICE_ROLE_KEY` được cấu hình.
- Route mutation ghi `audit_logs` best-effort: thiếu service-role thì không fail request MVP, nhưng production nên cấu hình key để có dấu vết đầy đủ.

## API metadata MVP

Các endpoint dưới `https://mail.logivn.com/api/logimail` đang nối tới Supabase metadata thật, nhưng chưa tạo side effect lên BillionMail hoặc Cloudflare production:

| Method | Path | Mục đích | Ghi chú an toàn |
| --- | --- | --- | --- |
| GET | `/me` | Lấy user Supabase và profile `logimail.profiles` | JWT user + RLS |
| GET/POST | `/workspaces` | Liệt kê/tạo workspace | Trigger DB tự thêm owner membership và quota |
| GET/POST | `/domains` | Liệt kê/tạo domain metadata | Chưa ghi Cloudflare |
| GET/POST | `/mailboxes` | Liệt kê/tạo mailbox metadata | Trả `providerSync=pending_billionmail` |
| POST | `/mailboxes/[id]/assign-user` | Gán quyền mailbox cho user | RLS yêu cầu owner/admin workspace |
| GET | `/domains/[id]/dns-check` | Trả expected DNS plan từ metadata/env | Chưa dùng token Cloudflare production |
| POST | `/domains/[id]/dns-bootstrap` | Trả DNS plan dry-run | Không mutate DNS; cần backup/xác nhận trước cutover |
| POST | `/ops/backup` | Placeholder queue backup | Ghi audit best-effort; không gửi raw email data ra ngoài |
| GET | `/ops/report` | Placeholder health/report | Chưa nối MailOps agent thật |
| POST | `/ops/restart-safe` | Placeholder restart an toàn | Cần header xác nhận nguy hiểm và ghi audit best-effort |

Request tới các endpoint trên phải có:

```text
Authorization: Bearer <supabase-user-jwt>
```

Riêng action nguy hiểm phải thêm:

```text
x-logimail-confirm: I_UNDERSTAND_LOGIMAIL_RISK
```

## RLS contract

- `logimail.workspaces`: user chỉ thấy workspace mình là owner/member.
- `logimail.domains`, `logimail.mailboxes`, `logimail.quotas`: member đọc được, owner/admin mới ghi.
- `logimail.mailbox_permissions`: owner/admin workspace gán quyền; user được thấy quyền liên quan tới mình.
- `logimail.audit_logs`: chỉ owner/admin đọc được.
- `logimail.email_send_logs`: member workspace đọc metadata gửi, không có raw body/attachment.
- `logimail_private`: chứa trigger/helper `security definer`, không expose trong Supabase Data API.

Nếu dùng chung Supabase project LogiVN, chạy migration trong schema `logimail` và không cấp quyền trực tiếp vào schema production khác.

## Supabase Data API

Trong Supabase Dashboard, thêm `logimail` vào **Project Settings -> API -> Exposed schemas** trước khi dùng các API route metadata. Không thêm `logimail_private` vào exposed schemas.

Migration đã grant quyền tối thiểu cho role `authenticated` trên bảng `logimail.*`; role `anon` bị revoke để request thiếu JWT không đọc/ghi metadata qua Data API. RLS vẫn là lớp quyết định row-level access sau khi role đã có quyền chạm bảng.

## Không cache dữ liệu nhạy cảm

Service worker không cache raw email body, attachment, mailbox password hoặc API response nhạy cảm. MVP chỉ cache shell/static assets.
