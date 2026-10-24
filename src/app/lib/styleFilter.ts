import type { Photographer } from "../types";
import type { StyleCategory } from "../constants";

/** "#NetworkingEvents" | "Networking Events" | "networking-events" → "networkingevents" */
export const normStyle = (s: string): string =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");

/** Mọi "phong cách" của PTG, đã chuẩn hóa: shooting_styles ∪ tags ∪ specialty. */
export function getStyleKeys(p: Photographer): Set<string> {
  const raw: string[] = [
    ...(Array.isArray(p.shooting_styles) ? p.shooting_styles : []),
    ...(Array.isArray(p.tags) ? p.tags : []),
    p.specialty,
  ].filter(Boolean) as string[];
  return new Set(raw.map(normStyle).filter(Boolean));
}

/**
 * Lọc theo bộ lọc "Phong cách":
 *  - có `sub`  → PTG phải có đúng loại con đó
 *  - chỉ `group` → PTG có ít nhất 1 loại con của nhóm
 *  - không chọn gì → tất cả
 */
export function matchesStyle(p: Photographer, group: StyleCategory | null, sub: string | null): boolean {
  if (!group && !sub) return true;
  const keys = getStyleKeys(p);
  if (sub) return keys.has(normStyle(sub));
  return group!.subcategories.some(s => keys.has(normStyle(s)));
}
