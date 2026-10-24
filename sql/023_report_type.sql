-- 023: Phân loại báo cáo (profile / giá-giao dịch) — chạy sau 021
alter table public.profile_reports
  add column if not exists report_type text not null default 'profile'
  check (report_type in ('profile','price'));
