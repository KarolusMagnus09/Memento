import type { Photographer } from "../types";

type Line = { price?: string | number };
type Group = { category?: string; lines?: Line[] };

const toNum = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Khoảng giá hiển thị ngoài thẻ:
 *  1) Ưu tiên giá nhóm "Chụp ảnh" (category = photo) → min - max
 *  2) Không có giá chụp ảnh → min - max của TẤT CẢ dịch vụ còn lại
 *  3) Không có bảng giá → dùng giá đơn `price` (nếu > 0)
 */
export function getPriceRange(p: Photographer): { min: number; max: number } | null {
  const minCol = toNum(p.price_min);
  const maxCol = toNum(p.price_max);
  if (minCol > 0 && maxCol > 0) return { min: minCol, max: maxCol };

  const groups = (Array.isArray(p.price_groups) ? p.price_groups : []) as Group[];
  const all: { cat?: string; price: number }[] = [];
  for (const g of groups) {
    for (const l of Array.isArray(g.lines) ? g.lines : []) {
      const price = toNum(l.price);
      if (price > 0) all.push({ cat: g.category, price });
    }
  }
  const photo = all.filter(x => x.cat === "photo");
  const chosen = (photo.length > 0 ? photo : all).map(x => x.price);
  if (chosen.length > 0) return { min: Math.min(...chosen), max: Math.max(...chosen) };

  if (p.price > 0) return { min: p.price, max: p.price };
  return null;
}

const fmt = (n: number) => n.toLocaleString("vi-VN");

/** "1.000 - 2.000đ" | "1.000đ" | "Liên hệ" */
export function formatPriceRange(p: Photographer): string {
  const r = getPriceRange(p);
  if (!r) return "Liên hệ";
  return r.min === r.max ? `${fmt(r.min)}đ` : `${fmt(r.min)} - ${fmt(r.max)}đ`;
}

/** Địa điểm làm việc, tối đa `max` nơi (mặc định 3). */
export function getLocations(p: Photographer, max = 3): string[] {
  const wl = Array.isArray(p.work_locations) ? p.work_locations.filter(Boolean) : [];
  const base = wl.length > 0
    ? wl
    : (p.location ? p.location.split(",").map(s => s.trim()).filter(Boolean) : []);
  return base.slice(0, max);
}

export function formatLocations(p: Photographer, max = 3): string {
  return getLocations(p, max).join(", ") || "—";
}

/** Chuẩn hoá để gộp "NetworkingEvents" / "#NetworkingEvents" / "Networking Events" thành 1. */
function styleKey(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
}

/** Gộp shooting_styles + tags, bỏ trùng (kể cả bản có #). */
export function uniqueStyleLabels(p: Photographer): string[] {
  const raw = [
    ...(Array.isArray(p.shooting_styles) ? p.shooting_styles : []),
    ...(Array.isArray(p.tags) ? p.tags : []),
  ].filter(Boolean) as string[];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const cleaned = String(t).replace(/^#+/, "").trim();
    if (!cleaned) continue;
    const k = styleKey(cleaned);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(cleaned);
  }
  return out;
}

/** Tags hiển thị tối đa `max` cái (mặc định 3). */
export function getTags(p: Photographer, max = 3): string[] {
  return uniqueStyleLabels(p).slice(0, max);
}

/** Tag hiện trên thẻ ngoài: phong cách chụp (đã dedupe), không có thì specialty. */
export function getCardTags(p: Photographer, max = 3): string[] {
  const styles = uniqueStyleLabels(p);
  const base = styles.length > 0 ? styles : (p.specialty ? [p.specialty] : []);
  return base.slice(0, max);
}

/** Ảnh đại diện của thẻ PTG — DÙNG CHUNG cho Trang chủ & Khám phá để luôn giống nhau. */
export function getCardImage(p: Photographer): string {
  return p.cover || (Array.isArray(p.portfolio) ? p.portfolio[0] : "") || p.avatar || "";
}

/** "4.5" | "0" */
export function formatRating(p: Photographer): string {
  return p.rating > 0 ? p.rating.toFixed(1) : "0";
}

export function getReviewCount(p: Photographer): number {
  if (typeof p.review_count === "number") return p.review_count;
  return Array.isArray(p.reviews) ? p.reviews.length : 0;
}
