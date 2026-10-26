import { useState } from "react";
import type { CSSProperties } from "react";
import { DEFAULT_AVATAR } from "../../constants";

/**
 * Ảnh đại diện tròn (luôn vuông + cắt giữa, ảnh dọc/ngang đều không bị méo).
 * Chưa có ảnh, ảnh rỗng hoặc ảnh bị lỗi (link hỏng / 404 / mất mạng) → tự dùng ảnh mặc định.
 */
export function Avatar({
  src,
  size = 40,
  className = "",
  style,
}: {
  src?: string | null;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const clean = typeof src === "string" ? src.trim() : "";
  const valid = clean !== "" && clean !== "null" && clean !== "undefined";
  // Nhớ link đã lỗi: đổi sang link khác thì thử tải lại bình thường
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const url = valid && clean !== failedSrc ? clean : DEFAULT_AVATAR;

  return (
    <img
      src={url}
      alt="avatar"
      width={size}
      height={size}
      onError={() => {
        if (url !== DEFAULT_AVATAR) setFailedSrc(clean);
      }}
      className={`rounded-full object-cover flex-shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
    />
  );
}
