/** Chấm đỏ đếm (1 … 99+). Đặt trong phần tử cha có `relative`. Số 0 → không hiện. */
export function CountBadge({ n, className = "-top-1.5 -right-1.5" }: { n: number; className?: string }) {
  if (!n || n <= 0) return null;
  return (
    <span
      aria-label={`${n} tin chưa đọc`}
      className={`absolute ${className} min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center pointer-events-none z-10`}
      style={{ background: "#ef4444", boxShadow: "0 0 0 2px #fff" }}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
