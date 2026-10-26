import { useLayoutEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";

/**
 * Ô nhập nhiều dòng: chứa được văn bản dài tùy ý nhưng KHÔNG phồng quá lố.
 * Tự cao dần theo nội dung tới `maxHeight` (px); quá mức đó thì giữ nguyên chiều cao và cuộn bên trong ô.
 * Không đặt maxLength → không giới hạn số ký tự.
 */
export function AutoGrowTextarea({
  value,
  onChange,
  maxHeight = 140,
  rows = 1,
  className = "",
  style,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "maxLength"> & {
  value: string;
  onChange: (v: string) => void;
  /** Chiều cao tối đa (px) trước khi chuyển sang cuộn trong ô */
  maxHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const border = el.offsetHeight - el.clientHeight; // viền (nếu có) không nằm trong scrollHeight
    const full = el.scrollHeight + border;
    el.style.height = `${Math.min(full, maxHeight)}px`;
    el.style.overflowY = full > maxHeight ? "auto" : "hidden";
  }, [value, maxHeight]);

  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`block w-full box-border resize-none ${className}`}
      style={{
        maxHeight,
        overflowWrap: "anywhere",
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
        ...style,
      }}
      {...rest}
    />
  );
}
