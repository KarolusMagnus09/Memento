/**
 * Danh mục dịch vụ dùng chung cho: bảng giá (đăng ký PTG + cập nhật hồ sơ),
 * hồ sơ công khai, đặt lịch và bộ lọc "Dịch vụ thêm".
 *
 * Giá trị lưu trong price_groups[].category (JSON, không cần đổi DB):
 *   photo | makeup | editor | rental_studio | rental_outfit | others
 * Dữ liệu cũ có category "rental" được coi là "Thuê studio" (xem normalizeCategory).
 */
export type ServiceCategory =
  | "photo"
  | "makeup"
  | "editor"
  | "rental_studio"
  | "rental_outfit"
  | "others";

export type CategoryDef = {
  value: ServiceCategory;
  label: string;
  hint: string;
  /** màu chip: nền / chữ */
  bg: string;
  fg: string;
};

export const SERVICE_CATEGORIES: CategoryDef[] = [
  { value: "photo", label: "Chụp ảnh", hint: "Gói chụp, theo giờ / theo buổi", bg: "#e8f5f0", fg: "#0f3d33" },
  { value: "makeup", label: "Make up", hint: "Trang điểm, làm tóc", bg: "#fce7f3", fg: "#be185d" },
  { value: "editor", label: "Edit / Retouch ảnh", hint: "Chỉnh màu, retouch", bg: "#e0e7ff", fg: "#4338ca" },
  { value: "rental_studio", label: "Thuê studio", hint: "Studio, phông nền, đèn", bg: "#fef3c7", fg: "#b45309" },
  { value: "rental_outfit", label: "Thuê quần áo", hint: "Trang phục, váy, phụ kiện", bg: "#ffedd5", fg: "#c2410c" },
  { value: "others", label: "Khác", hint: "Dịch vụ riêng, tự đặt tên", bg: "#f3f4f6", fg: "#4b5563" },
];

/** "rental" (dữ liệu cũ) → "rental_studio"; giá trị lạ → "photo" */
export function normalizeCategory(raw: string | null | undefined): ServiceCategory {
  const c = (raw || "").toLowerCase().trim();
  if (c === "rental") return "rental_studio";
  if (SERVICE_CATEGORIES.some((x) => x.value === c)) return c as ServiceCategory;
  return "photo";
}

/** Thuộc nhóm "Thuê" (cả studio, quần áo và loại cũ) → hiện ở tab Thuê & phụ kiện */
export function isRentalCategory(raw: string | null | undefined): boolean {
  const c = (raw || "").toLowerCase().trim();
  return c === "rental" || c === "rental_studio" || c === "rental_outfit";
}

export function categoryDef(raw: string | null | undefined): CategoryDef {
  const n = normalizeCategory(raw);
  return SERVICE_CATEGORIES.find((x) => x.value === n)!;
}

export function categoryLabel(raw: string | null | undefined): string {
  if ((raw || "").toLowerCase().trim() === "rental") return "Thuê & phụ kiện";
  return categoryDef(raw).label;
}

/* ───────── Bộ lọc "Dịch vụ thêm" ───────── */

export type ExtraServiceKey = "makeup" | "editor" | "rental_studio" | "rental_outfit" | "others";

export const EXTRA_SERVICES: { key: ExtraServiceKey; label: string }[] = [
  { key: "makeup", label: "Make up" },
  { key: "editor", label: "Edit / Retouch ảnh" },
  { key: "rental_studio", label: "Thuê studio" },
  { key: "rental_outfit", label: "Thuê quần áo" },
  { key: "others", label: "Loại khác" },
];

type PhotographerLike = {
  skill_makeup?: boolean;
  skill_edit?: boolean;
  skill_rental?: boolean;
  price_groups?: { category?: string; lines?: unknown[] }[] | null;
};

/** Các dịch vụ thêm mà PTG này cung cấp (theo kỹ năng đã tick + nhóm bảng giá đã tạo) */
export function photographerExtraServices(p: PhotographerLike): Set<ExtraServiceKey> {
  const out = new Set<ExtraServiceKey>();
  if (p.skill_makeup) out.add("makeup");
  if (p.skill_edit) out.add("editor");
  const groups = Array.isArray(p.price_groups) ? p.price_groups : [];
  for (const g of groups) {
    const c = normalizeCategory(g?.category);
    if (c === "photo") continue;
    out.add(c as ExtraServiceKey);
  }
  // Dữ liệu cũ: chỉ tick "Thuê & phụ kiện" mà chưa tạo nhóm giá → coi là thuê studio
  if (p.skill_rental && !out.has("rental_studio") && !out.has("rental_outfit")) out.add("rental_studio");
  return out;
}
