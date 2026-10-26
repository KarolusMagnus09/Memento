import { useBackHandler } from "../lib/backNavigation";
import {
  Calendar, MessageCircle, Clock, Check, X, QrCode, ChevronRight, ArrowLeft, Flag,
  SlidersHorizontal, ChevronLeft, Flag as FlagIcon, Briefcase, Hash, Wallet, StickyNote, Tag, User as UserIcon,
  Loader2, CheckCircle2,
} from "lucide-react";
import type { Screen, Photographer } from "../types";
import { TEAL, TEAL_MID, TEAL_LIGHT, BG, MEMENTO_PAYMENT } from "../constants";
import { Avatar } from "../components/shared/Avatar";
import { HandoverPanel } from "../components/shared/HandoverPanel";
import { ConfirmModal } from "../components/shared/ConfirmModal";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";
import {
  fetchMyBookings,
  buildServiceOptions,
  formatVnd,
  updateBookingStatus,
  markBookingPaid,
  markDepositPaid,
  markFinalPaid,
  markShootDone,
  submitDriveUrl,
  clientApproveHandover,
  deleteBooking,
  addPhotoFeedback,
  fetchPhotoFeedback,
  buildBillCode,
  buildVietQrUrl,
  buildPaymentDescription,
  buildDepositDescription,
  buildFinalDescription,
  isAwaitingPayment,
  isAwaitingDeposit,
  isAwaitingFinal,
  isShooting,
  isHandover,
  isPaid,
  isProcessing,
  isActiveOrder,
  isClosing,
  bothSuccessConfirmed,
  bookingPhaseLabel,
  confirmOrderSuccess,
  confirmShoot,
  flowStep,
  silenceInfo,
  SILENCE_HOURS,
  getDepositAmount,
  getRemainingAmount,
  calcCommission,
  calcPtgPayout,
  calcPtgAdvance,
  calcPtgFinalTransfer,
  categoryLabel,
  type BookingRow,
  type BookingStatus,
  type PhotoFeedback,
} from "../lib/bookings";
import { openBookingChat, bookingToChatTarget, type ChatTarget } from "../lib/chat";
import { normalizeCategory } from "../lib/serviceCategories";

const FILTERS = [
  { id: "all", label: "Tất cả" },
  { id: "pending", label: "Chờ xác nhận" },
  { id: "confirmed", label: "Chờ thanh toán" },
  { id: "deposit_paid", label: "Đang chụp" },
  { id: "handover", label: "Bàn giao ảnh" },
    { id: "completed", label: "Hoàn tất" },
  { id: "rejected", label: "Đã từ chối / hủy" },
] as const;

type SortId = "nearest" | "price_desc" | "price_asc";
type CatId = "rental_studio" | "rental_outfit" | "makeup";

const SORTS: { id: SortId; label: string }[] = [
  { id: "nearest", label: "Lịch chụp gần nhất" },
  { id: "price_desc", label: "Giá cao → thấp" },
  { id: "price_asc", label: "Giá thấp → cao" },
];
const CATS: { id: CatId; label: string }[] = [
  { id: "rental_studio", label: "Thuê studio" },
  { id: "rental_outfit", label: "Thuê quần áo" },
  { id: "makeup", label: "Makeup" },
];

// Màu viền / badge theo trạng thái: đỏ = từ chối, vàng = đang xử lý / chờ thanh toán, xanh = xong
const RED = "#ef4444";
const YELLOW = "#f59e0b";
const GREEN = "#16a34a";
const GRAY = "#9ca3af";

const statusColors: Record<string, string> = {
  confirmed: YELLOW,
  pending: YELLOW,
  deposit_paid: YELLOW,
  handover: YELLOW,
  final_payment: YELLOW,
  rejected: RED,
  cancelled: GRAY,
  paid: GREEN,
  completed: GREEN,
};
const statusLabels: Record<string, string> = {
  confirmed: "Chờ thanh toán",
  pending: "Chờ xác nhận",
  deposit_paid: "Đang xử lý đơn",
  processing: "Đang xử lý đơn",
  active: "Đơn đang hiệu lực",
  closing: "Chờ xác nhận hoàn tất",
  handover: "Bàn giao ảnh",
  final_payment: "Chờ quyết toán",
  rejected: "Đã từ chối",
  cancelled: "Đã hủy",
  paid: "Đã thanh toán",
  completed: "Hoàn tất",
};

function statusColor(b: BookingRow) {
  if (b.status === "completed" || (b.status === "paid" && b.final_paid_at)) return GREEN;
  if (isAwaitingDeposit(b) || isAwaitingFinal(b) || isHandover(b) || isShooting(b) || b.status === "pending") return YELLOW;
  if (b.status === "rejected" || b.status === "cancelled") return RED;
  return statusColors[b.status] || TEAL;
}
function statusLabel(b: BookingRow) {
  return bookingPhaseLabel(b);
}

function startTs(b: BookingRow) {
  const t = new Date(`${b.booking_date}T${(b.start_time || "00:00").slice(0, 5)}:00`).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function fmtDateVi(d: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}


type PriceLine = { name: string; price: number | null; detail?: string };

/** Tách gói dịch vụ thành từng dòng + giá (tra theo bảng giá hiện tại của photographer). */
function buildPriceLines(b: BookingRow, photographers: Photographer[]): PriceLine[] {
  const total = Number(b.package_price) || 0;
  const names = (b.package_name || "").split(" + ").map((x) => x.trim()).filter(Boolean);
  if (names.length === 0) return [{ name: "Dịch vụ", price: total }];
  if (names.length === 1) return [{ name: names[0], price: total }];

  const ptg =
    photographers.find((x) => x.id === b.photographer_id) ||
    photographers.find((x) => x.user_id && x.user_id === b.photographer_user_id);
  const opts = ptg ? buildServiceOptions(ptg) : [];
  const lines: PriceLine[] = names.map((n) => {
    const o = opts.find((x) => x.name.trim().toLowerCase() === n.toLowerCase());
    return { name: n, price: o ? Number(o.price) || 0 : null, detail: o?.detail || "" };
  });

  const unknown = lines.filter((l) => l.price === null);
  const known = lines.reduce((sum, l) => sum + (l.price ?? 0), 0);
  if (unknown.length === 1) {
    unknown[0].price = Math.max(0, total - known);
  } else if (unknown.length === 0 && known !== total) {
    lines.push({ name: "Điều chỉnh giá", price: total - known });
  }
  return lines;
}

/** Bảng "Chi tiết đơn hàng": liệt kê dịch vụ, cộng dồn ra tổng; bấm từng dòng để xem chi tiết dịch vụ. */
function PriceBreakdown({
  lines, total, onReport, role,
}: { lines: PriceLine[]; total: number; onReport?: () => void; role?: "client" | "ptg" | "both" }) {
  const [openLine, setOpenLine] = useState<number | null>(null);
  const allKnown = lines.every((l) => l.price !== null);
  const sumLines = lines.reduce((sum, l) => sum + (l.price ?? 0), 0);
  const base = allKnown && sumLines > 0 ? sumLines : total;
  const fee = Math.round(base * 0.1);
  const ptgAdvance = Math.round(base * 0.2);
  const ptgFinalExtra = Math.round(base * 0.7);
  const ptgTotal = Math.round(base * 0.9);
  let run = 0;

  return (
    <div className="mt-2 rounded-xl border border-border bg-white overflow-hidden text-left">
      <div className="px-3 py-2 text-xs font-bold text-white flex items-center gap-1.5" style={{ background: GREEN }}>
        <UpDownIcon size={12} /> Chi tiết đơn hàng
      </div>
      <div className="px-3">
        {lines.map((l, i) => {
          if (l.price !== null) run += l.price;
          const hasDetail = !!l.detail;
          const open = openLine === i;
          return (
            <div key={i} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => hasDetail && setOpenLine(open ? null : i)}
                className="w-full flex items-start justify-between gap-3 py-2.5 text-xs text-left"
              >
                <span className="min-w-0 flex-1 break-words">
                  {i > 0 && <span className="text-muted-foreground">+ </span>}
                  {l.name}
                  {hasDetail && <span className="text-muted-foreground"> {open ? "▴" : "▾"}</span>}
                </span>
                <span className="flex-shrink-0 font-bold">{l.price === null ? "—" : formatVnd(l.price)}</span>
              </button>
              {open && hasDetail && (
                <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-2.5 py-2 mb-2 whitespace-pre-line">
                  {l.detail}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-3 py-2.5 border-t border-border bg-[#f8faf9] space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Tạm tính dịch vụ</span>
          <span className="font-semibold">{formatVnd(base)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Phí dịch vụ Memento (10%)</span>
          <span className="font-semibold" style={{ color: RED }}>{formatVnd(fee)}</span>
        </div>
        <div className="flex items-center justify-between text-sm pt-1 border-t border-border">
          <span className="font-bold">Khách thanh toán</span>
          <span className="font-black" style={{ color: TEAL }}>{formatVnd(base)}</span>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Phí 10% là phí nền tảng, được trừ vào phần photographer nhận, không cộng thêm vào số tiền khách chuyển.
        </p>
      </div>

      <div className="px-3 py-2.5 border-t border-border space-y-1 text-[11px] leading-relaxed" style={{ background: "#FFF8E7" }}>
        <p className="font-bold text-xs" style={{ color: "#92400e" }}>Luồng tiền</p>
        <p style={{ color: "#78350f" }}>
          • Khi khách thanh toán: photographer nhận trước <strong>{formatVnd(ptgAdvance)}</strong> (20%).
        </p>
        <p style={{ color: "#78350f" }}>
          • Khi lịch hẹn hoàn tất: Memento chuyển phần còn lại để photographer nhận đủ <strong>{formatVnd(ptgTotal)}</strong> (90%),
          sau khi trừ phí 10% (<strong>{formatVnd(fee)}</strong>). Phần chuyển thêm: <strong>{formatVnd(ptgFinalExtra)}</strong>.
        </p>
      </div>

      {onReport && (
        <button
          type="button"
          onClick={onReport}
          className="w-full py-2 text-[11px] font-bold border-t border-border flex items-center justify-center gap-1.5"
          style={{ color: RED }}
        >
          <FlagIcon size={12} /> Báo cáo vấn đề về giá / thanh toán
        </button>
      )}
    </div>
  );
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Tờ lịch tháng: hôm nay có viền, ngày có lịch chụp sắp tới tô xanh. */
function MonthCalendar({
  bookedDays, pastDays, selected, onPick,
}: {
  bookedDays: Set<string>;
  pastDays: Set<string>;
  selected: string | null;
  onPick: (iso: string) => void;
}) {
  const today = new Date();
  const todayIso = ymd(today);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [open, setOpen] = useState(true);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // tuần bắt đầu từ T2
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const upcomingInMonth = Array.from(bookedDays).filter((d) => d.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)).length;

  return (
    <div className="bg-white rounded-2xl border border-border mb-3 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <span className="flex items-center gap-2 text-sm font-bold" style={{ color: TEAL }}>
          <Calendar size={15} /> Lịch của bạn
        </span>
        <span className="text-xs text-muted-foreground">
          Hôm nay {fmtDateVi(todayIso)} {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <button type="button" aria-label="Tháng trước" className="p-1.5"
              onClick={() => setCursor(new Date(year, month - 1, 1))}>
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="text-sm font-bold" style={{ color: TEAL }}>Tháng {month + 1}/{year}</p>
              <p className="text-[10px] text-muted-foreground">{upcomingInMonth} ngày có lịch chụp</p>
            </div>
            <button type="button" aria-label="Tháng sau" className="p-1.5"
              onClick={() => setCursor(new Date(year, month + 1, 1))}>
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[10px] font-bold text-muted-foreground mb-1">
            {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const iso = ymd(new Date(year, month, day));
              const booked = bookedDays.has(iso);
              const past = pastDays.has(iso);
              const isToday = iso === todayIso;
              const isSel = selected === iso;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => (booked || past) && onPick(iso)}
                  className="mx-auto w-8 h-8 rounded-full text-xs font-semibold flex items-center justify-center"
                  style={{
                    background: booked ? GREEN : "transparent",
                    color: booked ? "white" : past ? GREEN : "inherit",
                    border: isSel ? `2px solid ${TEAL}` : isToday ? `2px solid ${TEAL}` : "2px solid transparent",
                    boxShadow: isSel ? `0 0 0 2px ${TEAL}33` : undefined,
                    cursor: booked || past ? "pointer" : "default",
                    textDecoration: past && !booked ? "underline" : undefined,
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] text-muted-foreground px-1">
            <span className="flex items-center gap-1">
              <i className="inline-block w-3 h-3 rounded-full" style={{ background: GREEN }} /> Lịch chụp sắp tới
            </span>
            <span className="flex items-center gap-1">
              <i className="inline-block w-3 h-3 rounded-full" style={{ border: `2px solid ${TEAL}` }} /> Hôm nay
            </span>
            <span className="flex items-center gap-1">
              <u style={{ color: GREEN }}>12</u> Đã qua
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Hàng chip vuốt ngang được trên mobile (touch) và kéo chuột trên desktop. */
function ChipRow({ children, bleed = true }: { children: ReactNode; bleed?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false });

  return (
    <div
      ref={ref}
      className={`no-scrollbar flex gap-2 overflow-x-auto pb-2 cursor-grab select-none ${bleed ? "-mx-5 px-5" : ""}`}
      style={{
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorX: "contain",
        touchAction: "pan-x pan-y",
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse" || !ref.current) return;
        drag.current = { down: true, startX: e.clientX, startLeft: ref.current.scrollLeft, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d.down || !ref.current) return;
        const dx = e.clientX - d.startX;
        if (Math.abs(dx) > 4) d.moved = true;
        ref.current.scrollLeft = d.startLeft - dx;
      }}
      onPointerUp={() => { drag.current.down = false; }}
      onPointerLeave={() => { drag.current.down = false; }}
      // Chặn click nhầm sau khi vừa kéo chuột
      onClickCapture={(e) => {
        if (drag.current.moved) {
          e.stopPropagation();
          e.preventDefault();
          drag.current.moved = false;
        }
      }}
    >
      {children}
    </div>
  );
}

function Chip({
  active, onClick, children, tone = "teal",
}: { active: boolean; onClick: () => void; children: ReactNode; tone?: "teal" | "soft" }) {
  const activeBg = TEAL;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold border transition-all whitespace-nowrap"
      style={{
        background: active ? activeBg : tone === "soft" ? "#e3ece8" : "white",
        color: active ? "white" : TEAL,
        borderColor: active ? activeBg : tone === "soft" ? "#d3e0da" : "var(--border)",
      }}
    >
      {children}
    </button>
  );
}

type PartyInfo = {
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  gender: string | null;
  total_bookings: number;
  cancelled_bookings: number;
  paid_bookings: number;
};

const REPORT_REASONS = ["Spam / quảng cáo", "Lừa đảo", "Hành vi không phù hợp", "Thông tin giả mạo", "Khác"];
const SILENT_REASON = "Bên kia không phản hồi";
const PRICE_REPORT_REASONS = ["Giá không đúng", "Dịch vụ không khớp", "Bị tính thêm phí", "Thanh toán có vấn đề", SILENT_REASON, "Khác"];

type ReportCtx = { kind: "profile" | "price"; booking: BookingRow };

/** Icon ▲▼ bo tròn — bấm để xem giá được tính thế nào */
function UpDownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.6c.5 0 1 .25 1.3.7l5.2 7.2c.5.7 0 1.5-.8 1.5H6.3c-.8 0-1.3-.8-.8-1.5l5.2-7.2c.3-.45.8-.7 1.3-.7z" />
      <path d="M12 21.4c-.5 0-1-.25-1.3-.7l-5.2-7.2c-.5-.7 0-1.5.8-1.5h11.4c.8 0 1.3.8.8 1.5l-5.2 7.2c-.3.45-.8.7-1.3.7z" opacity="0.9" />
    </svg>
  );
}

function genderLabel(g?: string | null) {
  return g === "female" ? "Nữ" : g === "male" ? "Nam" : g ? "Khác" : "Chưa cập nhật";
}

export default function BookingsScreen({
  setScreen,
  setPhotographer,
  photographers,
  onOpenChat,
}: {
  setScreen: (s: Screen) => void;
  setPhotographer: (p: Photographer) => void;
  photographers: Photographer[];
  /** Mở cuộc trò chuyện của một đơn (App gắn target rồi chuyển sang màn chat) */
  onOpenChat: (target: ChatTarget) => void;
}) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [sort, setSort] = useState<SortId | null>(null);
  const [cats, setCats] = useState<CatId[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [ptgNoteDraft, setPtgNoteDraft] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [payBooking, setPayBooking] = useState<BookingRow | null>(null);
  /** deposit = cọc 10%, final = thanh toán 90% */
  const [payMode, setPayMode] = useState<"deposit" | "final">("deposit");
  /** Kiểm tra thanh toán SePay trong modal QR */
  const [payCheck, setPayCheck] = useState<"idle" | "checking" | "paid" | "notyet">("idle");
  const payCheckRun = useRef(0);
  const paidTimer = useRef<number | null>(null);
  const [driveDraft, setDriveDraft] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackLabel, setFeedbackLabel] = useState("");
  const [feedbackList, setFeedbackList] = useState<PhotoFeedback[]>([]);
  const [payBank, setPayBank] = useState<{ bank: string; account: string; accountName: string } | null>(null);
  const [detail, setDetail] = useState<BookingRow | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [openBreak, setOpenBreak] = useState<Record<string, boolean>>({});
  const [clientView, setClientView] = useState<BookingRow | null>(null);
  const [partyInfo, setPartyInfo] = useState<PartyInfo | null>(null);
  const [partyLoading, setPartyLoading] = useState(false);
  const [reportCtx, setReportCtx] = useState<ReportCtx | null>(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportText, setReportText] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  /** Popup xác nhận buổi chụp xong (2 bên) */
  const [shootAsk, setShootAsk] = useState<BookingRow | null>(null);
  const [shootBusy, setShootBusy] = useState(false);

  // Vuốt/Back: đóng popup/trang chi tiết đang mở trước (cái mở sau đóng trước)
  useBackHandler(!!detail, () => setDetail(null));
  useBackHandler(filterOpen, () => setFilterOpen(false));
  useBackHandler(!!clientView, () => closeParty());
  useBackHandler(!!reportCtx, () => setReportCtx(null));
  useBackHandler(!!payBooking, () => { setPayBooking(null); setPayBank(null); });

  const reload = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    const list = await fetchMyBookings(uid);
    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Giữ bảng chi tiết đồng bộ sau khi reload (đổi trạng thái, thanh toán...)
  useEffect(() => {
    setDetail((d) => (d ? rows.find((r) => r.id === d.id) ?? null : d));
  }, [rows]);

  // Tải thông tin người đặt (profile + thống kê) khi mở popup
  useEffect(() => {
    if (!clientView) {
      setPartyInfo(null);
      return;
    }
    let alive = true;
    setPartyLoading(true);
    (async () => {
      const uid = clientView.client_id;
      const local = rows.filter((r) => r.client_id === uid);
      const fallbackStats = {
        total_bookings: local.length,
        cancelled_bookings: local.filter((r) => r.status === "cancelled").length,
        paid_bookings: local.filter(isPaid).length,
      };
      let info: PartyInfo | null = null;
      try {
        // RPC (sql/021) trả profile + thống kê toàn hệ thống của người đặt
        const { data, error } = await supabase.rpc("get_booking_party_profile", { target_user: uid });
        const r = Array.isArray(data) ? data[0] : data;
        if (!error && r) {
          info = {
            full_name: r.full_name ?? null,
            username: r.username ?? null,
            avatar_url: r.avatar_url ?? null,
            gender: r.gender ?? null,
            total_bookings: Number(r.total_bookings) || 0,
            cancelled_bookings: Number(r.cancelled_bookings) || 0,
            paid_bookings: Number(r.paid_bookings) || 0,
          };
        }
      } catch { /* ignore */ }
      if (!info) {
        try {
          const { data } = await supabase
            .from("profiles")
            .select("full_name, username, avatar_url, gender")
            .eq("id", uid)
            .maybeSingle();
          info = { full_name: null, username: null, avatar_url: null, gender: null, ...(data || {}), ...fallbackStats };
        } catch {
          info = { full_name: null, username: null, avatar_url: null, gender: null, ...fallbackStats };
        }
      }
      if (alive) {
        setPartyInfo(info);
        setPartyLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientView?.client_id]);

  const filtered = useMemo(() => {
    let list = rows.filter((b) => {
      if (filter === "all") return b.status !== "cancelled";
      if (filter === "rejected") return b.status === "rejected" || b.status === "cancelled";
      if (filter === "confirmed") return isAwaitingDeposit(b) || b.status === "confirmed";
      if (filter === "deposit_paid") return isShooting(b) || b.status === "deposit_paid";
      if (filter === "handover") return isHandover(b);
      if (filter === "final_payment") return isAwaitingFinal(b);
      if (filter === "completed") return b.status === "completed" || (b.status === "paid" && !!b.final_paid_at);
      if (filter === "paid") return isPaid(b) || b.status === "completed";
      return b.status === filter;
    });

    if (cats.length > 0) {
      list = list.filter((b) => cats.includes(normalizeCategory(b.package_category) as CatId));
    }

    if (rangeFrom) list = list.filter((b) => b.booking_date >= rangeFrom);
    if (rangeTo) list = list.filter((b) => b.booking_date <= rangeTo);

    if (sort === "price_desc") {
      list = [...list].sort((a, b) => Number(b.package_price) - Number(a.package_price));
    } else if (sort === "price_asc") {
      list = [...list].sort((a, b) => Number(a.package_price) - Number(b.package_price));
    } else if (sort === "nearest") {
      // Lịch sắp tới gần nhất trước, xa dần; lịch đã qua xếp cuối (mới qua → cũ)
      const now = Date.now();
      const upcoming = list.filter((b) => startTs(b) >= now).sort((a, b) => startTs(a) - startTs(b));
      const past = list.filter((b) => startTs(b) < now).sort((a, b) => startTs(b) - startTs(a));
      list = [...upcoming, ...past];
    }
    return list;
  }, [rows, filter, cats, sort, rangeFrom, rangeTo]);

  async function act(id: string, status: BookingStatus) {
    setActingId(id);
    const note = ptgNoteDraft[id]?.trim();
    try {
      // updateBookingStatus trả về string (lỗi) hoặc null (thành công), và `extra` phải là object
      const err = await updateBookingStatus(id, status, note ? { ptg_note: note } : undefined);
      if (err) setToast(err);
      else {
        setToast(
          status === "confirmed"
            ? "Bạn đã nhận lịch — đang chờ khách thanh toán"
            : status === "rejected"
              ? "Bạn đã từ chối lịch hẹn này"
              : status === "cancelled"
                ? "Đã hủy lịch hẹn"
                : "Đã cập nhật"
        );
      }
      await reload();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Có lỗi xảy ra, bạn thử lại nhé");
    } finally {
      setActingId(null);
    }
  }

  async function confirmPaid(id: string) {
    setActingId(id);
    const bill = buildBillCode(id, MEMENTO_PAYMENT.desPrefix || "MMT");
    const err = await markBookingPaid(id, bill);
    if (err) setToast(err);
    else setToast("Đã ghi nhận thanh toán, photographer sẽ thấy cập nhật");
    setPayBooking(null);
    await reload();
    setActingId(null);
  }


  async function openPayment(b: BookingRow, mode: "deposit" | "final" = "deposit") {
    setDetail(null);
    setPayMode(mode);
    setPayBooking(b);
    // Tiền về STK Memento (giữ cọc + phần còn lại), không chuyển thẳng PTG
    setPayBank({
      bank: MEMENTO_PAYMENT.bank,
      account: MEMENTO_PAYMENT.account,
      accountName: MEMENTO_PAYMENT.accountName,
    });
  }

  // Đã nhận tiền (SePay → webhook đã đổi trạng thái đơn) theo đúng phase đang thanh toán
  function isPaidForMode(row: BookingRow, mode: "deposit" | "final"): boolean {
    const depositOk = mode === "deposit" && (row.status === "deposit_paid" || row.status === "paid" || !!row.deposit_paid_at || row.status === "handover" || row.status === "final_payment" || row.status === "completed");
    const finalOk = mode === "final" && (row.status === "completed" || row.payment_status === "fully_paid");
    return depositOk || finalOk;
  }

  // Báo thanh toán thành công, giữ thông báo ~2 giây rồi đóng modal và tải lại danh sách
  function onPaymentConfirmed(mode: "deposit" | "final") {
    setPayCheck("paid");
    if (paidTimer.current) return;
    paidTimer.current = window.setTimeout(() => {
      paidTimer.current = null;
      setPayBooking(null);
      setPayBank(null);
      setToast(mode === "deposit" ? "Thanh toán thành công, buổi chụp sẽ diễn ra theo lịch" : "Đã hoàn tất");
      reload();
    }, 2200);
  }

  // Nút "Kiểm tra thanh toán": hỏi lại đơn tối đa ~10 giây (5 lần, cách nhau 2,5 giây); chưa thấy thì báo chưa nhận
  async function checkPayment() {
    if (!payBooking || payCheck === "checking" || payCheck === "paid") return;
    const run = ++payCheckRun.current;
    const id = payBooking.id;
    const mode = payMode;
    setPayCheck("checking");
    for (let i = 0; i < 5; i++) {
      const { data } = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
      if (run !== payCheckRun.current) return; // đã đóng modal hoặc bấm kiểm tra lại
      if (data && isPaidForMode(data as BookingRow, mode)) {
        onPaymentConfirmed(mode);
        return;
      }
      if (i < 4) await new Promise((r) => setTimeout(r, 2500));
      if (run !== payCheckRun.current) return;
    }
    setPayCheck("notyet");
  }

  // Đóng modal → huỷ kiểm tra đang chạy, đưa trạng thái về ban đầu
  useEffect(() => {
    if (!payBooking) {
      payCheckRun.current++;
      setPayCheck("idle");
    }
  }, [payBooking]);

  useEffect(() => () => { if (paidTimer.current) window.clearTimeout(paidTimer.current); }, []);

  // Tự kiểm tra nền mỗi 4 giây khi mở QR: có tiền thì hiện "thanh toán thành công" luôn
  useEffect(() => {
    if (!payBooking) return;
    const id = payBooking.id;
    const mode = payMode;
    const timer = setInterval(async () => {
      if (!userId) return;
      const list = await fetchMyBookings(userId);
      const row = list.find((x) => x.id === id);
      if (row && isPaidForMode(row, mode)) onPaymentConfirmed(mode);
    }, 4000);
    return () => clearInterval(timer);
  }, [payBooking?.id, payMode, userId, reload]);


  function openProfile(b: BookingRow) {
    const p =
      photographers.find((x) => x.id === b.photographer_id) ||
      photographers.find((x) => x.user_id === b.photographer_user_id);
    if (p) {
      setPhotographer(p);
      setScreen("photographer-profile");
    }
  }

  /** Trước đây chỉ gọi setScreen("chat") mà không có cuộc trò chuyện → màn hình trắng */
  async function goChat(b: BookingRow) {
    const r = await openBookingChat(b.id);
    if (r.error || !r.id) {
      setToast(r.error || "Chưa mở được cuộc trò chuyện, bạn thử lại nhé");
      return;
    }
    onOpenChat(bookingToChatTarget(b, userId, r.id));
  }

  const payAmount = payBooking
    ? (payMode === "final" ? getRemainingAmount(payBooking) : getDepositAmount(payBooking))
    : 0;
  const payBillCode = payBooking
    ? (payMode === "final"
        ? buildFinalDescription(payBooking.id, MEMENTO_PAYMENT.desPrefix || "MMT")
        : buildDepositDescription(payBooking.id, MEMENTO_PAYMENT.desPrefix || "MMT"))
    : "";
  const activeBank = payBank || {
    bank: MEMENTO_PAYMENT.bank,
    account: MEMENTO_PAYMENT.account,
    accountName: MEMENTO_PAYMENT.accountName,
  };
  const qrUrl = payBooking
    ? buildVietQrUrl({
        account: activeBank.account,
        bank: activeBank.bank,
        amount: payAmount,
        description: payBillCode,
        accountName: activeBank.accountName,
        storeName: MEMENTO_PAYMENT.storeName || "Memento",
      })
    : null;

  const detailIsPtg = !!detail && userId === detail.photographer_user_id;
  const activeFilterCount = (sort ? 1 : 0) + cats.length + (rangeFrom || rangeTo ? 1 : 0);

  const { bookedDays, pastDays } = useMemo(() => {
    const todayIso = ymd(new Date());
    const up = new Set<string>();
    const past = new Set<string>();
    for (const b of rows) {
      if (b.status === "rejected" || b.status === "cancelled") continue;
      (b.booking_date >= todayIso ? up : past).add(b.booking_date);
    }
    return { bookedDays: up, pastDays: past };
  }, [rows]);

  function pickDay(iso: string) {
    if (rangeFrom === iso && rangeTo === iso) {
      setRangeFrom("");
      setRangeTo("");
    } else {
      setRangeFrom(iso);
      setRangeTo(iso);
    }
  }

  /** Người đặt cũng là photographer? → có hồ sơ PTG để xem */
  const partyPtg = clientView
    ? photographers.find((x) => x.user_id === clientView.client_id) || null
    : null;

  function closeParty() {
    setClientView(null);
    setReportCtx(null);
    setReportMsg(null);
  }

  async function doConfirmShoot() {
    if (!shootAsk) return;
    const id = shootAsk.id;
    setShootBusy(true);
    const err = await confirmShoot(id);
    setShootBusy(false);
    setShootAsk(null);
    if (err) setToast(err);
    else setToast("Đã xác nhận buổi chụp");
    await reload();
  }

  async function sendReport() {
    if (!reportCtx || !userId) return;
    const { kind, booking } = reportCtx;
    const text = reportText.trim();
    if (text.length < 10) {
      setReportMsg("Vui lòng mô tả ít nhất 10 ký tự.");
      return;
    }
    setReportSending(true);
    setReportMsg(null);

    const isPtgSide = userId === booking.photographer_user_id;
    const otherId =
      kind === "profile"
        ? booking.client_id
        : (isPtgSide ? booking.client_id : booking.photographer_user_id) || booking.client_id;
    const otherName =
      kind === "profile"
        ? partyInfo?.full_name || partyInfo?.username || booking.client_name || null
        : isPtgSide
          ? booking.client_name || null
          : booking.photographer_name || null;

    const payload: Record<string, unknown> = {
      reporter_id: userId,
      reported_user_id: otherId,
      reported_name: otherName,
      booking_id: booking.id.startsWith("local-") ? null : booking.id,
      reason: reportReason,
      description:
        kind === "price"
          ? `[Gói: ${booking.package_name} · ${formatVnd(booking.package_price)}]\n${text}`
          : text,
    };
    if (kind === "price") payload.report_type = "price";

    const { error } = await supabase.from("profile_reports").insert(payload);
    setReportSending(false);
    if (error) {
      setReportMsg(
        `Không gửi được: ${error.message}. (Cần chạy sql/021 và sql/023 trong Supabase)`
      );
      return;
    }
    setReportCtx(null);
    setReportText("");
    setReportReason(REPORT_REASONS[0]);
    setToast("Đã gửi báo cáo, bên mình sẽ xem xét sớm");
  }

  return (
    <div className="flex flex-col min-h-full pb-24" style={{ background: BG }}>
      <div className="px-5 py-4 relative" style={{ background: TEAL }}>
        <h2 className="font-bold text-base text-white">Lịch hẹn</h2>
        <p className="text-white/80 text-xs mt-0.5">Yêu cầu · xác nhận · thanh toán bằng QR</p>
      </div>

      <div className="px-5 mt-4">
        {toast && (
          <div
            className="mb-3 text-sm rounded-xl px-3 py-2 border"
            style={{ background: "#ecfdf5", borderColor: `${TEAL}40`, color: TEAL }}
          >
            {toast}
            <button type="button" className="ml-2 underline text-xs" onClick={() => setToast(null)}>
              Đóng
            </button>
          </div>
        )}

        {/* Nút filter gộp + hàng trạng thái vuốt trái/phải */}
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-label="Bộ lọc"
            className="relative flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white"
            style={{ background: TEAL_LIGHT }}
          >
            <SlidersHorizontal size={17} />
            {activeFilterCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                style={{ background: RED }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <ChipRow bleed={false}>
              {FILTERS.map((f) => (
                <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                </Chip>
              ))}
            </ChipRow>
          </div>
        </div>

        <MonthCalendar
          bookedDays={bookedDays}
          pastDays={pastDays}
          selected={rangeFrom && rangeFrom === rangeTo ? rangeFrom : null}
          onPick={pickDay}
        />

        <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1 mb-3">
          <span>{filtered.length} lịch hẹn</span>
          {(sort || cats.length > 0 || rangeFrom || rangeTo) && (
            <button
              type="button"
              className="underline"
              onClick={() => { setSort(null); setCats([]); setRangeFrom(""); setRangeTo(""); }}
            >
              Xóa bộ lọc
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-16">Đang tải...</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-3">📷</span>
            <h3 className="font-black text-lg mb-2" style={{ color: TEAL }}>
              Chưa có lịch hẹn
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Hãy đặt lịch từ hồ sơ photographer, lịch hẹn của bạn sẽ hiện ở đây
            </p>
            <button
              type="button"
              onClick={() => setScreen("home")}
              className="px-6 py-3.5 rounded-2xl font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}
            >
              Khám phá ngay
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((b) => {
              const isClient = userId === b.client_id;
              const isPtg = userId === b.photographer_user_id;
              const awaitingDeposit = isAwaitingDeposit(b);
              const awaitingFinal = isAwaitingFinal(b);
              const awaiting = awaitingDeposit || awaitingFinal;
              const shooting = isShooting(b);
              const handover = isHandover(b);
              const step = flowStep(b);
              const sil = silenceInfo(b);
              const iAmWaiting =
                !!sil && sil.overdue && ((sil.waitingOn === "ptg" && isClient) || (sil.waitingOn === "client" && isPtg));
              const otherName = isPtg ? b.client_name || "Khách hàng" : b.photographer_name || "Photographer";
              const myShootOk = isPtg ? !!b.shoot_confirm_ptg_at : !!b.shoot_confirm_client_at;
              const otherShootOk = isPtg ? !!b.shoot_confirm_client_at : !!b.shoot_confirm_ptg_at;
              const color = statusColor(b);
              const bordered = b.status === "rejected" || b.status === "pending" || awaiting || isPaid(b);
              const displayName = isPtg
                ? b.client_name || "Khách hàng"
                : b.photographer_name;
              const displayAvatar = isPtg
                ? b.client_avatar || ""
                : b.photographer_avatar || "";

              return (
                <div
                  key={b.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm"
                  style={{
                    border: bordered ? `2px solid ${color}` : "1px solid var(--border)",
                  }}
                >
                  {awaitingDeposit && (
                    <div
                      className="mx-3 mt-3 px-3 py-2 rounded-xl text-xs font-semibold"
                      style={{ background: "#FFF8E7", color: "#92400e", border: "1px solid #FDE68A" }}
                    >
                      {isPtg
                        ? "⏳ Đang chờ khách thanh toán."
                        : `💳 Hãy thanh toán ${formatVnd(getDepositAmount(b))} để giữ lịch nhé.`}
                    </div>
                  )}
                  {step === "wait_date" && (
                    <div
                      className="mx-3 mt-3 px-3 py-2 rounded-xl text-xs font-semibold"
                      style={{ background: "#ECFDF5", color: "#065f46", border: "1px solid #A7F3D0" }}
                    >
                      📷 Đang trong quá trình chụp ảnh.
                    </div>
                  )}
                  {step === "shoot_confirm" && (
                    <div
                      className="mx-3 mt-3 px-3 py-2 rounded-xl text-xs font-semibold"
                      style={{ background: "#ECFDF5", color: "#065f46", border: "1px solid #A7F3D0" }}
                    >
                      {myShootOk
                        ? `✓ Bạn đã xác nhận buổi chụp — đang chờ ${otherName} xác nhận.`
                        : otherShootOk
                          ? `🔔 ${otherName} đã xác nhận buổi chụp, đang chờ bạn. Bấm xác nhận bên dưới nếu buổi chụp đã xong.`
                          : "📷 Đã đến ngày chụp. Khi buổi chụp hoàn tất, cả hai bên cùng bấm xác nhận bên dưới."}
                    </div>
                  )}
                  {step === "drive" && (
                    <div
                      className="mx-3 mt-3 px-3 py-2 rounded-xl text-xs font-semibold"
                      style={{ background: "#FFF8E7", color: "#92400e", border: "1px solid #FDE68A" }}
                    >
                      {isPtg
                        ? "📤 Cả hai đã xác nhận buổi chụp. Hãy gửi link Google Drive ảnh cho khách."
                        : "⏳ Đã xác nhận buổi chụp. Đang đợi photographer gửi ảnh."}
                    </div>
                  )}
                  {step === "closing" && (
                    <div
                      className="mx-3 mt-3 px-3 py-2 rounded-xl text-xs font-semibold"
                      style={{ background: "#ECFDF5", color: "#065f46", border: "1px solid #A7F3D0" }}
                    >
                      ✅ Cả hai đã xác nhận hoàn tất. Memento đang xử lý thanh toán và sẽ gửi ảnh hoàn chỉnh cho khách.
                    </div>
                  )}
                  {handover && (
                    <div
                      className="mx-3 mt-3 px-3 py-2 rounded-xl text-xs font-semibold"
                      style={{ background: "#EFF6FF", color: "#1e40af", border: "1px solid #BFDBFE" }}
                    >
                      📁 Đang bàn giao ảnh
                      {isPtg ? " — khách đang xem demo và có thể gửi yêu cầu chỉnh sửa." : " — xem ảnh demo và gửi góp ý nếu bạn muốn chỉnh sửa."}
                    </div>
                  )}
                  

                  <div className="px-4 pt-3 pb-2">
                    <span className="text-sm font-bold" style={{ color: TEAL }}>
                      Lịch hẹn
                    </span>
                  </div>

                  <div className="px-4 pb-3">
                    {/* Dải thông tin người (bấm = xem hồ sơ) */}
                    <button
                      type="button"
                      onClick={() => (isPtg ? setClientView(b) : openProfile(b))}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 mb-3 text-left"
                      style={{ background: "#f1f5f3" }}
                    >
                      <Avatar src={displayAvatar} size={40} />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate" style={{ color: TEAL }}>
                          {displayName}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {isPtg ? "Xem hồ sơ khách" : "Xem hồ sơ photographer"}
                        </p>
                      </div>
                      <span
                        className="text-[10px] font-bold px-2 py-1 rounded-full text-white flex-shrink-0"
                        style={{ background: color }}
                      >
                        {statusLabel(b)}
                      </span>
                    </button>

                    <p className="text-sm font-semibold mb-2 line-clamp-2">{b.package_name}</p>

                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                      <span className="flex items-center gap-1 bg-muted px-2.5 py-1.5 rounded-lg">
                        <Calendar size={11} /> {fmtDateVi(b.booking_date)}
                      </span>
                      <span className="flex items-center gap-1 bg-muted px-2.5 py-1.5 rounded-lg">
                        <Clock size={11} /> {b.start_time} – {b.end_time}
                      </span>
                    </div>

                    {b.client_note && (
                      <div
                        className="text-xs bg-muted/60 rounded-xl px-3 py-2.5 mb-2 max-h-28 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words no-scrollbar"
                        style={{ touchAction: "pan-y" }}
                      >
                        <span className="font-semibold">Ghi chú khách: </span>
                        {b.client_note}
                      </div>
                    )}

                    <div className="text-right">
                      <button
                        type="button"
                        aria-label="Xem chi tiết giá"
                        onClick={() => setOpenBreak((m) => ({ ...m, [b.id]: !m[b.id] }))}
                        className="inline-flex items-center gap-1.5"
                      >
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{
                            background: openBreak[b.id] ? TEAL : "#e3ece8",
                            color: openBreak[b.id] ? "white" : TEAL,
                          }}
                        >
                          <UpDownIcon size={13} />
                        </span>
                        <span className="text-xs text-muted-foreground">Tổng tiền: </span>
                        <span className="font-black text-base" style={{ color: TEAL }}>
                          {formatVnd(b.package_price)}
                        </span>
                      </button>
                      {openBreak[b.id] && (
                        <PriceBreakdown
                          lines={buildPriceLines(b, photographers)}
                          total={Number(b.package_price) || 0}
                          onReport={() => { setReportCtx({ kind: "price", booking: b }); setReportMsg(null); setReportReason(PRICE_REPORT_REASONS[0]); }}
                        />
                      )}
                    </div>

                    {/* PTG: pending → accept/reject */}
                    {isPtg && b.status === "pending" && (
                      <div className="mt-2 space-y-2">
                        <input
                          value={ptgNoteDraft[b.id] || ""}
                          onChange={(e) =>
                            setPtgNoteDraft((prev) => ({ ...prev, [b.id]: e.target.value }))
                          }
                          placeholder="Ghi chú cho khách (tuỳ chọn)"
                          className="w-full rounded-xl border border-border px-3 py-2 text-xs"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={actingId === b.id}
                            onClick={() => act(b.id, "confirmed")}
                            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1"
                            style={{ background: TEAL }}
                          >
                            <Check size={14} /> Đồng ý
                          </button>
                          <button
                            type="button"
                            disabled={actingId === b.id}
                            onClick={() => act(b.id, "rejected")}
                            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1 bg-red-500"
                          >
                            <X size={14} /> Từ chối
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Client: thanh toán khi chờ pay */}
                    {isClient && awaitingDeposit && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openPayment(b, "deposit"); }}
                        className="w-full mt-2 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 relative z-10"
                        style={{ background: YELLOW }}
                      >
                        <QrCode size={18} /> Thanh toán · {formatVnd(getDepositAmount(b))}
                      </button>
                    )}
                    
                    {/* Bước 2–3: đến ngày chụp → mỗi bên 1 nút «Xác nhận đơn thành công» */}
                    {(isClient || isPtg) && step === "shoot_confirm" && !myShootOk && (
                      <button
                        type="button"
                        disabled={actingId === b.id}
                        onClick={() => setShootAsk(b)}
                        className="w-full mt-2 py-3 rounded-xl text-sm font-bold text-white"
                        style={{ background: TEAL }}
                      >
                        Xác nhận đơn thành công
                      </button>
                    )}

                    {/* Bước 4: chỉ PTG có form gửi Drive (khách thấy chữ vàng ở trên) */}
                    {isPtg && step === "drive" && (
                      <HandoverPanel
                        booking={b}
                        role="ptg"
                        userId={userId}
                        accent={TEAL}
                        onChanged={reload}
                        notify={setToast}
                      />
                    )}

                    {/* Bước 5–6: đã có Drive → khách góp ý, 2 bên xác nhận hoàn tất */}
                    {step === "review" && isPtg && (
                      <HandoverPanel
                        booking={b}
                        role="ptg"
                        userId={userId}
                        accent={TEAL}
                        onChanged={reload}
                        notify={setToast}
                      />
                    )}
                    {step === "review" && isClient && (
                      <HandoverPanel
                        booking={b}
                        role="client"
                        userId={userId}
                        accent={TEAL}
                        onChanged={reload}
                        notify={setToast}
                      />
                    )}

                    {/* Bên kia im lặng quá hạn → gợi ý báo cáo cho admin */}
                    {iAmWaiting && (
                      <div
                        className="mt-2 rounded-xl px-3 py-2 text-[11px] leading-relaxed"
                        style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}
                      >
                        ⚠️ {otherName} chưa phản hồi hơn {SILENCE_HOURS} giờ. Bạn có thể gửi báo cáo để admin xử lý.
                      </div>
                    )}

                    {/* Report trong suốt quá trình chụp / bàn giao */}
                    {(isClient || isPtg) && (shooting || handover || isProcessing(b)) && b.status !== "completed" && b.status !== "cancelled" && b.status !== "rejected" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReportCtx({ kind: "price", booking: b });
                          setReportMsg(null);
                          setReportReason(iAmWaiting ? SILENT_REASON : PRICE_REPORT_REASONS[0]);
                          setReportText("");
                        }}
                        className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border"
                        style={{ borderColor: "#fca5a5", color: "#b91c1c", background: "#fef2f2" }}
                      >
                        <Flag size={14} strokeWidth={2.2} /> Báo cáo đơn hàng
                      </button>
                    )}

                    {isClient && (b.status === "completed" || !!b.drive_released_at) && b.drive_url && (
                      <a
                        href={b.drive_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-full mt-2 py-3 rounded-xl text-sm font-bold text-center text-white"
                        style={{ background: GREEN }}
                      >
                        Tải ảnh đầy đủ (Google Drive)
                      </a>
                    )}
                  </div>

                    {(b.status === "rejected" || b.status === "cancelled") && (
                      <button
                        type="button"
                        disabled={actingId === b.id}
                        onClick={async () => {
                          if (!confirm("Bạn muốn xóa lịch hẹn này khỏi danh sách?")) return;
                          setActingId(b.id);
                          const err = await deleteBooking(b.id);
                          setActingId(null);
                          if (err) setToast(err);
                          else { setToast("Đã xóa lịch hẹn"); setDetail(null); reload(); }
                        }}
                        className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold text-red-600 border border-red-200"
                      >
                        Xóa lịch hẹn
                      </button>
                    )}


                    {(b.status === "handover" || b.status === "closing") && (
                      <div className="mt-2 text-[11px] text-center text-muted-foreground">
                        Khách: {b.client_success_at ? "✓" : "…"} · PTG: {b.ptg_success_at ? "✓" : "…"}
                      </div>
                    )}

                  {/* Footer 2 nút chia đôi kiểu BHX */}
                  <div className="grid grid-cols-2 border-t border-border text-sm font-bold">
                    <button
                      type="button"
                      onClick={() => setDetail(b)}
                      className="py-3 border-r border-border"
                      style={{ color: TEAL }}
                    >
                      Chi tiết
                    </button>
                    <button
                      type="button"
                      onClick={() => goChat(b)}
                      className="py-3 flex items-center justify-center gap-1.5"
                      style={{ color: TEAL }}
                    >
                      <MessageCircle size={14} /> Chat
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter gộp — popup giữa màn hình */}
      {filterOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-5"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setFilterOpen(false)}
        >
          <div className="bg-white rounded-3xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-lg" style={{ color: TEAL }}>Bộ lọc</h3>
              <button type="button" onClick={() => setFilterOpen(false)} aria-label="Đóng"><X size={20} /></button>
            </div>

            <p className="text-xs font-bold text-muted-foreground mb-2">Sắp xếp</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {SORTS.map((o) => (
                <Chip
                  key={o.id}
                  active={sort === o.id}
                  onClick={() => setSort((cur) => (cur === o.id ? null : o.id))}
                >
                  {o.label}
                </Chip>
              ))}
            </div>

            <p className="text-xs font-bold text-muted-foreground mb-2">Khoảng ngày chụp</p>
            <div className="grid grid-cols-2 gap-2 mb-1">
              <label className="text-[11px] text-muted-foreground">
                Từ ngày
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border px-2 py-2 text-xs text-foreground"
                />
              </label>
              <label className="text-[11px] text-muted-foreground">
                Đến ngày
                <input
                  type="date"
                  value={rangeTo}
                  min={rangeFrom || undefined}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border px-2 py-2 text-xs text-foreground"
                />
              </label>
            </div>
            <p className="text-[10px] text-muted-foreground mb-4">
              Nếu bỏ trống "Đến ngày", app sẽ hiển thị tất cả lịch từ ngày bắt đầu trở đi.
            </p>

            <p className="text-xs font-bold text-muted-foreground mb-2">Loại dịch vụ</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {CATS.map((c) => (
                <Chip
                  key={c.id}
                  active={cats.includes(c.id)}
                  onClick={() =>
                    setCats((cur) => (cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id]))
                  }
                >
                  {c.label}
                </Chip>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setSort(null); setCats([]); setRangeFrom(""); setRangeTo(""); }}
                className="flex-1 py-3 rounded-xl text-sm font-bold border-2"
                style={{ borderColor: TEAL, color: TEAL }}
              >
                Xóa lọc
              </button>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: TEAL }}
              >
                Xem {filtered.length} lịch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trang chi tiết lịch hẹn (tab riêng, toàn màn hình) */}
      {detail && (
        <div className="fixed inset-0 z-[60] overflow-y-auto" style={{ background: BG }}>
          <div className="mx-auto w-full max-w-sm min-h-full flex flex-col pb-8" style={{ background: BG }}>
            <div className="px-4 py-4 flex items-center gap-3 sticky top-0 z-10" style={{ background: TEAL }}>
              <button type="button" onClick={() => setDetail(null)} aria-label="Quay lại" className="text-white">
                <ArrowLeft size={22} />
              </button>
              <div className="min-w-0">
                <h3 className="font-bold text-base text-white">Chi tiết lịch hẹn</h3>
              </div>
            </div>

            <div className="px-4 mt-4 flex flex-col gap-3">
              <div
                className="bg-white rounded-2xl p-4"
                style={{ border: `2px solid ${statusColor(detail)}` }}
              >
                <p className="text-[11px] text-muted-foreground mb-1">Trạng thái</p>
                <span
                  className="inline-block text-xs font-bold px-3 py-1 rounded-full text-white"
                  style={{ background: statusColor(detail) }}
                >
                  {statusLabel(detail)}
                </span>
                {isAwaitingPayment(detail) && (
                  <p className="text-xs mt-2" style={{ color: "#92400e" }}>
                    {detailIsPtg ? "Đang chờ khách thanh toán." : "Bạn hãy thanh toán để giữ lịch nhé."}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => (detailIsPtg ? setClientView(detail) : openProfile(detail))}
                className="bg-white rounded-2xl p-4 flex items-center gap-3 text-left"
              >
                <Avatar src={detailIsPtg ? detail.client_avatar : detail.photographer_avatar} size={48} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-muted-foreground">
                    {detailIsPtg ? "Khách hàng" : "Photographer"}
                  </p>
                  <p className="font-bold truncate" style={{ color: TEAL }}>
                    {detailIsPtg ? detail.client_name || "Khách hàng" : detail.photographer_name}
                  </p>
                </div>
                <span className="flex items-center text-xs flex-shrink-0" style={{ color: TEAL }}>
                  Xem hồ sơ <ChevronRight size={14} />
                </span>
              </button>

              <div className="bg-white rounded-2xl px-4 divide-y divide-border">
                <DetailRow icon={<Hash size={15} />} label="Mã đơn" value={buildBillCode(detail.id, MEMENTO_PAYMENT.desPrefix || "MMT")} strong />
                <DetailRow icon={<Briefcase size={15} />} label="Gói dịch vụ" value={detail.package_name} />
                <DetailRow icon={<Tag size={15} />} label="Loại dịch vụ" value={categoryLabel(detail.package_category || "photo")} />
                <DetailRow icon={<Calendar size={15} />} label="Ngày" value={fmtDateVi(detail.booking_date)} />
                <DetailRow icon={<Clock size={15} />} label="Giờ" value={`${detail.start_time} – ${detail.end_time}`} />
                <DetailRow icon={<StickyNote size={15} />} label="Ghi chú của khách" value={detail.client_note || "—"} scroll />
                {detail.ptg_note && (
                  <DetailRow icon={<StickyNote size={15} />} label="Ghi chú photographer" value={detail.ptg_note} scroll />
                )}
                {isPaid(detail) && detail.paid_at && (
                  <DetailRow
                    icon={<Clock size={15} />}
                    label="Đã thanh toán lúc"
                    value={new Date(detail.paid_at).toLocaleString("vi-VN")}
                  />
                )}
                <div className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Wallet size={15} /> Tổng tiền
                    </span>
                    <button
                      type="button"
                      aria-label="Xem chi tiết giá"
                      onClick={() => setOpenBreak((m) => ({ ...m, [`d-${detail.id}`]: !m[`d-${detail.id}`] }))}
                      className="inline-flex items-center gap-2"
                    >
                      <span className="font-black text-base" style={{ color: TEAL }}>
                        {formatVnd(detail.package_price)}
                      </span>
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{
                          background: openBreak[`d-${detail.id}`] ? TEAL : "#e3ece8",
                          color: openBreak[`d-${detail.id}`] ? "white" : TEAL,
                        }}
                      >
                        <UpDownIcon size={15} />
                      </span>
                    </button>
                  </div>
                  <PriceBreakdown
                    lines={buildPriceLines(detail, photographers)}
                    total={Number(detail.package_price) || 0}
                    role={detailIsPtg ? "ptg" : "client"}
                    onReport={() => { setReportCtx({ kind: "price", booking: detail }); setReportMsg(null); setReportReason(PRICE_REPORT_REASONS[0]); }}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                {userId === detail.client_id && isAwaitingPayment(detail) && (
                  <button
                    type="button"
                    onClick={() => openPayment(detail, isAwaitingFinal(detail) ? "final" : "deposit")}
                    className="flex-1 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
                    style={{ background: YELLOW }}
                  >
                    <QrCode size={16} /> Thanh toán
                  </button>
                )}
                {userId === detail.client_id && (detail.status === "pending" || detail.status === "confirmed") && (
                  <button
                    type="button"
                    disabled={actingId === detail.id}
                    onClick={() => act(detail.id, "cancelled")}
                    className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-red-500"
                  >
                    Hủy lịch
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setDetail(null); goChat(detail); }}
                  className="flex-1 py-3 rounded-xl text-sm font-bold border-2 bg-white flex items-center justify-center gap-1.5"
                  style={{ borderColor: TEAL, color: TEAL }}
                >
                  <MessageCircle size={15} /> Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hồ sơ người đặt — popup giữa màn hình, bấm ngoài để đóng */}
      {clientView && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={closeParty}
        >
          <div
            className={`bg-white rounded-3xl w-full overflow-hidden shadow-xl max-h-[90vh] overflow-y-auto ${partyPtg ? "max-w-md" : "max-w-xs"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {partyPtg ? (
              <div className="relative h-32" style={{ background: TEAL }}>
                {partyPtg.cover && (
                  <img src={partyPtg.cover} alt="" className="w-full h-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={closeParty}
                  aria-label="Đóng"
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="flex justify-end px-4 pt-3">
                <button type="button" onClick={closeParty} aria-label="Đóng"><X size={20} /></button>
              </div>
            )}

            <div className={`flex flex-col items-center text-center px-6 ${partyPtg ? "-mt-14" : ""} pb-6`}>
              <div className={`relative z-10 ${partyPtg ? "rounded-full p-1 bg-white shadow-md" : ""}`}>
                <Avatar
                  src={partyInfo?.avatar_url || clientView.client_avatar}
                  size={partyPtg ? 112 : 84}
                />
              </div>
              <h3 className={`font-black mt-3 ${partyPtg ? "text-xl" : "text-lg"}`} style={{ color: TEAL }}>
                {partyInfo?.full_name || partyInfo?.username || clientView.client_name || "Khách hàng"}
              </h3>
              {partyPtg && (
                <p className="text-xs mt-1 font-semibold" style={{ color: TEAL_MID }}>
                  Photographer{partyPtg.specialty ? ` · ${partyPtg.specialty}` : ""}
                  {partyPtg.location ? ` · ${partyPtg.location}` : ""}
                </p>
              )}
              {partyLoading && <p className="text-xs text-muted-foreground mt-2">Đang tải hồ sơ...</p>}

              <dl className="w-full text-sm divide-y divide-border mt-4 text-left">
                <ProfileStat label="Giới tính" value={genderLabel(partyInfo?.gender)} />
                <ProfileStat label="Số lần đặt" value={String(partyInfo?.total_bookings ?? 0)} />
                <ProfileStat label="Số lần hủy" value={String(partyInfo?.cancelled_bookings ?? 0)} />
                <ProfileStat label="Lần thanh toán thành công" value={String(partyInfo?.paid_bookings ?? 0)} />
              </dl>

              {partyPtg && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotographer(partyPtg);
                    closeParty();
                    setDetail(null);
                    setScreen("photographer-profile");
                  }}
                  className="w-full mt-5 py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}
                >
                  <UserIcon size={16} /> Xem hồ sơ photographer
                </button>
              )}

              <button
                type="button"
                onClick={() => { setReportCtx({ kind: "profile", booking: clientView }); setReportMsg(null); setReportReason(REPORT_REASONS[0]); }}
                className="w-full mt-3 py-3 rounded-2xl text-sm font-bold border-2 flex items-center justify-center gap-2"
                style={{ borderColor: RED, color: RED }}
              >
                <Flag size={15} /> Báo cáo profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup xác nhận buổi chụp xong */}
      {shootAsk && (
        <ConfirmModal
          title="Xác nhận buổi chụp thành công?"
          message={(() => {
            const asPtg = userId === shootAsk.photographer_user_id;
            const other = asPtg ? shootAsk.client_name || "Khách hàng" : shootAsk.photographer_name || "Photographer";
            const otherOk = asPtg ? !!shootAsk.shoot_confirm_client_at : !!shootAsk.shoot_confirm_ptg_at;
            return otherOk
              ? `${other} đã xác nhận. Bạn xác nhận để sang bước gửi ảnh.`
              : `Cần cả hai bên xác nhận. Bạn bấm trước thì sẽ chờ ${other} xác nhận, và ${other} sẽ nhận thông báo.`;
          })()}
          onBackdropClick={() => setShootAsk(null)}
          actions={[
            { label: shootBusy ? "Đang gửi..." : "Xác nhận", onClick: doConfirmShoot },
            { label: "Chưa xong", variant: "secondary", onClick: () => setShootAsk(null) },
          ]}
        />
      )}

      {/* Popup báo cáo profile */}
      {reportCtx && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setReportCtx(null)}
        >
          <div className="bg-white rounded-3xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-lg mb-1" style={{ color: TEAL }}>
              {reportCtx.kind === "price" ? "Báo cáo giá / giao dịch" : "Báo cáo profile"}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Hãy mô tả vấn đề bạn gặp, bên mình sẽ xem xét sớm nhất.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {(reportCtx.kind === "price" ? PRICE_REPORT_REASONS : REPORT_REASONS).map((r) => (
                <Chip key={r} active={reportReason === r} onClick={() => setReportReason(r)}>
                  {r}
                </Chip>
              ))}
            </div>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Mô tả chi tiết (tối thiểu 10 ký tự)…"
              className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            />
            {reportMsg && <p className="text-xs text-red-600 mt-2">{reportMsg}</p>}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setReportCtx(null)}
                className="flex-1 py-3 rounded-xl text-sm font-bold border-2"
                style={{ borderColor: TEAL, color: TEAL }}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={reportSending}
                onClick={sendReport}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                style={{ background: RED }}
              >
                {reportSending ? "Đang gửi..." : "Gửi báo cáo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal thanh toán QR SePay */}
      {payBooking && qrUrl && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => { setPayBooking(null); setPayBank(null); }}
        >
          <div
            className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-black text-lg mb-1" style={{ color: TEAL }}>
              {`Thanh toán VietQR · ${activeBank.bank}`}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Mở app ngân hàng và quét mã QR này. Nội dung chuyển khoản chính là mã lịch hẹn để Memento nhận biết khoản thanh toán của bạn.
            </p>
            <div className="flex justify-center mb-3">
              <img
                src={qrUrl}
                alt="VietQR"
                className="w-56 h-56 object-contain rounded-2xl border border-border bg-white"
              />
            </div>
            <div className="text-xs space-y-1 mb-3 bg-muted/50 rounded-xl p-3">
              <p>
                <span className="text-muted-foreground">Ngân hàng:</span>{" "}
                <strong>{activeBank.bank}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">STK:</span>{" "}
                <strong>{activeBank.account}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">Chủ tài khoản:</span>{" "}
                <strong>{activeBank.accountName}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">Số tiền:</span>{" "}
                <strong style={{ color: TEAL }}>{formatVnd(payAmount)}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">Nội dung chuyển khoản:</span>{" "}
                <strong className="text-base" style={{ color: TEAL }}>{payBillCode}</strong>
              </p>
              <p className="text-[10px] text-muted-foreground">
                Bạn giữ nguyên nội dung này để hệ thống nhận đúng khoản thanh toán nhé.
              </p>
            </div>
            {payCheck === "checking" ? (
              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-amber-900 bg-amber-50 rounded-lg px-2 py-3 mb-3">
                <Loader2 size={16} className="animate-spin" /> Đang tải, vui lòng đợi…
              </div>
            ) : payCheck === "paid" ? (
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-green-800 bg-green-50 rounded-lg px-2 py-3 mb-3">
                <CheckCircle2 size={18} /> Thanh toán thành công! Đơn của bạn đã được xác nhận.
              </div>
            ) : (
              <p className="text-[11px] text-amber-900 bg-amber-50 rounded-lg px-2 py-1.5 mb-3 leading-relaxed">
                {payMode === "deposit"
                  ? "Memento sẽ giữ khoản tiền này an toàn, ứng trước 20% cho photographer, phần còn lại được chuyển khi lịch hẹn hoàn tất."
                  : "Thanh toán cho lịch hẹn."}
                {" "}Sau khi chuyển khoản, bấm «Kiểm tra thanh toán» để hệ thống xác nhận.
              </p>
            )}
            <div className="flex flex-col gap-2 mb-1">
              {payCheck === "notyet" && (
                <p className="text-xs font-semibold text-red-600 text-center leading-relaxed">
                  Hệ thống chưa nhận được khoản chuyển khoản. Nếu bạn vừa chuyển, hãy đợi vài giây rồi bấm kiểm tra lại nhé.
                </p>
              )}
              <button
                type="button"
                disabled={payCheck === "checking" || payCheck === "paid"}
                onClick={checkPayment}
                className="w-full py-2.5 rounded-2xl font-bold text-sm text-white disabled:opacity-80"
                style={{ background: payCheck === "paid" ? "#16a34a" : "#f59e0b" }}
              >
                {payCheck === "checking" ? "Đang kiểm tra…" : payCheck === "paid" ? "Đã thanh toán" : payCheck === "notyet" ? "Kiểm tra lại" : "Kiểm tra thanh toán"}
              </button>
              <button
                type="button"
                onClick={() => { setPayBooking(null); setPayBank(null); }}
                className="w-full py-2.5 rounded-2xl font-bold text-sm border"
                style={{ borderColor: TEAL, color: TEAL }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  icon, label, value, strong, scroll,
}: { icon?: ReactNode; label: string; value: string; strong?: boolean; scroll?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-xs text-muted-foreground flex-shrink-0 flex items-center gap-1.5">
        {icon}
        {label}
      </dt>
      <dd
        className={`text-right break-words whitespace-pre-line min-w-0 text-sm ${strong ? "font-black text-base" : "font-semibold"} ${scroll ? "max-h-28 overflow-y-auto overscroll-contain no-scrollbar" : ""}`}
        style={{ ...(strong ? { color: TEAL } : {}), overflowWrap: "anywhere", ...(scroll ? { touchAction: "pan-y" } : {}) }}
      >
        {value}
      </dd>
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-bold" style={{ color: TEAL }}>{value}</dd>
    </div>
  );
}
