-- Chạy trong Supabase SQL Editor (New query > paste > Run)
--
-- Tách "tên tài khoản" (username, duy nhất, đặt lúc đăng ký) ra khỏi
-- "tên hiển thị" (full_name, đặt/đổi ở Onboarding hoặc Thông tin cá nhân,
-- không cần duy nhất). Trước migration này, field "Họ tên" lúc đăng ký lưu
-- thẳng vào full_name — giờ đổi sang username.

alter table profiles add column if not exists username text;

-- User cũ (tạo trước migration này) chưa có username — tạm lấy từ full_name
-- hiện có (hoặc sinh 1 tên tạm) để cột không bị trống. Họ có thể đổi lại
-- trong app nếu muốn.
update profiles
set username = coalesce(nullif(trim(full_name), ''), 'user_' || substr(id::text, 1, 8))
where username is null;

alter table profiles alter column username set not null;

-- So khớp không phân biệt hoa/thường khi kiểm tra trùng tên (VD "Hoang" và
-- "hoang" tính là một, tránh 2 người đăng ký được username gây nhầm lẫn).
create unique index if not exists profiles_username_lower_idx on profiles (lower(username));

-- Cập nhật trigger: đọc "username" từ metadata lúc signUp() thay vì "full_name".
-- full_name vẫn được set = username lúc đầu, để có tên hiển thị tạm trước khi
-- user tự đổi ở bước Onboarding ("Tên hiển thị").
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'username', new.email),
    new.raw_user_meta_data->>'avatar_url',
    new.email
  );
  return new;
end;
$$;

-- ── XÁC MINH SỐ ĐIỆN THOẠI ────────────────────────────────────────────────
-- true = số điện thoại trong "phone" đã được xác minh qua OTP SMS thật.
alter table profiles add column if not exists phone_verified boolean not null default false;
