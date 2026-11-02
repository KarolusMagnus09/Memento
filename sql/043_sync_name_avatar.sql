-- 043_sync_name_avatar.sql
-- Chạy SAU 042. An toàn chạy lại.
--
-- Vấn đề: tên + avatar đang lưu ở 4 nơi, đổi ở "Thông tin cá nhân" chỉ sửa profiles:
--   profiles(full_name, avatar_url)                      ← nguồn chính
--   photographer_applications(full_name, avatar_url)     ← hồ sơ PTG
--   photographers(name, avatar)                          ← thẻ ngoài Home/Khám phá/Tìm kiếm
--   bookings(client_name, client_avatar, photographer_name, photographer_avatar)  ← chat, lịch hẹn
--
-- Cách sửa: trigger đồng bộ hai chiều (profiles ⇄ application), rồi đẩy sang photographers + bookings.
-- Mọi UPDATE đều có điều kiện "is distinct from" nên không lặp vô hạn.

create or replace function public.sync_display_identity(p_user uuid, p_name text, p_avatar text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n text := nullif(trim(coalesce(p_name, '')), '');
  a text := nullif(trim(coalesce(p_avatar, '')), '');
begin
  if p_user is null then return; end if;
  -- cho phép trigger guard của bookings (xem confirm_final)
  perform set_config('memento.flow_rpc', '1', true);

  -- Thẻ photographer ngoài trang chủ
  update public.photographers set
    name = coalesce(n, name),
    avatar = coalesce(a, avatar)
  where user_id = p_user
    and (name is distinct from coalesce(n, name) or avatar is distinct from coalesce(a, avatar));

  -- Hồ sơ photographer
  update public.photographer_applications set
    full_name = coalesce(n, full_name),
    avatar_url = coalesce(a, avatar_url)
  where user_id = p_user
    and (full_name is distinct from coalesce(n, full_name) or avatar_url is distinct from coalesce(a, avatar_url));

  -- Lịch hẹn đang chạy: cập nhật tên/avatar hiện trong lịch hẹn + chat.
  -- Đơn đã kết thúc giữ nguyên bản lúc đó (tránh bắn thông báo/ghi đè lịch sử). Muốn cập nhật cả đơn cũ thì bỏ điều kiện status.
  update public.bookings set
    client_name = coalesce(n, client_name),
    client_avatar = coalesce(a, client_avatar)
  where client_id = p_user
    and status not in ('completed', 'cancelled', 'rejected')
    and (client_name is distinct from coalesce(n, client_name) or client_avatar is distinct from coalesce(a, client_avatar));

  update public.bookings set
    photographer_name = coalesce(n, photographer_name),
    photographer_avatar = coalesce(a, photographer_avatar)
  where photographer_user_id = p_user
    and status not in ('completed', 'cancelled', 'rejected')
    and (photographer_name is distinct from coalesce(n, photographer_name)
         or photographer_avatar is distinct from coalesce(a, photographer_avatar));
end;
$$;

-- profiles → các nơi còn lại
create or replace function public.trg_profiles_sync_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_display_identity(new.id, new.full_name, new.avatar_url);
  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_identity on public.profiles;
create trigger trg_profiles_sync_identity
  after update of full_name, avatar_url on public.profiles
  for each row
  when (old.full_name is distinct from new.full_name or old.avatar_url is distinct from new.avatar_url)
  execute function public.trg_profiles_sync_identity();

-- photographer_applications → profiles (rồi profiles trigger đẩy tiếp sang photographers/bookings)
create or replace function public.trg_applications_sync_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set
    full_name = coalesce(nullif(trim(coalesce(new.full_name, '')), ''), full_name),
    avatar_url = coalesce(nullif(trim(coalesce(new.avatar_url, '')), ''), avatar_url)
  where id = new.user_id
    and (full_name is distinct from coalesce(nullif(trim(coalesce(new.full_name, '')), ''), full_name)
         or avatar_url is distinct from coalesce(nullif(trim(coalesce(new.avatar_url, '')), ''), avatar_url));
  -- trường hợp profiles đã khớp nhưng photographers còn cũ
  perform public.sync_display_identity(new.user_id, new.full_name, new.avatar_url);
  return new;
end;
$$;

drop trigger if exists trg_applications_sync_identity on public.photographer_applications;
create trigger trg_applications_sync_identity
  after update of full_name, avatar_url on public.photographer_applications
  for each row
  when (old.full_name is distinct from new.full_name or old.avatar_url is distinct from new.avatar_url)
  execute function public.trg_applications_sync_identity();

-- ───────── Chạy 1 lần: đồng bộ dữ liệu hiện có theo profiles ─────────
-- (profiles là nơi người dùng vừa đổi, nên lấy làm chuẩn)
select public.sync_display_identity(p.id, p.full_name, p.avatar_url)
from public.profiles p
where p.id in (
  select user_id from public.photographers where user_id is not null
  union
  select photographer_user_id from public.bookings where photographer_user_id is not null
  union
  select client_id from public.bookings
);
