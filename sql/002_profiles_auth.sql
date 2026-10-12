-- Chạy trong Supabase SQL Editor (New query > paste > Run)

-- Bảng profiles: thông tin bổ sung cho mỗi user (Supabase Auth đã tự quản lý
-- email/password ở bảng auth.users riêng, ta không đụng vào bảng đó)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'customer' check (role in ('customer', 'photographer', 'admin')),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can read all profiles"
  on profiles for select
  using (true);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- Tự động tạo 1 dòng profiles mỗi khi có user mới đăng ký (email hoặc Google)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
