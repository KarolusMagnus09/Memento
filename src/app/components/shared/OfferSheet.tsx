import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useBackHandler } from "../../lib/backNavigation";
import { TEAL } from "../../constants";
import { PriceInput, fmtVnd, BAD_CHAR_MSG } from "./PriceInput";
import { type PhotoRequest, formatBudget } from "../../lib/photoRequests";
import { MAX_OFFER_MESSAGE, fetchMyOffer, submitOffer, withdrawOffer, type MyOffer } from "../../lib/requestOffers";

/** PTG: nhận đơn → tự đặt giá + để lại lời nhắn. Mở lại thì sửa được giá. */
export function OfferSheet({ r, userId, onClose, onDone }: {
  r: PhotoRequest | null;
  userId: string;
  onClose: () => void;
  /** Gửi / rút xong (để làm mới số đề nghị) */
  onDone: (msg: string) => void;
}) {
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [mine, setMine] = useState<MyOffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBackHandler(!!r, onClose);

  useEffect(() => {
    if (!r) return;
    setPrice(""); setMessage(""); setMine(null); setError(null); setLoading(true);
    let alive = true;
    fetchMyOffer(r.id, userId).then((o) => {
      if (!alive) return;
      setMine(o);
      if (o) { setPrice(String(o.price)); setMessage(o.message ?? ""); }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [r, userId]);

  if (!r) return null;
  const n = Number(price);
  const valid = Number.isFinite(n) && n > 0;

  async function submit() {
    if (!r) return;
    if (!valid) { setError("Nhập giá bạn đề nghị."); return; }
    setBusy(true); setError(null);
    const err = await submitOffer(r.id, n, message);
    setBusy(false);
    if (err) { setError(err); return; }
    onDone(mine ? "Đã cập nhật đề nghị của bạn." : "Đã gửi đề nghị. Chủ đơn sẽ nhận được thông báo.");
  }

  async function withdraw() {
    if (!r) return;
    setBusy(true); setError(null);
    const err = await withdrawOffer(r.id);
    setBusy(false);
    if (err) { setError(err); return; }
    onDone("Đã rút đề nghị.");
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: "90dvh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
          <div className="min-w-0">
            <h3 className="font-black text-lg leading-tight" style={{ color: TEAL }}>{mine ? "Sửa đề nghị" : "Nhận đơn này"}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.title} · Ngân sách khách: {formatBudget(r.budget_min, r.budget_max)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center"><X size={16} /></button>
        </div>

        <div className="px-5 pt-2 overflow-y-auto no-scrollbar flex-1 min-h-0">
          {loading ? <p className="text-sm text-muted-foreground py-6 text-center">Đang tải…</p> : (
            <>
              <label className="text-xs font-bold block mb-1.5" style={{ color: TEAL }}>Giá bạn đề nghị (VND)</label>
              <div className="flex items-center gap-2">
                <PriceInput value={price} onChange={setPrice} onBadChar={() => setError(BAD_CHAR_MSG)}
                  placeholder="VD: 2.000.000" invalid={!!error && !valid} ariaLabel="Giá đề nghị" />
                <span className="text-sm font-bold text-muted-foreground">đ</span>
              </div>
              {valid && <p className="text-[11px] text-muted-foreground mt-1">{fmtVnd(String(Math.round(n)))} đ</p>}

              <label className="text-xs font-bold block mt-4 mb-1.5" style={{ color: TEAL }}>Lời nhắn cho khách (tùy chọn)</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, MAX_OFFER_MESSAGE))} rows={4}
                placeholder="Giới thiệu nhanh, phong cách, thiết bị, thời gian giao ảnh…"
                className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none resize-none" />
              <p className="text-[11px] text-muted-foreground text-right">{message.length}/{MAX_OFFER_MESSAGE}</p>
              {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
              <p className="text-[11px] text-muted-foreground mt-2">Bạn có thể đổi giá bất cứ lúc nào cho tới khi khách chốt.</p>
            </>
          )}
        </div>

        <div className="px-5 pt-3 flex gap-2" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
          {mine && (
            <button type="button" disabled={busy} onClick={() => void withdraw()}
              className="py-3 px-4 rounded-2xl border-2 border-destructive text-destructive font-bold text-sm bg-white disabled:opacity-50">Rút</button>
          )}
          <button type="button" disabled={busy || loading} onClick={() => void submit()}
            className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50" style={{ background: TEAL }}>
            {busy ? "Đang gửi…" : mine ? "Cập nhật đề nghị" : "Gửi đề nghị"}
          </button>
        </div>
      </div>
    </div>
  );
}
