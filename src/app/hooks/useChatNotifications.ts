import { useCallback, useEffect, useRef, useState } from "react";
import {
  conversationToTarget,
  fetchConversations,
  fetchUnreadTotal,
  subscribeInbox,
  type ChatMessage,
  type ChatTarget,
  type ConversationItem,
} from "../lib/chat";
import { messageNotifEnabled } from "../lib/notifPrefs";

export type ChatToastData = {
  key: string;
  title: string;
  body: string;
  avatar: string | null;
  target: ChatTarget;
};

/** Danh sách hội thoại chỉ cần để lấy tên/avatar cho toast — dùng lại trong 60 giây */
const CACHE_MS = 60_000;

/**
 * Chạy ở App (khi đã đăng nhập). LƯU Ý: phải gọi TRƯỚC mọi `return` sớm trong App.
 *  • unread: tổng tin chưa đọc → badge "Tin nhắn" ở thanh dưới (realtime)
 *  • toast: banner nổi khi có tin mới mà mình không đang mở đúng cuộc trò chuyện đó
 *  • thông báo của trình duyệt khi tab đang ẩn (nếu đã cấp quyền)
 */
export function useChatNotifications(userId: string | null, openConversationId: string | null) {
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<ChatToastData | null>(null);

  const openRef = useRef(openConversationId);
  openRef.current = openConversationId;

  const toastTimer = useRef<number | undefined>(undefined);
  const unreadTimer = useRef<number | undefined>(undefined);
  const unreadSeq = useRef(0);

  /** Đếm ngay. Bỏ qua kết quả cũ nếu đã có lần đếm mới hơn (tránh số nhảy lung tung). */
  const refreshUnread = useCallback(async () => {
    const seq = ++unreadSeq.current;
    if (!userId) {
      setUnread(0);
      return;
    }
    const n = await fetchUnreadTotal(userId);
    if (n === null || seq !== unreadSeq.current) return;
    setUnread(n);
  }, [userId]);

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!userId) {
      unreadSeq.current++;
      setUnread(0);
      setToast(null);
      return;
    }

    void refreshUnread();

    // Đánh dấu đã đọc 1 cuộc có thể bắn nhiều sự kiện UPDATE liên tiếp → gộp lại thành 1 lần đếm
    const scheduleRefresh = () => {
      window.clearTimeout(unreadTimer.current);
      unreadTimer.current = window.setTimeout(() => void refreshUnread(), 300);
    };

    let cache: { at: number; items: ConversationItem[] } = { at: 0, items: [] };
    const findConversation = async (id: string): Promise<ConversationItem | undefined> => {
      if (Date.now() - cache.at < CACHE_MS) {
        const hit = cache.items.find((c) => c.conversation_id === id);
        if (hit) return hit;
      }
      const { items, error } = await fetchConversations();
      if (!error) cache = { at: Date.now(), items };
      return items.find((c) => c.conversation_id === id);
    };

    const onIncoming = async (m: ChatMessage) => {
      if (m.sender_id === userId) return;
      if (openRef.current === m.conversation_id) return; // đang mở đúng cuộc này → không báo
      if (!messageNotifEnabled()) return;

      const conv = await findConversation(m.conversation_id);
      if (!conv) return;
      const data: ChatToastData = {
        key: m.id,
        title: conv.partner_name,
        body: m.body.length > 90 ? `${m.body.slice(0, 90)}…` : m.body,
        avatar: conv.partner_avatar,
        target: conversationToTarget(conv),
      };

      if (typeof document !== "undefined" && document.hidden) {
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(`Tin nhắn mới từ ${data.title}`, { body: data.body, tag: m.conversation_id });
          }
        } catch {
          /* ignore */
        }
      } else {
        setToast(data);
        window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), 5000);
      }
    };

    const off = subscribeInbox(userId, { onIncoming: (m) => void onIncoming(m), onChange: scheduleRefresh });

    // Bù số chưa đọc khi quay lại tab / có mạng lại
    const onVisible = () => {
      if (!document.hidden) void refreshUnread();
    };
    const onOnline = () => void refreshUnread();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      off();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(unreadTimer.current);
    };
  }, [userId, refreshUnread]);

  return { unread, toast, dismissToast, refreshUnread };
}
