-- ═══════════════════════════════════════════════════════════
-- Photo likes (online) + Reviews + Report review
-- Bản đã sửa lỗi 42P13 (cannot remove parameter defaults):
-- drop các function cũ trước khi tạo lại.
-- ═══════════════════════════════════════════════════════════

-- 0) Xóa function cũ (an toàn nếu chưa tồn tại). Quyền execute được cấp lại ở cuối file.
drop function if exists public.get_photo_likes(bigint);
drop function if exists public.toggle_photo_like(bigint, text);
drop function if exists public.submit_review(bigint, integer, text);
drop function if exists public.list_photographer_reviews(bigint, integer, integer);
drop function if exists public.get_review_summary(bigint);
drop function if exists public.delete_my_review(bigint);
drop function if exists public.report_review(uuid, text, text);

-- 1) Lượt tim từng ảnh
create table if not exists public.photo_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  photographer_id bigint not null,
  photo_url text not null,
  created_at timestamptz not null default now(),
  unique (user_id, photo_url)
);
create index if not exists photo_likes_ptg_url_idx on public.photo_likes (photographer_id, photo_url);
create index if not exists photo_likes_user_idx on public.photo_likes (user_id);

alter table public.photo_likes enable row level security;

drop policy if exists "photo_likes_select" on public.photo_likes;
create policy "photo_likes_select" on public.photo_likes for select using (true);

drop policy if exists "photo_likes_insert_own" on public.photo_likes;
create policy "photo_likes_insert_own" on public.photo_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "photo_likes_delete_own" on public.photo_likes;
create policy "photo_likes_delete_own" on public.photo_likes
  for delete using (auth.uid() = user_id);

-- Đếm + trạng thái like của user hiện tại cho 1 photographer
create or replace function public.get_photo_likes(p_photographer_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  counts jsonb;
  mine text[];
begin
  select coalesce(jsonb_object_agg(photo_url, cnt), '{}'::jsonb)
  into counts
  from (
    select photo_url, count(*)::int as cnt
    from public.photo_likes
    where photographer_id = p_photographer_id
    group by photo_url
  ) s;

  select coalesce(array_agg(photo_url), '{}')
  into mine
  from public.photo_likes
  where photographer_id = p_photographer_id and user_id = uid;

  return jsonb_build_object('counts', counts, 'liked_urls', to_jsonb(mine));
end;
$$;

-- Toggle like 1 ảnh; đồng bộ photographers.pin_likes
create or replace function public.toggle_photo_like(p_photographer_id bigint, p_photo_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  liked boolean;
  cnt int;
  likes jsonb;
begin
  if uid is null then
    raise exception 'Bạn cần đăng nhập để thả tim';
  end if;
  if p_photo_url is null or length(trim(p_photo_url)) = 0 then
    raise exception 'Thiếu URL ảnh';
  end if;

  if exists (
    select 1 from public.photo_likes
    where user_id = uid and photo_url = p_photo_url
  ) then
    delete from public.photo_likes where user_id = uid and photo_url = p_photo_url;
    liked := false;
  else
    insert into public.photo_likes (user_id, photographer_id, photo_url)
    values (uid, p_photographer_id, p_photo_url)
    on conflict (user_id, photo_url) do nothing;
    liked := true;
  end if;

  select count(*)::int into cnt from public.photo_likes where photo_url = p_photo_url;

  -- Cập nhật denormalized pin_likes trên photographers
  update public.photographers
  set pin_likes = coalesce(pin_likes, '{}'::jsonb) || jsonb_build_object(p_photo_url, cnt)
  where id = p_photographer_id;

  return jsonb_build_object('liked', liked, 'count', cnt);
end;
$$;

grant execute on function public.get_photo_likes(bigint) to authenticated, anon;
grant execute on function public.toggle_photo_like(bigint, text) to authenticated;

-- 2) Reviews
create table if not exists public.photographer_reviews (
  id uuid primary key default gen_random_uuid(),
  photographer_id bigint not null,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text not null default '',
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (photographer_id, reviewer_id)
);
create index if not exists photographer_reviews_ptg_idx
  on public.photographer_reviews (photographer_id, created_at desc);

alter table public.photographer_reviews enable row level security;

drop policy if exists "reviews_select_public" on public.photographer_reviews;
create policy "reviews_select_public" on public.photographer_reviews
  for select using (hidden = false or reviewer_id = auth.uid());

drop policy if exists "reviews_insert_own" on public.photographer_reviews;
create policy "reviews_insert_own" on public.photographer_reviews
  for insert with check (auth.uid() = reviewer_id);

drop policy if exists "reviews_update_own" on public.photographer_reviews;
create policy "reviews_update_own" on public.photographer_reviews
  for update using (auth.uid() = reviewer_id);

drop policy if exists "reviews_delete_own" on public.photographer_reviews;
create policy "reviews_delete_own" on public.photographer_reviews
  for delete using (auth.uid() = reviewer_id);

-- Report review
create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.photographer_reviews(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);
alter table public.review_reports enable row level security;
drop policy if exists "review_reports_insert" on public.review_reports;
create policy "review_reports_insert" on public.review_reports
  for insert with check (auth.uid() = reporter_id);
drop policy if exists "review_reports_select_admin" on public.review_reports;
create policy "review_reports_select_admin" on public.review_reports
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create or replace function public.submit_review(
  p_photographer_id bigint,
  p_rating int,
  p_comment text default ''
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Bạn cần đăng nhập'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Sao phải từ 1 đến 5'; end if;
  insert into public.photographer_reviews (photographer_id, reviewer_id, rating, comment, updated_at)
  values (p_photographer_id, uid, p_rating, coalesce(p_comment, ''), now())
  on conflict (photographer_id, reviewer_id) do update
    set rating = excluded.rating,
        comment = excluded.comment,
        updated_at = now(),
        hidden = false;
end;
$$;

create or replace function public.list_photographer_reviews(
  p_photographer_id bigint,
  p_limit int default 20,
  p_offset int default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  into result
  from (
    select
      r.id,
      r.reviewer_id,
      coalesce(p.full_name, p.username, 'Người dùng') as reviewer_name,
      p.avatar_url as reviewer_avatar,
      exists (
        select 1 from public.photographers ph where ph.user_id = r.reviewer_id
      ) as reviewer_is_photographer,
      r.rating,
      r.comment,
      exists (
        select 1 from public.bookings b
        where b.client_id = r.reviewer_id
          and b.photographer_id = p_photographer_id
          and b.status in ('completed', 'paid')
      ) as has_deal,
      r.created_at,
      r.updated_at
    from public.photographer_reviews r
    left join public.profiles p on p.id = r.reviewer_id
    where r.photographer_id = p_photographer_id and r.hidden = false
    order by r.created_at desc
    limit greatest(p_limit, 1)
    offset greatest(p_offset, 0)
  ) x;
  return result;
end;
$$;

create or replace function public.get_review_summary(p_photographer_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cnt int;
  avg_r numeric;
  b1 int; b2 int; b3 int; b4 int; b5 int;
  my jsonb;
begin
  select count(*), coalesce(avg(rating), 0),
    count(*) filter (where rating = 1),
    count(*) filter (where rating = 2),
    count(*) filter (where rating = 3),
    count(*) filter (where rating = 4),
    count(*) filter (where rating = 5)
  into cnt, avg_r, b1, b2, b3, b4, b5
  from public.photographer_reviews
  where photographer_id = p_photographer_id and hidden = false;

  select to_jsonb(x) into my
  from (
    select id, rating, comment, hidden
    from public.photographer_reviews
    where photographer_id = p_photographer_id and reviewer_id = uid
    limit 1
  ) x;

  return jsonb_build_object(
    'count', cnt,
    'average', round(avg_r::numeric, 1),
    'breakdown', jsonb_build_object('1', b1, '2', b2, '3', b3, '4', b4, '5', b5),
    'my_review', my
  );
end;
$$;

create or replace function public.delete_my_review(p_photographer_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.photographer_reviews
  where photographer_id = p_photographer_id and reviewer_id = auth.uid();
end;
$$;

create or replace function public.report_review(
  p_review_id uuid,
  p_reason text,
  p_description text default ''
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Bạn cần đăng nhập'; end if;
  insert into public.review_reports (review_id, reporter_id, reason, description)
  values (p_review_id, uid, coalesce(p_reason, 'Khác'), coalesce(p_description, ''))
  on conflict (review_id, reporter_id) do update
    set reason = excluded.reason, description = excluded.description;
end;
$$;

grant execute on function public.submit_review(bigint, int, text) to authenticated;
grant execute on function public.list_photographer_reviews(bigint, int, int) to authenticated, anon;
grant execute on function public.get_review_summary(bigint) to authenticated, anon;
grant execute on function public.delete_my_review(bigint) to authenticated;
grant execute on function public.report_review(uuid, text, text) to authenticated;
