import { useCallback, useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";

type LikeState = { liked: boolean; count: number };

type Props = {
  pins: string[];
  onPinClick: (url: string) => void;
  /** Số ảnh hiện ban đầu và mỗi lần tải thêm */
  pageSize?: number;
  /** Chiều cao cố định của khung (mặc định ~ vừa 6 ảnh) */
  height?: string;
  /** Đổi giá trị này sẽ reset về 6 ảnh đầu và cuộn lên đầu khung */
  resetKey?: string | number | null;
  /** Map url → like (hiện dưới mỗi ảnh ngoài lưới) */
  likes?: Record<string, LikeState>;
  /** Bấm tim — owner có thể truyền no-op / disabled */
  onToggleLike?: (url: string) => void;
  /** Chủ hồ sơ: không cho like, chỉ xem số */
  likeDisabled?: boolean;
};

/**
 * Khung ảnh masonry kiểu Pinterest:
 * - Khung có chiều cao cố định, cuộn lên/xuống BÊN TRONG khung (không kéo dài trang).
 * - Hiện 6 ảnh đầu, cuộn gần đáy khung thì tự nạp thêm 6 ảnh.
 * - 2 cột; ảnh mới chỉ thêm vào cuối nên ảnh cũ không bị nhảy vị trí.
 * - Tim + số like hiện ngay dưới mỗi ảnh (không cần vào chi tiết).
 */
export function InfiniteMasonryBox({
  pins,
  onPinClick,
  pageSize = 6,
  height = "min(68vh, 520px)",
  resetKey,
  likes,
  onToggleLike,
  likeDisabled = false,
}: Props) {
  const [visible, setVisible] = useState(pageSize);
  const boxRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const total = pins.length;
  const hasMore = visible < total;

  const loadMore = useCallback(() => {
    setVisible((v) => Math.min(v + pageSize, total));
  }, [pageSize, total]);

  useEffect(() => {
    setVisible(pageSize);
    boxRef.current?.scrollTo({ top: 0 });
  }, [resetKey, total, pageSize]);

  useEffect(() => {
    const root = boxRef.current;
    const node = sentinelRef.current;
    if (!root || !node || !hasMore) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root, rootMargin: "0px 0px 240px 0px", threshold: 0 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [visible, hasMore, loadMore]);

  const onScroll = () => {
    const el = boxRef.current;
    if (!el || !hasMore) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) loadMore();
  };

  const shown = pins.slice(0, visible);
  const cols: { url: string; i: number }[][] = [[], []];
  shown.forEach((url, i) => cols[i % 2].push({ url, i }));

  const showLike = !!likes;

  return (
    <div
      ref={boxRef}
      onScroll={onScroll}
      className="overflow-y-auto overscroll-contain rounded-xl"
      style={{
        height,
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
        scrollbarWidth: "none",
      }}
    >
      <div className="flex gap-1.5 items-start">
        {cols.map((col, ci) => (
          <div key={ci} className="flex-1 min-w-0 flex flex-col gap-2">
            {col.map(({ url, i }) => {
              const like = likes?.[url] ?? { liked: false, count: 0 };
              return (
                <div key={url + i} className="w-full">
                  <button
                    type="button"
                    onClick={() => onPinClick(url)}
                    className="w-full rounded-lg overflow-hidden block bg-muted"
                    style={{ minHeight: 120 }}
                  >
                    <img src={url} alt="" className="w-full h-auto object-cover block" />
                  </button>
                  {showLike && (
                    <div className="flex items-center gap-1 mt-1 px-0.5">
                      <button
                        type="button"
                        disabled={likeDisabled || !onToggleLike}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!likeDisabled && onToggleLike) onToggleLike(url);
                        }}
                        className={`flex items-center gap-1 ${
                          likeDisabled ? "cursor-default opacity-80" : "active:scale-95"
                        }`}
                        aria-label="Thích ảnh"
                      >
                        <Heart
                          size={16}
                          strokeWidth={2}
                          className={like.liked ? "text-red-500" : "text-muted-foreground"}
                          fill={like.liked ? "currentColor" : "none"}
                        />
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {like.count}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div
        ref={sentinelRef}
        className="h-10 flex items-center justify-center text-[11px] text-muted-foreground"
      >
        {hasMore ? "Đang tải thêm…" : total > pageSize ? "Đã hết ảnh" : null}
      </div>
    </div>
  );
}
