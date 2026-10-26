import { X } from "lucide-react";
import { TEAL } from "../../constants";
import { notifIcon, type AppNotification } from "../../lib/notifications";

/** Popup nổi báo có thông báo mới (đơn hàng, thanh toán...). Bấm vào để mở đúng màn liên quan. */
export function NotifToast({
  toast,
  onOpen,
  onClose,
}: {
  toast: AppNotification;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-sm z-[70]"
      role="status"
      aria-live="polite"
    >
      <div className="bg-white rounded-2xl border border-border shadow-lg flex items-center gap-3 pl-3 pr-2 py-2.5">
        <button type="button" onClick={onOpen} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <span
            className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: "#e8f3ef" }}
          >
            {notifIcon(toast.type)}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: TEAL }}>{toast.title}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{toast.body}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
