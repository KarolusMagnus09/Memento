import type { ReactNode } from "react";
import {
  BriefcaseBusiness,
  Camera,
  ChevronLeft,
  ChevronRight,
  Languages,
  MapPin,
  Palette,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Screen } from "../types";
import type { Profile } from "../hooks/useProfile";
import { loadPhotographerProfileDetails } from "../hooks/usePhotographerProfileDetails";
import { TEAL, TEAL_MID, BG } from "../constants";
import { Avatar } from "../components/shared/Avatar";

const EXPERIENCE_LABELS: Record<string, string> = {
  under1: "Dưới 1 năm",
  "1to3": "Từ 1-3 năm",
  "3to5": "Trên 3 năm",
  over5: "Trên 5 năm",
};

const WORK_MODEL_LABELS: Record<string, string> = {
  solo: "Làm việc độc lập",
  team: "Làm việc theo nhóm",
};

function DetailSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#e8f5f0" }}>
          <Icon size={15} style={{ color: TEAL }} />
        </div>
        <h3 className="font-bold text-sm" style={{ color: TEAL }}>{title}</h3>
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function EmptyValue() {
  return <span className="text-sm text-muted-foreground">Chưa cập nhật</span>;
}

export default function PhotographerProfileDetailsScreen({
  setScreen,
  profile,
}: {
  setScreen: (s: Screen) => void;
  profile: Profile;
}) {
  const details = loadPhotographerProfileDetails(profile.id);
  const displayName = profile.full_name || profile.username;

  return (
    <div className="flex flex-col min-h-full pb-8" style={{ background: BG }}>
      <header className="sticky top-0 z-20 px-5 py-4 flex items-center gap-3 border-b border-border bg-white/95 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setScreen("profile")}
          aria-label="Quay về hồ sơ"
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "#e8f5f0", color: TEAL }}
        >
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>
        <div className="min-w-0">
          <p className="font-black text-base truncate" style={{ color: TEAL }}>Thông tin nhiếp ảnh gia</p>
          <p className="text-[11px] text-muted-foreground">Chi tiết hồ sơ công khai</p>
        </div>
      </header>

      <div className="px-5 pt-4 flex flex-col gap-4">
        <div className="bg-white rounded-3xl p-4 border border-border shadow-sm flex items-center gap-3">
          <Avatar src={profile.avatar_url} size={58} />
          <div className="min-w-0 flex-1">
            <p className="font-black text-base truncate" style={{ color: TEAL }}>{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">Hồ sơ nhiếp ảnh gia</p>
          </div>
        </div>

        {!details ? (
          <div className="bg-white rounded-2xl border border-border p-5 text-center">
            <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: `${TEAL_MID}15` }}>
              <Camera size={22} style={{ color: TEAL }} />
            </div>
            <p className="font-bold text-sm mb-1">Chưa có thông tin chi tiết</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Hoàn tất hồ sơ “Trở thành Nhiếp ảnh gia” để các thông tin này xuất hiện tại đây.
            </p>
          </div>
        ) : (
          <>
            <DetailSection icon={BriefcaseBusiness} title="Kinh nghiệm & Thiết bị">
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Kinh nghiệm</p>
                  {details.experienceYears ? <p className="text-sm font-semibold">{EXPERIENCE_LABELS[details.experienceYears] ?? details.experienceYears}</p> : <EmptyValue />}
                </div>
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Thiết bị chụp</p>
                  {details.equipment ? <p className="text-sm whitespace-pre-line leading-relaxed">{details.equipment}</p> : <EmptyValue />}
                </div>
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Kinh nghiệm liên quan</p>
                  {details.experienceDetail ? <p className="text-sm whitespace-pre-line leading-relaxed">{details.experienceDetail}</p> : <EmptyValue />}
                </div>
              </div>
            </DetailSection>

            <DetailSection icon={Languages} title="Ngôn ngữ & Mô hình làm việc">
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Ngôn ngữ</p>
                  {details.languages.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {details.languages.map(lang => (
                        <span key={lang} className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "#e8f5f0", color: TEAL }}>{lang}</span>
                      ))}
                    </div>
                  ) : <EmptyValue />}
                </div>
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Mô hình làm việc</p>
                  {details.workModel ? <p className="text-sm font-semibold">{WORK_MODEL_LABELS[details.workModel] ?? details.workModel}</p> : <EmptyValue />}
                </div>
              </div>
            </DetailSection>

            <DetailSection icon={MapPin} title="Địa chỉ / Khu vực làm việc">
              {details.workLocations.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {details.workLocations.map(location => (
                    <span key={location} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "#fff2df", color: "#b76b18" }}>
                      <MapPin size={11} /> {location}
                    </span>
                  ))}
                </div>
              ) : <EmptyValue />}
            </DetailSection>

            <DetailSection icon={Palette} title="Phong cách chụp">
              {details.selectedStyles.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {details.selectedStyles.map(style => (
                    <span key={style} className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "#e8f5f0", color: TEAL }}>{style}</span>
                  ))}
                </div>
              ) : <EmptyValue />}
              {details.specialtyTags.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Chuyên môn</p>
                  <div className="flex flex-wrap gap-1.5">
                    {details.specialtyTags.map(tag => (
                      <span key={tag} className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "#fff2df", color: "#b76b18" }}>#{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </DetailSection>

            <DetailSection icon={Wrench} title="Giới thiệu">
              {details.bio ? <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{details.bio}</p> : <EmptyValue />}
            </DetailSection>
          </>
        )}

        <button
          type="button"
          onClick={() => setScreen("profile")}
          className="w-full py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}
        >
          <ChevronLeft size={16} /> Quay về Hồ sơ
        </button>
      </div>
    </div>
  );
}
