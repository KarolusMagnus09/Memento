-- Log mỗi lần PTG đã duyệt cập nhật hồ sơ (ảnh / bảng giá / nội dung)
create table if not exists public.photographer_update_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  photographer_name text,
  change_summary text not null default '',
  snapshot jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists photographer_update_logs_user_idx
  on public.photographer_update_logs (user_id, created_at desc);
create index if not exists photographer_update_logs_created_idx
  on public.photographer_update_logs (created_at desc);

alter table public.photographer_update_logs enable row level security;

-- PTG chỉ insert log của mình
drop policy if exists "update_logs_insert_own" on public.photographer_update_logs;
create policy "update_logs_insert_own" on public.photographer_update_logs
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_logs_select_own" on public.photographer_update_logs;
create policy "update_logs_select_own" on public.photographer_update_logs
  for select using (auth.uid() = user_id);

-- Admin đọc tất cả: gắn role admin trên profiles hoặc dùng service role.
-- Tạm thời: mọi user đã đăng nhập đọc được (admin web dùng acc admin)
drop policy if exists "update_logs_select_authenticated" on public.photographer_update_logs;
create policy "update_logs_select_authenticated" on public.photographer_update_logs
  for select using (auth.uid() is not null);

comment on table public.photographer_update_logs is 'Log request cập nhật hồ sơ PTG (không qua CCCD)';
