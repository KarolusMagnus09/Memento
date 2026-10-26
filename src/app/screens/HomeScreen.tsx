import { Search, Award, SlidersHorizontal } from "lucide-react";
import type { Screen, Photographer } from "../types";
import type { Profile } from "../hooks/useProfile";
import { TEAL, TEAL_MID, TEAL_LIGHT, BG, styles } from "../constants";
import { StyleFilter } from "../components/shared/StyleFilter";
import { FeaturedPhotographerCarousel } from "../components/shared/FeaturedPhotographerCarousel";
import { PhotoRequestBoard } from "../components/shared/PhotoRequestBoard";
import { getFeaturedPhotographers } from "../lib/featuredPhotographers";
import { PhotographerFilterSheet } from "../components/shared/PhotographerFilterSheet";
import {
  EMPTY_FILTER,
  type PhotographerFilter,
  filterPhotographers,
  isFilterActive,
  countActiveFilters,
} from "../lib/photographerFilter";
import { getLocations } from "../lib/photographerDisplay";
import { useMemo, useState } from "react";

export default function HomeScreen({
  offerUnread = 0,
  setScreen,
  setPhotographer,
  savedIds,
  toggleSave,
  photographers,
  profile,
}: {
  setScreen: (s: Screen) => void;
  setPhotographer: (p: Photographer) => void;
  savedIds: number[];
  toggleSave: (id: number) => void;
  photographers: Photographer[];
  profile: Profile;
  /** Tin chat đề nghị chưa đọc */
  offerUnread?: number;
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PhotographerFilter>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);

  const activeGroup = styles.find((s) => s.label === activeCategory) ?? null;

  const availableLocations = useMemo(() => {
    const set = new Set<string>();
    for (const p of photographers) {
      for (const l of getLocations(p, 20)) set.add(l);
    }
    return Array.from(set);
  }, [photographers]);

  const filteredPhotographers = useMemo(
    () =>
      filterPhotographers({
        list: photographers,
        query,
        styleGroup: activeGroup,
        subcategory: activeSubcategory,
        filter,
        savedIds,
      }),
    [photographers, query, activeGroup, activeSubcategory, filter, savedIds]
  );

  // Mục "nổi bật": top 10 rating cao nhất, đã đủ điều kiện (điều kiện không hiện ra UI)
  const featuredPhotographers = useMemo(
    () => getFeaturedPhotographers(filteredPhotographers),
    [filteredPhotographers]
  );

  const filterOn = isFilterActive(filter);
  const filterCount = countActiveFilters(filter);

  return (
    <div className="flex flex-col min-h-full" style={{ background: BG, paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}>
      {/* Hero Header */}
      <div
        className="rounded-b-3xl px-5 pt-9 pb-5 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 60%, #1a8c76 100%)` }}
      >
        <span className="text-white font-black text-lg tracking-tight mb-3 block">Memento</span>
        <h2 className="text-white font-black text-2xl leading-tight mb-1">
          Tìm nhiếp ảnh gia
          <br />
          hoàn hảo cho bạn
        </h2>
        <p className="text-white/70 text-xs mb-4">Kết nối cảm xúc qua từng khoảnh khắc</p>
        <div className="flex items-center gap-2 bg-white rounded-2xl px-4 py-3 shadow-md">
          <Search size={16} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none text-foreground"
            placeholder="Tìm kiếm phong cách, địa điểm..."
          />   {/* ← thiếu dòng này */}
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="w-7 h-7 rounded-xl flex items-center justify-center relative flex-shrink-0"
            style={{ background: filterOn ? TEAL : TEAL_LIGHT }}
            aria-label="Bộ lọc"
          >
            <SlidersHorizontal size={13} strokeWidth={2} className="text-white" />
            {filterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {filterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-foreground">Phong cách</h3>
        </div>

        <StyleFilter
          category={activeCategory}
          subcategory={activeSubcategory}
          onChange={(c, sub) => {
            setActiveCategory(c);
            setActiveSubcategory(sub);
          }}
        />

        {profile?.role !== "photographer" && (
          <div
            className="mt-5 rounded-2xl p-4 flex gap-3 items-start"
            style={{
              background: `linear-gradient(135deg, #e8f5f1 0%, #d4ede6 100%)`,
              border: `1.5px solid ${TEAL_LIGHT}30`,
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
              style={{ background: TEAL }}
            >
              <Award size={18} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest mb-0.5" style={{ color: TEAL_LIGHT }}>
                Memento Choice
              </p>
              <p className="font-bold text-sm" style={{ color: TEAL }}>
                Bắt đầu hành trình của bạn
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Các nhiếp ảnh gia được chọn lọc kỹ cho chất lượng và sự sáng tạo.
              </p>
              <button
                type="button"
                onClick={() => setScreen("become-photographer")}
                className="mt-2 text-xs font-bold px-3 py-1.5 rounded-xl text-white"
                style={{ background: TEAL }}
              >
                Gặp họ ngay →
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-5 mb-1">
          <h3 className="font-bold text-foreground">Nhiếp ảnh gia nổi bật</h3>
          <button type="button" className="text-xs font-semibold" style={{ color: TEAL_LIGHT }}>
            Xem tất cả
          </button>
        </div>
        <p className="text-xs font-semibold mb-3" style={{ color: TEAL_LIGHT }}>
          {featuredPhotographers.length} photographer đã được tìm thấy
        </p>

        <div className="pb-4">
          {featuredPhotographers.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">
              Chưa có nhiếp ảnh gia nổi bật nào ở mục này.
            </p>
          ) : (
            <FeaturedPhotographerCarousel
              photographers={featuredPhotographers}
              onProfile={(p) => {
                setPhotographer(p);
                setScreen("photographer-profile");
              }}
            />
          )}
        </div>

        {/* Tìm kiếm đơn: khách đăng yêu cầu thuê nhiếp ảnh gia */}
        <PhotoRequestBoard
          onCreate={() => setScreen("create-request")}
          onManage={() => setScreen("my-requests")}
          currentUserId={profile?.id ?? null}
          isPhotographer={profile?.role === "photographer"}
          manageBadge={offerUnread}
        />
      </div>

      <PhotographerFilterSheet
        open={filterOpen}
        value={filter}
        onClose={() => setFilterOpen(false)}
        onApply={setFilter}
        availableLocations={availableLocations}
      />
    </div>
  );
}
