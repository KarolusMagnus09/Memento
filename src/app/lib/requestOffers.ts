import { supabase } from "./supabase";
import { normalizeRow, type PhotoRequest } from "./photoRequests";

export type OfferStatus = "pending" | "chosen" | "rejected" | "withdrawn";

/** Một người nhận đơn, chủ đơn xem trong "Quản lý đơn" */
export type RequestOffer = {
  offer_id: string;
  photographer_user_id: string;
  photographer_id: number | null;
  name: string;
  avatar: string | null;
  price: number;
  message: string | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
};

export type MyOffer = { id: string; price: number; message: string | null; status: OfferStatus };

export const MAX_OFFER_MESSAGE = 500;

/** Câu lỗi từ Postgres (raise exception) → chỉ lấy phần chữ cho người dùng */
function cleanErr(msg: string | undefined) {
  return (msg || "Có lỗi xảy ra, thử lại nhé").replace(/^.*?ERROR:\s*/, "");
}

/** PTG: gửi đề nghị mới hoặc cập nhật giá / lời nhắn của đề nghị cũ */
export async function submitOffer(requestId: string, price: number, message: string): Promise<string | null> {
  const { error } = await supabase.rpc("submit_request_offer", {
    p_request_id: requestId,
    p_price: Math.round(price),
    p_message: message,
  });
  return error ? cleanErr(error.message) : null;
}

export async function withdrawOffer(requestId: string): Promise<string | null> {
  const { error } = await supabase.rpc("withdraw_request_offer", { p_request_id: requestId });
  return error ? cleanErr(error.message) : null;
}

/** Đề nghị hiện tại của mình cho 1 đơn (để mở lại thì điền sẵn giá cũ) */
export async function fetchMyOffer(requestId: string, userId: string): Promise<MyOffer | null> {
  const { data } = await supabase
    .from("photo_request_offers")
    .select("id, price, message, status")
    .eq("request_id", requestId)
    .eq("photographer_user_id", userId)
    .maybeSingle();
  if (!data || data.status === "withdrawn") return null;
  return { id: data.id, price: Number(data.price), message: data.message ?? null, status: data.status as OfferStatus };
}

/** Chủ đơn: danh sách người nhận đơn */
export async function fetchRequestOffers(requestId: string): Promise<{ rows: RequestOffer[]; error: string | null }> {
  const { data, error } = await supabase.rpc("list_request_offers", { p_request_id: requestId });
  if (error) return { rows: [], error: cleanErr(error.message) };
  const rows = (Array.isArray(data) ? data : []).map((x: any) => ({ ...x, price: Number(x.price) })) as RequestOffer[];
  return { rows, error: null };
}

/** Chủ đơn chốt 1 người → trả về id booking vừa tạo */
export async function chooseOffer(offerId: string): Promise<{ bookingId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("choose_request_offer", { p_offer_id: offerId });
  if (error || !data) return { bookingId: null, error: cleanErr(error?.message) };
  return { bookingId: data as string, error: null };
}

/* ───────── Đề nghị của tôi (tab "Bình luận của tôi") ───────── */

export type MyOfferItem = {
  offer_id: string;
  status: OfferStatus;
  price: number;
  message: string | null;
  created_at: string;
  updated_at: string;
  request: PhotoRequest;
};

export const MY_OFFERS_PAGE = 10;

export async function fetchMyOffers(page: number): Promise<{ rows: MyOfferItem[]; hasMore: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc("list_my_offers", { p_limit: MY_OFFERS_PAGE, p_offset: page * MY_OFFERS_PAGE });
  if (error) return { rows: [], hasMore: false, error: cleanErr(error.message) };
  const rows = (Array.isArray(data) ? data : []).map((x: any) => ({
    ...x, price: Number(x.price), request: normalizeRow(x.request),
  })) as MyOfferItem[];
  return { rows, hasMore: rows.length === MY_OFFERS_PAGE, error: null };
}

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  pending: "Đang chờ khách chọn",
  chosen: "Bạn đã được chọn",
  rejected: "Khách chọn người khác",
  withdrawn: "Đã rút",
};

/* ───────── Chat riêng cho đề nghị (trước khi chốt) ───────── */

export type OfferChatTarget = {
  offerId: string;
  title: string;
  partnerName: string;
  partnerAvatar: string | null;
  canSend: boolean;
};

export type OfferMessage = {
  id: string; offer_id: string; sender_id: string; recipient_id: string; body: string; created_at: string;
};

export const offerCanChat = (status: OfferStatus) => status === "pending" || status === "chosen";

export async function fetchOfferMessages(offerId: string): Promise<{ rows: OfferMessage[]; error: string | null }> {
  const { data, error } = await supabase
    .from("offer_messages").select("*").eq("offer_id", offerId)
    .order("created_at", { ascending: false }).limit(200);
  if (error) return { rows: [], error: cleanErr(error.message) };
  return { rows: ((data ?? []) as OfferMessage[]).reverse(), error: null };
}

export async function sendOfferMessage(offerId: string, body: string): Promise<{ message: OfferMessage | null; error: string | null }> {
  const { data, error } = await supabase.rpc("send_offer_message", { p_offer_id: offerId, p_body: body });
  if (error || !data) return { message: null, error: cleanErr(error?.message) };
  return { message: data as OfferMessage, error: null };
}

export function subscribeOfferMessages(offerId: string, onInsert: (m: OfferMessage) => void): () => void {
  const ch = supabase
    .channel(`offer-chat:${offerId}:${Math.random().toString(36).slice(2, 8)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "offer_messages", filter: `offer_id=eq.${offerId}` },
      (p) => onInsert(p.new as OfferMessage))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/* ───────── Tin chưa đọc của chat đề nghị (huy hiệu đỏ) ───────── */

export type OfferUnreadRow = { offer_id: string; request_id: string; as_owner: boolean; unread: number };

export type OfferUnread = {
  /** Tổng mọi tin chưa đọc (badge ở Trang chủ → Quản lý đơn) */
  total: number;
  /** Tin chưa đọc khi mình là chủ đơn (tab "Đơn của tôi") */
  ownerTotal: number;
  /** Tin chưa đọc khi mình là PTG (tab "Bình luận của tôi") */
  ptgTotal: number;
  /** Chủ đơn: theo từng đơn (nút "Người nhận đơn") */
  byRequest: Record<string, number>;
  /** Theo từng đề nghị (nút "Chat") */
  byOffer: Record<string, number>;
};

export const EMPTY_OFFER_UNREAD: OfferUnread = { total: 0, ownerTotal: 0, ptgTotal: 0, byRequest: {}, byOffer: {} };

export function summarizeUnread(rows: OfferUnreadRow[]): OfferUnread {
  const u: OfferUnread = { total: 0, ownerTotal: 0, ptgTotal: 0, byRequest: {}, byOffer: {} };
  for (const r of rows) {
    const n = Number(r.unread) || 0;
    u.total += n;
    u.byOffer[r.offer_id] = (u.byOffer[r.offer_id] || 0) + n;
    if (r.as_owner) {
      u.ownerTotal += n;
      u.byRequest[r.request_id] = (u.byRequest[r.request_id] || 0) + n;
    } else u.ptgTotal += n;
  }
  return u;
}

export async function fetchOfferUnread(): Promise<OfferUnread | null> {
  const { data, error } = await supabase.rpc("offer_unread_counts");
  if (error) return null; // giữ số cũ khi lỗi mạng
  return summarizeUnread((Array.isArray(data) ? data : []) as OfferUnreadRow[]);
}

export async function markOfferRead(offerId: string): Promise<void> {
  await supabase.rpc("mark_offer_read", { p_offer_id: offerId });
}

/** Có tin mới gửi cho mình (mọi đề nghị) */
export function subscribeOfferInbox(userId: string, onMessage: () => void): () => void {
  const ch = supabase
    .channel(`offer-inbox:${userId}:${Math.random().toString(36).slice(2, 8)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "offer_messages", filter: `recipient_id=eq.${userId}` }, () => onMessage())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
