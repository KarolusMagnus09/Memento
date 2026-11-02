import { useEffect, useState } from "react";
import { Building2, ChevronRight, Eye, EyeOff } from "lucide-react";
import { TEAL, VN_BANKS } from "../../constants";
import { fetchMyBank, saveMyBank, type MyBank } from "../../lib/bookings";

function mask(s: string, keep = 3) {
  return s.length <= keep ? s : "•".repeat(Math.max(s.length - keep, 4)) + s.slice(-keep);
}

/**
 * Cài đặt (khách thường): tài khoản nhận hoàn tiền cọc.
 * Khách tự sửa được ngay (khác PTG phải chờ admin duyệt) vì đây chỉ là nơi NHẬN hoàn.
 * Khi đơn bị hủy, TK này được chụp lại vào đơn tại thời điểm hủy.
 */
export function ClientBankCard({ userId, defaultName }: { userId: string; defaultName?: string }) {
  const [bank, setBank] = useState<MyBank | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(false);
  const [code, setCode] = useState(VN_BANKS[0].code);
  const [acc, setAcc] = useState("");
  const [name, setName] = useState(defaultName || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMyBank(userId).then((b) => {
      if (!alive) return;
      setBank(b);
      if (b) {
        setCode(b.bank_code);
        setName(b.bank_account_name);
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  async function save() {
    setErr(null);
    setMsg(null);
    if (acc.replace(/\s/g, "").length < 6 || name.trim().length < 2) {
      return setErr("Nhập đủ số tài khoản và tên chủ TK");
    }
    const b = VN_BANKS.find((x) => x.code === code);
    const next: MyBank = {
      bank_code: code,
      bank_name: b?.name ?? code,
      bank_account: acc.replace(/\s/g, ""),
      bank_account_name: name.trim().toUpperCase(),
    };
    setBusy(true);
    const e = await saveMyBank(userId, next);
    setBusy(false);
    if (e) return setErr(e);
    setBank(next);
    setEdit(false);
    setAcc("");
    setMsg("Đã lưu. Khi đơn đã cọc bị hủy, tiền sẽ hoàn về tài khoản này.");
  }

  if (!loaded) return null;

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b border-border">
        Tài khoản nhận hoàn tiền
      </p>
      {msg && <div className="px-4 py-2 text-xs" style={{ color: TEAL }}>{msg}</div>}
      {err && <div className="px-4 py-2 text-xs text-red-600">{err}</div>}

      {!edit ? (
        <div>
          {bank ? (
            <div className="px-4 py-3 border-b border-border bg-muted/40">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Tài khoản hiện tại</p>
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted"
                  aria-label={show ? "Ẩn số tài khoản" : "Hiện số tài khoản"}
                >
                  {show ? <EyeOff size={16} style={{ color: TEAL }} /> : <Eye size={16} style={{ color: TEAL }} />}
                </button>
              </div>
              <p className="text-sm font-semibold">{bank.bank_name || bank.bank_code}</p>
              <p className="text-sm mt-0.5">
                STK: <span className="font-mono font-semibold">{show ? bank.bank_account : mask(bank.bank_account)}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Chủ TK: {show ? bank.bank_account_name : mask(bank.bank_account_name, 2)}
              </p>
            </div>
          ) : (
            <div className="px-4 py-3 text-xs text-muted-foreground border-b border-border">
              Chưa có. Lưu trước để khi hủy đơn đã cọc, tiền được hoàn tự động về đúng tài khoản này.
            </div>
          )}
          <button type="button" onClick={() => setEdit(true)} className="w-full flex items-center gap-3 px-4 py-3.5">
            <Building2 size={18} style={{ color: TEAL }} />
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold">{bank ? "Đổi tài khoản nhận hoàn" : "Thêm tài khoản nhận hoàn"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Chỉ dùng để nhận lại tiền cọc khi hủy đơn</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-2">
          <select value={code} onChange={(e) => setCode(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none">
            {VN_BANKS.map((b) => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>
          <input value={acc} onChange={(e) => setAcc(e.target.value.replace(/\s/g, ""))} placeholder="Số tài khoản" inputMode="numeric" className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên chủ tài khoản" className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none" />
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-60" style={{ background: TEAL }}>
              {busy ? "Đang lưu…" : "Lưu"}
            </button>
            <button onClick={() => { setEdit(false); setErr(null); }} className="flex-1 py-2.5 rounded-xl border-2 text-sm font-bold bg-white" style={{ borderColor: "#e5e7eb", color: TEAL }}>
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
