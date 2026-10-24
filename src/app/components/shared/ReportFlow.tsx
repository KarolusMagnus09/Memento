import { useBackHandler } from "../../lib/backNavigation";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { TEAL } from "../../constants";

/** Biểu tượng cảnh báo kiểu Facebook: khung chat có dấu chấm than */
export function ReportIcon({ size = 17, color = "currentColor", strokeWidth = 2 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 3.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6.2L8 20.5v-4H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" />
      <path d="M12 7.5v3.6" />
      <path d="M12 13.6h.01" />
    </svg>
  );
}

export const PROFILE_REPORT_REASONS = [
  "Vấn đề liên quan đến người dưới 18 tuổi",
  "Bắt nạt, quấy rối hoặc lăng mạ/lạm dụng/ngược đãi",
  "Tự tử hoặc tự hại bản thân",
  "Nội dung mang tính bạo lực, thù ghét hoặc gây phiền toái",
  "Bán hoặc quảng bá mặt hàng bị hạn chế",
  "Nội dung người lớn",
  "Thông tin sai sự thật, lừa đảo hoặc gian lận",
  "Trang cá nhân giả",
  "Quyền sở hữu trí tuệ",
  "Vấn đề khác",
];

export const PHOTO_REPORT_REASONS = [
  "Vấn đề liên quan đến người dưới 18 tuổi",
  "Bắt nạt, quấy rối hoặc lăng mạ/lạm dụng/ngược đãi",
  "Tự tử hoặc tự hại bản thân",
  "Nội dung mang tính bạo lực, thù ghét hoặc gây phiền toái",
  "Bán hoặc quảng bá mặt hàng bị hạn chế",
  "Nội dung người lớn",
  "Thông tin sai sự thật, lừa đảo hoặc gian lận",
  "Quyền sở hữu trí tuệ",
  "Tôi không muốn xem nội dung này",
];

export const REVIEW_REPORT_REASONS = [
  "Bắt nạt, quấy rối hoặc lăng mạ",
  "Ngôn từ bậy bạ, thù ghét hoặc gây phiền toái",
  "Spam hoặc quảng cáo",
  "Thông tin sai sự thật hoặc vu khống",
  "Nội dung người lớn",
  "Vấn đề khác",
];

export type ReportSubmit = {
  subject: "profile" | "photo";
  reason: string;
  description: string;
  photoUrl?: string;
};

type Step = "menu" | "photos" | "reasons" | "details";

const SAFETY_NOTE =
  "Nếu bạn nhận thấy ai đó đang gặp nguy hiểm, đừng chần chừ mà hãy tìm ngay sự giúp đỡ trước khi báo cáo với Memento.";

/**
 * Luồng báo cáo kiểu Facebook.
 * - kind="profile" + có ảnh: chọn "Thông tin về hồ sơ này" hoặc "Ảnh cụ thể trong hồ sơ" → (chọn ảnh) → lý do → mô tả thêm
 * - kind="review": báo cáo bình luận → lý do → mô tả thêm
 */
export function ReportFlow({
  open, onClose, targetName, photos = [], kind = "profile", onSubmit, onDone,
}: {
  open: boolean;
  onClose: () => void;
  targetName?: string;
  photos?: string[];
  kind?: "profile" | "review";
  onSubmit: (r: ReportSubmit) => Promise<string | null>;
  onDone: (msg: string) => void;
}) {
  const hasMenu = kind === "profile" && photos.length > 0;
  const [step, setStep] = useState<Step>("reasons");
  const [subject, setSubject] = useState<"profile" | "photo">("profile");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(hasMenu ? "menu" : "reasons");
    setSubject("profile");
    setPhotoUrl(null);
    setReason("");
    setDescription("");
    setErr(null);
    setSending(false);
  }, [open, hasMenu]);

  // Vuốt/Back: lùi 1 bước trong luồng báo cáo, hết bước thì đóng
  useBackHandler(open, () => {
    setErr(null);
    if (step === "details") setStep("reasons");
    else if (step === "reasons" && hasMenu) setStep(subject === "photo" ? "photos" : "menu");
    else if (step === "photos") setStep("menu");
    else onClose();
  });

  if (!open) return null;

  const reasons =
    kind === "review" ? REVIEW_REPORT_REASONS : subject === "photo" ? PHOTO_REPORT_REASONS : PROFILE_REPORT_REASONS;

  const title =
    step === "photos" ? "Chọn ảnh"
    : kind === "review" ? "Báo cáo bình luận"
    : "Báo cáo";

  function back() {
    setErr(null);
    if (step === "details") setStep("reasons");
    else if (step === "reasons") setStep(hasMenu ? (subject === "photo" ? "photos" : "menu") : "reasons");
    else if (step === "photos") setStep("menu");
  }
  const canBack = step === "details" || (step === "reasons" && hasMenu) || step === "photos";

  async function send() {
    setSending(true);
    setErr(null);
    const e = await onSubmit({
      subject,
      reason,
      description: description.trim(),
      photoUrl: subject === "photo" && photoUrl ? photoUrl : undefined,
    });
    setSending(false);
    if (e) return setErr(e);
    onDone("Đã gửi báo cáo, bên mình sẽ xem xét sớm");
    onClose();
  }

  const row = "w-full flex items-center justify-between gap-3 py-3.5 text-left text-sm font-semibold border-b border-border last:border-b-0";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-3xl flex flex-col" style={{ maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-center justify-center px-12 py-3.5 border-b border-border flex-shrink-0">
          {canBack && (
            <button type="button" onClick={back} aria-label="Quay lại"
              className="absolute left-3 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <ChevronLeft size={18} />
            </button>
          )}
          <h3 className="font-bold text-base" style={{ color: TEAL }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng"
            className="absolute right-3 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto overscroll-contain" style={{ touchAction: "pan-y" }}>
          {step === "menu" && (
            <>
              <p className="font-bold text-sm">Bạn muốn báo cáo điều gì?</p>
              <p className="text-xs text-muted-foreground mt-1 mb-2 leading-relaxed">{SAFETY_NOTE}</p>
              <button type="button" className={row} onClick={() => { setSubject("profile"); setStep("reasons"); }}>
                Thông tin về hồ sơ này <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
              </button>
              <button type="button" className={row} onClick={() => { setSubject("photo"); setStep("photos"); }}>
                Ảnh cụ thể trong hồ sơ <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
              </button>
            </>
          )}

          {step === "photos" && (
            <>
              <p className="font-bold text-sm">Vui lòng chọn ảnh</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3 leading-relaxed">
                Nếu bạn cho rằng chúng tôi cần xem nội dung cụ thể không có trong danh sách này, hãy đến nội dung đó và báo cáo trực tiếp.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {photos.slice(0, 60).map((u) => {
                  const on = photoUrl === u;
                  return (
                    <button key={u} type="button" onClick={() => setPhotoUrl(u)}
                      className="relative rounded-xl overflow-hidden aspect-square border-2"
                      style={{ borderColor: on ? TEAL : "transparent" }}>
                      <img src={u} alt="Ảnh trong hồ sơ" className="w-full h-full object-cover" />
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white"
                        style={{ background: on ? TEAL : "rgba(0,0,0,0.25)" }}>
                        {on && <Check size={12} strokeWidth={3} className="text-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button type="button" disabled={!photoUrl} onClick={() => setStep("reasons")}
                className="w-full mt-4 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                style={{ background: TEAL }}>
                Tiếp
              </button>
            </>
          )}

          {step === "reasons" && (
            <>
              <p className="font-bold text-sm">
                {kind === "review" ? "Tại sao bạn báo cáo bình luận này?" : subject === "photo" ? "Tại sao bạn báo cáo ảnh này?" : "Tại sao bạn báo cáo hồ sơ này?"}
              </p>
              {targetName && <p className="text-xs text-muted-foreground mt-0.5 break-words">{targetName}</p>}
              <p className="text-xs text-muted-foreground mt-1 mb-1 leading-relaxed">{SAFETY_NOTE}</p>
              {reasons.map((r) => (
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
              {subject === "photo" && photoUrl && (
                <img src={photoUrl} alt="Ảnh bị báo cáo" className="w-20 h-20 rounded-xl object-cover border border-border mb-3" />
              )}
              <p className="text-xs font-bold mb-1">Mô tả thêm (không bắt buộc)</p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                placeholder="Cho bên mình biết thêm chi tiết..."
                className="w-full rounded-xl border border-border px-3 py-2 text-sm h-28 resize-none overflow-y-auto"
                style={{ overflowWrap: "anywhere" }}
              />
              <p className="text-[11px] text-muted-foreground text-right">{description.length}/500</p>
              {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
              <button type="button" disabled={sending} onClick={send}
                className="w-full mt-3 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "#ef4444" }}>
                {sending ? "Đang gửi..." : "Gửi báo cáo"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
