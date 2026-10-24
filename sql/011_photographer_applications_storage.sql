-- Chạy trong Supabase Dashboard > SQL Editor
-- Bucket lưu ảnh hồ sơ nhiếp ảnh gia (banner, portfolio, CCCD, avatar ứng tuyển).
-- Public = true để portfolio / banner hiển thị lâu dài (không phụ thuộc signed URL 7 ngày).
-- Policy: ai cũng đọc được; chỉ chủ sở hữu (folder = auth.uid()) mới upload/sửa/xóa.

insert into storage.buckets (id, name, public)
values ('photographer-applications', 'photographer-applications', true)
on conflict (id) do update set public = true;

-- Đọc công khai (portfolio hiển thị được)
drop policy if exists "Photographer applications public read" on storage.objects;
create policy "Photographer applications public read"
  on storage.objects for select
  using (bucket_id = 'photographer-applications');

-- User chỉ upload vào thư mục của chính mình: {user_id}/...
drop policy if exists "Users upload own application files" on storage.objects;
create policy "Users upload own application files"
  on storage.objects for insert
  with check (
    bucket_id = 'photographer-applications'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own application files" on storage.objects;
create policy "Users update own application files"
  on storage.objects for update
  using (
    bucket_id = 'photographer-applications'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own application files" on storage.objects;
create policy "Users delete own application files"
  on storage.objects for delete
  using (
    bucket_id = 'photographer-applications'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
