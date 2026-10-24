-- 023: Sửa check constraint bookings_status_check
-- Lỗi khi PTG bấm "chuyển giao ảnh" / submit Drive:
--   new row for relation "bookings" violates check constraint "bookings_status_check"
-- Nguyên nhân: constraint cũ chưa cho phép status = 'handover' (và một số status mới).

-- Xóa constraint cũ (tên có thể khác nhẹ giữa các môi trường)
alter table public.bookings drop constraint if exists bookings_status_check;

-- Tạo lại với đầy đủ trạng thái dùng trong app
alter table public.bookings
  add constraint bookings_status_check
  check (
    status in (
      'pending',
      'confirmed',
      'deposit_paid',
      'handover',
      'final_payment',
      'completed',
      'rejected',
      'cancelled',
      'paid'           -- legacy
    )
  );

-- Đảm bảo các cột bàn giao tồn tại (idempotent)
alter table public.bookings
  add column if not exists drive_url text,
  add column if not exists drive_submitted_at timestamptz,
  add column if not exists shoot_done_at timestamptz,
  add column if not exists client_approved_at timestamptz,
  add column if not exists handover_note text;

comment on constraint bookings_status_check on public.bookings is
  'Vòng đời đơn: pending → confirmed → deposit_paid → handover → completed (+ rejected/cancelled/paid)';
