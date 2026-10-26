import { useBackHandler } from "../../lib/backNavigation";
import { TEAL, TEAL_MID } from "../../constants";

export type ConfirmAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
};

export function ConfirmModal({
  title,
  message,
  actions,
  onBackdropClick,
}: {
  title: string;
  message: string;
  actions: ConfirmAction[];
  onBackdropClick?: () => void;
}) {
  // Vuốt/Back: đóng nếu có xử lý bấm nền, nếu không thì chặn (không thoát khỏi hộp thoại xác nhận)
  useBackHandler(true, () => { onBackdropClick?.(); });
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onBackdropClick}>
      <div className="w-full max-w-xs bg-white rounded-3xl p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-black mb-1.5" style={{ color: TEAL }}>{title}</h3>
        <p className="text-sm text-muted-foreground mb-5">{message}</p>
        <div className="flex flex-col gap-2">
          {actions.map((a, i) => (
            <button key={i} onClick={a.onClick}
              className={
                a.variant === "danger"
                  ? "w-full py-3 rounded-2xl border-2 border-destructive text-destructive font-bold text-sm bg-white"
                  : a.variant === "secondary"
                    ? "w-full py-3 rounded-2xl border-2 font-bold text-sm bg-white"
                    : "w-full py-3 rounded-2xl text-white font-bold text-sm shadow-md"
              }
              style={
                a.variant === "secondary"
                  ? { borderColor: "#e5e7eb", color: TEAL }
                  : a.variant !== "danger"
                    ? { background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }
                    : undefined
              }>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
