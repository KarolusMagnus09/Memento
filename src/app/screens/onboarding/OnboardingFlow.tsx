import { useState } from "react";
import { Camera as CameraIcon, Image as ImageIcon, ChevronLeft, PartyPopper } from "lucide-react";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { TEAL, TEAL_MID, TEAL_LIGHT, BG, DEFAULT_AVATAR } from "../../constants";
import { supabase } from "../../lib/supabase";
import { FieldBox } from "../../components/shared/FieldBox";
import { normalizeVnPhone } from "../../lib/phone";
import type { Profile } from "../../hooks/useProfile";

type Step = "username" | "name" | "avatar" | "gender" | "phone" | "welcome";
const STEPS: Step[] = ["username", "name", "avatar", "gender", "phone", "welcome"];

const GENDER_OPTIONS = [
  { id: "female" as const, label: "Nữ" },
  { id: "male" as const, label: "Nam" },
  { id: "other" as const, label: "Khác" },
];

export default function OnboardingFlow({
  userId,
  profile,
  onDone,
}: {
  userId: string;
  profile: Profile;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>("username");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [name, setName] = useState(profile.full_name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url);
  const [avatarIsNew, setAvatarIsNew] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);

  const [gender, setGender] = useState<Profile["gender"]>(profile.gender);
  const [genderError, setGenderError] = useState<string | null>(null);

  const [phone, setPhone] = useState(profile.phone ?? "");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const stepIndex = STEPS.indexOf(step);

  function goBack() {
    setError(null);
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  }

  async function updateProfile(patch: Partial<Profile>) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw error;
  }

  // ── BƯỚC 0: TÊN TÀI KHOẢN (duy nhất) ─────────────────────────────────
  // Chỉ "giữ chỗ" username thật sự ở đây — sau khi email đã xác nhận xong
  // (Onboarding chỉ hiện cho user đã đăng nhập). Trước đó, profiles.username
  // chỉ là placeholder ngẫu nhiên do trigger tạo, không xung đột với ai.
  async function handleUsernameNext() {
    const trimmed = username.trim();
    if (!trimmed) { setUsernameError("Vui lòng nhập tên tài khoản."); return; }
    if (trimmed.length < 3) { setUsernameError("Tên tài khoản cần tối thiểu 3 ký tự."); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { setUsernameError("Chỉ dùng chữ, số và dấu gạch dưới (_), không dấu cách."); return; }
    setUsernameError(null);
    setError(null);
    setSaving(true);
    try {
      const { data: ok, error } = await supabase.rpc("claim_username", { p_username: trimmed });
      if (error) throw error;
      if (!ok) {
        setUsernameError("Tên tài khoản này đã có người sử dụng, vui lòng chọn tên khác.");
        return;
      }
      setStep("name");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  // ── BƯỚC 1: TÊN HIỂN THỊ ─────────────────────────────────────────────
  async function handleNameNext() {
    const trimmed = name.trim();
    if (!trimmed) { setNameError("Vui lòng nhập tên bạn muốn hiển thị."); return; }
    setNameError(null);
    setError(null);
    setSaving(true);
    try {
      await updateProfile({ full_name: trimmed });
      setStep("avatar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  // ── BƯỚC 2: ẢNH ĐẠI DIỆN ─────────────────────────────────────────────
  async function pickImage(source: CameraSource) {
    setError(null);
    setPickingPhoto(true);
    try {
      const photo = await Camera.getPhoto({
        quality: 70,
        allowEditing: true,
        resultType: CameraResultType.DataUrl,
        source,
      });
      if (photo.dataUrl) {
        setAvatarPreview(photo.dataUrl);
        setAvatarIsNew(true);
      }
    } catch {
      // Người dùng bấm hủy hộp thoại chọn ảnh/máy ảnh — không phải lỗi thật, bỏ qua.
    } finally {
      setPickingPhoto(false);
    }
  }

  async function uploadAvatarIfNeeded(): Promise<string | null> {
    if (!avatarIsNew || !avatarPreview || !avatarPreview.startsWith("data:")) return null;
    const res = await fetch(avatarPreview);
    const blob = await res.blob();
    const ext = blob.type.split("/")[1]?.split("+")[0] || "jpg";
    const path = `${userId}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, contentType: blob.type });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    // Cache-bust để ảnh mới hiện ngay, không bị trình duyệt/app cache ảnh cũ theo URL cũ.
    return `${data.publicUrl}?t=${Date.now()}`;
  }

  async function handleAvatarNext() {
    setError(null);
    setSaving(true);
    try {
      const publicUrl = await uploadAvatarIfNeeded();
      if (publicUrl) await updateProfile({ avatar_url: publicUrl });
      setStep("gender");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được ảnh lên, vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  function handleAvatarSkip() {
    setError(null);
    setStep("gender");
  }

  // ── BƯỚC 3: GIỚI TÍNH ────────────────────────────────────────────────
  async function handleGenderNext() {
    if (!gender) { setGenderError("Vui lòng chọn một mục."); return; }
    setGenderError(null);
    setError(null);
    setSaving(true);
    try {
      await updateProfile({ gender });
      setStep("phone");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  // ── BƯỚC 4: SỐ ĐIỆN THOẠI (không yêu cầu xác minh OTP) ────────────────
  // App chỉ đóng vai trò kết nối, không cần kiểm soát gắt số điện thoại —
  // buổi chụp yêu cầu gặp mặt trực tiếp nên rủi ro lừa đảo qua số ảo là rất
  // thấp. Người dùng có thể nhập số mình muốn, lưu thẳng, không cần gửi SMS.
  async function handleSavePhone() {
    setError(null);
    const normalized = normalizeVnPhone(phone);
    if (!normalized) {
      setPhoneError("Số điện thoại không hợp lệ. Vui lòng nhập đúng số di động Việt Nam (VD: 0901234567).");
      return;
    }
    setPhoneError(null);
    setSaving(true);
    try {
      await updateProfile({ phone: normalized });
      setStep("welcome");
    } catch (e) {
      setPhoneError(e instanceof Error ? e.message : "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  function handlePhoneSkip() {
    setError(null);
    setPhoneError(null);
    setStep("welcome");
  }

  // ── BƯỚC 5: HOÀN TẤT ─────────────────────────────────────────────────
  async function handleFinish() {
    setError(null);
    setSaving(true);
    try {
      await updateProfile({ onboarding_completed: true });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra, vui lòng thử lại.");
      setSaving(false);
    }
  }

  const ProgressDots = () => (
    <div className="flex items-center gap-1.5 mb-8">
      {STEPS.map((s, i) => (
        <div key={s} className="h-1.5 rounded-full flex-1 transition-colors"
          style={{ background: i <= stepIndex ? TEAL : "#e5e7eb" }} />
      ))}
    </div>
  );

  const Header = () => (
    <div className="flex items-center mb-6">
      {stepIndex > 0 && step !== "welcome" ? (
        <button onClick={goBack} className="w-9 h-9 rounded-full bg-white border border-border flex items-center justify-center">
          <ChevronLeft size={18} style={{ color: TEAL }} />
        </button>
      ) : (
        <div className="w-9 h-9" />
      )}
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen px-6 pt-14 pb-10" style={{ background: BG }}>
      {step !== "welcome" && (
        <>
          <Header />
          <ProgressDots />
        </>
      )}

      {/* ── TÊN TÀI KHOẢN ──────────────────────────────────────────────── */}
      {step === "username" && (
        <>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Chọn tên tài khoản</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Đây là định danh riêng tư, duy nhất, dùng để đăng nhập — giống địa chỉ Gmail của bạn.
            Tên tài khoản sẽ không hiển thị công khai và không thể thay đổi sau này.
            Bạn vẫn có thể đặt một <span className="font-semibold" style={{ color: TEAL }}>tên hiển thị</span> khác
            (thay đổi được bất cứ lúc nào) ở bước tiếp theo.
          </p>

          <FieldBox label="Tên tài khoản" error={usernameError ?? undefined}
            hint={!usernameError ? "Chỉ dùng chữ, số và dấu gạch dưới (_). Không thể đổi sau khi tạo." : undefined}>
            <input value={username} onChange={e => { setUsername(e.target.value); setUsernameError(null); }}
              className="flex-1 bg-transparent text-sm outline-none" placeholder="vd: nguyenvana2024" autoFocus />
          </FieldBox>

          {error && <p className="text-xs text-red-600 mt-1 mb-2">{error}</p>}

          <button onClick={handleUsernameNext} disabled={saving}
            className="w-full mt-6 py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
            {saving ? "Đang kiểm tra..." : "Tiếp tục"}
          </button>
        </>
      )}

      {/* ── TÊN HIỂN THỊ ───────────────────────────────────────────────── */}
      {step === "name" && (
        <>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Bạn muốn hiển thị tên gì?</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Đây là tên công khai, hiển thị cho nhiếp ảnh gia và trên hồ sơ của bạn trong Memento.
            Khác với tên tài khoản, bạn có thể đổi tên hiển thị bất cứ lúc nào trong phần Thông tin cá nhân.
          </p>

          <FieldBox label="Tên hiển thị" error={nameError ?? undefined}>
            <input value={name} onChange={e => { setName(e.target.value); setNameError(null); }}
              className="flex-1 bg-transparent text-sm outline-none" placeholder="Nguyễn Văn A" autoFocus />
          </FieldBox>

          {error && <p className="text-xs text-red-600 mt-1 mb-2">{error}</p>}

          <button onClick={handleNameNext} disabled={saving}
            className="w-full mt-6 py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
            {saving ? "Đang lưu..." : "Tiếp tục"}
          </button>
        </>
      )}

      {/* ── ẢNH ĐẠI DIỆN ───────────────────────────────────────────────── */}
      {step === "avatar" && (
        <>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Thêm ảnh đại diện</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Ảnh giúp nhiếp ảnh gia và mọi người dễ nhận ra bạn hơn.
          </p>

          <div className="flex flex-col items-center mb-6">
            <img src={avatarPreview || DEFAULT_AVATAR} alt="avatar preview" width={112} height={112}
              className="rounded-full object-cover border-4" style={{ borderColor: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }} />
          </div>

          <div className="flex gap-3 mb-2">
            <button onClick={() => pickImage(CameraSource.Camera)} disabled={pickingPhoto}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 bg-white font-semibold text-sm disabled:opacity-60"
              style={{ borderColor: "#e5e7eb", color: TEAL }}>
              <CameraIcon size={16} /> Chụp ảnh
            </button>
            <button onClick={() => pickImage(CameraSource.Photos)} disabled={pickingPhoto}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 bg-white font-semibold text-sm disabled:opacity-60"
              style={{ borderColor: "#e5e7eb", color: TEAL }}>
              <ImageIcon size={16} /> Thư viện
            </button>
          </div>

          <p className="text-xs text-muted-foreground mt-2 mb-1">
            Bạn có thể bỏ qua và thêm ảnh sau. Tuy nhiên, khi đặt lịch chụp hoặc đăng ký làm nhiếp ảnh gia, bạn sẽ cần có ảnh đại diện.
          </p>

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

          <div className="mt-auto pt-6 flex flex-col gap-2">
            <button onClick={handleAvatarNext} disabled={saving || pickingPhoto}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
              {saving ? "Đang lưu..." : "Tiếp tục"}
            </button>
            <button onClick={handleAvatarSkip} disabled={saving}
              className="w-full py-3 text-sm font-semibold" style={{ color: TEAL_LIGHT }}>
              Bỏ qua
            </button>
          </div>
        </>
      )}

      {/* ── GIỚI TÍNH ──────────────────────────────────────────────────── */}
      {step === "gender" && (
        <>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Giới tính của bạn là gì?</h2>
          <p className="text-sm text-muted-foreground mb-8">Bạn có thể thay đổi lại sau này trong hồ sơ cá nhân.</p>

          <div className="flex flex-col gap-3">
            {GENDER_OPTIONS.map(opt => {
              const selected = gender === opt.id;
              return (
                <button key={opt.id} onClick={() => { setGender(opt.id); setGenderError(null); }}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 bg-white text-left"
                  style={{ borderColor: selected ? TEAL : "#e5e7eb" }}>
                  <p className="flex-1 text-sm font-bold" style={{ color: TEAL }}>{opt.label}</p>
                  <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: selected ? TEAL : "#d1d5db" }}>
                    {selected && <div className="w-2.5 h-2.5 rounded-full" style={{ background: TEAL }} />}
                  </div>
                </button>
              );
            })}
          </div>

          {genderError && <p className="text-xs text-red-600 mt-3">{genderError}</p>}
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

          <button onClick={handleGenderNext} disabled={saving}
            className="w-full mt-8 py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
            {saving ? "Đang lưu..." : "Tiếp tục"}
          </button>
        </>
      )}

      {/* ── SỐ ĐIỆN THOẠI (không cần xác minh) ───────────────────────────── */}
      {step === "phone" && (
        <>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Số điện thoại của bạn?</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Nhiếp ảnh gia sẽ dùng số này để liên hệ khi bạn đặt lịch.
          </p>

          <FieldBox label="Số điện thoại" error={phoneError ?? undefined}>
            <input value={phone} onChange={e => { setPhone(e.target.value); setPhoneError(null); }} type="tel"
              className="flex-1 bg-transparent text-sm outline-none" placeholder="0901234567" autoFocus />
          </FieldBox>

          <p className="text-xs text-muted-foreground mt-1 mb-1">
            Bạn có thể bỏ qua và thêm sau trong phần Thông tin cá nhân.
          </p>

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

          <div className="mt-auto pt-6 flex flex-col gap-2">
            <button onClick={handleSavePhone} disabled={saving}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
              {saving ? "Đang lưu..." : "Lưu số điện thoại"}
            </button>
            <button onClick={handlePhoneSkip} disabled={saving}
              className="w-full py-3 text-sm font-semibold" style={{ color: TEAL_LIGHT }}>
              Bỏ qua
            </button>
          </div>
        </>
      )}

      {/* ── CHÀO MỪNG ──────────────────────────────────────────────────── */}
      {step === "welcome" && (
        <div className="flex flex-col items-center justify-center flex-1 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
            <PartyPopper size={36} className="text-white" strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl font-black mb-2" style={{ color: TEAL }}>Chào mừng đến với Memento!</h2>
          <p className="text-sm text-muted-foreground mb-10 max-w-xs">
            Hồ sơ của bạn đã sẵn sàng. Giờ thì cùng khám phá và tìm nhiếp ảnh gia phù hợp với bạn thôi nào 🎉
          </p>

          {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

          <button onClick={handleFinish} disabled={saving}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
            {saving ? "Đang xử lý..." : "Bắt đầu khám phá"}
          </button>
        </div>
      )}
    </div>
  );
}
