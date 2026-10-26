import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";

/** Tuổi tối thiểu để đăng ký làm nhiếp ảnh gia */
export const MIN_AGE = 16;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "DD", "MM", "YYYY" (chuỗi số người dùng gõ) → "YYYY-MM-DD" nếu là ngày có thật và không ở tương lai; ngược lại null. */
export function toIsoDate(d: string, m: string, y: string): string | null {
  if (!d || !m || y.length !== 4) return null;
  const day = Number(d);
  const month = Number(m);
  const year = Number(y);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (year < 1900 || month < 1 || month > 12 || day < 1) return null;
  const dt = new Date(year, month - 1, day);
  // new Date tự "tràn" ngày (31/02 → 03/03), nên đối chiếu lại để loại ngày không có thật
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  if (dt.getTime() > Date.now()) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Tuổi (số năm tròn) tại thời điểm `today` của ngày sinh dạng "YYYY-MM-DD"; null nếu chuỗi không hợp lệ. */
export function ageFromIso(iso: string, today: Date = new Date()): number | null {
  const m = ISO_RE.exec(iso || "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  let age = today.getFullYear() - y;
  const beforeBirthday = today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Đủ tuổi tối thiểu chưa? Chuỗi rỗng/không hợp lệ → false. */
export function isOldEnough(iso: string, minAge: number = MIN_AGE): boolean {
  const age = ageFromIso(iso);
  return age !== null && age >= minAge;
}

/**
 * Ô nhập ngày sinh bằng tay: 3 ô DD / MM / YYYY, không lịch, không kéo thả.
 * - `value` / `onChange` dùng chuỗi ISO "YYYY-MM-DD"; chưa gõ đủ hoặc ngày không có thật thì onChange("").
 * - Gõ tự do: không tự chèn số 0 ("5" giữ nguyên "5"). Tự nhảy ô khi đủ 2 số, hoặc số đã chắc chắn (ngày 4–9, tháng 2–9), hoặc gõ / . - dấu cách.
 * - Bấm vào ô thì bôi đen nội dung để gõ đè; bấm xoá khi ô trống thì lùi về ô trước.
 * - Chưa đủ `minAge` tuổi: hiện thông báo đỏ ngay dưới ô (bước tiếp theo bị chặn ở màn hình cha).
 */
export function BirthDateInput({
  value,
  onChange,
  invalid = false,
  minAge = MIN_AGE,
}: {
  value: string;
  onChange: (iso: string) => void;
  /** Viền đỏ (vd. khi bấm Tiếp tục mà chưa nhập) */
  invalid?: boolean;
  minAge?: number;
}) {
  const [d, setD] = useState("");
  const [m, setM] = useState("");
  const [y, setY] = useState("");
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  // Nạp lại từ ngoài (vd. tự điền từ hồ sơ đã lưu) — chỉ khi khác với những gì đang gõ
  useEffect(() => {
    const mt = ISO_RE.exec(value || "");
    if (!mt) return;
    if (toIsoDate(d, m, y) === value) return;
    setY(mt[1]);
    setM(mt[2]);
    setD(mt[3]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emit(nd: string, nm: string, ny: string) {
    onChange(toIsoDate(nd, nm, ny) ?? "");
  }

  function handle(idx: 0 | 1 | 2, raw: string) {
    const max = idx === 2 ? 4 : 2;
    const digits = raw.replace(/\D/g, "").slice(0, max);
    const nd = idx === 0 ? digits : d;
    const nm = idx === 1 ? digits : m;
    const ny = idx === 2 ? digits : y;
    if (idx === 0) setD(digits);
    if (idx === 1) setM(digits);
    if (idx === 2) setY(digits);
    emit(nd, nm, ny);
    if (idx === 2) return;
    // Nhảy sang ô kế khi: đủ 2 số, hoặc 1 số đã chắc chắn (ngày 4–9, tháng 2–9), hoặc người dùng gõ / . - hay dấu cách.
    // Không bao giờ tự chèn số 0 vào giá trị người dùng gõ.
    const sure = idx === 0 ? digits.length === 1 && Number(digits) > 3 : digits.length === 1 && Number(digits) > 1;
    const typedSeparator = digits.length > 0 && /[^\d]/.test(raw);
    if (digits.length === max || sure || typedSeparator) refs[idx + 1].current?.focus();
  }

  function onKeyDown(idx: 0 | 1 | 2, e: React.KeyboardEvent<HTMLInputElement>) {
    const cur = idx === 0 ? d : idx === 1 ? m : y;
    if (e.key === "Backspace" && cur === "" && idx > 0) {
      e.preventDefault();
      refs[idx - 1].current?.focus();
    }
  }

  const complete = d.length > 0 && m.length > 0 && y.length === 4;
  const iso = toIsoDate(d, m, y);
  const age = iso ? ageFromIso(iso) : null;
  const tooYoung = age !== null && age < minAge;
  const badDate = complete && !iso;
  const showRed = invalid || tooYoung || badDate;

  // Bấm/tab vào ô thì chọn hết nội dung: gõ số mới sẽ thay thế, không bị dính số cũ
  const selectAll = (e: React.FocusEvent<HTMLInputElement>) => {
    const t = e.target;
    setTimeout(() => { try { t.select(); } catch { /* bỏ qua */ } }, 0);
  };

  const boxCls = "w-full px-3 py-2.5 rounded-xl bg-muted text-sm text-center outline-none";
  const boxStyle = showRed ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined;

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          ref={refs[0]} value={d} inputMode="numeric" autoComplete="off" maxLength={2} placeholder="DD" aria-label="Ngày sinh: ngày"
          onChange={(e) => handle(0, e.target.value)} onKeyDown={(e) => onKeyDown(0, e)} onFocus={selectAll}
          className={boxCls} style={boxStyle}
        />
        <span className="text-muted-foreground">/</span>
        <input
          ref={refs[1]} value={m} inputMode="numeric" autoComplete="off" maxLength={2} placeholder="MM" aria-label="Ngày sinh: tháng"
          onChange={(e) => handle(1, e.target.value)} onKeyDown={(e) => onKeyDown(1, e)} onFocus={selectAll}
          className={boxCls} style={boxStyle}
        />
        <span className="text-muted-foreground">/</span>
        <input
          ref={refs[2]} value={y} inputMode="numeric" autoComplete="off" maxLength={4} placeholder="YYYY" aria-label="Ngày sinh: năm"
          onChange={(e) => handle(2, e.target.value)} onKeyDown={(e) => onKeyDown(2, e)} onFocus={selectAll}
          className={`${boxCls} min-w-[84px]`} style={boxStyle}
        />
      </div>
      {tooYoung ? (
        <p className="text-[11px] font-semibold mt-1 flex items-center gap-1" style={{ color: "#dc2626" }}>
          <AlertCircle size={11} /> Bạn chưa đủ {minAge} tuổi nên chưa thể đăng ký làm nhiếp ảnh gia.
        </p>
      ) : badDate ? (
        <p className="text-[11px] font-semibold mt-1 flex items-center gap-1" style={{ color: "#dc2626" }}>
          <AlertCircle size={11} /> Ngày sinh không hợp lệ, vui lòng kiểm tra lại (ngày/tháng/năm).
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground mt-1">Nhập ngày/tháng/năm sinh. Bạn phải đủ {minAge} tuổi để đăng ký.</p>
      )}
    </div>
  );
}
