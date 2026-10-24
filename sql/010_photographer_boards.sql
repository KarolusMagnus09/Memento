-- Chạy trong Supabase SQL Editor (New query > paste > Run)
--
-- Thêm 3 cột phục vụ tính năng "portfolio kiểu Pinterest" cho photographer:
-- boards (các bảng/board ảnh, có thể public/private), standalone_pins (ảnh
-- đăng lẻ không thuộc board nào), pin_likes (đếm lượt tim theo từng ảnh,
-- key là url ảnh, value là số lượt tim).
--
-- Dùng jsonb với default rỗng để không phá dữ liệu cũ, và code phía client
-- (usePhotographers.ts) vẫn tự chuẩn hoá thêm 1 lớp nữa (fallback về
-- portfolio cũ) để không vỡ nếu migration này chưa kịp chạy.

alter table public.photographers
  add column if not exists boards jsonb not null default '[]'::jsonb,
  add column if not exists standalone_pins jsonb not null default '[]'::jsonb,
  add column if not exists pin_likes jsonb not null default '{}'::jsonb;
