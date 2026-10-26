import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronDown, Check, Search, AlertCircle, Loader2 } from "lucide-react";
import type { Screen } from "../types";
import type { Profile } from "../hooks/useProfile";
import { TEAL, TEAL_LIGHT, BG, VN_PROVINCES, styles } from "../constants";
import { categoryDef, type ServiceCategory } from "../lib/serviceCategories";
import {
  SETTING_OPTIONS,
  createPhotoRequest,
  type RequestSetting,
} from "../lib/photoRequests";
import { PriceInput, BAD_CHAR_MSG } from "../components/shared/PriceInput";
import { AutoGrowTextarea } from "../components/shared/AutoGrowTextarea";

/** Dịch vụ đi kèm hiện khi bật mục "Dịch vụ đi kèm" (theo thứ tự yêu cầu) */
const EXTRA_ORDER: ServiceCategory[] = ["makeup", "rental_studio", "rental_outfit", "editor", "others"];

const INPUT_CLS = "w-full min-w-0 px-3 py-2.5 rounded-xl bg-muted text-sm outline-none";
const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** "YYYY-MM-DD" + "HH:mm" (giờ địa phương) → Date; thiếu / sai → null */
function toDate(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function Section({ id, title, required, error, hint, children }: {
  id?: string;
  title: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="rounded-2xl bg-white border border-border p-4 shadow-sm"
      style={error ? { borderColor: "#dc2626" } : undefined}>
      <h3 className="text-sm font-extrabold" style={{ color: TEAL }}>
        {title}{required && <span className="text-red-500"> *</span>}
      </h3>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      <div className="mt-3">{children}</div>
      {error && (
        <p className="mt-2 text-xs font-semibold text-red-600 flex items-start gap-1">
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
        </p>
      )}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border"
      style={{ background: on ? TEAL : "white", borderColor: on ? TEAL : "var(--border)", color: on ? "white" : "#374151" }}>
      {on && <Check size={12} strokeWidth={3} />}
      {children}
    </button>
  );
}

/**
 * Màn "Tạo đơn chụp ảnh" — khách đăng yêu cầu tìm nhiếp ảnh gia.
 * Đăng xong gọi onCreated() (App quay về Trang chủ; mục "Tìm kiếm đơn" tải lại và hiện đơn mới).
 */
export default function CreatePhotoRequestScreen({ setScreen, profile, onCreated }: {
  setScreen: (s: Screen) => void;
  profile: Profile;
  onCreated: () => void;
}) {
  const [genres, setGenres] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [city, setCity] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [venue, setVenue] = useState("");
  const [minStr, setMinStr] = useState("");
  const [maxStr, setMaxStr] = useState("");
  const [badChar, setBadChar] = useState(false);
  const [extraOn, setExtraOn] = useState(false);
  const [extras, setExtras] = useState<ServiceCategory[]>([]);
  const [setting, setSetting] = useState<Exclude<RequestSetting, "both"> | null>(null);
  const [note, setNote] = useState("");

  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const badTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (badTimer.current) clearTimeout(badTimer.current); }, []);

  const provinces = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    const all = [...VN_PROVINCES].sort((a, b) => a.localeCompare(b, "vi"));
    return q ? all.filter((n) => n.toLowerCase().includes(q)) : all;
  }, [cityQuery]);

  function onBadChar() {
    setBadChar(true);
    if (badTimer.current) clearTimeout(badTimer.current);
    badTimer.current = setTimeout(() => setBadChar(false), 3000);
  }

  const toggleIn = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  function pickStartDate(v: string) {
    setStartDate(v);
    // Chưa chọn / chọn ngày kết thúc sớm hơn ngày bắt đầu → kéo ngày kết thúc theo
    if (!endDate || (v && endDate < v)) setEndDate(v);
  }

  /* ───────── Kiểm tra dữ liệu ───────── */
  const start = toDate(startDate, startTime);
  const end = toDate(endDate, endTime);
  const minNum = minStr ? Number(minStr) : 0;
  const maxNum = maxStr ? Number(maxStr) : 0;

  const errors = {
    genres: genres.length === 0 ? "Chọn ít nhất 1 thể loại chụp." : null,
    time: !start || !end
      ? "Chọn đủ ngày và giờ bắt đầu, kết thúc."
      : start.getTime() < Date.now() - 60_000
        ? "Thời gian bắt đầu phải ở tương lai."
        : end.getTime() <= start.getTime()
          ? "Giờ kết thúc phải sau giờ bắt đầu."
          : null,
    city: !city ? "Chọn tỉnh / thành." : null,
    budget: !minStr || !maxStr
      ? "Nhập khoảng giá từ bao nhiêu đến bao nhiêu."
      : minNum <= 0 || maxNum <= 0
        ? "Giá phải lớn hơn 0."
        : minNum > maxNum
          ? "Giá “từ” không được lớn hơn giá “đến”."
          : null,
    extras: extraOn && extras.length === 0 ? "Chọn ít nhất 1 dịch vụ đi kèm, hoặc bỏ tick mục này." : null,
    setting: !setting ? "Chọn bối cảnh chụp." : null,
  };
  const order: (keyof typeof errors)[] = ["genres", "time", "city", "budget", "extras", "setting"];
  const firstError = order.find((k) => errors[k]);
  const show = (k: keyof typeof errors) => (attempted ? errors[k] : null);

  async function submit() {
    setAttempted(true);
    setSubmitError(null);
    if (firstError) {
      document.getElementById(`pr-${firstError}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (submitting || !start || !end || !setting) return;
    setSubmitting(true);
    const res = await createPhotoRequest(
      {
        genres,
        shootStart: start,
        shootEnd: end,
        city,
        venue,
        budgetMin: minNum,
        budgetMax: maxNum,
        extraServices: extraOn ? extras : [],
        setting,
        note,
      },
      profile.full_name?.trim() || profile.username || "Người dùng Memento"
    );
    setSubmitting(false);
    if (res.error) { setSubmitError(res.error); return; }
    onCreated();
  }

  return (
    <div className="flex flex-col min-h-full" style={{ background: BG }}>
      {/* Thanh tiêu đề */}
      <div className="sticky top-0 z-20 flex items-center gap-2 px-3 py-3 bg-white border-b border-border">
        <button type="button" onClick={() => setScreen("home")} aria-label="Quay lại"
          className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} />
        </button>
        <h1 className="font-black text-base" style={{ color: TEAL }}>Tạo đơn chụp ảnh</h1>
      </div>

      <div className="flex-1 px-4 pt-4 pb-6 flex flex-col gap-3">
        {/* Thể loại chụp — chọn nhiều */}
        <Section id="pr-genres" title="Thể loại chụp" required error={show("genres")} hint="Chọn một hoặc nhiều thể loại">
          <div className="flex flex-col gap-3">
            {styles.map((g) => {
              const n = g.subcategories.filter((s) => genres.includes(s)).length;
              return (
                <div key={g.label}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                    {g.label}{n > 0 && <span style={{ color: TEAL_LIGHT }}> · {n}</span>}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.subcategories.map((sub) => (
                      <Chip key={sub} on={genres.includes(sub)} onClick={() => setGenres((l) => toggleIn(l, sub))}>{sub}</Chip>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Thời gian */}
        <Section id="pr-time" title="Thời gian chụp" required error={show("time")}>
          <div className="flex flex-col gap-2.5">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Bắt đầu</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={startDate} min={todayStr()} onChange={(e) => pickStartDate(e.target.value)}
                  aria-label="Ngày bắt đầu" className={INPUT_CLS} />
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                  aria-label="Giờ bắt đầu" className={INPUT_CLS} />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Kết thúc</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={endDate} min={startDate || todayStr()} onChange={(e) => setEndDate(e.target.value)}
                  aria-label="Ngày kết thúc" className={INPUT_CLS} />
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                  aria-label="Giờ kết thúc" className={INPUT_CLS} />
              </div>
            </div>
          </div>
        </Section>

        {/* Địa điểm */}
        <Section id="pr-city" title="Địa điểm" required error={show("city")}>
          <button type="button" onClick={() => setCityOpen((v) => !v)} aria-expanded={cityOpen}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border bg-white text-sm text-left"
            style={{ borderColor: city ? TEAL : "var(--border)" }}>
            <span className={city ? "font-semibold" : "text-muted-foreground"} style={city ? { color: TEAL } : undefined}>
              {city || "Chọn tỉnh / thành"}
            </span>
            <ChevronDown size={16} className="text-muted-foreground flex-shrink-0 transition-transform"
              style={{ transform: cityOpen ? "rotate(180deg)" : undefined }} />
          </button>
          {cityOpen && (
            <div className="mt-2 rounded-xl border border-border overflow-hidden bg-white">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
                <Search size={14} className="text-muted-foreground flex-shrink-0" />
                <input value={cityQuery} onChange={(e) => setCityQuery(e.target.value)}
                  placeholder="Tìm tỉnh / thành..." className="flex-1 min-w-0 bg-transparent text-sm outline-none" />
              </div>
              <div className="max-h-48 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
                {provinces.length === 0 && <p className="text-xs text-muted-foreground px-3 py-3">Không tìm thấy.</p>}
                {provinces.map((name) => {
                  const on = city === name;
                  return (
                    <button key={name} type="button"
                      onClick={() => { setCity(name); setCityOpen(false); setCityQuery(""); }}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left border-b border-border last:border-b-0"
                      style={on ? { color: TEAL, fontWeight: 700, background: `${TEAL_LIGHT}14` } : undefined}>
                      {name}{on && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-xs font-semibold text-muted-foreground mt-3 mb-1">Địa chỉ cụ thể (không bắt buộc)</p>
          <AutoGrowTextarea value={venue} onChange={setVenue} rows={1} maxHeight={96}
            placeholder="Số nhà, đường, tên địa điểm..." aria-label="Địa chỉ cụ thể"
            className="px-3 py-2.5 rounded-xl bg-muted text-sm outline-none" />
        </Section>

        {/* Giá */}
        <Section id="pr-budget" title="Giá mong muốn" required error={show("budget")}>
          <div className="flex items-center gap-2">
            <PriceInput value={minStr} onChange={setMinStr} onBadChar={onBadChar} placeholder="Từ" invalid={!!show("budget") && !minStr}
              ariaLabel="Giá từ" className={INPUT_CLS} />
            <span className="text-muted-foreground flex-shrink-0">–</span>
            <PriceInput value={maxStr} onChange={setMaxStr} onBadChar={onBadChar} placeholder="Đến" invalid={!!show("budget") && !maxStr}
              ariaLabel="Giá đến" className={INPUT_CLS} />
            <span className="text-sm font-bold flex-shrink-0" style={{ color: TEAL }}>đ</span>
          </div>
          {badChar && (
            <p className="mt-2 text-xs font-semibold text-red-600 flex items-start gap-1">
              <AlertCircle size={12} className="flex-shrink-0 mt-0.5" /> <span>{BAD_CHAR_MSG}</span>
            </p>
          )}
        </Section>

        {/* Dịch vụ đi kèm */}
        <Section id="pr-extras" title="Dịch vụ đi kèm" error={show("extras")}>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={extraOn} className="w-4 h-4 flex-shrink-0" style={{ accentColor: TEAL }}
              onChange={(e) => { setExtraOn(e.target.checked); if (!e.target.checked) setExtras([]); }} />
            <span className="text-sm font-semibold">Tôi cần thêm dịch vụ đi kèm</span>
          </label>
          {extraOn && (
            <div className="mt-3 rounded-xl border border-border overflow-hidden">
              {EXTRA_ORDER.map((c, i) => (
                <label key={c} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold cursor-pointer"
                  style={{ borderTop: i === 0 ? undefined : "1px solid var(--border)" }}>
                  <input type="checkbox" checked={extras.includes(c)} className="w-4 h-4" style={{ accentColor: TEAL }}
                    onChange={() => setExtras((l) => toggleIn(l, c))} />
                  <span>{categoryDef(c).label}</span>
                </label>
              ))}
            </div>
          )}
        </Section>

        {/* Bối cảnh */}
        <Section id="pr-setting" title="Bối cảnh" required error={show("setting")}>
          <div className="flex flex-wrap gap-1.5">
            {SETTING_OPTIONS.map((o) => (
              <Chip key={o.id} on={setting === o.id} onClick={() => setSetting(o.id)}>{o.label}</Chip>
            ))}
          </div>
        </Section>

        {/* Nội dung thêm */}
        <Section title="Nội dung thêm" hint="Mô tả thêm ý tưởng, yêu cầu riêng... (không bắt buộc)">
          <AutoGrowTextarea value={note} onChange={setNote} rows={3} maxHeight={180}
            placeholder="Nhập nội dung thêm..." aria-label="Nội dung thêm"
            className="px-3 py-2.5 rounded-xl bg-muted text-sm outline-none" />
        </Section>

        {submitError && (
          <p className="text-xs font-semibold text-red-600 flex items-start gap-1">
            <AlertCircle size={12} className="flex-shrink-0 mt-0.5" /> <span>{submitError}</span>
          </p>
        )}
      </div>

      {/* Nút đăng — dính đáy */}
      <div className="sticky bottom-0 z-20 px-4 pt-3 bg-white border-t border-border"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
        <button type="button" onClick={submit} disabled={submitting}
          className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: TEAL }}>
          {submitting && <Loader2 size={16} className="animate-spin" />}
          {submitting ? "Đang đăng..." : "Đăng đơn"}
        </button>
      </div>
    </div>
  );
}
