import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Star, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import type { Photographer } from "../../types";
import { TEAL, TEAL_LIGHT } from "../../constants";
import { getCardImage, formatLocations, formatRating } from "../../lib/photographerDisplay";
import { Avatar } from "./Avatar";

const SLIDE_INTERVAL_MS = 5000; // 5 giây đổi ảnh một lần
const SLIDE_ANIM_MS = 600;      // thời gian trượt
const MAX_PHOTOS = 6;           // tối đa số ảnh xoay vòng trên mỗi thẻ

// --- Băng chuyền ---
const CARD_GAP = 12;
const CARD_MAX_W = 300;
const CARD_RATIO = 5.4 / 3;     // cao / rộng
const BASE_SPEED = -30;         // px/giây: tốc độ trôi mặc định. ÂM = thẻ trôi sang TRÁI, DƯƠNG = trôi sang phải
const FRICTION_TAU = 1.1;       // giây: càng lớn thì quay càng lâu mới chậm lại
const FLING_GAIN = 1.5;         // nhân vận tốc lúc thả tay → vuốt nhanh thì quay cực nhanh
const MAX_SPEED = 6000;         // px/giây: trần tốc độ quay
const DRAG_THRESHOLD = 6;       // px: di chuyển quá mức này mới tính là kéo (chưa tới thì vẫn là chạm)

const TEXT_SHADOW: CSSProperties = {
  textShadow: "0 1px 2px rgba(0,0,0,0.75), 0 2px 10px rgba(0,0,0,0.55)",
};
const PILL: CSSProperties = {
  background: "rgba(12,61,53,0.68)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  border: "1px solid rgba(255,255,255,0.28)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
};
const ARROW: CSSProperties = {
  background: "rgba(12,61,53,0.55)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
};

const EXPERIENCE_LABELS: Record<string, string> = {
  under1: "Dưới 1 năm",
  "1to3": "Từ 1-3 năm",
  "3to5": "Trên 3 năm",
  over5: "Trên 5 năm",
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Lấy ngẫu nhiên ảnh ĐÃ CHỤP của nhiếp ảnh gia làm ảnh bìa xoay vòng.
 * Có nhiều bộ sưu tập (board) công khai → lấy xen kẽ từng bộ, mỗi bộ ít nhất 1 ảnh.
 * Không có ảnh nào → dùng ảnh bìa mặc định.
 */
function buildPhotoPool(p: Photographer, max = MAX_PHOTOS): string[] {
  const groups: string[][] = [];
  for (const b of Array.isArray(p.boards) ? p.boards : []) {
    if (b.private) continue;
    const pins = (b.pins || []).filter(Boolean);
    if (pins.length > 0) groups.push(shuffle(pins));
  }
  const loose = [
    ...(Array.isArray(p.standalone_pins) ? p.standalone_pins : []),
    ...(Array.isArray(p.portfolio) ? p.portfolio : []),
  ].filter(Boolean);
  if (loose.length > 0) groups.push(shuffle(Array.from(new Set(loose))));

  const queue = shuffle(groups);
  const out: string[] = [];
  const seen = new Set<string>();
  let progressed = true;
  while (out.length < max && progressed) {
    progressed = false;
    for (const g of queue) {
      while (g.length > 0 && seen.has(g[0])) g.shift();
      if (g.length === 0) continue;
      const url = g.shift() as string;
      seen.add(url);
      out.push(url);
      progressed = true;
      if (out.length >= max) break;
    }
  }
  if (out.length === 0) {
    const fallback = getCardImage(p);
    return fallback ? [fallback] : [];
  }
  return out;
}

/** Vị trí tương đối của slide i so với slide đang hiện (0 = đang hiện, 1 = chờ bên phải, -1 = vừa đi qua bên trái) */
function rel(i: number, idx: number, n: number) {
  const half = Math.floor(n / 2);
  return ((((i - idx + n + half) % n) + n) % n) - half;
}

/** Ảnh bìa tự trượt mỗi 5 giây */
function PhotoSlider({ photos, alt, active }: { photos: string[]; alt: string; active: boolean }) {
  // 2 ảnh → nhân đôi để vòng lặp luôn trượt cùng một chiều
  const slides = useMemo(() => (photos.length === 2 ? [...photos, ...photos] : photos), [photos]);
  const n = slides.length;
  const [pos, setPos] = useState({ idx: 0, prev: 0 });
  const firstDelay = useRef(Math.random() * 1500); // lệch nhịp để các thẻ không đổi ảnh cùng lúc
  const reduceMotion = useRef(
    typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  const go = (dir: 1 | -1) =>
    setPos((s) => ({ prev: s.idx, idx: (s.idx + dir + n) % n }));

  // Hẹn giờ đổi ảnh; mỗi lần đổi (kể cả bấm mũi tên) sẽ tính lại 5 giây
  useEffect(() => {
    if (n < 2 || !active) return;
    const delay = SLIDE_INTERVAL_MS + firstDelay.current;
    firstDelay.current = 0;
    const t = window.setTimeout(() => go(1), delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.idx, n, active]);

  if (n === 0) return <div className="absolute inset-0 bg-muted" />;

  return (
    <>
      <div className="absolute inset-0 overflow-hidden">
        {slides.map((src, i) => {
          const now = rel(i, pos.idx, n);
          const before = rel(i, pos.prev, n);
          // Slide "vòng" từ đầu này sang đầu kia (ngoài màn hình) thì nhảy luôn, không trượt
          const animate = Math.abs(now - before) <= 1 && !reduceMotion.current;
          return (
            <img
              key={`${i}-${src}`}
              src={src}
              alt={i === pos.idx ? alt : ""}
              draggable={false}
              loading={i === 0 ? "eager" : "lazy"}
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                transform: `translateX(${now * 100}%)`,
                transition: animate ? `transform ${SLIDE_ANIM_MS}ms cubic-bezier(0.4,0,0.2,1)` : "none",
                willChange: "transform",
              }}
            />
          );
        })}
      </div>

      {n > 1 && (
        <>
          <button
            type="button"
            aria-label="Ảnh trước"
            onClick={(e) => { e.stopPropagation(); go(-1); }}
            className="absolute left-2 top-[36%] -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-white"
            style={ARROW}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Ảnh sau"
            onClick={(e) => { e.stopPropagation(); go(1); }}
            className="absolute right-2 top-[36%] -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-white"
            style={ARROW}
          >
            <ChevronRight size={16} />
          </button>
        </>
      )}
    </>
  );
}

function FeaturedCard({ p, onProfile }: {
  p: Photographer;
  onProfile: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

  // Chỉ chạy slideshow khi thẻ đang nằm trong tầm nhìn (đỡ tốn pin / mạng)
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const photos = useMemo(() => buildPhotoPool(p), [p.id, p.boards, p.standalone_pins, p.portfolio, p.cover, p.avatar]);

  const bio = (p.bio || "").trim();
  const bioRef = useRef<HTMLDivElement>(null);
  const [bioFade, setBioFade] = useState(false); // còn nội dung phía dưới → mờ dần mép đáy để gợi ý vuốt
  const updateBioFade = () => {
    const el = bioRef.current;
    if (!el) return;
    setBioFade(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  };
  useEffect(() => { updateBioFade(); }, [bio]);
  const exp = p.experience_years ? (EXPERIENCE_LABELS[p.experience_years] ?? p.experience_years) : "";
  const location = formatLocations(p);

  return (
    <div
      ref={rootRef}
      onClick={onProfile}
      className="relative w-full h-full flex flex-col rounded-3xl overflow-hidden bg-muted border border-border shadow-sm cursor-pointer"
    >
      {/* Ảnh đã chụp: nằm SAU toàn bộ thẻ (tự trượt mỗi 5 giây) */}
      <PhotoSlider photos={photos} alt={p.name} active={inView} />
      <div className="absolute inset-x-0 top-0 h-20 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(12,61,53,0.45), rgba(12,61,53,0))" }} />

      {/* Sao đánh giá */}
      <div className="absolute top-3 left-3 z-10 inline-flex items-center gap-1 px-2.5 py-1 rounded-full" style={PILL}>
        <Star size={13} fill="#fbbf24" stroke="#fbbf24" className="flex-shrink-0" />
        <span className="text-white text-xs font-bold" style={TEXT_SHADOW}>{formatRating(p)}</span>
      </div>

      {/* Khoảng trống để lộ ảnh phía trên panel */}
      <div className="flex-1 min-h-[120px] pointer-events-none" />

      {/* Panel thông tin TRONG SUỐT (kính): ảnh vẫn nhìn xuyên qua */}
      <div
        className="relative z-10 flex-shrink-0 flex flex-col px-3 pt-3.5 pb-3 rounded-t-3xl"
        style={{
          background: "linear-gradient(to top, rgba(8,40,34,0.62) 0%, rgba(12,61,53,0.22) 100%)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          borderTop: "1px solid rgba(255,255,255,0.28)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <Avatar src={p.avatar} size={48} style={{ border: "2px solid rgba(255,255,255,0.9)", boxShadow: "0 1px 6px rgba(0,0,0,0.3)" }} />
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-[15px] leading-tight line-clamp-2 break-words text-white"
              style={{ ...TEXT_SHADOW, overflowWrap: "anywhere" }}>{p.name}</p>
            {exp && (
              <p className="text-xs mt-0.5 truncate text-white/90" style={TEXT_SHADOW}>Kinh nghiệm: {exp}</p>
            )}
          </div>
        </div>

        {location && location !== "—" && (
          <span
            className="mt-2 self-start inline-flex items-center gap-1 max-w-full text-[11px] font-bold px-2.5 py-1 rounded-full text-white"
            style={{ background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.3)", ...TEXT_SHADOW }}
          >
            <MapPin size={11} className="flex-shrink-0" />
            <span className="truncate">{location}</span>
          </span>
        )}

        {/* Bio: hộp nhỏ trong suốt, cao cố định; text dài thì vuốt lên/xuống trong hộp (ẩn thanh cuộn) */}
        {bio && (
          <div
            ref={bioRef}
            onClick={(e) => e.stopPropagation()}
            onScroll={updateBioFade}
            className="mt-2 flex-shrink-0 rounded-xl px-3 py-2 overflow-y-auto overscroll-contain no-scrollbar"
            style={{
              height: 64,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.22)",
              touchAction: "pan-y",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              ...(bioFade
                ? {
                    WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 18px), transparent 100%)",
                    maskImage: "linear-gradient(to bottom, #000 calc(100% - 18px), transparent 100%)",
                  }
                : null),
            }}
          >
            <p className="text-xs leading-relaxed text-white whitespace-pre-wrap"
              style={{ ...TEXT_SHADOW, overflowWrap: "anywhere" }}>
              {bio}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onProfile(); }}
          className="flex-shrink-0 mt-3 w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1"
          style={{ background: "rgba(12,61,53,0.82)", border: "1px solid rgba(255,255,255,0.3)" }}
        >
          Chi tiết <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Băng chuyền vô hạn (Trang chủ): chạy vòng quanh các nhiếp ảnh gia nổi bật (danh sách truyền vào đã sắp xếp sẵn).
 *  - Mặc định trôi chậm sang phải.
 *  - Đặt tay vào → dừng. Kéo được cả 2 hướng.
 *  - Vuốt nhanh rồi thả → quay cực nhanh, giảm tốc dần, cuối cùng ổn định lại và trôi sang phải.
 */
export function FeaturedPhotographerCarousel({ photographers, onProfile }: {
  photographers: Photographer[];
  onProfile: (p: Photographer) => void;
}) {
  const list = photographers; // đã được lọc + xếp theo rating ở getFeaturedPhotographers()
  const n = list.length;

  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Kích thước thẻ + số bản lặp để vòng quay luôn kín màn hình
  const cardW = Math.min(CARD_MAX_W, Math.round(width * 0.78));
  const cardH = Math.round(cardW * CARD_RATIO);
  const step = cardW + CARD_GAP;
  const reps = width > 0 && n > 0 ? Math.max(1, Math.ceil((width + 2 * step) / (n * step))) : 1;
  const items = useMemo(
    () => Array.from({ length: reps }).flatMap((_, r) => list.map((p) => ({ p, key: `${p.id}-${r}` }))),
    [list, reps]
  );
  const total = items.length * step;

  const geom = useRef({ step, total });
  geom.current = { step, total };

  const cardEls = useRef<(HTMLDivElement | null)[]>([]);
  const st = useRef({
    offset: 0, v: 0,
    holding: false, active: false, pid: -1,
    startX: 0, lastX: 0, lastT: 0, vel: 0,
  });
  const suppressClick = useRef(false);
  const visible = useRef(true);
  const baseSpeed = useRef(BASE_SPEED);

  const apply = () => {
    const { step: stp, total: tot } = geom.current;
    if (tot <= 0) return;
    const off = st.current.offset;
    cardEls.current.forEach((el, i) => {
      if (!el) return;
      const x = ((((i * stp + off + stp) % tot) + tot) % tot) - stp;
      el.style.transform = `translate3d(${x}px,0,0)`;
    });
  };

  // Đặt vị trí ngay sau khi render (đổi kích thước / đổi danh sách)
  useLayoutEffect(() => { apply(); });

  // Khởi tạo: tôn trọng "giảm chuyển động" của hệ điều hành
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      baseSpeed.current = 0;
    }
  }, []);

  // Chỉ cập nhật khi băng chuyền đang nằm trong màn hình
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting; });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Vòng lặp chuyển động: vận tốc luôn "hồi" dần về tốc độ trôi mặc định
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = st.current;
      if (!s.holding) {
        const base = baseSpeed.current;
        s.v = base + (s.v - base) * Math.exp(-dt / FRICTION_TAU);
        s.offset += s.v * dt;
      }
      const tot = geom.current.total;
      if (tot > 0) s.offset = ((s.offset % tot) + tot) % tot;
      if (visible.current) apply();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const s = st.current;
    s.holding = true;        // đặt tay vào → dừng hẳn
    s.active = false;
    s.pid = e.pointerId;
    s.startX = s.lastX = e.clientX;
    s.lastT = performance.now();
    s.vel = 0;
    s.v = 0;
    suppressClick.current = false;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s.holding || e.pointerId !== s.pid) return;
    const x = e.clientX;
    if (!s.active) {
      if (Math.abs(x - s.startX) < DRAG_THRESHOLD) return;
      s.active = true;
      suppressClick.current = true; // đã kéo thì không tính là bấm vào thẻ
      try { boxRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    const now = performance.now();
    const dt = Math.max(1, now - s.lastT);
    const dx = x - s.lastX;
    s.vel = s.vel * 0.6 + ((dx / dt) * 1000) * 0.4; // vận tốc ngón tay (px/giây), làm mượt
    s.offset += dx;
    s.lastX = x;
    s.lastT = now;
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s.holding || e.pointerId !== s.pid) return;
    s.holding = false;
    if (s.active) {
      const stale = performance.now() - s.lastT > 90; // dừng ngón rồi mới thả → không văng
      const v = stale ? 0 : s.vel * FLING_GAIN;
      s.v = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v));
      try { boxRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    } else {
      s.v = 0; // chỉ chạm giữ rồi thả → tăng tốc êm trở lại
    }
    s.active = false;
    window.setTimeout(() => { suppressClick.current = false; }, 80);
  };

  const open = (p: Photographer) => {
    if (suppressClick.current) return;
    onProfile(p);
  };

  // 1 người: không cần băng chuyền
  if (n === 1) {
    return (
      <div className="rounded-3xl bg-white border border-border shadow-sm p-3">
        <div className="mx-auto" style={{ width: "min(100%, 300px)", aspectRatio: "3 / 5.4" }}>
          <FeaturedCard p={list[0]} onProfile={() => onProfile(list[0])} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white border border-border shadow-sm p-3">
      <div
        ref={boxRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        className="relative w-full overflow-hidden select-none"
        style={{ height: cardH, touchAction: "pan-y" }}
      >
        {width > 0 && items.map(({ p, key }, i) => (
          <div
            key={key}
            ref={(el) => { cardEls.current[i] = el; }}
            className="absolute top-0 left-0"
            style={{ width: cardW, height: cardH, willChange: "transform" }}
          >
            <FeaturedCard p={p} onProfile={() => open(p)} />
          </div>
        ))}
      </div>
    </div>
  );
}
