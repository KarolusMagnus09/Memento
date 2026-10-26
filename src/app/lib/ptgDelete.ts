import { supabase } from "./supabase";

export type BlockerBooking = { id: string; name: string | null; date: string | null; status: string; client: string | null; source: "direct" | "request" };
export type BlockerOffer = { offer_id: string; request_id: string; title: string | null; price: number; requester: string | null };

export type PtgDeleteBlockers = { bookings: BlockerBooking[]; offers: BlockerOffer[] };

export const BOOKING_STATUS_VI: Record<string, string> = {
  pending: "Chờ PTG xác nhận",
  confirmed: "Chờ thanh toán",
  processing: "Đang xử lý thanh toán",
  deposit_paid: "Đã đặt cọc",
  active: "Đang thực hiện",
  handover: "Đã bàn giao, chờ xác nhận",
  closing: "Đang chốt hoàn tất",
  final_payment: "Chờ thanh toán cuối",
  paid: "Đã thanh toán",
};

/** Đơn đang làm + đề nghị đang chờ của PTG hiện tại. `null` khi chưa kiểm tra được (server vẫn chặn khi xóa). */
export async function fetchPtgDeleteBlockers(): Promise<PtgDeleteBlockers | null> {
  const { data, error } = await supabase.rpc("ptg_delete_blockers");
  if (error || !data) return null;
  const d = data as Partial<PtgDeleteBlockers>;
  return {
    bookings: Array.isArray(d.bookings) ? d.bookings : [],
    offers: Array.isArray(d.offers) ? d.offers.map((o) => ({ ...o, price: Number(o.price) })) : [],
  };
}
