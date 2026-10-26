import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPhotoRequests, type PhotoRequest, type RequestFilter } from "../lib/photoRequests";

/**
 * Danh sách đơn tìm nhiếp ảnh gia, tải dần từng trang (cuộn tới đâu tải tới đó).
 * Đổi bộ lọc / sắp xếp → tải lại từ trang đầu.
 */
export function usePhotoRequests(filter: RequestFilter) {
  const [items, setItems] = useState<PhotoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sample, setSample] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const pageRef = useRef(0);      // trang kế tiếp cần tải
  const busyRef = useRef(false);  // đang tải → chặn gọi trùng
  const genRef = useRef(0);       // đổi bộ lọc → bỏ kết quả của lượt cũ

  const filterKey = JSON.stringify(filter);

  // Tải trang đầu mỗi khi đổi bộ lọc (hoặc bấm thử lại)
  useEffect(() => {
    const gen = ++genRef.current;
    pageRef.current = 0;
    busyRef.current = true;
    setItems([]);
    setHasMore(true);
    setError(null);
    setLoading(true);
    fetchPhotoRequests(filter, 0)
      .then((res) => {
        if (gen !== genRef.current) return;
        setItems(res.rows);
        setHasMore(res.hasMore);
        setSample(res.sample);
        pageRef.current = 1;
      })
      .catch((e) => {
        if (gen !== genRef.current) return;
        setError(e?.message || "Không tải được danh sách đơn");
        setHasMore(false);
      })
      .finally(() => {
        if (gen !== genRef.current) return;
        busyRef.current = false;
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, retryTick]);

  const loadMore = useCallback(() => {
    if (busyRef.current || !hasMore) return;
    busyRef.current = true;
    setLoadingMore(true);
    const gen = genRef.current;
    fetchPhotoRequests(filter, pageRef.current)
      .then((res) => {
        if (gen !== genRef.current) return;
        pageRef.current += 1;
        setItems((cur) => {
          const seen = new Set(cur.map((x) => x.id));
          return [...cur, ...res.rows.filter((x) => !seen.has(x.id))];
        });
        setHasMore(res.hasMore);
      })
      .catch((e) => {
        if (gen !== genRef.current) return;
        setError(e?.message || "Không tải thêm được");
        setHasMore(false);
      })
      .finally(() => {
        if (gen !== genRef.current) return;
        busyRef.current = false;
        setLoadingMore(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, hasMore]);

  const retry = useCallback(() => setRetryTick((n) => n + 1), []);

  return { items, loading, loadingMore, hasMore, error, sample, loadMore, retry };
}
