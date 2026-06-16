# LogiMail — Deploy Note: Deliverability + Multi-domain + Security

Spec: `logimail-deliverability-multidomain` (18/18 task hoàn tất). Ghi chú này để deploy vùng nâng cấp này lên **production** từ IDE/terminal khác. Mọi đối tượng DB nằm trong schema `logimail` (không đụng `public`).

> Toàn bộ lệnh dùng đường dẫn tuyệt đối vì repo có cwd dễ nhầm. Đổi `"/Users/tunbee27/Documents/New project"` thành đường dẫn repo trên máy bạn.

---

## 0. Tọa độ hệ thống (facts đã xác minh)

| Hạng mục | Giá trị |
|---|---|
| Supabase project (LINKED) | `tfhqatvevbrbzaaqjhfa` — "qr-restaurant-saas" — region Singapore (`sin1`) |
| DB dùng chung | **Cùng 1 database với qr-restaurant-saas**, phân tách bằng schema. LogiMail = schema `logimail` (+ `logimail_private`). |
| Migrations dir mà CLI push | `"/Users/tunbee27/Documents/New project/supabase/migrations"` (bộ chuẩn, đã link) |
| App Next.js (real backend) | `"/Users/tunbee27/Documents/New project/logimail/apps/logimail-web"` |
| Build command | `npx next build --webpack` (Turbopack panic trên Next canary này → bắt buộc `--webpack`) |
| Dev | `npx next dev -p 3100 --webpack` |
| Hosts | `domain.logivn.com` = console quản trị; `mail.logivn.com` = mail client |

---

## 1. ⚠️ Sự cố migration phải xử lý TRƯỚC khi deploy code

**Triệu chứng:** Trên production, 8 bảng mới của LogiMail đã tồn tại, **nhưng các cột thêm vào `logimail.domains` và `logimail.mailboxes` bị THIẾU**:
- `logimail.domains`: `parent_domain_id`, `stream_type`, `bimi_status`, `mta_sts_status`, `sending_ip`
- `logimail.mailboxes`: `credential_key_version`

**Nguyên nhân:** Migration gốc `20260613120000_logimail_deliverability_multidomain.sql` **trùng timestamp** với một migration của nhà hàng (`20260613120000_order_items_prepared_at.sql`) trong bộ chuẩn. Slot timestamp bị migration nhà hàng chiếm → phần `ALTER TABLE ... ADD COLUMN` của LogiMail không bao giờ chạy trên remote (dù bảng đã có do lần áp trước).

**Hệ quả nếu deploy code mà không vá:** các tính năng multi-domain / warm-up / stream / key-rotation sẽ lỗi runtime ("column ... does not exist").

**File vá đã chuẩn bị sẵn (idempotent, chạy lại an toàn, chỉ schema `logimail`):**
```
logimail/supabase/migrations/20260614090000_logimail_deliverability_backfill.sql
```

### Cách áp (chọn 1 trong 2)

**Cách A — qua Supabase CLI (khuyến nghị, có version history):**
```bash
cd "/Users/tunbee27/Documents/New project"

# 1) Đưa file vá vào bộ migrations chuẩn mà CLI push:
cp "logimail/supabase/migrations/20260614090000_logimail_deliverability_backfill.sql" \
   "supabase/migrations/20260614090000_logimail_deliverability_backfill.sql"

# 2) Xem CLI sẽ áp đúng 1 file mới (KHÔNG được thấy migration nhà hàng nào):
supabase migration list
supabase db push --dry-run        # phải chỉ liệt kê 20260614090000_..._backfill

# 3) Áp lên production:
supabase db push
```
> Nếu `db push --dry-run` hiện thêm migration lạ (của team khác) → DỪNG, hỏi lại trước khi push.

**Cách B — chạy SQL trực tiếp (Supabase Studio → SQL Editor):**
Mở project trên Supabase Dashboard → SQL Editor → dán toàn bộ nội dung file `20260614090000_logimail_deliverability_backfill.sql` → Run. File idempotent nên chạy lại không hỏng.

### Xác minh sau khi áp (read-only, không lộ key)
```bash
cd "/Users/tunbee27/Documents/New project/logimail/apps/logimail-web"
node scripts/verify-deliverability-remote.mjs
```
Kỳ vọng: `8/8 new tables present` **và** 2 dòng `OK domains.new_columns`, `OK mailboxes.credential_key_version`.

---

## 2. Biến môi trường (production)

### 2.1 Đã có sẵn trong `apps/logimail-web/.env.local` (giữ nguyên cho prod)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`  *(server-only, không bao giờ để client đọc)*
- `LOGIMAIL_CREDENTIAL_ENCRYPTION_KEY` *(KEK envelope encryption)*
- `LOGIMAIL_MAIL_SESSION_SECRET`
- `LOGIMAIL_SECURITY_CODE_SECRET`
- `LOGIMAIL_DOMAIN`

### 2.2 Secret MỚI cần sinh (tự tạo, không phụ thuộc bên ngoài)
```bash
echo "LOGIMAIL_INGEST_KEY=$(openssl rand -hex 32)"   # xác thực /api/logimail/ingest/{dmarc,bounce}
echo "LOGIMAIL_CRON_KEY=$(openssl rand -hex 32)"      # xác thực /api/logimail/cron/* (nếu không dùng CRON_SECRET)
```
> Trên Vercel, nếu dùng Vercel Cron thì `CRON_SECRET` được Vercel tự gắn `Authorization: Bearer`. Code đã chấp nhận **cả hai**: `CRON_SECRET` (Bearer) hoặc header `x-logimail-cron-key` = `LOGIMAIL_CRON_KEY`. Đặt ít nhất một trong hai.

### 2.3 Giá trị BÊN NGOÀI cần bạn cung cấp (không thể tự sinh)
| Env | Dùng cho | Thiếu thì sao |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | DNS provisioner (Zone:Read + DNS:Edit) | route `dns-provision` trả `503 cloudflare_not_configured` |
| `CLOUDFLARE_ZONE_ID` | zone mặc định khi provision | phải truyền `zoneId` trong body |
| `LOGIMAIL_VPS_IP` | dựng SPF/A record, plan DNS mặc định, warm-up | plan mặc định trả `400 missing_vps_ip` |
| `LOGIMAIL_SEED_LIST` | placement test (danh sách email seed, phân tách dấu phẩy) | `startPlacementTest` trả `400 seed_list_not_configured` |
| `LOGIMAIL_MAIL_HOSTNAME` *(tùy chọn)* | hostname mail mặc định | fallback `mail.<domain>` |
| `LOGIMAIL_CREDENTIAL_ENCRYPTION_KEY_V2`, `_V3`, ... *(tùy chọn)* | key rotation đa phiên bản | chỉ cần khi rotate sang version mới |

> Các tính năng thiếu env sẽ **fail mềm** (trả lỗi cấu hình rõ ràng), không làm sập app. Có thể bổ sung sau.

### 2.4 Nạp env lên Vercel (sau khi đã link project ở mục 3)
```bash
cd "/Users/tunbee27/Documents/New project/logimail/apps/logimail-web"
# ví dụ:
printf '%s' "<value>" | vercel env add LOGIMAIL_INGEST_KEY production
printf '%s' "<value>" | vercel env add LOGIMAIL_CRON_KEY production
# ... lặp cho từng biến ở 2.1/2.2/2.3 (môi trường: production, và preview nếu cần)
```

---

## 3. Deploy `logimail-web` lên Vercel (production)

> `logimail-web` **chưa link** project Vercel nào (`apps/logimail-web/.vercel` không tồn tại). Đây là deploy 1 Next app riêng trong monorepo. Cần quyết định: tên project + domain.

```bash
cd "/Users/tunbee27/Documents/New project/logimail/apps/logimail-web"

vercel login                      # nếu chưa đăng nhập
vercel link                       # tạo/chọn project Vercel cho thư mục này
# (interactive: chọn scope/team, đặt tên ví dụ "logimail-web")
```

**Cấu hình Project Settings trên Vercel (Dashboard hoặc CLI):**
- **Root Directory**: `logimail/apps/logimail-web`
- **Build Command**: `next build --webpack`  *(QUAN TRỌNG: tránh Turbopack)*
- **Install Command**: mặc định (`npm install`)
- **Output**: mặc định (`.next`)
- **Node**: 20+ (khớp Next 16 canary)
- **Region**: `sin1`
- **Cron**: đã khai báo sẵn trong `apps/logimail-web/vercel.json` (4 job daily-compatible cho Vercel Hobby). Nếu cần `alerts-scan` chạy hourly, chuyển cron sang worker VPS hoặc nâng Vercel Pro để gọi các endpoint `/api/logimail/cron/*` kèm header `x-logimail-cron-key`.

**Deploy:**
```bash
vercel                            # deploy preview để kiểm thử
vercel --prod                     # deploy production
```

**Domain:**
- Gắn `domain.logivn.com` (console) và `mail.logivn.com` (mail client) vào project này trong Vercel → Settings → Domains.
- App đã host-aware: `/` render console khi host = `domain.logivn.com`; mail client ở `/mail/*` cho `mail.logivn.com`.

---

## 4. Cron jobs (`apps/logimail-web/vercel.json`)
| Path | Lịch | Việc |
|---|---|---|
| `/api/logimail/cron/warmup-tick` | `0 1 * * *` | đẩy mọi warm-up plan active sang ngày kế |
| `/api/logimail/cron/alerts-scan` | `0 4 * * *` | quét bounce-rate 24h + SLA pending; dùng VPS/Pro nếu cần hourly |
| `/api/logimail/cron/key-rotation-step` | `30 2 * * *` | re-encrypt credential theo lô |
| `/api/logimail/cron/placement-collect` | `15 3 * * *` | đánh dấu placement test quá hạn |

Mỗi job yêu cầu auth: `CRON_SECRET` (Vercel tự gắn) hoặc header `x-logimail-cron-key`.

---

## 5. Kiểm thử trước/sau deploy

```bash
cd "/Users/tunbee27/Documents/New project/logimail/apps/logimail-web"

# Typecheck (3 lỗi 'next' NextConfig/Metadata/Viewport là pre-existing, bỏ qua):
npx tsc --noEmit 2>&1 | grep -v "NextConfig\|exported member .Metadata\|exported member .Viewport"

# Unit + property tests (57 test):
node --test 'src/lib/**/*.test.mjs'

# Migration static test (9 test):
cd "/Users/tunbee27/Documents/New project/logimail/supabase"
node --test deliverability-multidomain-migration.test.mjs

# Build production:
cd "/Users/tunbee27/Documents/New project/logimail/apps/logimail-web"
npx next build --webpack
```

**Smoke test route sau khi prod chạy** (cần Supabase JWT của tài khoản owner/admin LogiMail, ví dụ `tung@logivn.com`):
```bash
BASE="https://domain.logivn.com"
TOKEN="<supabase_access_token>"

# Overview (đã thêm 'alerts'):
curl -s "$BASE/api/logimail/admin/overview" -H "authorization: Bearer $TOKEN" | head -c 400

# List sending domains (score/usage, phân trang 100):
curl -s "$BASE/api/logimail/admin/domains" -H "authorization: Bearer $TOKEN"

# Ingest có signed key (không cần JWT):
curl -s -X POST "$BASE/api/logimail/ingest/bounce" \
  -H "x-logimail-ingest-key: $LOGIMAIL_INGEST_KEY" \
  -H "content-type: application/json" \
  -d '{"workspaceId":"<uuid>","recipientEmail":"test@example.com","smtpCode":"550"}'
```
Hành động nguy hiểm (DELETE dkim, dns-provision, keys/rotate, runbooks/run, sessions DELETE) cần thêm header `x-logimail-confirm: I_UNDERSTAND_LOGIMAIL_RISK`.

---

## 6. Thứ tự deploy đề xuất (an toàn)

1. **Vá DB trước** (mục 1) → xác minh `verify-deliverability-remote.mjs` xanh hết.
2. **Set env** (mục 2) trên Vercel.
3. **Deploy preview** (`vercel`) → smoke test trên URL preview.
4. **Deploy prod** (`vercel --prod`).
5. **Gắn domain** + bật cron.
6. Theo dõi `logimail.alerts` + `logimail.audit_logs` 24h đầu.

## 7. Rollback
- **Code/Vercel**: `vercel rollback <previous-deployment-url>` hoặc promote deployment cũ trong Dashboard.
- **DB**: migration backfill **chỉ thêm** (additive, idempotent) — không drop gì. Rollback DB không cần thiết; nếu buộc phải gỡ cột (hiếm), làm thủ công có review riêng vì DB dùng chung với nhà hàng.
- **Cron**: tắt trong `vercel.json` rồi redeploy.

## 8. Lưu ý quan trọng
- **DB dùng chung với qr-restaurant-saas** → mọi `supabase db push` phải kiểm `--dry-run` trước; tuyệt đối không push migration lạ.
- Không commit secret thật vào repo. Dùng `vercel env` / Supabase Dashboard.
- `SUPABASE_SERVICE_ROLE_KEY` chỉ ở server (API routes), không expose client.
- Mọi đối tượng LogiMail ở schema `logimail`/`logimail_private`; không sửa `public` (R21).
