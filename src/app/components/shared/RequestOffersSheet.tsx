import { useCallback, useEffect, useState } from "react";
import { X, MessageCircle, User, Check } from "lucide-react";
import { useBackHandler } from "../../lib/backNavigation";
import { TEAL, TEAL_LIGHT } from "../../constants";
import { Avatar } from "./Avatar";
import { CountBadge } from "./CountBadge";
import { ConfirmModal } from "./ConfirmModal";
import { type PhotoRequest, formatBudget } from "../../lib/photoRequests";
import { chooseOffer, fetchRequestOffers, type RequestOffer } from "../../lib/requestOffers";
import { formatNotifTime } from "../../lib/notifications";

const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

/**
 * Chủ đơn: danh sách người nhận đơn (giá + lời nhắn). Xem hồ sơ, chat, tick 1 người rồi "Chốt người này".
 */
export function RequestOffersSheet({ r, onClose, onOpenProfile, onChat, onChosen, unreadByOffer }: {
  r: PhotoRequest | null;
  onClose: () => void;
  onOpenProfile: (o: RequestOffer) => void;
  onChat: (o: RequestOffer, r: PhotoRequest) => Promise<string | null>;
  /** Đã chốt xong */
  onChosen: (r: PhotoRequest) => void;
  /** Tin chưa đọc theo đề nghị → chấm đỏ trên nút Chat */
  unreadByOffer?: Record<string, number>;
}) {
  const [rows, setRows] = useState<RequestOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useBackHandler(!!r && !confirm, onClose);

  const load = useCallback(async () => {
    if (!r) return;
    setLoading(true);
    const res = await fetchRequestOffers(r.id);
    setRows(res.rows);
    setError(res.error);
    setLoading(false);
  }, [r]);

  useEffect(() => { setPicked(null); setNote(null); setConfirm(false); void load(); }, [load]);

  if (!r) return null;
  const locked = r.status !== "open";
  const sel = rows.find((x) => x.offer_id === picked) ?? null;

  async function doChoose() {
    if (!sel || !r) return;
    setBusy(true);
    const res = await chooseOffer(sel.offer_id);
    setBusy(false);
    setConfirm(false);
    if (res.error) { setNote(res.error); void load(); return; }
    onChosen(r);
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: "92dvh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
          <div className="min-w-0">
            <h3 className="font-black text-lg leading-tight" style={{ color: TEAL }}>Người nhận đơn ({rows.length})</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.title} · Ngân sách: {formatBudget(r.budget_min, r.budget_max)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center"><X size={16} /></button>
        </div>

        <div className="px-5 pt-1 overflow-y-auto no-scrollbar flex-1 min-h-0 flex flex-col gap-2.5">
          {loading ? <p className="text-sm text-muted-foreground py-8 text-center">Đang tải…</p>
            : error ? <p className="text-sm text-red-600 py-6 text-center">{error}</p>
            : rows.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Chưa có nhiếp ảnh gia nào nhận đơn.</p>
            : rows.map((o) => {
              const on = picked === o.offer_id;
              const chosen = o.status === "chosen";
              return (
                <div key={o.offer_id}
                  className="rounded-2xl border p-3"
                  style={{ borderColor: on || chosen ? TEAL_LIGHT : "var(--border)", background: on ? `${TEAL_LIGHT}12` : "white" }}>
                  <div className="flex items-center gap-2.5">
                    <Avatar src={o.avatar} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate">{o.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatNotifTime(o.updated_at)}</p>
                    </div>
                    <p className="font-extrabold text-sm whitespace-nowrap" style={{ color: TEAL }}>{vnd(o.price)}</p>
                  </div>
                  {o.message && <p className="mt-2 text-xs text-foreground/85 bg-muted rounded-xl px-3 py-2 whitespace-pre-wrap break-words">{o.message}</p>}
                  <div className="mt-2.5 flex items-center gap-2">
                    <button type="button" onClick={() => onOpenProfile(o)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border bg-white" style={{ borderColor: TEAL, color: TEAL }}>
                      <User size={12} /> Hồ sơ
                    </button>
                    <div className="relative">
                      <button type="button" onClick={async () => { const e = await onChat(o, r); if (e) setNote(e); }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border bg-white" style={{ borderColor: TEAL, color: TEAL }}>
                        <MessageCircle size={12} /> Chat
                      </button>
                      <CountBadge n={unreadByOffer?.[o.offer_id] ?? 0} />
                    </div>
                    <div className="flex-1" />
                    {chosen ? (
                      <span className="text-xs font-bold" style={{ color: TEAL_LIGHT }}>Đã chọn</span>
                    ) : !locked && (
                      <button type="button" onClick={() => setPicked(on ? null : o.offer_id)}
                        aria-pressed={on} aria-label={`Chọn ${o.name}`}
                        className="w-7 h-7 rounded-full border-2 flex items-center justify-center"
                        style={{ borderColor: on ? TEAL : "#cbd5d1", background: on ? TEAL : "white" }}>
                        {on && <Check size={14} className="text-white" strokeWidth={3} />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          {note && <p className="text-xs text-red-600 text-center py-1">{note}</p>}
        </div>

        {!locked && (
          <div className="px-5 pt-3" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
            <button type="button" disabled={!sel} onClick={() => setConfirm(true)}
              className="w-full py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-40" style={{ background: TEAL }}>
              {sel ? `Chốt ${sel.name} · ${vnd(sel.price)}` : "Tick chọn 1 người để chốt"}
            </button>
          </div>
        )}
        {locked && <div style={{ height: "calc(16px + env(safe-area-inset-bottom))" }} />}
      </div>

      {confirm && sel && (
        <ConfirmModal
          title="Chốt nhiếp ảnh gia này?"
          message={`Bạn chọn ${sel.name} với giá ${vnd(sel.price)}. Đơn sẽ chuyển sang Lịch hẹn để thanh toán, các đề nghị khác sẽ bị đóng và không thể hoàn tác.`}
          onBackdropClick={() => { if (!busy) setConfirm(false); }}
          actions={[
            { label: busy ? "Đang chốt…" : "Xác nhận chốt", onClick: () => { if (!busy) void doChoose(); } },
            { label: "Xem lại", variant: "secondary", onClick: () => { if (!busy) setConfirm(false); } },
          ]}
        />
      )}
    </div>
  );
}
