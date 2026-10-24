-- Chạy file này trong Supabase Dashboard > SQL Editor > New query > Run

create table if not exists photographers (
  id bigint generated always as identity primary key,
  name text not null,
  location text not null,
  price numeric not null default 0,
  rating numeric not null default 0,
  bookings integer not null default 0,
  specialty text,
  avatar text,
  cover text,
  portfolio jsonb not null default '[]',
  bio text,
  tags jsonb not null default '[]',
  reviews jsonb not null default '[]',
  packages jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- Cho phép ai cũng đọc được danh sách photographer (marketplace công khai)
alter table photographers enable row level security;

create policy "Public read access"
  on photographers for select
  using (true);

-- Nạp lại 3 photographer mẫu (giống hệt dữ liệu giả cũ) để demo vẫn đẹp
insert into photographers (name, location, price, rating, bookings, specialty, avatar, cover, portfolio, bio, tags, reviews, packages)
values
(
  'Lê Minh Dương', 'TP. Hồ Chí Minh', 250, 4.9, 150, 'Wedding & Events',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&h=400&fit=crop',
  '["https://images.unsplash.com/photo-1519741497674-611481863552?w=400&h=400&fit=crop","https://images.unsplash.com/photo-1606800052052-a08af7148866?w=400&h=400&fit=crop","https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=400&h=400&fit=crop","https://images.unsplash.com/photo-1532712938310-34cb3982ef74?w=400&h=400&fit=crop","https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=400&h=400&fit=crop","https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=400&h=400&fit=crop"]',
  'Chào bạn! Mình là Dương, một nhiếp ảnh gia với hơn 5 năm kinh nghiệm. Niềm đam mê của mình là khoảnh khắc kết nối giữa chú rể và cô dâu.',
  '["#Portraits","#Wedding","#Events"]',
  '[{"name":"Nguyễn Minh Tuấn","avatar":"https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop","rating":5,"text":"Chụp cực kỳ đẹp! Anh Dương rất tâm lý và chuyên nghiệp.","time":"2 tuần trước","verified":true},{"name":"Trần Hoàng Nam","avatar":"https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop","rating":5,"text":"Ảnh cưới của mình được chụp bởi anh Dương – không thể tin được.","time":"1 tháng trước","verified":true},{"name":"Lê Thu Thảo","avatar":"https://images.unsplash.com/photo-1494790108755-2616b612b830?w=80&h=80&fit=crop","rating":4,"text":"Rất hài lòng với dịch vụ, anh Dương rất thân thiện.","time":"2 tháng trước","verified":false}]',
  '[{"name":"Gói Cơ Bản","price":150,"desc":"Chụp 20 ảnh chân dung đẹp nhất của bạn","includes":["2h Session","20 Edited Photos","Online Gallery"]},{"name":"Gói Nâng Cao","price":350,"desc":"Kể câu chuyện hoàn hảo cho ngày đặc biệt","includes":["4h Session","60 Edited Photos","Album Cứng","Drone Shots"]}]'
),
(
  'Elena Rodriguez', 'TP. Hồ Chí Minh', 180, 4.8, 98, 'Street & Fashion',
  'https://images.unsplash.com/photo-1494790108755-2616b612b830?w=200&h=200&fit=crop',
  'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&h=400&fit=crop',
  '["https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=400&fit=crop","https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=400&h=400&fit=crop","https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400&h=400&fit=crop","https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=400&fit=crop","https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=400&h=400&fit=crop","https://images.unsplash.com/photo-1550614000-4895a10e1bfd?w=400&h=400&fit=crop"]',
  'Street photography and fashion specialist. I love capturing authentic moments in urban environments.',
  '["#Street","#Fashion","#Portrait"]',
  '[{"name":"Phạm Quỳnh Anh","avatar":"https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop","rating":5,"text":"Elena có con mắt nghệ thuật tuyệt vời!","time":"3 tuần trước","verified":true}]',
  '[{"name":"Gói Cơ Bản","price":120,"desc":"Street & Fashion shoot 2 tiếng","includes":["2h Session","25 Edited Photos","Digital Delivery"]},{"name":"Gói Nâng Cao","price":280,"desc":"Full day fashion editorial","includes":["8h Session","100 Edited Photos","Styling Consultation","Print Ready"]}]'
),
(
  'Julian Thome', 'Hà Nội', 220, 4.7, 67, 'Wedding Specialist',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop',
  'https://images.unsplash.com/photo-1537633552985-df8429e8048b?w=800&h=400&fit=crop',
  '["https://images.unsplash.com/photo-1537633552985-df8429e8048b?w=400&h=400&fit=crop","https://images.unsplash.com/photo-1591604021695-0c69b7c05981?w=400&h=400&fit=crop","https://images.unsplash.com/photo-1549417229-aa67d3263c09?w=400&h=400&fit=crop","https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=400&h=400&fit=crop"]',
  'Wedding photographer based in Hanoi. I believe in capturing the raw emotion of your special day.',
  '["#Wedding","#Cinematic","#Portrait"]',
  '[]',
  '[{"name":"Gói Cơ Bản","price":220,"desc":"Half-day wedding coverage","includes":["4h Session","40 Edited Photos","Online Gallery"]},{"name":"Gói Nâng Cao","price":500,"desc":"Full wedding day coverage","includes":["Full Day","150+ Edited Photos","Album","Video Highlights"]}]'
);
