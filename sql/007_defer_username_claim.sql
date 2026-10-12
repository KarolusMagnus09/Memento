-- Chạy trong Supabase SQL Editor (New query > paste > Run)
--
-- VẤN ĐỀ: trigger handle_new_user() hiện tại lưu "username" người dùng gõ lúc
-- ĐĂNG KÝ vào profiles NGAY LẬP TỨC (trước khi họ xác nhận email xong). Nếu
-- user bỏ ngang giữa chừng (không xác nhận email), username đó bị "chiếm chỗ"
-- vĩnh viễn vì có unique index, chặn người khác dùng lại tên đó mãi mãi.
--
-- GIẢI PHÁP: lúc đăng ký, KHÔNG dùng username người dùng gõ nữa — luôn tạo
-- username tạm ngẫu nhiên (không xung đột). Username thật họ muốn chỉ được
-- "claim" (giữ chỗ thật sự) ở bước đầu tiên của Onboarding — tức là SAU KHI
-- đã xác nhận email và đăng nhập thành công.

-- 1) Trigger: bỏ đọc "username" từ metadata lúc đăng ký, luôn dùng placeholder.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url, email)
  values (
    new.id,
    'user_' || substr(new.id::text, 1, 8),
    new.email,
    new.raw_user_meta_data->>'avatar_url',
    new.email
  );
  return new;
end;
$$;

-- 2) RPC an toàn để user tự "claim" username thật cho chính mình, dùng ở
-- bước đầu Onboarding. Chỉ cho phép đổi username của CHÍNH MÌNH (auth.uid()),
-- không cho đổi hộ người khác. Trả về true nếu đổi thành công, false nếu tên
-- đã có người dùng (race condition vẫn an toàn nhờ unique index bên dưới).
create or replace function public.claim_username(p_username text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để thực hiện thao tác này.';
  end if;

  begin
    update public.profiles
    set username = p_username
    where id = v_uid;
    return true;
  exception when unique_violation then
    return false;
  end;
end;
$$;

grant execute on function public.claim_username(text) to authenticated;
