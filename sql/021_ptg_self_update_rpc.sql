-- =============================================================================
-- MEMENTO — PTG đã duyệt tự cập nhật hồ sơ (bảng giá, ảnh, board, bio, phong cách…)
-- Chạy TOÀN BỘ file này 1 lần trong Supabase SQL Editor (sau 014 / 018).
--
-- Vì sao cần: sau khi admin duyệt, RLS (sql/014) CHẶN PTG UPDATE photographer_applications,
-- và bảng photographers không có policy UPDATE cho chủ hồ sơ → app lưu "thành công"
-- nhưng DB không đổi gì. Hàm dưới đây (security definer) chỉ cho PTG sửa đúng các trường
-- cho phép của CHÍNH MÌNH, rồi đồng bộ sang photographers (kể cả price_min / price_max).
-- PTG KHÔNG thể sửa rating, bookings, reviews, status, role.
-- =============================================================================

-- 1) Cột còn thiếu trên photographers (marketplace)
alter table public.photographers
  add column if not exists skill_makeup boolean not null default false,
  add column if not exists skill_edit   boolean not null default false,
  add column if not exists skill_rental boolean not null default false,
  add column if not exists rental_boards jsonb not null default '[]'::jsonb,
  add column if not exists rental_pins   jsonb not null default '[]'::jsonb,
  add column if not exists price_groups  jsonb not null default '[]'::jsonb,
  add column if not exists price_min numeric,
  add column if not exists price_max numeric;

alter table public.photographer_applications
  add column if not exists updated_at timestamptz;

-- 2) RPC
create or replace function public.update_my_ptg_profile(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  app public.photographer_applications%rowtype;
  r   public.photographer_applications%rowtype;
  v_locs jsonb; v_styles jsonb; v_langs jsonb; v_boards jsonb; v_pins jsonb;
  v_groups jsonb; v_rboards jsonb; v_rpins jsonb;
  v_range numeric[]; v_price numeric := 0;
  v_specialty text; v_location text;
  v_tags jsonb; v_portfolio jsonb; v_packages jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into app from public.photographer_applications where user_id = uid;
  if not found then
    raise exception 'Chưa có hồ sơ nhiếp ảnh gia';
  end if;
  if app.status is distinct from 'approved' then
    raise exception 'Chỉ hồ sơ đã được duyệt mới dùng cập nhật nhanh';
  end if;

  -- Parse patch theo đúng kiểu cột (jsonb / text[] / boolean…)
  select * into r from jsonb_populate_record(null::public.photographer_applications, p_patch);

  -- 2a) Ghi vào hồ sơ gốc — CHỈ các trường cho phép, và chỉ khi patch có gửi trường đó
  update public.photographer_applications a set
    bio               = case when p_patch ? 'bio'               then r.bio               else a.bio               end,
    equipment         = case when p_patch ? 'equipment'         then r.equipment         else a.equipment         end,
    experience_years  = case when p_patch ? 'experience_years'  then r.experience_years  else a.experience_years  end,
    style_description = case when p_patch ? 'style_description' then r.style_description else a.style_description end,
    selected_styles   = case when p_patch ? 'selected_styles'   then r.selected_styles   else a.selected_styles   end,
    languages         = case when p_patch ? 'languages'         then r.languages         else a.languages         end,
    work_model        = case when p_patch ? 'work_model'        then r.work_model        else a.work_model        end,
    work_locations    = case when p_patch ? 'work_locations'    then r.work_locations    else a.work_locations    end,
    skill_makeup      = case when p_patch ? 'skill_makeup'      then r.skill_makeup      else a.skill_makeup      end,
    skill_edit        = case when p_patch ? 'skill_edit'        then r.skill_edit        else a.skill_edit        end,
    skill_rental      = case when p_patch ? 'skill_rental'      then r.skill_rental      else a.skill_rental      end,
    price_groups      = case when p_patch ? 'price_groups'      then r.price_groups      else a.price_groups      end,
    standalone_pins   = case when p_patch ? 'standalone_pins'   then r.standalone_pins   else a.standalone_pins   end,
    boards            = case when p_patch ? 'boards'            then r.boards            else a.boards            end,
    rental_pins       = case when p_patch ? 'rental_pins'       then r.rental_pins       else a.rental_pins       end,
    rental_boards     = case when p_patch ? 'rental_boards'     then r.rental_boards     else a.rental_boards     end,
    updated_at        = now()
  where a.user_id = uid;

  -- 2b) Đọc lại bản đã lưu → đồng bộ sang photographers (cùng quy tắc với admin_set_application_status)
  select * into app from public.photographer_applications where user_id = uid;

  v_locs    := case when jsonb_typeof(to_jsonb(app.work_locations))  = 'array' then to_jsonb(app.work_locations)  else '[]'::jsonb end;
  v_styles  := case when jsonb_typeof(to_jsonb(app.selected_styles)) = 'array' then to_jsonb(app.selected_styles) else '[]'::jsonb end;
  v_langs   := case when jsonb_typeof(to_jsonb(app.languages))       = 'array' then to_jsonb(app.languages)       else '[]'::jsonb end;
  v_boards  := case when jsonb_typeof(to_jsonb(app.boards))          = 'array' then to_jsonb(app.boards)          else '[]'::jsonb end;
  v_pins    := case when jsonb_typeof(to_jsonb(app.standalone_pins)) = 'array' then to_jsonb(app.standalone_pins) else '[]'::jsonb end;
  v_groups  := case when jsonb_typeof(to_jsonb(app.price_groups))    = 'array' then to_jsonb(app.price_groups)    else '[]'::jsonb end;
  v_rboards := case when jsonb_typeof(to_jsonb(app.rental_boards))   = 'array' then to_jsonb(app.rental_boards)   else '[]'::jsonb end;
  v_rpins   := case when jsonb_typeof(to_jsonb(app.rental_pins))     = 'array' then to_jsonb(app.rental_pins)     else '[]'::jsonb end;

  v_location  := coalesce(nullif(v_locs->>0, ''), 'Việt Nam');
  v_specialty := coalesce(nullif(v_styles->>0, ''), nullif(app.style_description, ''), 'Photography');

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

  update public.photographers set
    location        = v_location,
    price           = v_price,
    price_min       = v_range[1],
    price_max       = v_range[2],
    price_groups    = v_groups,
    packages        = v_packages,
    specialty       = v_specialty,
    tags            = v_tags,
    shooting_styles = v_styles,
    work_locations  = v_locs,
    bio             = app.bio,
    equipment       = app.equipment,
    experience_years = app.experience_years,
    languages       = v_langs,
    work_model      = app.work_model,
    experience_detail = coalesce(app.experience_detail, app.style_description),
    boards          = v_boards,
    standalone_pins = v_pins,
    portfolio       = v_portfolio,
    skill_makeup    = coalesce(app.skill_makeup, false),
    skill_edit      = coalesce(app.skill_edit, false),
    skill_rental    = coalesce(app.skill_rental, false),
    rental_boards   = v_rboards,
    rental_pins     = v_rpins
  where user_id = uid;

  return jsonb_build_object(
    'ok', true,
    'price_min', v_range[1],
    'price_max', v_range[2],
    'groups', jsonb_array_length(v_groups)
  );
end;
$$;

revoke all on function public.update_my_ptg_profile(jsonb) from public;
grant execute on function public.update_my_ptg_profile(jsonb) to authenticated;
