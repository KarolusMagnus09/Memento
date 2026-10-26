import type { Photographer } from "../types";

/**
 * Mục "Nhiếp ảnh gia nổi bật" (Trang chủ) luôn hiện tối đa 10 người.
 * LƯU Ý: tiêu chí "đạt" chỉ dùng nội bộ — KHÔNG hiển thị ở bất kỳ đâu cho
 * khách hay nhiếp ảnh gia xem (không in ra UI, không đưa vào chữ mô tả).
 *
 * Cách chọn 10 người:
 *  1. Chưa ai đạt tiêu chí  → lấy 10 người có rating cao nhất.
 *  2. Có người đạt tiêu chí → người đạt luôn có mặt; các suất còn lại lấp bằng những người
 *     rating cao nhất trong số chưa đạt. (Tức là mỗi người đạt sẽ đẩy người kém nhất ra khỏi top 10.)
 *     Nếu có từ 10 người đạt trở lên → chỉ lấy 10 người đạt rating cao nhất.
 *  3. Cùng rating thì ai hoàn thành nhiều đơn (deal) hơn xếp trên; vẫn bằng thì nhiều đánh giá hơn.
 *  Danh sách trả về đã sắp theo thứ tự trên (rating giảm dần).
 *
 * "Đạt tiêu chí" = có TRÊN 10 đơn thành công (p.bookings = completed_deals từ RPC get_photographers_stats);
 * đúng 10 đơn chưa đủ.
 */
const MIN_COMPLETED_DEALS_EXCLUSIVE = 10;
const FEATURED_LIMIT = 10;

const deals = (p: Photographer) => Number(p.bookings) || 0;

/** rating giảm dần → số đơn thành công giảm dần → số đánh giá giảm dần */
function byRanking(a: Photographer, b: Photographer): number {
  return (
    (Number(b.rating) || 0) - (Number(a.rating) || 0) ||
    deals(b) - deals(a) ||
    (b.review_count ?? 0) - (a.review_count ?? 0)
  );
}

export function getFeaturedPhotographers(list: Photographer[]): Photographer[] {
  const qualified = list.filter((p) => deals(p) > MIN_COMPLETED_DEALS_EXCLUSIVE).sort(byRanking);
  if (qualified.length >= FEATURED_LIMIT) return qualified.slice(0, FEATURED_LIMIT);

  const rest = list
    .filter((p) => deals(p) <= MIN_COMPLETED_DEALS_EXCLUSIVE)
    .sort(byRanking)
    .slice(0, FEATURED_LIMIT - qualified.length);

  return [...qualified, ...rest].sort(byRanking);
}
