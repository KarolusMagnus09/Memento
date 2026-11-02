import { useRef, useState } from "react";
import { TEAL, TEAL_LIGHT, styles } from "../../constants";

/**
 * "Phong cách" ở Khám phá — ĐỒNG BỘ với mục "Thể loại chụp" trong bộ lọc:
 * cả hai cùng đọc / ghi filter.shootingStyles (danh sách thể loại con đã chọn).
 * - Ô nhóm sáng khi nhóm đó có ít nhất 1 thể loại con được chọn.
 * - Bấm ô nhóm chưa chọn → chọn tất cả thể loại con của nhóm và mở danh sách chip bên dưới.
 * - Bấm ô nhóm đang mở → bỏ chọn cả nhóm. Chip bật/tắt từng thể loại; chip "Tất cả" chọn / bỏ cả nhóm.
 */
export function StyleFilter({ selected, onChange }: {
  selected: string[];
  onChange: (subs: string[]) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollFrac, setScrollFrac] = useState(0);
  const [thumbFrac, setThumbFrac] = useState(1);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollFrac(max > 0 ? el.scrollLeft / max : 0);
    setThumbFrac(Math.min(1, el.clientWidth / Math.max(el.scrollWidth, 1)));
  }

  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const picked = new Set(selected);
  const countIn = (g: (typeof styles)[number]) => g.subcategories.filter((x) => picked.has(x)).length;

  // Nhóm đang mở chip: nhóm vừa bấm (nếu còn chọn), nếu không thì nhóm đầu tiên có chọn (vd. chọn từ bộ lọc)
  const openGroup =
    styles.find((g) => g.label === openLabel && countIn(g) > 0) ?? styles.find((g) => countIn(g) > 0) ?? null;

  const withoutGroup = (g: (typeof styles)[number]) => selected.filter((x) => !g.subcategories.includes(x));
  const withAllOfGroup = (g: (typeof styles)[number]) => [...withoutGroup(g), ...g.subcategories];

  return (
    <div className="w-full max-w-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory scroll-smooth w-full"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {styles.map((s) => {
          const active = countIn(s) > 0;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                if (!active) {
                  onChange(withAllOfGroup(s));
                  setOpenLabel(s.label);
                } else if (openGroup?.label !== s.label) {
                  setOpenLabel(s.label); // đang chọn nhưng chưa mở → mở ra xem
                } else {
                  onChange(withoutGroup(s)); // đang mở → bỏ chọn cả nhóm
                }
              }}
              className="snap-start flex-shrink-0 flex flex-col items-center gap-1.5"
              style={{ width: 76 }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all"
                style={{
                  background: active ? TEAL : "#e8f5f0",
                  border: `1px solid ${active ? TEAL : "transparent"}`,
                }}
              >
                <s.icon size={22} style={{ color: active ? "white" : TEAL }} strokeWidth={1.75} />
              </div>
              {/* Cùng chiều cao nhãn để 4 ô thẳng hàng (nhãn dài như Giới Trẻ không đẩy layout) */}
              <span
                className="text-[11px] font-semibold text-center leading-tight"
                style={{
                  color: active ? TEAL : "#374151",
                  minHeight: 28,
                  width: "100%",
                }}
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {thumbFrac < 0.99 && (
        <div
          className="h-1 rounded-full mx-auto mt-1.5 overflow-hidden"
          style={{ width: 48, background: "rgba(0,0,0,0.1)" }}
        >
          <div
            className="h-full rounded-full transition-transform"
            style={{
              width: `${thumbFrac * 100}%`,
              background: TEAL_LIGHT,
              transform: `translateX(${scrollFrac * (1 - thumbFrac) * 100}%)`,
            }}
          />
        </div>
      )}

      {/* Loại con: căn trái, full width */}
      {openGroup && (
        <div className="mt-3 bg-white rounded-2xl border border-border p-3 w-full max-w-full box-border">
          <p
            className="text-[11px] font-bold uppercase tracking-wide mb-2 text-left"
            style={{ color: TEAL_LIGHT }}
          >
            {openGroup.label}
          </p>
          <div className="flex flex-wrap gap-2 justify-start w-full">
            <Chip
              label="Tất cả"
              active={countIn(openGroup) === openGroup.subcategories.length}
              onClick={() =>
                onChange(
                  countIn(openGroup) === openGroup.subcategories.length
                    ? withoutGroup(openGroup)
                    : withAllOfGroup(openGroup)
                )
              }
            />
            {openGroup.subcategories.map((sub) => (
              <Chip
                key={sub}
                label={sub}
                active={picked.has(sub)}
                onClick={() =>
                  onChange(picked.has(sub) ? selected.filter((x) => x !== sub) : [...selected, sub])
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
      style={{
        background: active ? TEAL : "white",
        borderColor: active ? TEAL : "var(--border)",
        color: active ? "white" : "#374151",
      }}
    >
      {label}
    </button>
  );
}
