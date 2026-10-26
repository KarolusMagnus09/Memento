import { useEffect, useState } from "react";

/**
 * Chấm tròn đỏ nhỏ ở giữa cuối màn hình, báo số nhóm bảng giá hiện có (1 → 99+).
 * Mỗi lần `pulse` tăng lên (người dùng bấm "Thêm nhóm") chấm hiện lên rồi tự ẩn sau ~2 giây.
 */
export function GroupCountBadge({ count, pulse }: { count: number; pulse: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pulse <= 0) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 2200);
    return () => window.clearTimeout(t);
  }, [pulse]);

  if (!visible || count < 1) return null;
  const label = count > 99 ? "99+" : String(count);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Bạn đang có ${label} nhóm bảng giá`}
      className="fixed left-1/2 z-[80] pointer-events-none"
      style={{
        transform: "translateX(-50%)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 92px)",
      }}
    >
      <span
        className="flex items-center justify-center rounded-full text-white font-black shadow-lg"
        style={{
          minWidth: 32,
          height: 32,
          padding: "0 8px",
          fontSize: 13,
          background: "#ef4444",
          border: "2px solid #fff",
        }}
      >
        {label}
      </span>
    </div>
  );
}
