import { Search, Star, MapPin, Bookmark, Award, SlidersHorizontal, Hash } from "lucide-react";
import type { Screen, Photographer } from "../types";
import type { Profile } from "../hooks/useProfile";
import { TEAL, TEAL_MID, TEAL_LIGHT, BG, styles } from "../constants";
import { formatPriceRange, formatLocations, getCardTags } from "../lib/photographerDisplay";
import { Avatar } from "../components/shared/Avatar";
import { useState, useRef } from "react";
import type { MouseEvent } from "react";

// Kiểu "kính mờ" (glass) cho tag / địa điểm trên ảnh bìa
// phía sau → chữ vẫn đọc rõ nhưng ảnh bìa không bị che, màu ảnh gần như giữ nguyên.
const GLASS: React.CSSProperties = {
  background: "rgba(0,0,0,0.22)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  border: "1px solid rgba(255,255,255,0.35)",
};
const TEXT_SHADOW: React.CSSProperties = { textShadow: "0 1px 3px rgba(0,0,0,0.55)" };

export default function HomeScreen({ setScreen, setPhotographer, savedIds, toggleSave, photographers, profile }:
  { setScreen: (s: Screen) => void; setPhotographer: (p: Photographer) => void; savedIds: number[]; toggleSave: (id: number) => void; photographers: Photographer[]; profile: Profile }) {
  // null = mặc định, không lọc gì (chọn tất cả)
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [openDropdownFor, setOpenDropdownFor] = useState<string | null>(null);
  const [dropdownLeft, setDropdownLeft] = useState(0);

  // Theo dõi vị trí cuộn ngang để vẽ thanh chỉ vị trí kiểu Shopee (0 → 1).
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollFrac, setScrollFrac] = useState(0);
  const [thumbFrac, setThumbFrac] = useState(1); // tỉ lệ chiều rộng track hiện đang thấy được

  function handleStylesScroll() {
    setOpenDropdownFor(null); // tránh dropdown bị lệch vị trí khi đang cuộn
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setScrollFrac(maxScroll > 0 ? el.scrollLeft / maxScroll : 0);
    setThumbFrac(Math.min(1, el.clientWidth / el.scrollWidth));
  }

  function handleTileClick(s: (typeof styles)[number], e: MouseEvent<HTMLButtonElement>) {
    if (activeCategory === s.label) {
      // Bấm lại đúng ô đang chọn → hủy, quay về mặc định (không lọc gì).
      setActiveCategory(null);
      setActiveSubcategory(null);
      setOpenDropdownFor(null);
      return;
    }
    setActiveCategory(s.label);
    setActiveSubcategory(null);
    const btnRect = e.currentTarget.getBoundingClientRect();
    const wrapperRect = wrapperRef.current!.getBoundingClientRect();
    const DROPDOWN_WIDTH = 220;
    const btnCenter = btnRect.left - wrapperRect.left + btnRect.width / 2;
    const rawLeft = btnCenter - DROPDOWN_WIDTH / 2;
    setDropdownLeft(Math.max(0, Math.min(rawLeft, wrapperRect.width - DROPDOWN_WIDTH)));
    setOpenDropdownFor(s.label);
  }

  // Lọc "Nhiếp ảnh gia nổi bật" theo nhóm/loại con đang chọn — không chọn gì
  // (activeCategory null) thì hiện tất cả.
  const activeGroup = styles.find(s => s.label === activeCategory);
  const filteredPhotographers = photographers.filter(p => {
    if (activeSubcategory) return p.tags.some(t => t.toLowerCase() === activeSubcategory.toLowerCase());
    if (activeGroup) {
      const matchSet = new Set([activeGroup.label.toLowerCase(), ...activeGroup.subcategories.map(s => s.toLowerCase())]);
      return p.tags.some(t => matchSet.has(t.toLowerCase()));
    }
    return true;
  });

  return (
    <div className="flex flex-col min-h-screen pb-20" style={{ background: BG }}>
      {/* Hero Header */}
      <div className="rounded-b-3xl px-5 pt-9 pb-5 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 60%, #1a8c76 100%)` }}>
        <span className="text-white font-black text-lg tracking-tight mb-3 block">Memento</span>
        <h2 className="text-white font-black text-2xl leading-tight mb-1">Tìm nhiếp ảnh gia<br />hoàn hảo cho bạn</h2>
        <p className="text-white/70 text-xs mb-4">Kết nối cảm xúc qua từng khoảnh khắc</p>
        <div className="flex items-center gap-2 bg-white rounded-2xl px-4 py-3 shadow-md">
          <Search size={16} className="text-muted-foreground" />
          <input className="flex-1 bg-transparent text-sm outline-none text-foreground" placeholder="Tìm kiếm phong cách, địa điểm..." />
          <button className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: TEAL_LIGHT }}>
            <SlidersHorizontal size={13} strokeWidth={2} className="text-white" />
          </button>
        </div>
      </div>

      <div className="px-4 mt-5">
        {/* Styles */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-foreground">Phong cách</h3>
        </div>

        <div className="relative" ref={wrapperRef}>
          {/* 1 hàng ngang kiểu Shopee — kéo qua kéo lại được (native touch scroll) */}
          <div ref={scrollRef} onScroll={handleStylesScroll}
            className="flex gap-3 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory scroll-smooth">
            {styles.map(s => {
              const active = activeCategory === s.label;
              return (
                <button key={s.label} onClick={e => handleTileClick(s, e)}
                  className="snap-start flex-shrink-0 flex flex-col items-center gap-1.5" style={{ width: 76 }}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all"
                    style={{ background: active ? TEAL : "#e8f5f0", border: `1px solid ${active ? TEAL : "transparent"}` }}>
                    <s.icon size={22} style={{ color: active ? "white" : TEAL }} strokeWidth={1.75} />
                  </div>
                  <span className="text-[11px] font-semibold text-center leading-tight" style={{ color: active ? TEAL : "#374151" }}>
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Thanh chỉ vị trí cuộn — chỉ hiện khi còn phần bị tràn ngoài màn hình */}
          {thumbFrac < 1 && (
            <div className="h-1 rounded-full mx-auto mt-1.5 overflow-hidden" style={{ width: 48, background: "rgba(0,0,0,0.1)" }}>
              <div className="h-full rounded-full transition-transform"
                style={{ width: `${thumbFrac * 100}%`, background: TEAL_LIGHT, transform: `translateX(${scrollFrac * (1 - thumbFrac) * 100}%)` }} />
            </div>
          )}

          {/* Dropdown loại con — canh ngay dưới ô đang chọn */}
          {openDropdownFor && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpenDropdownFor(null)} />
              <div className="absolute top-full mt-1 z-20 bg-white rounded-2xl shadow-lg border border-border overflow-hidden"
                style={{ left: dropdownLeft, minWidth: 200, maxWidth: 220 }}>
                {styles.find(s => s.label === openDropdownFor)!.subcategories.map(sub => {
                  const selected = activeSubcategory === sub;
                  return (
                    <button key={sub}
                      onClick={() => {
                        // Bấm lại đúng loại con đang chọn → hủy, về mặc định "tất cả" trong nhóm này.
                        setActiveSubcategory(selected ? null : sub);
                        setOpenDropdownFor(null);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold border-b border-border last:border-0"
                      style={{ color: selected ? TEAL : "#374151", background: selected ? "#e8f5f0" : "white" }}>
                      {sub}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Memento Choice Banner — ẩn hẳn nếu đã là photographer rồi */}
        {profile.role !== "photographer" && (
          <div className="mt-5 rounded-2xl p-4 flex gap-3 items-start"
            style={{ background: `linear-gradient(135deg, #e8f5f1 0%, #d4ede6 100%)`, border: `1.5px solid ${TEAL_LIGHT}30` }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
              style={{ background: TEAL }}>
              <Award size={18} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest mb-0.5" style={{ color: TEAL_LIGHT }}>Memento Choice</p>
              <p className="font-bold text-sm" style={{ color: TEAL }}>Bắt đầu hành trình của bạn</p>
              <p className="text-xs text-muted-foreground mt-0.5">Các nhiếp ảnh gia được chọn lọc kỹ cho chất lượng và sự sáng tạo.</p>
              <button onClick={() => setScreen("become-photographer")}
                className="mt-2 text-xs font-bold px-3 py-1.5 rounded-xl text-white"
                style={{ background: TEAL }}>Gặp họ ngay →</button>
            </div>
          </div>
        )}

        {/* Top Rated */}
        <div className="flex items-center justify-between mt-5 mb-3">
          <h3 className="font-bold text-foreground">Nhiếp ảnh gia nổi bật</h3>
          <button className="text-xs font-semibold" style={{ color: TEAL_LIGHT }}>Xem tất cả</button>
        </div>

        <div className="flex flex-col gap-4 pb-4">
          {filteredPhotographers.map(p => {
            const reviewCount = Array.isArray(p.reviews) ? p.reviews.length : 0;
            const ratingText = p.rating > 0 ? p.rating.toFixed(1) : "0";
            const bioText = (p.bio || "").trim();
            return (
            <div key={p.id} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-border">
              {/* Banner: chỉ ảnh + địa điểm + bookmark (tag chuyển xuống dưới bio) */}
              <div className="relative h-44">
                <img src={p.cover} alt={p.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.28) 0%, transparent 45%)" }} />
                <div className="absolute top-3 right-3">
                  <button type="button" onClick={() => toggleSave(p.id)}
                    className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm"
                    style={{ background: savedIds.includes(p.id) ? TEAL_LIGHT : "rgba(255,255,255,0.85)" }}>
                    <Bookmark size={15} strokeWidth={2} fill={savedIds.includes(p.id) ? "white" : "none"} stroke={savedIds.includes(p.id) ? "white" : TEAL} />
                  </button>
                </div>
                <div className="absolute bottom-3 left-3 right-3">
                  <div className="inline-flex items-center gap-1 max-w-full px-2.5 py-1 rounded-full" style={GLASS}>
                    <MapPin size={11} className="text-white/90 flex-shrink-0" />
                    <p className="text-white/95 text-xs truncate" style={TEXT_SHADOW}>{formatLocations(p)}</p>
                  </div>
                </div>
              </div>

              {/* Thân thẻ: avatar | tên đầy đủ + bio + stats + tag · giá · nút */}
              <div className="px-4 pt-3 pb-3">
                <div className="flex items-start gap-3">
                  <Avatar src={p.avatar} size={44} className="flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      {/* Tên hiển thị đầy đủ — cho xuống dòng, không cắt ... */}
                      <p className="font-bold text-sm leading-snug break-words" style={{ color: TEAL }}>{p.name}</p>
                      <p className="text-sm font-black whitespace-nowrap flex-shrink-0 pl-2" style={{ color: TEAL }}>{formatPriceRange(p)}</p>
                    </div>
                    {bioText ? (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">{bioText}</p>
                    ) : null}
                    {/* Sao · lượt đặt · đánh giá */}
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
                      <Star size={12} className="flex-shrink-0" fill="#f59e0b" stroke="#f59e0b" />
                      <span className="font-semibold text-foreground/80">{ratingText}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span>{p.bookings}+ lượt đặt</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span>{reviewCount} đánh giá</span>
                    </p>
                    {/* Tag phong cách — cuối phần bio (kiểu pill) */}
                    {getCardTags(p).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {getCardTags(p).map(t => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                            style={{ background: `${TEAL_LIGHT}18`, color: TEAL }}
                          >
                            <Hash size={10} strokeWidth={2.5} className="opacity-70" />
                            {t.replace(/^#/, "")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button type="button"
                    onClick={() => { setPhotographer(p); setScreen("photographer-profile"); }}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold border"
                    style={{ borderColor: TEAL, color: TEAL }}>
                    Hồ sơ
                  </button>
                  <button type="button"
                    onClick={() => { setPhotographer(p); setScreen("booking"); }}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white"
                    style={{ background: TEAL }}>
                    Đặt lịch
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
