import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Plus, SlidersHorizontal, ClipboardList } from "lucide-react";
import { TEAL, TEAL_LIGHT } from "../../constants";
import { usePhotoRequests } from "../../hooks/usePhotoRequests";
import {
  EMPTY_REQUEST_FILTER,
  REQUEST_SORT_OPTIONS,
  countRequestFilters,
  type PhotoRequest,
  type RequestFilter,
} from "../../lib/photoRequests";
import { PhotoRequestCard, REQUEST_CARD_H } from "./PhotoRequestCard";
import { PhotoRequestFilterSheet } from "./PhotoRequestFilterSheet";
import { PhotoRequestDetailSheet } from "./PhotoRequestDetailSheet";
import { OfferSheet } from "./OfferSheet";
import { CountBadge } from "./CountBadge";
import { ConfirmModal } from "./ConfirmModal";

/** Hộp danh sách luôn thấy đúng bao nhiêu đơn cùng lúc; còn lại cuộn xuống để tải tiếp */
const VISIBLE_COUNT = 3;
const LIST_GAP = 12;
const LIST_HEIGHT = VISIBLE_COUNT * REQUEST_CARD_H + (VISIBLE_COUNT - 1) * LIST_GAP;

/**
 * Hàng ô vuốt ngang bằng ngón tay (điện thoại) hoặc kéo/lăn chuột (máy tính).
 * Mép nào còn nội dung bị che thì mờ dần ở mép đó để người dùng biết còn vuốt được.
 */
function SwipeRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdge({
        left: el.scrollLeft > 2,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, []);

  const mask = `linear-gradient(to right, ${edge.left ? "transparent 0, #000 18px" : "#000 0"}, ${
    edge.right ? "#000 calc(100% - 26px), transparent 100%" : "#000 100%"
  })`;

  return (
    <div
      ref={ref}
      className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar"
      style={{
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-x pan-y",
        overscrollBehaviorX: "contain",
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
    >
      {children}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white border border-border animate-pulse flex-shrink-0" style={{ height: REQUEST_CARD_H }} />
  );
}

/**
 * Mục "Tìm kiếm đơn" (Trang chủ): các đơn khách đăng để tìm nhiếp ảnh gia.
 * Thấy 3 đơn, cuộn trong hộp để tải thêm không giới hạn. Có sắp xếp + bộ lọc.
 */
export function PhotoRequestBoard({ onCreate, onManage, currentUserId, isPhotographer = false, manageBadge = 0 }: {
  /** Bấm "Tạo đơn chụp ảnh" (mở màn tạo đơn). Không truyền → ẩn nút. */
  onCreate?: () => void;
  /** Bấm "Quản lý đơn" (xem tất cả đơn của mình) */
  onManage?: () => void;
  /** Để khóa nút "Đề nghị chụp" trên đơn của chính mình */
  currentUserId?: string | null;
  /** Chỉ role photographer mới nhận được đơn */
  isPhotographer?: boolean;
  /** Số tin chat chưa đọc → chấm đỏ trên nút "Quản lý đơn" */
  manageBadge?: number;
}) {
  const [filter, setFilter] = useState<RequestFilter>(EMPTY_REQUEST_FILTER);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detail, setDetail] = useState<PhotoRequest | null>(null);
  const [offerFor, setOfferFor] = useState<PhotoRequest | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const isOwn = (r: PhotoRequest) => !!currentUserId && r.requester_id === currentUserId;
  const handleOffer = isPhotographer && currentUserId ? (r: PhotoRequest) => setOfferFor(r) : undefined;
  const { items, loading, loadingMore, hasMore, error, sample, loadMore, retry } = usePhotoRequests(filter);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Cuộn gần chạm đáy hộp → tải trang tiếp theo. Tạo lại observer sau mỗi lần thêm đơn
  // để trang ngắn vẫn tự tải tiếp cho tới khi hết.
  useEffect(() => {
    const root = scrollerRef.current;
    const node = sentinelRef.current;
    if (!root || !node || !hasMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore(); },
      { root, rootMargin: "0px 0px 240px 0px", threshold: 0 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [items.length, hasMore, loading, loadMore]);

  const filterN = countRequestFilters(filter);
  const fitsAll = items.length <= VISIBLE_COUNT && !hasMore;

  return (
    <section className="mt-2" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-foreground">Tìm kiếm đơn</h3>
          <p className="text-xs font-semibold mt-0.5" style={{ color: TEAL_LIGHT }}>
            Khách đăng yêu cầu thuê nhiếp ảnh gia
          </p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-stretch gap-1.5">
          {onCreate && (
            <button type="button" onClick={onCreate}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-white whitespace-nowrap"
              style={{ background: TEAL }}>
              <Plus size={14} strokeWidth={2.5} /> Tạo đơn chụp ảnh
            </button>
          )}
          {onManage && (
            <div className="relative">
              <button type="button" onClick={onManage}
                className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border bg-white"
                style={{ borderColor: TEAL, color: TEAL }}>
                <ClipboardList size={14} strokeWidth={2.2} /> Quản lý đơn
              </button>
              <CountBadge n={manageBadge} />
            </div>
          )}
        </div>
      </div>

      {/* Sắp xếp + nút bộ lọc */}
      <div className="flex items-center gap-2 mb-3">
        <SwipeRow>
          {REQUEST_SORT_OPTIONS.map((o) => {
            const on = filter.sort === o.id;
            return (
              <button key={o.id} type="button"
                onClick={() => setFilter((f) => ({ ...f, sort: o.id }))}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap"
                style={{
                  background: on ? TEAL : "white",
                  borderColor: on ? TEAL : "var(--border)",
                  color: on ? "white" : "#374151",
                }}>
                {o.label}
              </button>
            );
          })}
        </SwipeRow>
        <button type="button" onClick={() => setSheetOpen(true)} aria-label="Bộ lọc đơn"
          className="relative flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: filterN > 0 ? TEAL : TEAL_LIGHT }}>
          <SlidersHorizontal size={15} strokeWidth={2} className="text-white" />
          {filterN > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {filterN}
            </span>
          )}
        </button>
      </div>

      {sample && (
        <p className="text-[11px] text-amber-600 font-semibold mb-2">
          Đang hiện dữ liệu mẫu (dev) — chưa có bảng photo_requests.
        </p>
      )}

      {/* Danh sách */}
      {loading ? (
        <div className="flex flex-col overflow-hidden" style={{ height: LIST_HEIGHT, gap: LIST_GAP }}>
          {Array.from({ length: VISIBLE_COUNT }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error && items.length === 0 ? (
        <div className="rounded-2xl bg-white border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">Không tải được danh sách đơn.</p>
          <button type="button" onClick={retry} className="mt-3 px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: TEAL }}>
            Thử lại
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-white border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {filterN > 0 ? "Không có đơn nào khớp bộ lọc." : "Chưa có đơn nào đang tìm nhiếp ảnh gia."}
          </p>
          {filterN > 0 && (
            <button type="button" onClick={() => setFilter((f) => ({ ...EMPTY_REQUEST_FILTER, sort: f.sort }))}
              className="mt-3 px-4 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: TEAL, color: TEAL }}>
              Xóa bộ lọc
            </button>
          )}
        </div>
      ) : (
        <div
          ref={scrollerRef}
          className="flex flex-col no-scrollbar snap-y snap-proximity"
          style={{
            // Ít hơn 3 đơn và đã hết → ôm vừa nội dung; còn lại: cao đúng 3 đơn, cuộn trong hộp
            height: fitsAll ? undefined : LIST_HEIGHT,
            overflowY: fitsAll ? "visible" : "auto",
            gap: LIST_GAP,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {items.map((r) => (
            <div key={r.id} className="snap-start flex-shrink-0">
              <PhotoRequestCard
                r={r}
                onOffer={handleOffer}
                onDetail={setDetail}
                offerDisabledReason={isOwn(r) ? "Đơn của bạn" : null}
              />
            </div>
          ))}
          <div ref={sentinelRef} className="flex-shrink-0 py-2 text-center text-[11px] text-muted-foreground">
            {loadingMore ? "Đang tải thêm…" : error ? "Không tải thêm được" : hasMore ? "" : "Đã hiện hết đơn"}
          </div>
        </div>
      )}

      <PhotoRequestDetailSheet
        r={detail}
        onClose={() => setDetail(null)}
        footer={
          handleOffer && detail && !isOwn(detail) ? (
            <button type="button" onClick={() => { const d = detail; setDetail(null); handleOffer(d); }}
              className="flex-1 py-3 rounded-2xl text-white font-bold text-sm" style={{ background: TEAL }}>
              Đề nghị chụp
            </button>
          ) : undefined
        }
      />

      {currentUserId && (
        <OfferSheet
          r={offerFor}
          userId={currentUserId}
          onClose={() => setOfferFor(null)}
          onDone={(m) => { setOfferFor(null); setFlash(m); retry(); }}
        />
      )}
      {flash && (
        <ConfirmModal title="Nhận đơn" message={flash} onBackdropClick={() => setFlash(null)}
          actions={[{ label: "Đã hiểu", onClick: () => setFlash(null) }]} />
      )}

      <PhotoRequestFilterSheet
        open={sheetOpen}
        value={filter}
        onClose={() => setSheetOpen(false)}
        onApply={setFilter}
      />
    </section>
  );
}
