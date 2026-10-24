import { useBackHandler } from "../lib/backNavigation";
import { useState } from "react";
import { ChevronLeft, CheckCircle2 } from "lucide-react";
import type { Screen } from "../types";
import type { Profile } from "../hooks/useProfile";
import { TEAL, TEAL_MID, BG } from "../constants";
import { OtpInput } from "../components/shared/OtpInput";
import { FieldBox } from "../components/shared/FieldBox";
import { supabase } from "../lib/supabase";
import { translateAuthError } from "../lib/authErrors";
import { Captcha, CAPTCHA_ENABLED } from "../components/Captcha";

type Step = "password" | "current-otp" | "new-email" | "new-otp" | "done";
const STEPS: Step[] = ["password", "current-otp", "new-email", "new-otp"];

export default function ChangeEmailFlow({
  setScreen, profile, refreshProfile, setIgnoreRecoveryEvent,
}: {
  setScreen: (s: Screen) => void;
  profile: Profile | null;
  refreshProfile: () => void;
  setIgnoreRecoveryEvent: (v: boolean) => void;
}) {
  const [step, setStep] = useState<Step>("password");
  const stepIndex = STEPS.indexOf(step);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newEmail, setNewEmail] = useState("");
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
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
    else setScreen("personal-info");
  }

  useBackHandler(true, () => {
    if (step === "done") return false; // đã xong: lùi màn như bình thường
    goBack();
  });

  // ── BƯỚC 1: xác nhận đúng là chủ tài khoản bằng mật khẩu hiện tại ───────
  async function submitPassword() {
    if (!password || !confirmPassword) { setError("Vui lòng nhập đầy đủ cả 2 ô mật khẩu."); return; }
    if (password !== confirmPassword) { setError("Mật khẩu nhập lại không khớp."); return; }
    if (!profile?.email) { setError("Không tìm thấy email tài khoản."); return; }
    if (CAPTCHA_ENABLED && !captchaToken) { setError("Vui lòng hoàn thành xác minh CAPTCHA."); return; }
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: profile.email, password,
      options: { captchaToken: captchaToken ?? undefined },
    });
    if (err) {
      setBusy(false);
      resetCaptcha();
      setError("Mật khẩu không đúng, vui lòng thử lại.");
      return;
    }
    // Gửi mã xác minh tới email hiện tại luôn, dùng chung token CAPTCHA vừa
    // giải (token dùng 1 lần, phải dùng trước khi bị reset).
    const { error: otpErr } = await supabase.auth.resetPasswordForEmail(profile.email, {
      captchaToken: captchaToken ?? undefined,
    });
    setBusy(false);
    resetCaptcha();
    setPassword(""); setConfirmPassword("");
    if (otpErr) { setError(translateAuthError(otpErr.message)); return; }
    setStep("current-otp");
  }

  // ── BƯỚC 2: xác minh mã tới email HIỆN TẠI ──────────────────────────────

  async function verifyCurrentEmailOtp() {
    if (!profile?.email) return;
    if (!otp || otp.length < 6) { setError("Nhập đủ 6 số vừa gửi tới email hiện tại."); return; }
    setError(null);
    setBusy(true);
    setIgnoreRecoveryEvent(true);
    const { error: err } = await supabase.auth.verifyOtp({ email: profile.email, token: otp, type: "recovery" });
    setIgnoreRecoveryEvent(false);
    setBusy(false);
    if (err) { setError(translateAuthError(err.message)); return; }
    setOtp("");
    setStep("new-email");
  }

  // ── BƯỚC 3: nhập email mới → Supabase gửi mã tới email mới ─────────────
  async function submitNewEmail() {
    const trimmed = newEmail.trim();
    if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) { setError("Email không hợp lệ."); return; }
    if (trimmed.toLowerCase() === (profile?.email ?? "").toLowerCase()) { setError("Đây là email hiện tại của bạn."); return; }
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ email: trimmed });
    setBusy(false);
    if (err) { setError(translateAuthError(err.message)); return; }
    setNewEmail(trimmed);
    setStep("new-otp");
  }

  // ── BƯỚC 4: xác minh mã gửi tới email mới → hoàn tất đổi email ──────────
  async function verifyNewEmailOtp() {
    if (!otp || otp.length < 6) { setError("Nhập đủ 6 số vừa gửi tới email mới."); return; }
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp({ email: newEmail, token: otp, type: "email_change" });
    setBusy(false);
    if (err) { setError(translateAuthError(err.message)); return; }
    refreshProfile();
    setStep("done");
  }

  const ProgressDots = () => (
    <div className="flex items-center gap-1.5 mb-8">
      {STEPS.map((s, i) => (
        <div key={s} className="h-1.5 rounded-full flex-1 transition-colors"
          style={{ background: i <= stepIndex ? TEAL : "#e5e7eb" }} />
      ))}
    </div>
  );

  if (step === "done") {
    return (
      <div className="flex flex-col min-h-full items-center justify-center px-8 text-center" style={{ background: BG }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "#e8f5f0" }}>
          <CheckCircle2 size={32} style={{ color: TEAL }} />
        </div>
        <h2 className="font-black text-xl mb-2" style={{ color: TEAL }}>Đã đổi email!</h2>
        <p className="text-sm text-muted-foreground mb-8">
          Email đăng nhập của bạn đã được cập nhật thành {newEmail}.
        </p>
        <button onClick={() => setScreen("personal-info")}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform"
          style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
          Quay lại Thông tin cá nhân
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full px-6 pt-14 pb-10" style={{ background: BG }}>
      <div className="flex items-center mb-6">
        <button onClick={goBack} className="w-9 h-9 rounded-full bg-white border border-border flex items-center justify-center">
          <ChevronLeft size={18} style={{ color: TEAL }} />
        </button>
      </div>
      <ProgressDots />

      {step === "password" && (
        <>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Xác nhận mật khẩu</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Vì lý do bảo mật, nhập lại mật khẩu hiện tại trước khi đổi email.
          </p>
          <FieldBox label="Mật khẩu hiện tại">
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(null); }}
              className="flex-1 bg-transparent text-sm outline-none" placeholder="••••••••" autoFocus />
          </FieldBox>
          <FieldBox label="Nhập lại mật khẩu hiện tại" error={error ?? undefined}>
            <input type="password" value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setError(null); }}
              className="flex-1 bg-transparent text-sm outline-none" placeholder="••••••••" />
          </FieldBox>
          <Captcha onToken={setCaptchaToken} resetKey={captchaResetKey} />
          <button onClick={submitPassword} disabled={busy}
            className="w-full mt-auto py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
            {busy ? "Đang kiểm tra..." : "Tiếp tục"}
          </button>
        </>
      )}

      {step === "current-otp" && (
        <>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Xác minh email hiện tại</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Mã xác minh 6 số đã được gửi tới {profile?.email}.
          </p>
          <OtpInput value={otp} onChange={v => { setOtp(v); setError(null); }} error={error ?? undefined} />
          <div className="text-center mt-4">
            <button onClick={() => setStep("password")} disabled={busy} className="text-xs font-bold" style={{ color: TEAL }}>
              Chưa nhận được mã? Gửi lại
            </button>
          </div>
          <button onClick={verifyCurrentEmailOtp} disabled={busy}
            className="w-full mt-auto py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
            {busy ? "Đang xác minh..." : "Xác nhận"}
          </button>
        </>
      )}

      {step === "new-email" && (
        <>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Nhập email mới</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Đã xác minh danh tính thành công. Nhập địa chỉ email mới bạn muốn chuyển sang.
          </p>
          <FieldBox label="Email mới" error={error ?? undefined}>
            <input type="email" value={newEmail} onChange={e => { setNewEmail(e.target.value); setError(null); }}
              className="flex-1 bg-transparent text-sm outline-none" placeholder="ten_moi@gmail.com" autoFocus />
          </FieldBox>
          <button onClick={submitNewEmail} disabled={busy}
            className="w-full mt-auto py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
            {busy ? "Đang gửi mã..." : "Gửi mã xác minh"}
          </button>
        </>
      )}

      {step === "new-otp" && (
        <>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Xác minh email mới</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Mã xác minh 6 số đã được gửi tới {newEmail}.
          </p>
          <OtpInput value={otp} onChange={v => { setOtp(v); setError(null); }} error={error ?? undefined} />
          <button onClick={verifyNewEmailOtp} disabled={busy}
            className="w-full mt-auto py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
            {busy ? "Đang xác minh..." : "Xác nhận đổi email"}
          </button>
        </>
      )}
    </div>
  );
}
