-- 060: Flow đơn 1 nút / từng bước
-- Chụp (đến đúng ngày) → 2 bên xác nhận → PTG gửi Drive → khách góp ý → 2 bên xác nhận hoàn tất
-- An toàn khi chạy lại nhiều lần.

alter table public.bookings
  add column if not exists shoot_confirm_client_at timestamptz,
  add column if not exists shoot_confirm_ptg_at    timestamptz;

-- ───────── Gửi thông báo nội bộ (ghi thẳng vào bảng notifications) ─────────
create or replace function public.flow_notify(
  p_user uuid, p_type text, p_title text, p_body text, p_booking uuid, p_dedupe boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  -- p_dedupe: nếu trigger cũ vừa tạo thông báo cho đơn này trong 10 giây thì không tạo thêm (tránh 2 popup)
  if p_dedupe and exists (
    select 1 from public.notifications
    where user_id = p_user and booking_id = p_booking and created_at > now() - interval '10 seconds'
  ) then return; end if;
  insert into public.notifications (user_id, type, tab, title, body, booking_id, data)
  values (p_user, p_type, 'bookings', p_title, p_body, p_booking, jsonb_build_object('booking_id', p_booking));
exception when others then
  raise warning 'flow_notify lỗi: %', sqlerrm;  -- lỗi thông báo không được làm hỏng đơn
end $$;
revoke all on function public.flow_notify(uuid,text,text,text,uuid,boolean) from public, anon, authenticated;

-- ───────── Bước 2–3: xác nhận buổi chụp xong (mỗi bên 1 lần, chỉ từ ngày chụp) ─────────
create or replace function public.confirm_shoot(p_booking uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  me uuid := auth.uid();
  is_client boolean; is_ptg boolean;
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  both_done boolean;
  cname text; pname text;
begin
  if me is null then raise exception 'Bạn cần đăng nhập'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Không tìm thấy đơn'; end if;

  is_client := (b.client_id = me);
  is_ptg    := (b.photographer_user_id = me);
  if not (is_client or is_ptg) then raise exception 'Bạn không thuộc đơn này'; end if;

  if b.status in ('rejected','cancelled','completed','closing') then
    raise exception 'Đơn này không còn ở bước chụp';
  end if;
  if not (b.status = 'active' or b.ptg_advance_paid_at is not null or b.status = 'handover') then
    raise exception 'Đơn chưa vào giai đoạn chụp (chưa thanh toán / chưa được ứng cọc)';
  end if;
  if b.drive_url is not null then raise exception 'Đơn đã sang bước gửi ảnh'; end if;
  if b.booking_date::date > today then
    raise exception 'Chưa đến ngày chụp (%). Nút xác nhận chỉ hoạt động từ ngày chụp.', to_char(b.booking_date::date, 'DD/MM/YYYY');
  end if;

  -- đã xác nhận rồi → không làm gì (không gửi thông báo lặp)
  if (is_client and b.shoot_confirm_client_at is not null)
     or (is_ptg and b.shoot_confirm_ptg_at is not null) then
    return jsonb_build_object('both', (b.shoot_confirm_client_at is not null and b.shoot_confirm_ptg_at is not null), 'already', true);
  end if;

  perform set_config('memento.flow_rpc', '1', true);
  if is_client then
    update public.bookings set shoot_confirm_client_at = now(), updated_at = now() where id = p_booking;
  else
    update public.bookings set shoot_confirm_ptg_at = now(), updated_at = now() where id = p_booking;
  end if;

  select * into b from public.bookings where id = p_booking;
  both_done := (b.shoot_confirm_client_at is not null and b.shoot_confirm_ptg_at is not null);
  cname := coalesce(nullif(b.client_name, ''), 'Khách hàng');
  pname := coalesce(nullif(b.photographer_name, ''), 'Photographer');

  if both_done then
    perform public.flow_notify(b.photographer_user_id, 'shoot_confirmed',
      'Cả hai đã xác nhận buổi chụp',
      'Hãy gửi link Google Drive ảnh cho ' || cname || ' (nhớ để chế độ Người xem).', b.id);
    perform public.flow_notify(b.client_id, 'shoot_confirmed',
      'Buổi chụp đã được xác nhận',
      'Photographer ' || pname || ' sẽ gửi ảnh cho bạn xem sớm nhé.', b.id);
  elsif is_client then
    perform public.flow_notify(b.photographer_user_id, 'shoot_confirm_wait',
      cname || ' đã xác nhận buổi chụp',
      'Vào Lịch hẹn và bấm xác nhận nếu buổi chụp đã hoàn tất.', b.id);
  else
    perform public.flow_notify(b.client_id, 'shoot_confirm_wait',
      'Photographer ' || pname || ' đã xác nhận buổi chụp',
      'Vào Lịch hẹn và bấm xác nhận nếu buổi chụp đã hoàn tất.', b.id);
  end if;

  return jsonb_build_object('both', both_done, 'already', false);
end $$;
revoke all on function public.confirm_shoot(uuid) from public, anon;
grant execute on function public.confirm_shoot(uuid) to authenticated;

-- ───────── Bước 6–7: mỗi bên xác nhận hoàn tất đơn (sau khi có link Drive) ─────────
create or replace function public.confirm_final(p_booking uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  me uuid := auth.uid();
  is_client boolean; is_ptg boolean;
  both_done boolean;
  cname text; pname text;
begin
  if me is null then raise exception 'Bạn cần đăng nhập'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Không tìm thấy đơn'; end if;

  is_client := (b.client_id = me);
  is_ptg    := (b.photographer_user_id = me);
  if not (is_client or is_ptg) then raise exception 'Bạn không thuộc đơn này'; end if;
  if b.status in ('rejected','cancelled','completed') then raise exception 'Đơn này đã kết thúc'; end if;
  if b.drive_url is null then raise exception 'Photographer chưa gửi link Drive'; end if;

  if (is_client and b.client_success_at is not null) or (is_ptg and b.ptg_success_at is not null) then
    return jsonb_build_object('both', (b.client_success_at is not null and b.ptg_success_at is not null), 'already', true);
  end if;

  perform set_config('memento.flow_rpc', '1', true);
  if is_client then
    update public.bookings set client_success_at = now(), updated_at = now() where id = p_booking;
  else
    update public.bookings set ptg_success_at = now(), updated_at = now() where id = p_booking;
  end if;

  select * into b from public.bookings where id = p_booking;
  both_done := (b.client_success_at is not null and b.ptg_success_at is not null);
  if both_done and b.status <> 'closing' then
    update public.bookings set status = 'closing', updated_at = now() where id = p_booking;
  end if;

  cname := coalesce(nullif(b.client_name, ''), 'Khách hàng');
  pname := coalesce(nullif(b.photographer_name, ''), 'Photographer');

  -- p_dedupe = true: nếu trigger notif_booking_update cũ đã tạo popup cho đơn này thì không tạo thêm
  if both_done then
    perform public.flow_notify(b.client_id, 'final_both',
      'Đơn đã hoàn tất 🎉',
      'Cả hai bên đã xác nhận. Memento sẽ gửi bạn đường link Drive ảnh hoàn chỉnh.', b.id, true);
    perform public.flow_notify(b.photographer_user_id, 'final_both',
      'Đơn đã hoàn tất 🎉',
      'Cả hai bên đã xác nhận. Memento sẽ chuyển phần thanh toán còn lại cho bạn.', b.id, true);
  elsif is_client then
    perform public.flow_notify(b.photographer_user_id, 'final_confirm_wait',
      cname || ' đã xác nhận hoàn tất đơn',
      'Vào Lịch hẹn và bấm xác nhận để hoàn tất.', b.id, true);
  else
    perform public.flow_notify(b.client_id, 'final_confirm_wait',
      'Photographer ' || pname || ' đã xác nhận hoàn tất đơn',
      'Nếu bạn hài lòng với ảnh, hãy vào Lịch hẹn và bấm xác nhận.', b.id, true);
  end if;

  return jsonb_build_object('both', both_done, 'already', false);
end $$;
revoke all on function public.confirm_final(uuid) from public, anon;
grant execute on function public.confirm_final(uuid) to authenticated;

-- ───────── Khóa phía server: không cho bỏ qua bước bằng cách sửa trực tiếp bảng ─────────
create or replace function public.bookings_flow_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare is_admin boolean := false;
begin
  -- service_role (webhook SePay...) và RPC ở trên được đi qua
  if auth.uid() is null or coalesce(current_setting('memento.flow_rpc', true), '') = '1' then
    return new;
  end if;
  begin
    select (role = 'admin') into is_admin from public.profiles where id = auth.uid();
  exception when others then is_admin := false;
  end;
  if coalesce(is_admin, false) then return new; end if;

  if new.shoot_confirm_client_at is distinct from old.shoot_confirm_client_at
     or new.shoot_confirm_ptg_at is distinct from old.shoot_confirm_ptg_at then
    raise exception 'Hãy dùng nút xác nhận trong app';
  end if;

  if new.client_success_at is distinct from old.client_success_at
     or new.ptg_success_at is distinct from old.ptg_success_at then
    raise exception 'Hãy dùng nút xác nhận hoàn tất trong app';
  end if;

  -- Lần đầu gửi link Drive: cần cả hai bên đã xác nhận buổi chụp (đơn cũ có shoot_done_at vẫn được)
  if old.drive_url is null and new.drive_url is not null
     and old.shoot_done_at is null
     and not (old.shoot_confirm_client_at is not null and old.shoot_confirm_ptg_at is not null) then
    raise exception 'Cần cả hai bên xác nhận buổi chụp trước khi gửi link Drive';
  end if;

  return new;
end $$;

drop trigger if exists bookings_flow_guard on public.bookings;
create trigger bookings_flow_guard
  before update on public.bookings
  for each row execute function public.bookings_flow_guard();
