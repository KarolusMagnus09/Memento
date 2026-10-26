import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { Crop, Minus, Plus, X } from "lucide-react";
import { useBackHandler } from "../../lib/backNavigation";
import { TEAL, TEAL_LIGHT } from "../../constants";

const MAX_ZOOM = 4;
const MIN_OUT = 256;
const MAX_OUT = 512;

type Pt = { x: number; y: number };

function calcStage(): number {
  if (typeof window === "undefined") return 320;
  return Math.max(220, Math.min(360, window.innerWidth - 32, window.innerHeight - 300));
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] || "image/jpeg";
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/**
 * Cắt ảnh đại diện kiểu Facebook:
 *  - Khung tròn cố định, kéo ảnh để chọn vị trí, kéo thanh trượt / nút − + / chụm 2 ngón / lăn chuột để phóng to.
 *  - Ảnh luôn phủ kín khung tròn (không bị hở), nên ảnh dọc hay ngang đều cắt được đúng.
 *  - Bấm "Cắt ảnh" → trả về ảnh vuông (JPEG ≤ 512px). Bấm X / nút Back → hủy, không đổi gì.
 */
export function AvatarCropper({
  src,
  onCancel,
  onConfirm,
}: {
  src: string;
  onCancel: () => void;
  /** dataUrl: dùng để xem trước / upload; blob: dùng khi cần blob URL */
  onConfirm: (dataUrl: string, blob: Blob) => void;
}) {
  useBackHandler(true, onCancel);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState<Pt>({ x: 0, y: 0 });
  const [stage, setStage] = useState(calcStage);
  const [dragging, setDragging] = useState(false);

  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ startOff: Pt; startPt: Pt; startDist: number; startZoom: number } | null>(null);

  useEffect(() => {
    const onResize = () => setStage(calcStage());
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  // C = đường kính khung tròn (cũng là cạnh ô vuông sẽ được cắt)
  const C = Math.round(stage * 0.82);
  // zoom = 1 nghĩa là cạnh ngắn của ảnh vừa khít khung tròn
  const base = nat ? C / Math.min(nat.w, nat.h) : 1;
  const scale = base * zoom;

  function clampOff(p: Pt, sc: number): Pt {
    if (!nat) return { x: 0, y: 0 };
    const mx = Math.max(0, (nat.w * sc - C) / 2);
    const my = Math.max(0, (nat.h * sc - C) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  }

  const o = clampOff(off, scale);

  /** Đổi zoom nhưng giữ nguyên điểm đang nằm giữa khung */
  function applyZoom(nextZoom: number, fromOff: Pt = o, fromZoom: number = zoom) {
    const nz = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
    const ratio = nz / fromZoom;
    setZoom(nz);
    setOff(clampOff({ x: fromOff.x * ratio, y: fromOff.y * ratio }, base * nz));
  }

  function dist(a: Pt, b: Pt) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!nat) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointers.current.values());
    if (pts.length >= 2) {
      gesture.current = { startOff: o, startPt: pts[0], startDist: dist(pts[0], pts[1]) || 1, startZoom: zoom };
    } else {
      gesture.current = { startOff: o, startPt: pts[0], startDist: 0, startZoom: zoom };
      setDragging(true);
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointers.current.values());
    const g = gesture.current;
    if (pts.length >= 2 && g.startDist > 0) {
      applyZoom(g.startZoom * (dist(pts[0], pts[1]) / g.startDist), g.startOff, g.startZoom);
    } else if (pts.length === 1) {
      setOff(clampOff({ x: g.startOff.x + (pts[0].x - g.startPt.x), y: g.startOff.y + (pts[0].y - g.startPt.y) }, scale));
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    const pts = Array.from(pointers.current.values());
    if (pts.length === 1) {
      // Còn 1 ngón: tiếp tục kéo từ vị trí hiện tại, không bị giật
      gesture.current = { startOff: o, startPt: pts[0], startDist: 0, startZoom: zoom };
    } else if (pts.length === 0) {
      gesture.current = null;
      setDragging(false);
    }
  }

  function onWheel(e: ReactWheelEvent<HTMLDivElement>) {
    if (!nat) return;
    applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  }

  function handleCrop() {
    const img = imgRef.current;
    if (!img || !nat || saving) return;
    setSaving(true);
    setCropError(null);
    try {
      const sw = C / scale; // cạnh ô vuông cần cắt, tính theo pixel ảnh gốc
      const sx = nat.w / 2 + (-C / 2 - o.x) / scale;
      const sy = nat.h / 2 + (-C / 2 - o.y) / scale;
      const out = Math.max(MIN_OUT, Math.min(MAX_OUT, Math.round(sw)));
      const canvas = document.createElement("canvas");
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no-canvas");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, out, out);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sw, sw, 0, 0, out, out);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      canvas.toBlob(
        (blob) => onConfirm(dataUrl, blob ?? dataUrlToBlob(dataUrl)),
        "image/jpeg",
        0.9
      );
    } catch {
      setSaving(false);
      setCropError("Không cắt được ảnh này. Bạn thử chọn ảnh khác nhé.");
    }
  }

  const circleStyle: CSSProperties = {
    position: "absolute",
    left: (stage - C) / 2,
    top: (stage - C) / 2,
    width: C,
    height: C,
    borderRadius: "50%",
    boxShadow: "0 0 0 9999px rgba(255,255,255,0.72)",
    border: "2px solid rgba(255,255,255,0.95)",
    pointerEvents: "none",
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-label="Cắt ảnh đại diện"
      style={{ overscrollBehavior: "contain" }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <h3 className="font-bold text-base" style={{ color: TEAL }}>Cắt ảnh đại diện</h3>
        <button
          type="button"
          onClick={onCancel}
          className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
          aria-label="Đóng"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center px-4 pt-5 pb-4">
        <div
          className="relative overflow-hidden select-none rounded-lg"
          style={{
            width: stage,
            height: stage,
            background: "#e5e7eb",
            touchAction: "none",
            cursor: dragging ? "grabbing" : "grab",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onError={() => setLoadError(true)}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              maxWidth: "none",
              width: nat ? nat.w * scale : undefined,
              height: nat ? nat.h * scale : undefined,
              transform: `translate(calc(-50% + ${o.x}px), calc(-50% + ${o.y}px))`,
              visibility: nat ? "visible" : "hidden",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
          <div style={circleStyle} />
          {!nat && !loadError && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              Đang tải ảnh...
            </div>
          )}
        </div>

        {loadError ? (
          <p className="text-xs font-semibold mt-4 text-center" style={{ color: "#dc2626" }}>
            Không đọc được ảnh này. Bạn hãy đóng lại và chọn ảnh khác.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 w-full mt-5" style={{ maxWidth: stage }}>
              <button
                type="button"
                onClick={() => applyZoom(zoom - 0.25)}
                disabled={!nat || zoom <= 1}
                className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30 flex-shrink-0"
                aria-label="Thu nhỏ"
              >
                <Minus size={18} />
              </button>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                disabled={!nat}
                onChange={(e) => applyZoom(Number(e.target.value))}
                className="flex-1 min-w-0"
                style={{ accentColor: TEAL_LIGHT }}
                aria-label="Phóng to / thu nhỏ"
              />
              <button
                type="button"
                onClick={() => applyZoom(zoom + 0.25)}
                disabled={!nat || zoom >= MAX_ZOOM}
                className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30 flex-shrink-0"
                aria-label="Phóng to"
              >
                <Plus size={18} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center leading-snug">
              Kéo ảnh để chọn vị trí, kéo thanh trượt để phóng to / thu nhỏ.
              <br />
              Phần trong vòng tròn sẽ là ảnh đại diện công khai của bạn.
            </p>
          </>
        )}
        {cropError && (
          <p className="text-xs font-semibold mt-3 text-center" style={{ color: "#dc2626" }}>{cropError}</p>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border flex-shrink-0 safe-bottom">
        <button
          type="button"
          onClick={handleCrop}
          disabled={!nat || saving || loadError}
          className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: TEAL }}
        >
          <Crop size={16} /> {saving ? "Đang cắt..." : "Cắt ảnh"}
        </button>
      </div>
    </div>
  );
}
