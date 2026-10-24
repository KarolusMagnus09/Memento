-- 031: Số liệu thật cho thẻ photographer ngoài danh sách (rating / số đánh giá / buổi chụp / tim)
-- Gọi lại đúng 2 RPC mà trang hồ sơ đang dùng (get_review_summary, get_profile_stats)
-- => thẻ ngoài và trang hồ sơ luôn cùng một con số.
-- Chạy trong Supabase SQL Editor.

create or replace function public.get_photographers_stats()
returns table (
  photographer_id bigint,
  rating numeric,
  review_count int,
  completed_deals int,
  hearts int
)
language sql m 
stable
security definer
set search_path = public
as $$
  select
    p.id::bigint,
    coalesce((rs.r ->> 'average')::numeric, 0),
    coalesce((rs.r ->> 'count')::int, 0),
    coalesce((st.s ->> 'completed_deals')::int, 0),
    coalesce((st.s ->> 'hearts')::int, 0)
  from public.photographers p
  cross join lateral (select public.get_review_summary(p.id) as r) rs
  cross join lateral (select public.get_profile_stats(p.id) as s) st;
$$;

grant execute on function public.get_photographers_stats() to anon, authenticated;
