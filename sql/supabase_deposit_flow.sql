-- =====================================================================
-- Memento — luồng đặt cọc 20% / trả nốt 80% / ghim / hủy đơn hai bên
-- Chạy MỘT LẦN trong Supabase → SQL Editor (chạy lại nhiều lần cũng an toàn).
-- =====================================================================

-- 1) Cột mới trên bảng bookings ----------------------------------------
alter table public.bookings
  add column if not exists pinned_by_client      boolean not null default false,
  add column if not exists pinned_by_ptg         boolean not null default false,
  add column if not exists cancel_req_client_at  timestamptz,
  add column if not exists cancel_req_ptg_at     timestamptz,
  add column if not exists cancelled_at          timestamptz,
  add column if not exists refund_amount         numeric,
  add column if not exists refund_status         text,
  add column if not exists refund_done_at        timestamptz;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass and conname = 'bookings_refund_status_chk'
  ) then
    alter table public.bookings
      add constraint bookings_refund_status_chk
      check (refund_status is null or refund_status in ('pending', 'done'));
  end if;
end $$;

-- 2) Ghim lịch hẹn (mỗi bên ghim riêng) ---------------------------------
create or replace function public.toggle_pin_booking(p_booking uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v boolean;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then raise exception 'Không tìm thấy lịch hẹn'; end if;

  if auth.uid() = b.client_id then
    update public.bookings
       set pinned_by_client = not coalesce(pinned_by_client, false)
     where id = p_booking
    returning pinned_by_client into v;
  elsif auth.uid() = b.photographer_user_id then
    update public.bookings
       set pinned_by_ptg = not coalesce(pinned_by_ptg, false)
     where id = p_booking
    returning pinned_by_ptg into v;
  else
    raise exception 'Bạn không thuộc lịch hẹn này';
  end if;
  return v;
end $$;

-- 3) Hủy đơn -----------------------------------------------------------
--   • Chưa đóng tiền (pending / confirmed): hủy ngay, không cần bên kia đồng ý.
--   • Đã đặt cọc: cần CẢ HAI bên bấm. Mới một bên → báo cho bên kia, đơn giữ nguyên.
--     Đủ hai bên → status = cancelled, refund_amount = 100% tiền cọc, refund_status = 'pending'.
--   Trả về: 'cancelled' | 'requested'
create or replace function public.request_cancel_booking(p_booking uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  b          public.bookings;
  me_client  boolean;
  other_id   uuid;
  my_name    text;
  paid       boolean;
  refund     numeric;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Không tìm thấy lịch hẹn'; end if;

  me_client := (auth.uid() = b.client_id);
  if not me_client and auth.uid() is distinct from b.photographer_user_id then
    raise exception 'Bạn không thuộc lịch hẹn này';
  end if;

  if b.status in ('cancelled', 'rejected', 'completed', 'closing')
     or b.final_paid_at is not null
     or b.drive_released_at is not null then
    raise exception 'Đơn này không thể hủy nữa';
  end if;

  paid := b.deposit_paid_at is not null
          or b.status in ('processing', 'deposit_paid', 'paid', 'active', 'handover')
          or b.payment_status in ('deposit_paid', 'fully_paid', 'paid');

  -- Chưa đóng tiền → hủy ngay
  if not paid then
    if b.status not in ('pending', 'confirmed') then
      raise exception 'Đơn này không thể hủy nữa';
    end if;
    update public.bookings
       set status = 'cancelled', cancelled_at = now(), updated_at = now()
     where id = p_booking;
    return 'cancelled';
  end if;

  -- Đã đặt cọc → ghi nhận ý muốn hủy của bên đang bấm
  if me_client then
    update public.bookings set cancel_req_client_at = coalesce(cancel_req_client_at, now()), updated_at = now()
     where id = p_booking;
    other_id := b.photographer_user_id;
    my_name  := coalesce(b.client_name, 'Khách hàng');
  else
    update public.bookings set cancel_req_ptg_at = coalesce(cancel_req_ptg_at, now()), updated_at = now()
     where id = p_booking;
    other_id := b.client_id;
    my_name  := coalesce(b.photographer_name, 'Photographer');
  end if;

  select * into b from public.bookings where id = p_booking;

  if b.cancel_req_client_at is not null and b.cancel_req_ptg_at is not null then
    -- Cả hai đồng ý → hủy + hoàn 100% tiền cọc
    refund := coalesce(nullif(b.deposit_amount, 0), round(coalesce(b.package_price, 0) * 0.2));
    update public.bookings
       set status = 'cancelled',
           cancelled_at = now(),
           refund_amount = refund,
           refund_status = 'pending',
           updated_at = now()
     where id = p_booking;

    insert into public.notifications (user_id, type, tab, title, body, booking_id, data)
    select u, 'cancel_done', 'bookings', 'Đơn đã được hủy',
           'Hai bên đã đồng ý hủy. Tiền cọc sẽ được hoàn 100% cho khách.',
           p_booking, jsonb_build_object('booking_id', p_booking)
      from unnest(array[b.client_id, b.photographer_user_id]) as u
     where u is not null;
    return 'cancelled';
  end if;

  -- Mới một bên → báo cho bên còn lại (popup + push), đơn vẫn giữ nguyên
  if other_id is not null then
    insert into public.notifications (user_id, type, tab, title, body, booking_id, data)
    values (
      other_id, 'cancel_request', 'bookings',
      my_name || ' muốn hủy đơn',
      'Bạn có đồng ý hủy đơn không? Nếu đồng ý, tiền cọc sẽ được hoàn 100% cho khách.',
      p_booking, jsonb_build_object('booking_id', p_booking)
    );
  end if;
  return 'requested';
end $$;

-- 4) Rút yêu cầu hủy của mình -------------------------------------------
create or replace function public.withdraw_cancel_booking(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Không tìm thấy lịch hẹn'; end if;
  if b.status = 'cancelled' then raise exception 'Đơn đã được hủy'; end if;

  if auth.uid() = b.client_id then
    update public.bookings set cancel_req_client_at = null, updated_at = now() where id = p_booking;
  elsif auth.uid() = b.photographer_user_id then
    update public.bookings set cancel_req_ptg_at = null, updated_at = now() where id = p_booking;
  else
    raise exception 'Bạn không thuộc lịch hẹn này';
  end if;
end $$;

revoke all on function public.toggle_pin_booking(uuid)      from public;
revoke all on function public.request_cancel_booking(uuid)  from public;
revoke all on function public.withdraw_cancel_booking(uuid) from public;
grant execute on function public.toggle_pin_booking(uuid)      to authenticated;
grant execute on function public.request_cancel_booking(uuid)  to authenticated;
grant execute on function public.withdraw_cancel_booking(uuid) to authenticated;

-- 5) Kiểm tra: bảng notifications có CHECK giới hạn danh sách `type` không?
--    Nếu có, phải thêm 'cancel_request' và 'cancel_done' vào đó, nếu không thông báo sẽ không được tạo.
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.notifications'::regclass;

-- 6) Admin: đơn cần hoàn cọc, và đánh dấu đã hoàn
-- select id, client_name, refund_amount, cancelled_at from public.bookings where refund_status = 'pending';
-- update public.bookings set refund_status = 'done', refund_done_at = now() where id = '<booking id>';
