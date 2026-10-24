-- =============================================================================
-- Khoảng giá hiển thị ngoài thẻ photographer
-- Quy tắc: lấy giá của nhóm "Chụp ảnh" (category = 'photo') → min - max.
--          Nếu PTG không có giá chụp ảnh → lấy min - max của TẤT CẢ dịch vụ còn lại.
-- Chạy TOÀN BỘ file này 1 lần trong Supabase SQL Editor (chạy SAU 017).
-- =============================================================================

-- 1) Cột mới trên photographers
alter table public.photographers
  add column if not exists price_groups jsonb not null default '[]'::jsonb,
  add column if not exists price_min numeric,
  add column if not exists price_max numeric;

-- 2) Helper: từ price_groups → [min, max] theo quy tắc trên (không có giá → [null, null])
create or replace function public.price_range_from_groups(p_groups jsonb)
returns numeric[]
language sql
immutable
as $$
  with lines as (
    select
      g->>'category' as cat,
      nullif(regexp_replace(coalesce(l->>'price', ''), '[^0-9]', '', 'g'), '')::numeric as price
    from jsonb_array_elements(
           case when jsonb_typeof(p_groups) = 'array' then p_groups else '[]'::jsonb end
         ) g,
         jsonb_array_elements(
           case when jsonb_typeof(g->'lines') = 'array' then g->'lines' else '[]'::jsonb end
         ) l
  ),
  valid as (select cat, price from lines where price is not null and price > 0),
  photo as (select price from valid where cat = 'photo'),
  chosen as (
    select price from photo
    union all
    select price from valid where not exists (select 1 from photo)
  )
  select array[min(price), max(price)] from chosen;
$$;

-- 3) Hàm duyệt: bản 017 + lưu price_groups, price_min, price_max
create or replace function public.admin_set_application_status(
  p_user_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.photographer_applications%rowtype;
  v_price numeric := 0;
  v_range numeric[];
  v_specialty text;
  v_location text;
  v_tags jsonb;
  v_portfolio jsonb;
  v_packages jsonb;
  v_name text;
  v_locs jsonb;
  v_styles jsonb;
  v_langs jsonb;
  v_boards jsonb;
  v_pins jsonb;
  v_groups jsonb;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: admin only';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'status must be approved or rejected';
  end if;

  select * into app
  from public.photographer_applications
  where user_id = p_user_id;

  if not found then
    raise exception 'Application not found';
  end if;

  update public.photographer_applications
  set
    status = p_status,
    admin_note = p_note,
    reviewed_at = now()
  where user_id = p_user_id;

  if p_status = 'rejected' then
    delete from public.photographers where user_id = p_user_id;
    update public.profiles
    set role = 'customer'
    where id = p_user_id and role = 'photographer';

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  -- ── APPROVED ──
  update public.profiles
  set role = 'photographer'
  where id = p_user_id;

  v_locs   := case when jsonb_typeof(to_jsonb(app.work_locations))  = 'array' then to_jsonb(app.work_locations)  else '[]'::jsonb end;
  v_styles := case when jsonb_typeof(to_jsonb(app.selected_styles)) = 'array' then to_jsonb(app.selected_styles) else '[]'::jsonb end;
  v_langs  := case when jsonb_typeof(to_jsonb(app.languages))       = 'array' then to_jsonb(app.languages)       else '[]'::jsonb end;
  v_boards := case when jsonb_typeof(to_jsonb(app.boards))          = 'array' then to_jsonb(app.boards)          else '[]'::jsonb end;
  v_pins   := case when jsonb_typeof(to_jsonb(app.standalone_pins)) = 'array' then to_jsonb(app.standalone_pins) else '[]'::jsonb end;
  v_groups := case when jsonb_typeof(to_jsonb(app.price_groups))    = 'array' then to_jsonb(app.price_groups)    else '[]'::jsonb end;

  v_name     := coalesce(nullif(trim(app.full_name), ''), 'Photographer');
  v_location := coalesce(nullif(v_locs->>0, ''), 'Việt Nam');
  v_specialty := coalesce(nullif(v_styles->>0, ''), nullif(app.style_description, ''), 'Photography');

  -- Khoảng giá: ưu tiên "Chụp ảnh", không có thì lấy tất cả
  v_range := public.price_range_from_groups(v_groups);
  v_price := coalesce(v_range[1], 0);

  select coalesce(jsonb_agg(to_jsonb('#' || replace(s, ' ', ''))), '[]'::jsonb)
  into v_tags
  from jsonb_array_elements_text(v_styles) s;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  into v_portfolio
  from (
    select distinct p as x
    from (
      select t as p from jsonb_array_elements_text(v_pins) t
      union all
      select t
      from jsonb_array_elements(v_boards) b,
           jsonb_array_elements_text(
             case when jsonb_typeof(b->'pins') = 'array' then b->'pins' else '[]'::jsonb end
           ) t
    ) u
    where p is not null and p <> ''
  ) d;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', coalesce(line->>'name', g->>'title', 'Gói'),
        'price', coalesce(nullif(regexp_replace(coalesce(line->>'price', ''), '[^0-9]', '', 'g'), '')::numeric, 0),
        'desc', coalesce(line->>'detail', g->>'title', ''),
        'category', g->>'category',
        'includes', '[]'::jsonb
      )
    ),
    '[]'::jsonb
  )
  into v_packages
  from jsonb_array_elements(v_groups) g,
       jsonb_array_elements(
         case when jsonb_typeof(g->'lines') = 'array' then g->'lines' else '[]'::jsonb end
       ) line;

  insert into public.photographers as ph (
    user_id, name, location, price, rating, bookings,
    specialty, avatar, cover, portfolio, bio, tags, reviews, packages,
    boards, standalone_pins, pin_likes,
    work_locations, shooting_styles, experience_years, equipment, languages, work_model, experience_detail,
    price_groups, price_min, price_max
  )
  values (
    p_user_id, v_name, v_location, v_price, 0, 0,
    v_specialty, app.avatar_url, app.banner_url, v_portfolio, app.bio, v_tags, '[]'::jsonb, v_packages,
    v_boards, v_pins, '{}'::jsonb,
    v_locs, v_styles, app.experience_years, app.equipment, v_langs, app.work_model,
    coalesce(app.experience_detail, app.style_description),
    v_groups, v_range[1], v_range[2]
  )
  on conflict (user_id) do update set
    name = excluded.name,
    location = excluded.location,
    price = excluded.price,
    specialty = excluded.specialty,
    avatar = excluded.avatar,
    cover = excluded.cover,
    portfolio = excluded.portfolio,
    bio = excluded.bio,
    tags = excluded.tags,
    packages = excluded.packages,
    boards = excluded.boards,
    standalone_pins = excluded.standalone_pins,
    work_locations = excluded.work_locations,
    shooting_styles = excluded.shooting_styles,
    experience_years = excluded.experience_years,
    equipment = excluded.equipment,
    languages = excluded.languages,
    work_model = excluded.work_model,
    experience_detail = excluded.experience_detail,
    price_groups = excluded.price_groups,
    price_min = excluded.price_min,
    price_max = excluded.price_max;

  return jsonb_build_object('ok', true, 'status', 'approved', 'name', v_name);
end;
$$;

revoke all on function public.admin_set_application_status(uuid, text, text) from public;
grant execute on function public.admin_set_application_status(uuid, text, text) to authenticated;

-- 4) Backfill cho các photographer ĐÃ được duyệt trước đó (lấy từ hồ sơ gốc)
update public.photographers ph
set price_groups = x.groups,
    price_min    = x.rng[1],
    price_max    = x.rng[2],
    price        = coalesce(x.rng[1], ph.price)
from (
  select
    a.user_id,
    case when jsonb_typeof(to_jsonb(a.price_groups)) = 'array'
         then to_jsonb(a.price_groups) else '[]'::jsonb end as groups,
    public.price_range_from_groups(to_jsonb(a.price_groups)) as rng
  from public.photographer_applications a
) x
where ph.user_id = x.user_id;

-- Kiểm tra:
select name, price_min, price_max, price
from public.photographers
where user_id is not null;
