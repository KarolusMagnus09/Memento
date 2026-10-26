import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchNotifications,
  fetchUnreadCounts,
  markNotificationsRead,
  subscribeNotifications,
  typeAllowedByPrefs,
  type AppNotification,
  type NotifTab,
} from "../lib/notifications";
import { loadNotifPrefs } from "../lib/notifPrefs";

/**
 * Chạy ở App (khi đã đăng nhập). Phải gọi TRƯỚC mọi `return` sớm trong App.
 *  • unreadBookings: số chưa đọc cho tab "Lịch hẹn"
 *  • unreadMessages: số thông báo hệ thống chưa đọc (cộng với tin chat ở App)
 *  • toast: popup khi có thông báo mới
 *  • items: danh sách thông báo (hiện trong Tin nhắn → Thông báo)
 */
export function useNotifications(userId: string | null) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [counts, setCounts] = useState({ bookings: 0, messages: 0 });
  const [toast, setToast] = useState<AppNotification | null>(null);
  const [loaded, setLoaded] = useState(false);

  const toastTimer = useRef<number | undefined>(undefined);
  const refreshTimer = useRef<number | undefined>(undefined);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const my = ++seq.current;
    if (!userId) {
      setItems([]);
      setCounts({ bookings: 0, messages: 0 });
      return;
    }
    const [list, c] = await Promise.all([fetchNotifications(userId), fetchUnreadCounts(userId)]);
    if (my !== seq.current) return; // đã có lần tải mới hơn
    if (list) setItems(list);
    if (c) setCounts(c);
    setLoaded(true);
  }, [userId]);

  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  useEffect(() => {
    if (!userId) {
      seq.current++;
      setItems([]);
      setCounts({ bookings: 0, messages: 0 });
      setToast(null);
      setLoaded(false);
      return;
    }
    void refresh();

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => void refresh(), 250);
    };

    const off = subscribeNotifications(userId, {
      onInsert: (n) => {
        if (!typeAllowedByPrefs(n.type, loadNotifPrefs())) return;
        setToast(n);
        window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), 6000);
      },
      onChange: scheduleRefresh,
    });

    const onVisible = () => { if (!document.hidden) void refresh(); };
    const onOnline = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      off();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(refreshTimer.current);
    };
  }, [userId, refresh]);

  /** Đánh dấu đã đọc (lạc quan: cập nhật giao diện ngay, rồi gọi server) */
  const markRead = useCallback(
    async (opts: { ids?: string[]; tab?: NotifTab } = {}) => {
      const now = new Date().toISOString();
      const hit = (n: AppNotification) =>
        !n.read_at && (!opts.ids || opts.ids.includes(n.id)) && (!opts.tab || n.tab === opts.tab);
      let b = 0;
      let m = 0;
      setItems((prev) =>
        prev.map((n) => {
          if (!hit(n)) return n;
          if (n.tab === "bookings") b++; else m++;
          return { ...n, read_at: now };
        }),
      );
      setCounts((c) => ({ bookings: Math.max(0, c.bookings - b), messages: Math.max(0, c.messages - m) }));
      await markNotificationsRead(opts);
      void refresh();
    },
    [refresh],
  );

  return {
    items,
    loaded,
    unreadBookings: counts.bookings,
    unreadMessages: counts.messages,
    toast,
    dismissToast,
    markRead,
    refresh,
  };
}
