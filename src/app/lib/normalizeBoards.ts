import type { Board } from "../types";

/** Parse jsonb / string / null → Board[] với pins là string[] hợp lệ. */
export function asBoards(raw: unknown): Board[] {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v
    .map((b, i) => {
      if (!b || typeof b !== "object") return null;
      const o = b as Record<string, unknown>;
      const pinsRaw = o.pins;
      const pins = Array.isArray(pinsRaw)
        ? pinsRaw.filter((p): p is string => typeof p === "string" && !!p)
        : [];
      const cover =
        typeof o.cover === "string" && o.cover
          ? o.cover
          : pins[0] || "";
      return {
        id: typeof o.id === "string" && o.id ? o.id : `board-${i}`,
        name: typeof o.name === "string" ? o.name : "Bộ sưu tập",
        private: !!o.private,
        cover,
        pins,
      } satisfies Board;
    })
    .filter((b): b is Board => b !== null);
}

/** Parse jsonb / string → string[] URL ảnh. */
export function asPinUrls(raw: unknown): string[] {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return typeof raw === "string" && raw.startsWith("http") ? [raw] : [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v.filter((p): p is string => typeof p === "string" && !!p);
}
