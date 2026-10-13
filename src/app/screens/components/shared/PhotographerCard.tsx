import { Star, MapPin, Bookmark, Hash } from "lucide-react";
import type { CSSProperties } from "react";
import type { Photographer } from "../../types";
import { TEAL, TEAL_LIGHT } from "../../constants";
import { formatPriceRange, formatLocations, getCardTags, getCardImage, formatRating, getReviewCount } from "../../lib/photographerDisplay";
import { Avatar } from "./Avatar";

// Kiểu "kính mờ" (glass) cho địa điểm trên ảnh bìa
const GLASS: CSSProperties = {
  background: "rgba(0,0,0,0.22)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  border: "1px solid rgba(255,255,255,0.35)",
};
const TEXT_SHADOW: CSSProperties = { textShadow: "0 1px 3px rgba(0,0,0,0.55)" };

/**
 * Thẻ nhiếp ảnh gia DÙNG CHUNG cho Trang chủ và Khám phá.
 * Muốn đổi giao diện thẻ → chỉ sửa file này, cả hai màn tự khớp.
 */
export function PhotographerCard({ p, saved, onToggleSave, onProfile, onBook }: {
  p: Photographer;
  saved: boolean;
  onToggleSave: () => void;
  onProfile: () => void;
  onBook: () => void;
}) {
  const reviewCount = getReviewCount(p);
  const ratingText = formatRating(p);
  const bioText = (p.bio || "").trim();
  const tags = getCardTags(p);

  return (
    <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-border">
      {/* Banner: ảnh + địa điểm + bookmark */}
      <div className="relative h-44">
        <img src={getCardImage(p)} alt={p.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.28) 0%, transparent 45%)" }} />
        <div className="absolute top-3 right-3">
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSave(); }}
            className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm"
            style={{ background: saved ? TEAL_LIGHT : "rgba(255,255,255,0.85)" }}>
            <Bookmark size={15} strokeWidth={2} fill={saved ? "white" : "none"} stroke={saved ? "white" : TEAL} />
          </button>
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <div className="inline-flex items-center gap-1 max-w-full px-2.5 py-1 rounded-full" style={GLASS}>
            <MapPin size={11} className="text-white/90 flex-shrink-0" />
            <p className="text-white/95 text-xs truncate" style={TEXT_SHADOW}>{formatLocations(p)}</p>
          </div>
        </div>
      </div>

      {/* Thân thẻ: avatar | tên + bio + stats + tag · giá · nút */}
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-start gap-3">
          <Avatar src={p.avatar} size={44} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-sm leading-snug break-words" style={{ color: TEAL }}>{p.name}</p>
              <p className="text-sm font-black whitespace-nowrap flex-shrink-0 pl-2" style={{ color: TEAL }}>{formatPriceRange(p)}</p>
            </div>
            {bioText ? (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mt-0.5 break-words" style={{ overflowWrap: "anywhere" }}>{bioText}</p>
            ) : null}
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
              <Star size={12} className="flex-shrink-0" fill="#f59e0b" stroke="#f59e0b" />
              <span className="font-semibold text-foreground/80">{ratingText}</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{p.bookings}+ lượt đặt</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{reviewCount} đánh giá</span>
            </p>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar" style={{ WebkitOverflowScrolling: "touch" }}>
            {tags.map(t => (
              <span key={t}
                className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0"
                style={{ background: `${TEAL_LIGHT}18`, color: TEAL }}>
                <Hash size={10} strokeWidth={2.5} className="opacity-70 flex-shrink-0" />
                {t.replace(/^#/, "")}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <button type="button" onClick={onProfile}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold border"
            style={{ borderColor: TEAL, color: TEAL }}>
            Hồ sơ
          </button>
          <button type="button" onClick={onBook}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white"
            style={{ background: TEAL }}>
            Đặt lịch
          </button>
        </div>
      </div>
    </div>
  );
}
