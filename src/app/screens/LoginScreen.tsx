import { Camera, Eye, EyeOff, ChevronLeft, Mail, Smartphone, ChevronRight } from "lucide-react";
import { TEAL, TEAL_MID, TEAL_LIGHT, BG } from "../constants";
import { supabase } from "../lib/supabase";
import { translateAuthError } from "../lib/authErrors";
import { validatePasswordStrength, PASSWORD_HINT } from "../lib/password";
import { Captcha, CAPTCHA_ENABLED } from "../components/Captcha";
import { OtpInput } from "../components/shared/OtpInput";
import { FieldBox } from "../components/shared/FieldBox";
import { useState } from "react";

// Danh sách phương thức khôi phục mật khẩu — hiện chỉ Email hoạt động,
// các phương thức khác để sẵn khung, bật enabled: true khi làm xong backend cho nó.
const RECOVERY_METHODS = [
  { id: "email" as const, label: "Email", desc: "Nhận mã xác nhận qua email đã đăng ký", icon: Mail, enabled: true },
  { id: "phone" as const, label: "Số điện thoại", desc: "Nhận mã qua tin nhắn SMS", icon: Smartphone, enabled: false },
];

type FieldErrors = Partial<Record<"email" | "password" | "otp" | "newPassword" | "confirmPassword", string>>;

export default function LoginScreen({ onAuthed }: { onAuthed: () => void }) {
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [mode, setMode] = useState<"login" | "register" | "verify-otp" | "forgot-method" | "forgot" | "forgot-otp" | "forgot-newpass">("login");
  const [recoveryMethod, setRecoveryMethod] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaResetKey(k => k + 1);
  }

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors(prev => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  function goTo(next: typeof mode) {
    setMode(next);
    setError(null);
    setInfo(null);
    setFieldErrors({});
  }

  // Gán lỗi API (đã dịch) vào đúng ô liên quan, dựa theo nội dung lỗi gốc.
  function applyServerError(rawMessage: string, candidateFields: (keyof FieldErrors)[]) {
    const vi = translateAuthError(rawMessage);
    const lower = rawMessage.toLowerCase();
    if (candidateFields.includes("password") && lower.includes("password")) {
      setFieldErrors(prev => ({ ...prev, password: vi })); return;
    }
    if (candidateFields.includes("newPassword") && lower.includes("password")) {
      setFieldErrors(prev => ({ ...prev, newPassword: vi })); return;
    }
    if (candidateFields.includes("email") && lower.includes("email")) {
      setFieldErrors(prev => ({ ...prev, email: vi })); return;
    }
    if (candidateFields.includes("otp") && (lower.includes("otp") || lower.includes("token"))) {
      setFieldErrors(prev => ({ ...prev, otp: vi })); return;
    }
    setError(vi);
  }

  async function handleSubmit() {
    setError(null);
    setInfo(null);
    setFieldErrors({});

    if (mode === "forgot") {
      const fe: FieldErrors = {};
      if (!email) fe.email = "Vui lòng nhập email.";
      if (Object.keys(fe).length) { setFieldErrors(fe); return; }
      if (CAPTCHA_ENABLED && !captchaToken) { setError("Vui lòng hoàn thành xác minh CAPTCHA."); return; }
      setLoading(true);

      // Kiểm tra email này có tài khoản hay không trước khi gửi mã.
      const { data: existing, error: lookupError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.trim().toLowerCase())
        .maybeSingle();

      if (lookupError) {
        setLoading(false);
        setError(translateAuthError(lookupError.message));
        return;
      }
      if (!existing) {
        setLoading(false);
        setFieldErrors({ email: "Không tìm thấy tài khoản nào dùng email này." });
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        captchaToken: captchaToken ?? undefined,
      });
      setLoading(false);
      resetCaptcha();
      if (error) { applyServerError(error.message, ["email"]); return; }
      setMode("forgot-otp");
      return;
    }

    if (mode === "forgot-otp") {
      if (!otp || otp.length < 6) { setFieldErrors({ otp: "Nhập đủ 6 số trong email." }); return; }
      setLoading(true);
      const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "recovery" });
      setLoading(false);
      if (error) { applyServerError(error.message, ["otp"]); return; }
      setMode("forgot-newpass");
      return;
    }

    if (mode === "forgot-newpass") {
      const fe: FieldErrors = {};
      const pwErr = newPassword ? validatePasswordStrength(newPassword) : "Vui lòng nhập mật khẩu mới.";
      if (pwErr) fe.newPassword = pwErr;
      if (newPassword && confirmPassword && newPassword !== confirmPassword) fe.confirmPassword = "Mật khẩu nhập lại không khớp.";
      if (!confirmPassword) fe.confirmPassword = fe.confirmPassword ?? "Vui lòng nhập lại mật khẩu mới.";
      if (Object.keys(fe).length) { setFieldErrors(fe); return; }

      setLoading(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      setLoading(false);
      if (error) { applyServerError(error.message, ["newPassword"]); return; }
      setInfo("Đã đổi mật khẩu thành công! Đang đưa bạn về trang chủ...");
      setTimeout(() => onAuthed(), 1200);
      return;
    }

    if (mode === "verify-otp") {
      if (!otp || otp.length < 6) { setFieldErrors({ otp: "Nhập đủ 6 số trong email." }); return; }
      setLoading(true);
      const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "signup" });
      setLoading(false);
      if (error) { applyServerError(error.message, ["otp"]); return; }
      onAuthed();
      return;
    }

    // login / register
    const fe: FieldErrors = {};
    if (!email) fe.email = mode === "login" ? "Vui lòng nhập email hoặc tên tài khoản." : "Vui lòng nhập email.";
    if (!password) fe.password = "Vui lòng nhập mật khẩu.";
    if (mode === "register" && password) {
      const pwErr = validatePasswordStrength(password);
      if (pwErr) fe.password = pwErr;
      if (!confirmPassword) fe.confirmPassword = "Vui lòng nhập lại mật khẩu.";
      else if (confirmPassword !== password) fe.confirmPassword = "Mật khẩu nhập lại không khớp.";
    }
    if (Object.keys(fe).length) { setFieldErrors(fe); return; }

    if ((mode === "login" || mode === "register") && CAPTCHA_ENABLED && !captchaToken) {
      setError("Vui lòng hoàn thành xác minh CAPTCHA.");
      return;
    }
    setLoading(true);
    if (mode === "login") {
      // Người dùng có thể gõ email HOẶC tên tài khoản (username) để đăng nhập —
      // giống Gmail: username là định danh riêng tư dùng để đăng nhập, không
      // hiển thị công khai. Nếu chuỗi nhập không có "@" thì coi là username
      // và tra ra email tương ứng trước, rồi mới đăng nhập bằng email đó.
      let loginEmail = email.trim();
      if (!loginEmail.includes("@")) {
        const { data: resolvedEmail, error: lookupError } = await supabase.rpc("find_email_by_username", {
          p_username: loginEmail,
        });
        // Dù RPC lỗi kỹ thuật (vd. chưa migrate, mất kết nối) hay không tìm
        // thấy username, đều trả về CÙNG 1 thông báo chung như sai mật khẩu
        // — không bao giờ lộ chi tiết lỗi backend (tên hàm, schema...) ra
        // giao diện, và không cho biết username có tồn tại hay không.
        if (lookupError || !resolvedEmail) {
          setLoading(false);
          setError("Email/tên tài khoản hoặc mật khẩu không đúng.");
          return;
        }
        loginEmail = resolvedEmail;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail, password,
        options: { captchaToken: captchaToken ?? undefined },
      });
      setLoading(false);
      resetCaptcha();
      if (error) { applyServerError(error.message, []); return; } // ambiguous by design → lỗi chung
      onAuthed();
    } else {
      // Không claim "tên tài khoản" ở đây nữa — profiles.username được tạo
      // tạm bằng placeholder qua trigger, và người dùng chỉ thật sự chọn +
      // giữ chỗ username ở bước đầu Onboarding, SAU KHI đã xác nhận email.
      // Lý do: nếu claim ngay lúc này, ai bỏ ngang trước khi xác nhận email
      // sẽ chiếm vĩnh viễn tên đó vì unique index, chặn người khác dùng lại.
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { captchaToken: captchaToken ?? undefined },
      });
      setLoading(false);
      resetCaptcha();
      if (error) { applyServerError(error.message, ["email", "password"]); return; }
      // Supabase KHÔNG trả `error` khi signUp() bằng 1 email đã tồn tại và
      // đã xác nhận — đây là hành vi cố ý để chống dò email (user
      // enumeration): nó trả về user "giả" với identities: [] thay vì báo
      // lỗi rõ ràng. Nếu không tự bắt case này, người dùng sẽ tưởng vừa
      // đăng ký thành công (bị đẩy sang màn OTP) dù email đó đã có tài
      // khoản — đúng là bug đang gặp. Nên phải tự kiểm tra identities rỗng
      // để coi như lỗi "email đã được đăng ký".
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        applyServerError("User already registered", ["email", "password"]);
        return;
      }
      setMode("verify-otp");
    }
  }

  async function handleResend() {
    setError(null);
    if (CAPTCHA_ENABLED && !captchaToken) {
      setError("Vui lòng hoàn thành xác minh CAPTCHA.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup", email,
      options: { captchaToken: captchaToken ?? undefined },
    });
    setLoading(false);
    resetCaptcha();
    if (error) { setError(translateAuthError(error.message)); return; }
    setInfo("Đã gửi lại mã. Kiểm tra email nhé.");
  }

  const BackButton = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} className="w-9 h-9 rounded-full bg-white border border-border flex items-center justify-center mb-8">
      <ChevronLeft size={18} style={{ color: TEAL }} />
    </button>
  );

  // ── OTP VERIFY SCREEN (đăng ký) ─────────────────────────────────────────
  if (mode === "verify-otp") {
    return (
      <div className="flex flex-col min-h-screen px-6 pt-14 pb-10" style={{ background: BG }}>
        <BackButton onClick={() => goTo("login")} />

        <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Nhập mã OTP</h2>
        <p className="text-sm text-muted-foreground mb-8">Vui lòng nhập mã 6 số vừa được gửi tới email {email}</p>

        <OtpInput value={otp} onChange={v => { setOtp(v); clearFieldError("otp"); }} error={fieldErrors.otp} />

        <div className="text-center mt-5">
          <span className="text-xs text-muted-foreground">Chưa nhận được mã? </span>
          <button onClick={handleResend} disabled={loading} className="text-xs font-bold" style={{ color: TEAL_LIGHT }}>
            Gửi lại
          </button>
        </div>

        <div className="flex justify-center mt-3">
          <Captcha onToken={setCaptchaToken} resetKey={captchaResetKey} />
        </div>

        {error && <p className="text-xs text-red-600 text-center mt-3">{error}</p>}
        {info && <p className="text-xs text-center mt-3" style={{ color: TEAL_LIGHT }}>{info}</p>}

        <button onClick={handleSubmit} disabled={loading}
          className="w-full mt-8 py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
          {loading ? "Đang xác nhận..." : "Xác nhận"}
        </button>
      </div>
    );
  }

  // ── QUÊN MẬT KHẨU — BƯỚC 0: CHỌN PHƯƠNG THỨC KHÔI PHỤC ──────────────────
  if (mode === "forgot-method") {
    return (
      <div className="flex flex-col min-h-screen px-6 pt-14 pb-10" style={{ background: BG }}>
        <BackButton onClick={() => goTo("login")} />

        <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Quên mật khẩu?</h2>
        <p className="text-sm text-muted-foreground mb-8">Chọn cách bạn muốn khôi phục tài khoản</p>

        <div className="flex flex-col gap-3">
          {RECOVERY_METHODS.map(m => {
            const Icon = m.icon;
            const selected = recoveryMethod === m.id;
            return (
              <button key={m.id} disabled={!m.enabled}
                onClick={() => m.enabled && setRecoveryMethod(m.id)}
                className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 bg-white text-left disabled:opacity-50"
                style={{ borderColor: selected && m.enabled ? TEAL : "#e5e7eb" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#e8f5f0" }}>
                  <Icon size={18} style={{ color: TEAL }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold" style={{ color: TEAL }}>{m.label}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.enabled ? m.desc : "Sắp ra mắt"}
                  </p>
                </div>
                {m.enabled && (
                  <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: selected ? TEAL : "#d1d5db" }}>
                    {selected && <div className="w-2.5 h-2.5 rounded-full" style={{ background: TEAL }} />}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Sẽ có thêm nhiều lựa chọn khôi phục khác trong thời gian tới.
        </p>

        <button onClick={() => goTo("forgot")}
          className="w-full mt-8 py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform flex items-center justify-center gap-1.5"
          style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
          Tiếp tục <ChevronRight size={18} />
        </button>
      </div>
    );
  }

  // ── QUÊN MẬT KHẨU — BƯỚC 1: NHẬP EMAIL ──────────────────────────────────
  if (mode === "forgot") {
    return (
      <div className="flex flex-col min-h-screen px-6 pt-14 pb-10" style={{ background: BG }}>
        <BackButton onClick={() => goTo("forgot-method")} />

        <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Nhập email</h2>
        <p className="text-sm text-muted-foreground mb-8">Mình sẽ gửi mã xác nhận tới email này để đặt lại mật khẩu</p>

        <FieldBox label="Email" error={fieldErrors.email}>
          <input value={email} onChange={e => { setEmail(e.target.value); clearFieldError("email"); }}
            className="flex-1 bg-transparent text-sm outline-none" placeholder="hello@memento.com" />
        </FieldBox>

        <div className="flex justify-center">
          <Captcha onToken={setCaptchaToken} resetKey={captchaResetKey} />
        </div>

        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

        <button onClick={handleSubmit} disabled={loading}
          className="w-full mt-6 py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
          {loading ? "Đang xử lý..." : "Gửi mã đặt lại"}
        </button>
      </div>
    );
  }

  // ── QUÊN MẬT KHẨU — BƯỚC 2: NHẬP MÃ OTP ─────────────────────────────────
  if (mode === "forgot-otp") {
    return (
      <div className="flex flex-col min-h-screen px-6 pt-14 pb-10" style={{ background: BG }}>
        <BackButton onClick={() => goTo("forgot")} />

        <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Nhập mã OTP</h2>
        <p className="text-sm text-muted-foreground mb-8">Vui lòng nhập mã 6 số vừa được gửi tới email {email}</p>

        <OtpInput value={otp} onChange={v => { setOtp(v); clearFieldError("otp"); }} error={fieldErrors.otp} />

        <div className="text-center mt-5">
          <span className="text-xs text-muted-foreground">Chưa nhận được mã? </span>
          <button onClick={() => { setOtp(""); goTo("forgot"); }}
            className="text-xs font-bold" style={{ color: TEAL_LIGHT }}>
            Gửi lại
          </button>
        </div>

        {error && <p className="text-xs text-red-600 text-center mt-3">{error}</p>}

        <button onClick={handleSubmit} disabled={loading}
          className="w-full mt-8 py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
          {loading ? "Đang xác nhận..." : "Xác nhận"}
        </button>
      </div>
    );
  }

  // ── QUÊN MẬT KHẨU — BƯỚC 3: ĐẶT MẬT KHẨU MỚI ────────────────────────────
  if (mode === "forgot-newpass") {
    return (
      <div className="flex flex-col min-h-screen px-6 pt-14 pb-10" style={{ background: BG }}>
        <BackButton onClick={() => goTo("forgot-otp")} />

        <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Đặt mật khẩu mới</h2>
        <p className="text-sm text-muted-foreground mb-8">Nhập mật khẩu mới cho tài khoản {email}</p>

        <FieldBox label="Mật khẩu mới" error={fieldErrors.newPassword} hint={!fieldErrors.newPassword ? PASSWORD_HINT : undefined}>
          <input value={newPassword} onChange={e => { setNewPassword(e.target.value); clearFieldError("newPassword"); }}
            className="flex-1 bg-transparent text-sm outline-none" type={show ? "text" : "password"} placeholder="••••••••" />
          <button onClick={() => setShow(!show)}>{show ? <EyeOff size={16} className="text-muted-foreground" /> : <Eye size={16} className="text-muted-foreground" />}</button>
        </FieldBox>

        <FieldBox label="Xác nhận mật khẩu mới" error={fieldErrors.confirmPassword}>
          <input value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); clearFieldError("confirmPassword"); }}
            className="flex-1 bg-transparent text-sm outline-none" type={showConfirm ? "text" : "password"} placeholder="••••••••" />
          <button onClick={() => setShowConfirm(!showConfirm)}>{showConfirm ? <EyeOff size={16} className="text-muted-foreground" /> : <Eye size={16} className="text-muted-foreground" />}</button>
        </FieldBox>

        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        {info && <p className="text-xs mt-1 font-semibold" style={{ color: TEAL_LIGHT }}>{info}</p>}

        <button onClick={handleSubmit} disabled={loading}
          className="w-full mt-4 py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
          {loading ? "Đang xử lý..." : "Xác nhận đổi mật khẩu"}
        </button>
      </div>
    );
  }

  // ── LOGIN ────────────────────────────────────────────────────────────────
  if (mode === "login") {
    return (
      <div className="flex flex-col min-h-screen px-6 pt-14 pb-10" style={{ background: BG }}>
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-2xl mb-3 flex items-center justify-center text-white text-3xl font-black shadow-lg"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
            <Camera size={36} strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-black" style={{ color: TEAL }}>Memento</h1>
          <p className="text-sm text-muted-foreground mt-1">Kết nối cảm xúc qua từng khoảnh khắc 🐾</p>
        </div>

        <h2 className="text-xl font-bold mb-1" style={{ color: TEAL }}>Chào mừng trở lại</h2>
        <p className="text-sm text-muted-foreground mb-6">Đăng nhập để quản lý kỷ niệm của bạn</p>

        <FieldBox label="Email hoặc tên tài khoản" error={fieldErrors.email}>
          <input value={email} onChange={e => { setEmail(e.target.value); clearFieldError("email"); }}
            className="flex-1 bg-transparent text-sm outline-none" placeholder="hello@memento.com hoặc tên tài khoản" />
        </FieldBox>

        <FieldBox label="Mật khẩu" error={fieldErrors.password}>
          <input value={password} onChange={e => { setPassword(e.target.value); clearFieldError("password"); }}
            className="flex-1 bg-transparent text-sm outline-none" type={show ? "text" : "password"} placeholder="••••••••" />
          <button onClick={() => setShow(!show)}>{show ? <EyeOff size={16} className="text-muted-foreground" /> : <Eye size={16} className="text-muted-foreground" />}</button>
        </FieldBox>

        <div className="text-right -mt-2 mb-2">
          <button className="text-xs font-semibold" style={{ color: TEAL_LIGHT }} onClick={() => goTo("forgot-method")}>
            Quên mật khẩu?
          </button>
        </div>

        <div className="flex justify-center">
          <Captcha onToken={setCaptchaToken} resetKey={captchaResetKey} />
        </div>

        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

        <button onClick={handleSubmit} disabled={loading}
          className="w-full mt-5 py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
          {loading ? "Đang xử lý..." : "Đăng nhập"}
        </button>

        <p className="text-center text-sm mt-6 text-muted-foreground">
          Chưa có tài khoản?{" "}
          <button className="font-black" style={{ color: TEAL }} onClick={() => goTo("register")}>
            Tham gia Memento 🐾
          </button>
        </p>
      </div>
    );
  }

  // ── REGISTER ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen px-6 pt-14 pb-10" style={{ background: BG }}>
      <BackButton onClick={() => goTo("login")} />

      <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Tạo tài khoản mới</h2>
      <p className="text-sm text-muted-foreground mb-6">Tham gia Memento chỉ trong 1 phút</p>

      <FieldBox label="Email" error={fieldErrors.email}>
        <input value={email} onChange={e => { setEmail(e.target.value); clearFieldError("email"); }}
          className="flex-1 bg-transparent text-sm outline-none" placeholder="hello@memento.com" />
      </FieldBox>

      <FieldBox label="Mật khẩu" error={fieldErrors.password} hint={!fieldErrors.password ? PASSWORD_HINT : undefined}>
        <input value={password} onChange={e => { setPassword(e.target.value); clearFieldError("password"); }}
          className="flex-1 bg-transparent text-sm outline-none" type={show ? "text" : "password"} placeholder="••••••••" />
        <button onClick={() => setShow(!show)}>{show ? <EyeOff size={16} className="text-muted-foreground" /> : <Eye size={16} className="text-muted-foreground" />}</button>
      </FieldBox>

      <FieldBox label="Nhập lại mật khẩu" error={fieldErrors.confirmPassword}>
        <input value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); clearFieldError("confirmPassword"); }}
          className="flex-1 bg-transparent text-sm outline-none" type={showConfirm ? "text" : "password"} placeholder="••••••••" />
        <button onClick={() => setShowConfirm(!showConfirm)}>{showConfirm ? <EyeOff size={16} className="text-muted-foreground" /> : <Eye size={16} className="text-muted-foreground" />}</button>
      </FieldBox>

      <div className="flex justify-center">
        <Captcha onToken={setCaptchaToken} resetKey={captchaResetKey} />
      </div>

      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

      <button onClick={handleSubmit} disabled={loading}
        className="w-full mt-5 py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
        style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
        {loading ? "Đang xử lý..." : "Đăng ký"}
      </button>

      <p className="text-center text-sm mt-6 text-muted-foreground">
        Đã có tài khoản?{" "}
        <button className="font-black" style={{ color: TEAL }} onClick={() => goTo("login")}>
          Đăng nhập
        </button>
      </p>
    </div>
  );
}
