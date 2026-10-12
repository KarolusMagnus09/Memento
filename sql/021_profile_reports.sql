-- 021: Báo cáo profile (từ màn Lịch hẹn) + RPC thông tin người đặt
-- Chạy trong Supabase SQL Editor.

create table if not exists public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reported_name text,
  booking_id uuid,
  reason text not null,
  description text not null,
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.profile_reports enable row level security;

drop policy if exists "profile_reports_insert_own" on public.profile_reports;
create policy "profile_reports_insert_own" on public.profile_reports
  for insert with check (auth.uid() = reporter_id);

drop policy if exists "profile_reports_select_own" on public.profile_reports;
create policy "profile_reports_select_own" on public.profile_reports
  for select using (auth.uid() = reporter_id);

drop policy if exists "profile_reports_admin_all" on public.profile_reports;
create policy "profile_reports_admin_all" on public.profile_reports
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- RPC: profile + thống kê của người đặt. Chỉ trả về nếu người gọi có booking chung với target (hoặc là admin).
create or replace function public.get_booking_party_profile(target_user uuid)
returns table (
  full_name text,
  username text,
  avatar_url text,
  gender text,
  total_bookings bigint,
  cancelled_bookings bigint,
  paid_bookings bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.full_name,
    p.username,
    p.avatar_url,
    p.gender::text,
    (select count(*) from public.bookings b where b.client_id = target_user),
    (select count(*) from public.bookings b where b.client_id = target_user and b.status = 'cancelled'),
    (select count(*) from public.bookings b
       where b.client_id = target_user and (b.status = 'paid' or b.payment_status = 'paid'))
  from public.profiles p
  where p.id = target_user
    and (
      exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin')
      or exists (
        select 1 from public.bookings b
        where b.client_id = target_user and b.photographer_user_id = auth.uid()
      )
    );
$$;

grant execute on function public.get_booking_party_profile(uuid) to authenticated;
