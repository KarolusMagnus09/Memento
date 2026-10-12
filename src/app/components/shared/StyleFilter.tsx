import { useRef, useState } from "react";
import { TEAL, TEAL_LIGHT, styles } from "../../constants";

/**
 * Bộ lọc "Phong cách" DÙNG CHUNG cho Trang chủ và Khám phá.
 * - Hàng ô nhóm (kéo ngang được)
 * - Chọn 1 nhóm → loại con mở NGAY BÊN DƯỚI (nằm trong luồng trang, không nổi/float)
 * - Bấm lại ô đang chọn / chip đang chọn → hủy
 */
export function StyleFilter({ category, subcategory, onChange }: {
  category: string | null;
  subcategory: string | null;
  onChange: (category: string | null, subcategory: string | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollFrac, setScrollFrac] = useState(0);
  const [thumbFrac, setThumbFrac] = useState(1);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollFrac(max > 0 ? el.scrollLeft / max : 0);
    setThumbFrac(Math.min(1, el.clientWidth / el.scrollWidth));
  }

  const activeGroup = styles.find(s => s.label === category) ?? null;

  return (
    <div>
      <div ref={scrollRef} onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory scroll-smooth">
        {styles.map(s => {
          const active = category === s.label;
          return (
            <button key={s.label} type="button"
              onClick={() => (active ? onChange(null, null) : onChange(s.label, null))}
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

      {thumbFrac < 1 && (
        <div className="h-1 rounded-full mx-auto mt-1.5 overflow-hidden" style={{ width: 48, background: "rgba(0,0,0,0.1)" }}>
          <div className="h-full rounded-full transition-transform"
            style={{ width: `${thumbFrac * 100}%`, background: TEAL_LIGHT, transform: `translateX(${scrollFrac * (1 - thumbFrac) * 100}%)` }} />
        </div>
      )}

      {/* Loại con: mở ngay dưới hàng ô, đẩy nội dung bên dưới xuống (không float) */}
      {activeGroup && (
        <div className="mt-3 bg-white rounded-2xl border border-border p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: TEAL_LIGHT }}>
            {activeGroup.label}
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip label="Tất cả" active={!subcategory} onClick={() => onChange(activeGroup.label, null)} />
            {activeGroup.subcategories.map(sub => (
              <Chip key={sub} label={sub} active={subcategory === sub}
                onClick={() => onChange(activeGroup.label, subcategory === sub ? null : sub)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
      style={{
        background: active ? TEAL : "white",
        borderColor: active ? TEAL : "var(--border)",
        color: active ? "white" : "#374151",
      }}>
      {label}
    </button>
  );
}
