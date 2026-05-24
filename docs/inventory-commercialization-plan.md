# LogiVN Inventory Commercialization Plan

Date: 2026-05-12
Status: Accepted for P0

## Goal

Hoan thien P0 cho tinh nang quan ly kho hang cua LogiVN o muc do du quyet dinh de doi co the bat dau P1 ma khong phai mo lai cac cau hoi nen tang ve:

- tinh nang nay ban cho ai
- ban o goi nao
- gia tri kinh doanh can chung minh la gi
- pham vi v1 gom nhung gi
- tieu chi nao moi duoc xem la san sang pilot va san sang thuong mai

Khi P0 ket thuc, doi co mot huong di thong nhat cho product, engineering, AI va rollout.

## Scope

P0 nay bao gom:

- packaging va commercial positioning cho inventory
- KPI van hanh va KPI kinh doanh can dat
- pham vi v1 va non-goals
- sequence tu P1 den GA
- acceptance gates cho tung phase
- pilot plan va release gates

P0 nay khong bao gom:

- migration schema thuc te
- UI implementation
- API/server action implementation
- supplier portal day du
- multi-warehouse enterprise flow

## Product Positioning

Inventory cua LogiVN khong duoc dong khung la "so kho" thong thuong. Tinh nang nay can duoc dinh vi la:

- inventory + recipe costing cho F&B nhe
- gop nhat van hanh menu, bep, order va kho trong cung mot dashboard
- giup chu quan tranh het hang, tranh lech kho, nhin duoc food cost va duoc AI goi y hanh dong

Pain point can giai quyet:

- ban ra nhung khong biet da ton bao nhieu nguyen lieu
- mon ban chay nhung lai an vao bien loi nhuan
- ton kho ly thuyet va ton thuc te lech nhau
- nhan vien tu tam an mon het hang, khong co audit ro rang
- chu quan khong biet can nhap them gi truoc gio cao diem

## Target Segments

### Segment 1: Cafe va quan nuoc 1 dia diem

- 20-80 SKU
- recipe don gian nhung suat ban cao
- can theo doi sua, bot, topping, ly/coc, syrup
- rat phu hop cho v1

### Segment 2: Quan an va nha hang nho 1 dia diem

- 40-150 SKU
- recipe nhieu thanh phan hon
- can food cost, stockout va kiem ke cuoi ngay
- phu hop cho v1 neu UI de setup

### Segment 3: Chuoi nho 2-5 chi nhanh

- can so sanh dinh muc va lech kho theo chi nhanh
- gia tri cao nhung khong nen la pham vi day du cua v1

## Commercial Packaging

### Pro

Ban goi co inventory co ban:

- ingredient catalog
- recipe theo mon
- nhap/xuat/dieu chinh co ban
- auto deduct theo order
- low-stock alerts
- food cost co ban theo mon

### Premium

Ban goi inventory nang cao + AI:

- inventory copilot
- reorder suggestion
- variance analysis
- stockout prediction light
- waste insight
- advanced inventory reports

## Decision

- `inventory_management` la feature gate chinh cho module kho.
- Pro duoc phep dung inventory co ban de gia tri du ro ngay tu lan dau ban.
- Premium la lop gia tri AI va phan tich nang cao, khong giam inventory thanh mot tinh nang chi danh cho enterprise.

## Success Metrics

### KPI van hanh cua khach hang

- giam so lan het nguyen lieu gay tat mon
- giam chenh lech kiem ke cuoi ngay
- giam thoi gian kiem ke va ghi dieu chinh kho
- tang ty le mon co recipe day du
- nhin duoc food cost cho top mon ban chay

### KPI kinh doanh cua LogiVN

- tang conversion tu Pro len Premium nhom co van hanh thuc
- tang retention cua quan co 40+ SKU
- tang usage cua AI owner assistant qua inventory workflows
- tao duoc 2-3 case study pilot co so lieu cu the

## Commercial Readiness Targets

Ban thuong mai v1 can co kha nang dat duoc:

- 80% mon ban chay cua quan pilot co recipe
- 90% inventory movements duoc audit ro actor + reason
- 90% low-stock alerts la hop le khi doi pilot review
- setup inventory co ban xong trong <= 60 phut cho quan nho
- kiem ke cuoi ngay hoan tat trong <= 15 phut voi 30-50 ingredient chinh

## v1 Scope

v1 phai co:

- route `/dashboard/inventory`
- ingredient va ingredient category
- menu recipe
- inventory ledger append-only
- inventory on-hand snapshot
- nhap kho, xuat kho, dieu chinh, hao hut
- session kiem ke + variance
- auto deduct theo order lifecycle
- low-stock va stockout warnings
- food cost theo mon
- AI inventory intent va inventory actions co confirm

v1 khong lam:

- purchase order workflow phuc tap
- supplier invoices
- lot/batch/han su dung day du
- multi-warehouse transfer workflow
- scan barcode enterprise
- forecasting theo machine learning nang

## Delivery Phases

### P1. Domain Foundation

- schema, RLS, indexes, generated types
- inventory services, validators, permissions, entitlement
- route shell va navigation

Gate qua P2:

- co the CRUD ingredient va recipe trong tenant scope
- co inventory ledger va audit data doc duoc

### P2. Operational Coupling

- noi recipe voi order lifecycle
- auto deduct theo order
- rollback/void/waste rules
- dashboard stock status basics

Gate qua P3:

- 1 order co recipe day du tao ra movement dung va co the audit
- cancel flow khong lam vo ton kho

### P3. Inventory Workspace

- inventory page, filters, item detail
- receiving/adjustment/count UX
- low-stock cards
- report food cost/variance/stockout

Gate qua P4:

- owner/staff co the van hanh kho co ban khong can can thiep SQL

### P4. AI Layer

- owner intent `inventory`
- tools: snapshot, reorder, variance, recipe cost, draft adjustment
- safe actions with confirm/manual_only

Gate qua P5:

- AI khong tu dot ngot sua du lieu
- AI dua ra duoc goi y co gia tri va mo dung man

### P5. Hardening

- tests, infra, docs, seed, support playbook
- responsive va release checks
- support audit path

Gate qua Pilot:

- test xanh
- support co tai lieu xu ly lech kho
- khong co blind write trong public entrypoints

### P6. Pilot va GA

- 2-5 quan pilot
- review KPI 2 tuan
- tinh chinh heuristic, UX, wording
- mo GA

## Execution Checklist

- [ ] Chot feature key `inventory_management`
- [ ] Chot packaging Pro/Premium
- [ ] Chot KPI pilot va KPI GA
- [ ] Chot pham vi v1 va non-goals
- [ ] Chot event nao se tru kho mac dinh
- [ ] Chot logic rollback va hao hut
- [ ] Chot AI scope cho inventory
- [ ] Chot acceptance gate cho P1-P6
- [ ] Chon 2-5 quan pilot phu hop
- [ ] Chuan bi seed/demo data cho cafe va nha hang
- [ ] Chuan bi sales narrative va upgrade CTA

## Key Product Decisions

### Decision 1: Inventory phai la mot domain rieng

Khong chen inventory vao `menu` hay `analytics` nhu mot tab phu. Ly do:

- co model du lieu rieng
- co event ledger rieng
- co permission rieng
- co AI va report rieng
- can scale thanh multi-branch ve sau

### Decision 2: Ledger la source of truth

Khong duoc chi luu "so ton hien tai". Can co:

- `inventory_movements` append-only
- snapshot `on_hand_quantity` de doc nhanh
- audit actor/reason/source

### Decision 3: AI inventory la operational copilot, khong phai chatbot

AI inventory phai:

- dua insight va mo dung man
- tao draft action
- yeu cau confirm cho tac vu nhay cam
- khong tu sua ton kho hay tat mon

## Risks

### Risk 1: Setup inventory qua nan cho quan nho

Mitigation:

- uu tien import nhanh
- recipe setup theo top mon truoc
- onboarding inventory 30-60 phut

### Risk 2: Tru kho sai thoi diem

Mitigation:

- chot event deduction som o P0
- test cancel/waste/rollback truoc pilot

### Risk 3: Bao cao dep nhung du lieu thuc te lech

Mitigation:

- bat buoc count session
- tach ly thuyet va thuc te
- AI phai noi ro confidence va thieu du lieu

### Risk 4: Inventory bi nhot vao Premium nen kho ban

Mitigation:

- inventory co ban thuoc Pro
- Premium ban AI va advanced ops, khong ban kha nang toi thieu

## Dependencies

- menu va order lifecycle hien tai trong `services/menu-service.ts` va `services/order-service.ts`
- report foundation trong `services/dashboard-report-service.ts`
- AI router trong `services/ai-prompt-router.ts` va `services/ai/runtime.ts`
- entitlement trong `services/billing/plan-features.ts`
- permission model trong `lib/staff-permissions.ts`

## P0 Exit Criteria

P0 duoc xem la xong khi:

- packaging, KPI, pham vi va rollout gates da duoc ghi thanh tai lieu
- khong con tranh cai lon ve pham vi v1
- doi engineering co the bat dau P1 schema/service/UI shell
- doi AI biet ro inventory se them intent/tool/action gi
- doi support/sales biet inventory se ban va rollout the nao
