import { useEffect, useState } from "react";
import { TEAL, TEAL_MID, VN_BANKS } from "../../constants";
import { fetchMyBank, formatVnd, submitRefundInfo, type BookingRow, type MyBank } from "../../lib/bookings";
import { useBackHandler } from "../../lib/backNavigation";

/**
 * Form khách điền tài khoản nhận hoàn cọc (đơn đã hủy, refund_status = need_info).
 * Tự điền sẵn từ TK đã lưu nếu có.
 */
export function RefundInfoSheet({
  booking,
  userId,
  onClose,
  onDone,
}: {
  booking: BookingRow;
  userId: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [bankCode, setBankCode] = useState(booking.refund_bank_code || VN_BANKS[0].code);
  const [account, setAccount] = useState(booking.refund_account || "");
  const [name, setName] = useState(booking.refund_account_name || "");
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useBackHandler(true, onClose);

  useEffect(() => {
    if (booking.refund_account) return;
    let alive = true;
    fetchMyBank(userId).then((b) => {
      if (!alive || !b) return;
      setBankCode(b.bank_code);
      setAccount(b.bank_account);
      setName(b.bank_account_name);
    });
    return () => {
      alive = false;
    };
  }, [userId, booking.refund_account]);

  async function submit() {
    setErr(null);
    if (account.replace(/\s/g, "").length < 6) return setErr("Số tài khoản chưa hợp lệ");
    if (name.trim().length < 2) return setErr("Nhập tên chủ tài khoản (đúng như trên ngân hàng)");
    const bank = VN_BANKS.find((b) => b.code === bankCode);
    const payload: MyBank = {
      bank_code: bankCode,
      bank_name: bank?.name ?? bankCode,
      bank_account: account.replace(/\s/g, ""),
      bank_account_name: name.trim(),
    };
    setBusy(true);
    const e = await submitRefundInfo(booking.id, payload, save);
    setBusy(false);
    if (e) return setErr(e);
    onDone("Đã gửi thông tin. Memento sẽ chuyển lại tiền cọc cho bạn.");
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-black mb-1" style={{ color: TEAL }}>
          Nhận hoàn tiền cọc
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          Số tiền hoàn:{" "}
          <strong style={{ color: TEAL }}>
            {formatVnd(Number(booking.refund_amount) || Number(booking.deposit_amount) || 0)}
          </strong>
          . Điền tài khoản bạn muốn nhận lại tiền.
        </p>

        <div className="space-y-2">
          <select
            value={bankCode}
            onChange={(e) => setBankCode(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
          >
            {VN_BANKS.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value.replace(/\s/g, ""))}
            placeholder="Số tài khoản"
            inputMode="numeric"
            className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên chủ tài khoản"
            className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
            Lưu tài khoản này cho lần sau
          </label>
        </div>

        {err && <p className="text-xs text-red-600 mt-2">{err}</p>}

        <div className="flex flex-col gap-2 mt-4">
          <button
            onClick={submit}
            disabled={busy}
            className="w-full py-3 rounded-2xl text-white font-bold text-sm shadow-md disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}
          >
            {busy ? "Đang gửi…" : "Gửi thông tin hoàn tiền"}
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl border-2 font-bold text-sm bg-white"
            style={{ borderColor: "#e5e7eb", color: TEAL }}
          >
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
}
