import { ChevronLeft, Star, MoreVertical, Flag } from "lucide-react";
import type { Screen, Photographer } from "../types";
import { TEAL, TEAL_LIGHT, BG } from "../constants";
import { Avatar } from "../components/shared/Avatar";
import { useEffect, useState } from "react";
import {
  fetchReviews,
  fetchReviewSummary,
  reportReview,
  EMPTY_SUMMARY,
  type ReviewRow,
  type ReviewSummary,
} from "../lib/social";

function StarRow({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          fill={i <= rating ? "#f59e0b" : "none"}
          stroke={i <= rating ? "#f59e0b" : "#d1d5db"}
        />
      ))}
    </div>
  );
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ReviewCard({
  r,
  onReport,
}: {
  r: ReviewRow;
  onReport: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState(false);
  const long = (r.comment || "").length > 160;
  const text = !long || expanded ? r.comment : r.comment.slice(0, 160) + "…";

  return (
    <div className="bg-white rounded-2xl p-4 border border-border relative">
      <div className="flex items-start gap-3 mb-2">
        <Avatar src={r.reviewer_avatar} size={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-bold text-sm truncate">{r.reviewer_name || "Người dùng"}</p>
            {r.has_deal && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#ecfdf5", color: TEAL }}>
                Đã đặt lịch
              </span>
            )}
          </div>
          <StarRow rating={r.rating} size={12} />
          <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(r.created_at)}</p>
        </div>
      </div>

      {r.comment ? (
        <div
          className={`text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap ${
            expanded || long ? "mt-1" : ""
          }`}
          style={expanded ? { minHeight: 48 } : undefined}
        >
          {text}
          {long && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="ml-1 font-semibold text-xs"
              style={{ color: TEAL }}
            >
              {expanded ? "Thu gọn" : "Xem thêm"}
            </button>
          )}
        </div>
      ) : null}

      {/* 3 chấm góc phải dưới */}
      <div className="flex justify-end mt-2 relative">
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          className="p-1.5 rounded-full hover:bg-muted"
          aria-label="Tùy chọn"
        >
          <MoreVertical size={16} className="text-muted-foreground" />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="absolute right-0 bottom-8 z-50 bg-white rounded-xl shadow-lg border border-border py-1 min-w-[140px]">
              <button
                type="button"
                className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-muted"
                onClick={() => {
                  setMenu(false);
                  onReport(r.id);
                }}
              >
                <Flag size={14} className="text-red-500" /> Report Abuse
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ReviewsListScreen({
  photographer,
  setScreen,
}: {
  photographer: Photographer;
  setScreen: (s: Screen) => void;
}) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [summary, setSummary] = useState<ReviewSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "5" | "4" | "3">("all");
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("Nội dung không phù hợp");
  const [reportDesc, setReportDesc] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [list, sum] = await Promise.all([
        fetchReviews(photographer.id, 50, 0),
        fetchReviewSummary(photographer.id),
      ]);
      if (!cancelled) {
        setRows(list);
        setSummary(sum);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photographer.id]);

  const filtered = rows.filter((r) => {
    if (filter === "all") return true;
    return r.rating === Number(filter);
  });

  const total = summary.count || 1;
  const pct = (n: number) => Math.round((n / total) * 100);

  async function doReport() {
    if (!reportId) return;
    setReportBusy(true);
    const err = await reportReview(reportId, reportReason, reportDesc.trim());
    setReportBusy(false);
    if (err) {
      setToast(err);
    } else {
      setToast("Đã gửi báo cáo");
      setReportId(null);
      setReportDesc("");
    }
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="flex flex-col min-h-full pb-8" style={{ background: BG }}>
      <div className="px-4 py-4 flex items-center gap-3 sticky top-0 z-10" style={{ background: TEAL }}>
        <button type="button" onClick={() => setScreen("photographer-profile")} className="text-white">
          <ChevronLeft size={22} />
        </button>
        <h2 className="font-bold text-white text-base">Đánh giá</h2>
      </div>

      <div className="px-4 py-4">
        {/* Summary */}
        <div className="bg-white rounded-2xl p-4 border border-border mb-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-black" style={{ color: TEAL }}>
                {summary.average ? summary.average.toFixed(1) : "—"}
              </p>
              <StarRow rating={Math.round(summary.average)} size={14} />
              <p className="text-xs text-muted-foreground mt-1">{summary.count} đánh giá</p>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              {[5, 4, 3, 2, 1].map((stars) => {
                const c = summary.breakdown[String(stars) as "1" | "2" | "3" | "4" | "5"] || 0;
                return (
                  <div key={stars} className="flex items-center gap-2">
                    <span className="text-xs w-2">{stars}</span>
                    <Star size={10} fill="#f59e0b" stroke="#f59e0b" />
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct(c)}%`, background: TEAL_LIGHT }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{c}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 no-scrollbar">
          {(
            [
              ["all", "Tất cả"],
              ["5", "5 ⭐"],
              ["4", "4 ⭐"],
              ["3", "3 ⭐"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold border transition-all"
              style={{
                background: filter === id ? TEAL : "white",
                color: filter === id ? "white" : TEAL,
                borderColor: filter === id ? TEAL : "var(--border)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setScreen("write-review")}
          className="w-full mb-4 py-3 rounded-xl text-sm font-bold text-white"
          style={{ background: TEAL }}
        >
          Viết đánh giá
        </button>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Đang tải…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Chưa có đánh giá</p>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((r) => (
              <ReviewCard key={r.id} r={r} onReport={setReportId} />
            ))}
          </div>
        )}
      </div>

      {/* Report modal */}
      {reportId && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setReportId(null)}
        >
          <div
            className="bg-white rounded-t-3xl w-full max-w-sm p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-base mb-3">Report Abuse</h3>
            <p className="text-xs text-muted-foreground mb-2">Lý do</p>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm mb-3"
            >
              <option>Nội dung không phù hợp</option>
              <option>Spam / quảng cáo</option>
              <option>Ngôn từ thù địch</option>
              <option>Thông tin sai sự thật</option>
              <option>Khác</option>
            </select>
            <textarea
              value={reportDesc}
              onChange={(e) => setReportDesc(e.target.value)}
              placeholder="Mô tả thêm (tuỳ chọn)"
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm min-h-[80px] mb-3"
            />
            <button
              type="button"
              disabled={reportBusy}
              onClick={doReport}
              className="w-full py-3 rounded-xl text-sm font-bold text-white"
              style={{ background: "#ef4444" }}
            >
              {reportBusy ? "Đang gửi…" : "Gửi báo cáo"}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[90] bg-black/80 text-white text-xs px-4 py-2 rounded-full">
          {toast}
        </div>
      )}
    </div>
  );
}
