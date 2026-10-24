import { useBackHandler } from "../../lib/backNavigation";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Edit3, Star, Trash2, MoreVertical, Flag } from "lucide-react";
import type { Photographer } from "../../types";
import { TEAL, TEAL_LIGHT } from "../../constants";
import { supabase } from "../../lib/supabase";
import {
  deleteMyReview,
  fetchReviews,
  reportReview,
  submitReview,
  type ReviewRow,
  type ReviewSummary,
} from "../../lib/social";
import { Avatar } from "./Avatar";
import { StarRow } from "./StarRow";
import { ScrollText } from "./ScrollText";
import { ReportFlow, ReportIcon } from "./ReportFlow";
import { UserCardModal } from "./UserCardModal";

const PAGE = 10;
const STAR_LABELS = ["", "Tệ", "Không tốt", "Bình thường", "Tốt", "Tuyệt vời!"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN");
}
function wasEdited(r: ReviewRow) {
  return new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() > 60_000;
}

/**
 * Tab "Đánh giá" thật của hồ sơ photographer:
 * - Mỗi tài khoản có 1 đánh giá cho mỗi photographer (được sửa/xóa), lưu trên server.
 * - Hiện tên người bình luận; bấm vào để xem thẻ thông tin (nếu họ là photographer thì có nút xem hồ sơ).
 * - Chủ hồ sơ (photographer) có nút báo cáo bình luận để bên mình xử lý.
 */
export function ReviewsSection({
  photographer, isOwner, summary, onChanged, onOpenPhotographer, notify,
}: {
  photographer: Photographer;
  isOwner: boolean;
  summary: ReviewSummary;
  /** Gọi sau khi gửi/sửa/xóa để hồ sơ tải lại điểm trung bình */
  onChanged: () => void;
  onOpenPhotographer?: (photographerId: number) => void;
  notify: (msg: string) => void;
}) {
  const [me, setMe] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [cardUserId, setCardUserId] = useState<string | null>(null);
  const [reportRow, setReportRow] = useState<ReviewRow | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  useBackHandler(menuId !== null, () => setMenuId(null));

  const pid = photographer.id;
  const mine = summary.my_review;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    const list = await fetchReviews(pid, PAGE, 0);
    setRows(list);
    setHasMore(list.length === PAGE);
    setLoading(false);
  }, [pid]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  async function loadMore() {
    const list = await fetchReviews(pid, PAGE, rows.length);
    setRows((prev) => [...prev, ...list]);
    setHasMore(list.length === PAGE);
  }

  function openForm() {
    setRating(mine?.rating ?? 0);
    setComment(mine?.comment ?? "");
    setFormOpen(true);
  }

  async function save() {
    if (rating < 1) return notify("Hãy chọn số sao trước khi gửi");
    setSaving(true);
    const err = await submitReview(pid, rating, comment.trim());
    setSaving(false);
    if (err) return notify(err);
    notify(mine ? "Đã cập nhật đánh giá của bạn" : "Cảm ơn bạn đã đánh giá!");
    setFormOpen(false);
    await loadFirst();
    onChanged();
  }

  async function removeMine() {
    if (!confirm("Bạn muốn xóa đánh giá của mình?")) return;
    const err = await deleteMyReview(pid);
    if (err) return notify(err);
    notify("Đã xóa đánh giá");
    setFormOpen(false);
    await loadFirst();
    onChanged();
  }

  const total = summary.count;

  return (
    <div className="mt-4">
      {/* Tổng quan */}
      <div className="bg-white rounded-2xl p-4 border border-border mb-3">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground text-center">Chưa có đánh giá nào</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-4xl font-black" style={{ color: TEAL }}>{summary.average.toFixed(1)}</p>
              <StarRow rating={summary.average} size={13} />
              <p className="text-[11px] text-muted-foreground mt-1">{total} đánh giá</p>
            </div>
            <div className="flex-1">
              {([5, 4, 3, 2, 1] as const).map((s) => {
                const c = summary.breakdown[String(s) as "1" | "2" | "3" | "4" | "5"] || 0;
                return (
                  <div key={s} className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] w-2">{s}</span>
                    <Star size={10} fill="#f59e0b" stroke="#f59e0b" />
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${total ? (c / total) * 100 : 0}%`, background: TEAL_LIGHT }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground w-5 text-right">{c}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Viết / sửa đánh giá của mình */}
      {!isOwner && me && !formOpen && (
        <>
          {mine?.hidden ? (
            <p className="text-xs text-red-600 mb-3 leading-relaxed">
              Đánh giá của bạn đang bị ẩn do vi phạm quy định cộng đồng nên không thể chỉnh sửa.
            </p>
          ) : (
            <button type="button" onClick={openForm}
              className="w-full mb-3 py-3.5 rounded-2xl font-bold border-2 flex items-center justify-center gap-2 active:scale-95 transition-transform"
              style={{ borderColor: TEAL_LIGHT, color: TEAL, background: `${TEAL_LIGHT}15` }}>
              <Edit3 size={18} strokeWidth={2} style={{ color: TEAL_LIGHT }} />
              {mine ? "Sửa đánh giá của bạn" : "Viết đánh giá của bạn"}
            </button>
          )}
        </>
      )}
      {!isOwner && !me && (
        <p className="text-xs text-muted-foreground mb-3 text-center">Đăng nhập để viết đánh giá.</p>
      )}

      {formOpen && (
        <div className="bg-white rounded-2xl p-4 border border-border mb-3">
          <p className="font-bold text-sm mb-2" style={{ color: TEAL }}>Bạn đánh giá như thế nào?</p>
          <div className="flex gap-2 mb-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" aria-label={`${i} sao`}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)} onClick={() => setRating(i)}>
                <Star size={32} strokeWidth={1.5}
                  fill={(hover || rating) >= i ? "#f59e0b" : "none"}
                  stroke={(hover || rating) >= i ? "#f59e0b" : "#d1d5db"} />
              </button>
            ))}
          </div>
          {(hover || rating) > 0 && (
            <p className="text-xs font-bold mb-2" style={{ color: "#f59e0b" }}>{STAR_LABELS[hover || rating]}</p>
          )}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            placeholder="Chia sẻ trải nghiệm của bạn (không bắt buộc)..."
            className="w-full bg-muted rounded-xl p-3 text-sm outline-none resize-none h-28 overflow-y-auto"
            style={{ overflowWrap: "anywhere" }}
          />
          <p className="text-xs text-muted-foreground text-right mt-1">{comment.length}/500</p>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => setFormOpen(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2" style={{ borderColor: TEAL, color: TEAL }}>
              Hủy
            </button>
            <button type="button" disabled={saving || rating < 1} onClick={save}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: TEAL }}>
              {saving ? "Đang gửi..." : mine ? "Lưu thay đổi" : "Gửi đánh giá"}
            </button>
          </div>
          {mine && (
            <button type="button" onClick={removeMine}
              className="w-full mt-2 py-2 text-xs font-bold flex items-center justify-center gap-1.5 text-red-600">
              <Trash2 size={14} /> Xóa đánh giá của mình
            </button>
          )}
        </div>
      )}

      {/* Danh sách */}
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-6">Đang tải đánh giá...</p>
      ) : rows.length === 0 ? null : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl p-4 border border-border">
              <div className="flex items-center gap-3 mb-2">
                <button type="button" onClick={() => setCardUserId(r.reviewer_id)} aria-label={`Xem thông tin ${r.reviewer_name}`}>
                  <Avatar src={r.reviewer_avatar} size={36} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button type="button" onClick={() => setCardUserId(r.reviewer_id)}
                      className="font-bold text-sm text-left break-words max-w-full" style={{ overflowWrap: "anywhere" }}>
                      {r.reviewer_name}
                    </button>
                    {r.has_deal && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold" style={{ color: TEAL_LIGHT }}>
                        <CheckCircle size={11} strokeWidth={2.5} /> Đã chụp cùng
                      </span>
                    )}
                    {r.reviewer_is_photographer && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: TEAL }}>PTG</span>
                    )}
                  </div>
                  <StarRow rating={r.rating} size={11} />
                </div>
                <span className="text-[11px] text-muted-foreground flex-shrink-0">{fmtDate(r.created_at)}</span>
              </div>

              {r.comment && (
                <ScrollText maxHeightClass="max-h-60" className="text-sm text-muted-foreground leading-relaxed">
                  {r.comment}
                </ScrollText>
              )}

              <div className="flex items-center justify-between mt-2 relative">
                <span className="text-[11px] text-muted-foreground">{wasEdited(r) ? "Đã chỉnh sửa" : ""}</span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuId(menuId === r.id ? null : r.id)}
                    className="p-1.5 rounded-full hover:bg-muted"
                    aria-label="Tùy chọn"
                  >
                    <MoreVertical size={16} className="text-muted-foreground" />
                  </button>
                  {menuId === r.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuId(null)} />
                      <div className="absolute right-0 bottom-8 z-50 bg-white rounded-xl shadow-lg border border-border py-1 min-w-[150px]">
                        <button
                          type="button"
                          className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-muted"
                          onClick={() => {
                            setMenuId(null);
                            setReportRow(r);
                          }}
                        >
                          <Flag size={14} className="text-red-500" /> Report Abuse
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {hasMore && (
            <button type="button" onClick={loadMore} className="text-xs font-bold py-2" style={{ color: TEAL }}>
              Xem thêm đánh giá
            </button>
          )}
        </div>
      )}

      {cardUserId && (
        <UserCardModal
          userId={cardUserId}
          me={me}
          onClose={() => setCardUserId(null)}
          onOpenPhotographer={onOpenPhotographer}
          notify={notify}
        />
      )}

      <ReportFlow
        open={!!reportRow}
        onClose={() => setReportRow(null)}
        targetName={reportRow ? `Bình luận của ${reportRow.reviewer_name}` : undefined}
        kind="review"
        onSubmit={(r) => (reportRow ? reportReview(reportRow.id, r.reason, r.description) : Promise.resolve("Không có bình luận"))}
        onDone={notify}
      />
    </div>
  );
}
