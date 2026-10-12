import { useState } from "react";
import { ChevronLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";
import type { Screen } from "../types";
import type { Profile } from "../hooks/useProfile";
import { TEAL, TEAL_MID, BG } from "../constants";
import { FieldBox } from "../components/shared/FieldBox";
import { OtpInput } from "../components/shared/OtpInput";
import { supabase } from "../lib/supabase";
import { translateAuthError } from "../lib/authErrors";
import { validatePasswordStrength, PASSWORD_HINT } from "../lib/password";
import { Captcha, CAPTCHA_ENABLED } from "../components/Captcha";

type Step = "current" | "forgot-otp" | "new" | "done";
// Progress bar chỉ có 2 chấm dù đi đường nào: bước xác minh danh tính
// (mật khẩu cũ HOẶC OTP quên mật khẩu) rồi tới bước đặt mật khẩu mới.
const STEP_INDEX: Record<Step, number> = { current: 0, "forgot-otp": 0, new: 1, done: 1 };

export default function ChangePasswordFlow({
  setScreen, profile, setIgnoreRecoveryEvent,
}: {
  setScreen: (s: Screen) => void;
  profile: Profile | null;
  setIgnoreRecoveryEvent: (v: boolean) => void;
}) {
  const [step, setStep] = useState<Step>("current");
  const stepIndex = STEP_INDEX[step];

  const [currentPassword, setCurrentPassword] = useState("");
  // Chỉ lưu lại khi xác minh qua ĐÚNG mật khẩu hiện tại (đường 1) — để so
  // sánh không cho đặt trùng mật khẩu cũ. Đường "quên mật khẩu" (OTP) không
  // biết mật khẩu cũ là gì nên không áp dụng việc kiểm tra này.
  const [verifiedCurrentPassword, setVerifiedCurrentPassword] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaResetKey(k => k + 1);
  }

  function goBack() {
    setError(null);
    if (step === "new" || step === "forgot-otp") setStep("current");
    else setScreen("privacy");
  }

  // ── ĐƯỜNG 1: xác nhận bằng mật khẩu hiện tại ────────────────────────────
  async function submitCurrentPassword() {
    if (!currentPassword) { setError("Vui lòng nhập mật khẩu hiện tại."); return; }
    if (!profile?.email) { setError("Không tìm thấy email tài khoản."); return; }
    if (CAPTCHA_ENABLED && !captchaToken) { setError("Vui lòng hoàn thành xác minh CAPTCHA."); return; }
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: profile.email, password: currentPassword,
      options: { captchaToken: captchaToken ?? undefined },
    });
    setBusy(false);
    resetCaptcha();
    if (err) { setError("Mật khẩu hiện tại không đúng, vui lòng thử lại."); return; }
    setVerifiedCurrentPassword(currentPassword);
    setCurrentPassword("");
    setStep("new");
  }

  // ── ĐƯỜNG 2: quên mật khẩu — gửi & xác minh OTP qua email thay thế ──────
  async function requestForgotOtp() {
    if (!profile?.email) { setError("Không tìm thấy email tài khoản."); return; }
    if (CAPTCHA_ENABLED && !captchaToken) { setError("Vui lòng hoàn thành xác minh CAPTCHA."); return; }
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(profile.email, {
      captchaToken: captchaToken ?? undefined,
    });
    setBusy(false);
    resetCaptcha();
    if (err) { setError(translateAuthError(err.message)); return; }
    setCurrentPassword("");
    setVerifiedCurrentPassword(null);
    setStep("forgot-otp");
  }

  async function verifyForgotOtp() {
    if (!profile?.email) return;
    if (!otp || otp.length < 6) { setError("Nhập đủ 6 số vừa gửi tới email."); return; }
    setError(null);
    setBusy(true);
    // Mượn cơ chế OTP "recovery" của Supabase nhưng xử lý ngay trong màn
    // này — cần chặn App.tsx hiểu nhầm thành yêu cầu quên mật khẩu toàn cục
    // và tự đá người dùng ra màn đăng nhập.
    setIgnoreRecoveryEvent(true);
    const { error: err } = await supabase.auth.verifyOtp({ email: profile.email, token: otp, type: "recovery" });
    setIgnoreRecoveryEvent(false);
    setBusy(false);
    if (err) { setError(translateAuthError(err.message)); return; }
    setOtp("");
    setStep("new");
  }

  // ── BƯỚC CUỐI: đặt mật khẩu mới (chung cho cả 2 đường) ──────────────────
  async function submitNewPassword() {
    const pwErr = newPassword ? validatePasswordStrength(newPassword) : "Vui lòng nhập mật khẩu mới.";
    if (pwErr) { setError(pwErr); return; }
    if (newPassword !== confirmPassword) { setError("Mật khẩu nhập lại không khớp."); return; }
    if (verifiedCurrentPassword && newPassword === verifiedCurrentPassword) {
      setError("Mật khẩu mới không được trùng với mật khẩu hiện tại."); return;
    }
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (err) { setError(translateAuthError(err.message)); return; }
    setStep("done");
  }

  const ProgressDots = () => (
    <div className="flex items-center gap-1.5 mb-8">
      {[0, 1].map(i => (
        <div key={i} className="h-1.5 rounded-full flex-1 transition-colors"
          style={{ background: i <= stepIndex ? TEAL : "#e5e7eb" }} />
      ))}
    </div>
  );

  if (step === "done") {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-8 text-center" style={{ background: BG }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "#e8f5f0" }}>
          <CheckCircle2 size={32} style={{ color: TEAL }} />
        </div>
        <h2 className="font-black text-xl mb-2" style={{ color: TEAL }}>Đã đổi mật khẩu!</h2>
        <p className="text-sm text-muted-foreground mb-8">
          Mật khẩu đăng nhập của bạn đã được cập nhật thành công.
        </p>
        <button onClick={() => setScreen("privacy")}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform"
          style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
          Quay lại Cài đặt
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen px-6 pt-14 pb-10" style={{ background: BG }}>
      <div className="flex items-center mb-6">
        <button onClick={goBack} className="w-9 h-9 rounded-full bg-white border border-border flex items-center justify-center">
          <ChevronLeft size={18} style={{ color: TEAL }} />
        </button>
      </div>
      <ProgressDots />

      {step === "current" && (
        <>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Xác nhận mật khẩu hiện tại</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Vì lý do bảo mật, nhập mật khẩu hiện tại trước khi đặt mật khẩu mới.
          </p>
          <FieldBox label="Mật khẩu hiện tại" error={error ?? undefined}>
            <input type="password" value={currentPassword} onChange={e => { setCurrentPassword(e.target.value); setError(null); }}
              className="flex-1 bg-transparent text-sm outline-none" placeholder="••••••••" autoFocus />
          </FieldBox>
          <button onClick={requestForgotOtp} disabled={busy} className="text-xs font-semibold mb-4 self-start" style={{ color: TEAL }}>
            Quên mật khẩu?
          </button>
          <Captcha onToken={setCaptchaToken} resetKey={captchaResetKey} />
          <button onClick={submitCurrentPassword} disabled={busy}
            className="w-full mt-auto py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
            {busy ? "Đang kiểm tra..." : "Tiếp tục"}
          </button>
        </>
      )}

      {step === "forgot-otp" && (
        <>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Xác minh qua email</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Mã xác minh 6 số đã được gửi tới {profile?.email}. Nhập mã để tiếp tục đặt mật khẩu mới.
          </p>
          <OtpInput value={otp} onChange={v => { setOtp(v); setError(null); }} error={error ?? undefined} />
          <div className="text-center mt-4">
            <button onClick={() => setStep("current")} disabled={busy} className="text-xs font-bold" style={{ color: TEAL }}>
              Chưa nhận được mã? Gửi lại
            </button>
          </div>
          <button onClick={verifyForgotOtp} disabled={busy}
            className="w-full mt-auto py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
            {busy ? "Đang xác minh..." : "Xác nhận"}
          </button>
        </>
      )}

      {step === "new" && (
        <>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Đặt mật khẩu mới</h2>
          <p className="text-sm text-muted-foreground mb-8">Đã xác minh danh tính thành công.</p>
          <FieldBox label="Mật khẩu mới" error={error ?? undefined} hint={!error ? PASSWORD_HINT : undefined}>
            <input type={showPw ? "text" : "password"} value={newPassword} onChange={e => { setNewPassword(e.target.value); setError(null); }}
              className="flex-1 bg-transparent text-sm outline-none" placeholder="••••••••" autoFocus />
            <button type="button" onClick={() => setShowPw(s => !s)} className="text-muted-foreground">
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </FieldBox>
          <FieldBox label="Nhập lại mật khẩu mới">
            <input type={showPw ? "text" : "password"} value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setError(null); }}
              className="flex-1 bg-transparent text-sm outline-none" placeholder="••••••••" />
            <button type="button" onClick={() => setShowPw(s => !s)} className="text-muted-foreground">
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </FieldBox>
          <button onClick={submitNewPassword} disabled={busy}
            className="w-full mt-auto py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
            {busy ? "Đang lưu..." : "Đổi mật khẩu"}
          </button>
        </>
      )}
    </div>
  );
}
