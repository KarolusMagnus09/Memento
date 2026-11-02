-- 040_client_refund_and_confirm_shoot.sql
-- 1) Khách lưu tài khoản nhận hoàn tiền (giống PTG lưu ngân hàng)
-- 2) Luồng hoàn cọc: need_info -> pending -> done
-- 3) Viết lại confirm_shoot: báo lỗi thật khi không ghi được + gửi thông báo cho bên kia
--
-- LƯU Ý: file này giả định các tên sau (suy ra từ code app/dashboard, chưa thấy SQL gốc):
--   bookings(id uuid, client_id, photographer_user_id, status, deposit_paid_at, deposit_amount,
--            booking_date, cancel_req_client_at, cancel_req_ptg_at, refund_amount, refund_status, ...)
--   notifications(user_id, type, tab, title, body, booking_id, data, read_at)
--   profiles(id, role)  -- role = 'admin' cho admin
-- Nếu tên khác thì sửa trước khi chạy.

-- ───────────── 1. Tài khoản ngân hàng của khách ─────────────
create table if not exists public.user_bank_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bank_code text not null,
  bank_name text,
  bank_account text not null,
  bank_account_name text not null,
  updated_at timestamptz not null default now()
);

alter table public.user_bank_accounts enable row level security;

drop policy if exists uba_owner_all on public.user_bank_accounts;
create policy uba_owner_all on public.user_bank_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists uba_admin_read on public.user_bank_accounts;
create policy uba_admin_read on public.user_bank_accounts
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ───────────── 2. Cột hoàn cọc trên bookings ─────────────
alter table public.bookings
  add column if not exists refund_bank_code text,
  add column if not exists refund_bank_name text,
  add column if not exists refund_account text,
  add column if not exists refund_account_name text,
  add column if not exists refund_info_at timestamptz,
  add column if not exists refund_done_at timestamptz;

-- need_info = chờ khách điền TK · pending = đang hoàn tiền · done = hủy thành công
alter table public.bookings drop constraint if exists bookings_refund_status_check;
alter table public.bookings
  add constraint bookings_refund_status_check
  check (refund_status is null or refund_status in ('need_info', 'pending', 'done'));

-- Khi hai bên cùng đồng ý hủy (đơn đã cọc): tự set số tiền hoàn, lấy TK khách đã lưu (nếu có),
-- và báo cho khách. Làm bằng trigger nên không phụ thuộc thân hàm request_cancel_booking.
create or replace function public.bookings_prepare_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.user_bank_accounts%rowtype;
begin
  if new.status = 'cancelled'
     and (old.status is distinct from 'cancelled')
     and new.deposit_paid_at is not null
     and new.cancel_req_client_at is not null
     and new.cancel_req_ptg_at is not null then

    new.refund_amount := coalesce(nullif(new.refund_amount, 0), new.deposit_amount, 0);

    select * into b from public.user_bank_accounts where user_id = new.client_id;
    if found then
      new.refund_bank_code := b.bank_code;
      new.refund_bank_name := b.bank_name;
      new.refund_account := b.bank_account;
      new.refund_account_name := b.bank_account_name;
      new.refund_info_at := now();
      new.refund_status := 'pending';
      insert into public.notifications(user_id, type, tab, title, body, booking_id)
      values (new.client_id, 'refund_pending', 'bookings', 'Đang hoàn tiền cọc',
              'Hai bên đã đồng ý hủy. Memento sẽ hoàn tiền cọc về tài khoản bạn đã lưu.', new.id);
    else
      new.refund_status := 'need_info';
      insert into public.notifications(user_id, type, tab, title, body, booking_id)
      values (new.client_id, 'refund_need_info', 'bookings', 'Cần thông tin nhận hoàn tiền',
              'Hai bên đã đồng ý hủy. Hãy điền tài khoản ngân hàng để Memento hoàn tiền cọc cho bạn.', new.id);
    end if;

    -- báo PTG (không cần làm gì thêm)
    if new.photographer_user_id is not null then
      insert into public.notifications(user_id, type, tab, title, body, booking_id)
      values (new.photographer_user_id, 'booking_cancelled', 'bookings', 'Đơn đã hủy',
              'Hai bên đã đồng ý hủy đơn. Tiền cọc sẽ được hoàn cho khách.', new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bookings_prepare_refund on public.bookings;
create trigger trg_bookings_prepare_refund
  before update on public.bookings
  for each row execute function public.bookings_prepare_refund();

-- Khách điền form hoàn tiền (chỉ khách của đơn, đơn đã hủy và đang chờ hoàn)
create or replace function public.submit_refund_info(
  p_booking uuid,
  p_bank_code text,
  p_bank_name text,
  p_account text,
  p_account_name text,
  p_save boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bk public.bookings%rowtype;
  acc text := regexp_replace(coalesce(p_account, ''), '\s', '', 'g');
begin
  select * into bk from public.bookings where id = p_booking for update;
  if not found then raise exception 'Không tìm thấy đơn'; end if;
  if bk.client_id is distinct from auth.uid() then raise exception 'Chỉ người đặt đơn mới điền được thông tin hoàn tiền'; end if;
  if bk.status <> 'cancelled' or bk.refund_status is null or bk.refund_status = 'done' then
    raise exception 'Đơn này không ở bước chờ hoàn tiền';
  end if;
  if length(acc) < 6 or length(trim(coalesce(p_account_name, ''))) < 2 or coalesce(p_bank_code, '') = '' then
    raise exception 'Vui lòng nhập đủ ngân hàng, số tài khoản và tên chủ tài khoản';
  end if;

  update public.bookings set
    refund_bank_code = p_bank_code,
    refund_bank_name = p_bank_name,
    refund_account = acc,
    refund_account_name = upper(trim(p_account_name)),
    refund_info_at = now(),
    refund_status = 'pending',
    updated_at = now()
  where id = p_booking;

  if p_save then
    insert into public.user_bank_accounts(user_id, bank_code, bank_name, bank_account, bank_account_name, updated_at)
    values (auth.uid(), p_bank_code, p_bank_name, acc, upper(trim(p_account_name)), now())
    on conflict (user_id) do update set
      bank_code = excluded.bank_code, bank_name = excluded.bank_name,
      bank_account = excluded.bank_account, bank_account_name = excluded.bank_account_name,
      updated_at = now();
  end if;
end;
$$;

grant execute on function public.submit_refund_info(uuid, text, text, text, text, boolean) to authenticated;

-- Admin báo khách khi đã chuyển xong (dashboard gọi sau khi đánh dấu done) — làm bằng trigger cho chắc
create or replace function public.bookings_refund_done_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.refund_status = 'done' and old.refund_status is distinct from 'done' then
    insert into public.notifications(user_id, type, tab, title, body, booking_id)
    values (new.client_id, 'refund_done', 'bookings', 'Hủy đơn thành công',
            'Memento đã hoàn tiền cọc về tài khoản của bạn.', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bookings_refund_done_notify on public.bookings;
create trigger trg_bookings_refund_done_notify
  after update on public.bookings
  for each row execute function public.bookings_refund_done_notify();

-- ───────────── 3. confirm_shoot viết lại ─────────────
-- Khác bản cũ: (a) kiểm tra ngày chụp theo giờ Việt Nam, (b) RAISE EXCEPTION khi không ghi được
-- thay vì im lặng 0 dòng, (c) gửi thông báo cho bên kia + cả hai khi đủ 2 bên.
drop function if exists public.confirm_shoot(uuid);

create or replace function public.confirm_shoot(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bk public.bookings%rowtype;
  me uuid := auth.uid();
  is_client boolean;
  is_ptg boolean;
  other uuid;
  both_done boolean;
begin
  if me is null then raise exception 'Chưa đăng nhập'; end if;

  select * into bk from public.bookings where id = p_booking for update;
  if not found then raise exception 'Không tìm thấy đơn'; end if;

  is_client := (bk.client_id = me);
  is_ptg := (bk.photographer_user_id = me);
  if not (is_client or is_ptg) then raise exception 'Bạn không thuộc đơn này'; end if;

  if bk.status in ('cancelled', 'rejected', 'completed') then
    raise exception 'Đơn đã kết thúc, không thể xác nhận';
  end if;
  if bk.deposit_paid_at is null and bk.status not in ('active', 'processing', 'deposit_paid', 'paid', 'handover') then
    raise exception 'Đơn chưa đặt cọc';
  end if;
  if bk.booking_date::date > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Chưa đến ngày chụp, chưa thể xác nhận';
  end if;

  if is_client then
    if bk.shoot_confirm_client_at is not null then return; end if;
    update public.bookings set shoot_confirm_client_at = now(), updated_at = now() where id = p_booking;
    other := bk.photographer_user_id;
  else
    if bk.shoot_confirm_ptg_at is not null then return; end if;
    update public.bookings set shoot_confirm_ptg_at = now(), updated_at = now() where id = p_booking;
    other := bk.client_id;
  end if;

  -- đọc lại để chắc chắn đã ghi
  select (shoot_confirm_client_at is not null and shoot_confirm_ptg_at is not null)
    into both_done from public.bookings where id = p_booking;

  if both_done then
    update public.bookings set shoot_done_at = coalesce(shoot_done_at, now()) where id = p_booking;
    insert into public.notifications(user_id, type, tab, title, body, booking_id)
    select u, 'shoot_both_confirmed', 'bookings', 'Hai bên đã xác nhận buổi chụp',
           case when u = bk.photographer_user_id
                then 'Bạn có thể gửi link Drive cho khách.'
                else 'Photographer sẽ gửi link Drive cho bạn.' end,
           p_booking
    from unnest(array[bk.client_id, bk.photographer_user_id]) as u
    where u is not null;
  elsif other is not null then
    insert into public.notifications(user_id, type, tab, title, body, booking_id)
    values (other, 'shoot_confirm_waiting', 'bookings', 'Bên kia đã xác nhận buổi chụp',
            'Vào lịch hẹn và bấm «Xác nhận đơn thành công» để sang bước tiếp theo.', p_booking);
  end if;
end;
$$;

grant execute on function public.confirm_shoot(uuid) to authenticated;
