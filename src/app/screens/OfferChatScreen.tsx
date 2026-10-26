import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import type { Screen } from "../types";
import { BG, TEAL } from "../constants";
import { Avatar } from "../components/shared/Avatar";
import {
  fetchOfferMessages, markOfferRead, sendOfferMessage, subscribeOfferMessages,
  type OfferChatTarget, type OfferMessage,
} from "../lib/requestOffers";

const clock = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/** Chat giữa chủ đơn và PTG về 1 đề nghị (trước khi chốt). Màn riêng, không dùng thanh menu dưới. */
export default function OfferChatScreen({ target, userId, backTo, setScreen, onRead }: {
  target: OfferChatTarget;
  userId: string;
  backTo: Screen;
  setScreen: (s: Screen) => void;
  /** Đã đọc xong → làm mới chấm đỏ */
  onRead?: () => void;
}) {
  const [msgs, setMsgs] = useState<OfferMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const merge = (incoming: OfferMessage[]) =>
    setMsgs((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      const add = incoming.filter((m) => !seen.has(m.id));
      return add.length ? [...cur, ...add].sort((a, b) => a.created_at.localeCompare(b.created_at)) : cur;
    });

  useEffect(() => {
    let alive = true;
    fetchOfferMessages(target.offerId).then((r) => {
      if (!alive) return;
      if (r.error) setError(r.error); else merge(r.rows);
      setLoading(false);
      void markOfferRead(target.offerId).then(() => onRead?.());   // mở chat = đã đọc
    });
    const off = subscribeOfferMessages(target.offerId, (m) => {
      merge([m]);
      if (m.sender_id !== userId) void markOfferRead(target.offerId).then(() => onRead?.());   // tin mới đến khi đang mở
    });
    return () => { alive = false; off(); onRead?.(); };
  }, [target.offerId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.length, loading]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setError(null);
    const r = await sendOfferMessage(target.offerId, body);
    setSending(false);
    if (r.error || !r.message) { setError(r.error || "Chưa gửi được"); return; }
    setText("");
    merge([r.message]);
  }

  return (
    <div className="flex flex-col h-[100dvh]" style={{ background: BG }}>
      <div className="flex items-center gap-3 px-4 pt-7 pb-3 bg-white border-b border-border">
        <button type="button" onClick={() => setScreen(backTo)} aria-label="Quay lại"
          className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"><ArrowLeft size={18} style={{ color: TEAL }} /></button>
        <Avatar src={target.partnerAvatar} size={36} />
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">{target.partnerName}</p>
          <p className="text-[11px] text-muted-foreground truncate">Về đơn: {target.title}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 py-3 flex flex-col gap-1.5">
        {loading ? <p className="text-center text-xs text-muted-foreground py-8">Đang tải…</p>
          : msgs.length === 0 ? <p className="text-center text-xs text-muted-foreground py-8">Chưa có tin nhắn. Hỏi giá hoặc trao đổi thêm nhé.</p>
          : msgs.map((m) => {
            const mine = m.sender_id === userId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[78%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words"
                  style={mine ? { background: TEAL, color: "white" } : { background: "white", border: "1px solid var(--border)" }}>
                  {m.body}
                  <div className="text-[10px] mt-0.5 opacity-60 text-right">{clock(m.created_at)}</div>
                </div>
              </div>
            );
          })}
        <div ref={endRef} />
      </div>

      <div className="bg-white border-t border-border px-3 pt-2" style={{ paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}>
        {error && <p className="text-xs text-red-600 mb-1 px-1">{error}</p>}
        {target.canSend ? (
          <div className="flex items-end gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 2000))} rows={1}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder="Nhắn tin…" className="flex-1 max-h-28 px-3 py-2.5 rounded-2xl bg-muted text-sm outline-none resize-none" />
            <button type="button" onClick={() => void send()} disabled={!text.trim() || sending} aria-label="Gửi"
              className="w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-40" style={{ background: TEAL }}>
              <Send size={16} />
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">Đề nghị này đã đóng, không thể nhắn thêm.</p>
        )}
      </div>
    </div>
  );
}
