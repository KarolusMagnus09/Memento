import { ChevronLeft, ChevronDown, CheckCircle, Plus, BookOpen, MapPin, X, Lock, Edit3, IdCard, ScanLine, AlertCircle } from "lucide-react";
import { Avatar } from "../components/shared/Avatar";
import type { Screen } from "../types";
import type { Profile } from "../hooks/useProfile";
import { TEAL, TEAL_MID, TEAL_LIGHT, BG, VN_PROVINCES, styles } from "../constants";
import { ImageLightbox } from "../components/shared/ImageLightbox";
import { BoardCoverCollage } from "../components/shared/BoardCoverCollage";
import { QRCodePlaceholder } from "../components/shared/QRCodePlaceholder";
import { supabase } from "../lib/supabase";
import { useState, useRef } from "react";
import type { MouseEvent } from "react";

const MAX_WORK_LOCATIONS = 4;
const EXPERIENCE_OPTIONS: { value: string; label: string }[] = [
  { value: "under1", label: "Dưới 1 năm" },
  { value: "1to3", label: "Từ 1-3 năm" },
  { value: "3to5", label: "Trên 3 năm" },
  { value: "over5", label: "Trên 5 năm" },
];
const LANGUAGE_OPTIONS = ["Tiếng Việt", "Tiếng Anh", "Tiếng Trung", "Tiếng Hàn", "Tiếng Nhật"];

// Dòng chữ đỏ nhỏ hiện dưới field khi bấm "Tiếp theo" mà field đó còn trống.
function FieldError({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="text-[11px] font-semibold mt-1 flex items-center gap-1" style={{ color: "#dc2626" }}>
      <AlertCircle size={11} /> Vui lòng điền thông tin này
    </p>
  );
}

export default function BecomePhotographerScreen({ setScreen, profile, refreshProfile }:
  { setScreen: (s: Screen) => void; profile: Profile; refreshProfile: () => void }) {
  const [step, setStep] = useState(1);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [openStyleFor, setOpenStyleFor] = useState<string | null>(null);
  const [styleDropdownLeft, setStyleDropdownLeft] = useState(0);
  const styleWrapperRef = useRef<HTMLDivElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [paymentSent, setPaymentSent] = useState(false);
  const TOTAL_STEPS = 5;

  // ── STEP 1 state ─────────────────────────────────────────────────────────
  // "Họ và tên" dùng CHUNG 1 giá trị với tên hiển thị ngoài hồ sơ (profile.full_name)
  // — sửa ở đây sẽ đổi luôn tên hiển thị bên ngoài, không phải bản sao riêng.
  const [fullName, setFullName] = useState(profile.full_name ?? profile.username ?? "");
  const [savingName, setSavingName] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState(profile.phone ?? "");

  // CCCD (căn cước công dân) — chỉ nhận ảnh mặt trước/sau để kiểm tra ảnh có
  // rõ, đầy đủ thông tin hay không. Đây KHÔNG phải bước xác thực danh tính
  // thật (rất khó làm tự động), chỉ là kiểm tra ảnh hợp lệ, đủ nội dung.
  const [cccdFront, setCccdFront] = useState("");
  const [cccdBack, setCccdBack] = useState("");

  const [workLocations, setWorkLocations] = useState<string[]>([]);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);

  const [experienceYears, setExperienceYears] = useState<string | null>(null);
  const [equipment, setEquipment] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [workModel, setWorkModel] = useState<"solo" | "team" | null>(null);

  const [specialtyTags, setSpecialtyTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [experienceDetail, setExperienceDetail] = useState("");
  const [bio, setBio] = useState("");

  // ── STEP 2 — link minh chứng năng lực (trước đây gọi là "Link Profile") ──
  // Đổi tên field để không trùng với tính năng "Link Profile" kiểu Potonow cũ;
  // vẫn giữ nguyên chức năng gửi link để đội ngũ xem qua portfolio/kênh MXH.
  const [proofLink, setProofLink] = useState("");

  // ── Validate & cuộn tới ô chưa điền ──────────────────────────────────────
  // errorFields: tập hợp "key" của những ô đang thiếu/lỗi ở BƯỚC HIỆN TẠI.
  // fieldRefs: map key -> element của khung chứa field đó, dùng để scrollIntoView.
  const [errorFields, setErrorFields] = useState<Set<string>>(new Set());
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const setFieldRef = (key: string) => (el: HTMLDivElement | null) => { fieldRefs.current[key] = el; };
  const clearFieldError = (key: string) =>
    setErrorFields(prev => { if (!prev.has(key)) return prev; const next = new Set(prev); next.delete(key); return next; });

  function scrollToField(key: string) {
    const el = fieldRefs.current[key];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Danh sách field bắt buộc theo THỨ TỰ hiển thị trên màn hình, để nếu thiếu
  // nhiều ô thì luôn cuộn tới ô đầu tiên (từ trên xuống) chứ không phải ô ngẫu nhiên.
  function getStep1Missing(): string[] {
    const missing: string[] = [];
    if (!fullName.trim()) missing.push("fullName");
    if (!birthDate) missing.push("birthDate");
    if (!phone.trim()) missing.push("phone");
    if (!cccdFront || !cccdBack) missing.push("cccd");
    if (workLocations.length === 0) missing.push("workLocations");
    if (!experienceYears) missing.push("experienceYears");
    if (!equipment.trim()) missing.push("equipment");
    if (languages.length === 0) missing.push("languages");
    if (!workModel) missing.push("workModel");
    if (specialtyTags.length === 0) missing.push("specialtyTags");
    if (!bio.trim()) missing.push("bio");
    return missing;
  }

  function getStep2Missing(): string[] {
    const missing: string[] = [];
    if (selectedStyles.length === 0) missing.push("selectedStyles");
    if (!proofLink.trim()) missing.push("proofLink");
    return missing;
  }

  function handleNextClick() {
    const missing = step === 1 ? getStep1Missing() : step === 2 ? getStep2Missing() : [];
    if (missing.length > 0) {
      setErrorFields(new Set(missing));
      scrollToField(missing[0]);
      return;
    }
    setErrorFields(new Set());
    if (step < TOTAL_STEPS) setStep(s => s + 1);
  }

  async function handleNameBlur() {
    const trimmed = fullName.trim();
    if (!trimmed || trimmed === (profile.full_name ?? profile.username ?? "")) return;
    setSavingName(true);
    try {
      await supabase.from("profiles").update({ full_name: trimmed }).eq("id", profile.id);
      refreshProfile();
    } finally {
      setSavingName(false);
    }
  }

  function toggleWorkLocation(loc: string) {
    clearFieldError("workLocations");
    setWorkLocations(prev => {
      if (prev.includes(loc)) return prev.filter(x => x !== loc);
      if (prev.length >= MAX_WORK_LOCATIONS) return prev;
      return [...prev, loc];
    });
  }

  function toggleLanguage(lang: string) {
    clearFieldError("languages");
    setLanguages(prev => prev.includes(lang) ? prev.filter(x => x !== lang) : [...prev, lang]);
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || specialtyTags.includes(t)) { setTagInput(""); return; }
    clearFieldError("specialtyTags");
    setSpecialtyTags(prev => [...prev, t]);
    setTagInput("");
  }

  function removeTag(t: string) {
    setSpecialtyTags(prev => prev.filter(x => x !== t));
  }

  // ── STEP 3 state — banner/avatar, board & pin (ảnh kiểu Pinterest), preview ──
  type Board = { id: string; name: string; private: boolean; cover: string; pins: string[] };
  const [portfolioSubStep, setPortfolioSubStep] = useState<"banner" | "upload" | "preview">("banner");
  const [bannerUrl, setBannerUrl] = useState("");
  // Ảnh đại diện DÙNG CHUNG với hồ sơ khách hàng (profile.avatar_url) — đổi
  // ở đây sẽ lưu thẳng vào profile, y hệt cách "Họ và tên" ở Step 1 hoạt động.
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [boards, setBoards] = useState<Board[]>([]);
  const [standalonePins, setStandalonePins] = useState<string[]>([]);
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardPrivate, setNewBoardPrivate] = useState(false);
  const [bannerPickerOpen, setBannerPickerOpen] = useState(false);
  const [editingBioInline, setEditingBioInline] = useState(false);

  async function persistAvatar(url: string) {
    setAvatarUrl(url);
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
    refreshProfile();
  }

  function pickImageFile(multiple: boolean, capture: boolean, onPicked: (urls: string[]) => void) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (multiple) input.multiple = true;
    if (capture) (input as any).capture = "environment";
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) return;
      onPicked(files.map(f => URL.createObjectURL(f)));
    };
    input.click();
  }

  function createBoard() {
    const name = newBoardName.trim();
    if (!name) return;
    setBoards(prev => [...prev, { id: `board-${Date.now()}`, name, private: newBoardPrivate, cover: "", pins: [] }]);
    setNewBoardName(""); setNewBoardPrivate(false); setShowCreateBoard(false);
  }

  function addPinsToBoard(boardId: string, urls: string[]) {
    setBoards(prev => prev.map(b => b.id === boardId
      ? { ...b, pins: [...b.pins, ...urls], cover: b.cover || urls[0] }
      : b));
  }

  function removePinFromBoard(boardId: string, url: string) {
    setBoards(prev => prev.map(b => b.id === boardId ? { ...b, pins: b.pins.filter(p => p !== url) } : b));
  }

  const stepLabels = [
    "Thông tin cơ bản",
    "Kỹ năng & Phong cách",
    "Portfolio",
    "Điều khoản",
    "Phí dịch vụ & Thanh toán",
  ];

  const toggleStyle = (s: string) => {
    clearFieldError("selectedStyles");
    setSelectedStyles(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const [styleCaretLeft, setStyleCaretLeft] = useState(0);

  function handleStyleTileClick(s: (typeof styles)[number], e: MouseEvent<HTMLButtonElement>) {
    if (openStyleFor === s.label) { setOpenStyleFor(null); return; }
    const btnRect = e.currentTarget.getBoundingClientRect();
    const wrapperRect = styleWrapperRef.current!.getBoundingClientRect();
    const DROPDOWN_WIDTH = 220;
    const tileCenter = btnRect.left - wrapperRect.left + btnRect.width / 2;
    const rawLeft = tileCenter - DROPDOWN_WIDTH / 2;
    const clampedLeft = Math.max(0, Math.min(rawLeft, wrapperRect.width - DROPDOWN_WIDTH));
    setStyleDropdownLeft(clampedLeft);
    // Mũi tên luôn trỏ đúng vào tâm ô vừa bấm, dù dropdown bị ghim lại gần mép
    setStyleCaretLeft(Math.max(14, Math.min(tileCenter - clampedLeft, DROPDOWN_WIDTH - 14)));
    setOpenStyleFor(s.label);
  }

  return (
    <div className="flex flex-col min-h-screen pb-10 no-scrollbar" style={{ background: BG }}>
      {/* Header */}
      <div className="rounded-b-3xl px-5 pt-12 pb-6 text-white"
        style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
        <button onClick={() => setScreen("profile")}
          className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center mb-4">
          <ChevronLeft size={18} strokeWidth={2.5} className="text-white" />
        </button>
        <h2 className="font-black text-xl mb-1">Trở thành Nhiếp ảnh gia</h2>
        <p className="text-white/70 text-sm">Kiếm tiền từ đam mê, kết nối với khách hàng</p>
        <div className="flex gap-1.5 mt-4">
          {stepLabels.map((_, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full transition-all"
              style={{ background: i < step ? "white" : "rgba(255,255,255,0.3)" }} />
          ))}
        </div>
        <p className="text-white/70 text-xs mt-1">Bước {step}/{TOTAL_STEPS} · {stepLabels[step - 1]}</p>
      </div>

      <div className="px-5 mt-4">
        {/* STEP 1 — Basic info */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl p-4 border border-border">
              <p className="font-bold mb-3" style={{ color: TEAL }}>Thông tin cá nhân</p>

              <div className="mb-3" ref={setFieldRef("fullName")}>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Họ và tên *</p>
                <input value={fullName} onChange={e => { setFullName(e.target.value); clearFieldError("fullName"); }} onBlur={handleNameBlur}
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
                  style={errorFields.has("fullName") ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined}
                  placeholder="Nguyễn Văn A" />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {savingName ? "Đang lưu..." : "Đây cũng là tên hiển thị công khai của bạn trong app — sửa ở đây sẽ cập nhật luôn cả 2 nơi."}
                </p>
                <FieldError show={errorFields.has("fullName")} />
              </div>

              <div className="mb-3" ref={setFieldRef("birthDate")}>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Ngày sinh *</p>
                <input type="date" value={birthDate} onChange={e => { setBirthDate(e.target.value); clearFieldError("birthDate"); }}
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
                  style={errorFields.has("birthDate") ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined} />
                <p className="text-[11px] text-muted-foreground mt-1">Bạn phải đủ 16 tuổi để đăng ký.</p>
                <FieldError show={errorFields.has("birthDate")} />
              </div>

              <div className="mb-3" ref={setFieldRef("phone")}>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Số điện thoại *</p>
                <input value={phone} onChange={e => { setPhone(e.target.value); clearFieldError("phone"); }} type="tel"
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
                  style={errorFields.has("phone") ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined}
                  placeholder="0901234567" />
                <FieldError show={errorFields.has("phone")} />
              </div>

              {/* CCCD — chỉ nhận ảnh mặt trước/sau để kiểm tra ảnh rõ, đủ nội
                  dung; KHÔNG phải xác thực danh tính thật vì rất khó tự động hoá. */}
              <div className="mb-3" ref={setFieldRef("cccd")}>
                <p className="text-xs font-semibold text-muted-foreground mb-1">CCCD *</p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: "front" as const, label: "Mặt trước", url: cccdFront, set: setCccdFront, Icon: IdCard },
                    { key: "back" as const, label: "Mặt sau", url: cccdBack, set: setCccdBack, Icon: ScanLine },
                  ]).map(({ key, label, url, set, Icon }) => (
                    <button key={key} type="button"
                      onClick={() => pickImageFile(false, false, urls => { set(urls[0]); clearFieldError("cccd"); })}
                      className="aspect-[3/2] rounded-xl overflow-hidden flex flex-col items-center justify-center gap-1.5 border-2 border-dashed"
                      style={{
                        borderColor: errorFields.has("cccd") && !url ? "#dc2626" : TEAL_LIGHT,
                        background: url ? "transparent" : `${TEAL}06`,
                      }}>
                      {url ? (
                        <img src={url} alt={label} className="w-full h-full object-cover" />
                      ) : (
                        <>
                          <Icon size={22} style={{ color: TEAL_LIGHT }} strokeWidth={1.75} />
                          <span className="text-[11px] font-bold" style={{ color: TEAL }}>{label}</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Dùng cùng 1 loại giấy tờ cho cả 2 mặt, ảnh không nhoè/không chói. Chúng mình chỉ kiểm tra ảnh có rõ và đầy đủ thông tin, không xác thực tính chính chủ của giấy tờ.
                </p>
                <FieldError show={errorFields.has("cccd")} />
              </div>

              {/* Địa điểm làm việc — chọn tối đa 4 tỉnh/thành, hoạt động như tag tìm kiếm */}
              <div className="mb-1" ref={setFieldRef("workLocations")}>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Địa điểm làm việc * (chọn tối đa {MAX_WORK_LOCATIONS})</p>
                <button type="button" onClick={() => setLocationPickerOpen(o => !o)}
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none flex items-center justify-between text-left"
                  style={errorFields.has("workLocations") ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined}>
                  <span className={workLocations.length ? "" : "text-muted-foreground"}>
                    {workLocations.length ? `Đã chọn ${workLocations.length}/${MAX_WORK_LOCATIONS}` : "Chọn tỉnh / thành phố"}
                  </span>
                  <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" style={{ transform: locationPickerOpen ? "rotate(180deg)" : undefined }} />
                </button>

                {workLocations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {workLocations.map(loc => (
                      <span key={loc} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: "#e8f5f0", color: TEAL }}>
                        <MapPin size={11} />{loc}
                        <button type="button" onClick={() => toggleWorkLocation(loc)}><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                )}

                {locationPickerOpen && (
                  <div className="mt-2 border border-border rounded-xl overflow-y-auto no-scrollbar" style={{ maxHeight: 220 }}>
                    {VN_PROVINCES.map(loc => {
                      const checked = workLocations.includes(loc);
                      const disabled = !checked && workLocations.length >= MAX_WORK_LOCATIONS;
                      return (
                        <button key={loc} type="button" disabled={disabled} onClick={() => toggleWorkLocation(loc)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm border-b border-border last:border-0 text-left disabled:opacity-40">
                          <div className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2"
                            style={{ borderColor: checked ? TEAL : "#d1d5db", background: checked ? TEAL : "transparent" }}>
                            {checked && <CheckCircle size={11} className="text-white" strokeWidth={3} />}
                          </div>
                          {loc}
                        </button>
                      );
                    })}
                  </div>
                )}
                <FieldError show={errorFields.has("workLocations")} />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-border">
              <p className="font-bold mb-3" style={{ color: TEAL }}>Kinh nghiệm & Thiết bị</p>

              <div className="mb-4" ref={setFieldRef("experienceYears")}>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Số năm kinh nghiệm *</p>
                <div className="flex flex-col gap-2">
                  {EXPERIENCE_OPTIONS.map(opt => (
                    <button key={opt.value} type="button" onClick={() => { setExperienceYears(opt.value); clearFieldError("experienceYears"); }}
                      className="flex items-center gap-2.5 text-sm text-left">
                      <div className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                        style={{ borderColor: experienceYears === opt.value ? TEAL : (errorFields.has("experienceYears") ? "#dc2626" : "#d1d5db") }}>
                        {experienceYears === opt.value && <div className="w-2 h-2 rounded-full" style={{ background: TEAL }} />}
                      </div>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <FieldError show={errorFields.has("experienceYears")} />
              </div>

              <div className="mb-1" ref={setFieldRef("equipment")}>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Thiết bị chụp hình đang sử dụng *</p>
                <div className="relative">
                  <textarea value={equipment} onChange={e => { setEquipment(e.target.value.slice(0, 200)); clearFieldError("equipment"); }} rows={2}
                    className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none resize-none"
                    style={errorFields.has("equipment") ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined}
                    placeholder="Ví dụ: Sony A7S3 + Lens Sigma 24-70A — nhập tự do, không giới hạn định dạng" />
                  <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">{equipment.length}/200</span>
                </div>
                <FieldError show={errorFields.has("equipment")} />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-border">
              <p className="font-bold mb-3" style={{ color: TEAL }}>Ngôn ngữ & Mô hình làm việc</p>

              <div className="mb-4" ref={setFieldRef("languages")}>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Ngôn ngữ có thể sử dụng *</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {LANGUAGE_OPTIONS.map(lang => {
                    const checked = languages.includes(lang);
                    return (
                      <button key={lang} type="button" onClick={() => toggleLanguage(lang)}
                        className="flex items-center gap-2 text-sm">
                        <div className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2"
                          style={{ borderColor: checked ? TEAL : (errorFields.has("languages") ? "#dc2626" : "#d1d5db"), background: checked ? TEAL : "transparent" }}>
                          {checked && <CheckCircle size={11} className="text-white" strokeWidth={3} />}
                        </div>
                        {lang}
                      </button>
                    );
                  })}
                </div>
                <FieldError show={errorFields.has("languages")} />
              </div>

              <div ref={setFieldRef("workModel")}>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Mô hình làm việc *</p>
                <div className="flex gap-5">
                  {[{ value: "solo" as const, label: "Cá nhân" }, { value: "team" as const, label: "Có Ekip" }].map(opt => (
                    <button key={opt.value} type="button" onClick={() => { setWorkModel(opt.value); clearFieldError("workModel"); }}
                      className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                        style={{ borderColor: workModel === opt.value ? TEAL : (errorFields.has("workModel") ? "#dc2626" : "#d1d5db") }}>
                        {workModel === opt.value && <div className="w-2 h-2 rounded-full" style={{ background: TEAL }} />}
                      </div>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <FieldError show={errorFields.has("workModel")} />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-border" ref={setFieldRef("specialtyTags")}>
              <p className="font-bold mb-1" style={{ color: TEAL }}>Thể loại chụp chuyên môn *</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {specialtyTags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: "#e8f5f0", color: TEAL }}>
                    #{t}
                    <button type="button" onClick={() => removeTag(t)}><X size={11} /></button>
                  </span>
                ))}
              </div>
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
                onBlur={addTag}
                className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
                style={errorFields.has("specialtyTags") ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined}
                placeholder="Ví dụ: chân dung đường phố, ảnh cưới ngoại cảnh..." />
              <FieldError show={errorFields.has("specialtyTags")} />
            </div>

            <div className="bg-white rounded-2xl p-4 border border-border">
              <p className="font-bold mb-1" style={{ color: TEAL }}>Kinh nghiệm liên quan đến nhiếp ảnh</p>
              <p className="text-xs text-muted-foreground mb-2">Ví dụ: Tốt nghiệp Đại học liên quan đến Nhiếp ảnh, đã từng chụp những project/sản phẩm nào...</p>
              <div className="relative">
                <textarea value={experienceDetail} onChange={e => setExperienceDetail(e.target.value.slice(0, 200))} rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none resize-none" />
                <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">{experienceDetail.length}/200</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-border" ref={setFieldRef("bio")}>
              <p className="font-bold mb-1" style={{ color: TEAL }}>Giới thiệu về bạn *</p>
              <p className="text-xs text-muted-foreground mb-2">Hãy viết 1 vài lời nhắn gửi tới những vị khách hàng đang tìm đến bạn nhé!</p>
              <div className="relative">
                <textarea value={bio} onChange={e => { setBio(e.target.value.slice(0, 200)); clearFieldError("bio"); }} rows={4}
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none resize-none"
                  style={errorFields.has("bio") ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined} />
                <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">{bio.length}/200</span>
              </div>
              <FieldError show={errorFields.has("bio")} />
            </div>
          </div>
        )}

        {/* STEP 2 — Skills */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl p-4 border border-border" ref={setFieldRef("selectedStyles")}>
              <p className="font-bold mb-1" style={{ color: TEAL }}>Phong cách chụp *</p>
              <p className="text-xs mb-3" style={{ color: errorFields.has("selectedStyles") ? "#dc2626" : "var(--muted-foreground)" }}>Chọn ít nhất 1 thể loại bạn chuyên chụp</p>

              <div className="relative" ref={styleWrapperRef}>
                <div className="grid grid-cols-4 gap-1.5">
                  {styles.map(s => {
                    const countSelected = s.subcategories.filter(sub => selectedStyles.includes(sub)).length;
                    const active = openStyleFor === s.label || countSelected > 0;
                    return (
                      <button key={s.label} onClick={e => handleStyleTileClick(s, e)}
                        className="flex flex-col items-center justify-center gap-0.5 rounded-xl py-2.5 px-1 transition-colors relative"
                        style={{ background: active ? TEAL : "#f1f2f4" }}>
                        {countSelected > 0 && (
                          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                            {countSelected}
                          </span>
                        )}
                        <span className="text-[11px] font-bold text-center leading-tight" style={{ color: active ? "white" : "#374151" }}>
                          {s.label}
                        </span>
                        <ChevronDown size={12} strokeWidth={2.5} style={{ color: active ? "white" : "#9ca3af", transform: openStyleFor === s.label ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
                      </button>
                    );
                  })}
                </div>

                {openStyleFor && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpenStyleFor(null)} />
                    {/* Mũi tên tam giác nối liền dropdown với đúng ô đang mở */}
                    <div className="absolute z-20 w-3 h-3 bg-white border-l border-t border-border rotate-45"
                      style={{ top: "calc(100% + 3px)", left: styleDropdownLeft + styleCaretLeft - 6 }} />
                    <div className="absolute top-full mt-2.5 z-20 bg-white rounded-2xl shadow-lg border border-border overflow-hidden"
                      style={{ left: styleDropdownLeft, minWidth: 200, maxWidth: 220 }}>
                      {styles.find(s => s.label === openStyleFor)!.subcategories.map(sub => {
                        const checked = selectedStyles.includes(sub);
                        return (
                          <button key={sub} onClick={() => toggleStyle(sub)}
                            className="w-full text-left px-4 py-2.5 text-xs font-semibold border-b border-border last:border-0 flex items-center gap-2"
                            style={{ color: checked ? TEAL : "#374151", background: checked ? "#e8f5f0" : "white" }}>
                            <div className="w-3.5 h-3.5 rounded flex-shrink-0 border-2 flex items-center justify-center"
                              style={{ borderColor: checked ? TEAL : "#d1d5db", background: checked ? TEAL : "transparent" }}>
                              {checked && <CheckCircle size={9} className="text-white" strokeWidth={3} />}
                            </div>
                            {sub}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {selectedStyles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {selectedStyles.map(s => (
                    <span key={s} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "#e8f5f0", color: TEAL }}>
                      {s}
                      <button onClick={() => toggleStyle(s)}><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
              <FieldError show={errorFields.has("selectedStyles")} />
            </div>
            <div className="bg-white rounded-2xl p-4 border border-border">
              <p className="font-bold mb-3" style={{ color: TEAL }}>Kinh nghiệm & Giá cả</p>
              {[
                { label: "Số năm kinh nghiệm", placeholder: "Ví dụ: 3 năm" },
                { label: "Giá khởi điểm (VND/giờ)", placeholder: "Ví dụ: 500.000" },
              ].map(({ label, placeholder }) => (
                <div key={label} className="mb-3 last:mb-0">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
                  <input className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
                    placeholder={placeholder} />
                </div>
              ))}
            </div>

            {/* Trước đây là "Link Profile" kiểu Potonow — đổi tên để tránh
                trùng tên tính năng cũ, chức năng vẫn giữ: gửi link để đội ngũ
                xem qua các bộ ảnh/kênh MXH đã từng chụp. */}
            <div className="bg-white rounded-2xl p-4 border border-border" ref={setFieldRef("proofLink")}>
              <p className="font-bold mb-1" style={{ color: TEAL }}>Link minh chứng năng lực *</p>
              <p className="text-xs text-muted-foreground mb-2">
                Dán link Facebook/Instagram/Portfolio có sẵn những bộ ảnh bạn đã chụp — chúng mình sẽ xem qua để đảm bảo hồ sơ có đủ thông tin, hình ảnh minh chứng rõ ràng.
              </p>
              <input value={proofLink} onChange={e => { setProofLink(e.target.value); clearFieldError("proofLink"); }}
                className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
                style={errorFields.has("proofLink") ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined}
                placeholder="Facebook / Instagram / link Portfolio..." />
              <FieldError show={errorFields.has("proofLink")} />
            </div>
          </div>
        )}

        {/* STEP 3 — Portfolio */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            {/* ── 3a. Ảnh bìa (banner) + ảnh đại diện ─────────────────────── */}
            {portfolioSubStep === "banner" && (
              <>
                <div className="bg-white rounded-2xl p-4 border border-border">
                  <p className="font-bold mb-1" style={{ color: TEAL }}>Ảnh bìa hồ sơ</p>
                  <p className="text-xs text-muted-foreground mb-3">Ảnh này hiện ở đầu trang hồ sơ công khai của bạn.</p>
                  <div className="aspect-[16/9] rounded-xl overflow-hidden bg-muted flex items-center justify-center relative">
                    {bannerUrl ? <img src={bannerUrl} alt="" className="w-full h-full object-cover" /> : (
                      <span className="text-xs text-muted-foreground">Chưa có ảnh bìa</span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => pickImageFile(false, true, urls => setBannerUrl(urls[0]))}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2" style={{ borderColor: TEAL, color: TEAL }}>
                      Tự chụp ảnh
                    </button>
                    <button onClick={() => pickImageFile(false, false, urls => setBannerUrl(urls[0]))}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: TEAL }}>
                      Chọn từ thư viện
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">Có thể đổi lại ảnh bìa bất cứ lúc nào sau này trong phần chỉnh sửa hồ sơ.</p>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-border flex items-center gap-3">
                  <Avatar src={avatarUrl} size={56} />
                  <div className="flex-1">
                    <p className="font-bold text-sm" style={{ color: TEAL }}>Ảnh đại diện</p>
                    <p className="text-xs text-muted-foreground">Dùng chung với hồ sơ cá nhân của bạn</p>
                  </div>
                  <button onClick={() => pickImageFile(false, false, urls => persistAvatar(urls[0]))}
                    className="text-xs font-bold px-3 py-2 rounded-xl border-2" style={{ borderColor: TEAL, color: TEAL }}>
                    Đổi ảnh
                  </button>
                </div>

                <button onClick={() => setPortfolioSubStep("upload")}
                  className="w-full py-3.5 rounded-2xl font-bold text-white shadow-md active:scale-95 transition-transform"
                  style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
                  Tiếp tục → Tải ảnh portfolio
                </button>
              </>
            )}

            {/* ── 3b. Upload ảnh kiểu Pinterest: tạo board hoặc đăng ảnh lẻ ── */}
            {portfolioSubStep === "upload" && (
              <>
                <div className="bg-white rounded-2xl p-4 border border-border">
                  <p className="font-bold mb-1" style={{ color: TEAL }}>Portfolio của bạn</p>
                  <p className="text-xs text-muted-foreground mb-3">Gom ảnh theo từng bộ sưu tập (board), hoặc đăng ảnh lẻ không cần gom nhóm.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowCreateBoard(true)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2 flex items-center justify-center gap-1.5" style={{ borderColor: TEAL, color: TEAL }}>
                      <Plus size={14} /> Tạo bộ sưu tập
                    </button>
                    <button onClick={() => pickImageFile(true, false, urls => setStandalonePins(prev => [...prev, ...urls]))}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5" style={{ background: TEAL }}>
                      <Plus size={14} /> Thêm ảnh lẻ
                    </button>
                  </div>
                </div>

                {showCreateBoard && (
                  <div className="bg-white rounded-2xl p-4 border-2" style={{ borderColor: TEAL_LIGHT }}>
                    <p className="font-bold mb-3 text-sm" style={{ color: TEAL }}>Bộ sưu tập mới</p>
                    <input value={newBoardName} onChange={e => setNewBoardName(e.target.value)} autoFocus
                      className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none mb-3" placeholder="Ví dụ: Ảnh cưới ngoại cảnh" />
                    <button onClick={() => setNewBoardPrivate(p => !p)} className="flex items-center gap-2.5 text-sm mb-4">
                      <div className="w-9 h-5 rounded-full p-0.5 transition-colors" style={{ background: newBoardPrivate ? TEAL : "#d1d5db" }}>
                        <div className="w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: newBoardPrivate ? "translateX(16px)" : "translateX(0)" }} />
                      </div>
                      Đặt bộ sưu tập ở chế độ riêng tư
                    </button>
                    <div className="flex gap-2">
                      <button onClick={createBoard} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: TEAL }}>Tạo</button>
                      <button onClick={() => setShowCreateBoard(false)} className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2" style={{ borderColor: TEAL, color: TEAL }}>Hủy</button>
                    </div>
                  </div>
                )}

                {boards.map(b => (
                  <div key={b.id} className="bg-white rounded-2xl p-4 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-sm flex items-center gap-1.5" style={{ color: TEAL }}>
                        {b.private && <Lock size={12} />}{b.name}
                      </p>
                      <button onClick={() => pickImageFile(true, false, urls => addPinsToBoard(b.id, urls))}
                        className="text-xs font-bold" style={{ color: TEAL_LIGHT }}>+ Thêm ảnh</button>
                    </div>
                    {b.pins.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Chưa có ảnh nào trong bộ sưu tập này.</p>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5">
                        {b.pins.map(url => (
                          <div key={url} className="relative aspect-square rounded-lg overflow-hidden cursor-pointer" onClick={() => setLightboxSrc(url)}>
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <button onClick={e => { e.stopPropagation(); removePinFromBoard(b.id, url); }}
                              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center">
                              <X size={10} className="text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {standalonePins.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 border border-border">
                    <p className="font-bold text-sm mb-2" style={{ color: TEAL }}>Ảnh đăng lẻ</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {standalonePins.map(url => (
                        <div key={url} className="relative aspect-square rounded-lg overflow-hidden cursor-pointer" onClick={() => setLightboxSrc(url)}>
                          <img src={url} alt="" className="w-full h-full object-cover" />
                          <button onClick={e => { e.stopPropagation(); setStandalonePins(prev => prev.filter(p => p !== url)); }}
                            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center">
                            <X size={10} className="text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setPortfolioSubStep("banner")}
                    className="flex-1 py-3.5 rounded-2xl font-bold border-2" style={{ borderColor: TEAL, color: TEAL }}>
                    ← Quay lại
                  </button>
                  <button onClick={() => setPortfolioSubStep("preview")}
                    className="flex-1 py-3.5 rounded-2xl font-bold text-white shadow-md"
                    style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
                    Xem trước hồ sơ →
                  </button>
                </div>
              </>
            )}

            {/* ── 3c. Xem trước hồ sơ công khai — bấm bút chì để sửa ngay ──── */}
            {portfolioSubStep === "preview" && (
              <>
                <p className="text-xs text-center text-muted-foreground -mt-1">Đây là hồ sơ khách hàng sẽ thấy — bấm biểu tượng bút để sửa trực tiếp.</p>

                <div className="bg-white rounded-2xl overflow-hidden border border-border">
                  <div className="relative aspect-[16/9] bg-muted">
                    {bannerUrl && <img src={bannerUrl} alt="" className="w-full h-full object-cover" />}
                    <button onClick={() => setBannerPickerOpen(o => !o)}
                      className="absolute top-2 left-2 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center">
                      <Edit3 size={13} style={{ color: TEAL }} />
                    </button>
                    {bannerPickerOpen && (
                      <div className="absolute top-11 left-2 bg-white rounded-xl shadow-lg border border-border overflow-hidden z-10">
                        <button onClick={() => { setBannerPickerOpen(false); pickImageFile(false, true, urls => setBannerUrl(urls[0])); }}
                          className="block w-full text-left px-4 py-2.5 text-xs font-semibold border-b border-border">Tự chụp ảnh</button>
                        <button onClick={() => { setBannerPickerOpen(false); pickImageFile(false, false, urls => setBannerUrl(urls[0])); }}
                          className="block w-full text-left px-4 py-2.5 text-xs font-semibold">Chọn từ thư viện</button>
                      </div>
                    )}
                    <div className="absolute -bottom-8 left-4">
                      <div className="relative">
                        <Avatar src={avatarUrl} size={64} className="border-4 border-white shadow-lg" />
                        <button onClick={() => pickImageFile(false, false, urls => persistAvatar(urls[0]))}
                          className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white shadow flex items-center justify-center">
                          <Edit3 size={11} style={{ color: TEAL }} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-10 px-4 pb-4">
                    <p className="font-black text-lg" style={{ color: TEAL }}>{fullName || "Tên hiển thị"}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {specialtyTags.map(t => (
                        <span key={t} className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "#e8f5f0", color: TEAL }}>#{t}</span>
                      ))}
                    </div>

                    <div className="relative mt-3 p-3 rounded-xl" style={{ background: BG }}>
                      <button onClick={() => setEditingBioInline(o => !o)} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white shadow flex items-center justify-center">
                        <Edit3 size={11} style={{ color: TEAL }} />
                      </button>
                      {editingBioInline ? (
                        <textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 200))} rows={3} autoFocus
                          className="w-full bg-transparent text-sm outline-none resize-none pr-6" />
                      ) : (
                        <p className="text-sm text-muted-foreground pr-6">{bio || "Chưa có giới thiệu bản thân."}</p>
                      )}
                    </div>

                    {(boards.length > 0 || standalonePins.length > 0) && (
                      <div className="mt-3">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Bộ sưu tập</p>
                        <div className="grid grid-cols-3 gap-2">
                          {boards.map(b => (
                            <button key={b.id} onClick={() => (b.cover || b.pins[0]) && setLightboxSrc(b.cover || b.pins[0])} className="text-left">
                              <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                                <BoardCoverCollage pins={b.cover ? [b.cover, ...b.pins.filter(p => p !== b.cover)] : b.pins} />
                              </div>
                              <p className="text-[11px] font-bold mt-1 truncate flex items-center gap-1">
                                {b.private && <Lock size={9} className="text-muted-foreground flex-shrink-0" />}
                                {b.name}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{b.pins.length} ảnh</p>
                            </button>
                          ))}
                        </div>
                        {standalonePins.length > 0 && (
                          <>
                            {/* Thay vì ghi chữ "Ảnh đăng lẻ", kẻ 1 đường kẻ mảnh để phân tách khỏi bộ sưu tập phía trên */}
                            <div className="h-px mt-4 mb-3" style={{ background: "var(--border)" }} />
                            <div className="grid grid-cols-3 gap-2">
                              {standalonePins.map((url, i) => (
                                <button key={i} onClick={() => setLightboxSrc(url)} className="aspect-square rounded-lg overflow-hidden">
                                  <img src={url} alt="" className="w-full h-full object-cover" />
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setPortfolioSubStep("upload")}
                    className="flex-1 py-3.5 rounded-2xl font-bold border-2" style={{ borderColor: TEAL, color: TEAL }}>
                    ← Sửa ảnh portfolio
                  </button>
                  <button onClick={() => setStep(4)}
                    className="flex-1 py-3.5 rounded-2xl font-bold text-white shadow-md"
                    style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
                    Xác nhận & Lưu
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 4 — Terms */}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2"
                style={{ background: `${TEAL}10` }}>
                <BookOpen size={16} style={{ color: TEAL }} />
                <p className="font-bold text-sm" style={{ color: TEAL }}>Điều khoản & Quy định dành cho Nhiếp ảnh gia</p>
              </div>
              <div className="px-4 py-4 max-h-64 overflow-y-auto">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-bold text-foreground block mb-2">1. Yêu cầu chất lượng</span>
                  Nhiếp ảnh gia phải đảm bảo chất lượng ảnh đúng với mô tả trong profile. Ảnh giao cho khách phải được chỉnh sửa chuyên nghiệp và giao đúng hạn đã cam kết.
                  {"\n\n"}
                  <span className="font-bold text-foreground block mb-2 mt-3">2. Ứng xử chuyên nghiệp</span>
                  Tôn trọng khách hàng, đúng giờ, trang phục phù hợp. Mọi hành vi không chuyên nghiệp sẽ dẫn đến đình chỉ tài khoản.
                  {"\n\n"}
                  <span className="font-bold text-foreground block mb-2 mt-3">3. Chính sách hủy lịch</span>
                  Hủy trước 48 giờ: không phạt. Hủy trong 24 giờ: hoàn 50%. Hủy trong ngày: không hoàn tiền. Memento có quyền điều chỉnh chính sách này.
                  {"\n\n"}
                  <span className="font-bold text-foreground block mb-2 mt-3">4. Phí hoa hồng nền tảng</span>
                  Memento thu phí hoa hồng theo từng booking (tỷ lệ sẽ được thông báo khi hệ thống ra mắt chính thức). Phí được trừ tự động trước khi thanh toán cho nhiếp ảnh gia.
                  {"\n\n"}
                  <span className="font-bold text-foreground block mb-2 mt-3">5. Nội dung & bản quyền</span>
                  Nhiếp ảnh gia giữ bản quyền ảnh. Memento được phép sử dụng ảnh cho mục đích quảng bá nền tảng với sự đồng ý của bạn.
                  {"\n\n"}
                  <span className="font-bold text-foreground block mb-2 mt-3">6. Xét duyệt hồ sơ</span>
                  Memento có toàn quyền từ chối hoặc đình chỉ bất kỳ hồ sơ nào không đáp ứng tiêu chuẩn chất lượng của nền tảng. Quyết định của Memento là quyết định cuối cùng.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-border">
              <div className="flex items-center gap-2 p-3 rounded-xl mb-3"
                style={{ background: "#fff8e1", border: "1px solid #f59e0b40" }}>
                <span className="text-lg flex-shrink-0">⚠️</span>
                <p className="text-xs" style={{ color: "#92400e" }}>
                  Hồ sơ sẽ được đội ngũ Memento xét duyệt thủ công trong <strong>vài giờ đến vài ngày</strong>. Chúng mình sẽ liên hệ qua email/SĐT khi có kết quả.
                </p>
              </div>
              <button onClick={() => setAgreedTerms(!agreedTerms)}
                className="flex items-start gap-3 w-full text-left">
                <div className="w-5 h-5 rounded-md border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all"
                  style={{ borderColor: agreedTerms ? TEAL_LIGHT : "var(--border)", background: agreedTerms ? TEAL_LIGHT : "transparent" }}>
                  {agreedTerms && <span className="text-white text-xs font-black">✓</span>}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Tôi đã đọc và đồng ý với <span style={{ color: TEAL_LIGHT }} className="font-semibold">Điều khoản dịch vụ</span> và{" "}
                  <span style={{ color: TEAL_LIGHT }} className="font-semibold">Chính sách của Memento</span>.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* STEP 5 — Payment via QR / MoMo */}
        {step === 5 && !paymentSent && (
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl p-4 border border-border text-center">
              <p className="font-bold mb-1" style={{ color: TEAL }}>💳 Phí đăng ký dịch vụ</p>
              <p className="text-xs text-muted-foreground mb-3">
                Phí một lần để Memento xét duyệt & kích hoạt hồ sơ của bạn
              </p>
              <div className="inline-block px-5 py-2 rounded-2xl mb-1"
                style={{ background: `${TEAL}10`, border: `2px dashed ${TEAL_LIGHT}` }}>
                <p className="text-2xl font-black" style={{ color: TEAL }}>Đang cập nhật</p>
                <p className="text-xs text-muted-foreground">Giá chính thức sẽ thông báo sớm</p>
              </div>
            </div>

            {/* QR transfer */}
            <div className="bg-white rounded-2xl p-4 border border-border">
              <p className="font-bold mb-3" style={{ color: TEAL }}>📱 Chuyển khoản qua QR / MoMo</p>
              <div className="flex justify-center mb-4">
                <div className="p-3 rounded-2xl border-2 border-dashed"
                  style={{ borderColor: TEAL_LIGHT }}>
                  <QRCodePlaceholder />
                </div>
              </div>
              <div className="flex flex-col gap-2 text-sm">
                {[
                  { label: "Ngân hàng", value: "Vietcombank" },
                  { label: "Số tài khoản", value: "1234 5678 9012 (placeholder)" },
                  { label: "Chủ tài khoản", value: "CÔNG TY MEMENTO" },
                  { label: "Nội dung CK", value: "DANKY [SĐT của bạn]" },
                  { label: "Số tiền", value: "Xem thông báo email" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-muted-foreground text-xs">{label}</span>
                    <span className="font-semibold text-xs text-right max-w-[55%]" style={{ color: TEAL }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* MoMo deep link button */}
            <div className="bg-white rounded-2xl p-4 border border-border">
              <p className="font-bold mb-1" style={{ color: TEAL }}>Thanh toán qua MoMo</p>
              <p className="text-xs text-muted-foreground mb-3">
                Mở app MoMo với thông tin điền sẵn — bạn tự xác nhận bước cuối trong MoMo.
              </p>
              <a
                href="momo://app?action=payWithApp&isScanQR=false&serviceType=transfer&target=0901234567&targetType=phone&amount=0&note=DANKY+Memento&appId=memento"
                onClick={e => { e.preventDefault(); alert("Sẽ mở app MoMo với thông tin điền sẵn. Bạn tự bấm xác nhận trong MoMo."); }}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-bold text-white active:scale-95 transition-transform"
                style={{ background: "linear-gradient(135deg, #ae2070 0%, #d82d8b 100%)", display: "flex" }}>
                <span className="text-xl">🟣</span>
                Mở MoMo để thanh toán
              </a>
              <p className="text-center text-xs text-muted-foreground mt-2">
                Bạn vẫn tự bấm xác nhận cuối trong MoMo
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-border">
              <p className="font-bold mb-1 text-sm" style={{ color: TEAL }}>Sau khi chuyển khoản xong</p>
              <p className="text-xs text-muted-foreground mb-3">
                Nhấn xác nhận bên dưới — đội ngũ Memento sẽ kiểm tra và liên hệ lại trong vài giờ đến vài ngày.
              </p>
              <button onClick={() => setPaymentSent(true)}
                className="w-full py-3.5 rounded-2xl font-bold text-white shadow-lg active:scale-95 transition-all"
                style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
                ✅ Tôi đã chuyển khoản xong
              </button>
            </div>
          </div>
        )}

        {/* STEP 5 done — Pending review */}
        {step === 5 && paymentSent && (
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl p-6 border border-border text-center">
              <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl"
                style={{ background: `${TEAL_LIGHT}20` }}>
                🎉
              </div>
              <h3 className="font-black text-xl mb-2" style={{ color: TEAL }}>Đã nhận hồ sơ!</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Memento đang xem xét thông tin của bạn. Chúng mình sẽ liên hệ qua email và SĐT khi có kết quả.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { icon: "📋", label: "Thông tin cá nhân", status: "Đã nhận" },
                { icon: "🎨", label: "Kỹ năng & Phong cách", status: "Đã nhận" },
                { icon: "🖼️", label: "Portfolio", status: "Đang xem xét" },
                { icon: "📜", label: "Điều khoản", status: "Đã đồng ý" },
                { icon: "💳", label: "Phí dịch vụ", status: "Chờ xác nhận" },
              ].map(({ icon, label, status }) => (
                <div key={label} className="flex items-center gap-3 bg-white px-4 py-3 rounded-xl border border-border">
                  <span className="text-lg">{icon}</span>
                  <p className="flex-1 text-sm font-semibold">{label}</p>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full"
                    style={{ background: `${TEAL_LIGHT}20`, color: TEAL_LIGHT }}>{status}</span>
                </div>
              ))}
            </div>
            <div className="p-4 rounded-2xl text-center" style={{ background: `${TEAL}10`, border: `1.5px dashed ${TEAL_LIGHT}` }}>
              <p className="text-xs" style={{ color: TEAL }}>
                ⏱️ Thời gian xét duyệt thường từ <strong>vài giờ đến vài ngày</strong> làm việc. Cảm ơn bạn đã kiên nhẫn!
              </p>
            </div>
            <button onClick={() => setScreen("profile")}
              className="w-full py-3.5 rounded-2xl font-bold text-white"
              style={{ background: TEAL }}>
              Về trang Hồ sơ
            </button>
          </div>
        )}

        {/* Nav buttons */}
        {!(step === 5 && paymentSent) && step !== 3 && (
          <div className="flex gap-3 mt-5">
            {step > 1 && (
              <button onClick={() => { setErrorFields(new Set()); setStep(s => s - 1); }}
                className="flex-1 py-3.5 rounded-2xl font-bold border-2"
                style={{ borderColor: TEAL, color: TEAL }}>
                ← Trở lại
              </button>
            )}
            <button
              onClick={handleNextClick}
              disabled={step === 4 && !agreedTerms}
              className="flex-1 py-3.5 rounded-2xl font-bold text-white shadow-lg disabled:opacity-40 transition-all active:scale-95"
              style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
              {step === TOTAL_STEPS ? "Xem hướng dẫn thanh toán ↑" : "Tiếp theo →"}
            </button>
          </div>
        )}
      </div>

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} liked={false} likeCount={0} onToggleLike={() => {}} onClose={() => setLightboxSrc(null)} showLike={false} />
      )}
    </div>
  );
}
