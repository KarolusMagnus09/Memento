import { PartyPopper, Palette, Users, Users2 } from "lucide-react";

// Màu chủ đạo của app — đổi ở đây sẽ áp dụng toàn bộ app
export const TEAL = "#0c3d35";
export const TEAL_MID = "#1a6b5c";
export const TEAL_LIGHT = "#14b89a";
export const BG = "#f2f5f2";

// Ảnh đại diện mặc định — silhouette trắng trên nền xám nhạt, dùng khi user
// chưa có avatar_url (bỏ qua bước chọn ảnh lúc onboarding, hoặc user cũ chưa
// từng đặt ảnh). Là SVG data URI nên không phụ thuộc mạng/CDN nào cả.
export const DEFAULT_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="100" fill="#e5e7eb"/>
      <circle cx="100" cy="82" r="38" fill="#ffffff"/>
      <path d="M100 128c-44 0-70 26-70 55v17h140v-17c0-29-26-55-70-55z" fill="#ffffff"/>
    </svg>
  `.trim());

// myBookings/conversations vẫn là mock data cho tới khi bảng `bookings` và
// `messages` thật được nối vào Supabase (sẽ thay bằng hook fetch tương tự
// usePhotographers.ts khi làm tới bước đó).
export const myBookingsMock = [
  { id: 1, date: "Oct 12, 2024", time: "14:00 PM", package: "Gói Cơ Bản", price: 150, status: "confirmed" },
  { id: 2, date: "Oct 18, 2024", time: "10:00 AM", package: "Gói Cơ Bản", price: 120, status: "pending" },
];

export const conversationsMock = [
  { id: 1, lastMsg: "Mình sẽ đến địa điểm trước 15 phút nhé bạn!", time: "10:32 SA", unread: 2 },
  { id: 2, lastMsg: "Cảm ơn bạn đã đặt lịch! 🎉", time: "Hôm qua", unread: 0 },
];

// Loại hình chụp ("Phong cách") — 4 nhóm chính hiển thị trên thanh ngang,
// mỗi nhóm có danh sách loại con chọn qua dropdown. Về sau sẽ gắn làm tag
// cho bài đăng của photographer để dễ quản lý & tìm kiếm. Không chọn gì thì
// mặc định hiểu là "tất cả" (không lọc).
export type StyleCategory = {
  label: string;
  icon: typeof PartyPopper;
  subcategories: string[];
};

export const styles: StyleCategory[] = [
  {
    label: "Sự Kiện", icon: PartyPopper,
    subcategories: ["Fashion Shows", "Seminars & Workshops", "Networking Events", "Galas & Awards"],
  },
  {
    label: "Nghệ Thuật & Thương Mại", icon: Palette,
    subcategories: ["Landscape", "Travel", "Food", "Documentary", "Product/E-commerce"],
  },
  {
    label: "Cá Nhân & Gia Đình", icon: Users,
    subcategories: ["Personal", "Couple", "Wedding", "Anniversary", "Birthday", "Family activities"],
  },
  {
    label: "Giới Trẻ & Văn Hoá", icon: Users2,
    subcategories: ["Concert/Live Music", "Sports Events", "Yearbook", "Festival anime/cosplay"],
  },
];

// 34 tỉnh/thành sau sáp nhập hành chính — dùng cho "Địa điểm làm việc" của
// photographer (hoạt động như #tag, phục vụ tìm kiếm sau này).
export const VN_PROVINCES = [
  "Hà Nội", "Hồ Chí Minh", "Hải Phòng", "Đà Nẵng", "Cần Thơ", "Huế",
  "Đồng Nai", "Quảng Ninh", "Bắc Ninh", "An Giang", "Cao Bằng", "Cà Mau",
  "Điện Biên", "Đắk Lắk", "Đồng Tháp", "Gia Lai", "Hà Tĩnh", "Hưng Yên",
  "Khánh Hòa", "Lai Châu", "Lào Cai", "Lâm Đồng", "Lạng Sơn", "Nghệ An",
  "Ninh Bình", "Phú Thọ", "Quảng Ngãi", "Quảng Trị", "Sơn La", "Thanh Hóa",
  "Thái Nguyên", "Tuyên Quang", "Tây Ninh", "Vĩnh Long",
];


/**
 * Cấu hình nhận tiền VietQR (img.vietqr.io / vietqr.app — miễn phí, không API key).
 * STK BIDV Memento (HOANG VU DAT).
 * Docs: https://vietqr.app — param bank, acc, amount, des, holder, store, template, showinfo
 */
export const MEMENTO_PAYMENT = {
  bank: "BIDV",
  account: "7420808992",
  accountName: "HOANG VU DAT",
  storeName: "Memento",
  /** Prefix nội dung CK — luôn kèm mã bill ngắn để đối soát */
  desPrefix: "MMT",
};


/** Ngân hàng phổ biến — code dùng cho VietQR (bank short name) */
export const VN_BANKS: { code: string; name: string }[] = [
  { code: "BIDV", name: "BIDV" },
  { code: "Vietcombank", name: "Vietcombank (VCB)" },
  { code: "MBBank", name: "MB Bank" },
  { code: "TCB", name: "Techcombank (TCB)" },
  { code: "ACB", name: "ACB" },
  { code: "VPBank", name: "VPBank" },
  { code: "TPBank", name: "TPBank" },
  { code: "VietinBank", name: "VietinBank" },
  { code: "Agribank", name: "Agribank" },
  { code: "Sacombank", name: "Sacombank" },
  { code: "MSB", name: "MSB" },
  { code: "OCB", name: "OCB" },
  { code: "HDBank", name: "HDBank" },
  { code: "SHB", name: "SHB" },
  { code: "VIB", name: "VIB" },
];
