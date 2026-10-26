import { supabase } from "./supabase";

export type NotifTab = "bookings" | "messages";

export type AppNotification = {
  id: string;
  user_id: string;
  type: string;
  tab: NotifTab;
  title: string;
  body: string;
  booking_id: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

/** Tối đa tải về 100 thông báo gần nhất cho danh sách */
const LIST_LIMIT = 100;

export async function fetchNotifications(userId: string): Promise<AppNotification[] | null> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) {
    console.warn("[notifications] fetch", error.message);
    return null;
  }
  return (data ?? []) as AppNotification[];
}

/** Đếm chưa đọc theo tab (đếm trên server → đúng cả khi có hơn 100 thông báo) */
export async function fetchUnreadCounts(userId: string): Promise<{ bookings: number; messages: number } | null> {
  const count = async (tab: NotifTab) => {
    const { count: n, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("tab", tab)
      .is("read_at", null);
    return error ? null : (n ?? 0);
  };
  const [b, m] = await Promise.all([count("bookings"), count("messages")]);
  if (b === null || m === null) return null;
  return { bookings: b, messages: m };
}

export async function markNotificationsRead(opts: { ids?: string[]; tab?: NotifTab } = {}): Promise<void> {
  const { error } = await supabase.rpc("mark_notifications_read", {
    p_ids: opts.ids ?? null,
    p_tab: opts.tab ?? null,
  });
  if (error) console.warn("[notifications] markRead", error.message);
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) console.warn("[notifications] delete", error.message);
}

/** Realtime: có thông báo mới (INSERT) hoặc đổi trạng thái đọc (UPDATE) */
export function subscribeNotifications(
  userId: string,
  handlers: { onInsert: (n: AppNotification) => void; onChange: () => void },
): () => void {
  let first = true;
  const ch = supabase
    .channel(`notif:${userId}:${Math.random().toString(36).slice(2, 8)}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (p) => {
        handlers.onInsert(p.new as AppNotification);
        handlers.onChange();
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      () => handlers.onChange(),
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      () => handlers.onChange(),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (!first) handlers.onChange(); // kết nối lại → bù những gì bị lỡ
        first = false;
      }
    });
  return () => {
    supabase.removeChannel(ch);
  };
}

/** Thông báo này có nên hiện popup theo cài đặt trong app không */
export function typeAllowedByPrefs(type: string, prefs: { master: boolean; orderAccepted: boolean }): boolean {
  if (!prefs.master) return false;
  if (type === "booking_accepted" && !prefs.orderAccepted) return false;
  return true;
}

export function formatNotifTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Vừa xong";
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ trước`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} ngày trước`;
  return d.toLocaleDateString("vi-VN");
}

/** Emoji nhỏ cho từng loại để danh sách dễ nhìn */
export function notifIcon(type: string): string {
  if (type === "request_offer_message") return "💬";
  if (type === "request_offer_withdrawn") return "↩️";
  if (type.startsWith("request_offer")) return type === "request_offer_chosen" ? "🎉" : "🙋";
  if (type.startsWith("booking_new")) return "📩";
  if (type === "booking_accepted") return "🎉";
  if (type === "booking_rejected" || type === "booking_cancelled") return "❌";
  if (type.startsWith("payment") || type === "admin_paid") return "💳";
  if (type === "ptg_advance" || type === "ptg_final") return "💸";
  if (type.startsWith("shoot_")) return "📷";
  if (type.startsWith("final_")) return "✅";
  if (type === "handover") return "📸";
  if (type === "feedback_new") return "✏️";
  if (type === "completed") return "✅";
  if (type.startsWith("admin_")) return "🛎️";
  return "🔔";
}
