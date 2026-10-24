import type { Photographer } from "../types";
import { getPriceRange, getLocations } from "./photographerDisplay";
import { matchesStyle, normStyle } from "./styleFilter";
import type { StyleCategory } from "../constants";

/** Bộ lọc nâng cao — dùng chung Trang chủ + Khám phá */
export type PhotographerFilter = {
  locations: string[];
  priceMin: number | null;
  priceMax: number | null;
  sort: "most_shoots" | "top_rated" | "most_liked" | null;
  /**
   * Hồ sơ ghim luôn ưu tiên lên đầu (mặc định bật).
   * Tắt → ghim chịu filter như hồ sơ thường (không đẩy lên đầu).
   * Bật → chỉ đưa ghim KHỚP filter lên đầu; ghim không khớp không hiện.
   */
  pinFirst: boolean;
  /** Thể loại chụp (subcategory labels), rỗng = không lọc */
  shootingStyles: string[];
};

export const EMPTY_FILTER: PhotographerFilter = {
  locations: [],
  priceMin: null,
  priceMax: null,
  sort: null,
  pinFirst: true,
  shootingStyles: [],
};

export function isFilterActive(f: PhotographerFilter): boolean {
  return (
    f.locations.length > 0 ||
    f.priceMin != null ||
    f.priceMax != null ||
    f.sort != null ||
    f.shootingStyles.length > 0 ||
    !f.pinFirst
  );
}

export function countActiveFilters(f: PhotographerFilter): number {
  let n = 0;
  if (f.locations.length) n += 1;
  if (f.priceMin != null || f.priceMax != null) n += 1;
  if (f.sort != null) n += 1;
  if (f.shootingStyles.length) n += 1;
  if (!f.pinFirst) n += 1;
  return n;
}

function matchesShootingStyles(p: Photographer, selected: string[]): boolean {
  if (!selected.length) return true;
  const raw = [
    ...(Array.isArray(p.shooting_styles) ? p.shooting_styles : []),
    ...(Array.isArray(p.tags) ? p.tags : []),
    p.specialty,
  ].filter(Boolean) as string[];
  const keys = new Set(raw.map((s) => normStyle(s)));
  return selected.some((s) => keys.has(normStyle(s)));
}

export function applyPhotographerFilter(
  list: Photographer[],
  f: PhotographerFilter
): Photographer[] {
  let out = list.filter((p) => {
    if (f.locations.length > 0) {
      const locs = getLocations(p, 50).map((x) => x.toLowerCase());
      const hit = f.locations.some((want) =>
        locs.some((l) => l.includes(want.toLowerCase()) || want.toLowerCase().includes(l))
      );
      if (!hit) return false;
    }

    if (f.priceMin != null || f.priceMax != null) {
      const range = getPriceRange(p);
      if (!range) return false;
      const lo = f.priceMin ?? 0;
      const hi = f.priceMax ?? Number.POSITIVE_INFINITY;
      if (range.max < lo || range.min > hi) return false;
    }

    if (f.sort === "top_rated") {
      const rc = typeof p.review_count === "number" ? p.review_count : (p.reviews?.length ?? 0);
      if (rc < 10) return false;
    }

    if (!matchesShootingStyles(p, f.shootingStyles)) return false;

    return true;
  });

  if (f.sort === "most_shoots") {
    out = [...out].sort((a, b) => (b.bookings || 0) - (a.bookings || 0));
  } else if (f.sort === "top_rated") {
    out = [...out].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (f.sort === "most_liked") {
    out = [...out].sort((a, b) => (b.hearts || 0) - (a.hearts || 0));
  }

  return out;
}

export function filterPhotographers(opts: {
  list: Photographer[];
  query?: string;
  styleGroup?: StyleCategory | null;
  subcategory?: string | null;
  filter: PhotographerFilter;
  savedIds?: number[];
}): Photographer[] {
  const q = (opts.query || "").trim().toLowerCase();
  let list = opts.list.filter((p) => {
    if (q) {
      const hay = [
        p.name,
        p.specialty,
        ...(Array.isArray(p.tags) ? p.tags : []),
        ...(Array.isArray(p.shooting_styles) ? p.shooting_styles : []),
        ...(Array.isArray(p.work_locations) ? p.work_locations : []),
        p.location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (!matchesStyle(p, opts.styleGroup ?? null, opts.subcategory ?? null)) return false;
    return true;
  });

  list = applyPhotographerFilter(list, opts.filter);

  // pinFirst mặc định true: ghim khớp filter lên đầu (ghim không khớp đã bị loại)
  if (opts.filter.pinFirst && opts.savedIds && opts.savedIds.length) {
    const set = new Set(opts.savedIds.map(Number).filter(Number.isFinite));
    list = [...list].sort((a, b) => {
      const as = set.has(Number(a.id)) ? 1 : 0;
      const bs = set.has(Number(b.id)) ? 1 : 0;
      return bs - as;
    });
  }

  return list;
}
