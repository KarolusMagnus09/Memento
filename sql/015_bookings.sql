-- Bảng lịch đặt (client request → PTG accept/reject)
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
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_client_idx on public.bookings (client_id, created_at desc);
create index if not exists bookings_ptg_idx on public.bookings (photographer_user_id, created_at desc);
create index if not exists bookings_status_idx on public.bookings (status);

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
