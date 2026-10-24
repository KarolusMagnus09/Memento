-- =============================================================================
-- MEMENTO — CHẠY 1 LẦN: Đặt lịch + thanh toán VietQR + mã bill
-- Supabase Dashboard → SQL Editor → New query → Paste → Run
-- An toàn chạy lại (IF NOT EXISTS / DROP IF EXISTS)
-- =============================================================================

-- 1) Bảng bookings
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  photographer_user_id uuid references auth.users(id) on delete set null,
  photographer_id bigint,
  photographer_name text not null default '',
  photographer_avatar text,
  package_name text not null,
  package_price numeric not null default 0,
  package_category text,
  booking_date date not null,
  start_time text not null,
  end_time text not null,
  client_note text,
  ptg_note text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Cột khách + thanh toán + bill
alter table public.bookings add column if not exists client_name text;
alter table public.bookings add column if not exists client_avatar text;
alter table public.bookings add column if not exists payment_status text default 'unpaid';
alter table public.bookings add column if not exists payment_ref text;
alter table public.bookings add column if not exists paid_at timestamptz;

-- 3) Constraint status (gồm paid)
do $$
begin
  alter table public.bookings drop constraint if exists bookings_status_check;
exception when others then null;
end $$;

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check
  check (status in ('pending', 'confirmed', 'rejected', 'cancelled', 'paid'));

-- 4) Constraint payment_status (nếu chưa có)
do $$
begin
  alter table public.bookings drop constraint if exists bookings_payment_status_check;
exception when others then null;
end $$;

do $$
begin
  alter table public.bookings
    add constraint bookings_payment_status_check
    check (payment_status is null or payment_status in ('unpaid', 'paid'));
exception when others then null;
end $$;

-- 5) Index
create index if not exists bookings_client_idx on public.bookings (client_id, created_at desc);
create index if not exists bookings_ptg_idx on public.bookings (photographer_user_id, created_at desc);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_payment_ref_idx on public.bookings (payment_ref);

-- 6) RLS
alter table public.bookings enable row level security;

drop policy if exists "bookings_select_own" on public.bookings;
create policy "bookings_select_own" on public.bookings for select
  using (auth.uid() = client_id or auth.uid() = photographer_user_id);

drop policy if exists "bookings_insert_client" on public.bookings;
create policy "bookings_insert_client" on public.bookings for insert
  with check (auth.uid() = client_id);

drop policy if exists "bookings_update_parties" on public.bookings;
create policy "bookings_update_parties" on public.bookings for update
  using (auth.uid() = client_id or auth.uid() = photographer_user_id);

drop policy if exists "bookings_delete_parties" on public.bookings;
create policy "bookings_delete_parties" on public.bookings for delete
  using (auth.uid() = client_id or auth.uid() = photographer_user_id);

-- 7) Comment đối soát
comment on column public.bookings.payment_ref is 'Mã bill = nội dung CK (vd MMT-A1B2C3D4)';
comment on column public.bookings.paid_at is 'Thời điểm khách xác nhận đã chuyển khoản';
comment on column public.bookings.client_name is 'Tên khách hiện trên request phía PTG';
comment on column public.bookings.payment_status is 'unpaid | paid';

-- Xong. Kiểm tra: Table Editor → bookings
