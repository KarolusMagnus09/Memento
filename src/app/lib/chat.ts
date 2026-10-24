import { supabase } from "./supabase";
import type { BookingRow } from "./bookings";

export type ConversationKind = "booking" | "admin";

/** Một dòng trong danh sách "Tin nhắn" */
export type ConversationItem = {
  conversation_id: string;
  kind: ConversationKind;
  partner_id: string | null;
  partner_name: string;
  partner_avatar: string | null;
  last_body: string | null;
  last_at: string;
  last_sender_id: string | null;
  unread_count: number;
  /** true = còn đơn hợp lệ giữa hai bên → được gửi tin; false = chỉ xem lại */
  can_send: boolean;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  recipient_id: string;
  sender_is_admin: boolean;
  body: string;
  created_at: string;
  read_at: string | null;
};

/** Thông tin App giữ khi mở màn Chat */
export type ChatTarget = {
  id: string;
  kind: ConversationKind;
  partnerName: string;
  partnerAvatar: string | null;
  canSend: boolean;
};

export const MAX_MESSAGE_LENGTH = 2000;
const PAGE_SIZE = 50;

/**
 * Đơn ở các trạng thái này KHÔNG mở được chat.
 * Đơn đã hoàn tất (completed) vẫn nhắn tiếp bình thường.
 * Phải khớp với hàm chat_pair_can_send trong 032_chat_realtime.sql.
 */
export const CHAT_BLOCKED_BOOKING_STATUSES: readonly string[] = ["rejected", "cancelled"];

export function bookingAllowsChat(status: string): boolean {
  return !CHAT_BLOCKED_BOOKING_STATUSES.includes(status);
}

export function conversationToTarget(c: ConversationItem): ChatTarget {
  return {
    id: c.conversation_id,
    kind: c.kind,
    partnerName: c.partner_name,
    partnerAvatar: c.partner_avatar,
    canSend: c.can_send,
  };
}

/** Dựng ChatTarget từ một đơn (nút "Chat" trong Lịch hẹn). */
export function bookingToChatTarget(b: BookingRow, userId: string | null, conversationId: string): ChatTarget {
  const iAmClient = userId === b.client_id;
  return {
    id: conversationId,
    kind: "booking",
    partnerName: (iAmClient ? b.photographer_name : b.client_name) || "Người dùng",
    partnerAvatar: (iAmClient ? b.photographer_avatar : b.client_avatar) ?? null,
    canSend: bookingAllowsChat(b.status),
  };
}

/* ───────────────────────── Gọi server ───────────────────────── */

export async function fetchConversations(): Promise<{ items: ConversationItem[]; error: string | null }> {
  const { data, error } = await supabase.rpc("list_my_conversations");
  if (error) return { items: [], error: error.message };
  return { items: Array.isArray(data) ? (data as ConversationItem[]) : [], error: null };
}

/** Mở (hoặc lấy) cuộc trò chuyện của một đơn. Chỉ 2 bên của đơn mới mở được. */
export async function openBookingChat(bookingId: string): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("open_booking_chat", { p_booking_id: bookingId });
  if (error || !data) return { id: null, error: error?.message || "Chưa mở được cuộc trò chuyện" };
  return { id: data as string, error: null };
}

/** Lấy tin mới nhất (tăng dần theo thời gian). `before` = tải thêm tin cũ hơn. */
export async function fetchMessages(
  conversationId: string,
  before?: string,
): Promise<{ messages: ChatMessage[]; hasMore: boolean; error: string | null }> {
  let q = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error || !data) return { messages: [], hasMore: false, error: error?.message || "Không tải được tin nhắn" };
  const rows = (data as ChatMessage[]).slice().reverse();
  return { messages: rows, hasMore: data.length === PAGE_SIZE, error: null };
}

export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<{ message: ChatMessage | null; error: string | null }> {
  const { data, error } = await supabase.rpc("send_message", {
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error || !data) return { message: null, error: error?.message || "Chưa gửi được tin nhắn" };
  return { message: data as ChatMessage, error: null };
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
}

/** Trả về chuỗi lỗi, hoặc null nếu gửi báo cáo thành công. */
export async function reportConversation(conversationId: string, description: string): Promise<string | null> {
  const { error } = await supabase.rpc("report_conversation", {
    p_conversation_id: conversationId,
    p_description: description,
  });
  return error ? error.message : null;
}

/** Tổng tin chưa đọc. Trả về null khi lỗi mạng (để UI giữ nguyên số cũ thay vì nhảy về 0). */
export async function fetchUnreadTotal(userId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (error) return null;
  return count ?? 0;
}

/* ───────────────────────── Realtime ───────────────────────── */

let channelSeq = 0;

/**
 * Realtime trong MỘT cuộc trò chuyện: tin mới (INSERT) và trạng thái "đã xem" (UPDATE).
 * `onResync` được gọi mỗi lần kết nối lại để bù tin bị lỡ lúc mất mạng.
 */
export function subscribeConversation(
  conversationId: string,
  handlers: {
    onInsert: (m: ChatMessage) => void;
    onUpdate: (m: ChatMessage) => void;
    onResync: () => void;
  },
): () => void {
  let first = true;
  const ch = supabase
    .channel(`chat:${conversationId}:${++channelSeq}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (p) => handlers.onInsert(p.new as ChatMessage),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (p) => handlers.onUpdate(p.new as ChatMessage),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (!first) handlers.onResync();
        first = false;
      }
    });
  return () => {
    supabase.removeChannel(ch);
  };
}

/**
 * Realtime "hộp thư đến": mọi tin gửi tới mình (INSERT) và khi tin của mình được đọc/cập nhật (UPDATE).
 * Dùng cho badge ở thanh dưới, thông báo nổi, và làm mới danh sách.
 * `onChange` cũng được gọi khi kết nối lại, để bù những gì bị lỡ.
 */
export function subscribeInbox(
  userId: string,
  handlers: {
    onIncoming: (m: ChatMessage) => void;
    onChange: () => void;
  },
): () => void {
  let first = true;
  const ch = supabase
    .channel(`inbox:${userId}:${++channelSeq}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${userId}` },
      (p) => {
        handlers.onIncoming(p.new as ChatMessage);
        handlers.onChange();
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "messages", filter: `recipient_id=eq.${userId}` },
      () => handlers.onChange(),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (!first) handlers.onChange();
        first = false;
      }
    });
  return () => {
    supabase.removeChannel(ch);
  };
}

/* ───────────────────────── Tiện ích hiển thị ───────────────────────── */

/**
 * Gộp tin vào danh sách: trùng id thì bản mới đè bản cũ (dùng cho cả tin mới lẫn cập nhật "đã xem"),
 * rồi sắp theo thời gian. Nhờ vậy tin vừa gửi (kết quả RPC) và tin từ Realtime không bị hiện 2 lần.
 */
export function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return Array.from(map.values()).sort((a, b) => {
    const d = Date.parse(a.created_at) - Date.parse(b.created_at);
    if (d !== 0) return d;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "14:05" */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Khóa theo ngày địa phương, dùng để chèn dòng ngăn cách ngày */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Hôm nay" / "Hôm qua" / "13/10/2026" */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return "Hôm nay";
  if (diffDays === 1) return "Hôm qua";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Giờ hiển thị trong danh sách hội thoại: "14:05" / "Hôm qua" / "T3" / "13/10" */
export function formatListTime(iso: string): string {
  const d = new Date(iso);
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return formatClock(iso);
  if (diffDays === 1) return "Hôm qua";
  if (diffDays < 7) return WEEKDAYS[d.getDay()];
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}
