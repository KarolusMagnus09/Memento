export type Screen =
  | "login" | "home" | "search" | "photographer-profile"
  | "write-review" | "reviews-list" | "booking" | "bookings"
  | "messages" | "chat" | "profile" | "personal-info"
  | "privacy" | "become-photographer" | "booking-confirm" | "contact-us"
  | "notifications" | "change-email" | "change-password";

export type Board = {
  id: string;
  name: string;
  private: boolean;
  cover: string;
  pins: string[];
};

/** Thể loại nhóm bảng giá — bắt buộc khi PTG tạo nhóm giá */
export type PriceCategory = "photo" | "makeup" | "editor" | "rental";

export type PriceLine = {
  id: string;
  name: string;
  price: string;
  detail: string;
};

export type PriceGroup = {
  id: string;
  title: string;
  category: PriceCategory;
  lines: PriceLine[];
};

export type Photographer = {
  id: number;
  name: string;
  location: string;
  price: number;
  rating: number;
  bookings: number;
  specialty: string;
  avatar: string;
  cover: string;
  portfolio: string[];
  boards: Board[];
  standalone_pins: string[];
  pin_likes: Record<string, number>;
  bio: string;
  tags: string[];
  reviews: { name: string; avatar: string; rating: number; text: string; time: string; verified: boolean }[];
  /** Legacy mock packages — ưu tiên price_groups nếu có */
  packages: { name: string; price: number; desc: string; includes: string[] }[];
  /** Bảng giá từ form đăng ký PTG (có category) */
  price_groups?: PriceGroup[];
  skill_makeup?: boolean;
  skill_edit?: boolean;
  skill_rental?: boolean;
  /** Ảnh/board cho mục Thuê & phụ kiện (sau này) */
  rental_boards?: Board[];
  rental_pins?: string[];
  /** Optional fields filled during "Trở thành Nhiếp ảnh gia" — shown in profile like PotoNow */
  experience_years?: string | null;
  equipment?: string | null;
  languages?: string[];
  work_model?: "solo" | "team" | string | null;
  experience_detail?: string | null;
  shooting_styles?: string[];
  work_locations?: string[];
};
