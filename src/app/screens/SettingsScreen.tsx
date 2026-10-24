import { ChevronLeft, ChevronRight, Key, Laptop, MapPin, Mail, Building2, Eye, EyeOff } from "lucide-react";
import type { Screen } from "../types";
import type { Profile } from "../hooks/useProfile";
import { TEAL, TEAL_LIGHT, BG, VN_BANKS } from "../constants";
import { supabase } from "../lib/supabase";
import { useEffect, useState } from "react";

const LOC_PREF_KEY = "memento:location-pref:v1";

type LocPref = {
  /** Người dùng muốn dùng vị trí (toggle trong app) */
  enabled: boolean;
};

function loadLocPref(): LocPref {
  try {
    const raw = localStorage.getItem(LOC_PREF_KEY);
    if (!raw) return { enabled: false };
    const p = JSON.parse(raw) as Partial<LocPref>;
    return { enabled: !!p.enabled };
  } catch {
    return { enabled: false };
  }
}

function saveLocPref(p: LocPref) {
  try {
    localStorage.setItem(LOC_PREF_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

type BrowserLocState = "granted" | "denied" | "prompt" | "unsupported";

async function queryBrowserLocationState(): Promise<BrowserLocState> {
  try {
    if (typeof navigator === "undefined" || !navigator.geolocation) return "unsupported";
    // Permissions API (Chrome/Android/iOS Safari mới)
    if (navigator.permissions?.query) {
      try {
        const st = await navigator.permissions.query({ name: "geolocation" as PermissionName });
        if (st.state === "granted") return "granted";
        if (st.state === "denied") return "denied";
        return "prompt";
      } catch {
        /* fall through */
      }
    }
    return "prompt";
  } catch {
    return "unsupported";
  }
}

/** Xin quyền vị trí bằng cách gọi getCurrentPosition (trigger prompt hệ thống). */
function requestBrowserLocation(): Promise<"granted" | "denied"> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => resolve("granted"),
      (err) => {
        // 1 = PERMISSION_DENIED
        resolve(err?.code === 1 ? "denied" : "denied");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
    );
  });
}

function maskAccount(acc: string): string {
  const s = String(acc || "").replace(/\s/g, "");
  if (s.length <= 4) return "••••";
  return "•".repeat(Math.min(s.length - 4, 12)) + s.slice(-4);
}

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
  /** Ẩn STK mặc định — chỉ hiện khi bấm mắt */
  const [revealBank, setRevealBank] = useState(false);

  // ── Quyền vị trí ──
  const [locEnabled, setLocEnabled] = useState(false);
  const [locBrowser, setLocBrowser] = useState<BrowserLocState>("prompt");
  const [locBusy, setLocBusy] = useState(false);
  const [locHint, setLocHint] = useState<string | null>(null);

  useEffect(() => {
    const pref = loadLocPref();
    setLocEnabled(pref.enabled);
    queryBrowserLocationState().then(setLocBrowser);
  }, []);

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

  async function toggleLocation() {
    setLocHint(null);
    setLocBusy(true);
    try {
      if (locEnabled) {
        // Tắt trong app (không thu hồi quyền hệ thống — user làm trong Settings OS)
        setLocEnabled(false);
        saveLocPref({ enabled: false });
        setLocHint("Đã tắt dùng vị trí trong Memento.");
        return;
      }

      // Bật: xin quyền hệ thống nếu chưa có
      const state = await queryBrowserLocationState();
      setLocBrowser(state);

      if (state === "unsupported") {
        setLocHint("Thiết bị / trình duyệt không hỗ trợ vị trí.");
        return;
      }

      if (state === "denied") {
        setLocHint(
          "Quyền vị trí đã bị từ chối. Vào Cài đặt hệ thống → Memento (hoặc trình duyệt) → bật Vị trí, rồi thử lại."
        );
        return;
      }

      if (state === "prompt") {
        const result = await requestBrowserLocation();
        setLocBrowser(result);
        if (result !== "granted") {
          setLocHint("Bạn đã từ chối quyền vị trí. Có thể bật lại trong Cài đặt hệ thống.");
          return;
        }
      } else if (state === "granted") {
        // Đã có quyền — xác nhận vẫn dùng được
        const result = await requestBrowserLocation();
        if (result !== "granted") {
          setLocBrowser("denied");
          setLocHint("Không lấy được vị trí. Kiểm tra Cài đặt hệ thống.");
          return;
        }
      }

      setLocEnabled(true);
      saveLocPref({ enabled: true });
      setLocHint("Đã bật vị trí. Memento chỉ dùng khi bạn tìm PTG gần đây.");
    } finally {
      setLocBusy(false);
    }
  }

  function locStatusLabel(): string {
    if (locBrowser === "unsupported") return "Không hỗ trợ";
    if (!locEnabled) return "Đang tắt";
    if (locBrowser === "denied") return "Bị chặn";
    if (locBrowser === "granted") return "Đã bật";
    return "Chưa cấp quyền";
  }

  return (
    <div className="flex flex-col min-h-full pb-24" style={{ background: BG }}>
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
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                        Tài khoản hiện tại
                      </p>
                      <button
                        type="button"
                        onClick={() => setRevealBank((v) => !v)}
                        className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted"
                        aria-label={revealBank ? "Ẩn số tài khoản" : "Hiện số tài khoản"}
                        title={revealBank ? "Ẩn" : "Hiện"}
                      >
                        {revealBank ? (
                          <EyeOff size={16} style={{ color: TEAL }} />
                        ) : (
                          <Eye size={16} style={{ color: TEAL }} />
                        )}
                      </button>
                    </div>
                    <p className="text-sm font-semibold">
                      {currentBank.bank_name || currentBank.bank_code || "—"}
                    </p>
                    <p className="text-sm mt-0.5">
                      STK:{" "}
                      <span className="font-mono font-semibold">
                        {revealBank
                          ? currentBank.bank_account
                          : maskAccount(currentBank.bank_account)}
                      </span>
                    </p>
                    {currentBank.bank_account_name && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Chủ TK:{" "}
                        {revealBank
                          ? currentBank.bank_account_name
                          : maskName(currentBank.bank_account_name)}
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
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Vị trí</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Dùng để gợi ý nhiếp ảnh gia gần bạn. Chỉ bật khi bạn cho phép.
              </p>
            </div>
            <button
              type="button"
              disabled={locBusy || locBrowser === "unsupported"}
              onClick={toggleLocation}
              className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
              style={{ background: locEnabled && locBrowser === "granted" ? TEAL : "#d1d5db" }}
              aria-label="Bật/tắt vị trí"
              role="switch"
              aria-checked={locEnabled && locBrowser === "granted"}
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                style={{
                  transform:
                    locEnabled && locBrowser === "granted" ? "translateX(20px)" : "translateX(0)",
                }}
              />
            </button>
          </div>
          <div className="px-4 pb-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              Trạng thái: <strong style={{ color: TEAL }}>{locStatusLabel()}</strong>
            </span>
          </div>
          {locHint && (
            <div className="px-4 pb-3 text-[11px] leading-relaxed text-muted-foreground">
              {locHint}
            </div>
          )}
          {locBrowser === "denied" && (
            <div className="px-4 pb-3 text-[11px] leading-relaxed text-amber-800 bg-amber-50 border-t border-amber-100">
              Quyền đã bị chặn ở hệ thống. Mở Cài đặt máy → Ứng dụng / Trình duyệt → Memento → bật
              Vị trí, rồi quay lại bật tại đây.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function maskName(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "••••";
  if (parts.length === 1) {
    const s = parts[0];
    if (s.length <= 2) return "•".repeat(s.length);
    return s[0] + "•".repeat(s.length - 1);
  }
  // Hiện chữ cái đầu mỗi từ, che phần còn lại
  return parts.map((p) => p[0] + "•".repeat(Math.max(p.length - 1, 1))).join(" ");
}
