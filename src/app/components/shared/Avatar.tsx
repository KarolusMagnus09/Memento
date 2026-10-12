import { DEFAULT_AVATAR } from "../../constants";

export function Avatar({ src, size = 40, className = "" }: { src?: string | null; size?: number; className?: string }) {
  return (
    <img src={src || DEFAULT_AVATAR} alt="avatar" width={size} height={size}
      className={`rounded-full object-cover flex-shrink-0 ${className}`}
      style={{ width: size, height: size }} />
  );
}

