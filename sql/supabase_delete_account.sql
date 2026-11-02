-- =====================================================================
-- Memento — XÓA TÀI KHOẢN trong app
-- Chạy MỘT LẦN trong Supabase → SQL Editor (chạy lại nhiều lần cũng an toàn).
--
-- Cách xóa: "xóa mềm". Không xóa hàng trong auth.users / profiles vì đơn và chat của
-- người khác vẫn tham chiếu tới họ. Thay vào đó:
--   • Hồ sơ → tên "Người dùng đã bị xóa", bỏ avatar, xóa SĐT / email / thông tin cá nhân.
--   • Đơn (bookings) & chat của người khác vẫn còn, chỉ đổi tên + avatar hiển thị.
--   • Tài khoản đăng nhập bị vô hiệu hóa và email gốc được giải phóng (đăng ký lại được).
-- =====================================================================

alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.bookings add column if not exists refund_status text;   -- có sẵn nếu đã chạy supabase_deposit_flow.sql

-- 1) Kiểm tra điều kiện xóa --------------------------------------------
--    Chặn khi: là admin / còn đơn đang xử lý (khách hoặc photographer) / còn khoản hoàn cọc chưa xử lý.
create or replace function public.account_deletion_blockers()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid     uuid := auth.uid();
  r       text;
  deals   int;
  refunds int;
begin
  if uid is null then raise exception 'Chưa đăng nhập'; end if;

  select role into r from public.profiles where id = uid;

  select count(*) into deals
    from public.bookings b
   where (b.client_id = uid or b.photographer_user_id = uid)
     and b.status not in ('completed', 'cancelled', 'rejected');

  select count(*) into refunds
    from public.bookings b
   where b.client_id = uid and b.status = 'cancelled' and b.refund_status = 'pending';

  return jsonb_build_object(
    'is_admin',        coalesce(r = 'admin', false),
    'active_deals',    deals,
    'pending_refunds', refunds,
    'blocked',         (coalesce(r = 'admin', false) or deals > 0 or refunds > 0)
  );
end $$;

-- 2) Xóa tài khoản -----------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid    uuid := auth.uid();
  tomb   constant text := 'Người dùng đã bị xóa';
  b      jsonb;
  elem   jsonb;
  fresh  boolean := false;
  c      text;
  t      text;
begin
  if uid is null then raise exception 'Chưa đăng nhập'; end if;

  -- (a) Bắt buộc vừa xác minh OTP email trong 15 phút gần nhất (JWT claim "amr").
  --     Nếu muốn tạm tắt kiểm tra này khi thử nghiệm: đổi biến dưới thành false.
  if true then
    for elem in select * from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) loop
      if (elem ->> 'method') in ('otp', 'recovery', 'magiclink', 'email_change')
         and to_timestamp(((elem ->> 'timestamp'))::bigint) > now() - interval '15 minutes' then
        fresh := true;
      end if;
    end loop;
    if not fresh then raise exception 'OTP_REQUIRED'; end if;
  end if;

  -- (b) Kiểm tra lại điều kiện ở server (không tin giao diện)
  b := public.account_deletion_blockers();
  if (b ->> 'blocked')::boolean then raise exception 'BLOCKED'; end if;

  -- (c) Vô hiệu hóa đăng nhập, giải phóng email gốc
  begin delete from auth.sessions where user_id = uid; exception when others then null; end;
  begin delete from auth.refresh_tokens where user_id::text = uid::text; exception when others then null; end;
  begin delete from auth.identities where user_id = uid; exception when others then null; end;
  update auth.users
     set email               = 'deleted+' || replace(uid::text, '-', '') || '@deleted.invalid',
         encrypted_password  = '',
         phone               = null,
         raw_user_meta_data  = '{}'::jsonb,
         raw_app_meta_data   = jsonb_build_object('provider', 'deleted', 'providers', '[]'::jsonb),
         banned_until        = 'infinity',
         deleted_at          = now()
   where id = uid;

  -- (d) Hồ sơ: tên "Người dùng đã bị xóa", bỏ avatar + thông tin cá nhân
  update public.profiles
     set full_name = tomb, avatar_url = null, deleted_at = now()
   where id = uid;
  begin
    update public.profiles set username = 'deleted_' || left(replace(uid::text, '-', ''), 10) where id = uid;
  exception when others then null; end;
  begin update public.profiles set phone_verified = false where id = uid; exception when others then null; end;
  foreach c in array array['phone','email','bio','gender','address','date_of_birth','birthday','dob','ban_reason'] loop
    begin
      if exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = c) then
        execute format('update public.profiles set %I = null where id = $1', c) using uid;
      end if;
    exception when others then null; end;
  end loop;

  -- (e) Đơn của người khác vẫn còn, chỉ đổi tên + avatar hiển thị
  update public.bookings set client_name = tomb, client_avatar = null where client_id = uid;
  update public.bookings set photographer_name = tomb where photographer_user_id = uid;
  begin update public.bookings set photographer_avatar = null where photographer_user_id = uid;
  exception when others then null; end;
  foreach c in array array['client_phone','client_email','photographer_phone','photographer_email'] loop
    begin
      if exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'bookings' and column_name = c) then
        execute format('update public.bookings set %I = null where client_id = $1 or photographer_user_id = $1', c) using uid;
      end if;
    exception when others then null; end;
  end loop;

  -- (f) Hồ sơ photographer: ẩn tên + xóa nội dung cá nhân (giữ dòng để đơn cũ không lỗi)
  begin update public.photographers set name = tomb where user_id = uid; exception when others then null; end;
  foreach c in array array['avatar','avatar_url','banner_url','cover','bio','about','intro','description','specialty',
                           'location','phone','instagram','facebook','website','portfolio','boards','standalone_pins',
                           'price_groups','rental_boards','rental_pins','work_locations','tags','shooting_styles'] loop
    begin
      if exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'photographers' and column_name = c) then
        begin
          execute format('update public.photographers set %I = null where user_id = $1', c) using uid;
        exception when others then
          execute format('update public.photographers set %I = default where user_id = $1', c) using uid;
        end;
      end if;
    exception when others then null; end;
  end loop;

  -- (g) Hồ sơ đăng ký photographer (có CCCD, ngân hàng…): xóa hẳn; nếu bị ràng buộc thì xóa trắng các cột nhạy cảm
  begin
    delete from public.photographer_applications where user_id = uid;
  exception when others then
    for c in select column_name from information_schema.columns
              where table_schema = 'public' and table_name = 'photographer_applications' and is_nullable = 'YES'
                and (column_name ilike '%cccd%' or column_name ilike '%bank%' or column_name ilike '%phone%'
                     or column_name ilike '%address%' or column_name ilike '%avatar%' or column_name ilike '%proof%')
    loop
      begin
        execute format('update public.photographer_applications set %I = null where user_id = $1', c) using uid;
      exception when others then null; end;
    end loop;
  end;

  -- (h) Dữ liệu chỉ của riêng người dùng
  foreach t in array array['notifications','device_tokens','push_tokens'] loop
    begin execute format('delete from public.%I where user_id = $1', t) using uid;
    exception when others then null; end;
  end loop;
end $$;

revoke all on function public.account_deletion_blockers() from public;
revoke all on function public.delete_my_account()         from public;
grant execute on function public.account_deletion_blockers() to authenticated;
grant execute on function public.delete_my_account()         to authenticated;

-- 3) Kiểm tra: danh sách "Tin nhắn" lấy tên + avatar đối phương từ đâu?
--    Nếu hàm list_my_conversations đọc từ profiles → đã tự hiện "Người dùng đã bị xóa".
--    Nếu đọc từ bảng khác (lưu sẵn tên), xem hàm rồi sửa tương tự:
-- select pg_get_functiondef('public.list_my_conversations'::regproc);
