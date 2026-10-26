import { useEffect, useMemo, useState } from "react";
import { X, ChevronDown, Search } from "lucide-react";
import { useBackHandler } from "../../lib/backNavigation";
import { TEAL, TEAL_LIGHT, VN_PROVINCES, styles } from "../../constants";
import { SERVICE_CATEGORIES, type ServiceCategory } from "../../lib/serviceCategories";
import { EMPTY_REQUEST_FILTER, countRequestFilters, type RequestFilter } from "../../lib/photoRequests";

/** Bộ lọc đơn: loại dịch vụ (tick) · thể loại · địa điểm. (Sắp xếp nằm ngoài, trên hộp danh sách.) */
export function PhotoRequestFilterSheet({ open, value, onClose, onApply }: {
  open: boolean;
  value: RequestFilter;
  onClose: () => void;
  onApply: (f: RequestFilter) => void;
}) {
  const [draft, setDraft] = useState<RequestFilter>(value);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [locOpen, setLocOpen] = useState(false);
  const [locQuery, setLocQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setOpenCat(null);
    setLocOpen(false);
    setLocQuery("");
  }, [open, value]);

  useBackHandler(open, onClose);

  const filteredLocs = useMemo(() => {
    const q = locQuery.trim().toLowerCase();
    const all = [...VN_PROVINCES].sort((a, b) => a.localeCompare(b, "vi"));
    return q ? all.filter((n) => n.toLowerCase().includes(q)) : all;
  }, [locQuery]);

  if (!open) return null;

  const toggle = <K extends "services" | "genres" | "locations">(key: K, item: RequestFilter[K][number]) =>
    setDraft((d) => {
      const cur = d[key] as string[];
      const next = cur.includes(item as string) ? cur.filter((x) => x !== item) : [...cur, item as string];
      return { ...d, [key]: next } as RequestFilter;
    });

  const locSummary =
    draft.locations.length === 0
      ? "Tất cả khu vực"
      : draft.locations.length <= 2
        ? draft.locations.join(", ")
        : `${draft.locations.slice(0, 2).join(", ")} +${draft.locations.length - 2}`;

  const n = countRequestFilters(draft);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full bg-white rounded-t-3xl flex flex-col shadow-xl"
        style={{ maxHeight: "min(85vh, 100%)", maxWidth: "min(28rem, 100%)", margin: "0 auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <h3 className="font-bold text-base" style={{ color: TEAL }}>Lọc đơn tìm nhiếp ảnh gia</h3>
          <button type="button" onClick={onClose} aria-label="Đóng"
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 overflow-y-auto flex-1 min-h-0" style={{ WebkitOverflowScrolling: "touch" }}>
          {/* Loại dịch vụ — tick nhiều ô */}
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Loại dịch vụ cần thuê</p>
          <div className="mb-4 rounded-xl border border-border overflow-hidden">
            {SERVICE_CATEGORIES.map((c, i) => {
              const on = draft.services.includes(c.value);
              return (
                <label key={c.value}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold cursor-pointer"
                  style={{ borderTop: i === 0 ? undefined : "1px solid var(--border)" }}>
                  <input type="checkbox" checked={on} onChange={() => toggle("services", c.value as ServiceCategory)}
                    className="w-4 h-4" style={{ accentColor: TEAL }} />
                  <span>{c.label}</span>
                </label>
              );
            })}
          </div>

          {/* Địa điểm */}
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Địa điểm</p>
          <button type="button" onClick={() => setLocOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border bg-white text-sm text-left mb-2"
            style={{ borderColor: draft.locations.length ? TEAL : "var(--border)" }}>
            <span className={draft.locations.length ? "font-semibold" : "text-muted-foreground"}
              style={draft.locations.length ? { color: TEAL } : undefined}>{locSummary}</span>
            <ChevronDown size={16} className="text-muted-foreground flex-shrink-0 transition-transform"
              style={{ transform: locOpen ? "rotate(180deg)" : undefined }} />
          </button>
          {locOpen && (
            <div className="mb-4 rounded-xl border border-border overflow-hidden bg-white">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
                <Search size={14} className="text-muted-foreground flex-shrink-0" />
                <input value={locQuery} onChange={(e) => setLocQuery(e.target.value)}
                  placeholder="Tìm tỉnh / thành..." className="flex-1 bg-transparent text-sm outline-none" />
                {locQuery && (
                  <button type="button" onClick={() => setLocQuery("")} className="text-xs text-muted-foreground">Xóa</button>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto p-2 flex flex-wrap gap-1.5">
                {filteredLocs.length === 0 && <p className="text-xs text-muted-foreground px-1 py-2">Không tìm thấy.</p>}
                {filteredLocs.map((name) => {
                  const on = draft.locations.includes(name);
                  return (
                    <button key={name} type="button" onClick={() => toggle("locations", name)}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                      style={{ background: on ? TEAL : "white", borderColor: on ? TEAL : "var(--border)", color: on ? "white" : "#374151" }}>
                      {name}
                    </button>
                  );
                })}
              </div>
              {draft.locations.length > 0 && (
                <button type="button" onClick={() => setDraft((d) => ({ ...d, locations: [] }))}
                  className="w-full text-xs font-semibold py-2 border-t border-border" style={{ color: TEAL }}>
                  Bỏ chọn tất cả
                </button>
              )}
            </div>
          )}

          {/* Thể loại chụp */}
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Thể loại chụp</p>
          <div className="flex flex-col gap-2 mb-1">
            {styles.map((cat) => {
              const isOpen = openCat === cat.label;
              const selected = cat.subcategories.filter((s) => draft.genres.includes(s));
              return (
                <div key={cat.label} className="rounded-xl border border-border overflow-hidden">
                  <button type="button" onClick={() => setOpenCat(isOpen ? null : cat.label)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold bg-white">
                    <span className="truncate">
                      {cat.label}
                      {selected.length > 0 && (
                        <span className="ml-1.5 text-[11px] font-bold" style={{ color: TEAL_LIGHT }}>({selected.length})</span>
                      )}
                    </span>
                    <ChevronDown size={16} className="text-muted-foreground flex-shrink-0 transition-transform"
                      style={{ transform: isOpen ? "rotate(180deg)" : undefined }} />
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-2.5 flex flex-wrap gap-1.5 border-t border-border pt-2 bg-muted/20">
                      {cat.subcategories.map((sub) => {
                        const on = draft.genres.includes(sub);
                        return (
                          <button key={sub} type="button" onClick={() => toggle("genres", sub)}
                            className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                            style={{ background: on ? TEAL : "white", borderColor: on ? TEAL : "var(--border)", color: on ? "white" : "#374151" }}>
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
        </div>

        <div className="px-4 py-3 border-t border-border flex gap-2 flex-shrink-0 safe-bottom">
          <button type="button"
            onClick={() => setDraft({ ...EMPTY_REQUEST_FILTER, sort: draft.sort })}
            className="flex-1 py-3 rounded-xl text-sm font-bold border"
            style={{ borderColor: TEAL, color: TEAL }}>
            Reset
          </button>
          <button type="button"
            onClick={() => { onApply(draft); onClose(); }}
            className="flex-[1.4] py-3 rounded-xl text-sm font-bold text-white"
            style={{ background: TEAL }}>
            Apply{n > 0 ? ` (${n})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
