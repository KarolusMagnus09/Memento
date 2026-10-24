import { useEffect } from "react";
import { startBackNavigation, useExitHint } from "../../lib/backNavigation";

/**
 * Gắn 1 lần ở gốc app: khởi động bộ bắt nút Back / vuốt cạnh,
 * và vẽ thông báo "Vuốt thêm lần nữa để thoát" phía trên thanh điều hướng.
 */
export function BackExitHost() {
  useEffect(() => startBackNavigation(), []);
  const show = useExitHint();
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 z-[300] pointer-events-none transition-all duration-200"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)",
        opacity: show ? 1 : 0,
        transform: `translateX(-50%) translateY(${show ? 0 : 8}px)`,
      }}
    >
      <div
        className="px-4 py-2.5 rounded-full text-xs font-semibold text-white whitespace-nowrap"
        style={{ background: "rgba(12,61,53,0.94)", boxShadow: "0 6px 20px rgba(0,0,0,0.22)" }}
      >
        Vuốt thêm lần nữa để thoát ứng dụng
      </div>
    </div>
  );
}
