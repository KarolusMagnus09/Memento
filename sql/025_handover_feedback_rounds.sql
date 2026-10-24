-- 025: Bàn giao ảnh nhiều vòng — yêu cầu chỉnh sửa có ảnh đính kèm + lịch sử đổi link Drive
-- Chạy trong Supabase → SQL Editor SAU 022/023/024. Cần public.is_admin() (014).
-- Chưa chạy thử trên DB thật: hãy chạy trên staging trước.

-- ── 1) Yêu cầu chỉnh sửa: thêm số vòng, ảnh đính kèm, thời điểm đã chỉnh ──
alter table public.booking_photo_feedback
  add column if not exists round int,
  add column if not exists images text[] not null default '{}',
  add column if not exists resolved_at timestamptz;

-- Tối đa 4 ảnh mỗi yêu cầu
alter table public.booking_photo_feedback
  drop constraint if exists booking_photo_feedback_images_max4;
alter table public.booking_photo_feedback
  add constraint booking_photo_feedback_images_max4
  check (coalesce(array_length(images, 1), 0) <= 4);

-- Đánh số vòng cho dữ liệu cũ
update public.booking_photo_feedback f
set round = r.rn
from (
  select id, row_number() over (partition by booking_id order by created_at) as rn
  from public.booking_photo_feedback
) r
where f.id = r.id and f.round is null;

-- Tự đánh số vòng cho yêu cầu mới: 1, 2, 3...
create or replace function public.set_feedback_round()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(max(round), 0) + 1 into new.round
  from public.booking_photo_feedback
  where booking_id::text = new.booking_id::text;
  return new;
end;
$$;

drop trigger if exists trg_set_feedback_round on public.booking_photo_feedback;
create trigger trg_set_feedback_round
  before insert on public.booking_photo_feedback
  for each row execute function public.set_feedback_round();

-- ── 2) RLS: khách + photographer của đơn + admin xem được; chỉ khách gửi được (khi đang bàn giao) ──
alter table public.booking_photo_feedback enable row level security;

drop policy if exists "feedback_select_parties" on public.booking_photo_feedback;
create policy "feedback_select_parties" on public.booking_photo_feedback
  for select using (
    public.is_admin() or exists (
      select 1 from public.bookings b
      where b.id::text = booking_photo_feedback.booking_id::text
        and (b.client_id::text = auth.uid()::text or b.photographer_user_id::text = auth.uid()::text)
    )
  );

drop policy if exists "feedback_insert_client" on public.booking_photo_feedback;
create policy "feedback_insert_client" on public.booking_photo_feedback
  for insert with check (
    user_id::text = auth.uid()::text and exists (
      select 1 from public.bookings b
      where b.id::text = booking_photo_feedback.booking_id::text
        and b.client_id::text = auth.uid()::text
        and b.status = 'handover'
    )
  );

-- Photographer đánh dấu "đã chỉnh xong" qua RPC (chỉ đổi được cờ resolved, không sửa nội dung yêu cầu)
create or replace function public.ptg_resolve_feedback(p_feedback_id text, p_resolved boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_owner text;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;

  select b.photographer_user_id::text into v_owner
  from public.booking_photo_feedback f
  join public.bookings b on b.id::text = f.booking_id::text
  where f.id::text = p_feedback_id;

  if v_owner is null then raise exception 'Không tìm thấy yêu cầu'; end if;
  if v_owner <> auth.uid()::text then raise exception 'Forbidden'; end if;

  update public.booking_photo_feedback
  set resolved = p_resolved,
      resolved_at = case when p_resolved then now() else null end
  where id::text = p_feedback_id;
end;
$$;
grant execute on function public.ptg_resolve_feedback(text, boolean) to authenticated;

-- ── 3) Lịch sử đổi link Drive: mỗi lần drive_url đổi → lưu link cũ + link mới ──
create table if not exists public.booking_drive_links (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null,
  old_url text,
  new_url text not null,
  changed_by uuid,                      -- null nếu do hệ thống/service_role đổi
  created_at timestamptz not null default now()
);
create index if not exists booking_drive_links_booking_idx
  on public.booking_drive_links (booking_id, created_at);

alter table public.booking_drive_links enable row level security;
drop policy if exists "drive_links_select_parties" on public.booking_drive_links;
create policy "drive_links_select_parties" on public.booking_drive_links
  for select using (
    public.is_admin() or exists (
      select 1 from public.bookings b
      where b.id::text = booking_drive_links.booking_id
        and (b.client_id::text = auth.uid()::text or b.photographer_user_id::text = auth.uid()::text)
    )
  );
-- Không có policy insert/update/delete: chỉ trigger bên dưới ghi được → không ai sửa/xóa được lịch sử.

create or replace function public.log_drive_link_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.drive_url is not null and new.drive_url is distinct from old.drive_url then
    insert into public.booking_drive_links (booking_id, old_url, new_url, changed_by)
    values (new.id::text, old.drive_url, new.drive_url, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_drive_link_change on public.bookings;
create trigger trg_log_drive_link_change
  after update of drive_url on public.bookings
  for each row execute function public.log_drive_link_change();

-- Ghi lại link hiện có của các đơn cũ làm mốc đầu tiên
insert into public.booking_drive_links (booking_id, old_url, new_url)
select id::text, null, drive_url
from public.bookings b
where drive_url is not null
  and not exists (select 1 from public.booking_drive_links l where l.booking_id = b.id::text);

-- ── 4) Kho ảnh đính kèm yêu cầu chỉnh sửa (riêng tư, ≤ 5MB/ảnh, chỉ jpg/png/webp) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-images', 'feedback-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Đường dẫn file: <user_id>/<booking_id>/<uuid>.jpg
drop policy if exists "feedback_img_insert" on storage.objects;
create policy "feedback_img_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feedback-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "feedback_img_select" on storage.objects;
create policy "feedback_img_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'feedback-images' and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.bookings b
        where b.id::text = (storage.foldername(name))[2]
          and (b.client_id::text = auth.uid()::text or b.photographer_user_id::text = auth.uid()::text)
      )
    )
  );
