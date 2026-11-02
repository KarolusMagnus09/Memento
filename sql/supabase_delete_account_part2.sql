-- =====================================================================
-- Memento — XÓA TÀI KHOẢN (phần 2: chat + đơn + hiển thị)
-- Chạy SAU supabase_delete_account.sql. Chạy lại nhiều lần cũng an toàn.
--
--  1) deleted_user_ids(): để app biết đối tác chat / đơn đã xóa tài khoản (hiện nhãn "● Đã xóa").
--  2) Trigger chặn GỬI tin nhắn tới / từ tài khoản đã xóa (chat đơn + chat đề nghị).
--     → chat cũ vẫn xem lại được, nhưng không gửi tin mới được, kể cả khi app bị sửa.
--  3) Trigger dọn dẹp khi tài khoản bị xóa: đóng đơn tìm nhiếp ảnh gia còn mở,
--     ẩn tên người đăng, rút các đề nghị chụp đang chờ.
-- =====================================================================

-- 1) Danh sách id (trong p_ids) đã xóa tài khoản --------------------------
create or replace function public.deleted_user_ids(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles
   where id = any(p_ids) and deleted_at is not null;
$$;

revoke all on function public.deleted_user_ids(uuid[]) from public;
grant execute on function public.deleted_user_ids(uuid[]) to authenticated;

-- 2) Chặn gửi tin nhắn với tài khoản đã xóa --------------------------------
create or replace function public.block_messages_with_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.profiles p
     where p.id in (new.sender_id, new.recipient_id)
       and p.deleted_at is not null
  ) then
    raise exception 'ACCOUNT_DELETED';
  end if;
  return new;
end $$;

do $$
begin
  if to_regclass('public.messages') is not null then
    drop trigger if exists trg_block_messages_with_deleted on public.messages;
    create trigger trg_block_messages_with_deleted
      before insert on public.messages
      for each row execute function public.block_messages_with_deleted();
  end if;

  if to_regclass('public.offer_messages') is not null then
    drop trigger if exists trg_block_offer_messages_with_deleted on public.offer_messages;
    create trigger trg_block_offer_messages_with_deleted
      before insert on public.offer_messages
      for each row execute function public.block_messages_with_deleted();
  end if;
end $$;

-- 3) Dọn dẹp ngay khi hồ sơ được đánh dấu đã xóa ---------------------------
create or replace function public.on_account_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tomb constant text := 'Người dùng đã bị xóa';
begin
  if old.deleted_at is null and new.deleted_at is not null then
    -- Đơn tìm nhiếp ảnh gia của người này: ẩn tên + đóng đơn còn mở
    begin
      update public.photo_requests set requester_name = tomb where requester_id = new.id;
    exception when others then null; end;
    begin
      update public.photo_requests set status = 'closed' where requester_id = new.id and status = 'open';
    exception when others then null; end;

    -- Đề nghị chụp đang chờ của người này: rút lại
    begin
      update public.photo_request_offers set status = 'withdrawn'
       where photographer_user_id = new.id and status = 'pending';
    exception when others then null; end;
  end if;
  return new;
end $$;

drop trigger if exists trg_on_account_deleted on public.profiles;
create trigger trg_on_account_deleted
  after update of deleted_at on public.profiles
  for each row execute function public.on_account_deleted();
