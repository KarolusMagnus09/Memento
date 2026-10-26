import { User, Bell, ChevronRight, Camera, Phone, Settings, Globe, LogOut, Image as ImageIcon } from "lucide-react";
import { signOutSafely } from "../lib/pushNotifications";
import type { Screen, Photographer } from "../types";
import type { Profile } from "../hooks/useProfile";
import { TEAL, TEAL_MID, BG } from "../constants";
import { Avatar } from "../components/shared/Avatar";
import { Badge } from "../components/shared/Badge";
import { supabase } from "../lib/supabase";
import { asBoards, asPinUrls } from "../lib/normalizeBoards";
import { useEffect, useState } from "react";

type AppStatus = "draft" | "submitted" | "approved" | "rejected" | null;

export function mapApplicationToPhotographer(app: Record<string, unknown>, profile: Profile): Photographer {
  const styles = (Array.isArray(app.selected_styles) ? app.selected_styles : []) as string[];
  const boards = asBoards(app.boards);
  const pins = asPinUrls(app.standalone_pins);
  const locations = (Array.isArray(app.work_locations) ? app.work_locations : []) as string[];
  let priceGroups = app.price_groups;
  if (typeof priceGroups === "string") {
    try { priceGroups = JSON.parse(priceGroups); } catch { priceGroups = []; }
  }
  if (!Array.isArray(priceGroups)) priceGroups = [];
  const rental_boards = asBoards(app.rental_boards);
  const rental_pins = asPinUrls(app.rental_pins);
  return {
    id: -1,
    name: (app.full_name as string) || profile.full_name || profile.username || "Photographer",
    location: locations.join(", ") || "—",
    price: 0,
    rating: 0,
    bookings: 0,
    specialty: styles[0] || "",
    avatar: (app.avatar_url as string) || profile.avatar_url || "",
    cover: (app.banner_url as string) || "",
    portfolio: pins,
    boards,
    standalone_pins: pins,
    pin_likes: {},
    bio: (app.bio as string) || "",
    tags: styles,
    reviews: [],
    packages: [],
    price_groups: priceGroups as Photographer["price_groups"],
    skill_makeup: !!(app.skill_makeup),
    skill_edit: !!(app.skill_edit),
    skill_rental: !!(app.skill_rental),
    rental_boards,
    rental_pins,
    experience_years: (app.experience_years as string) || null,
    equipment: (app.equipment as string) || null,
    languages: (Array.isArray(app.languages) ? app.languages : []) as string[],
    work_model: (app.work_model as string) || null,
    experience_detail: (app.style_description as string) || (app.experience_detail as string) || null,
    shooting_styles: styles,
    work_locations: locations,
    user_id: (app.user_id as string) || profile.id,
  };
}

export default function ProfileScreen({
  setScreen,
  profile,
  onOpenOwnPhotographerProfile,
}: {
  setScreen: (s: Screen) => void;
  profile: Profile;
  /** Mở hồ sơ nhiếp ảnh gia (chính mình) — App set isOwner + data */
  onOpenOwnPhotographerProfile?: (p: Photographer, status: AppStatus, note?: string | null) => void;
}) {
  const displayName = profile.full_name || profile.username;
  const [appStatus, setAppStatus] = useState<AppStatus>(null);
  const [appRow, setAppRow] = useState<Record<string, unknown> | null>(null);
  const [adminNote, setAdminNote] = useState<string | null>(null);
  const bankMissing =
    appStatus === "approved" &&
    !(appRow && appRow.bank_account && String(appRow.bank_account).trim());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("photographer_applications")
        .select("*")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setAppRow(data as Record<string, unknown>);
        setAppStatus((data.status as AppStatus) || "submitted");
        setAdminNote((data.admin_note as string) || null);
      } else if (profile.role === "photographer") {
        setAppStatus("approved");
        setAdminNote(null);
      } else {
        setAppStatus(null);
        setAdminNote(null);
      }
    })();
    return () => { cancelled = true; };
  }, [profile.id, profile.role]);

  const hasPtgProfile = appStatus !== null || profile.role === "photographer";
  const isPending = appStatus === "submitted" || appStatus === "draft";
  const isRejected = appStatus === "rejected";

  function openMyProfile() {
    if (appRow && onOpenOwnPhotographerProfile) {
      onOpenOwnPhotographerProfile(mapApplicationToPhotographer(appRow, profile), appStatus, adminNote);
      return;
    }
    // Chưa có application row — vẫn vào form đăng ký
    setScreen("become-photographer");
  }

  return (
    <div className="flex flex-col min-h-full pb-24" style={{ background: BG }}>
      {/* Header — không hiện badge "Đang duyệt hồ sơ PTG" góc phải */}
      <div className="px-5 py-4 relative flex items-center gap-2" style={{ background: TEAL }}>
        <Camera size={17} className="text-white" />
        <span className="font-bold text-base text-white">Memento</span>
      </div>

      <div className="px-5 mt-4">
        <button onClick={() => setScreen("personal-info")}
          className="w-full bg-white rounded-3xl p-4 border border-border shadow-sm mb-4 flex items-center gap-4 text-left">
          <Avatar src={profile.avatar_url} size={64} />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base truncate" style={{ color: TEAL }}>{displayName}</p>
            {profile.role === "photographer" && <Badge text="🌟 Pro Photographer" color="teal" />}
            {isPending && (
              <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                ⏳ Hồ sơ nhiếp ảnh gia đang được xét duyệt
              </span>
            )}
            {isRejected && (
              <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                Hồ sơ bị từ chối — bấm để chỉnh & gửi lại
              </span>
            )}
          </div>
          <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
        </button>

        {/* Lý do từ chối từ admin — hiện trên app */}
        {isRejected && adminNote && (
          <div className="mb-4 p-3 rounded-2xl bg-red-50 border border-red-100">
            <p className="text-xs font-bold text-red-700 mb-1">Lý do từ chối từ Memento</p>
            <p className="text-xs text-red-800/90 leading-relaxed whitespace-pre-line">{adminNote}</p>
            <button
              type="button"
              onClick={() => setScreen("become-photographer")}
              className="mt-2 text-xs font-bold underline"
              style={{ color: TEAL }}
            >
              Chỉnh sửa & gửi lại hồ sơ →
            </button>
          </div>
        )}

        {/* Admin: duyệt hồ sơ PTG */}
        {profile.role === "admin" && (
          <button
            type="button"
            onClick={() => setScreen("admin-review")}
            className="w-full mb-4 rounded-2xl p-4 flex items-center gap-3 text-left border border-border bg-white shadow-sm"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-amber-50 text-lg">✅</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: TEAL }}>Duyệt hồ sơ photographer</p>
              <p className="text-xs text-muted-foreground">Đồng ý / Từ chối + ghi chú (admin)</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        )}

        {/* CTA đăng ký nếu chưa có hồ sơ PTG */}
        {!hasPtgProfile && profile.role !== "photographer" && (
          <div className="rounded-2xl p-4 mb-4 flex items-center gap-3"
            style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
              <Camera size={22} strokeWidth={1.5} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="font-black text-white text-sm">Trở thành Nhiếp ảnh gia</p>
              <p className="text-white/70 text-xs">Kiếm tiền từ đam mê của bạn</p>
            </div>
            <button onClick={() => setScreen("become-photographer")}
              className="px-3 py-2 rounded-xl bg-white text-xs font-bold"
              style={{ color: TEAL }}>
              Đăng ký
            </button>
          </div>
        )}

        {/* Mục Hồ sơ nhiếp ảnh gia */}
        {hasPtgProfile && (
          <button type="button" onClick={openMyProfile}
            className="w-full bg-white rounded-2xl border border-border p-4 mb-4 flex items-center gap-3 text-left shadow-sm">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#e8f5f0" }}>
              <ImageIcon size={20} style={{ color: TEAL }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: TEAL }}>Hồ sơ nhiếp ảnh gia</p>
              <p className="text-xs text-muted-foreground">
                {isPending
                  ? "Xem trước hồ sơ · Đang chờ duyệt"
                  : isRejected
                    ? "Xem & chỉnh sửa để gửi lại"
                    : "Xem hồ sơ công khai của bạn"}
              </p>
            </div>
            {isPending && (
              <span className="text-[10px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-800 flex-shrink-0">
                ĐANG DUYỆT
              </span>
            )}
            <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
          </button>
        )}

        <div className="bg-white rounded-2xl border border-border overflow-hidden mb-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b border-border">CHUNG</p>
          {[
            { icon: User, label: "Thông tin Cá nhân", screen: "personal-info" as Screen },
            { icon: Globe, label: "Ngôn ngữ", sub: "Tiếng Việt", screen: "profile" as Screen },
          ].map(({ icon: Icon, label, sub, screen: s }) => (
            <button key={label} onClick={() => setScreen(s)}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0 hover:bg-muted transition-colors">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#e8f5f0" }}>
                <Icon size={16} style={{ color: TEAL }} strokeWidth={1.8} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">{label}</p>
                {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
              </div>
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-border overflow-hidden mb-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b border-border">HỖ TRỢ</p>
          {[
            { icon: Phone, label: "Liên hệ hỗ trợ", screen: "contact-us" as Screen },
          ].map(({ icon: Icon, label, screen: s }) => (
            <button key={label} onClick={() => setScreen(s)}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0 hover:bg-muted transition-colors">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#e8f5f0" }}>
                <Icon size={16} style={{ color: TEAL }} strokeWidth={1.8} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">{label}</p>
              </div>
              {label === "Cài đặt" && bankMissing && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold mr-1">
                  1
                </span>
              )}
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-border overflow-hidden mb-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b border-border">TÙY CHỌN</p>
          {[
            { icon: Bell, label: "Thông báo", screen: "notifications" as Screen },
            { icon: Settings, label: "Cài đặt", screen: "privacy" as Screen },
          ].map(({ icon: Icon, label, screen: s }) => (
            <button key={label} onClick={() => setScreen(s)}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0 hover:bg-muted transition-colors">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#e8f5f0" }}>
                <Icon size={16} style={{ color: TEAL }} strokeWidth={1.8} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">{label}</p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
          ))}
        </div>

        <button onClick={async () => { await signOutSafely(); setScreen("login"); }}
          className="w-full py-3.5 rounded-2xl border-2 border-destructive flex items-center justify-center gap-2 font-bold text-destructive bg-white">
          <LogOut size={16} /> Đăng xuất
        </button>

        <p className="text-center text-xs text-muted-foreground mt-3 pb-4">Phiên bản Memento 2.4.1 (Ổn định)</p>
      </div>
    </div>
  );
}
