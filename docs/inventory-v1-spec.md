# LogiVN Inventory v1 Spec

Date: 2026-05-12
Status: Accepted for implementation

## Goal

Xay inventory v1 cho LogiVN theo huong "recipe-based inventory operations" de moi mon ban ra co the anh xa toi dinh muc nguyen lieu, tru kho co audit, va sinh insight food cost/stockout co gia tri thuc te.

## Scope

Spec nay bao gom:

- data model v1
- workflow van hanh
- AI scope
- permission va entitlement
- acceptance criteria cho implementation

Spec nay khong bao gom:

- purchase order phuc tap
- lot/expiry tracking
- multi-warehouse transfer

## Domain Model

### Core tables

- `ingredient_categories`
- `ingredients`
- `menu_item_recipes`
- `inventory_movements`
- `inventory_counts`
- `inventory_count_lines`

### Suggested semantics

`ingredients`

- restaurant-scoped
- ten nguyen lieu, don vi, ton hien tai, nguong min, gia von tham chieu
- co `is_active`

`menu_item_recipes`

- moi dong la 1 ingredient trong 1 mon
- quantity per serving
- optional waste factor nho cho phase sau, v1 co the chua bat buoc

`inventory_movements`

- append-only ledger
- movement types: `receive`, `deduct_sale`, `adjust_increase`, `adjust_decrease`, `waste`, `rollback`
- luu `source_type`, `source_id`, `reason`, `actor_user_id`

`inventory_counts`

- session kiem ke theo ca/ngay
- statuses: `draft`, `submitted`, `applied`, `cancelled`

`inventory_count_lines`

- so ly thuyet, so thuc te, variance, note

## Runtime Boundaries

Inventory la owner dashboard domain. Quy tac:

- route/API khong import admin Supabase client truc tiep
- service inventory tu xu ly tenant scope
- moi query va write phai filter theo `restaurant_id`
- ledger write phai co audit metadata

## Workflow Decisions

### 1. Tao va quan ly ingredient

Chu quan/quan ly tao ingredient theo nhom:

- do uong
- topping
- nguyen lieu bep
- bao bi
- vat tu tieu hao

Acceptance:

- ingredient co the active/pause
- ingredient co nguong canh bao toi thieu
- ingredient co don vi ro rang

### 2. Ghep recipe vao menu item

Muc tieu:

- moi mon quan trong co recipe
- recipe co quantity per serving

Decision:

- v1 khong bat buoc 100% mon phai co recipe
- he thong phai biet mon nao "recipe-ready" va mon nao "missing recipe"

Acceptance:

- UI hien ro mon nao chua co recipe
- report food cost bo qua mon chua du recipe va ghi chu ly do

### 3. Receiving / opening stock

Workflow:

- chu quan tao movement `receive` hoac `adjust_increase`
- co quantity, unit cost tham chieu, reason
- update on-hand ngay lap tuc

Acceptance:

- movement duoc audit
- on-hand thay doi dung
- co lich su tra cuu theo ingredient

### 4. Auto deduction from orders

Decision:

- movement `deduct_sale` duoc tao khi order thuc su vao van hanh bep
- khong cho den `paid`
- khong tru o luc customer moi tao order neu order chua duoc nhan vao quy trinh van hanh

Rationale:

- phu hop thuc te F&B
- tranh ton kho ao khi order bi roi som

Acceptance:

- order co recipe tao movements dung quantity
- order khong co recipe khong lam vo flow, nhung bi danh dau "inventory incomplete"

### 5. Cancel / void / waste

Decision:

- neu order bi huy truoc khi da prep: cho phep `rollback`
- neu mon da prep hoac da su dung nguyen lieu: dung `waste` hoac `adjust_decrease`
- khong auto cong kho mu

Acceptance:

- moi reverse path phai co reason
- support co the audit order nao da gay waste hay rollback

### 6. Stock count

Workflow:

- tao count session cuoi ca/cuoi ngay
- lock ly thuyet tai thoi diem bat dau count
- nhap so thuc te
- khi apply, sinh movement dieu chinh tang/giam theo variance

Acceptance:

- variance duoc luu ro tung ingredient
- count session co actor, created_at, applied_at

### 7. Low-stock and stockout

He thong can biet:

- ingredient nao duoi nguong min
- mon nao co nguy co khong ban duoc vi thieu ingredient

Decision:

- v1 chi canh bao va goi y pause mon
- khong auto pause menu item

Acceptance:

- co danh sach ingredient low-stock
- co danh sach menu item bi risk boi inventory

### 8. Reporting

v1 can co:

- food cost theo mon
- ingredient consumption ly thuyet
- low-stock
- stockout count
- variance report theo count session

Acceptance:

- chu quan co the doc top mon cost cao
- co the truy nguoc tu mon -> recipe -> ingredient -> movement

## Permissions

Them permission moi:

- `inventory.view`
- `inventory.manage`

Suggested presets:

- manager: full inventory
- kitchen: `inventory.view`
- cashier: khong mac dinh co `inventory.manage`
- viewer: co the cho `inventory.view` neu can

## Entitlement

Them feature:

- `inventory_management`

Decision:

- route `/dashboard/inventory` gate bang `inventory_management`
- AI inventory nang cao co the tiep tuc dung `ai_owner_assistant` o v1, hoac tach sau neu can pricing rung lac hon

## AI Scope

### New owner intent

- `inventory`

### New tools

- `inventory_snapshot`
- `recipe_cost_breakdown`
- `reorder_suggestion`
- `variance_analysis`
- `draft_stock_adjustment`

### AI response rules

AI phai:

- mo dung man inventory, recipe, count, report
- dua ra goi y co confirm
- noi ro neu du lieu recipe/chiphi/cong thuc con thieu

AI khong duoc:

- tu sua ton kho
- tu pause menu item
- tu xac nhan count session
- tu xoa movement

### Action safety

- view/report actions: `safe`
- create draft adjustment: `confirm`
- apply adjustment/pause menu item: `manual_only` hoac `confirm` tuy endpoint thuc te

## UI Surface

### Route

- `/dashboard/inventory`

### Main panels

- tong quan kho
- ingredient list
- movement log
- recipe coverage
- count sessions
- low-stock alerts
- AI inventory dock/cards

### Cross-links

- tu menu item sang recipe
- tu analytics sang food cost
- tu AI sang inventory filtered views

## Acceptance Criteria

### Data

- co the tao ingredient, recipe, movement, count session trong tenant scope
- ledger va on-hand khong mau thuan sau cac flow co ban

### Workflow

- order da bat recipe tao deduction movements dung
- cancel flow khong tao double reverse
- count session apply sinh adjustment movements dung

### Product

- chu quan nhin thay nguyen lieu sap het
- chu quan nhin duoc mon nao co cost cao
- chu quan biet mon nao chua du recipe

### AI

- AI tra loi duoc "sap het gi"
- AI tra loi duoc "nen nhap gi"
- AI tra loi duoc "mon nao dang dot cost"
- AI mo dung route de thao tac tiep

## Implementation Sequence

1. Done: Tao schema va generated types.
2. Done: Tao services + validators + entitlement + permissions.
3. Done: Tao route shell va inventory workspace voi ingredient/category/movement forms.
4. Partial: Them write flows receive/adjust/waste/rollback; count session apply con o phase sau.
5. Done: Noi auto deduction va rollback idempotent tu order lifecycle.
6. Next: Them reporting.
7. Next: Them AI tools va intent.
8. Next: Hardening, tests, pilot.

## Risks And Mitigations

### Recipe coverage thap

Mitigation:

- cho phep rollout theo top mon
- hien ro recipe coverage score

### Tru kho sai vi order state

Mitigation:

- test voi `pending`, `ordering`, `cancelled`, `paid`
- centralize event-to-movement mapping trong service inventory

### Support kho truy vet kho

Mitigation:

- append-only ledger
- source links tu movement -> order/count/manual action

## Exit Criteria

Spec nay duoc xem la san sang cho P1 khi:

- khong con mo ho ve data model co ban
- workflow deduction/cancel/count da duoc chot
- entitlement, permission va AI scope da duoc khoa
- team implementation co the bat dau migration va service design
