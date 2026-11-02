-- =====================================================================
-- Memento — kiểm tra mật khẩu hiện tại KHÔNG cần CAPTCHA
-- Chạy MỘT LẦN trong Supabase → SQL Editor (chạy lại an toàn).
--
-- Vì sao cần: các luồng "Xóa tài khoản" / "Đổi email" trước đây gọi signInWithPassword
-- rồi resetPasswordForEmail với CÙNG một token CAPTCHA. Token hCaptcha chỉ dùng được 1 lần,
-- nên lần gọi thứ hai bị Supabase từ chối ("captcha protection").
-- Giờ mật khẩu được kiểm tra ở đây, token CAPTCHA chỉ còn dùng cho việc gửi email OTP.
--
-- Chống dò mật khẩu: sai 5 lần trong 15 phút thì khóa tạm.
-- =====================================================================

create table if not exists public.password_check_attempts (
  user_id      uuid primary key,
  fails        int         not null default 0,
  window_start timestamptz not null default now()
);
-- Bật RLS và KHÔNG tạo policy: client không đọc/ghi trực tiếp được, chỉ hàm bên dưới (security definer) ghi.
alter table public.password_check_attempts enable row level security;

create or replace function public.verify_my_password(p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  uid uuid := auth.uid();
  h   text;
  ok  boolean;
  rec public.password_check_attempts%rowtype;
begin
  if uid is null then raise exception 'Chưa đăng nhập'; end if;

  select * into rec from public.password_check_attempts where user_id = uid;
  if found and rec.window_start > now() - interval '15 minutes' and rec.fails >= 5 then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;

  select encrypted_password into h from auth.users where id = uid;
  ok := coalesce(h, '') <> '' and h = crypt(p_password, h);

  if ok then
    delete from public.password_check_attempts where user_id = uid;
  else
    insert into public.password_check_attempts (user_id, fails, window_start)
    values (uid, 1, now())
    on conflict (user_id) do update
      set fails = case when public.password_check_attempts.window_start > now() - interval '15 minutes'
                       then public.password_check_attempts.fails + 1 else 1 end,
          window_start = case when public.password_check_attempts.window_start > now() - interval '15 minutes'
                              then public.password_check_attempts.window_start else now() end;
  end if;

  return ok;
end $$;

revoke all on function public.verify_my_password(text) from public;
grant execute on function public.verify_my_password(text) to authenticated;
