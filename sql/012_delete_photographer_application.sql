-- Chạy trong Supabase SQL Editor
-- 1) User được XÓA hồ sơ đăng ký PTG của chính mình
-- 2) Admin được SELECT/UPDATE mọi hồ sơ (duyệt / từ chối + admin_note)

-- DELETE own application
drop policy if exists "own application - delete" on public.photographer_applications;
create policy "own application - delete"
  on public.photographer_applications for delete
  using (auth.uid() = user_id);

-- Admin full read
drop policy if exists "admin - select all applications" on public.photographer_applications;
create policy "admin - select all applications"
  on public.photographer_applications for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Admin update (status, admin_note, …)
drop policy if exists "admin - update all applications" on public.photographer_applications;
create policy "admin - update all applications"
  on public.photographer_applications for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Đảm bảo cột admin_note tồn tại
alter table public.photographer_applications
  add column if not exists admin_note text;
