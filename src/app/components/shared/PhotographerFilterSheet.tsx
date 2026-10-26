import { useBackHandler } from "../../lib/backNavigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronDown, Search, AlertCircle } from "lucide-react";
import { TEAL, TEAL_LIGHT, VN_PROVINCES, styles } from "../../constants";
import {
  EMPTY_FILTER,
  type PhotographerFilter,
  countActiveFilters,
} from "../../lib/photographerFilter";
import { EXTRA_SERVICES, type ExtraServiceKey } from "../../lib/serviceCategories";
import { PriceInput, BAD_CHAR_MSG } from "./PriceInput";


const SORT_OPTIONS: { id: NonNullable<PhotographerFilter["sort"]>; label: string }[] = [
  { id: "most_shoots", label: "Số lần chụp nhiều nhất" },
  { id: "top_rated", label: "Đánh giá cao nhất" },
  { id: "most_liked", label: "Yêu thích nhất" },
];

/**
 * Sheet filter — nằm trong khung app (max-w + max-h), không tràn.
 * Apply mới áp dụng; có Reset.
 */
export function PhotographerFilterSheet({
  open,
  value,
  onClose,
  onApply,
  availableLocations,
}: {
  open: boolean;
  value: PhotographerFilter;
  onClose: () => void;
  onApply: (f: PhotographerFilter) => void;
  availableLocations?: string[];
}) {
  const [draft, setDraft] = useState<PhotographerFilter>(value);
  const [priceMinStr, setPriceMinStr] = useState("");
  const [priceMaxStr, setPriceMaxStr] = useState("");
  const [locOpen, setLocOpen] = useState(false);
  const [locQuery, setLocQuery] = useState("");
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);
  const [badCharNotice, setBadCharNotice] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashBadChar() {
    setBadCharNotice(true);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setBadCharNotice(false), 2500);
  }

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setPriceMinStr(value.priceMin != null ? String(value.priceMin) : "");
    setPriceMaxStr(value.priceMax != null ? String(value.priceMax) : "");
    setLocOpen(false);
    setLocQuery("");
    setOpenCat(null);
    setBadCharNotice(false);
  }, [open, value]);

  const locs = useMemo(() => {
    const fromData = (availableLocations || []).filter(Boolean);
    const set = new Set([...fromData, ...VN_PROVINCES]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
  }, [availableLocations]);

  const filteredLocs = useMemo(() => {
    const q = locQuery.trim().toLowerCase();
    if (!q) return locs;
    return locs.filter((n) => n.toLowerCase().includes(q));
  }, [locs, locQuery]);

  useBackHandler(open, onClose);

  if (!open) return null;

  function toggleLoc(name: string) {
    setDraft((d) => {
      const has = d.locations.includes(name);
      return {
        ...d,
        locations: has ? d.locations.filter((x) => x !== name) : [...d.locations, name],
      };
    });
  }

  function toggleStyle(sub: string) {
    setDraft((d) => {
      const has = d.shootingStyles.includes(sub);
      return {
        ...d,
        shootingStyles: has
          ? d.shootingStyles.filter((x) => x !== sub)
          : [...d.shootingStyles, sub],
      };
    });
  }

  function toggleExtra(key: ExtraServiceKey) {
    setDraft((d) => {
      const cur = d.extraServices ?? [];
      return {
        ...d,
        extraServices: cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key],
      };
    });
  }

  function parsePrice(s: string): number | null {
    const n = Number(String(s).replace(/[^0-9]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function handleApply() {
    if (priceError) return;
    onApply({
      ...draft,
      priceMin: parsePrice(priceMinStr),
      priceMax: parsePrice(priceMaxStr),
    });
    onClose();
  }

  function handleReset() {
    setDraft(EMPTY_FILTER);
    setPriceMinStr("");
    setPriceMaxStr("");
    setLocQuery("");
  }

  const activeN = countActiveFilters({
    ...draft,
    priceMin: parsePrice(priceMinStr),
    priceMax: parsePrice(priceMaxStr),
  });

  // Kiểm tra khoảng giá: phải nhập từ nhỏ đến lớn, giá cao nhất phải > 0
  const minN = parsePrice(priceMinStr);
  const maxN = parsePrice(priceMaxStr);
  const maxIsZero = priceMaxStr !== "" && maxN === null;
  const minOverMax = minN != null && maxN != null && minN > maxN;
  const priceError = maxIsZero
    ? "Giá cao nhất phải lớn hơn 0."
    : minOverMax
      ? "Giá thấp nhất đang lớn hơn giá cao nhất. Hãy nhập từ nhỏ đến lớn."
      : null;

  const locSummary =
    draft.locations.length === 0
      ? "Tất cả khu vực"
      : draft.locations.length <= 2
        ? draft.locations.join(", ")
        : `${draft.locations.slice(0, 2).join(", ")} +${draft.locations.length - 2}`;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      {/* Khung sheet: max-w-md, max 85vh, không tràn app */}
      <div
        className="w-full max-w-md bg-white rounded-t-3xl flex flex-col shadow-xl"
        style={{
          maxHeight: "min(85vh, 100%)",
          width: "100%",
          maxWidth: "min(28rem, 100%)",
          margin: "0 auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <h3 className="font-bold text-base" style={{ color: TEAL }}>
            Bộ lọc
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        <div
          className="px-4 py-3 overflow-y-auto flex-1 min-h-0"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* Hồ sơ ghim — mặc định bật */}
          <div className="flex items-center gap-3 mb-4 py-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Hồ sơ ghim</p>
              <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                Bật: hồ sơ đã ghim (khớp filter) luôn trên đầu. Tắt: ghim xếp như hồ sơ thường.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, pinFirst: !d.pinFirst }))}
              className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
              style={{ background: draft.pinFirst ? TEAL : "#d1d5db" }}
              role="switch"
              aria-checked={draft.pinFirst}
              aria-label="Hồ sơ ghim lên đầu"
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                style={{ transform: draft.pinFirst ? "translateX(20px)" : "translateX(0)" }}
              />
            </button>
          </div>

          {/* Địa chỉ — dropdown + search */}
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Địa chỉ / Khu vực
          </p>
          <button
            type="button"
            onClick={() => setLocOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border bg-white text-sm text-left mb-2"
            style={{ borderColor: draft.locations.length ? TEAL : "var(--border)" }}
          >
            <span className={draft.locations.length ? "font-semibold" : "text-muted-foreground"} style={draft.locations.length ? { color: TEAL } : undefined}>
              {locSummary}
            </span>
            <ChevronDown
              size={16}
              className="text-muted-foreground flex-shrink-0 transition-transform"
              style={{ transform: locOpen ? "rotate(180deg)" : undefined }}
            />
          </button>
          {locOpen && (
            <div className="mb-4 rounded-xl border border-border overflow-hidden bg-white">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
                <Search size={14} className="text-muted-foreground flex-shrink-0" />
                <input
                  value={locQuery}
                  onChange={(e) => setLocQuery(e.target.value)}
                  placeholder="Tìm tỉnh / thành..."
                  className="flex-1 bg-transparent text-sm outline-none"
                />
                {locQuery && (
                  <button type="button" onClick={() => setLocQuery("")} className="text-xs text-muted-foreground">
                    Xóa
                  </button>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto p-2 flex flex-wrap gap-1.5">
                {filteredLocs.length === 0 && (
                  <p className="text-xs text-muted-foreground px-1 py-2">Không tìm thấy.</p>
                )}
                {filteredLocs.map((name) => {
                  const on = draft.locations.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleLoc(name)}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                      style={{
                        background: on ? TEAL : "white",
                        borderColor: on ? TEAL : "var(--border)",
                        color: on ? "white" : "#374151",
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              {draft.locations.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, locations: [] }))}
                  className="w-full text-xs font-semibold py-2 border-t border-border"
                  style={{ color: TEAL }}
                >
                  Bỏ chọn tất cả
                </button>
              )}
            </div>
          )}

          {/* Giá */}
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 mt-1">
            Giá tiền (VND)
          </p>
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <PriceInput
                value={priceMinStr}
                onChange={setPriceMinStr}
                onBadChar={flashBadChar}
                placeholder="Từ"
                ariaLabel="Giá thấp nhất"
                invalid={minOverMax}
              />
              <span className="text-muted-foreground text-sm flex-shrink-0">—</span>
              <PriceInput
                value={priceMaxStr}
                onChange={setPriceMaxStr}
                onBadChar={flashBadChar}
                placeholder="Đến"
                ariaLabel="Giá cao nhất"
                invalid={minOverMax || maxIsZero}
              />
            </div>
            {priceError || badCharNotice ? (
              <p className="text-[11px] font-semibold mt-1.5 flex items-center gap-1" style={{ color: "#dc2626" }}>
                <AlertCircle size={11} className="flex-shrink-0" /> {priceError || BAD_CHAR_MSG}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Nhập giá từ thấp đến cao, ví dụ 500.000 — 2.000.000.
              </p>
            )}
          </div>

          {/* Thể loại chụp — 4 dropdown */}
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Thể loại chụp
          </p>
          <div className="flex flex-col gap-2 mb-4">
            {styles.map((cat) => {
              const isOpen = openCat === cat.label;
              const selectedInCat = cat.subcategories.filter((s) =>
                draft.shootingStyles.includes(s)
              );
              return (
                <div key={cat.label} className="rounded-xl border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenCat(isOpen ? null : cat.label)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold bg-white"
                  >
                    <span className="truncate">
                      {cat.label}
                      {selectedInCat.length > 0 && (
                        <span className="ml-1.5 text-[11px] font-bold" style={{ color: TEAL_LIGHT }}>
                          ({selectedInCat.length})
                        </span>
                      )}
                    </span>
                    <ChevronDown
                      size={16}
                      className="text-muted-foreground flex-shrink-0 transition-transform"
                      style={{ transform: isOpen ? "rotate(180deg)" : undefined }}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-2.5 flex flex-wrap gap-1.5 border-t border-border pt-2 bg-muted/20">
                      {cat.subcategories.map((sub) => {
                        const on = draft.shootingStyles.includes(sub);
                        return (
                          <button
                            key={sub}
                            type="button"
                            onClick={() => toggleStyle(sub)}
                            className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                            style={{
                              background: on ? TEAL : "white",
                              borderColor: on ? TEAL : "var(--border)",
                              color: on ? "white" : "#374151",
                            }}
                          >
                            {sub}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Dịch vụ thêm — dropdown, tick nhiều ô */}
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Dịch vụ thêm
          </p>
          <div className="mb-4 rounded-xl border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setExtraOpen((v) => !v)}
              aria-expanded={extraOpen}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold bg-white"
            >
              <span className="truncate">
                {(draft.extraServices?.length ?? 0) === 0
                  ? "Tất cả dịch vụ"
                  : EXTRA_SERVICES.filter((x) => draft.extraServices.includes(x.key))
                      .map((x) => x.label)
                      .join(", ")}
              </span>
              <ChevronDown
                size={16}
                className="text-muted-foreground flex-shrink-0 transition-transform"
                style={{ transform: extraOpen ? "rotate(180deg)" : undefined }}
              />
            </button>
            {extraOpen && (
              <div className="border-t border-border bg-muted/20 py-1">
                {EXTRA_SERVICES.map((opt) => {
                  const on = (draft.extraServices ?? []).includes(opt.key);
                  return (
                    <label
                      key={opt.key}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleExtra(opt.key)}
                        className="w-4 h-4"
                        style={{ accentColor: TEAL }}
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ưu tiên hiển thị — không còn chữ nhỏ bên phải */}
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Ưu tiên hiển thị
          </p>
          <div className="flex flex-col gap-2 mb-1">
            {SORT_OPTIONS.map((opt) => {
              const on = draft.sort === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({ ...d, sort: d.sort === opt.id ? null : opt.id }))
                  }
                  className="w-full px-3 py-2.5 rounded-xl border text-left text-sm font-semibold"
                  style={{
                    background: on ? `${TEAL_LIGHT}18` : "white",
                    borderColor: on ? TEAL : "var(--border)",
                    color: on ? TEAL : "#374151",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border flex gap-2 flex-shrink-0 safe-bottom">
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 py-3 rounded-xl text-sm font-bold border"
            style={{ borderColor: TEAL, color: TEAL }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!!priceError}
            className="flex-[1.4] py-3 rounded-xl text-sm font-bold text-white disabled:opacity-45"
            style={{ background: TEAL }}
          >
            Apply{activeN > 0 ? ` (${activeN})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
