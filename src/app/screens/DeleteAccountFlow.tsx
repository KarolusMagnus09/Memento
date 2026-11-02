import { useBackHandler } from "../lib/backNavigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import type { Screen } from "../types";
import type { Profile } from "../hooks/useProfile";
import { TEAL, TEAL_MID, BG } from "../constants";
import { FieldBox } from "../components/shared/FieldBox";
import { OtpInput } from "../components/shared/OtpInput";
import { Captcha, CAPTCHA_ENABLED } from "../components/Captcha";
import { supabase } from "../lib/supabase";
import { setPendingAction, clearPendingAction } from "../lib/pendingAction";
import { verifyMyPassword } from "../lib/verifyPassword";
import { translateAuthError } from "../lib/authErrors";
import { signOutSafely } from "../lib/pushNotifications";
import { deleteMyAccount, fetchDeletionBlockers, type DeletionBlockers } from "../lib/deletedAccount";

/**
 * Xóa tài khoản — MỘT màn hình, mỗi lần chỉ hiện MỘT bước:
 *   1. Nhập mật khẩu  →  (gửi OTP về email)
 *   2. Nhập OTP 6 số
 *   3. Kiểm tra không còn đơn nào đang thực hiện (tự chạy)
 *   4. Lời tạm biệt + nút xác nhận phải đợi 5 giây
 *   5. Đã xóa → đăng xuất
 *
 * Server (delete_my_account) kiểm tra lại OTP còn mới (≤ 15 phút) và điều kiện xóa,
 * nên dù ai gọi thẳng API cũng không bỏ qua được các bước này.
 */
type Step = "password" | "otp" | "checking" | "blocked" | "goodbye" | "done";

const SEGMENTS = 4;
const STEP_SEGMENT: Record<Step, number> = { password: 0, otp: 1, checking: 2, blocked: 2, goodbye: 3, done: 3 };

/** Nút xác nhận xóa bị khóa bao nhiêu giây sau khi vào bước cuối */
const CONFIRM_WAIT_S = 5;
const RESEND_COOLDOWN_S = 60;
const DANGER = "#dc2626";

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const keep = name.slice(0, Math.min(2, name.length));
  return `${keep}${"•".repeat(Math.max(name.length - keep.length, 2))}@${domain}`;
}

export default function DeleteAccountFlow({
  setScreen,
  profile,
  setIgnoreRecoveryEvent,
}: {
  setScreen: (s: Screen) => void;
  profile: Profile | null;
  setIgnoreRecoveryEvent: (v: boolean) => void;
}) {
  const email = profile?.email ?? "";
  const isPtg = profile?.role === "photographer";
  const displayName = profile?.full_name || profile?.username || "bạn";

  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [resendIn, setResendIn] = useState(0);

  const [blockers, setBlockers] = useState<DeletionBlockers | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checkOk, setCheckOk] = useState(false);

  const [count, setCount] = useState(CONFIRM_WAIT_S);
  const finishing = useRef(false);

  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaResetKey((k) => k + 1);
  }

  /* ── Thoát màn hình (hủy giữa chừng) thì dọn cờ đánh dấu "xóa tài khoản" ──
     Cố ý KHÔNG dọn ngay sau verifyOtp: server còn kiểm tra OTP còn mới ở bước xóa,
     giữ nguyên phiên cho chắc. Xóa xong thì tài khoản đã mất nên cờ cũng hết. */
  useEffect(() => () => { void clearPendingAction(); }, []);

  function goBack() {
    setError(null);
    setNotice(null);
    if (step === "otp") {
      setOtp("");
      setStep("password");
    } else {
      setScreen("privacy"); // Cài đặt
    }
  }

  useBackHandler(true, () => {
    if (busy || step === "checking" || step === "done") return; // đang xử lý / đã xóa: không cho lùi
    goBack();
  });

  /* ── Đếm ngược gửi lại mã ── */
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  /* ── Đếm ngược nút xác nhận ở bước cuối ── */
  useEffect(() => {
    if (step !== "goodbye") return;
    setCount(CONFIRM_WAIT_S);
    const id = window.setInterval(() => setCount((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  /* ── Xóa xong: tự đăng xuất sau vài giây ── */
  useEffect(() => {
    if (step !== "done") return;
    const t = window.setTimeout(() => void finish(), 6000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    // Phiên đã bị server thu hồi nên các lệnh này có thể báo lỗi — bỏ qua, chỉ cần dọn phiên trên máy.
    try { await signOutSafely(); } catch { /* ignore */ }
    try { await supabase.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
  }

  /* ── Bước 1: mật khẩu → gửi OTP ── */
  async function submitPassword() {
    if (!password) { setError("Vui lòng nhập mật khẩu."); return; }
    if (!email) { setError("Không tìm thấy email tài khoản."); return; }
    if (CAPTCHA_ENABLED && !captchaToken) { setError("Vui lòng hoàn thành xác minh CAPTCHA."); return; }
    setError(null);
    setNotice(null);
    setBusy(true);
    // Kiểm tra mật khẩu bằng RPC (không dùng CAPTCHA) để token CAPTCHA chỉ dùng 1 lần cho việc gửi OTP.
    const check = await verifyMyPassword(password);
    if (check.result !== "ok") {
      setBusy(false);
      setError(
        check.result === "wrong" ? "Mật khẩu không đúng, vui lòng thử lại."
        : check.result === "locked" ? "Bạn nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút."
        : translateAuthError(check.message ?? ""),
      );
      return;
    }
    // Gửi mã xác minh tới email (token CAPTCHA vừa giải được dùng đúng 1 lần ở đây).
    await setPendingAction("delete_account"); // để email ra nội dung "Xác nhận xóa tài khoản"
    const { error: otpErr } = await supabase.auth.resetPasswordForEmail(email, {
      captchaToken: captchaToken ?? undefined,
    });
    setBusy(false);
    resetCaptcha();
    setPassword("");
    if (otpErr) { setError(translateAuthError(otpErr.message)); return; }
    setOtp("");
    setResendIn(RESEND_COOLDOWN_S);
    setStep("otp");
  }

  async function resendOtp() {
    if (resendIn > 0 || busy) return;
    // Có CAPTCHA thì phải giải lại → quay về bước mật khẩu (giống các luồng khác trong app)
    if (CAPTCHA_ENABLED) { setOtp(""); setError(null); setStep("password"); return; }
    setError(null);
    setBusy(true);
    await setPendingAction("delete_account");
    const { error: err } = await supabase.auth.resetPasswordForEmail(email);
    setBusy(false);
    if (err) { setError(translateAuthError(err.message)); return; }
    setNotice("Đã gửi lại mã vào email của bạn.");
    setResendIn(RESEND_COOLDOWN_S);
  }

  /* ── Bước 2: OTP ── */
  async function verifyOtp() {
    if (!email) return;
    if (!otp || otp.length < 6) { setError("Nhập đủ 6 số vừa gửi tới email."); return; }
    setError(null);
    setNotice(null);
    setBusy(true);
    // Mượn cơ chế OTP "recovery" của Supabase để chứng minh quyền truy cập email,
    // nên phải báo App bỏ qua sự kiện PASSWORD_RECOVERY (nếu không sẽ bị đá ra màn đăng nhập).
    setIgnoreRecoveryEvent(true);
    const { error: err } = await supabase.auth.verifyOtp({ email, token: otp, type: "recovery" });
    setIgnoreRecoveryEvent(false);
    setBusy(false);
    if (err) { setError(translateAuthError(err.message)); return; }
    setOtp("");
    void runCheck();
  }

  /* ── Bước 3: kiểm tra đơn đang thực hiện ── */
  async function runCheck() {
    setStep("checking");
    setCheckError(null);
    setCheckOk(false);
    setBlockers(null);
    const [res] = await Promise.all([fetchDeletionBlockers(), sleep(1100)]); // chờ tối thiểu để người dùng kịp thấy đang kiểm tra
    if (res.error || !res.data) {
      setCheckError("Chưa kiểm tra được, vui lòng thử lại.");
      return;
    }
    setBlockers(res.data);
    if (res.data.blocked) {
      setStep("blocked");
      return;
    }
    setCheckOk(true);
    await sleep(800);
    setStep("goodbye");
  }

  /* ── Bước 4: xác nhận xóa ── */
  async function confirmDelete() {
    if (count > 0 || busy) return;
    setBusy(true);
    setError(null);
    const err = await deleteMyAccount();
    setBusy(false);
    if (err) {
      if (err.code === "OTP_REQUIRED") {
        setOtp("");
        setNotice(err.message);
        setStep("password");
        return;
      }
      if (err.code === "BLOCKED") { void runCheck(); return; }
      setError(err.message);
      return;
    }
    setStep("done");
  }

  const primaryBtn = "w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60";
  const primaryStyle = { background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` };

  /* ───────────── Đã xóa xong ───────────── */
  if (step === "done") {
    return (
      <div className="flex flex-col min-h-full items-center justify-center px-8 text-center" style={{ background: BG }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "#e8f5f0" }}>
          <CheckCircle2 size={32} style={{ color: TEAL }} />
        </div>
        <h2 className="font-black text-xl mb-2" style={{ color: TEAL }}>Tài khoản đã được xóa</h2>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          Cảm ơn bạn đã từng đồng hành cùng Memento. Chúc bạn luôn có thật nhiều khoảnh khắc đẹp. Hẹn gặp lại 💚
        </p>
        <button onClick={() => void finish()} className={primaryBtn} style={primaryStyle}>
          Về trang đăng nhập
        </button>
      </div>
    );
  }

  const seg = STEP_SEGMENT[step];

  return (
    <div className="flex flex-col min-h-full px-6 pt-14 pb-10" style={{ background: BG }}>
      <div className="flex items-center mb-6">
        <button
          onClick={goBack}
          disabled={busy || step === "checking"}
          aria-label="Quay lại"
          className="w-9 h-9 rounded-full bg-white border border-border flex items-center justify-center disabled:opacity-50"
        >
          <ChevronLeft size={18} style={{ color: TEAL }} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 mb-8">
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <div
            key={i}
            className="h-1.5 rounded-full flex-1 transition-colors"
            style={{ background: i <= seg ? (step === "goodbye" ? DANGER : TEAL) : "#e5e7eb" }}
          />
        ))}
      </div>

      {notice && (
        <div className="mb-4 px-4 py-3 rounded-2xl text-xs leading-relaxed font-semibold"
          style={{ background: "#FFF8E7", color: "#92400e", border: "1px solid #FDE68A" }} role="status">
          {notice}
        </div>
      )}

      {/* ───── 1. Mật khẩu ───── */}
      {step === "password" && (
        <>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Xác nhận mật khẩu</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Để bảo vệ tài khoản, hãy nhập mật khẩu hiện tại. Chúng mình sẽ gửi mã xác minh về email của bạn ở bước kế tiếp.
          </p>
          <FieldBox label="Mật khẩu hiện tại" error={error ?? undefined}>
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void submitPassword(); }}
              className="flex-1 bg-transparent text-sm outline-none"
              placeholder="••••••••"
              autoFocus
            />
            <button type="button" onClick={() => setShowPw((s) => !s)} className="text-muted-foreground" aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </FieldBox>
          <Captcha onToken={setCaptchaToken} resetKey={captchaResetKey} />
          <button onClick={() => void submitPassword()} disabled={busy} className={`${primaryBtn} mt-auto`} style={primaryStyle}>
            {busy ? "Đang kiểm tra..." : "Tiếp tục"}
          </button>
        </>
      )}

      {/* ───── 2. OTP ───── */}
      {step === "otp" && (
        <>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Xác minh qua email</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Mã 6 số đã được gửi tới <strong>{maskEmail(email)}</strong>. Nhập mã để tiếp tục.
          </p>
          <OtpInput value={otp} onChange={(v) => { setOtp(v); setError(null); }} error={error ?? undefined} />
          <div className="text-center mt-4">
            <button
              onClick={() => void resendOtp()}
              disabled={busy || resendIn > 0}
              className="text-xs font-bold disabled:opacity-50"
              style={{ color: TEAL }}
            >
              {resendIn > 0 ? `Gửi lại mã sau ${resendIn}s` : "Chưa nhận được mã? Gửi lại"}
            </button>
          </div>
          <button onClick={() => void verifyOtp()} disabled={busy} className={`${primaryBtn} mt-auto`} style={primaryStyle}>
            {busy ? "Đang xác minh..." : "Xác nhận"}
          </button>
        </>
      )}

      {/* ───── 3. Kiểm tra đơn đang thực hiện ───── */}
      {step === "checking" && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
          {checkError ? (
            <>
              <AlertTriangle size={36} className="mb-3" style={{ color: "#d97706" }} />
              <p className="text-sm font-semibold mb-1">{checkError}</p>
              <div className="flex gap-2 w-full mt-6">
                <button onClick={() => setScreen("privacy")} className="flex-1 py-3 rounded-2xl text-sm font-bold border" style={{ borderColor: TEAL, color: TEAL }}>
                  Quay lại
                </button>
                <button onClick={() => void runCheck()} className="flex-1 py-3 rounded-2xl text-sm font-bold text-white" style={{ background: TEAL }}>
                  Thử lại
                </button>
              </div>
            </>
          ) : checkOk ? (
            <>
              <CheckCircle2 size={40} className="mb-3" style={{ color: TEAL }} />
              <h2 className="text-lg font-black mb-1" style={{ color: TEAL }}>Mọi thứ đã sẵn sàng</h2>
              <p className="text-sm text-muted-foreground">Không có đơn nào đang thực hiện.</p>
            </>
          ) : (
            <>
              <Loader2 size={40} className="mb-3 animate-spin" style={{ color: TEAL }} />
              <h2 className="text-lg font-black mb-1" style={{ color: TEAL }}>Đang kiểm tra…</h2>
              <p className="text-sm text-muted-foreground">
                {isPtg ? "Đang xem bạn còn deal nào đang thực hiện hay không." : "Đang xem bạn còn đơn nào đang thực hiện hay không."}
              </p>
            </>
          )}
        </div>
      )}

      {/* ───── 3b. Chưa thể xóa ───── */}
      {step === "blocked" && blockers && (
        <>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: "#FFF8E7" }}>
            <AlertTriangle size={28} style={{ color: "#d97706" }} />
          </div>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Chưa thể xóa tài khoản</h2>
          <div className="flex flex-col gap-3 text-sm leading-relaxed mb-6">
            {blockers.is_admin && (
              <p className="bg-white rounded-2xl border border-border px-4 py-3">
                Tài khoản quản trị (admin) không thể tự xóa. Hãy liên hệ chủ hệ thống nếu cần.
              </p>
            )}
            {blockers.active_deals > 0 && (
              <p className="bg-white rounded-2xl border border-border px-4 py-3">
                Bạn còn <strong>{blockers.active_deals}</strong> đơn đang thực hiện. Hãy hoàn tất hoặc hủy các đơn này, rồi quay lại xóa tài khoản.
              </p>
            )}
            {blockers.pending_refunds > 0 && (
              <p className="bg-white rounded-2xl border border-border px-4 py-3">
                Còn <strong>{blockers.pending_refunds}</strong> khoản hoàn cọc đang chờ Memento xử lý. Khi hoàn xong bạn có thể xóa tài khoản.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 mt-auto">
            {blockers.active_deals > 0 && (
              <button onClick={() => setScreen("bookings")} className={primaryBtn} style={primaryStyle}>
                Xem lịch hẹn của tôi
              </button>
            )}
            {!blockers.is_admin && (
              <button onClick={() => void runCheck()} className="w-full py-3 rounded-2xl text-sm font-bold border bg-white" style={{ borderColor: TEAL, color: TEAL }}>
                Kiểm tra lại
              </button>
            )}
            <button onClick={() => setScreen("privacy")} className="w-full py-3 text-sm font-semibold text-muted-foreground">
              Quay lại Cài đặt
            </button>
          </div>
        </>
      )}

      {/* ───── 4. Lời tạm biệt + xác nhận ───── */}
      {step === "goodbye" && (
        <>
          <div className="text-5xl mb-4" aria-hidden>👋</div>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Tạm biệt, {displayName}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            Cảm ơn bạn đã đồng hành cùng Memento. Mỗi bức ảnh, mỗi buổi chụp bạn từng tham gia đều là một phần đáng nhớ của cộng đồng này. Chúng mình tiếc khi phải chia tay, và luôn chúc bạn nhiều niềm vui.
          </p>
          <ul className="bg-white rounded-2xl border border-border px-4 py-3 text-xs leading-relaxed flex flex-col gap-2 mb-4">
            <li>• Hồ sơ, ảnh đại diện và thông tin cá nhân của bạn sẽ bị xóa.</li>
            <li>• Những người từng trò chuyện hoặc làm việc với bạn vẫn giữ lại tin nhắn và đơn cũ, nhưng sẽ thấy tên bạn là “Người dùng đã bị xóa”.</li>
            <li>• Hành động này <strong>không thể hoàn tác</strong>.</li>
          </ul>

          {error && <p className="text-xs text-red-600 mb-2 text-center" role="alert">{error}</p>}

          <div className="flex flex-col gap-2 mt-auto">
            <button
              onClick={() => void confirmDelete()}
              disabled={count > 0 || busy}
              className="relative overflow-hidden w-full py-3.5 rounded-2xl text-white font-bold text-base active:scale-95 transition-transform"
              style={{ background: count > 0 || busy ? "#fca5a5" : DANGER }}
            >
              {count > 0 && (
                <span
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${((CONFIRM_WAIT_S - count) / CONFIRM_WAIT_S) * 100}%`,
                    background: DANGER,
                    transition: "width 1s linear",
                  }}
                />
              )}
              <span className="relative">
                {busy ? "Đang xóa..." : count > 0 ? `Xác nhận xóa tài khoản (${count}s)` : "Xác nhận xóa tài khoản"}
              </span>
            </button>
            <button
              onClick={() => setScreen("privacy")}
              disabled={busy}
              className="w-full py-3.5 rounded-2xl font-bold text-base border bg-white disabled:opacity-60"
              style={{ borderColor: TEAL, color: TEAL }}
            >
              Ở lại với Memento
            </button>
          </div>
        </>
      )}
    </div>
  );
}
