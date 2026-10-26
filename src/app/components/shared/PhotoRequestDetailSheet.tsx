import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useBackHandler } from "../../lib/backNavigation";
import { TEAL, TEAL_LIGHT } from "../../constants";
import {
  type PhotoRequest,
  STATUS_LABEL,
  formatBudget,
  formatShootRange,
  formatDeadline,
  formatGenres,
  formatSetting,
  formatPlace,
  formatServices,
  formatParticipants,
} from "../../lib/photoRequests";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-2.5 border-b border-border last:border-0">
      <p className="text-[11px] font-semibold text-muted-foreground mb-0.5">{label}</p>
      <div className="text-sm text-foreground break-words">{children}</div>
    </div>
  );
}

/** Chi tiết đầy đủ của 1 đơn (đây là nơi DUY NHẤT hiện mã đơn). Bottom sheet nằm trên thanh menu dưới. */
export function PhotoRequestDetailSheet({ r, onClose, footer }: {
  r: PhotoRequest | null;
  onClose: () => void;
  /** Nút hành động phía dưới (vd "Đề nghị chụp") */
  footer?: ReactNode;
}) {
  useBackHandler(!!r, onClose);
  if (!r) return null;
  const participants = formatParticipants(r.participants);

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white rounded-t-3xl flex flex-col"
        style={{ maxHeight: "88dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h3 className="font-black text-lg leading-tight" style={{ color: TEAL }}>{r.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Mã đơn: #{r.code}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng"
            className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 overflow-y-auto no-scrollbar flex-1 min-h-0">
          <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full mb-1"
            style={{ background: `${TEAL_LIGHT}22`, color: TEAL }}>
            {STATUS_LABEL[r.status]}
          </span>
          <Row label="Người đăng">{r.requester_name}</Row>
          <Row label="Thể loại">{formatGenres(r.genres) || "—"}</Row>
          {formatSetting(r.setting) && <Row label="Bối cảnh">{formatSetting(r.setting)}</Row>}
          {participants && <Row label="Số người">{participants}</Row>}
          <Row label="Thời gian chụp">{formatShootRange(r)}</Row>
          <Row label="Địa điểm">{formatPlace(r)}</Row>
          <Row label="Dịch vụ cần thuê">{formatServices(r) || "—"}</Row>
          <Row label="Ngân sách"><span className="font-extrabold" style={{ color: TEAL }}>{formatBudget(r.budget_min, r.budget_max)}</span></Row>
          <Row label="Hạn tìm nhiếp ảnh gia">{formatDeadline(r.deadline)}</Row>
          <Row label="Số nhiếp ảnh gia đã đề nghị">{r.offer_count}</Row>
          {r.note && <Row label="Nội dung thêm"><span className="whitespace-pre-wrap">{r.note}</span></Row>}
        </div>

        <div className="px-5 pt-3 flex gap-2" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={onClose}
            className="flex-1 py-3 rounded-2xl border-2 font-bold text-sm bg-white" style={{ borderColor: "#e5e7eb", color: TEAL }}>
            Đóng
          </button>
          {footer}
        </div>
      </div>
    </div>
  );
}
