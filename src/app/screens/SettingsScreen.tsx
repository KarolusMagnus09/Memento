import { ChevronLeft, ChevronRight, Key, Laptop, MapPin, Mail, Building2 } from "lucide-react";
import type { Screen } from "../types";
import type { Profile } from "../hooks/useProfile";
import { TEAL, TEAL_LIGHT, BG, VN_BANKS } from "../constants";
import { supabase } from "../lib/supabase";
import { useEffect, useState } from "react";

export default function SettingsScreen({
  setScreen,
  profile,
}: {
  setScreen: (s: Screen) => void;
  profile: Profile | null;
}) {
  const isPtg = profile?.role === "photographer";
  const [bankCode, setBankCode] = useState("BIDV");
  const [bankAccount, setBankAccount] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [currentBank, setCurrentBank] = useState<{
    bank_name: string | null;
    bank_code: string | null;
    bank_account: string | null;
    bank_account_name: string | null;
  } | null>(null);
  const [hasBank, setHasBank] = useState(true);
  const [pendingChange, setPendingChange] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showBankForm, setShowBankForm] = useState(false);

  useEffect(() => {
    if (!profile?.id || !isPtg) return;
    let c = false;
    (async () => {
      const { data: app } = await supabase
        .from("photographer_applications")
        .select("bank_account, bank_code, bank_name, bank_account_name, status, full_name")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (c) return;
      const ok = !!(app?.bank_account && String(app.bank_account).trim());
      setHasBank(ok);
      if (app) {
        setCurrentBank({
          bank_name: app.bank_name ?? null,
          bank_code: app.bank_code ?? null,
          bank_account: app.bank_account ?? null,
          bank_account_name: app.bank_account_name ?? null,
        });
      }
      if (app?.bank_code) setBankCode(app.bank_code);
      if (app?.bank_account_name) setBankAccountName(app.bank_account_name);
      else if (app?.full_name) setBankAccountName(app.full_name);
      // Hiện STK hiện tại để PTG xem trước khi đổi; form đổi vẫn nhập STK mới

      const { data: req } = await supabase
        .from("bank_change_requests")
        .select("id, status")
        .eq("user_id", profile.id)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();
      if (!c) setPendingChange(!!req);
    })();
    return () => {
      c = true;
    };
  }, [profile?.id, isPtg]);

  async function submitBankChange() {
    if (!profile?.id) return;
    if (!bankAccount.trim() || !bankAccountName.trim()) {
      setErr("Nhập đủ số tài khoản và tên chủ TK");
      return;
    }
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const bank = VN_BANKS.find((b) => b.code === bankCode);
      const { error } = await supabase.from("bank_change_requests").insert({
        user_id: profile.id,
        photographer_name: profile.full_name || profile.username,
        bank_name: bank?.name || bankCode,
        bank_code: bankCode,
        bank_account: bankAccount.trim(),
        bank_account_name: bankAccountName.trim(),
        status: "pending",
      });
      if (error) throw error;
      setPendingChange(true);
      setShowBankForm(false);
      setBankAccount("");
      setMsg("Đã gửi yêu cầu đổi TK. Admin sẽ duyệt trước khi áp dụng.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Không gửi được yêu cầu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen pb-24" style={{ background: BG }}>
      <div className="px-5 pt-12 pb-4 bg-white border-b border-border flex items-center gap-3">
        <button
          type="button"
          onClick={() => setScreen("profile")}
          className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
        <h2 className="font-bold text-base" style={{ color: TEAL }}>
          Cài đặt
        </h2>
      </div>

      <div className="px-5 mt-4 flex flex-col gap-4">
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b border-border">
            Bảo mật tài khoản
          </p>

          <button
            type="button"
            onClick={() => setScreen("change-password")}
            className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-border"
          >
            <Key size={18} style={{ color: TEAL }} />
            <p className="flex-1 text-sm font-semibold text-left">Đổi mật khẩu</p>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={() => setScreen("change-email")}
            className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0"
          >
            <Mail size={18} style={{ color: TEAL }} />
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold">Đổi email</p>
              {profile?.email && (
                <p className="text-xs text-muted-foreground mt-0.5">{profile.email}</p>
              )}
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>

          <div className="flex items-center gap-3 px-4 py-3.5 opacity-50">
            <Laptop size={18} className="text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Thiết bị đã đăng nhập</p>
              <p className="text-xs text-muted-foreground">Sắp ra mắt</p>
            </div>
          </div>
        </div>

        {/* Chỉ hiện với PTG đã có hồ sơ — đổi TK cần admin duyệt */}
        {isPtg && (
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b border-border flex items-center gap-2">
              Tài khoản ngân hàng
              {!hasBank && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  1
                </span>
              )}
            </p>

            {!hasBank && (
              <div className="px-4 py-3 bg-red-50 border-b border-red-100 text-xs text-red-800 leading-relaxed">
                Hồ sơ của bạn chưa có số tài khoản nhận tiền. Vui lòng gửi TK để nhận thanh toán từ khách (admin duyệt).
              </div>
            )}

            {pendingChange && (
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-900">
                Đang có yêu cầu đổi TK chờ admin duyệt.
              </div>
            )}

            {msg && (
              <div className="px-4 py-2 text-xs" style={{ color: TEAL }}>
                {msg}
              </div>
            )}
            {err && <div className="px-4 py-2 text-xs text-red-600">{err}</div>}

            {!showBankForm ? (
              <div>
                {hasBank && currentBank?.bank_account && (
                  <div className="px-4 py-3 border-b border-border bg-muted/40">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">
                      Tài khoản hiện tại
                    </p>
                    <p className="text-sm font-semibold">
                      {currentBank.bank_name || currentBank.bank_code || "—"}
                    </p>
                    <p className="text-sm mt-0.5">
                      STK: <span className="font-mono font-semibold">{currentBank.bank_account}</span>
                    </p>
                    {currentBank.bank_account_name && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Chủ TK: {currentBank.bank_account_name}
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowBankForm(true)}
                  disabled={pendingChange}
                  className="w-full flex items-center gap-3 px-4 py-3.5 disabled:opacity-50"
                >
                  <Building2 size={18} style={{ color: TEAL }} />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold">
                      {hasBank ? "Gửi yêu cầu đổi TK ngân hàng" : "Gửi tài khoản ngân hàng"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {hasBank
                        ? "Thay đổi chỉ có hiệu lực sau khi admin duyệt"
                        : "Bắt buộc để nhận tiền đơn hàng"}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </button>
              </div>
            ) : (
              <div className="px-4 py-3 space-y-2">
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
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value.replace(/\s/g, ""))}
                  placeholder="Số tài khoản"
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
                  inputMode="numeric"
                />
                <input
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                  placeholder="Tên chủ tài khoản"
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowBankForm(false)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold border"
                    style={{ borderColor: TEAL, color: TEAL }}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={submitBankChange}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white"
                    style={{ background: TEAL }}
                  >
                    {saving ? "Đang gửi..." : "Gửi duyệt"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b border-border">
            Quyền truy cập
          </p>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <MapPin size={18} style={{ color: TEAL }} />
            <p className="flex-1 text-sm font-semibold">Vị trí</p>
            <span className="text-xs font-semibold" style={{ color: TEAL_LIGHT }}>
              Khi dùng ứng dụng
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
