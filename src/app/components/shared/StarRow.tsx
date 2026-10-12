import { Star } from "lucide-react";

export function StarRow({ rating, size = 14, color = "#f59e0b" }: { rating: number; size?: number; color?: string }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} fill={i <= Math.round(rating) ? color : "none"} stroke={color} strokeWidth={1.5} />
      ))}
    </span>
  );
}

