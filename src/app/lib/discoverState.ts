import { useSyncExternalStore } from "react";
import { EMPTY_FILTER, type PhotographerFilter } from "./photographerFilter";

/**
 * Trạng thái tìm kiếm DÙNG CHUNG giữa Trang chủ và Khám phá.
 * - Trang chủ: gõ tên + bấm tìm (hoặc áp bộ lọc) → ghi vào đây rồi chuyển sang Khám phá.
 * - Khám phá: đọc đúng các giá trị này nên bộ lọc / phong cách đã chọn được mang sang.
 * - Bộ lọc (kèm phong cách / thể loại chụp) được lưu vào localStorage (giữ lại lần sau); ô tìm tên chỉ giữ trong phiên.
 */
export type DiscoverState = {
  query: string;
  /** Gồm cả thể loại chụp (shootingStyles) — dùng chung cho "Phong cách" và mục "Thể loại chụp" trong bộ lọc */
  filter: PhotographerFilter;
};

const KEY = "memento:discover:v1";

function loadSaved(): Omit<DiscoverState, "query"> {
  const base = { filter: EMPTY_FILTER };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const j = JSON.parse(raw);
    const f = j?.filter && typeof j.filter === "object" ? j.filter : {};
    return {
      filter: {
        ...EMPTY_FILTER,
        ...f,
        locations: Array.isArray(f.locations) ? f.locations : [],
        shootingStyles: Array.isArray(f.shootingStyles) ? f.shootingStyles : [],
        extraServices: Array.isArray(f.extraServices) ? f.extraServices : [],
      },
    };
  } catch {
    return base;
  }
}

let state: DiscoverState = { query: "", ...loadSaved() };
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ filter: state.filter })
    );
  } catch {
    /* bỏ qua nếu không ghi được */
  }
}

export function setDiscover(patch: Partial<DiscoverState>) {
  state = { ...state, ...patch };
  persist();
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useDiscover(): DiscoverState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
