import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { TEAL } from "../../constants";

export const CHAT_REPORT_REASONS = [
  "Quấy rối, lăng mạ hoặc đe dọa",
  "Lừa đảo hoặc yêu cầu chuyển tiền ngoài ứng dụng",
  "Spam hoặc quảng cáo",
  "Nội dung nhạy cảm, không phù hợp",
  "Vấn đề liên quan đến người dưới 18 tuổi",
  "Vấn đề khác",
];

const SAFETY_NOTE =
  "Nếu bạn nhận thấy ai đó đang gặp nguy hiểm, đừng chần chừ mà hãy tìm ngay sự giúp đỡ trước khi báo cáo với Memento.";

/**
 * Báo cáo cuộc trò chuyện. Khi gửi, server chụp lại TOÀN BỘ hội thoại này để admin xem.
 * `onSubmit` nhận mô tả đã ghép sẵn (lý do + chi tiết) và trả về chuỗi lỗi, hoặc null nếu thành công.
 */
export function ChatReportModal({
  open,
  partnerName,
  onClose,
  onSubmit,
  onDone,
}: {
  open: boolean;
  partnerName?: string;
  onClose: () => void;
  onSubmit: (description: string) => Promise<string | null>;
  onDone: (msg: string) => void;
}) {
  const [step, setStep] = useState<"reasons" | "details">("reasons");
  const [reason, setReason] = useState("");
  const [extra, setExtra] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("reasons");
    setReason("");
    setExtra("");
    setSending(false);
    setErr(null);
  }, [open]);

  if (!open) return null;

  const needExtra = reason === "Vấn đề khác";
  const extraTrim = extra.trim();
  // RPC report_conversation yêu cầu description >= 10 ký tự
  const description = extraTrim ? `${reason} — ${extraTrim}` : reason;
  const canSend = !sending && description.trim().length >= 10 && (!needExtra || extraTrim.length >= 10);

  async function send() {
    setSending(true);
    setErr(null);
    const e = await onSubmit(description.trim());
    setSending(false);
    if (e) return setErr(e);
    onDone("Đã gửi báo cáo, bên mình sẽ xem xét sớm");
    onClose();
  }

  const row =
    "w-full flex items-center justify-between gap-3 py-3.5 text-left text-sm font-semibold border-b border-border last:border-b-0";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl flex flex-col"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center justify-center px-12 py-3.5 border-b border-border flex-shrink-0">
          {step === "details" && (
            <button
              type="button"
              onClick={() => { setErr(null); setStep("reasons"); }}
              aria-label="Quay lại"
              className="absolute left-3 w-8 h-8 rounded-full bg-muted flex items-center justify-center"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <h3 className="font-bold text-base" style={{ color: TEAL }}>Báo cáo hội thoại</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="absolute right-3 w-8 h-8 rounded-full bg-muted flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto overscroll-contain" style={{ touchAction: "pan-y" }}>
          {step === "reasons" && (
            <>
              <p className="font-bold text-sm">Tại sao bạn báo cáo cuộc trò chuyện này?</p>
              {partnerName && <p className="text-xs text-muted-foreground mt-0.5 break-words">Với {partnerName}</p>}
              <p className="text-xs text-muted-foreground mt-1 mb-1 leading-relaxed">{SAFETY_NOTE}</p>
              <p className="text-xs text-muted-foreground mb-1 leading-relaxed">
                Memento sẽ nhận bản sao toàn bộ tin nhắn giữa hai bên để xem xét.
              </p>
              {CHAT_REPORT_REASONS.map((r) => (
                <button key={r} type="button" className={row} onClick={() => { setReason(r); setStep("details"); }}>
                  <span>{r}</span>
                  <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </>
          )}

          {step === "details" && (
            <>
              <p className="text-xs text-muted-foreground">Lý do đã chọn</p>
              <p className="text-sm font-bold mt-0.5 mb-3 break-words" style={{ color: TEAL }}>{reason}</p>
              <p className="text-xs font-bold mb-1">
                {needExtra ? "Mô tả tình huống (ít nhất 10 ký tự)" : "Mô tả thêm (không bắt buộc)"}
              </p>
              <textarea
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                maxLength={500}
                placeholder="Cho bên mình biết thêm chi tiết..."
                className="w-full rounded-xl border border-border px-3 py-2 text-sm h-28 resize-none overflow-y-auto"
                style={{ overflowWrap: "anywhere" }}
              />
              <p className="text-[11px] text-muted-foreground text-right">{extra.length}/500</p>
              {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
              <button
                type="button"
                disabled={!canSend}
                onClick={send}
                className="w-full mt-3 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "#ef4444" }}
              >
                {sending ? "Đang gửi..." : "Gửi báo cáo"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
