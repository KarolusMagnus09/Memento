import { useState } from "react";
import { ChevronLeft, Camera as CameraIcon, Image as ImageIcon } from "lucide-react";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import type { Screen } from "../types";
import type { Profile } from "../hooks/useProfile";
import { TEAL, TEAL_LIGHT, BG, DEFAULT_AVATAR } from "../constants";
import { supabase } from "../lib/supabase";
import { normalizeVnPhone } from "../lib/phone";
import { FieldBox } from "../components/shared/FieldBox";
import { Badge } from "../components/shared/Badge";
import { ConfirmModal } from "../components/shared/ConfirmModal";

export default function PersonalInfoScreen({
  setScreen,
  profile,
  refreshProfile,
}: {
  setScreen: (s: Screen) => void;
  profile: Profile;
  refreshProfile: () => void;
}) {
  // ── Tên hiển thị + ảnh đại diện (gộp chung nút "Lưu" ở đầu trang) ───────
  const [name, setName] = useState(profile.full_name || profile.username);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url);
  const [avatarIsNew, setAvatarIsNew] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveInfo, setSaveInfo] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty = name.trim() !== (profile.full_name || profile.username) || avatarIsNew;

  // ── Số điện thoại (đổi qua OTP SMS thật) ────────────────────────────────
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState(profile.phone ?? "");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneInfo, setPhoneInfo] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<"phone" | null>(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  // ── LƯU TÊN HIỂN THỊ + ẢNH ĐẠI DIỆN ────────────────────────────────────
  async function uploadAvatarIfNeeded(): Promise<string | null> {
    if (!avatarIsNew || !avatarPreview || !avatarPreview.startsWith("data:")) return null;
    const res = await fetch(avatarPreview);
    const blob = await res.blob();
    const ext = blob.type.split("/")[1]?.split("+")[0] || "jpg";
    const path = `${profile.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, contentType: blob.type });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  }

  async function handleSave(): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) { setSaveError("Tên hiển thị không được để trống."); return false; }
    setSaveError(null);
    setSaveInfo(null);
    setSaving(true);
    try {
      const publicUrl = await uploadAvatarIfNeeded();
      const patch: Partial<Profile> = { full_name: trimmed };
      if (publicUrl) patch.avatar_url = publicUrl;
      const { error } = await supabase.from("profiles").update(patch).eq("id", profile.id);
      if (error) throw error;
      setAvatarIsNew(false);
      refreshProfile();
      setSaveInfo("Đã lưu thay đổi.");
      return true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Có lỗi xảy ra, vui lòng thử lại.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (dirty) { setShowUnsavedModal(true); return; }
    setScreen("profile");
  }

  // ── ẢNH ĐẠI DIỆN ────────────────────────────────────────────────────────
  async function pickImage(source: CameraSource) {
    setSaveError(null);
    setPickingPhoto(true);
    try {
      const photo = await Camera.getPhoto({ quality: 70, allowEditing: true, resultType: CameraResultType.DataUrl, source });
      if (photo.dataUrl) { setAvatarPreview(photo.dataUrl); setAvatarIsNew(true); }
    } catch {
      // Người dùng hủy hộp thoại — bỏ qua.
    } finally {
      setPickingPhoto(false);
      setAvatarPickerOpen(false);
    }
  }

  // ── EMAIL ───────────────────────────────────────────────────────────────
  // ── SỐ ĐIỆN THOẠI (không cần xác minh OTP) ──────────────────────────────
  // App chỉ đóng vai trò kết nối, buổi chụp luôn yêu cầu gặp mặt trực tiếp
  // nên không cần kiểm soát gắt số điện thoại — người dùng nhập số mình
  // muốn và lưu thẳng, không phải xác minh qua SMS.
  function startEditPhone() {
    setPhoneDraft(profile.phone ?? "");
    setPhoneInfo(null);
    setPhoneError(null);
    setEditingPhone(true);
  }

  async function handleSavePhone() {
    const normalized = normalizeVnPhone(phoneDraft);
    if (!normalized) { setPhoneError("Số điện thoại không hợp lệ. Vui lòng nhập đúng số di động Việt Nam (VD: 0901234567)."); return; }
    if (normalized === profile.phone) { setPhoneError("Đây là số điện thoại hiện tại của bạn."); return; }
    setPhoneError(null);
    setPhoneSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ phone: normalized }).eq("id", profile.id);
      if (error) throw error;
      refreshProfile();
      setPhoneInfo("Đã cập nhật số điện thoại mới.");
      setEditingPhone(false);
    } catch (e) {
      setPhoneError(e instanceof Error ? e.message : "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setPhoneSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full pb-10" style={{ background: BG }}>
      <div className="px-5 pt-12 pb-4 bg-white border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <h2 className="font-bold text-base" style={{ color: TEAL }}>Thông tin Cá nhân</h2>
        </div>
        <button onClick={handleSave} disabled={!dirty || saving}
          className="text-sm font-bold disabled:opacity-40" style={{ color: TEAL_LIGHT }}>
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
      </div>

      <div className="px-5 mt-5">
        {/* ẢNH ĐẠI DIỆN — bấm để đổi (chụp ảnh / thư viện) */}
        <div className="flex flex-col items-center mb-2">
          <button onClick={() => setAvatarPickerOpen(v => !v)} disabled={pickingPhoto} className="relative">
            <img src={avatarPreview || DEFAULT_AVATAR} alt="avatar" width={80} height={80}
              className="rounded-full object-cover border-4" style={{ borderColor: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }} />
            <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full text-white flex items-center justify-center" style={{ background: TEAL_LIGHT }}>
              <CameraIcon size={13} strokeWidth={2.5} />
            </span>
          </button>
          <button onClick={() => setAvatarPickerOpen(v => !v)} className="mt-2 text-xs font-semibold" style={{ color: TEAL_LIGHT }}>
            Thay đổi ảnh đại diện
          </button>
          {profile.role === "photographer" && <Badge text="Pro Photographer · Kích hoạt" color="green" />}

          {avatarPickerOpen && (
            <div className="flex gap-3 mt-3 w-full">
              <button onClick={() => pickImage(CameraSource.Camera)} disabled={pickingPhoto}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl border-2 bg-white font-semibold text-xs disabled:opacity-60"
                style={{ borderColor: "#e5e7eb", color: TEAL }}>
                <CameraIcon size={14} /> Chụp ảnh
              </button>
              <button onClick={() => pickImage(CameraSource.Photos)} disabled={pickingPhoto}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl border-2 bg-white font-semibold text-xs disabled:opacity-60"
                style={{ borderColor: "#e5e7eb", color: TEAL }}>
                <ImageIcon size={14} /> Thư viện
              </button>
            </div>
          )}
        </div>

        {saveError && <p className="text-xs text-red-600 text-center mb-2">{saveError}</p>}
        {saveInfo && <p className="text-xs text-center mb-2" style={{ color: TEAL_LIGHT }}>{saveInfo}</p>}

        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          {/* TÊN HIỂN THỊ — bấm vào ô để sửa */}
          <div className="px-4 py-3.5 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Tên hiển thị</p>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-transparent text-sm font-medium outline-none" placeholder="Tên hiển thị của bạn" />
          </div>

          {/* EMAIL — bấm vào để mở xác nhận trước khi cho sửa */}
          <div className="px-4 py-3.5 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Email</p>
            <button onClick={() => setScreen("change-email")} className="w-full flex items-center justify-between text-left">
              <span className="text-sm font-medium">{profile.email}</span>
              <span className="text-xs font-bold" style={{ color: TEAL }}>Đổi email</span>
            </button>
          </div>

          {/* SỐ ĐIỆN THOẠI — bấm vào để mở xác nhận trước khi cho sửa */}
          <div className="px-4 py-3.5 last:border-0">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Số điện thoại</p>
            {!editingPhone ? (
              <button onClick={() => setConfirmModal("phone")} className="w-full flex items-center justify-between text-left">
                <span className="text-sm font-medium">{profile.phone || "Chưa thêm số điện thoại"}</span>
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <input value={phoneDraft} onChange={e => { setPhoneDraft(e.target.value); setPhoneError(null); }} type="tel"
                  className="w-full bg-transparent text-sm font-medium outline-none border-b pb-1" style={{ borderColor: "#e5e7eb" }} placeholder="0901234567" autoFocus />
                {phoneError && <p className="text-xs text-red-600">{phoneError}</p>}
                <div className="flex gap-2 mt-1">
                  <button onClick={handleSavePhone} disabled={phoneSaving}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl text-white disabled:opacity-60" style={{ background: TEAL }}>
                    {phoneSaving ? "Đang lưu..." : "Lưu"}
                  </button>
                  <button onClick={() => setEditingPhone(false)} className="text-xs font-semibold px-3 py-1.5" style={{ color: TEAL }}>
                    Hủy
                  </button>
                </div>
              </div>
            )}
            {phoneInfo && <p className="text-xs mt-2" style={{ color: TEAL_LIGHT }}>{phoneInfo}</p>}
          </div>
        </div>
      </div>

      {confirmModal === "phone" && (
        <ConfirmModal
          title="Thay đổi số điện thoại?"
          message="Số điện thoại mới sẽ được cập nhật ngay, không cần xác minh."
          onBackdropClick={() => setConfirmModal(null)}
          actions={[
            { label: "Tiếp tục", variant: "primary", onClick: () => { setConfirmModal(null); startEditPhone(); } },
            { label: "Hủy", variant: "secondary", onClick: () => setConfirmModal(null) },
          ]}
        />
      )}

      {showUnsavedModal && (
        <ConfirmModal
          title="Bạn có thay đổi chưa lưu"
          message="Bạn sắp rời khỏi mà chưa lưu tên hiển thị/ảnh đại diện. Bạn có muốn lưu lại không?"
          onBackdropClick={() => setShowUnsavedModal(false)}
          actions={[
            { label: "Lưu & Thoát", variant: "primary", onClick: async () => { const ok = await handleSave(); setShowUnsavedModal(false); if (ok) setScreen("profile"); } },
            { label: "Không lưu", variant: "danger", onClick: () => { setShowUnsavedModal(false); setScreen("profile"); } },
            { label: "Hủy", variant: "secondary", onClick: () => setShowUnsavedModal(false) },
          ]}
        />
      )}
    </div>
  );
}
