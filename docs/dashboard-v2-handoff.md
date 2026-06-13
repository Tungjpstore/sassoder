# Dashboard v2 Handoff

> Cập nhật 2026-06-12. Tất cả 14 production route đã đồng bộ layout 100% v2 (Toolbar + KPI + FilterTabs + card grid + Drawer). Backend giữ nguyên 1:1.

## Production migration state

| # | Workspace | Pattern | Backend wiring |
|---|---|---|---|
| 1 | `/dashboard` (Ca bán hôm nay) | Full v2 rewrite | `getAdminDashboardOverview` + Supabase realtime + AI insight builders |
| 2 | `/dashboard/orders` | Full v2 rewrite | `listOrdersForRestaurant` + Supabase realtime + 4 mutations (`accept`/`complete`/`confirm-payment`/`cancel`) + `AdminLiveActionCenter` qua Drawer |
| 3 | `/dashboard/kitchen` | Full v2 rewrite | `listKitchenOrdersForRestaurant` + Supabase + VPS realtime + 3 mutations |
| 4 | `/dashboard/tables` | Full v2 layout | `listTablesWithStatus`, `listActiveTableBranches` |
| 5 | `/dashboard/payments` | Full v2 layout | `getRestaurantAdminDashboard`, `getAdminReport` |
| 6 | `/dashboard/online` | Full v2 rewrite | `getOnlineOrderingDashboard` + Supabase realtime + `OrderingSettingsForm` |
| 7 | `/dashboard/reservations` | Full v2 rewrite | `getReservationSettings`, `listReservationsForRestaurant`, `getReservationAnalytics` + Supabase + 5 action endpoints + legacy bảng nâng cao trong Drawer |
| 8 | `/dashboard/menu` | Full v2 layout | `listMenuForAdmin`, `getAdminReport` |
| 9 | `/dashboard/inventory` | Full v2 rewrite | `getInventoryWorkspaceData` + Supabase realtime + `recordInventoryMovementAction` + `refreshInventoryAlertsAction` + legacy workbench trong Drawer |
| 10 | `/dashboard/promotions` | Full v2 rewrite | 5 server actions giữ nguyên hidden inputs |
| 11 | `/dashboard/analytics` | Full v2 layout | `getRestaurantAdminDashboard`, `getAdminReport` |
| 12 | `/dashboard/settings` | Token migration | 12 forms, 3 server actions (`updateRestaurantSettingsAction`, `updateReportScheduleAction`, `requestSubscriptionPaymentAction`) |
| 13 | `/dashboard/staff` | Full v2 rewrite | `getStaffOperationsBundle` + mobile realtime + 24/27 staff actions (team/shifts/payroll/attendance/settings + Member Drawer + Advanced Drawer: HĐLĐ/tài liệu/đánh giá/thiết bị/sự cố/bảo mật/role). KHÔNG còn dùng `StaffRedesignWorkspace` legacy |
| 14 | `/dashboard/logibot-ai` | Token-aligned | `LogibotChatSurface` (chat shell sử dụng v2 design tokens) |

## Pattern guide

### Full v2 rewrite (10 workspace)
Adapter viết lại hoàn toàn theo demo v2: Toolbar + KPI + FilterTabs + card grid + Drawer/Modal.
- `overview`, `orders`, `kitchen`, `online`, `reservations`, `inventory`, `promotions`, `staff`

### Full v2 layout đã có sẵn (4 workspace)
Đã ở grid v2 từ trước, chỉ thêm Toolbar:
- `tables`, `payments`, `menu`, `analytics`

### Token migration (1 workspace)
Sửa class legacy trong route file thành token v2:
- `settings` (hero panel + section grid + section header + section card)

### Token-aligned (1 workspace)
Chat surface tự thiết kế nhưng dùng v2 tokens:
- `logibot-ai`

## Backend preserved

Khi rewrite, các adapter giữ nguyên 1:1:

| Workspace | Mutations / Actions | Realtime |
|---|---|---|
| overview | — (read-only KPI) | Supabase orders/order_items |
| orders | `POST /api/admin/orders/:id/{accept,complete,confirm-payment,cancel}` (optimistic) | Supabase orders/order_items |
| kitchen | `POST /api/admin/orders/:id/{accept,complete,timer}` (optimistic + cache) | Supabase + VPS realtime |
| online | `OrderingSettingsForm` server action + `OnlineOrderingActions` | Supabase orders + menu |
| reservations | `POST /api/admin/reservations/:id/{confirm-deposit,check-in,seat,cancel,no-show}` + legacy 9 mutations + 3 preflights trong Drawer | Supabase reservations |
| inventory | `recordInventoryMovementAction`, `refreshInventoryAlertsAction` + legacy 15 actions trong Drawer | Supabase ingredients/movements/alerts |
| promotions | `createPromotionAction`, `updatePromotionAction`, `deletePromotionAction`, `togglePromotionAction`, `togglePromotionDisplayAction` (hidden inputs khớp tên) | — |
| staff | `resetStaffAppPasswordAction`, `setStaffAccountStateAction` + legacy 22 actions trong Drawer | `useStaffMobileRealtime` |

Pattern "**legacy trong Drawer**" cho reservations/inventory/staff: Toolbar + KPI + danh sách dense ở trang chính (95% use case hằng ngày). Khi cần các flow ít dùng (transfers, contracts, multi-view calendar, OCR, settings), bấm nút "Quản lý nâng cao/chi tiết" mở Drawer chứa legacy workspace có đầy đủ mọi mutation. Người dùng vẫn có toàn bộ feature, layout chính thì 100% theo demo v2.

## Data policy (do not violate)

- Production `/dashboard/*` MUST NOT import từ `components/dashboard-v2/demo/*` hay `demo/data.ts`.
- Verified clean: `rg "dashboard-v2/demo|demo/data" app/dashboard components/dashboard-v2/real` không match.
- Adapter trong `components/dashboard-v2/real/*` nhận DTO từ loader/legacy; không tự import mock.
- `/preview/dashboard-v2` vẫn dùng `components/dashboard-v2/demo/*` cho demo preview.

## Existing real v2 adapters

`components/dashboard-v2/real/`:
- `analytics-workspace-v2.tsx`
- `inventory-workspace-v2.tsx` (full v2 rewrite + legacy workbench trong Drawer)
- `kitchen-workspace-v2.tsx` (full v2 rewrite)
- `menu-workspace-v2.tsx`
- `online-workspace-v2.tsx` (full v2 rewrite)
- `orders-workspace-v2.tsx` (full v2 rewrite + AdminLiveActionCenter trong Drawer)
- `overview-workspace-v2.tsx` (full v2 rewrite)
- `payments-workspace-v2.tsx`
- `promotions-workspace-v2.tsx` (full v2 rewrite)
- `reservations-workspace-v2.tsx` (full v2 rewrite + legacy ReservationsWorkspace trong Drawer)
- `staff-workspace-v2.tsx` (full v2 rewrite + StaffRedesignWorkspace trong Drawer)
- `tables-workspace-v2.tsx`

## Validation gates

- `npx tsc --noEmit -p tsconfig.json`: 0 lỗi production. 1 lỗi pre-existing trong `demo/ai-demo.tsx` (preview-only).
- `rg "dashboard-v2/demo|demo/data" app/dashboard components/dashboard-v2/real` → no matches.
- Curl 14 routes → tất cả 307/308 (route guard intact).
- Diagnostics tất cả 12 adapter v2 + route file: clean.

## Known caveats

- File `payments-workspace-v2.tsx` đã sửa lỗi PaymentMethod (`"cash"` → `"CASH"`, `"qr"` → `"QR"`).
- File `components/dashboard/inventory-workspace.tsx` (v1) đã xoá vì zero importers.
- File `components/dashboard/dashboard-client-layout.tsx` (879 dòng dead code) đã xoá.
- Legacy components `ReservationsWorkspace`, `StaffRedesignWorkspace`, `InventoryWorkspaceV2`, `AdminLiveActionCenter` vẫn còn (được embed trong Drawer "Quản lý nâng cao") — KHÔNG xoá.
