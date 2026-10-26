import { useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";

export const MAX_PRICE_DIGITS = 12;
export const BAD_CHAR_MSG = "Chỉ nhập số dương, không nhập số âm hay ký tự khác.";

/** "1000000" → "1.000.000" */
export const fmtVnd = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Chỉ giữ chữ số, bỏ số 0 đứng đầu ("007" → "7"), tối đa 12 chữ số */
function cleanDigits(raw: string) {
  return raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, MAX_PRICE_DIGITS);
}

/**
 * Ô nhập giá: hiển thị có dấu chấm ngăn cách (1.000.000), bên trong chỉ lưu chuỗi chữ số.
 * Không cho nhập dấu trừ / chữ / ký tự lạ; con trỏ không bị nhảy khi tự thêm dấu chấm.
 */
export function PriceInput({
  value,
  onChange,
  onBadChar,
  placeholder,
  invalid,
  ariaLabel,
  className = "flex-1 px-3 py-2.5 rounded-xl bg-muted text-sm outline-none min-w-0",
}: {
  value: string;
  onChange: (digits: string) => void;
  onBadChar: () => void;
  placeholder: string;
  invalid: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const [, bump] = useState(0);

  useLayoutEffect(() => {
    if (caret.current != null && ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return; // phím điều khiển, Backspace, mũi tên...
    if (/\d/.test(e.key)) return;
    e.preventDefault();
    if (e.key !== ".") onBadChar(); // gõ dấu chấm thì lờ đi (app tự thêm dấu chấm ngăn cách)
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (/[^\d.]/.test(raw)) onBadChar(); // dán / bàn phím ảo: vẫn bắt được ký tự lạ

    const pos = e.target.selectionStart ?? raw.length;
    let digitsBefore = raw.slice(0, pos).replace(/\D/g, "").length;
    const allDigits = raw.replace(/\D/g, "");
    const next = cleanDigits(raw);
    digitsBefore -= allDigits.length - allDigits.replace(/^0+(?=\d)/, "").length; // số 0 đầu bị bỏ
    digitsBefore = Math.min(Math.max(0, digitsBefore), next.length);

    // Đặt lại con trỏ: đứng ngay sau chữ số thứ `digitsBefore` của chuỗi đã có dấu chấm
    const f = fmtVnd(next);
    let c = 0;
    let seen = 0;
    while (c < f.length && seen < digitsBefore) {
      if (f[c] !== ".") seen++;
      c++;
    }
    caret.current = c;
    onChange(next);
    bump((n) => n + 1); // bắt buộc vẽ lại để đặt con trỏ, kể cả khi giá trị không đổi
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={fmtVnd(value)}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      className={className}
      style={invalid ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined}
    />
  );
}
