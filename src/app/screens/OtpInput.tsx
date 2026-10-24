import { useRef } from "react";
import { TEAL } from "../../constants";

export function OtpInput({
  length = 6,
  value,
  onChange,
  error,
}: {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function setDigit(i: number, raw: string) {
    const clean = raw.replace(/\D/g, "").slice(-1);
    const next = digits.slice();
    next[i] = clean;
    onChange(next.join("").slice(0, length));
    if (clean && i < length - 1) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div>
      <div className="flex justify-center gap-2.5">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => { refs.current[i] = el; }}
            value={d}
            onChange={e => setDigit(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            onPaste={handlePaste}
            inputMode="numeric"
            maxLength={1}
            className="w-12 h-14 text-center text-2xl font-bold rounded-2xl border-2 outline-none bg-white"
            style={{ color: TEAL, borderColor: error ? "#ef4444" : d ? TEAL : "#e5e7eb" }}
          />
        ))}
      </div>
      {error && <p className="text-xs text-red-600 text-center mt-3">{error}</p>}
    </div>
  );
}
