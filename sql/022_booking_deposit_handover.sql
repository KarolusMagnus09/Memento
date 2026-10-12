-- Flow: cọc 10% → chụp → bàn giao Drive → thanh toán 90% → hoàn tất
-- Platform giữ tiền, hoa hồng 10%, PTG nhận 90% tổng deal khi xong.

alter table public.bookings
  add column if not exists deposit_amount numeric,
  add column if not exists remaining_amount numeric,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists final_paid_at timestamptz,
  add column if not exists drive_url text,
  add column if not exists drive_submitted_at timestamptz,
  add column if not exists shoot_done_at timestamptz,
  add column if not exists client_approved_at timestamptz,
  add column if not exists handover_note text;

-- Mở rộng status (text, không enum cứng)
-- pending | confirmed | deposit_paid | handover | final_payment | completed | rejected | cancelled

comment on column public.bookings.deposit_amount is '10% đặt cọc';
comment on column public.bookings.remaining_amount is '90% còn lại sau khi duyệt ảnh';
comment on column public.bookings.drive_url is 'Link Google Drive bàn giao (PTG gửi)';

-- Feedback ảnh / yêu cầu edit
create table if not exists public.booking_photo_feedback (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_label text not null default '',
  note text not null default '',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists booking_photo_feedback_booking_idx
  on public.booking_photo_feedback (booking_id, created_at desc);

alter table public.booking_photo_feedback enable row level security;

drop policy if exists "bpf_select_parties" on public.booking_photo_feedback;
create policy "bpf_select_parties" on public.booking_photo_feedback
  for select using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.client_id = auth.uid() or b.photographer_user_id = auth.uid())
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "bpf_insert_client" on public.booking_photo_feedback;
create policy "bpf_insert_client" on public.booking_photo_feedback
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.client_id = auth.uid()
    )
  );

drop policy if exists "bpf_update_parties" on public.booking_photo_feedback;
create policy "bpf_update_parties" on public.booking_photo_feedback
  for update using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.client_id = auth.uid() or b.photographer_user_id = auth.uid())
    )
  );

-- Backfill số tiền cọc cho đơn cũ (nếu có package_price)
update public.bookings
set
  deposit_amount = round(coalesce(package_price, 0) * 0.1),
  remaining_amount = round(coalesce(package_price, 0) * 0.9)
where deposit_amount is null and package_price is not null;
