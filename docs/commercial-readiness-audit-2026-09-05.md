# LogiVN — Đánh giá hiện trạng và Kế hoạch nâng cấp toàn diện hướng thương mại hóa

Ngày: 2026-09-05
Nhánh phân tích: `main` @ `4d5a393` (sau khi land Phase 1/Phase 2 security hardening, inventory reservation ledger, branch authorization)
Phạm vi: QR ordering tại bàn, đặt bàn, gọi món online (pickup/delivery), quản lý nhân viên, quản lý kho, menu, và toàn bộ lớp UI/UX/frontend/responsive.

Tài liệu này KHÔNG thay thế các audit đã có (`docs/full-project-risk-roadmap-2026-07-22.md`, `docs/principal-architecture-audit-2026-05-10.md`, `docs/frontend-responsive-audit-2026-05-11.md`, `docs/inventory-commercialization-plan.md`, `docs/roadmap-10-tinh-nang-lon.md`). Nó đối chiếu chúng với mã nguồn hiện tại trên `main`, cập nhật những gì đã đóng, và đưa ra một lộ trình duy nhất, có thứ tự, để sản phẩm bán được.

---

## 0. Kết luận điều hành (TL;DR)

**Trạng thái:** LogiVN là một codebase lớn, tham vọng và phần lớn *đã có tính năng* (55 page, 139 API route, 147 bảng, 145 migration, 763 unit test xanh, lint + typecheck xanh). Ba luồng khách hàng (QR tại bàn, online, đặt bàn) và 14 workspace dashboard đã được chuyển sang thiết kế v2 với token system riêng và responsive tốt trên mobile.

**Vấn đề cốt lõi không phải thiếu tính năng, mà là độ tin cậy vận hành và độ hoàn thiện thương mại chưa được chứng minh:**

1. **Quyết định release gần nhất trong repo vẫn là NO-GO** (`docs/full-project-risk-roadmap-2026-07-22.md`). Phase 0/1/2 đã được land lên `main` ngày 2026-08-29 và 2026-09-05, nhưng chưa có bằng chứng rehearsal trên PostgreSQL thật, chưa có backup/PITR, chưa có E2E xác thực theo vai trò.
2. **Thanh toán VietQR là "bán tự động"**: khách bấm "Tôi đã chuyển khoản" → quán xác nhận tay. Không có đối soát ngân hàng tự động. Đây là điểm đau số 1 khi bán cho quán đông khách.
3. **Thiếu các "bàn đạp thương mại" bắt buộc ở thị trường Việt Nam**: hóa đơn điện tử theo Nghị định 70/2025 (bắt buộc với HKD doanh thu ≥ 1 tỷ/năm từ 01/06/2025), in bill/bếp, POS tại quầy cho khách không quét QR, CRM/loyalty, VAT.
4. **Nợ kỹ thuật rõ ràng và đo được**: 68 file / ~29.000 dòng không reachable từ `app/` (legacy customer client, legacy dashboard workbench, landing v1); `app/globals.css` 12.667 dòng; 218 file `"use client"`; các file 4.000–6.600 dòng; 5 VPS worker vẫn là stub trả `processed: true`.
5. **Hạ tầng kiểm chứng chưa đủ cho một SaaS thu tiền**: không có E2E browser test, không có staging DB rehearsal trong CI, `npm audit` còn 7 high.

**Khuyến nghị:** Chạy lộ trình 5 giai đoạn (mục 8) trong ~14–18 tuần, với nguyên tắc **"đóng rủi ro tài chính trước, thêm tính năng bán hàng sau, dọn nợ kỹ thuật song song theo từng workspace"**. Điểm dừng để bắt đầu thu tiền có kiểm soát (pilot 10–20 quán) là cuối Giai đoạn 2.

---

## 1. Phương pháp và bằng chứng

| Việc đã làm | Kết quả |
| --- | --- |
| Checkout `main` (`4d5a393`), `npm ci` | OK |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass |
| `npm test` (`scripts/run-tests.mjs`) | 763 pass / 1 fail / 1 skip. Fail duy nhất: `lib/database-reliability-audit.test.ts` — snapshot `MIGRATION_LOG.md` lệch (ghi 141 tracked/4 untracked, thực tế 145/0). Đã sửa snapshot trong PR này. Skip: reservation PostgreSQL rehearsal (không có `DATABASE_URL`). |
| `npm audit --audit-level=high` | 18 lỗ hổng (5 low, 6 moderate, 7 high) |
| Reachability analysis (script tạm, import graph từ `app/`, `proxy.ts`, `next.config.ts`) | 68 file / 29.052 dòng trong `components/`, `lib/`, `services/`, `hooks/` không reachable |
| Chạy dev server, chụp màn hình desktop + mobile (390×844) | Landing, dashboard-v2 demo (overview/inventory/menu/staff/reservations), customer-v2 dine-in/remote/reserve qua trang mock tạm (đã xoá) |
| Đọc toàn bộ tài liệu kiến trúc/audit/release hiện có | Đối chiếu ở mục 7 |

Lưu ý môi trường: repo chạy Next.js 16.3.4 + React 19.2 + Tailwind 4 + Supabase. Trong sandbox không có Supabase thật nên các trang dữ liệu thật chưa được kiểm tra end-to-end; đánh giá UI dựa trên demo routes (`/preview/dashboard-v2/*`) và render trực tiếp component v2 với props mock. Đây là cùng component production dùng, nên kết luận về layout/responsive là hợp lệ; kết luận về hành vi dữ liệu thật phụ thuộc vào QA có tài khoản (`docs/qa-round-2-real-account-evidence-2026-07-22.md`).

---

## 2. Hiện trạng theo từng lĩnh vực cốt lõi

Thang điểm: **Hoàn thiện** (đủ bán) · **Khá** (dùng được, còn khoảng trống rõ) · **Chưa đủ** (thiếu năng lực thương mại quan trọng).

### 2.1 QR ordering tại bàn — **Khá**

Đường dẫn: `app/r/[restaurantSlug]/table/[tableId]/page.tsx` → `components/customer-v2/dine-in/dine-in-client-v2.tsx` (1.735 dòng) + `lib/customer/*` (cart-state, checkout-flow reducer, modifier-pricing, promotion-preview, order-lifecycle, pending-order-idempotency).

Điểm mạnh:
- Luồng đầy đủ: menu → tuỳ chọn modifier (SIZE/TOPPING/ICE/SUGAR/ADDON/COMBO...) → giỏ + ghi chú → gọi món → theo dõi → chọn thanh toán (VietQR/tiền mặt) → gọi nhân viên. Hoá đơn theo bàn (`table_bills`) gom nhiều order.
- QR token theo bàn có version/rotate/enforce (`tables.qr_token_version`, `qr_token_enforced`, `allow_legacy_qr`); Phase 1 đã thêm RPC tạo order atomic có lock.
- Idempotency phía khách (`pending-order-idempotency`), rate limit persistent trên checkout/paid, realtime Supabase + fallback polling, xử lý offline/visibility.
- UI mobile tốt: grid 2 cột, sticky cart bar, bottom sheet, search + category pill, nút "Gọi NV" cố định. Logic tách khỏi UI (`lib/customer/*` có test).

Khoảng trống:
- **Menu item quá mỏng**: `menu_items` chỉ có `name/price/image_url/is_available`. Không có mô tả, tag (chay/cay/best-seller), dị ứng, ảnh nhiều, thứ tự hiển thị (`sort_order` không tồn tại; đang `order by name`), giờ bán theo khung, trạng thái "hết trong ngày".
- **Không có tách/gộp bill, chuyển bàn, giảm giá thủ công, tip, VAT** ở tầng service. Bill = tổng order, chỉ có `promotion_id` giảm giá.
- **Không có ngôn ngữ thứ hai** cho khách (du lịch, Q1/Đà Nẵng/Hội An cần EN).
- Ảnh menu placeholder (icon nĩa) chiếm 60% card khi quán chưa upload ảnh; cần fallback đẹp hơn (màu theo category, tên món to).
- `allow_legacy_qr` mặc định `true` trong schema → quán mới vẫn chấp nhận QR không token (đã ghi trong risk roadmap P0 mục 5).

### 2.2 Đặt bàn — **Khá → gần Hoàn thiện về backend**

Đường dẫn: `app/r/[slug]/reserve` → `components/customer-v2/reserve/*` (reserve-client-v2 583 + reserve-view 552 + floor-map 165); backend `services/reservation-service.ts` (~2.400 dòng), 14 API admin route (`seat/preflight`, `tables/preflight`, `reschedule/preflight`, `move-table`, `no-show`, `confirm-deposit`, `refund-deposit`...), cron `reservations/expire`, bảng `reservation_table_locks`, `reservation_deposit_logs`, `reservation_customer_risk_events`, `reservation_notification_outbox`.

Điểm mạnh:
- Đây là domain có backend chặt nhất: preflight trước mutation, lock bàn, cọc VietQR theo FIXED/PERCENT, hold/expire, grace, buffer, risk khách (no-show history), analytics.
- UI khách 4 bước (Giờ → Bàn → Thông tin → Xác nhận), có sơ đồ bàn để tự chọn hoặc auto-assign, quick date pills, deposit hiển thị rõ.

Khoảng trống:
- **Bug UI nhỏ nhưng lộ**: hàng chọn "Số khách" render pill `[2,4,6,8]` + input số, input hiển thị giá trị hiện tại (mặc định 2) → người dùng thấy "2 4 6 8 2" (`reserve-view.tsx:286-291`). Cần đổi input thành "Khác" placeholder.
- **Không có kênh thông báo khách**: `reservation_notification_outbox` có nhưng risk roadmap ghi "marks some messages sent without a real consumer". Không có SMS/Zalo ZNS/email xác nhận, nhắc lịch, nhắc cọc. Đặt bàn không nhắc = no-show cao.
- Không có **waitlist tại quán** (khách đến không đặt trước, chờ bàn) — có trong `docs/roadmap-10-tinh-nang-lon.md` mục 7 nhưng chưa làm.
- Dashboard v2 reservations (573 dòng) là lớp mỏng; timeline/calendar/floor/settings nằm trong Drawer "Quản lý nâng cao" mở legacy `ReservationsWorkspace` (2.699 dòng) — hai hệ UI trong một màn.

### 2.3 Gọi món online (pickup/delivery) — **Khá**

Đường dẫn: `app/r/[slug]/page.tsx` → `components/customer-v2/remote/remote-client-v2.tsx` (1.988 dòng); API `/api/remote-orders*`, `/api/restaurants/[slug]/delivery-quote`, `/api/delivery/fee`, maps (`autocomplete/place-detail/reverse/route/search` qua Nominatim/OSRM/MapLibre, `map_provider_request_logs`), couriers (`delivery_couriers`, `courier_locations`, `delivery_tracking_events`), multi-branch (`store_branches`, `auto_suggest_nearest_branch`).

Điểm mạnh:
- Cấu hình rất phong phú trên `restaurants`: radius/polygon/ward, fee tiers, free radius, min order, ETA, service fee, exclusion zones, PAY_AFTER vs QR_PREPAID. Quote fingerprint + retry + abort controller. Tracking tài xế realtime. Phase 2 đã có prepaid inventory reservation ledger.
- UI mobile: toggle Giao hàng/Đến lấy, tìm món, category hiển thị dưới tên món, nút Hỗ trợ.

Khoảng trống:
- **Không có đặt trước theo giờ (scheduled order)** — quán cafe/bánh cần "lấy lúc 15:00".
- **Session khách là UUID bearer không TTL trong localStorage, kèm PII/GPS** (risk roadmap P2). Cần signed session có hạn.
- **Không có snapshot subtotal/VAT/phí** ổn định trên đơn (risk roadmap P1 4.3); `orders` có `subtotal/discount/delivery_fee/service_fee/total` nhưng không có tax.
- Thông báo cho khách chỉ là Web Push (`push_subscriptions`) — không có SMS/ZNS khi đơn được nhận/đang giao. Tỷ lệ cho phép push trên iOS Safari thấp.
- Không có tích hợp đối tác giao hàng (Ahamove/Grab Express) — quán không có shipper riêng không dùng được delivery.
- Đánh giá đơn (`rating`) là state UI, không có bảng lưu (risk roadmap P2 "loyalty and ratings are UI-only").

### 2.4 Quản lý nhân viên (HR/Staff) — **Khá về phạm vi, Chưa đủ về độ tin cậy**

Đường dẫn: `components/dashboard-v2/real/staff-workspace-v2.tsx` (**4.431 dòng**), `features/staff/*` (staff-operations-workspace 6.649 dòng, staff-redesign-workspace 3.083 dòng), `features/attendance`, `features/shifts`, `features/roles`; 25 bảng `staff_*`/`attendance_*`/`shift*`; PWA staff (`/staff/[slug]/login`, `/dashboard/staff/mobile`, 12 module: home/kitchen/cashier/service/delivery/accounting/marketing/ops/schedule/requests/inbox/profile).

Điểm mạnh:
- Phạm vi rộng hơn đa số đối thủ cùng phân khúc: 8 role hệ thống + ma trận quyền tuỳ biến (Premium), mã NV + mật khẩu app, thiết bị/fingerprint, chấm công GPS/QR/WiFi/manual/offline-sync với anomaly engine, duyệt yêu cầu chấm công, hợp đồng, tài liệu, review, ca mẫu, payroll (giờ/OT/khấu trừ/phiếu lương), incident, activity log, force logout, heartbeat phiên.
- Phase 0 đã đóng lỗ hổng manager-tự-lên-owner (`staff-owner-boundary-service`, migration `20260722100000`); Phase 1 thêm actor session assertion và branch authorization trên toàn bộ admin API.

Khoảng trống:
- **Xếp lịch ca (roster)** mới ở mức "ca mẫu" (`ShiftTemplateModal`) + `shift_assignments`; chưa có lịch tuần kéo-thả, đổi ca, xin nghỉ có duyệt, cảnh báo thiếu người theo giờ cao điểm.
- **Payroll chưa có khung pháp lý VN** (BHXH/BHYT/BHTN, TNCN, lương tối thiểu vùng) — chỉ có hourly + OT multiplier + khấu trừ tự do. Với quán nhỏ, xuất bảng lương để kế toán làm tiếp là đủ; cần ghi rõ giới hạn trong UI.
- File 4.431 dòng cho một workspace, và "Quản lý nâng cao" lại mở thêm legacy `StaffRedesignWorkspace` 3.083 dòng → trải nghiệm hai tầng, khó bảo trì, bundle client nặng.
- Risk roadmap 4.6/4.7 vẫn mở một phần: RLS theo trạng thái nhân sự, revoke GoTrue session khi force logout, payroll transaction/closed period.

### 2.5 Quản lý kho — **Khá (backend Premium tốt), UI hai tầng**

Đường dẫn: `components/dashboard-v2/real/inventory-workspace-v2.tsx` (1.017 dòng) embed legacy `components/dashboard/inventory-workspace-v2.tsx` (**6.430 dòng**) qua Drawer; `services/inventory-service.ts`; engines trong `lib/inventory-*-engine.ts` (alert, analytics, audit, FEFO allocation, purchase planner, branch balancer); bảng: ingredients, ingredient_categories, unit_conversions, inventory_locations, batches, movements, counts, reservations (Phase 2), purchase_orders, suppliers, supplier_items, supplier_price_history, branch_transfers, stock_balances, menu_item_recipes.

Điểm mạnh:
- Mô hình dữ liệu ngang tầm phần mềm kho chuyên dụng: lô/HSD (FEFO), PO + nhà cung cấp + lịch sử giá, điều chuyển chi nhánh, kiểm kê, ledger reservation cho đơn prepaid, khấu trừ định lượng khi accept order (`acceptOrderWithInventoryDeduction`), AI OCR hoá đơn nhập, AI gợi ý PO.
- Gói Pro/Premium đã được thiết kế (`docs/inventory-commercialization-plan.md`) và map vào `featureCatalog` (`inventory_basic`, `inventory_premium`, `inventory_ai_ocr`, `inventory_ai_intelligence`).

Khoảng trống:
- Risk roadmap mục 5 còn mở: CRUD chưa đủ cho conversions/SKU-barcode/supplier defaults/PO approve-cancel/invoice/shipping-discount; alert gộp theo batch thay vì ingredient/location và có thể tái tạo alert đã dismiss.
- **Không có báo cáo food cost / COGS theo món & theo ngày** ở dashboard (có engine analytics nhưng chưa thành màn hình bán được).
- UI: workspace v2 chỉ cover CRUD nguyên liệu + movement nhanh; toàn bộ PO/transfer/count/OCR nằm trong Drawer legacy 6.430 dòng với ngôn ngữ thiết kế khác. Đây là chỗ khách trả Premium sẽ nhìn nhiều nhất.

### 2.6 Menu — **Chưa đủ cho thương mại**

Đường dẫn: `components/dashboard-v2/real/menu-workspace-v2.tsx` (1.194) + `menu/menu-ai.tsx` (540); `services/menu-service.ts`; validator `menuItemSchema` (categoryId, name, price 1.000–100.000.000, image URL).

Điểm mạnh: modifier group phong phú (kind, selection SINGLE/MULTIPLE/QUANTITY, pricing_mode, default), AI Menu Studio/OCR menu, cache admin/public menu, upload ảnh ký (`menu-images/sign`). Menu v2 đã có badge "Hot" từ báo cáo top items, overlay "Tạm hết", toggle bán/tắt, edit inline trong Drawer.

Khoảng trống (đây là domain có ROI/effort tốt nhất để nâng):
- Bảng `menu_items` chỉ có `name/price/image_url/is_available`. Thiếu **mô tả món, `sort_order` cho category và item (đang `order by name`), tag/badge do quán tự đặt, ảnh phụ, đơn vị/định lượng hiển thị, giá theo size không qua modifier, giá theo kênh (tại bàn vs online), giờ bán (menu sáng/tối), món hết trong ngày (sold-out tự bật lại hôm sau)**.
- Không có **combo thật** (chỉ modifier kind COMBO), không có **món liên quan/upsell** trên trang khách (roadmap mục 5).
- Không có **import/export CSV/Excel** để onboard 200 món; chỉ có AI OCR.
- Không có **menu engineering** (phân loại Star/Plowhorse/Puzzle/Dog theo margin × popularity) dù đã có recipe + cost.

### 2.7 Thanh toán, hoá đơn, tuân thủ — **Chưa đủ (chặn thương mại)**

- **VietQR**: `lib/vietqr.ts` build URL `img.vietqr.io` (bank/account/addInfo). Không có webhook ngân hàng/cổng (Casso, SePay, PayOS, VNPay, MoMo, ZaloPay). Xác nhận hoàn toàn thủ công qua dashboard/Telegram. Với quán 200 bill/ngày, đây là nút thắt lao động và sai sót.
- **Hoá đơn điện tử**: không có tích hợp nhà cung cấp HĐĐT (MISA meInvoice, Viettel SInvoice, VNPT, EasyInvoice). Nghị định 70/2025/NĐ-CP (hiệu lực 01/06/2025) yêu cầu HKD nộp thuế khoán doanh thu ≥ 1 tỷ/năm bán trực tiếp cho người tiêu dùng phải dùng HĐĐT khởi tạo từ máy tính tiền — đúng phân khúc quán cafe/nhà hàng đang nhắm. Thiếu cái này → nhiều quán không thể chọn LogiVN làm phần mềm bán hàng chính.
- **In**: chỉ có in poster QR (`lib/qr-poster.ts`). Không in bill khách, không in phiếu bếp/tem ly. Bếp phải nhìn màn hình KDS; quầy không đưa được bill giấy.
- **POS tại quầy**: không có cách để nhân viên tạo đơn cho khách không quét QR (`/api/admin/orders` chỉ GET; `order-service` không có create-by-staff). Quán nào cũng có ≥ 30% khách gọi trực tiếp.
- **VAT/thuế**: không có trường thuế trên bill/order.

### 2.8 Billing SaaS (LogiVN thu tiền quán) — **Khá**

`lib/billing/*`, `services/billing/*`, `saas_plans`, `plan_entitlements`, `restaurant_subscriptions`, `subscription_payment_logs`, webhook `/api/billing/webhook` có HMAC + idempotency + amount/currency check, cron `subscriptions`, trial claims, upgrade events, platform admin duyệt thanh toán qua Telegram. Cũng là chuyển khoản VietQR + duyệt tay. Đủ cho pilot; cần tự động hoá khi > 100 tenant (cùng một tích hợp cổng thanh toán với mục 2.7).

---

## 3. UI/UX, frontend, layout, responsive

### 3.1 Điểm mạnh (đã kiểm chứng bằng screenshot)

- **Dashboard v2** (`components/dashboard-v2/*`): sidebar 6 nhóm, top search ⌘K, KPI cards, FilterTabs, DataTable/card grid, Drawer/Modal, "Dòng hành động" realtime bên phải. Mobile: KPI 2 cột, card thay bảng, bottom nav 5 tab + FAB. Token riêng `dashboard-tokens-v2.css`. Chất lượng thị giác ổn, nhất quán, đọc được ở 390px.
- **Customer v2**: token `customer-tokens-v2.css`, ShopShell/TopBar/StickyCartBar/BottomSheet dùng chung 3 luồng, touch target ≥ 44px, sticky search/category, bottom sheet giỏ hàng có ghi chú từng món. Landing v2 mobile tốt (hero, CTA lớn, proof points).
- Có `docs/frontend-responsive-audit-2026-05-11.md` và `docs/dashboard-v2-ui-audit.md` làm nền.

### 3.2 Vấn đề

| # | Vấn đề | Bằng chứng | Ảnh hưởng |
| --- | --- | --- | --- |
| U1 | **Hai hệ UI trong một màn** ("Quản lý nâng cao" mở legacy workbench trong Drawer) | inventory (6.430 dòng legacy), reservations (2.699), staff (3.083), live-action-center (778) | Trải nghiệm đứt gãy, bundle nặng, hai design language |
| U2 | **CSS monolith** | `app/globals.css` 12.667 dòng + 4 file token (v2 dashboard, v2 customer, design-tokens-v2, design-tokens-v3) | Khó bảo trì, dễ xung đột, không tree-shake |
| U3 | **Client-heavy** | 218 file `"use client"`, nhiều file 2.000–6.600 dòng | TTI chậm trên điện thoại giá rẻ (đối tượng nhân viên quán) |
| U4 | Dead code lớn | 68 file / 29k dòng unreachable: `components/customer/{order,remote-order,reservation}-client.tsx`, `components/landing/logivn-landing.tsx`, `components/dashboard/{orders-board,menu-workspace,tables-workspace,onboarding-form,payments-workspace,kitchen-board,promotions-workspace,online-workspace,dashboard-nav,app-shell,...}`, `components/billing/*` (13 file), `components/dashboard-v2/real/billing-v2.tsx` | Gây nhầm cho dev mới, tăng thời gian build/lint, che giấu bug |
| U5 | Placeholder ảnh món chiếm diện tích lớn | screenshot dine-in/remote | Menu không ảnh nhìn "trống" |
| U6 | Bug pill số khách "2 4 6 8 2" | `reserve-view.tsx:286-291` | Lộ với mọi khách đặt bàn |
| U7 | Không có i18n | `<html lang="vi">`, không next-intl | Không bán được cho khu du lịch |
| U8 | Không có E2E/visual regression | không có Playwright/Cypress; CI chỉ lint/tsc/unit | Redesign lớn (v1→v2) không có lưới an toàn UI |
| U9 | Accessibility chưa audit | không có axe/lighthouse-ci trong CI (có `lighthouse` devDependency) | Rủi ro contrast/focus trên nút cam/nền kem |
| U10 | Landing v3 và onboarding preview song song v2 | `components/landing-v3/*` (18 file), `/preview/landing-v3` | Quyết định dở dang, tốn bảo trì |

---

## 4. Kiến trúc, bảo mật, độ tin cậy

Tham chiếu chính: `docs/full-project-risk-roadmap-2026-07-22.md` (NO-GO) và commit `8641825`, `4d5a393`.

**Đã đóng trên `main` (theo commit message + test mới):** canonical owner + owner boundary; revoke DML tài chính trực tiếp; composite tenant FK `(restaurant_id, bill_id)`; RPC order/reservation atomic có lock; branch authorization trên admin API; inventory reservation ledger; `public-order-privacy` redaction; Next 16.3.4 + audit fixes một phần.

**Còn mở (xác nhận bằng mã):**
- 5 VPS worker stub (`infra/vps/services/workers/{order,payment,inventory,reservation,staff}-worker.mts` trả `processed: true`).
- `npm audit`: 7 high.
- Không có E2E; test PostgreSQL rehearsal skip vì thiếu `DATABASE_URL`.
- `allow_legacy_qr` default `true`.
- Customer session không TTL/không ký.
- Backup/PITR: `MIGRATION_LOG.md` và `MASTER_RELEASE_STATUS.md` đều ghi PITR `false`, VPS "No backups found".
- 147 bảng / 145 migration, `supabase/schema.sql` được đánh dấu là snapshot legacy → cần "schema truth" tái tạo từ DB thật.

Đánh giá: kiến trúc **service layer + RPC + RLS + outbox** là đúng hướng cho multi-tenant. Rủi ro nằm ở việc chưa có **môi trường staging giống production để chứng minh**, không phải ở thiết kế.

---

## 5. Khoảng cách so với sản phẩm thương mại cùng phân khúm (VN)

So với các POS/QR-ordering phổ biến cho quán cafe/nhà hàng nhỏ ở Việt Nam, LogiVN **vượt** ở: đặt bàn có cọc + lock bàn, kho lô/HSD/PO, HR/chấm công/payroll, AI ops, multi-branch, Telegram ops. LogiVN **thiếu** những thứ khách hàng coi là mặc định:

| Năng lực | Đối thủ điển hình | LogiVN |
| --- | --- | --- |
| Đối soát VietQR tự động | Có (qua cổng/ngân hàng) | Không (xác nhận tay) |
| Hoá đơn điện tử (NĐ 70/2025) | Có | Không |
| In bill / in bếp / tem | Có | Không |
| POS tại quầy + QR song song | Có | Chỉ QR |
| Tách/gộp bill, chuyển bàn | Có | Không |
| Khách hàng thân thiết / tích điểm | Có | Không |
| Menu có mô tả/ảnh/thứ tự/sold-out | Có | Rất mỏng |
| Đặt trước giờ lấy | Có | Không |
| Thông báo SMS/ZNS | Có | Không |
| Đa ngôn ngữ menu | Một phần | Không |

Kết luận: để **bán được**, ưu tiên phải là *đóng bảng trên*, không phải thêm AI.

---

## 6. Danh sách nâng cấp theo lĩnh vực (ưu tiên P0/P1/P2, ước lượng effort)

Effort: S ≤ 3 ngày, M ≤ 2 tuần, L ≤ 1 tháng, XL > 1 tháng (1 dev).

### 6.1 Thanh toán, hoá đơn, POS (chặn thương mại)
- **P0 · L** — Tích hợp một cổng đối soát VietQR có webhook (ưu tiên nhà cung cấp có VietQR động + webhook chuyển khoản, VD PayOS/SePay/Casso; chọn sau khi so sánh phí và điều kiện đăng ký cho HKD). Ghi `payment_logs.status=confirmed` tự động, giữ nút xác nhận tay làm fallback. Áp dụng cho cả bill khách và billing SaaS.
- **P0 · L** — Đơn tạo bởi nhân viên (POS tại quầy): `POST /api/admin/orders` + UI trong Orders v2 / staff PWA module `cashier`, gắn vào cùng `table_bills`; hỗ trợ mang đi.
- **P0 · M** — In: template bill khách 58/80mm + phiếu bếp (HTML print CSS, sau đó WebUSB/Bluetooth ESC-POS hoặc bridge app); nút in trên payments/kitchen v2.
- **P1 · L** — Hoá đơn điện tử: adapter pattern (`services/einvoice/*`) với 1 nhà cung cấp đầu (MISA meInvoice hoặc Viettel SInvoice), phát hành từ bill đã thanh toán, lưu mã CQT, xử lý huỷ/điều chỉnh.
- **P1 · M** — Tách/gộp bill, chuyển bàn, giảm giá thủ công có lý do + quyền, VAT (%) trên restaurant + snapshot trên bill.

### 6.2 QR ordering tại bàn
- **P1 · M** — Menu item mở rộng (xem 6.6) hiển thị trên trang khách: mô tả, badge, sold-out, thứ tự.
- **P1 · S** — Ảnh placeholder tốt hơn theo category + tên món to; lazy-load ảnh với `sizes` đúng.
- **P1 · S** — Đổi default `allow_legacy_qr=false` cho tenant mới; banner nhắc quán cũ rotate QR.
- **P2 · M** — i18n menu khách (VI/EN) bằng cột `name_i18n jsonb` + toggle ngôn ngữ; landing/dashboard giữ VI.
- **P2 · S** — Gọi lại đơn cũ ("Gọi thêm như lần trước"), lọc theo dị ứng/chay.

### 6.3 Đặt bàn
- **P0 · S** — Sửa pill số khách (`reserve-view.tsx:286-291`): input thành "Khác" chỉ hiện khi không thuộc 2/4/6/8.
- **P1 · L** — Consumer thật cho `reservation_notification_outbox`: Zalo ZNS (xác nhận, nhắc trước 2h, nhắc cọc) + email fallback; retry/dead-letter; dashboard trạng thái gửi.
- **P1 · M** — Waitlist tại quán (khách walk-in chờ bàn): hàng đợi, ước tính chờ, gọi khách qua SMS/ZNS, chuyển thành seat.
- **P2 · M** — Gộp timeline/calendar/floor từ legacy vào Reservations v2 (bỏ Drawer legacy).

### 6.4 Gọi món online
- **P1 · M** — Đặt trước theo giờ (`scheduled_for`), giờ mở/đóng nhận đơn theo ngày, giới hạn đơn/slot.
- **P1 · M** — Customer session ký + TTL; realtime topic authorize cùng session (risk roadmap Phase 1.4).
- **P1 · S** — Snapshot subtotal/phí/VAT/khuyến mãi lên `orders` (immutable sau khi tạo).
- **P2 · L** — Adapter giao hàng bên thứ ba (Ahamove/GrabExpress) để quán không có shipper vẫn bật delivery.
- **P2 · S** — Lưu rating thật (`order_reviews`) thay vì state UI.

### 6.5 Nhân viên
- **P1 · L** — Lịch ca tuần (roster) kéo-thả trên desktop, xem ca trên PWA, đổi ca/xin nghỉ có duyệt, cảnh báo thiếu người.
- **P1 · M** — Hoàn tất risk roadmap 4.6/4.7: RLS theo employment status, revoke GoTrue session khi force logout, payroll period đóng bất biến; test ma trận role×branch.
- **P1 · M** — Xuất bảng lương/chấm công Excel theo mẫu kế toán VN; ghi rõ trong UI "chưa tính BHXH/TNCN".
- **P2 · L** — Tách `staff-workspace-v2.tsx` (4.431 dòng) thành module: members / attendance / approvals / shifts / payroll / devices; gộp phần còn dùng từ `staff-redesign-workspace` rồi xoá legacy.

### 6.6 Menu
- **P0 · M** — Migration mở rộng `menu_items`: `description`, `sort_order`, `tags text[]`, `is_sold_out_today`, `available_from/until`, `image_urls jsonb`, `unit_label`; `menu_categories.sort_order`, `is_active`; cập nhật service/cache/validators/public menu (đổi `order by name` → `sort_order`).
- **P0 · M** — Menu v2: kéo-thả thứ tự, bulk on/off, sold-out nhanh (1 chạm, tự bật lại ngày mai), import/export CSV.
- **P1 · M** — Combo thật (`menu_combos` + lines) và giá theo kênh (dine-in vs online).
- **P2 · M** — Menu engineering (margin từ recipe × số bán) + gợi ý upsell trên trang khách.

### 6.7 Kho
- **P1 · L** — Hoàn tất CRUD còn thiếu (unit conversions, SKU/barcode, supplier defaults, PO approve/cancel/receive partial, invoice/shipping/discount); sửa alert theo ingredient/location, không tái tạo alert đã dismiss.
- **P1 · M** — Báo cáo COGS/food cost theo ngày và theo món; variance kiểm kê.
- **P2 · XL** — Chuyển dần PO/transfer/count/OCR từ legacy 6.430 dòng vào Inventory v2 theo từng tab; xoá legacy khi hết importer.

### 6.8 CRM / Loyalty (mới, doanh thu tăng thêm)
- **P1 · L** — `customers` (phone làm khoá, opt-in), tích điểm theo bill, voucher sinh nhật, lịch sử mua; hiển thị "khách quen" cho nhân viên; không cần app (theo `docs/roadmap-10-tinh-nang-lon.md` mục 4).

### 6.9 Frontend platform
- **P0 · S** — Xoá 68 file dead code (danh sách mục 3.2 U4) sau khi chạy `tsc`/`lint`/`test`; trước đó chuyển `RouteMiniMap` và `CustomerAiAssistant` (còn dùng) ra khỏi `components/customer/`.
- **P1 · L** — Tách `app/globals.css`: giữ reset/base, đưa phần landing/dashboard/customer về CSS module hoặc token file tương ứng; loại bỏ token v3 nếu không dùng.
- **P1 · M** — Server Components cho các trang đọc-nhiều (analytics, payments list, menu list); `next/dynamic` cho Drawer nặng; đo bằng `lighthouse` + `@next/bundle-analyzer`.
- **P1 · M** — Playwright E2E: 6 luồng (QR order → accept → pay; online delivery quote → order; reserve → seat; staff login → clock-in; owner menu edit; billing). Chạy trong CI với Supabase local (`supabase start`) hoặc project staging.
- **P2 · S** — `lighthouse-ci` + `axe` cho `/`, `/r/[slug]/table/[id]`, `/dashboard` (mobile budget: LCP < 2.5s trên Moto G4 profile).
- **P2 · S** — Quyết định landing v3: merge hoặc xoá.

### 6.10 Vận hành, bảo mật, release
- **P0 · M** — Staging Supabase (branch hoặc project riêng) + `supabase db push --dry-run` trong CI; chạy `reservation-db-rehearsal.test.ts` và bộ two-tenant RLS exploit trên staging.
- **P0 · S** — Bật PITR hoặc lịch `pg_dump` mã hoá hằng ngày + restore rehearsal có ghi chép; VPS backup có bằng chứng.
- **P0 · S** — `npm audit fix` cho 7 high (không `--force`), cô lập breaking upgrade.
- **P1 · L** — Thay 5 worker stub bằng implementation thật hoặc gỡ khỏi hàng đợi; dead-letter + dashboard queue lag.
- **P1 · S** — Sentry/OTel cho API route + client (chưa thấy trong repo), alert Telegram khi payment mismatch/cron trễ.
- **P1 · S** — Onboarding atomically tạo system roles + owner `staff_members` (risk roadmap mục 5 cuối).

---

## 7. Đối chiếu với tài liệu hiện có

| Tài liệu | Trạng thái so với `main` hôm nay | Cách dùng |
| --- | --- | --- |
| `docs/full-project-risk-roadmap-2026-07-22.md` | Phase 0/1/2 đã land mã; Phase 3–5 và toàn bộ *bằng chứng* (rehearsal, backup, E2E) còn mở | Là nguồn sự thật cho **Giai đoạn A** dưới đây; không viết lại |
| `docs/roadmap-10-tinh-nang-lon.md` | Thứ tự ưu tiên 1–3 (hoá đơn nâng cao, KDS, đối soát) vẫn đúng; KDS đã có `kitchen-workspace-v2`; đối soát chưa làm | Mục 6.1/6.8 kế thừa |
| `docs/inventory-commercialization-plan.md` | Packaging Pro/Premium đã vào `featureCatalog`; phần CRUD/alert còn dở | Mục 6.7 kế thừa |
| `docs/dashboard-v2-handoff.md` | 14 route đã v2; caveat "legacy embed trong Drawer — KHÔNG xoá" là quyết định tạm | Mục 6.5/6.7/3.2-U1 đề xuất lộ trình gộp và xoá |
| `docs/frontend-responsive-audit-2026-05-11.md`, `docs/dashboard-v2-ui-audit.md` | Phần lớn phát hiện đã xử lý bởi v2 | Giữ làm baseline; thêm E2E/visual để không tái phát |
| `MASTER_RELEASE_STATUS.md` | "GO" 2026-05-30 là cho một deploy cụ thể trước audit 07-22; không phản ánh NO-GO sau đó | Cần một mục mới sau Giai đoạn A |
| `MIGRATION_LOG.md` | Snapshot lệch (đã sửa trong PR này) | Giữ test `database-reliability-audit` làm guard |

---

## 8. Lộ trình thực thi đề xuất (14–18 tuần, 2–3 dev + 1 QA bán thời gian)

Nguyên tắc: mỗi giai đoạn kết thúc bằng một **gate có bằng chứng** (không phải checklist tự khai). Dọn nợ kỹ thuật đi *theo workspace* cùng lúc với tính năng của workspace đó, không làm một PR "refactor toàn bộ".

### Giai đoạn A — Nền tin cậy (tuần 1–3) · *điều kiện để nhận tiền*
1. Staging Supabase + CI dry-run + chạy rehearsal test và two-tenant RLS suite (6.10).
2. Backup/PITR + restore rehearsal có biên bản; `npm audit` xanh ở mức high.
3. Xoá dead code (6.9-P0), sửa bug pill số khách (6.3-P0), `allow_legacy_qr=false` mặc định (6.2-P1-S).
4. Playwright smoke 6 luồng chạy trong CI (6.9-P1).
5. Sentry/OTel + alert cơ bản.

**Gate A:** CI xanh gồm E2E; two-tenant exploit suite fail đúng; có artifact backup + restore log; risk roadmap Phase 0 acceptance criteria tick hết. Cập nhật `MASTER_RELEASE_STATUS.md`.

### Giai đoạn B — Bán được cho quán cafe 1 điểm (tuần 3–8)
1. Đối soát VietQR tự động qua cổng (6.1-P0) — dùng chung cho billing SaaS.
2. POS tại quầy + in bill/phiếu bếp (6.1-P0).
3. Menu mở rộng + Menu v2 (sort, sold-out, CSV) (6.6-P0).
4. Tách/gộp bill, chuyển bàn, giảm giá, VAT (6.1-P1).
5. Thông báo đặt bàn qua ZNS/email (6.3-P1) và đặt trước giờ cho online (6.4-P1).

**Gate B:** 10–20 quán pilot trả phí; đo: % bill tự đối soát ≥ 95%, thời gian từ quét QR → bếp nhận < 60s p95, 0 sự cố tài chính. **Đây là điểm bắt đầu thương mại hoá có kiểm soát.**

### Giai đoạn C — Tuân thủ và giữ chân (tuần 8–12)
1. Hoá đơn điện tử (6.1-P1) — bắt buộc để bán cho HKD ≥ 1 tỷ/năm và mọi doanh nghiệp.
2. CRM/loyalty không cần app (6.8).
3. Customer session ký + snapshot đơn (6.4-P1).
4. Staff: roster + hoàn tất 4.6/4.7 + export lương (6.5-P1).

**Gate C:** phát hành HĐĐT thành công trên môi trường test của nhà cung cấp; ma trận quyền role×branch có test; churn pilot < 10%/tháng.

### Giai đoạn D — Kho Premium và chuỗi (tuần 12–16)
1. Kho: CRUD còn thiếu + COGS report (6.7-P1).
2. Gộp legacy inventory/reservations/staff vào v2 theo tab, xoá legacy (3.2-U1).
3. Tách `globals.css`, RSC hoá trang đọc-nhiều, budget Lighthouse mobile (6.9-P1/P2).
4. Worker thật thay stub + queue dashboard (6.10-P1).

**Gate D:** gói Premium có ≥ 5 khách trả; không còn Drawer legacy; LCP mobile `/r/[slug]/table/[id]` < 2.5s trên profile Moto G4 (Lighthouse CI).

### Giai đoạn E — Mở rộng thị trường (tuần 16+)
i18n menu khách, adapter giao hàng bên thứ ba, combo/giá theo kênh, menu engineering, landing v3 quyết định, mobile app wrapper cho staff (PWA đã đủ cho pilot).

---

## 9. Rủi ro của kế hoạch và cách giảm

| Rủi ro | Giảm thiểu |
| --- | --- |
| Tích hợp cổng thanh toán/HĐĐT phụ thuộc thủ tục đăng ký pháp nhân | Bắt đầu đăng ký ở tuần 1 song song Giai đoạn A; dùng sandbox nhà cung cấp |
| Xoá dead code/legacy làm hỏng luồng chưa có test | Chỉ xoá sau khi E2E smoke chạy trong CI (Gate A) và theo từng workspace |
| Migration `menu_items`/`orders` trên DB production không có PITR | Không chạy migration schema mới trước khi Gate A đóng backup |
| Team nhỏ, phạm vi rộng | Không mở Giai đoạn C trước khi Gate B có khách trả tiền; AI features đóng băng (đã đủ) |
| Tài liệu trôi (như `MIGRATION_LOG.md`) | Giữ các test "docs-as-contract"; thêm test cho `MASTER_RELEASE_STATUS.md` có mục mới sau mỗi gate |

---

## 10. Việc đã thay đổi trong PR kèm tài liệu này

- `MIGRATION_LOG.md`: cập nhật "Current Snapshot" đúng với `main` (145/145/0, commit `4d5a393`) → test `database-reliability-audit` xanh trở lại.
- `next.config.ts`: thêm `allowedDevOrigins` (dev-only) để Next 16 không chặn HMR/RSC khi mở dev server qua IP loopback hoặc tunnel preview — trước đó trang render nhưng không hydrate. Không ảnh hưởng production.
- `.hoplite/settings.json`: script setup/run/check cho sandbox preview.

Không có thay đổi hành vi sản phẩm nào khác trong PR này; toàn bộ mục 6–8 là kế hoạch chờ quyết định.
