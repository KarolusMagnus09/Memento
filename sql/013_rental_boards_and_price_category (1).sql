-- Thêm cột cho Thuê & phụ kiện + đảm bảo price_groups / skill_rental tồn tại
-- Chạy trong Supabase Dashboard → SQL Editor (một lần).

-- ── Cột skill & bảng giá ───────────────────────────────────────────────────
alter table public.photographer_applications
  add column if not exists skill_makeup boolean default false;

alter table public.photographer_applications
  add column if not exists skill_edit boolean default false;

alter table public.photographer_applications
  add column if not exists skill_rental boolean default false;

alter table public.photographer_applications
  add column if not exists price_groups jsonb default '[]'::jsonb;

-- ── Portfolio chụp (nếu chưa có) ───────────────────────────────────────────
alter table public.photographer_applications
  add column if not exists boards jsonb default '[]'::jsonb;

alter table public.photographer_applications
  add column if not exists standalone_pins jsonb default '[]'::jsonb;

-- ── Thuê & phụ kiện: board + ảnh lẻ (TÁCH khỏi portfolio chụp) ─────────────
alter table public.photographer_applications
  add column if not exists rental_boards jsonb default '[]'::jsonb;

alter table public.photographer_applications
  add column if not exists rental_pins jsonb default '[]'::jsonb;

-- Comment mô tả (tuỳ chọn, giúp nhìn Table Editor rõ hơn)
comment on column public.photographer_applications.skill_rental is
  'User tick skill Thuê & phụ kiện ở form đăng ký';
comment on column public.photographer_applications.price_groups is
  'JSON array: [{ id, title, category: photo|makeup|editor|rental, lines: [{id,name,price,detail}] }]';
comment on column public.photographer_applications.rental_boards is
  'JSON array board chỉ cho tab Thuê & phụ kiện: [{ id, name, private, cover, pins[] }]';
comment on column public.photographer_applications.rental_pins is
  'JSON array URL ảnh lẻ chỉ cho tab Thuê & phụ kiện';

-- Kiểm tra nhanh sau khi chạy:
-- select column_name, data_type
-- from information_schema.columns
-- where table_name = 'photographer_applications'
--   and column_name in ('skill_rental','price_groups','rental_boards','rental_pins','boards','standalone_pins');
