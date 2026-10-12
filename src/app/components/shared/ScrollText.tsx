import type { CSSProperties, ReactNode } from "react";

/**
 * Hộp chứa chữ do người dùng tự nhập (giới thiệu, ghi chú, bình luận...).
 * Chữ dài chỉ cuộn BÊN TRONG hộp (thanh cuộn ẩn), không kéo dãn cả thẻ;
 * chuỗi dài không dấu cách cũng tự xuống dòng thay vì tràn ra ngoài.
 */
export function ScrollText({
  children,
  maxHeightClass = "max-h-28",
  boxed = false,
  className = "",
  style,
}: {
  children: ReactNode;
  maxHeightClass?: string;
  /** true = có nền xám + bo góc như ô "Ghi chú khách" */
  boxed?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`${maxHeightClass} overflow-y-auto overscroll-contain whitespace-pre-wrap no-scrollbar ${
        boxed ? "bg-muted/60 rounded-xl px-3 py-2.5" : ""
      } ${className}`}
      style={{ touchAction: "pan-y", overflowWrap: "anywhere", wordBreak: "break-word", ...style }}
    >
      {children}
    </div>
  );
}
