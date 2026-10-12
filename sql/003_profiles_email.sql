-- Chạy trong Supabase SQL Editor (New query > paste > Run)
-- Thêm cột email vào profiles để có thể kiểm tra "email này đã có tài khoản chưa"
-- từ phía client (trước đó chỉ auth.users mới có email, bảng đó không truy cập
-- trực tiếp được từ client vì lý do bảo mật).

alter table profiles add column if not exists email text;

-- Nạp lại email cho các user đã tồn tại trước khi có cột này
update profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Cập nhật lại trigger để mọi user đăng ký MỚI cũng tự động lưu email vào profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    new.email
  );
  return new;
end;
$$;

-- Lưu ý bảo mật: bảng profiles đã có policy "Public read access" cho phép
-- SELECT tự do (xem sql/002_profiles_auth.sql) — nghĩa là bất kỳ ai cũng
-- kiểm tra được 1 email có tài khoản hay không (đánh đổi UX lấy bảo mật,
-- đã xác nhận với chủ dự án).
