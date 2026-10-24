-- Chạy trong Supabase SQL Editor (New query > paste > Run)
--
-- Khi user đổi email trong app (Personal Info), ta gọi
-- supabase.auth.updateUser({ email }) — Supabase gửi email xác nhận tới địa
-- chỉ mới, và auth.users.email CHỈ thật sự đổi sau khi user bấm link xác
-- nhận đó. Trigger dưới đây tự đồng bộ profiles.email ngay khi việc đó xảy
-- ra, để không phải tự tay cập nhật từ phía client.

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();
