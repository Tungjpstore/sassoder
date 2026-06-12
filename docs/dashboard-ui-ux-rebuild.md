# LogiVN Dashboard — Phân tích UI/UX & Đề xuất rebuild

> Phạm vi: toàn bộ `app/dashboard/*` (~29 workspace), shell, navigation,
> drawer/overlay/modal, design system. Nguồn: rà soát trực tiếp từ shell,
> nav, primitives và sub-agent khảo sát sâu các workspace đại diện.

## 1. Bức tranh hiện tại

### 1.1 Kiến trúc khung
- `app/dashboard/layout.tsx` mỏng, shell thật là `AdminShell` (sidebar 232px + tablet rail 76px + topbar + content).
- Mỗi page theo pattern `requireDashboardAccess` → `<AdminShell>` → `<Suspense>` → workspace client component.
- Có `components/dashboard/primitives.tsx` (`DashboardPanel`, `DashboardSectionHeader`, `DashboardPageHero`, `DashboardMetricCard`, `DashboardEmptyState`) — nhưng dùng rời rạc.

### 1.2 Quy mô CSS
- `app/globals.css` ~8.000 dòng, scope `.stitch-admin`.
- Hệ thống nền "glass surface trên wallpaper" (background image + lớp kính) bằng nhiều `!important` để đè màu Tailwind (`.bg-white`, `.bg-slate-50`, `.text-slate-700`...).
- Token màu/khoảng cách có nhưng song hành với hex/Tailwind raw → dễ trôi khi đổi theme.

## 2. Vấn đề chính (theo mức độ ưu tiên)

### P0 — Phân mảnh hệ thống overlay
Có một nền tảng dùng chung tốt nhưng chỉ áp dụng một nửa:
- **Chuẩn (tốt):** `use-dashboard-overlay.ts` (ref-count khóa scroll + portal), `dialog-focus.ts` (focus trap, Esc, Tab, restore), `shared-drawer.tsx` (`DashboardDrawer`), `confirm-dialog.tsx`.
- **Đi riêng (nợ kỹ thuật):**
  - `command-palette.tsx` — tự dựng portal/backdrop; ⌘K dispatch synthetic KeyboardEvent (hack).
  - `dashboard-nav.tsx` — bottom-sheet mobile tự `createPortal`, hardcode `z-[90]`.
  - `dashboard-quick-actions-fab.tsx` — popover riêng, click-catcher trong suốt, **không** focus-trap, **không** scroll-lock.
  - `live-action-center.tsx` — 3 bề mặt nổi riêng (dropdown, card xl bottom-right, toast notice), không focus-trap.
  - 3 bề mặt AI khác nhau: `ai-assistant-dock`, `dashboard-copilot-layer` (framer-motion), `logibot-ai-workspace` (framer-motion) — lib animation và tint backdrop không đồng nhất.
- **Va chạm góc nổi:** FAB (bottom-left `md:left-[236px]`) và copilot + AI dock (cùng bottom-right, cùng pill 14h) sẽ chồng nếu mount đồng thời.
- **Backdrop loạn:** `drawer-backdrop` vs `bg-[#111827]/22` vs `bg-[#F8F7F4]/98` vs `bg-slate-900/70` vs trong suốt.

### P1 — Hai hệ tiêu đề trang cạnh tranh
- `AdminShell` có `title`/`subtitle`, nhưng payments/promotions tự dựng `admin-hero-panel`; `DashboardPageHero` lại là bản bọc thứ ba. Page header không nhất quán.

### P1 — Primitive bị bỏ qua
- `analytics/page.tsx` (~2.136 dòng) tự vẽ bar chart, donut conic-gradient, "table" bằng div — không dùng primitive nào; donut hardcode `bg-white` (vỡ dark mode).
- `settings/page.tsx` gộp 12 form, lặp markup input thủ công thay vì `@/components/ui/input`.
- `DashboardMetricCard` tồn tại nhưng analytics tự viết lại stat tile → 2 bản dễ trôi.

### P2 — Skeleton copy-paste
- `OrdersBoardSkeleton`, `MenuWorkspaceSkeleton`, `InventoryWorkspaceSkeleton`, `TablesWorkspaceSkeleton` gần giống nhau nhưng định nghĩa lại mỗi page; fill khác nhau (`bg-[#A9C5A1]/14` vs `/18`) — hex raw + opacity tùy tiện.

### P2 — Màu hardcode bỏ token (rủi ro dark mode)
`bg-[#A9C5A1]/18`, `bg-white` (donut), `bg-slate-900/70`, `bg-[#111827]/22`, `bg-[#F8F7F4]/98`, `text-[#A95712]`/`bg-[#FFF2DF]` (badge Premium), `from-[#0F4D3A]...to-[#F28C28]` (banner settings).

### P2 — Component khổng lồ, khó restyle
- orders-board ~2.000 dòng, menu-workspace ~1.500, tables-workspace ~1.400, analytics ~2.136, settings gộp 12 form — trộn data + state + markup drawer + trình bày trong một file.

### P3 — Dead code & migration dở
- `inventory-workspace.tsx` (v1) không được import ở đâu; page dùng `inventory-workspace-v2.tsx`. Mùi migration chưa dọn.

### P3 — Khác
- Bảng/chart không có primitive chung (`grid-cols-[...]` hardcode mỗi bảng).
- A11y: drawer/confirm/palette tốt; FAB, live-action, AI dock thiếu focus-trap; chart/table div trong analytics thiếu semantic role/text alternative.
- Copy tiếng Việt hardcode inline, chưa có lớp i18n.

## 3. Định hướng rebuild

### 3.1 Nguyên tắc
1. **Một hệ overlay duy nhất:** gom tất cả về `Overlay` family (`Drawer`/`Modal`/`Sheet`/`Popover`) trên nền `use-dashboard-overlay` + `useDialogFocusTrap`. Bỏ bottom-sheet nav riêng, FAB popover riêng, live-action floats riêng; hợp nhất 3 bề mặt AI thành một.
2. **Một hệ tiêu đề trang:** chọn `DashboardPageHero` (hoặc AdminShell title) làm chuẩn duy nhất, bỏ cái còn lại.
3. **Bắt buộc dùng primitive:** panel, hero, metric tile, section header, empty state — thêm `DataTable` + `Chart` để xóa hand-roll ở analytics.
4. **Token-only:** xóa hex/Tailwind raw, fix luôn dark mode ngầm vỡ.
5. **Tách component lớn:** chia orders/menu/tables/analytics/settings thành sub-component theo vùng.

### 3.2 Design system mục tiêu
- **Token brand thống nhất với landing v2:** jade `#0F4D3A`, orange `#F28C28`, ivory, charcoal, sage — dùng chung biến với `design-tokens-v2.css` để dashboard và landing đồng bộ nhận diện.
- **Bề mặt:** bỏ wallpaper + glass `!important`; dùng nền phẳng `--surface`/`--surface-2` sạch, shadow nhẹ layered (như landing). Giảm tải GPU, dễ đọc, dễ dark mode.
- **Typography:** Sora cho heading, Inter cho body, JetBrains Mono cho số liệu (`metric-number`) — đồng bộ landing.
- **Spacing/radius/shadow:** dùng thang 8pt + radius/shadow token của v2.
- **Density:** thêm chế độ "compact" cho màn vận hành nhiều dữ liệu (orders/kitchen) để hiển thị nhiều hơn mà vẫn thoáng.

### 3.3 Information architecture (nav)
Giữ 5 nhóm hiện tại nhưng chuẩn hóa:
- **Hôm nay:** Tổng quan.
- **Vận hành:** Đơn hàng · Bếp · Bàn & QR · Thanh toán.
- **Bán hàng:** Đặt online · Đặt bàn · Khuyến mãi.
- **Quản lý:** Menu · Kho · Nhân viên.
- **Hệ thống:** Báo cáo · Cài đặt.
- **AI:** gom 10 route `ai-*` rời rạc về một trung tâm AI duy nhất (hub + tab), thay vì rải khắp. Đây là điểm rối nhất hiện tại.

### 3.4 Overlay family đề xuất
| Loại | Dùng cho | Nền tảng |
| --- | --- | --- |
| `Drawer` (right) | Chi tiết đơn, sửa món, chi tiết bàn | shared-drawer (đã có) |
| `Sheet` (bottom) | Menu mobile, quick actions | overlay + focus-trap |
| `Modal` (center) | Confirm, form ngắn | confirm-dialog mở rộng |
| `Popover` | Live action, notification, account | overlay nhẹ, không scroll-lock |
| `CommandPalette` | ⌘K điều hướng | giữ, bỏ hack synthetic event |
| `AISurface` | 1 bề mặt AI duy nhất | hợp nhất copilot/dock/logibot |

## 4. Lộ trình triển khai (theo phase, an toàn từng bước)

### Phase 0 — Nền tảng (không đổi giao diện người dùng thấy)
- Tạo `dashboard-tokens-v2.css` kế thừa brand từ `design-tokens-v2.css`.
- Dựng overlay family chuẩn + `DataTable` + `Chart` primitive.
- Xóa dead code `inventory-workspace.tsx` v1.

### Phase 1 — Shell & nav
- Rebuild `AdminShell` (sidebar, tablet rail, topbar) trên token mới, bỏ wallpaper/glass `!important`.
- Chuẩn hóa một hệ page-header.
- Gom AI hub.

### Phase 2 — Workspace vận hành (ưu tiên cao, dùng nhiều nhất)
- Orders → Kitchen → Tables → Payments. Tách component lớn, áp primitive + overlay chuẩn.

### Phase 3 — Quản lý & bán hàng
- Menu, Inventory, Staff, Online, Reservations, Promotions.

### Phase 4 — Hệ thống & AI
- Analytics (thay hand-roll chart bằng `Chart`), Settings (gom form về `ui/input`), AI hub.

### Phase 5 — Dọn dẹp
- Xóa CSS `!important` thừa, hex hardcode; rà dark mode; kiểm a11y toàn bộ overlay.

## 5. Rủi ro & lưu ý
- `globals.css` 8.000 dòng rất dễ gây regression — rebuild theo scope mới `[data-ds="v2"]` song song, không sửa trực tiếp lớp cũ cho tới khi cắt chuyển.
- Component lớn (orders/menu) ôm nhiều logic nghiệp vụ — tách phải giữ nguyên hành vi, có test thủ công từng workspace.
- AI hub gom 10 route là thay đổi IA lớn — cần xác nhận với bạn trước khi đụng routing.

## 6. Đề xuất bước kế tiếp
Tôi đề xuất bắt đầu **Phase 0 + Phase 1** trên một nhánh scope riêng để bạn xem trước shell mới, trước khi đụng vào từng workspace. Cho tôi biết muốn bắt đầu từ đâu.
