import { Search, X, SlidersHorizontal } from "lucide-react";
import type { Screen, Photographer } from "../types";
import { TEAL, TEAL_LIGHT, BG } from "../constants";
import { useMemo, useState } from "react";
import { StyleFilter } from "../components/shared/StyleFilter";
import { setDiscover, useDiscover } from "../lib/discoverState";
import { PhotographerCard } from "../components/shared/PhotographerCard";
import { PhotographerFilterSheet } from "../components/shared/PhotographerFilterSheet";
import {
  filterPhotographers,
  isFilterActive,
  countActiveFilters,
} from "../lib/photographerFilter";
import { getLocations } from "../lib/photographerDisplay";

export default function SearchScreen({
  setScreen,
  setPhotographer,
  savedIds,
  toggleSave,
  photographers,
}: {
  setScreen: (s: Screen) => void;
  setPhotographer: (p: Photographer) => void;
  savedIds: number[];
  toggleSave: (id: number) => void;
  photographers: Photographer[];
}) {
  // Dùng chung với Trang chủ: tên đã gõ, bộ lọc và phong cách được mang sang và lưu lại
  const { query, filter } = useDiscover();
  const [filterOpen, setFilterOpen] = useState(false);

  const availableLocations = useMemo(() => {
    const set = new Set<string>();
    for (const p of photographers) {
      for (const l of getLocations(p, 20)) set.add(l);
    }
    return Array.from(set);
  }, [photographers]);

  // Chỉ gồm photographer thật (danh sách đã loại admin); tìm theo tên + bộ lọc + phong cách
  const results = useMemo(
    () =>
      filterPhotographers({
        list: photographers,
        query,
        filter,
        savedIds,
      }),
    [photographers, query, filter, savedIds]
  );

  const filterOn = isFilterActive(filter);
  const filterCount = countActiveFilters(filter);

  return (
    <div className="flex flex-col min-h-full pb-24" style={{ background: BG }}>
      <div className="px-5 py-3 relative" style={{ background: TEAL }}>
        <h2 className="font-bold text-base mb-2 text-white">Khám phá</h2>
        <div className="flex items-center gap-2 bg-white rounded-2xl px-4 py-2.5 shadow-md">
          <Search size={16} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setDiscover({ query: e.target.value })}
            className="flex-1 min-w-0 bg-transparent text-sm outline-none text-foreground"
            placeholder="Tìm nhiếp ảnh gia theo tên..."
          />
          {query && (
            <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setDiscover({ query: "" })}>
              <X size={14} className="text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 mt-3">
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 rounded-xl border bg-white text-sm font-semibold relative"
          style={{
            borderColor: filterOn ? TEAL : "var(--border)",
            color: filterOn ? TEAL : "#374151",
          }}
        >
          <SlidersHorizontal size={15} strokeWidth={2.2} />
          Filter
          {filterCount > 0 && (
            <span
              className="absolute right-3 min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold text-white flex items-center justify-center"
              style={{ background: TEAL }}
            >
              {filterCount}
            </span>
          )}
        </button>

        <h3 className="font-bold text-foreground mb-3">Phong cách</h3>
        <div className="mb-4">
          {/* Cùng nguồn dữ liệu với mục "Thể loại chụp" trong bộ lọc */}
          <StyleFilter
            selected={filter.shootingStyles}
            onChange={(subs) => setDiscover({ filter: { ...filter, shootingStyles: subs } })}
          />
        </div>

        <p className="text-xs font-semibold mb-3" style={{ color: TEAL_LIGHT }}>
          {results.length} photographer đã được tìm thấy
        </p>

        <div className="flex flex-col gap-4">
          {results.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-8">
              Không tìm thấy nhiếp ảnh gia phù hợp.
            </p>
          )}
          {results.map((p) => (
            <PhotographerCard
              key={p.id}
              p={p}
              saved={savedIds.some((x) => Number(x) === Number(p.id))}
              onToggleSave={() => toggleSave(Number(p.id))}
              onProfile={() => {
                setPhotographer(p);
                setScreen("photographer-profile");
              }}
              onBook={() => {
                setPhotographer(p);
                setScreen("booking");
              }}
            />
          ))}
        </div>
      </div>

      <PhotographerFilterSheet
        open={filterOpen}
        value={filter}
        onClose={() => setFilterOpen(false)}
        onApply={(f) => setDiscover({ filter: f })}
        availableLocations={availableLocations}
      />
    </div>
  );
}
