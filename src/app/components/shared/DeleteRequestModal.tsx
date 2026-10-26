import { useEffect, useState } from "react";
import { useBackHandler } from "../../lib/backNavigation";
import { TEAL } from "../../constants";

const WAIT_SECONDS = 5;

/** Xác nhận xóa đơn: phải đợi 5 giây rồi nút "Xác nhận xóa" mới bấm được. */
export function DeleteRequestModal({ title, busy, error, onConfirm, onCancel }: {
  title: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [left, setLeft] = useState(WAIT_SECONDS);
  useBackHandler(true, () => { if (!busy) onCancel(); });

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const ready = left <= 0 && !busy;
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={() => { if (!busy) onCancel(); }}>
      <div className="w-full max-w-xs bg-white rounded-3xl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-black mb-1.5 text-destructive">Xóa đơn này?</h3>
        <p className="text-sm font-semibold mb-1" style={{ color: TEAL }}>{title}</p>
        <p className="text-sm text-muted-foreground mb-4">
          Đơn sẽ bị xóa vĩnh viễn, các nhiếp ảnh gia đã đề nghị sẽ không còn thấy đơn này. Không thể hoàn tác.
        </p>
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        <div className="flex flex-col gap-2">
          <button type="button" disabled={!ready} onClick={onConfirm}
            className="w-full py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
            style={{ background: "#dc2626" }}>
            {busy ? "Đang xóa…" : left > 0 ? `Xác nhận xóa (${left}s)` : "Xác nhận xóa"}
          </button>
          <button type="button" disabled={busy} onClick={onCancel}
            className="w-full py-3 rounded-2xl border-2 font-bold text-sm bg-white" style={{ borderColor: "#e5e7eb", color: TEAL }}>
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
