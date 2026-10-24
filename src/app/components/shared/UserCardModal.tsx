import { useBackHandler } from "../../lib/backNavigation";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { TEAL } from "../../constants";
import { Avatar } from "./Avatar";
import { ReportFlow, ReportIcon } from "./ReportFlow";
import { fetchUserCard, submitProfileReport, type UserCard } from "../../lib/social";

function genderLabel(g?: string | null) {
  return g === "female" ? "Nữ" : g === "male" ? "Nam" : g ? "Khác" : "Chưa cập nhật";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-border last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-right">{value}</span>
    </div>
  );
}

/**
 * Thẻ thông tin người dùng (bấm vào tên người bình luận).
 * Giống thẻ khách ở lịch hẹn; nếu người đó là photographer thì có thêm nút xem hồ sơ photographer.
 */
export function UserCardModal({
  userId, me, onClose, onOpenPhotographer, notify,
}: {
  userId: string;
  me: string | null;
  onClose: () => void;
  onOpenPhotographer?: (photographerId: number) => void;
  notify: (msg: string) => void;
}) {
  const [card, setCard] = useState<UserCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchUserCard(userId).then((c) => {
      if (!alive) return;
      setCard(c);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [userId]);

  const name = card?.full_name || card?.username || "Người dùng";
  useBackHandler(true, onClose);

  return (
    <>
      <div className="fixed inset-0 z-[105] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
        <div className="relative w-full max-w-sm bg-white rounded-3xl p-5" style={{ maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={onClose} aria-label="Đóng" className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center">
            <X size={20} />
          </button>

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">Đang tải...</p>
          ) : !card ? (
            <p className="text-sm text-muted-foreground text-center py-10">Không tải được thông tin người dùng.</p>
          ) : (
            <>
              <div className="flex flex-col items-center pt-2">
                <Avatar src={card.avatar_url} size={80} />
                <h3 className="font-black text-lg mt-3 text-center break-words max-w-full" style={{ color: TEAL, overflowWrap: "anywhere" }}>{name}</h3>
                {card.photographer_id != null && (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full mt-1 text-white" style={{ background: TEAL }}>Photographer</span>
                )}
              </div>

              <div className="mt-4">
                <Row label="Giới tính" value={genderLabel(card.gender)} />
                <Row label="Số lần đặt" value={String(card.total_bookings)} />
                <Row label="Số lần hủy" value={String(card.cancelled_bookings)} />
                <Row label="Lần thanh toán thành công" value={String(card.paid_bookings)} />
              </div>

              {card.photographer_id != null && onOpenPhotographer && (
                <button type="button"
                  onClick={() => { onClose(); onOpenPhotographer(card.photographer_id as number); }}
                  className="w-full mt-4 py-3 rounded-xl text-sm font-bold text-white"
                  style={{ background: TEAL }}>
                  Xem hồ sơ photographer
                </button>
              )}

              {me !== userId && (
                <button type="button" onClick={() => setReportOpen(true)}
                  className="w-full mt-3 py-3 rounded-xl text-sm font-bold border-2 flex items-center justify-center gap-2"
                  style={{ borderColor: "#ef4444", color: "#ef4444" }}>
                  <ReportIcon size={16} /> Báo cáo profile
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <ReportFlow
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetName={name}
        kind="profile"
        onSubmit={(r) => submitProfileReport({
          reportedUserId: userId, reportedName: name, subject: "profile", reason: r.reason, description: r.description,
        })}
        onDone={notify}
      />
    </>
  );
}
