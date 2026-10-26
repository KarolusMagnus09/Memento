import type { ReactNode } from "react";
import { User, Camera, CalendarDays, MapPin } from "lucide-react";
import { TEAL, TEAL_LIGHT } from "../../constants";
import {
  type PhotoRequest,
  formatBudget,
  formatShootRange,
  formatDeadline,
  formatCreatedShort,
  formatGenres,
  formatSetting,
  formatPlace,
  formatServices,
} from "../../lib/photoRequests";

/** Chiều cao cố định của thẻ → hộp danh sách biết chính xác "3 đơn" cao bao nhiêu */
export const REQUEST_CARD_H = 272;

function InfoRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 min-w-0">
      <span className="flex-shrink-0" style={{ color: TEAL }}>{icon}</span>
      <span className="truncate min-w-0">{children}</span>
    </li>
  );
}

/**
 * Thẻ "đơn tìm nhiếp ảnh gia".
 * Không hiện mã đơn (chỉ hiện trong "Chi tiết"). Có nút "Chi tiết" + "Đề nghị chụp".
 */
export function PhotoRequestCard({ r, onOffer, onDetail, offerDisabledReason }: {
  r: PhotoRequest;
  /** Chưa truyền → nút "Đề nghị chụp" hiện mờ */
  onOffer?: (r: PhotoRequest) => void;
  onDetail?: (r: PhotoRequest) => void;
  /** Có giá trị → khóa nút "Đề nghị chụp" (vd đơn của chính mình) */
  offerDisabledReason?: string | null;
}) {
  const settingText = formatSetting(r.setting);
  const services = formatServices(r);
  const canOffer = !!onOffer && !offerDisabledReason;

  return (
    <div
      className="rounded-2xl bg-white border border-border p-3.5 flex flex-col shadow-sm"
      style={{ height: REQUEST_CARD_H }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-extrabold text-[15px] leading-tight truncate pt-1" style={{ color: TEAL }}>{r.title}</p>
        <span
          className="flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
          style={{ background: `${TEAL_LIGHT}22`, color: TEAL }}
        >
          Đang tìm NAG
        </span>
      </div>

      <ul className="mt-2 flex flex-col gap-1 text-xs text-foreground/85">
        <InfoRow icon={<User size={13} />}>
          <span className="font-semibold">{r.requester_name}</span>
          <span className="text-muted-foreground"> · {formatCreatedShort(r.created_at)}</span>
        </InfoRow>
        <InfoRow icon={<Camera size={13} />}>
          {[formatGenres(r.genres), settingText].filter(Boolean).join(" · ") || "Chưa chọn thể loại"}
        </InfoRow>
        <InfoRow icon={<CalendarDays size={13} />}>{formatShootRange(r)}</InfoRow>
        <InfoRow icon={<MapPin size={13} />}>{formatPlace(r)}</InfoRow>
      </ul>

      {services && (
        <span
          className="mt-2 self-start max-w-full truncate text-[11px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: "#f1f5f4", color: TEAL, border: `1px solid ${TEAL_LIGHT}40` }}
        >
          {services}
        </span>
      )}

      <p className="mt-1.5 font-extrabold text-sm whitespace-nowrap truncate" style={{ color: TEAL }}>
        {formatBudget(r.budget_min, r.budget_max)}
      </p>

      <div className="mt-auto">
        <p className="text-[11px] text-muted-foreground truncate mb-2">
          Hạn: <span className="font-semibold text-foreground/80">{formatDeadline(r.deadline)}</span>
          {" · "}Đề nghị: <span className="font-bold text-foreground/80">{r.offer_count}</span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onDetail?.(r)}
            className="flex-1 py-2 rounded-full text-xs font-bold border bg-white"
            style={{ borderColor: TEAL, color: TEAL }}
          >
            Chi tiết
          </button>
          <button
            type="button"
            disabled={!canOffer}
            onClick={() => onOffer?.(r)}
            className="flex-1 py-2 rounded-full text-xs font-bold text-white disabled:opacity-45"
            style={{ background: TEAL }}
          >
            Đề nghị chụp
          </button>
        </div>
      </div>
    </div>
  );
}
