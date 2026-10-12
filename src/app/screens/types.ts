export type Screen =
  | "login" | "home" | "search" | "photographer-profile"
  | "write-review" | "reviews-list" | "booking" | "bookings"
  | "messages" | "chat" | "profile" | "personal-info"
  | "privacy" | "become-photographer" | "booking-confirm" | "contact-us"
  | "notifications" | "change-email" | "change-password"
  | "admin-review" | "edit-photographer";

export type Board = {
  id: string;
  name: string;
  private: boolean;
  cover: string;
  pins: string[];
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
  packages: { name: string; price: number; desc: string; includes: string[] }[];
  /** Optional fields filled during "Trở thành Nhiếp ảnh gia" — shown in profile like PotoNow */
  experience_years?: string | null;
  equipment?: string | null;
  languages?: string[];
  work_model?: "solo" | "team" | string | null;
  experience_detail?: string | null;
  shooting_styles?: string[];
  work_locations?: string[];
  /** Bảng giá (nhóm theo category: photo | makeup | editor | rental) */
  price_groups?: {
    id: string;
    title: string;
    category: "photo" | "makeup" | "editor" | "rental" | string;
    lines: { id: string; name: string; price: string; detail: string }[];
  }[];
  skill_makeup?: boolean;
  skill_edit?: boolean;
  skill_rental?: boolean;
  /** Board + ảnh lẻ chỉ cho tab Thuê & phụ kiện */
  rental_boards?: Board[];
  rental_pins?: string[];
  /** Liên kết auth user (khi duyệt từ application) */
  user_id?: string | null;
};
