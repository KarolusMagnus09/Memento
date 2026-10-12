import { TEAL_LIGHT } from "../../constants";

export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className="w-11 h-6 rounded-full transition-all flex-shrink-0 flex items-center px-0.5"
      style={{ background: on ? TEAL_LIGHT : "#d1d5db" }}>
      <div className="w-5 h-5 rounded-full bg-white shadow transition-transform"
        style={{ transform: on ? "translateX(20px)" : "translateX(0)" }} />
    </button>
  );
}


