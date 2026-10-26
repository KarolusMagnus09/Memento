import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Trash2, CalendarDays, MapPin, Camera } from "lucide-react";
import type { Screen } from "../types";
import { BG, TEAL, TEAL_LIGHT } from "../constants";
import {
  type PhotoRequest,
  STATUS_LABEL,
  deleteMyPhotoRequest,
  fetchMyPhotoRequests,
  formatBudget,
  formatGenres,
  formatPlace,
  formatShootRange,
} from "../lib/photoRequests";
import { RequestOffersSheet } from "../components/shared/RequestOffersSheet";
import { ConfirmModal } from "../components/shared/ConfirmModal";
import type { RequestOffer, MyOfferItem } from "../lib/requestOffers";
import { MyOffersList } from "../components/shared/MyOffersList";
import { CountBadge } from "../components/shared/CountBadge";
import { EMPTY_OFFER_UNREAD, type OfferUnread } from "../lib/requestOffers";
import { PhotoRequestDetailSheet } from "../components/shared/PhotoRequestDetailSheet";
import { DeleteRequestModal } from "../components/shared/DeleteRequestModal";

/** Quản lý đơn: tất cả đơn mình đã đăng, cuộn vô hạn, có Chi tiết + thùng rác. */
export default function MyRequestsScreen({ setScreen, userId, onOpenProfile, onChat, isPhotographer, onChatMyOffer, unread = EMPTY_OFFER_UNREAD }: {
  setScreen: (s: Screen) => void;
  userId: string;
  /** Xem hồ sơ PTG (sang trang hồ sơ, Back quay lại đây) */
  onOpenProfile: (o: RequestOffer) => void;
  /** Mở chat với PTG; trả về chuỗi lỗi nếu chưa mở được */
  onChat: (o: RequestOffer, r: PhotoRequest) => Promise<string | null>;
  /** Chỉ PTG mới có tab "Bình luận của tôi" */
  isPhotographer: boolean;
  /** PTG chat với chủ đơn từ tab "Bình luận của tôi" */
  onChatMyOffer: (it: MyOfferItem) => void;
  /** Tin chat chưa đọc (chấm đỏ) */
  unread?: OfferUnread;
}) {
  const [tab, setTab] = useState<"mine" | "offers">("mine");
  const [offersFor, setOffersFor] = useState<PhotoRequest | null>(null);
  const [chosenNotice, setChosenNotice] = useState(false);
  const [items, setItems] = useState<PhotoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PhotoRequest | null>(null);
  const [toDelete, setToDelete] = useState<PhotoRequest | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  const pageRef = useRef(0);
  const busyRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const res = await fetchMyPhotoRequests(userId, pageRef.current);
    if (res.error) {
      setError(res.error);
      setHasMore(false);
    } else {
      pageRef.current += 1;
      setItems((cur) => {
        const seen = new Set(cur.map((x) => x.id));
        return [...cur, ...res.rows.filter((x) => !seen.has(x.id))];
      });
      setHasMore(res.hasMore);
    }
    setLoading(false);
    busyRef.current = false;
  }, [userId]);

  useEffect(() => { void loadMore(); }, [loadMore]);

  // Chạm đáy danh sách → tải tiếp
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading) return;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) void loadMore(); }, { rootMargin: "0px 0px 300px 0px" });
    io.observe(node);
    return () => io.disconnect();
  }, [items.length, hasMore, loading, loadMore, tab]);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setDelError(null);
    const err = await deleteMyPhotoRequest(toDelete.id);
    setDeleting(false);
    if (err) { setDelError(err); return; }
    setItems((cur) => cur.filter((x) => x.id !== toDelete.id));
    setToDelete(null);
  }

  return (
    <div className="min-h-full flex flex-col" style={{ background: BG, paddingBottom: "calc(88px + env(safe-area-inset-bottom))" }}>
      <div className="flex items-center gap-3 px-4 pt-8 pb-3">
        <button type="button" onClick={() => setScreen("home")} aria-label="Quay lại"
          className="w-9 h-9 rounded-full bg-white border border-border flex items-center justify-center">
          <ArrowLeft size={18} style={{ color: TEAL }} />
        </button>
        <div>
          <h2 className="font-black text-lg leading-tight" style={{ color: TEAL }}>Quản lý đơn</h2>
          <p className="text-xs font-semibold" style={{ color: TEAL_LIGHT }}>Tất cả đơn bạn đã đăng</p>
        </div>
      </div>

      {isPhotographer && (
        <div className="px-4 pb-3 flex gap-2">
          {([["mine", "Đơn của tôi", unread.ownerTotal], ["offers", "Bình luận của tôi", unread.ptgTotal]] as const).map(([id, label, n]) => (
            <div key={id} className="relative flex-1">
              <button type="button" onClick={() => setTab(id)}
                className="w-full py-2 rounded-full text-xs font-bold border"
                style={{ background: tab === id ? TEAL : "white", color: tab === id ? "white" : "#374151", borderColor: tab === id ? TEAL : "var(--border)" }}>
                {label}
              </button>
              <CountBadge n={n} />
            </div>
          ))}
        </div>
      )}

      {tab === "offers" && isPhotographer ? (
        <MyOffersList userId={userId} onChat={onChatMyOffer} unreadByOffer={unread.byOffer} />
      ) : (
      <div className="px-4 flex flex-col gap-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-white border border-border animate-pulse" />
          ))
        ) : error && items.length === 0 ? (
          <div className="rounded-2xl bg-white border border-border p-6 text-center text-sm text-muted-foreground">
            Không tải được đơn: {error}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl bg-white border border-border p-6 text-center text-sm text-muted-foreground">
            Bạn chưa đăng đơn nào.
            <button type="button" onClick={() => setScreen("create-request")}
              className="block mx-auto mt-3 px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: TEAL }}>
              Tạo đơn chụp ảnh
            </button>
          </div>
        ) : (
          items.map((r) => (
            <div key={r.id} className="rounded-2xl bg-white border border-border p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-extrabold text-[15px] leading-tight truncate pt-1" style={{ color: TEAL }}>{r.title}</p>
                <span className="flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                  style={{ background: `${TEAL_LIGHT}22`, color: TEAL }}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-foreground/85">
                <li className="flex items-center gap-2 min-w-0"><Camera size={13} style={{ color: TEAL }} className="flex-shrink-0" /><span className="truncate">{formatGenres(r.genres) || "—"}</span></li>
                <li className="flex items-center gap-2 min-w-0"><CalendarDays size={13} style={{ color: TEAL }} className="flex-shrink-0" /><span className="truncate">{formatShootRange(r)}</span></li>
                <li className="flex items-center gap-2 min-w-0"><MapPin size={13} style={{ color: TEAL }} className="flex-shrink-0" /><span className="truncate">{formatPlace(r)}</span></li>
              </ul>
              <p className="mt-1.5 font-extrabold text-sm truncate" style={{ color: TEAL }}>{formatBudget(r.budget_min, r.budget_max)}</p>
              <div className="mt-2.5 flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <button type="button" onClick={() => setOffersFor(r)}
                    className="w-full px-3 py-2 rounded-full text-xs font-bold text-white truncate"
                    style={{ background: TEAL }}>
                    {r.status === "matched" ? "Xem người đã chọn" : `Người nhận đơn (${r.offer_count})`}
                  </button>
                  <CountBadge n={unread.byRequest[r.id] ?? 0} />
                </div>
                <button type="button" onClick={() => setDetail(r)}
                  className="px-4 py-2 rounded-full text-xs font-bold border bg-white" style={{ borderColor: TEAL, color: TEAL }}>
                  Chi tiết
                </button>
                <button type="button" disabled={r.status === "matched"} onClick={() => { setDelError(null); setToDelete(r); }}
                  aria-label="Xóa đơn" title={r.status === "matched" ? "Đơn đã chốt, không thể xóa" : "Xóa đơn"}
                  className="w-9 h-9 rounded-full border border-red-200 bg-red-50 text-red-600 flex items-center justify-center disabled:opacity-35">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))
        )}
        <div ref={sentinelRef} className="py-2 text-center text-[11px] text-muted-foreground">
          {!loading && items.length > 0 && (hasMore ? "Đang tải thêm…" : "Đã hiện hết đơn")}
        </div>
      </div>
      )}

      <PhotoRequestDetailSheet r={detail} onClose={() => setDetail(null)} />
      <RequestOffersSheet
        r={offersFor}
        onClose={() => setOffersFor(null)}
        onOpenProfile={onOpenProfile}
        onChat={onChat}
        unreadByOffer={unread.byOffer}
        onChosen={(req) => {
          setItems((cur) => cur.map((x) => (x.id === req.id ? { ...x, status: "matched" } : x)));
          setOffersFor(null);
          setChosenNotice(true);
        }}
      />
      {chosenNotice && (
        <ConfirmModal
          title="Đã chốt nhiếp ảnh gia"
          message="Đơn đã được chuyển vào Lịch hẹn. Bạn thanh toán ở đó để bắt đầu."
          onBackdropClick={() => setChosenNotice(false)}
          actions={[
            { label: "Tới Lịch hẹn", onClick: () => { setChosenNotice(false); setScreen("bookings"); } },
            { label: "Ở lại", variant: "secondary", onClick: () => setChosenNotice(false) },
          ]}
        />
      )}
      {toDelete && (
        <DeleteRequestModal
          title={toDelete.title}
          busy={deleting}
          error={delError}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
