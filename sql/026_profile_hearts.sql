-- 026: Thả tim hồ sơ photographer (mỗi tài khoản 1 tim/photographer, lưu vĩnh viễn)
-- + đếm số buổi chụp thành công từ bảng bookings.
-- Chạy trong Supabase → SQL Editor. Chưa chạy thử trên DB thật: hãy chạy trên staging trước.

create table if not exists public.profile_hearts (
  user_id uuid not null references auth.users (id) on delete cascade,
  photographer_id bigint not null,
  -- Đơn hoàn tất gần nhất giữa tài khoản này và photographer (null nếu chưa từng chốt deal)
  deal_booking_id text,
  created_at timestamptz not null default now(),
  primary key (user_id, photographer_id)      -- ràng buộc: 1 tài khoản chỉ có 1 tim cho 1 photographer
);

alter table public.profile_hearts enable row level security;
drop policy if exists "hearts_select_own" on public.profile_hearts;
create policy "hearts_select_own" on public.profile_hearts
  for select using (user_id = auth.uid());
-- Không có policy insert/delete: chỉ ghi qua hàm toggle_profile_heart bên dưới.

-- Số tim, mình đã tim chưa, số buổi chụp đã hoàn tất của 1 photographer (ai cũng gọi được)
create or replace function public.get_profile_stats(p_photographer_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'hearts',
      (select count(*) from public.profile_hearts h where h.photographer_id = p_photographer_id),
    'hearted',
      coalesce((select true from public.profile_hearts h
                where h.photographer_id = p_photographer_id and h.user_id = auth.uid()), false),
    'completed_deals',
      (select count(*) from public.bookings b
       where b.photographer_id = p_photographer_id and b.status = 'completed')
  );
$$;
grant execute on function public.get_profile_stats(bigint) to anon, authenticated;

-- Bấm tim: chưa tim → thêm; đã tim → bỏ. Trả về số liệu mới.
create or replace function public.toggle_profile_heart(p_photographer_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner text;
  v_deal text;
begin
  if v_uid is null then raise exception 'Bạn cần đăng nhập để thả tim'; end if;

  select user_id::text into v_owner from public.photographers where id = p_photographer_id;
  if v_owner is null and not exists (select 1 from public.photographers where id = p_photographer_id) then
    raise exception 'Không tìm thấy hồ sơ photographer';
  end if;
  if v_owner = v_uid::text then raise exception 'Bạn không thể thả tim hồ sơ của chính mình'; end if;

  if exists (select 1 from public.profile_hearts
             where user_id = v_uid and photographer_id = p_photographer_id) then
    delete from public.profile_hearts
    where user_id = v_uid and photographer_id = p_photographer_id;
  else
    select b.id::text into v_deal
    from public.bookings b
    where b.photographer_id = p_photographer_id
      and b.client_id::text = v_uid::text
      and b.status = 'completed'
    order by coalesce(b.final_paid_at, b.updated_at) desc
    limit 1;

    insert into public.profile_hearts (user_id, photographer_id, deal_booking_id)
    values (v_uid, p_photographer_id, v_deal)
    on conflict (user_id, photographer_id) do nothing;
  end if;

  return public.get_profile_stats(p_photographer_id);
end;
$$;
grant execute on function public.toggle_profile_heart(bigint) to authenticated;
