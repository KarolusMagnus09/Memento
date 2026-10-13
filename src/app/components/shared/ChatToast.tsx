import { X } from "lucide-react";
import { TEAL } from "../../constants";
import { Avatar } from "./Avatar";
import type { ChatToastData } from "../../hooks/useChatNotifications";

/** Banner nổi báo có tin nhắn mới. Bấm vào để mở đúng cuộc trò chuyện. */
export function ChatToast({
  toast,
  onOpen,
  onClose,
}: {
  toast: ChatToastData;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-sm z-[60]"
      role="status"
      aria-live="polite"
    >
      <div className="bg-white rounded-2xl border border-border shadow-lg flex items-center gap-3 pl-3 pr-2 py-2.5">
        <button type="button" onClick={onOpen} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          {toast.target.kind === "admin" ? (
            <span
              className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0"
              style={{ background: TEAL }}
            >
              M
            </span>
          ) : (
            <Avatar src={toast.avatar} size={38} />
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: TEAL }}>{toast.title}</p>
            <p className="text-xs text-muted-foreground truncate">{toast.body}</p>
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
