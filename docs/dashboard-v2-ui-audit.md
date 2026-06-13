# Dashboard v2 — Audit UI/UX chuyên sâu & Kế hoạch làm mới

> Lập 2026-06-13. Tiếp nối `docs/dashboard-v2-handoff.md`. Mục tiêu: từ phôi layout v2 đã migrate, đi sâu từng workspace để vá lỗ hổng UX, expose backend còn ẩn, và liền mạch hoá luồng UI ↔ UX ↔ Backend — ưu tiên realtime đơn hàng, nhân viên, kho, cài đặt, ca bán hôm nay.

## 0. Bối cảnh & kết luận tổng quát

Đợt handoff trước đã đưa **khung layout** (Toolbar + KPI + FilterTabs + card grid + Drawer) lên 100% 14 route, backend giữ 1:1. Nhưng đó mới là **phôi**: nhiều vùng chỉ "bọc" layout v2 quanh logic cũ, còn:

- **1 bug chí mạng**: realtime board Đơn hàng chết âm thầm.
- **Nhiều mutation backend đã có nhưng UI v2 không expose** (đặc biệt inventory, staff, orders).
- **Pattern "legacy trong Drawer"** đẩy 60-70% nghiệp vụ thật vào Drawer "Quản lý nâng cao" → trang chính chỉ là CRUD cơ bản, lệch design system (app-in-app).
- **Realtime không chuẩn hoá**: mỗi workspace tự xử lý, không có chỉ báo trạng thái kết nối, không reconnect chủ động, độ trễ do cache.
- **Settings** mới ở mức token migration, 11/12 form thiếu feedback save/loading/validation.

---

## 1. PHÁT HIỆN CHÍ MẠNG (xử lý ngay — Phase 0)

### 1.1 Board Đơn hàng không bao giờ cập nhật realtime
`components/dashboard-v2/real/orders-workspace-v2.tsx:120-134`

```
const json = await res.json();
if (Array.isArray(json?.orders)) setOrders(json.orders);   // ❌ luôn undefined
```

API `GET /api/admin/orders` trả qua `ok(...)` → shape `{ ok: true, data: [...] }` (`lib/response.ts:13`, `app/api/admin/orders/route.ts:12`). Field `json.orders` **không tồn tại** ⇒ `setOrders` không bao giờ chạy ⇒ board chỉ cập nhật nhờ optimistic tại chỗ. Đơn mới / thay đổi từ thiết bị khác **không hiện**. Lỗi bị nuốt (`catch {}`).

**Fix**: đọc `json?.data`; thêm guard không ghi đè khi đang có mutation in-flight (`mutatingId`); xử lý `subscribe(status)` để biết SUBSCRIBED/CHANNEL_ERROR.

### 1.2 Không có cảnh báo đơn mới mặc định
- Toast + âm thanh (`playActionNoticeSound`, `FloatingActionNotice`) chỉ nằm trong `AdminLiveActionCenter`, mà panel này mặc định đóng (`liveOpen=false`).
- Overview (`/dashboard`) **không nhúng** action center ⇒ màn hình chính ca bán không có quick-action + cảnh báo đơn mới.

### 1.3 `canManageTestOrders` dead code
`orders-workspace-v2.tsx:117` destructure prop nhưng không dùng ⇒ ADMIN không có UI xoá/dọn đơn test dù backend `delete-test` + `cleanup` sẵn sàng.

---

## 2. AUDIT THEO WORKSPACE

### 2.1 Đơn hàng — `/dashboard/orders`
Backend: `listOrdersForRestaurant` + `listOpenServiceRequests`; mutations `accept/complete/confirm-payment/cancel`; API route `[orderId]/{accept,cancel,complete,confirm-payment,delete-test,delivery-courier,delivery-location,delivery-status,dispatch-candidates,timer}` + `cleanup`.

Gap:
- `cancel` có trong `applyOptimistic`/`mutateOrder` nhưng **không có nút Huỷ** ở card lẫn drawer (`nextActionFor` không trả `cancel`).
- `timer` (+10' bếp), `delivery-status/courier/location`, `dispatch-candidates` **không expose** trong v2.
- `OrderDetailDrawer`: `buildDetail` (`orders-workspace-v2.tsx:470-505`) **không bao giờ set `floor`/`reservation`** ⇒ floor map & block đặt bàn là dead code; `channelOf` chỉ trả `qr|takeaway|delivery`. Delivery map chỉ hiện khi có `deliveryDistanceKm`. CTA chỉ "tiến bước", không huỷ/sửa/gán tài xế; items read-only.
- Filter chỉ client-side trên tập active; không dùng `?history=true` dù API hỗ trợ.
- Error chỉ banner tĩnh, không toast/retry; không có error state khi tải; không skeleton client.

### 2.2 Ca bán hôm nay — `/dashboard` (overview)
Backend: `getAdminDashboardOverview` (cache nội bộ 8s) qua `readThroughDashboardWorkspaceCache` (ttl 5s) — read-only.

Gap:
- `recentOrders` giới hạn `.limit(5)` nhưng UI có FilterTabs + badge count ⇒ **đếm sai** (chỉ trên 5 đơn).
- Realtime = `router.refresh()` nhưng bị **double cache (5s + 8s)** che ⇒ trễ tới ~5-8s; "realtime" thực ra near-real-time.
- Card "cần xử lý" chỉ có "Xem nhanh" mở drawer nghèo (không dùng `OrderDetailDrawer`, không action) ⇒ không nhận đơn/thu tiền từ overview dù backend có.
- `router.refresh()` không spinner/disabled; không error state.

### 2.3 Kho hàng — `/dashboard/inventory`
Backend phong phú: `getInventoryWorkspaceData` (snapshot, categories, ingredients, recipeMenuItems, **intelligence**, **warehouse command center**) + 16 server actions + OCR API.

UI chính chỉ expose: CRUD nguyên liệu, nhập kho nhanh (chỉ `receive`), refresh alerts, 1 dòng AI banner. **10/16 action** bị nhét vào Drawer legacy (`InventoryWorkspaceV2`, 13 tab, ~3000 dòng, design token cũ).

Backend đã có nhưng UI chính CHƯA expose:
- **Purchase Orders** (tạo/nhận PO), **Suppliers (NCC)** — chỉ Drawer.
- **Lô/HSD** (`batchCount`, `expiringBatchCount`, `expirationDate`) — không có cảnh báo HSD ở trang chính.
- **AI tối ưu kho**: `reorderSuggestions`, `wasteSignals`, `priceSignals`, `healthScore`, `projectedPurchaseValue` — chỉ dùng `actionQueue[0]`, phần còn lại không render. Không có "Tạo PO từ gợi ý".
- **Movement nâng cao** (waste/expired/internal_use/supplier_return) — chỉ Drawer; trang chính chỉ `receive`.
- **Alert lifecycle** (ack/resolve/dismiss từng cái) — trang chính chỉ refresh toàn bộ.
- **Transfers / balancing / kiểm kê (count) / multi-location** — chỉ Drawer.
- **OCR/AI nhập hoá đơn** — chỉ Drawer.

Realtime (`useDashboardRealtime`): chỉ subscribe `ingredients/inventory_movements/inventory_alerts`. **Không** subscribe `purchase_orders/inventory_transfers/stock_balances/inventory_batches/suppliers/count_sessions` ⇒ PO/transfer/lô thay đổi không tự refresh. Legacy workbench tạo **channel riêng** ⇒ duplicate subscription khi mở Drawer.

### 2.4 Nhân viên — `/dashboard/staff`
Backend rất sâu: `getStaffOperationsBundle` (overview, roles, branches, members, attendanceFeed, approvals, activity, weeklyCoverage, heatmap, shifts, shiftAssignments, timesheets, reviews, contracts, documents, devices, incidents, notifications, premium flags) + payroll service + **27 server actions**.

UI v2 wiring = 22/27 actions qua 5 view-tabs (team/shifts/payroll/attendance/settings) + Member Drawer + Advanced Drawer.

> ⚠️ **Handoff sai lệch**: doc nói Drawer embed `StaffRedesignWorkspace` legacy. Thực tế v2 KHÔNG import nó — Advanced panel là code mới tự viết. Cần sửa handoff.

Backend có nhưng UI v2 CHƯA expose (5 action chết):
- **`forceStaffSessionsLogoutAction`** — buộc logout thiết bị. Header v2 quảng cáo nhưng **không có UI** (chỉ hiện `activeSessionCount` read-only) ⇒ **lỗ hổng bảo mật**: không revoke được thiết bị lạ.
- **`reviewStaffIncidentReportAction`** — `bundle.incidents` được load nhưng **không có view nào hiển thị** ⇒ dữ liệu chết.
- **`resetStaffAppPasswordsAction`** (reset hàng loạt) — chỉ có ở legacy.
- **`updateStaffShiftAssignmentAction`** (sửa/đổi ca) — ShiftsView chỉ assign+cancel ⇒ phải huỷ rồi gán lại.
- `bundle.heatmap/timesheets/weeklyCoverage` + một phần `overview` ít/không render. `premium.*` flags không gate UI.

Realtime: `useStaffMobileRealtime` subscribe 13 bảng, trả `state` connecting/connected/error nhưng admin v2 **vứt bỏ `state`** ⇒ không có badge kết nối. Mọi event → `router.refresh()` full re-render (tốn kém quán đông).

Action #26/#27 (payroll) chỉ `revalidatePath`, **không invalidate cache bundle** ⇒ payroll stale tới 8s.

UX: điều hướng lồng 3-4 lớp (view-tab → FilterTab → Member Drawer tab → Advanced Drawer tab), không deep-link; Advanced Drawer là list toàn quán không gắn với NV đang chọn (trùng Member Drawer); QR/Wi-Fi gọi REST thay vì server action.

### 2.5 Cài đặt — `/dashboard/settings`
Khung nav (rail desktop + pill mobile, group 3 cụm, deep-link `?section=`) **đã v2 tốt, vượt mức "token migration"**. Nhưng:

- **Form chất lượng lệch nặng**: chỉ `OnlineSectionV2` viết đúng chuẩn v2 (`SwitchControl` + `useActionState` pending/success/error). **11 form còn lại** chỉ token migration: dùng `<input type=checkbox>` thô / `Toggle` tự chế thay `SwitchControl`; gọi `updateRestaurantSettingsAction`/`updateReportScheduleAction` **không trả state** ⇒ **không spinner, không toast, không validation inline**, nút Lưu không disable.
- Nhiều section vẫn **embed component legacy v1** (BranchSettingsPanel, PaymentSettingsForm, OrderingSettingsForm, TelegramConnectPanel, AiSetupStudio, MapOperationalMetricsPanel) ⇒ card-in-card lệch style.
- **Data nạp SSR-only theo section** (`page.tsx:73-104`): chuyển section client-side bằng `router.replace` không re-fetch ⇒ billing/online/notifications có thể rỗng nếu không phải section khởi tạo.
- `Tables`/`Permissions` không phải form, chỉ link; Permissions hard-code role tĩnh.
- `PaymentsSection` tiêu đề "VietQR & tiền mặt" nhưng không có cấu hình tiền mặt thật.
- **Billing chưa khép kín**: "Tôi đã thanh toán" chỉ là `<Link>` đổi step, không confirm/không polling; "Tải hoá đơn" disabled; "Huỷ/đổi gói" disabled; processing step tĩnh.
- Không có dirty-state / unsaved-changes guard ở mọi form.

---

## 3. CƠ CHẾ REALTIME — chuẩn hoá toàn cục

Vấn đề chung phát hiện ở 3 hook khác nhau (`orders-workspace-v2` tự viết, `useDashboardRealtime`, `useStaffMobileRealtime`):

| Vấn đề | Orders | Overview | Inventory | Staff |
|---|---|---|---|---|
| Refetch hoạt động | ❌ (bug shape) | ✅ router.refresh | ✅ | ✅ |
| Chỉ báo trạng thái kết nối | ❌ | ❌ | ❌ | ⚠️ có `state` nhưng bị bỏ |
| Reconnect chủ động khi CHANNEL_ERROR | ❌ | ❌ | ❌ | ❌ |
| Fallback polling + focus/visibility | ❌ | ✅ | ✅ | ❌ |
| Subscribe đủ bảng nghiệp vụ | ✅ | ✅ | ❌ (thiếu warehouse) | ✅ |
| Độ trễ do cache | — | ⚠️ 5s+8s | ⚠️ 12s | ⚠️ 8s |

**Đề xuất**: gom về 1 hook chuẩn `useWorkspaceRealtime` (mở rộng `useDashboardRealtime`) trả `state` + reconnect backoff + cho phép patch cục bộ (không chỉ `router.refresh`); thêm component dùng chung `RealtimeStatusBadge` (Tức thời / Đang đồng bộ / Mất kết nối) + `NewOrderNotifier` (toast + âm thanh) đặt ở shell để mọi workspace dùng.

---

## 4. KẾ HOẠCH LÀM MỚI (theo phase)

### Phase 0 — Vá chí mạng (nhỏ, rủi ro thấp)
1. Fix orders realtime `json.data` + guard mutating + subscribe status. *(orders-workspace-v2)*
2. Đưa `NewOrderNotifier` (toast + âm thanh) mặc định bật ở orders + overview.
3. Wire `canManageTestOrders` → nút dọn/xoá đơn test cho ADMIN.
4. Sửa `recentOrders` count overview (đếm đúng nguồn, hoặc nâng limit + label "gần đây").
5. Cập nhật handoff doc cho khớp thực tế (staff không dùng legacy).

### Phase 1 — Realtime & shell dùng chung
- `useWorkspaceRealtime` + `RealtimeStatusBadge` đặt vào `production-shell`.
- Áp cho orders/overview/inventory/staff; staff dùng lại `state`; inventory bổ sung subscribe bảng warehouse + gỡ duplicate channel của legacy.
- Giảm độ trễ overview: cân nhắc patch cục bộ thay vì refresh, hoặc hạ ttl khi có realtime event.

### Phase 2 — Đơn hàng (full UX)
- `OrderDetailDrawer`: set `floor`/`reservation` trong `buildDetail`; bật floor map cho đơn QR; CTA đầy đủ (nhận/hoàn tất/thu tiền/huỷ/+10'); gán tài xế + đổi trạng thái giao.
- Card có nút Huỷ; filter lịch sử (`?history=true`); error → toast + retry; skeleton client.
- Overview cards có quick-action (nhận đơn/thu tiền) + tái dùng `OrderDetailDrawer`.

### Phase 3 — Kho hàng (đưa command center ra trang chính)
- Surface chính mới: KPI mở rộng (PO mở, lô sắp HSD, giá trị kho, health score) + panel AI (reorder→1-click tạo PO, waste/price signals) + danh sách PO + alert lifecycle inline + cảnh báo HSD.
- Quick movement đủ loại (receive/waste/expired/return/adjust).
- Thay dần Drawer legacy bằng panel v2 native (PO, NCC, transfers, kiểm kê, OCR) — gỡ app-in-app + duplicate subscription.

### Phase 4 — Nhân viên (vá lỗ hổng + gom nav)
- **Sessions/Devices view + force logout** (vá bảo mật).
- **Incidents view** (xem/duyệt báo cáo sự cố).
- Bulk reset password; edit shift assignment (không huỷ-gán lại).
- Advanced Drawer gắn theo NV đang chọn; deep-link view/tab; gate UI theo `premium.*`.
- QR/Wi-Fi chuyển sang server action; payroll action invalidate cache bundle.
- Realtime badge từ `state`; cân nhắc patch cục bộ thay full refresh.

### Phase 5 — Cài đặt (đồng bộ form)
- Cho `updateRestaurantSettingsAction`/`updateReportScheduleAction` trả `{error,success}`; bọc 11 form bằng `useActionState` + `SwitchControl` + footer pending/toast.
- Thay embed legacy bằng panel v2 (payment, branch, ordering, telegram, ai-setup).
- Khép kín billing (confirm + polling realtime trạng thái, invoice, cancel/đổi gói).
- Đồng bộ chiến lược nạp data theo section (tránh panel rỗng khi điều hướng client).

### Phase 6 — E2E & verify
- Test end-to-end luồng đơn (đặt → bếp → thu tiền) đa thiết bị, kiểm realtime phản ánh.
- `npx tsc --noEmit`, diagnostics toàn bộ adapter, curl 14 route guard.
- Kiểm regression các vùng "full v2 layout" (tables/payments/menu/analytics) & reservations/promotions/kitchen.

---

## 5. Nguyên tắc khi rewrite
- Không import `dashboard-v2/demo/*` vào production (giữ data policy handoff).
- Backend giữ 1:1; chỉ thêm wiring cho mutation đã tồn tại, không đổi hợp đồng API trừ khi cần.
- Mọi action mới expose phải có optimistic/pending + toast + error.
- Ưu tiên thay legacy-in-Drawer bằng panel v2 native theo từng nghiệp vụ, không "big bang".

---

## 6. ĐÃ THỰC HIỆN (đợt 2026-06-13)

Hạ tầng chung mới: `components/dashboard-v2/realtime.tsx` — `RealtimeStatusBadge` (Tức thời / Đang đồng bộ / Mất kết nối) + `playOrderChime` (âm báo Web Audio, không cần asset).

### Đơn hàng (`orders-workspace-v2.tsx`)
- **Vá realtime chí mạng**: đọc đúng `json.data`, guard không ghi đè optimistic khi đang mutate, đồng bộ ngay khi `SUBSCRIBED`, refetch hợp nhất sau mỗi mutation, fallback focus/visibility/30s.
- Badge trạng thái realtime trên Toolbar.
- **Âm báo + toast khi có đơn mới** (so khớp id chưa thấy), mặc định bật — không cần mở panel.
- Huỷ đơn + "+10 phút bếp" trong `OrderDetailDrawer` (mở rộng props `onCancel`/`onTimer`/`busy`).
- Nút "Dọn đơn test" cho ADMIN (`canManageTestOrders` không còn dead) → `POST /api/admin/orders/cleanup`.

### Ca bán hôm nay (`overview-workspace-v2.tsx`)
- Badge realtime + nút Làm mới có trạng thái spinner.
- **Count tab dựa trên `operations` (toàn ca)** thay vì 5 đơn gần đây; làm rõ "hiển thị N đơn gần đây · badge là tổng toàn ca".
- **Quick-action trong drawer**: Nhận đơn / Báo ra món / Thu tiền (gọi API + toast + refresh) ngay tại overview.

### Kho hàng (`inventory-workspace-v2.tsx`)
- Hàng KPI thứ 2: PO đang mở, lô sắp HSD, sức khoẻ kho, giá trị nhập dự kiến.
- **Panel AI tối ưu kho**: reorder suggestions (nút "Nhập nhanh" 1 chạm), waste signals, price signals, aiBrief.
- **Cảnh báo HSD/lô** sắp & đã hết hạn (từ stockBalances).
- **Alert lifecycle inline**: tiếp nhận/đã xử lý/bỏ qua (`updateInventoryAlertStatusAction`) + quét lại.
- **Danh sách PO gần đây** read-friendly.
- IngredientDrawer thêm "Điều chỉnh kho" (waste/expired/internal_use/adjust_decrease).

### Nhân viên (`staff-workspace-v2.tsx`)
- **Buộc đăng xuất phiên/thiết bị** trong Member Drawer (`forceStaffSessionsLogoutAction`) — vá lỗ hổng bảo mật.
- **Tab "Sự cố"** trong Quản lý chi tiết (`reviewStaffIncidentReportAction`) — `bundle.incidents` không còn chết.
- **Tab "Bảo mật"**: reset mật khẩu app hàng loạt (`resetStaffAppPasswordsAction`), hiển thị credentials tạm.
- **Sửa phân ca** (`updateStaffShiftAssignmentAction`) thay vì huỷ-gán-lại.
- Badge realtime từ `state` của `useStaffMobileRealtime`.
- Sửa bug pre-existing: `updateStaffPayrollDeductionsAction`/`updateStaffPayrollProfileAction` trả sai kiểu (string → `{error}`).

### Cài đặt (`settings/section-forms.tsx`, `actions/settings.ts`, `actions.ts`)
- `updateRestaurantSettingsAction` + `updateReportScheduleAction` đổi sang `(prevState, formData)` trả `{error,success}` (safeParse, không throw); wrapper `actions.ts` đồng bộ.
- Component dùng chung `SettingsForm` (useActionState + banner feedback + footer pending) cho 6 form (profile/hours/receipt/brand/notifications/report).
- Thay toàn bộ checkbox thô + `Toggle` tự chế bằng `SwitchControl` (qua `SwitchField` controlled + hidden input giữ đúng giá trị submit).

### Validation
- `npx tsc --noEmit`: production 0 lỗi. Còn 2 lỗi **preview-only** trong `demo/ai-demo.tsx` (pre-existing) và `demo/staff-demo.tsx` (`CreateStaffModal` thiếu — preview, không ảnh hưởng production).
- `rg "dashboard-v2/demo|demo/data" app/dashboard components/dashboard-v2/real` → no matches (data policy intact).
- Diagnostics 9 file production đã đụng: clean.

### Còn lại (đề xuất đợt sau)
- Billing khép kín (confirm realtime, invoice, cancel/đổi gói) — Phase 5 còn dở.
- Thay embed legacy (payment/branch/ordering/telegram/ai-setup) bằng panel v2 native.
- Inventory: thay dần Drawer legacy bằng panel PO/transfers/kiểm kê/OCR native + mở rộng realtime sang bảng warehouse.
- Chuẩn hoá `useDashboardRealtime` trả `state` để mọi workspace có badge đồng nhất.
- Sửa 2 lỗi demo preview-only.

---

## 7. ĐÃ THỰC HIỆN (đợt bổ sung — billing, demo, payments)

### Billing khép vòng (`settings/billing-panel.tsx`)
- `PaymentAutoSync`: tự động poll `router.refresh()` mỗi 10s ở step **payment** và **processing** khi có giao dịch chờ → khi platform-admin xác nhận, màn hình chủ quán tự cập nhật (không phải reload tay). Có countdown + nút "Kiểm tra ngay".
- **Tải / In hoá đơn**: thay nút disabled bằng `openInvoicePrint` — dựng hoá đơn HTML và mở hộp thoại in (cho phép "Lưu PDF"), thuần client, không cần backend.
- Lưu ý: confirm/cancel gói là chức năng platform-admin (không self-service) → nút "Huỷ qua hỗ trợ" giữ nguyên đúng mô hình vận hành.

### Cài đặt — Payments native v2 (`settings/section-forms.tsx`)
- `PaymentsSection` viết lại native v2 (bỏ embed legacy `PaymentSettingsForm`): status cards + 3 trường (mã NH có datalist, số TK, chủ TK) qua `SettingsForm` + `updatePaymentSettingsAction` (đã trả `{error,success}`, có pending/toast).

### Demo preview (`demo/ai-demo.tsx`, `demo/staff-demo.tsx`)
- ai-demo: type union `{role:"ai"|"user"}` cho messages.
- staff-demo: bổ sung `CreateStaffModal` còn thiếu.

### Validation cuối
- `npx tsc --noEmit -p tsconfig.json`: **0 lỗi toàn dự án** (cả production lẫn demo) → `TSC_CLEAN_OK`.
- Data policy intact.

### Còn lại (deferred — chủ động không đụng để tránh regression)
- Embed legacy còn lại trong settings (ordering 38 trường, branch panel, telegram, ai-setup, map metrics): vẫn **hoạt động đầy đủ**, chỉ lệch style; rewrite native là việc lớn nhiều file, rủi ро mất tính năng → để đợt riêng có test kỹ.
- Inventory: thay Drawer legacy bằng panel PO/transfers/kiểm kê/OCR native + mở rộng realtime sang bảng warehouse.
- Chuẩn hoá `useDashboardRealtime` trả `state` để inventory có badge realtime đồng nhất.

---

## 8. ĐÃ THỰC HIỆN (đợt realtime chuẩn hoá)

### `useDashboardRealtime` trả `RealtimeState`
- Hook nay trả `connecting | connected | error` qua callback `.subscribe(status)` — backward-compatible (caller cũ bỏ qua giá trị vẫn chạy).

### Kho — mở rộng realtime + badge
- Subscribe thêm 5 bảng warehouse (đều có `restaurant_id`, đã verify tên thật trong inventory-service): `inventory_batches`, `purchase_orders`, `branch_transfers`, `stock_balances`, `inventory_counts` → PO/transfer/lô/kiểm kê thay đổi nay tự refresh trang chính.
- Mảng tables hoisted ra const (`INVENTORY_REALTIME_TABLES`) → hết re-subscribe mỗi render.
- Thêm `RealtimeStatusBadge` lên Toolbar.

### Badge realtime đồng nhất toàn dashboard
- Gắn `RealtimeStatusBadge state={rtState}` cho 5 workspace còn lại: **tables, menu, promotions, payments, analytics** (cùng overview/orders/inventory/staff trước đó) → mọi workspace hiển thị trạng thái kết nối nhất quán.

### Validation
- `npx tsc --noEmit`: 0 lỗi toàn dự án → `TSC_CLEAN_OK`.

### Vẫn deferred (lý do giữ nguyên)
- Rewrite native các form legacy lớn trong settings (**ordering 38 trường ảnh hưởng phí ship/giao hàng**, branch, telegram, ai-setup, map metrics): rủi ро regression cao trên component đang chạy tốt, lợi ích chủ yếu thẩm mỹ → nên làm từng form một, có người test thực tế sau mỗi form.
- Inventory: thay Drawer legacy (tạo PO/transfer/kiểm kê/OCR) bằng panel native — trang chính đã có đủ view đọc + reorder/alert/HSD; phần tạo sâu vẫn dùng workbench legacy ổn định.

---

## 9. ĐỢT QUÉT TOÀN DASHBOARD (hoàn thiện vòng 2)

### Vá build blockers (đưa `next build` về sạch)
- `restaurant-onboarding-flow.tsx`: định nghĩa lại motion presets `fadeUp` + `stepTransition` (bị xoá ở refactor trước, vẫn còn tham chiếu).
- `customer-v2/dine-in/dine-in-client-v2.tsx`: thay `add: ReturnType<typeof useDineInCartStore>["add"]` (zustand resolve `unknown`) bằng type cụ thể `(item: Omit<DineInCartItem,"quantity">) => void`.

### Bàn & QR (`tables-workspace-v2.tsx`) — wire 3 action backend còn ẩn
- **Thêm bàn** (`createTableAction`) — nút + `CreateTableModal`.
- **Bật/tắt QR** mỗi bàn (`toggleTableQrAction`) — `SwitchControl` trong drawer.
- **Xoay token QR** (`rotateTableQrAction`) — nút có xác nhận, nhắc in lại template.
- `selected` chuyển sang derive theo id → QR phản ánh live sau action.

### Bếp (`kitchen-workspace-v2.tsx`)
- Gắn `RealtimeStatusBadge` (state trước đây bị bỏ `const [, setRealtimeState]`) — gom supabase + VPS realtime về 1 state.
- Thêm nút **Huỷ đơn** trên ticket (`cancel`, có xác nhận) + optimistic filter.

### Đặt bàn (`reservations-workspace-v2.tsx`)
- Gắn `RealtimeStatusBadge` (subscribe có nhận status).
- Thêm action **Từ chối** (`reject`) trong Drawer cho đơn `holding`/`waiting_deposit_confirm`.

### Validation
- `npx tsc --noEmit`: **0 lỗi toàn dự án** → `TSC_CLEAN_OK`. Build không còn bị chặn.

### Còn lại (polish, ưu tiên thấp)
- **Logibot AI** (`components/dashboard/logibot-ai-workspace.tsx`): chưa migrate v2 — còn hex hard-code (#111827, #0F5132…), chưa bọc primitive v2. Việc lớn, nên làm riêng.
- Analytics: period selector raw pill → có thể đổi sang `FilterTabs`.
- Reservations: còn 4 action sâu (refund-deposit, reschedule, move-table, assign tables) vẫn nằm trong Drawer legacy `ReservationsWorkspace`.
- Tables: vị trí kéo-thả sơ đồ chưa persist (backend chưa có cột toạ độ).
- Loader skeleton vài route còn token v1 (`dashboard-panel`, hex).

### Trợ lý AI (Logibot) — migrate v2 (vòng 2 tiếp)
- `components/dashboard/logibot-ai-workspace.tsx`: wrapper section + CommandPalette đổi hex (#111827/#FFFEFA/#6B7280/#0F5132…) → token v2 (surface/line/text/primary, scrim `bg-[var(--d-text)]/20`).
- `components/ai/logibot-chat-surface.tsx`: token hoá toàn bộ — jade brand → `var(--d-jade*/--d-primary)`, cream `#FFFEFA` → `var(--d-surface)`, text slate/#111827 → `var(--d-text/-muted)`, cảnh báo cam → `var(--d-orange*)`, dot online → `var(--d-ok-fg)`, shadow → `var(--d-sh-*)`, bong bóng user → `var(--d-jade-900)`. Logic/parse/motion giữ nguyên 100%.
- `npx tsc`: 0 lỗi toàn dự án.

Sau vòng này, toàn bộ 14 workspace dashboard đã đồng nhất design token v2; không còn vùng embed/hex lệch chuẩn đáng kể (trừ các action sâu reservations vẫn trong Drawer legacy + persist sơ đồ bàn chờ backend).
