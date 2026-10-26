import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, MapPin, Camera } from "lucide-react";
import { TEAL, TEAL_LIGHT } from "../../constants";
import { formatBudget, formatGenres, formatPlace, formatShootRange, type PhotoRequest } from "../../lib/photoRequests";
import { OFFER_STATUS_LABEL, fetchMyOffers, offerCanChat, type MyOfferItem } from "../../lib/requestOffers";
import { PhotoRequestDetailSheet } from "./PhotoRequestDetailSheet";
import { OfferSheet } from "./OfferSheet";
import { ConfirmModal } from "./ConfirmModal";
import { CountBadge } from "./CountBadge";

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

/** Tab "Bình luận của tôi": mọi đơn PTG đã gửi đề nghị, kèm giá + lời nhắn; sửa lại giá / nội dung, chat với chủ đơn. */
export function MyOffersList({ userId, onChat, unreadByOffer }: {
  userId: string;
  onChat: (it: MyOfferItem) => void;
  unreadByOffer?: Record<string, number>;
}) {
  const [items, setItems] = useState<MyOfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PhotoRequest | null>(null);
  const [editFor, setEditFor] = useState<PhotoRequest | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const pageRef = useRef(0);
  const busyRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async (reset = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    if (reset) pageRef.current = 0;
    const res = await fetchMyOffers(pageRef.current);
    if (res.error) { setError(res.error); setHasMore(false); }
    else {
      pageRef.current += 1;
      setItems((cur) => {
        const base = reset ? [] : cur;
        const seen = new Set(base.map((x) => x.offer_id));
        return [...base, ...res.rows.filter((x) => !seen.has(x.offer_id))];
      });
      setHasMore(res.hasMore);
    }
    setLoading(false);
    busyRef.current = false;
  }, []);

  useEffect(() => { void loadMore(true); }, [loadMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading) return;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) void loadMore(); }, { rootMargin: "0px 0px 300px 0px" });
    io.observe(node);
    return () => io.disconnect();
  }, [items.length, hasMore, loading, loadMore]);

  return (
    <div className="px-4 flex flex-col gap-3">
      {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-44 rounded-2xl bg-white border border-border animate-pulse" />)
        : error && items.length === 0 ? <div className="rounded-2xl bg-white border border-border p-6 text-center text-sm text-muted-foreground">Không tải được: {error}</div>
        : items.length === 0 ? <div className="rounded-2xl bg-white border border-border p-6 text-center text-sm text-muted-foreground">Bạn chưa nhận đơn nào. Vào Trang chủ → Tìm kiếm đơn để gửi đề nghị.</div>
        : items.map((it) => {
          const r = it.request;
          const canEdit = r.status === "open" && it.status !== "chosen" && it.status !== "rejected";
          return (
            <div key={it.offer_id} className="rounded-2xl bg-white border border-border p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-extrabold text-[15px] leading-tight truncate pt-1" style={{ color: TEAL }}>{r.title}</p>
                <span className="flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                  style={{ background: it.status === "chosen" ? `${TEAL_LIGHT}33` : "#f1f5f4", color: TEAL }}>
                  {OFFER_STATUS_LABEL[it.status]}
                </span>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-foreground/85">
                <li className="flex items-center gap-2 min-w-0"><Camera size={13} style={{ color: TEAL }} className="flex-shrink-0" /><span className="truncate">{r.requester_name} · {formatGenres(r.genres) || "—"}</span></li>
                <li className="flex items-center gap-2 min-w-0"><CalendarDays size={13} style={{ color: TEAL }} className="flex-shrink-0" /><span className="truncate">{formatShootRange(r)}</span></li>
                <li className="flex items-center gap-2 min-w-0"><MapPin size={13} style={{ color: TEAL }} className="flex-shrink-0" /><span className="truncate">{formatPlace(r)}</span></li>
              </ul>
              <p className="mt-1 text-[11px] text-muted-foreground">Ngân sách khách: {formatBudget(r.budget_min, r.budget_max)}</p>

              <div className="mt-2.5 rounded-xl px-3 py-2" style={{ background: `${TEAL_LIGHT}14`, border: `1px solid ${TEAL_LIGHT}40` }}>
                <p className="text-[11px] font-semibold text-muted-foreground">Đề xuất của bạn</p>
                <p className="font-extrabold text-sm" style={{ color: TEAL }}>{vnd(it.price)}</p>
                {it.message && <p className="text-xs text-foreground/85 mt-1 whitespace-pre-wrap break-words">{it.message}</p>}
              </div>

              <div className="mt-2.5 flex gap-2">
                <button type="button" onClick={() => setDetail(r)}
                  className="flex-1 py-2 rounded-full text-xs font-bold border bg-white" style={{ borderColor: TEAL, color: TEAL }}>Chi tiết</button>
                <div className="relative flex-1">
                  <button type="button" disabled={!offerCanChat(it.status)} onClick={() => onChat(it)}
                    className="w-full py-2 rounded-full text-xs font-bold border bg-white disabled:opacity-40" style={{ borderColor: TEAL, color: TEAL }}>Chat</button>
                  <CountBadge n={unreadByOffer?.[it.offer_id] ?? 0} />
                </div>
                <button type="button" disabled={!canEdit} onClick={() => setEditFor(r)}
                  className="flex-1 py-2 rounded-full text-xs font-bold text-white disabled:opacity-40" style={{ background: TEAL }}>Chỉnh sửa</button>
              </div>
            </div>
          );
        })}
      <div ref={sentinelRef} className="py-2 text-center text-[11px] text-muted-foreground">
        {!loading && items.length > 0 && (hasMore ? "Đang tải thêm…" : "Đã hiện hết")}
      </div>

      <PhotoRequestDetailSheet r={detail} onClose={() => setDetail(null)} />
      <OfferSheet r={editFor} userId={userId} onClose={() => setEditFor(null)}
        onDone={(m) => { setEditFor(null); setFlash(m); void loadMore(true); }} />
      {flash && <ConfirmModal title="Đề nghị" message={flash} onBackdropClick={() => setFlash(null)} actions={[{ label: "Đã hiểu", onClick: () => setFlash(null) }]} />}
    </div>
  );
}
