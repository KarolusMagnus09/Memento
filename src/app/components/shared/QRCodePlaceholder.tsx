import { TEAL } from "../../constants";

export function QRCodePlaceholder() {
  const cells = Array.from({ length: 7 }, (_, r) =>
    Array.from({ length: 7 }, (_, c) => {
      const corner = (r < 2 && c < 2) || (r < 2 && c > 4) || (r > 4 && c < 2);
      const data = (r * 7 + c) % 3 !== 1;
      return corner || data;
    })
  );
  return (
    <svg width="140" height="140" viewBox="0 0 7 7" shapeRendering="crispEdges">
      {cells.map((row, r) =>
        row.map((filled, c) =>
          filled ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill={TEAL} /> : null
        )
      )}
    </svg>
  );
}

// BECOME PHOTOGRAPHER
