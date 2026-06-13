-- Staff payroll deductions — bảng lưu rule khấu trừ BHXH/BHYT/BHTN/thuế TNCN per-restaurant
-- Theo NĐ 145/2020 và Luật Thuế TNCN VN. Mặc định 2025: BHXH 8% NV + 17.5% NSDLĐ
-- BHYT 1.5% NV + 3% NSDLĐ, BHTN 1% NV + 1% NSDLĐ.

create table if not exists public.staff_payroll_deductions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  -- Tỉ lệ khấu trừ phía nhân viên (lưu dạng %, ví dụ 8.0 = 8%)
  bhxh_employee_percent numeric(5, 2) not null default 8.0,
  bhyt_employee_percent numeric(5, 2) not null default 1.5,
  bhtn_employee_percent numeric(5, 2) not null default 1.0,
  -- Tỉ lệ phía người sử dụng lao động (chỉ để hiển thị, không khấu trừ vào lương net)
  bhxh_employer_percent numeric(5, 2) not null default 17.5,
  bhyt_employer_percent numeric(5, 2) not null default 3.0,
  bhtn_employer_percent numeric(5, 2) not null default 1.0,
  -- Cấu hình thuế TNCN
  -- enable_personal_income_tax: bật khấu trừ thuế TNCN
  enable_personal_income_tax boolean not null default false,
  -- personal_relief: giảm trừ gia cảnh bản thân (mặc định 11tr/tháng)
  personal_relief integer not null default 11000000,
  -- dependent_relief_per_person: giảm trừ phụ thuộc / người (mặc định 4.4tr/tháng)
  dependent_relief_per_person integer not null default 4400000,
  -- Cấu hình lương cơ sở dùng cho BHXH (LCT 4.96tr/tháng theo NĐ 73/2024)
  insurance_base_min integer not null default 4960000,
  -- Trần BHXH bằng 20× LCS (theo Luật BHXH)
  insurance_base_max integer not null default 99200000,
  applied_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_payroll_deductions_unique unique (restaurant_id),
  constraint staff_payroll_deductions_bhxh_emp_check check (bhxh_employee_percent between 0 and 100),
  constraint staff_payroll_deductions_bhyt_emp_check check (bhyt_employee_percent between 0 and 100),
  constraint staff_payroll_deductions_bhtn_emp_check check (bhtn_employee_percent between 0 and 100),
  constraint staff_payroll_deductions_bhxh_er_check check (bhxh_employer_percent between 0 and 100),
  constraint staff_payroll_deductions_bhyt_er_check check (bhyt_employer_percent between 0 and 100),
  constraint staff_payroll_deductions_bhtn_er_check check (bhtn_employer_percent between 0 and 100),
  constraint staff_payroll_deductions_personal_relief_check check (personal_relief >= 0),
  constraint staff_payroll_deductions_dependent_relief_check check (dependent_relief_per_person >= 0),
  constraint staff_payroll_deductions_base_check check (insurance_base_max >= insurance_base_min)
);

create index if not exists staff_payroll_deductions_restaurant_idx
  on public.staff_payroll_deductions (restaurant_id);

drop trigger if exists staff_payroll_deductions_set_updated_at on public.staff_payroll_deductions;
create trigger staff_payroll_deductions_set_updated_at
before update on public.staff_payroll_deductions
for each row execute function public.set_updated_at();

-- Per-staff overrides: lương + số người phụ thuộc
-- Bật thuế TNCN per-staff khi nhân viên có HĐ chính thức + thu nhập đủ ngưỡng

create table if not exists public.staff_payroll_profiles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  -- Mức lương cơ bản theo HĐLĐ
  base_salary integer not null default 0,
  -- Lương theo giờ (override mức chung trong UI bảng lương)
  hourly_rate integer,
  -- Số người phụ thuộc
  dependent_count smallint not null default 0,
  -- Có tham gia BHXH không
  enrolled_in_insurance boolean not null default false,
  -- Có khấu trừ thuế TNCN không
  apply_personal_income_tax boolean not null default false,
  -- Mức lương đóng BHXH (nếu khác lương cơ bản)
  insurance_base_amount integer,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_payroll_profiles_unique unique (restaurant_id, staff_member_id),
  constraint staff_payroll_profiles_base_salary_check check (base_salary >= 0),
  constraint staff_payroll_profiles_hourly_rate_check check (hourly_rate is null or hourly_rate >= 0),
  constraint staff_payroll_profiles_dependent_check check (dependent_count between 0 and 20),
  constraint staff_payroll_profiles_insurance_base_check check (insurance_base_amount is null or insurance_base_amount >= 0)
);

create index if not exists staff_payroll_profiles_restaurant_idx
  on public.staff_payroll_profiles (restaurant_id);
create index if not exists staff_payroll_profiles_staff_idx
  on public.staff_payroll_profiles (staff_member_id);

drop trigger if exists staff_payroll_profiles_set_updated_at on public.staff_payroll_profiles;
create trigger staff_payroll_profiles_set_updated_at
before update on public.staff_payroll_profiles
for each row execute function public.set_updated_at();

-- RLS: chủ quán + service role mới được đọc/ghi
alter table public.staff_payroll_deductions enable row level security;
alter table public.staff_payroll_profiles enable row level security;

drop policy if exists staff_payroll_deductions_admin_all on public.staff_payroll_deductions;
create policy staff_payroll_deductions_admin_all on public.staff_payroll_deductions
  for all
  using (auth.uid() in (select id from public.users where restaurant_id = staff_payroll_deductions.restaurant_id and role = 'ADMIN'))
  with check (auth.uid() in (select id from public.users where restaurant_id = staff_payroll_deductions.restaurant_id and role = 'ADMIN'));

drop policy if exists staff_payroll_profiles_admin_all on public.staff_payroll_profiles;
create policy staff_payroll_profiles_admin_all on public.staff_payroll_profiles
  for all
  using (auth.uid() in (select id from public.users where restaurant_id = staff_payroll_profiles.restaurant_id and role = 'ADMIN'))
  with check (auth.uid() in (select id from public.users where restaurant_id = staff_payroll_profiles.restaurant_id and role = 'ADMIN'));

-- Revoke direct access to authenticated users (service-only)
revoke insert, update, delete on table public.staff_payroll_deductions from authenticated;
revoke insert, update, delete on table public.staff_payroll_profiles from authenticated;
