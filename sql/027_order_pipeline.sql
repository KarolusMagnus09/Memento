-- Pipeline đơn: processing → active → handover → closing → completed
alter table public.bookings
  add column if not exists client_success_at timestamptz,
  add column if not exists ptg_success_at timestamptz,
  add column if not exists drive_released_at timestamptz,
  add column if not exists ptg_advance_paid_at timestamptz,
  add column if not exists ptg_final_paid_at timestamptz;

-- Migrate legacy deposit_paid without advance → processing
update public.bookings
set status = 'processing'
where status in ('deposit_paid', 'paid')
  and deposit_paid_at is not null
  and ptg_advance_paid_at is null
  and status not in ('completed', 'rejected', 'cancelled', 'handover', 'closing', 'active', 'processing');

-- Already advanced → active if not further
update public.bookings
set status = 'active'
where ptg_advance_paid_at is not null
  and drive_url is null
  and status in ('deposit_paid', 'paid', 'processing');

comment on column public.bookings.client_success_at is 'User bấm xác nhận hoàn tất đơn';
comment on column public.bookings.ptg_success_at is 'PTG bấm xác nhận hoàn tất đơn';
comment on column public.bookings.drive_released_at is 'Admin gửi Drive đầy đủ cho user';
