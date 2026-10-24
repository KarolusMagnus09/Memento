import { ChevronLeft, Star } from "lucide-react";
import type { Screen, Photographer } from "../types";
import { TEAL, BG } from "../constants";
import { Avatar } from "../components/shared/Avatar";
import { useState } from "react";
import { submitReview } from "../lib/social";

export default function WriteReviewScreen({
  photographer,
  setScreen,
}: {
  photographer: Photographer;
  setScreen: (s: Screen) => void;
}) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const labels = ["", "Rất tệ", "Không tốt", "Bình thường", "Tốt", "Tuyệt vời"];

  async function handleSubmit() {
    if (rating < 1 || busy) return;
    setBusy(true);
    setErr(null);
    const msg = await submitReview(photographer.id, rating, text.trim());
    setBusy(false);
    if (msg) {
      setErr(msg);
      return;
    }
    setDone(true);
    setTimeout(() => setScreen("photographer-profile"), 900);
  }

  return (
    <div className="flex flex-col min-h-full" style={{ background: BG }}>
      <div className="px-4 py-4 flex items-center gap-3 sticky top-0 z-10" style={{ background: TEAL }}>
        <button type="button" onClick={() => setScreen("photographer-profile")} className="text-white">
          <ChevronLeft size={22} />
        </button>
        <h2 className="font-bold text-white text-base">Viết đánh giá</h2>
      </div>

      <div className="px-4 py-5 flex flex-col gap-5">
        <div className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-border">
          <Avatar src={photographer.avatar} size={48} />
          <div>
            <p className="font-bold text-sm">{photographer.name}</p>
            <p className="text-xs text-muted-foreground">Chia sẻ trải nghiệm của bạn</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-border text-center">
          <p className="text-sm font-semibold mb-3">Bạn chấm bao nhiêu sao?</p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => setRating(i)}
                className="p-1"
              >
                <Star
                  size={32}
                  fill={(hovered || rating) >= i ? "#f59e0b" : "none"}
                  stroke={(hovered || rating) >= i ? "#f59e0b" : "#d1d5db"}
                />
              </button>
            ))}
          </div>
          {(hovered || rating) > 0 && (
            <p className="text-sm mt-2 font-medium" style={{ color: TEAL }}>
              {labels[hovered || rating]}
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 border border-border">
          <label className="text-sm font-semibold mb-2 block">Mô tả trải nghiệm</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={1000}
            placeholder="Ví dụ: Chụp rất chuyên nghiệp, đúng giờ, ảnh đẹp..."
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm min-h-[120px] resize-y"
          />
          <p className="text-[11px] text-muted-foreground text-right mt-1">{text.length}/1000</p>
        </div>

        {err && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{err}</p>
        )}
        {done && (
          <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2">Đã gửi đánh giá!</p>
        )}

        <button
          type="button"
          disabled={rating === 0 || busy}
          onClick={handleSubmit}
          className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
          style={{ background: TEAL }}
        >
          {busy ? "Đang gửi..." : "Gửi đánh giá"}
        </button>
      </div>
    </div>
  );
}
