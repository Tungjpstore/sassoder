# Thiet ke tinh nang dat ban truoc va nhan coc

## Muc tieu

Mo rong LogiVN de quan co the nhan dat ban truoc, giu ban trong mot khoang thoi gian, nhan tien coc bang VietQR, tranh trung lich o cap database va tu dong het han neu khach khong dat coc dung thoi gian.

Tinh nang nay nen la mot domain rieng, khong nen nhet vao `orders`, vi dat ban xay ra truoc khi co goi mon va co vong doi khac voi don hang.

## Hien trang du an

- Da co `restaurants`, `tables`, `orders`, `table_bills`, `payment_logs`.
- Da co VietQR manual confirm trong `payment-service.ts`.
- Da co dashboard realtime, cron route cho bao cao va cac action admin.
- Da co public route theo slug quan va luong khach khong dang nhap bang session an danh.

Khoang trong can bo sung:

- Bang reservation rieng.
- Bang lock ban theo thoi gian de chong trung lich.
- Cau hinh dat ban/coc theo tung quan.
- Public flow dat ban.
- Dashboard quan ly lich dat.
- Cron het han giu cho.
- Co che ap tien coc vao hoa don khi khach den.

## Mo hinh trang thai

`reservation_status`

- `draft`: khach vua chon thong tin, chua giu ban.
- `holding`: da giu ban tam thoi, dang cho coc.
- `waiting_deposit_confirm`: khach bam da chuyen coc, cho quan xac nhan.
- `confirmed`: da xac nhan dat ban.
- `seated`: khach da den, da mo phien ban/hoa don.
- `completed`: da ket thuc.
- `cancelled`: quan/khach huy.
- `expired`: qua han giu ban.
- `no_show`: khach khong den sau thoi gian grace.

`reservation_deposit_status`

- `none`
- `required`
- `waiting_payment`
- `waiting_confirm`
- `paid`
- `refundable`
- `forfeited`
- `refunded`

## Schema de xuat

Can them extension de dung exclusion constraint:

```sql
create extension if not exists btree_gist;
```

Bang cau hinh tren `restaurants`:

```sql
alter table public.restaurants
  add column if not exists reservations_enabled boolean not null default false,
  add column if not exists reservation_deposit_enabled boolean not null default false,
  add column if not exists reservation_deposit_type text not null default 'FIXED',
  add column if not exists reservation_deposit_value integer not null default 0,
  add column if not exists reservation_hold_minutes integer not null default 10,
  add column if not exists reservation_duration_minutes integer not null default 90,
  add column if not exists reservation_buffer_minutes integer not null default 15,
  add column if not exists reservation_min_notice_minutes integer not null default 30,
  add column if not exists reservation_max_days_ahead integer not null default 30,
  add column if not exists reservation_arrival_grace_minutes integer not null default 15;
```

Bang chinh:

```sql
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  status text not null default 'holding',
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  party_size integer not null check (party_size between 1 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  hold_expires_at timestamptz,
  deposit_required_amount integer not null default 0,
  deposit_paid_amount integer not null default 0,
  deposit_status text not null default 'none',
  payment_method public.payment_method,
  customer_note text,
  internal_note text,
  source text not null default 'PUBLIC',
  access_token_hash text not null,
  idempotency_key text,
  seated_table_bill_id uuid references public.table_bills(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  seated_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  no_show_at timestamptz,
  constraint reservations_time_range check (starts_at < ends_at),
  constraint reservations_status_check check (
    status in ('draft','holding','waiting_deposit_confirm','confirmed','seated','completed','cancelled','expired','no_show')
  ),
  constraint reservations_deposit_status_check check (
    deposit_status in ('none','required','waiting_payment','waiting_confirm','paid','refundable','forfeited','refunded')
  ),
  constraint reservations_deposit_type_amount check (
    deposit_required_amount >= 0 and deposit_paid_amount >= 0 and deposit_paid_amount <= deposit_required_amount
  )
);
```

Bang lock ban:

```sql
create table public.reservation_table_locks (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint reservation_table_locks_time_range check (starts_at < ends_at),
  constraint reservation_table_locks_status_check check (status in ('active','released'))
);

alter table public.reservation_table_locks
  add constraint reservation_no_overlap_per_table
  exclude using gist (
    restaurant_id with =,
    table_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status = 'active');
```

Bang log coc:

```sql
create table public.reservation_deposit_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  method public.payment_method not null default 'QR',
  status public.payment_log_status not null default 'pending',
  amount integer not null check (amount >= 0),
  raw_data jsonb,
  created_at timestamptz not null default now()
);
```

Can them vao `table_bills`:

```sql
alter table public.table_bills
  add column if not exists reservation_id uuid references public.reservations(id) on delete set null,
  add column if not exists deposit_applied_amount integer not null default 0;
```

## Luong khach dat ban

1. Khach vao `/r/[slug]/reserve`.
2. Nhap ngay gio, so khach, ten, so dien thoai, ghi chu.
3. API tinh ban kha dung:
   - Lay setting dat ban cua quan.
   - Ap dung gio mo cua, min notice, max days ahead.
   - Cong `reservation_duration_minutes` va `reservation_buffer_minutes`.
   - Tim ban co suc chua phu hop, uu tien ban nho nhat dap ung so khach.
   - Loai ban dang co lock active bi giao thoa thoi gian.
4. Tao reservation o trang thai:
   - `confirmed` neu khong yeu cau coc.
   - `holding` + `deposit_status = waiting_payment` neu can coc.
5. Neu can coc, hien VietQR:
   - `addInfo=RESV-{reservationId}`
   - amount = tien coc.
6. Khach bam "Toi da chuyen coc" -> `waiting_deposit_confirm`.
7. Quan xac nhan -> `confirmed`.
8. Khach co trang theo doi dat ban bang token an danh, khong can dang nhap.

## Luong chu quan

Route moi: `/dashboard/reservations`.

Man hinh nen co:

- Calendar ngay/tuan.
- Timeline theo ban.
- Danh sach "can xu ly": cho xac nhan coc, sap den gio, qua grace, het han.
- Drawer chi tiet dat ban.
- Action:
  - Xac nhan coc.
  - Gan/doi ban.
  - Xac nhan khach da den.
  - Mo hoa don ban.
  - Huy dat ban.
  - Danh dau no-show.
  - Ghi chu noi bo.

Khi khach den:

- Action "Nhan khach" tao hoac lien ket `table_bills`.
- Luu `reservation_id` va `deposit_applied_amount`.
- Khi thanh toan hoa don, so tien phai thu = tong bill - coc da ap dung.

## API de xuat

Public:

- `GET /api/restaurants/[slug]/reservations/availability?date=YYYY-MM-DD&partySize=4`
- `POST /api/reservations`
- `GET /api/reservations/[reservationId]?token=...`
- `POST /api/reservations/[reservationId]/paid`
- `POST /api/reservations/[reservationId]/cancel`

Admin:

- `GET /api/admin/reservations?date=...&status=...`
- `POST /api/admin/reservations/[reservationId]/confirm-deposit`
- `POST /api/admin/reservations/[reservationId]/seat`
- `POST /api/admin/reservations/[reservationId]/cancel`
- `POST /api/admin/reservations/[reservationId]/no-show`
- `POST /api/admin/reservations/[reservationId]/assign-tables`

Cron:

- `POST /api/cron/reservations/expire`

## Cron het han

Chay moi 1-5 phut tren Vercel Cron:

- `holding` qua `hold_expires_at` -> `expired`.
- Lock lien quan -> `released`.
- `confirmed` qua `starts_at + arrival_grace_minutes` ma chua `seated` -> `no_show` hoac dua vao danh sach can xu ly, tuy setting.

Nen co them "opportunistic cleanup": khi public check availability hoac admin load reservations, service cung goi cleanup nhe cho restaurant do. Như vậy neu cron cham, UI van dung.

## Chong trung lich

Khong chi check o service. Bat buoc co constraint o DB:

- Moi ban co mot lock active theo khoang `starts_at` - `ends_at`.
- Exclusion constraint chan hai lock giao nhau tren cung `restaurant_id + table_id`.
- Service tao reservation va locks trong mot RPC/transaction.
- Neu hai khach dat cung luc, mot transaction se fail constraint, API tra ve "Ban vua co nguoi dat, vui long chon khung gio khac".

## Nhan coc VietQR

MVP dung manual confirm:

- Tao QR bang helper VietQR hien co, nhung prefix moi la `RESV`.
- `reservation_deposit_logs` luu `pending`, `waiting_confirm`, `confirmed`.
- Khach bam da chuyen coc -> `waiting_deposit_confirm`.
- Quan bam xac nhan -> `deposit_status = paid`, `status = confirmed`.

Tuong lai:

- Casso/PayOS webhook match theo `RESV-{reservationId}`, amount va tai khoan ngan hang.
- Tu dong confirm deposit.
- Ho tro refund/forfeit coc.

## UI/UX de xuat

Public mobile-first:

- Step 1: Chon ngay gio, so khach.
- Step 2: Chon khung gio co san.
- Step 3: Nhap thong tin.
- Step 4: Coc/QR neu can.
- Step 5: Trang theo doi dat ban.

Dashboard neo-minimal:

- Sidebar them "Dat ban".
- Overview dashboard them card nho:
  - Hom nay co bao nhieu booking.
  - Bao nhieu booking cho coc.
  - Booking sap den trong 30 phut.
- Popup thong bao nhanh khi co booking moi/cho xac nhan coc.

## Bao mat

- Admin query scoped `restaurant_id`.
- Public khong doc truc tiep Supabase. Tat ca di qua Next API.
- Token public nen luu hash trong DB, token raw chi tra ve cho khach.
- Rate limit theo IP + phone.
- Idempotency key cho tao reservation.
- Khong expose danh sach ban day du ra public, chi expose khung gio/slot kha dung.

## Thu tu trien khai

1. Migration schema + RLS + indexes.
2. Service `reservation-service.ts`:
   - get settings
   - calculate availability
   - create hold
   - mark paid
   - confirm deposit
   - expire holds
   - seat reservation
3. API routes public/admin/cron.
4. Dashboard `/dashboard/reservations`.
5. Public page `/r/[slug]/reserve`.
6. Dong bo quick action center.
7. Ap coc vao checkout/bill total.
8. Realtime + email/SMS nhac lich.

## Tieu chi nghiem thu

- Hai khach khong the dat cung mot ban cung khung gio, ke ca bam cung luc.
- Reservation dang `holding` tu het han va giai phong ban.
- QR coc dung so tien va noi dung `RESV-{id}`.
- Quan xac nhan coc xong booking chuyen `confirmed`.
- Khach quay lai link van xem duoc trang thai dat ban.
- Quan co the nhan khach va mo hoa don co tru tien coc.
- Build, lint va migration chay sach.
