-- Khóa link Drive khi đơn đã hoàn thành.
-- Giao diện đã ẩn nút gửi/cập nhật link, nhưng file này chặn ngay trong database
-- để không ai (kể cả gọi API trực tiếp) đổi được drive_url sau khi đơn xong.
--
-- Đơn coi là hoàn thành khi: status = 'completed' HOẶC drive_released_at đã có giá trị.
-- Admin vẫn được sửa tay trong trường hợp cần xử lý sự cố.
-- Chạy trong Supabase SQL Editor (chạy lại nhiều lần không sao).

create or replace function public.block_drive_change_when_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.drive_url is distinct from old.drive_url
     and (old.status = 'completed' or old.drive_released_at is not null)
     and not exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'admin'
     )
  then
    raise exception 'Đơn đã hoàn thành, không thể gửi hoặc đổi link Drive nữa'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_drive_change_when_completed on public.bookings;
create trigger trg_block_drive_change_when_completed
  before update of drive_url on public.bookings
  for each row execute function public.block_drive_change_when_completed();
