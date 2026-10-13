import { Calendar, ChevronLeft, Star, Clock, StickyNote } from "lucide-react";
import type { Screen, Photographer } from "../types";
import { TEAL, TEAL_MID, TEAL_LIGHT, BG } from "../constants";
import { Avatar } from "../components/shared/Avatar";
import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  buildServiceOptions,
  createBooking,
  formatVnd,
  categoryLabel,
  type BookingServiceOption,
} from "../lib/bookings";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month0: number) {
  return new Date(year, month0 + 1, 0).getDate();
}

function startWeekday(year: number, month0: number) {
  // 0 = Monday ... 6 = Sunday (VN style)
  const d = new Date(year, month0, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

const HOURS = Array.from({ length: 16 }, (_, i) => pad(i + 6)); // 06–21
const MINS = ["00", "15", "30", "45"];

export default function BookingScreen({
  photographer,
  setScreen,
  onBooked,
}: {
  photographer: Photographer;
  setScreen: (s: Screen) => void;
  /** Gọi sau khi gửi request thành công (để App refresh bookings) */
  onBooked?: () => void;
}) {
  const options = useMemo(() => buildServiceOptions(photographer), [photographer]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    options[0] ? [options[0].id] : []
  );

  const selectedList = useMemo(
    () => options.filter((o) => selectedIds.includes(o.id)),
    [options, selectedIds]
  );
  const totalPrice = useMemo(
    () => selectedList.reduce((s, o) => s + (Number(o.price) || 0), 0),
    [selectedList]
  );

  /** Nhóm theo category để UI giống bảng giá */
  const groups = useMemo(() => {
    const order = ["photo", "makeup", "editor", "rental"];
    const map = new Map<string, { category: string; title: string; items: BookingServiceOption[] }>();
    for (const o of options) {
      const cat = o.category || "photo";
      if (!map.has(cat)) {
        map.set(cat, {
          category: cat,
          title: o.groupTitle || categoryLabel(cat),
          items: [],
        });
      }
      const g = map.get(cat)!;
      if (!g.title && o.groupTitle) g.title = o.groupTitle;
      g.items.push(o);
    }
    return Array.from(map.values()).sort(
      (a, b) => order.indexOf(a.category) - order.indexOf(b.category)
    );
  }, [options]);

  function toggleOption(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const t = new Date();
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  });

  const [startH, setStartH] = useState("09");
  const [startM, setStartM] = useState("00");
  const [endH, setEndH] = useState("11");
  const [endM, setEndM] = useState("00");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const dim = daysInMonth(viewYear, viewMonth);
  const offset = startWeekday(viewYear, viewMonth);
  const cells: ({ day: number; iso: string } | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) {
    const iso = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
    cells.push({ day: d, iso });
  }

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  function isPast(iso: string) {
    const [y, mo, d] = iso.split("-").map(Number);
    const cell = new Date(y, mo - 1, d);
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return cell < startToday;
  }

  async function submit() {
    setError(null);
    if (selectedList.length === 0) {
      setError("Bạn hãy chọn ít nhất một gói dịch vụ nhé");
      return;
    }
    if (!selectedDate) {
      setError("Bạn hãy chọn ngày chụp nhé");
      return;
    }
    const start = `${startH}:${startM}`;
    const end = `${endH}:${endM}`;
    if (start >= end) {
      setError("Giờ kết thúc phải sau giờ bắt đầu");
      return;
    }

    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        setError("Bạn cần đăng nhập để đặt lịch");
        setSubmitting(false);
        return;
      }

      // Tên + avatar khách (hiện trên request phía PTG)
      let client_name = user.user_metadata?.full_name || user.email || "Khách";
      let client_avatar = user.user_metadata?.avatar_url || null;
      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name, username, avatar_url")
          .eq("id", user.id)
          .maybeSingle();
        if (prof) {
          client_name = prof.full_name || prof.username || client_name;
          client_avatar = prof.avatar_url || client_avatar;
        }
      } catch { /* ignore */ }

      const { data, error: errMsg } = await createBooking({
        client_id: user.id,
        client_name,
        client_avatar,
        photographer_user_id: photographer.user_id || null,
        photographer_id: photographer.id > 0 ? photographer.id : null,
        photographer_name: photographer.name,
        photographer_avatar: photographer.avatar || null,
        package_name: selectedList.map((o) => o.name).join(" + "),
        package_price: totalPrice,
        package_category:
          selectedList.length === 1
            ? selectedList[0].category
            : selectedList.every((o) => o.category === selectedList[0].category)
              ? selectedList[0].category
              : "mixed",
        booking_date: selectedDate,
        start_time: start,
        end_time: end,
        client_note: note.trim() || null,
      });

      if (!data) {
        setError(errMsg || "Chưa gửi được yêu cầu, bạn thử lại nhé");
        setSubmitting(false);
        return;
      }

      setDone(true);
      onBooked?.();
    } catch (e: any) {
      setError(e?.message || "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col min-h-screen px-5 pb-10 pt-14" style={{ background: BG }}>
        <div className="bg-white rounded-3xl p-6 border border-border shadow-sm text-center">
          <div
            className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-white text-3xl"
            style={{ background: `linear-gradient(135deg, ${TEAL_LIGHT} 0%, ${TEAL_MID} 100%)` }}
          >
            ⏳
          </div>
          <h2 className="font-black text-xl mb-2" style={{ color: TEAL }}>
            Đã gửi yêu cầu đặt lịch
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Vui lòng chờ nhiếp ảnh gia <strong>{photographer.name}</strong> xem và xác nhận lịch hẹn của bạn.
            Bạn sẽ thấy trạng thái cập nhật trong mục <strong>Lịch hẹn</strong>.
          </p>
          {selectedList.length > 0 && (
            <div className="mt-4 text-left bg-muted/50 rounded-2xl p-3 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Gói:</span>{" "}
                <strong>{selectedList.map((o) => o.name).join(" + ")}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">Tổng:</span>{" "}
                <strong style={{ color: TEAL }}>{formatVnd(totalPrice)}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">Ngày:</span>{" "}
                <strong>{selectedDate}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">Giờ:</span>{" "}
                <strong>
                  {startH}:{startM} – {endH}:{endM}
                </strong>
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-4">
          <button
            type="button"
            onClick={() => setScreen("bookings")}
            className="flex-1 py-3.5 rounded-2xl font-bold text-white"
            style={{ background: TEAL }}
          >
            Xem lịch hẹn
          </button>
          <button
            type="button"
            onClick={() => setScreen("photographer-profile")}
            className="flex-1 py-3.5 rounded-2xl font-bold border-2"
            style={{ borderColor: TEAL, color: TEAL }}
          >
            Về hồ sơ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-10" style={{ background: BG }}>
      <div className="px-5 pt-12 pb-4 flex items-center gap-3 bg-white border-b border-border sticky top-0 z-10">
        <button
          type="button"
          onClick={() => setScreen("photographer-profile")}
          className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
        <h2 className="font-bold text-base" style={{ color: TEAL }}>
          Đặt lịch chụp
        </h2>
      </div>

      <div className="px-5 mt-4 flex flex-col gap-4">
        {/* Mini PTG */}
        <button
          type="button"
          onClick={() => setScreen("photographer-profile")}
          className="bg-white rounded-2xl p-4 border border-border flex items-center gap-3 text-left w-full"
        >
          <Avatar src={photographer.avatar} size={48} />
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate" style={{ color: TEAL }}>
              {photographer.name}
            </p>
            <p className="text-xs text-muted-foreground truncate">{photographer.location}</p>
            <div className="flex items-center gap-1 mt-1">
              <Star size={11} fill="#f59e0b" stroke="#f59e0b" />
              <span className="text-xs font-semibold">
                {photographer.rating > 0 ? photographer.rating.toFixed(1) : "—"} ·{" "}
                {photographer.bookings}+ lượt đặt
              </span>
            </div>
          </div>
        </button>

        {/* Gói dịch vụ — kiểu bảng giá, tích nhiều, hiện tổng */}
        <div className="bg-white rounded-2xl p-4 border border-border">
          <p className="font-bold mb-1" style={{ color: TEAL }}>
            Chọn gói dịch vụ
          </p>
          <p className="text-[11px] text-muted-foreground mb-3">
            Tích một hoặc nhiều mục · tổng tiền hiện ở cuối
          </p>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Photographer chưa cập nhật bảng giá
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((g) => (
                <div
                  key={g.category + g.title}
                  className="rounded-2xl border border-border p-3.5 bg-white"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-[10px] font-black px-2 py-0.5 rounded-full"
                      style={{
                        background:
                          g.category === "makeup"
                            ? "#fce7f3"
                            : g.category === "editor"
                              ? "#e0e7ff"
                              : g.category === "rental"
                                ? "#fef3c7"
                                : "#e8f5f0",
                        color:
                          g.category === "makeup"
                            ? "#be185d"
                            : g.category === "editor"
                              ? "#4338ca"
                              : g.category === "rental"
                                ? "#b45309"
                                : TEAL,
                      }}
                    >
                      {categoryLabel(g.category)}
                    </span>
                    <p className="font-bold text-sm" style={{ color: TEAL }}>
                      {g.title || categoryLabel(g.category)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    {g.items.map((o) => {
                      const on = selectedIds.includes(o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => toggleOption(o.id)}
                          className="flex items-start gap-2.5 py-2 border-t border-border/50 first:border-0 text-left w-full rounded-lg px-1 -mx-1"
                          style={{
                            background: on ? `${TEAL_LIGHT}12` : "transparent",
                          }}
                        >
                          <span
                            className="mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0"
                            style={{
                              borderColor: on ? TEAL : "var(--border)",
                              background: on ? TEAL : "white",
                            }}
                          >
                            {on && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path
                                  d="M2.5 6L5 8.5L9.5 3.5"
                                  stroke="white"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug">{o.name}</p>
                            {o.detail ? (
                              <p className="text-[11px] text-muted-foreground">({o.detail})</p>
                            ) : null}
                          </div>
                          <p
                            className="text-sm font-bold flex-shrink-0"
                            style={{ color: TEAL }}
                          >
                            {formatVnd(o.price)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Tổng tiền */}
              <div
                className="rounded-2xl px-4 py-3 flex items-center justify-between border-2"
                style={{ borderColor: TEAL, background: `${TEAL_LIGHT}10` }}
              >
                <div>
                  <p className="text-xs text-muted-foreground">
                    Đã chọn {selectedList.length} mục
                  </p>
                  <p className="font-bold text-sm" style={{ color: TEAL }}>
                    Tổng thanh toán
                  </p>
                </div>
                <p className="font-black text-lg" style={{ color: TEAL }}>
                  {formatVnd(totalPrice)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Lịch — chọn ngày */}
        <div className="bg-white rounded-2xl p-4 border border-border">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold flex items-center gap-1.5" style={{ color: TEAL }}>
              <Calendar size={16} /> Chọn ngày
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold"
              >
                ‹
              </button>
              <span className="text-sm font-bold min-w-[7.5rem] text-center">
                Tháng {viewMonth + 1} · {viewYear}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold"
              >
                ›
              </button>
            </div>
          </div>

          {/* Native date — sync hệ thống */}
          <label className="block mb-3">
            <span className="text-[11px] text-muted-foreground">Hoặc mở lịch hệ thống</span>
            <input
              type="date"
              value={selectedDate}
              min={`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setSelectedDate(v);
                const [y, m] = v.split("-").map(Number);
                setViewYear(y);
                setViewMonth(m - 1);
              }}
              className="mt-1 w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-white"
            />
          </label>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground mb-1">
            {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((w) => (
              <div key={w} className="py-1 font-semibold">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, i) =>
              !c ? (
                <div key={`e-${i}`} className="aspect-square" />
              ) : (
                <button
                  key={c.iso}
                  type="button"
                  disabled={isPast(c.iso)}
                  onClick={() => setSelectedDate(c.iso)}
                  className="aspect-square rounded-full text-sm font-semibold transition-all disabled:opacity-30"
                  style={{
                    background: selectedDate === c.iso ? TEAL : "transparent",
                    color: selectedDate === c.iso ? "white" : "inherit",
                  }}
                >
                  {c.day}
                </button>
              )
            )}
          </div>
        </div>

        {/* Khung giờ */}
        <div className="bg-white rounded-2xl p-4 border border-border">
          <p className="font-bold mb-3 flex items-center gap-1.5" style={{ color: TEAL }}>
            <Clock size={16} /> Khung giờ
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Bắt đầu</p>
              <div className="flex gap-2">
                <select
                  value={startH}
                  onChange={(e) => setStartH(e.target.value)}
                  className="flex-1 rounded-xl border border-border px-2 py-2.5 text-sm bg-white"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}h
                    </option>
                  ))}
                </select>
                <select
                  value={startM}
                  onChange={(e) => setStartM(e.target.value)}
                  className="flex-1 rounded-xl border border-border px-2 py-2.5 text-sm bg-white"
                >
                  {MINS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Kết thúc</p>
              <div className="flex gap-2">
                <select
                  value={endH}
                  onChange={(e) => setEndH(e.target.value)}
                  className="flex-1 rounded-xl border border-border px-2 py-2.5 text-sm bg-white"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}h
                    </option>
                  ))}
                </select>
                <select
                  value={endM}
                  onChange={(e) => setEndM(e.target.value)}
                  className="flex-1 rounded-xl border border-border px-2 py-2.5 text-sm bg-white"
                >
                  {MINS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Đã chọn:{" "}
            <strong>
              {startH}:{startM} → {endH}:{endM}
            </strong>
          </p>
        </div>

        {/* Ghi chú */}
        <div className="bg-white rounded-2xl p-4 border border-border">
          <p className="font-bold mb-2 flex items-center gap-1.5" style={{ color: TEAL }}>
            <StickyNote size={16} /> Ghi chú cho photographer
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Ví dụ: chụp outdoor công viên, mang thêm softbox..."
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm resize-none bg-white"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        
              <div className="mt-2 p-3 rounded-xl text-[11px] leading-relaxed border" style={{ background: "#FFF8E7", borderColor: "#FDE68A", color: "#78350f" }}>
                <p className="font-bold mb-1">Chi phí & luồng tiền</p>
                <p>• Tạm tính dịch vụ: {formatVnd(totalPrice)}</p>
                <p>• Phí dịch vụ Memento (10%): {formatVnd(Math.round(totalPrice * 0.1))}</p>
                <p>• Bạn thanh toán: <strong>{formatVnd(totalPrice)}</strong></p>
                <p className="mt-1">Sau khi bạn thanh toán, photographer nhận trước 20%. Khi lịch hẹn hoàn tất, Memento chuyển phần còn lại (sau khi trừ phí 10%).</p>
              </div>
            <button
          type="button"
          disabled={submitting || selectedList.length === 0}
          onClick={submit}
          className="w-full py-4 rounded-2xl font-bold text-white shadow-md active:scale-[0.98] transition-transform disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}
        >
          {submitting ? "Đang gửi..." : "Gửi yêu cầu đặt lịch"}
        </button>
        <p className="text-[11px] text-center text-muted-foreground pb-4">
          Yêu cầu sẽ được gửi tới photographer, bạn chưa phải thanh toán lúc này
        </p>
      </div>
    </div>
  );
}
