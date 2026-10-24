-- Chạy trong Supabase SQL Editor (New query > paste > Run)
-- Bổ sung dữ liệu cho luồng Onboarding kiểu Facebook sau khi đăng ký:
-- tên hiển thị, ảnh đại diện, giới tính, số điện thoại, và cờ đánh dấu
-- người dùng đã đi qua onboarding hay chưa.

alter table profiles add column if not exists phone text;
alter table profiles add column if not exists gender text
  check (gender in ('female', 'male', 'other'));
alter table profiles add column if not exists onboarding_completed boolean not null default false;

-- Những user đã tồn tại TRƯỚC migration này coi như đã "dùng app rồi" —
-- không ép họ phải đi qua onboarding một cách bất ngờ ở lần đăng nhập kế tiếp.
-- Chỉ user đăng ký MỚI sau khi chạy file này mới có onboarding_completed = false mặc định.
update profiles set onboarding_completed = true where onboarding_completed = false;

-- ── Bucket lưu ảnh đại diện ──────────────────────────────────────────────
-- Mỗi file được lưu theo đường dẫn "{user_id}/avatar.<ext>" để policy dưới
-- đây có thể so khớp thư mục đầu tiên với auth.uid() của người upload.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
