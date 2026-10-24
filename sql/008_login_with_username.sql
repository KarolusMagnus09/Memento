-- Chạy trong Supabase SQL Editor (New query > paste > Run)
--
-- MỤC TIÊU: cho phép đăng nhập bằng "tên tài khoản" (username) THAY VÌ chỉ
-- bằng email — giống Gmail: username là định danh riêng tư, duy nhất, không
-- đổi được và KHÔNG hiển thị công khai; nó chỉ dùng để đăng nhập. Tên hiển
-- thị công khai (có thể đổi tuỳ ý) vẫn là full_name như trước.
--
-- Supabase Auth chỉ hỗ trợ đăng nhập bằng email/phone, không có sẵn khái
-- niệm "username". Do đó client sẽ: nếu người dùng gõ email thì đăng nhập
-- thẳng; nếu gõ username thì trước tiên tra ra email tương ứng qua RPC dưới
-- đây, rồi mới gọi signInWithPassword với email đó.
--
-- RPC này được viết riêng (thay vì để client SELECT thẳng bảng profiles)
-- để CHỈ trả về đúng 1 email khi username khớp chính xác — không cho phép
-- client duyệt/liệt kê username hay bất kỳ cột nào khác của người dùng khác,
-- giữ đúng nguyên tắc username là thông tin riêng tư.

create or replace function public.find_email_by_username(p_username text)
returns text
language sql
stable
security definer set search_path = public
as $$
  select email
  from public.profiles
  where lower(username) = lower(trim(p_username))
  limit 1;
$$;

-- Cho phép gọi cả khi CHƯA đăng nhập (đang ở màn hình đăng nhập).
grant execute on function public.find_email_by_username(text) to anon, authenticated;
