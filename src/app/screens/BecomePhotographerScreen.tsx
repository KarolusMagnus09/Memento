import { useBackHandler } from "../lib/backNavigation";
import { ChevronLeft, ChevronDown, CheckCircle, Plus, BookOpen, MapPin, X, Edit3, IdCard, ScanLine, AlertCircle } from "lucide-react";
import { Avatar } from "../components/shared/Avatar";
import type { Screen } from "../types";
import type { Profile } from "../hooks/useProfile";
import { TEAL, TEAL_MID, TEAL_LIGHT, BG, VN_PROVINCES, styles, VN_BANKS } from "../constants";
import { ImageLightbox } from "../components/shared/ImageLightbox";
import { BoardCoverCollage } from "../components/shared/BoardCoverCollage";
import { supabase } from "../lib/supabase";
import { uploadImageIfLocal, uploadImagesIfLocal } from "../lib/uploadFile";
import { notifySupportNewApplication } from "../lib/notifySupport";
import { useState, useRef, useEffect } from "react";
import type { MouseEvent } from "react";
import { InfiniteMasonryBox } from "../components/shared/InfiniteMasonryBox";

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
  /** true = đã submit hồ sơ lên Supabase, đang chờ duyệt */
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
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
  const [bankName, setBankName] = useState("");
  const [bankCode, setBankCode] = useState("BIDV");
  const [bankAccount, setBankAccount] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");

  const [workLocations, setWorkLocations] = useState<string[]>([]);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);

  const [experienceYears, setExperienceYears] = useState<string | null>(null);
  const [equipment, setEquipment] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [workModel, setWorkModel] = useState<"solo" | "team" | null>(null);

  // Mô tả kinh nghiệm / phong cách chụp (free text, thay cho tag # cũ)
  const [styleDescription, setStyleDescription] = useState("");

  const [experienceDetail, setExperienceDetail] = useState("");
  const [bio, setBio] = useState("");

  // Skill phụ đi kèm (makeup / edit / thuê & phụ kiện) — tick box ở step 1
  const [skillMakeup, setSkillMakeup] = useState(false);
  const [skillEdit, setSkillEdit] = useState(false);
  const [skillRental, setSkillRental] = useState(false);

  // ── STEP 2 — Bảng giá dạng nhóm (category bắt buộc + list con) ───────────
  // category giúp lọc / hiện tab "Thuê & phụ kiện" trên hồ sơ công khai
  type PriceCategory = "photo" | "makeup" | "editor" | "rental";
  type PriceLine = { id: string; name: string; price: string; detail: string };
  type PriceGroup = { id: string; title: string; category: PriceCategory; lines: PriceLine[] };
  const PRICE_CATEGORIES: { value: PriceCategory; label: string; hint: string }[] = [
    { value: "photo", label: "Chụp ảnh", hint: "Gói chụp, session, album..." },
    { value: "makeup", label: "Make Up", hint: "Trang điểm, bôi trắng..." },
    { value: "editor", label: "Editor", hint: "Retouch, chỉnh sửa ảnh..." },
    { value: "rental", label: "Thuê & phụ kiện", hint: "Studio, đèn, máy, đạo cụ..." },
  ];
  const categoryLabel = (c: PriceCategory) => PRICE_CATEGORIES.find(x => x.value === c)?.label ?? c;

  const [priceGroups, setPriceGroups] = useState<PriceGroup[]>([]);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [newGroupCategory, setNewGroupCategory] = useState<PriceCategory | null>(null);
  const [addingLineToGroupId, setAddingLineToGroupId] = useState<string | null>(null);
  const [newLineName, setNewLineName] = useState("");
  const [newLinePrice, setNewLinePrice] = useState("");
  const [newLineDetail, setNewLineDetail] = useState("");

  // Link minh chứng — giọng khuyến khích kiểu PotoNow
  const [proofLink, setProofLink] = useState("");

  // Preview: mở 1 board để xem full gallery masonry
  const [previewOpenBoardId, setPreviewOpenBoardId] = useState<string | null>(null);

  // ── Validate & cuộn tới ô chưa điền ──────────────────────────────────────
  // errorFields: tập hợp "key" của những ô đang thiếu/lỗi ở BƯỚC HIỆN TẠI.
  // fieldRefs: map key -> element của khung chứa field đó, dùng để scrollIntoView.
  const [errorFields, setErrorFields] = useState<Set<string>>(new Set());
  // Vuốt/Back: đóng ảnh/menu đang mở; không thì lùi 1 bước của form; bước 1 thì lùi màn như bình thường
  useBackHandler(!!lightboxSrc, () => setLightboxSrc(null));
  useBackHandler(!!openStyleFor, () => setOpenStyleFor(null));
  useBackHandler(true, () => {
    if (step <= 1) return false;
    setErrorFields(new Set());
    setStep((s) => s - 1);
  }, 0.5);
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
    if (!bankCode || !bankAccount.trim()) missing.push("bank");
    if (!bankAccountName.trim()) missing.push("bank");
    if (workLocations.length === 0) missing.push("workLocations");
    if (!experienceYears) missing.push("experienceYears");
    if (!equipment.trim()) missing.push("equipment");
    if (languages.length === 0) missing.push("languages");
    if (!workModel) missing.push("workModel");
    if (!styleDescription.trim()) missing.push("styleDescription");
    if (!bio.trim()) missing.push("bio");
    return missing;
  }

  function getStep2Missing(): string[] {
    const missing: string[] = [];
    if (selectedStyles.length === 0) missing.push("selectedStyles");
    const hasAnyPrice = priceGroups.some(g => g.lines.length > 0);
    if (!hasAnyPrice) missing.push("priceGroups");
    if (!proofLink.trim()) missing.push("proofLink");
    return missing;
  }

  function formatVnd(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    return Number(digits).toLocaleString("vi-VN");
  }

  function addPriceGroup() {
    const title = newGroupTitle.trim();
    if (!title || !newGroupCategory) return;
    // Thuê & phụ kiện chỉ cho phép khi đã tick skill phụ tương ứng
    if (newGroupCategory === "rental" && !skillRental) return;
    const id = `grp-${Date.now()}`;
    setPriceGroups(prev => [...prev, { id, title, category: newGroupCategory, lines: [] }]);
    setNewGroupTitle("");
    setNewGroupCategory(null);
    setShowGroupForm(false);
    setAddingLineToGroupId(id);
    clearFieldError("priceGroups");
  }

  function removePriceGroup(id: string) {
    setPriceGroups(prev => prev.filter(g => g.id !== id));
    if (addingLineToGroupId === id) setAddingLineToGroupId(null);
  }

  function addPriceLine(groupId: string) {
    const name = newLineName.trim();
    const priceDigits = newLinePrice.replace(/\D/g, "");
    if (!name || !priceDigits) return;
    setPriceGroups(prev => prev.map(g => g.id === groupId
      ? { ...g, lines: [...g.lines, { id: `ln-${Date.now()}`, name, price: priceDigits, detail: newLineDetail.trim() }] }
      : g));
    setNewLineName("");
    setNewLinePrice("");
    setNewLineDetail("");
    setAddingLineToGroupId(null);
    clearFieldError("priceGroups");
  }

  function removePriceLine(groupId: string, lineId: string) {
    setPriceGroups(prev => prev.map(g => g.id === groupId
      ? { ...g, lines: g.lines.filter(l => l.id !== lineId) }
      : g));
  }

  // Gợi ý mềm: đã tick skill phụ mà chưa có nhóm giá đúng category
  const hasCat = (c: PriceCategory) => priceGroups.some(g => g.category === c && g.lines.length > 0);
  const needsMakeupPrice = skillMakeup && !hasCat("makeup");
  const needsEditPrice = skillEdit && !hasCat("editor");
  const needsRentalPrice = skillRental && !hasCat("rental");

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
  // Board / ảnh lẻ CHỈ cho tab Thuê & phụ kiện (tách khỏi portfolio chụp)
  const [rentalBoards, setRentalBoards] = useState<Board[]>([]);
  const [rentalPins, setRentalPins] = useState<string[]>([]);
  const [showCreateRentalBoard, setShowCreateRentalBoard] = useState(false);
  const [newRentalBoardName, setNewRentalBoardName] = useState("");
  const [bannerPickerOpen, setBannerPickerOpen] = useState(false);
  const [editingBioInline, setEditingBioInline] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [previewTab, setPreviewTab] = useState<"portfolio" | "reviews" | "pricing" | "rental">("portfolio");

  // Gallery preview: 6 ảnh đầu, vuốt xuống mới hiện thêm
  const previewGalleryPins =
    previewOpenBoardId === "__standalone__" ? standalonePins
    : previewOpenBoardId && !previewOpenBoardId.startsWith("rental:") && previewOpenBoardId !== "__rental_standalone__"
      ? (boards.find(b => b.id === previewOpenBoardId)?.pins ?? [])
      : [];

  const previewRentalPins =
    previewOpenBoardId === "__rental_standalone__" ? rentalPins
    : previewOpenBoardId?.startsWith("rental:")
      ? (rentalBoards.find(b => `rental:${b.id}` === previewOpenBoardId)?.pins ?? [])
      : [];

  // List thumbnail "Ảnh đăng lẻ" khi chưa mở board — cũng hiện dần

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
    setBoards(prev => [...prev, { id: `board-${Date.now()}`, name, private: false, cover: "", pins: [] }]);
    setNewBoardName(""); setShowCreateBoard(false);
  }

  function addPinsToBoard(boardId: string, urls: string[]) {
    setBoards(prev => prev.map(b => b.id === boardId
      ? { ...b, pins: [...b.pins, ...urls], cover: b.cover || urls[0] }
      : b));
  }

  function createRentalBoard() {
    const name = newRentalBoardName.trim();
    if (!name) return;
    setRentalBoards(prev => [...prev, { id: `rent-${Date.now()}`, name, private: false, cover: "", pins: [] }]);
    setNewRentalBoardName(""); setShowCreateRentalBoard(false);
  }

  function addPinsToRentalBoard(boardId: string, urls: string[]) {
    setRentalBoards(prev => prev.map(b => b.id === boardId
      ? { ...b, pins: [...b.pins, ...urls], cover: b.cover || urls[0] }
      : b));
  }

  function removePinFromRentalBoard(boardId: string, url: string) {
    setRentalBoards(prev => prev.map(b => b.id === boardId ? { ...b, pins: b.pins.filter(p => p !== url) } : b));
  }

  function removePinFromBoard(boardId: string, url: string) {
    setBoards(prev => prev.map(b => b.id === boardId ? { ...b, pins: b.pins.filter(p => p !== url) } : b));
  }

  const stepLabels = [
    "Thông tin cơ bản",
    "Bảng giá & Minh chứng",
    "Portfolio",
    "Điều khoản",
    "Gửi hồ sơ",
  ];

  // ── Điền lại thông tin cũ từ hồ sơ đã gửi trước đó ───────────────────────
  // Khi hồ sơ bị từ chối (hoặc còn nháp), dòng photographer_applications vẫn còn
  // nguyên trong DB → đọc lại và điền vào form để user chỉ cần sửa chỗ bị góp ý,
  // không phải nhập lại từ đầu. Ảnh cũ là URL http(s) nên khi gửi lại sẽ được
  // giữ nguyên (uploadImageIfLocal không upload lại).
  const [prefillInfo, setPrefillInfo] = useState<{ status: string; note: string | null } | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("photographer_applications")
        .select("*")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      if (data.status === "approved") return; // đã duyệt: không cho sửa lại ở form này

      const str = (v: unknown) => (typeof v === "string" ? v : "");
      const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

      setFullName(prev => str(data.full_name) || prev);
      setBirthDate(str(data.birth_date));
      setPhone(prev => str(data.phone) || prev);
      setCccdFront(str(data.cccd_front_url));
      setCccdBack(str(data.cccd_back_url));
      setBankName(str(data.bank_name));
      setBankCode(str(data.bank_code) || "BIDV");
      setBankAccount(str(data.bank_account));
      setBankAccountName(str(data.bank_account_name));
      setWorkLocations(arr<string>(data.work_locations));
      setExperienceYears(data.experience_years ?? null);
      setEquipment(str(data.equipment));
      setLanguages(arr<string>(data.languages));
      setWorkModel(data.work_model === "solo" || data.work_model === "team" ? data.work_model : null);
      setStyleDescription(str(data.style_description));
      setExperienceDetail(str(data.experience_detail));
      setBio(str(data.bio));
      setSkillMakeup(!!data.skill_makeup);
      setSkillEdit(!!data.skill_edit);
      setSkillRental(!!data.skill_rental);
      setSelectedStyles(arr<string>(data.selected_styles));
      setPriceGroups(
        arr<PriceGroup>(data.price_groups).map(g => ({ ...g, lines: Array.isArray(g.lines) ? g.lines : [] }))
      );
      setProofLink(str(data.proof_link));
      setBannerUrl(str(data.banner_url));
      if (str(data.avatar_url)) setAvatarUrl(str(data.avatar_url));
      setBoards(arr<Board>(data.boards));
      setStandalonePins(arr<string>(data.standalone_pins));
      setRentalBoards(arr<Board>(data.rental_boards));
      setRentalPins(arr<string>(data.rental_pins));

      setPrefillInfo({
        status: String(data.status || ""),
        note: str(data.admin_note) || str(data.reviewer_note) || null,
      });
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  // ── Gửi hồ sơ lên Supabase + email support (không thu phí tạo acc) ───────
  function formatSubmitError(err: unknown): string {
    if (err instanceof Error && err.message) return err.message;
    if (err && typeof err === "object") {
      const o = err as { message?: string; error_description?: string; details?: string; hint?: string; code?: string };
      const parts = [o.message, o.error_description, o.details, o.hint, o.code ? `code=${o.code}` : null]
        .filter(Boolean);
      if (parts.length) return parts.join(" · ");
    }
    return "Có lỗi xảy ra, vui lòng thử lại.";
  }

  async function submitApplication(): Promise<boolean> {
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (!profile?.id) throw new Error("Chưa đăng nhập. Vui lòng đăng nhập lại rồi gửi hồ sơ.");

      const bucket = "photographer-applications";
      const base = profile.id;

      // 1) Upload ảnh — lỗi storage/bucket sẽ hiện rõ message
      let cccdFrontUrl = "";
      let cccdBackUrl = "";
      let bannerUploaded = "";
      let avatarUploaded = "";
      try {
        [cccdFrontUrl, cccdBackUrl, bannerUploaded, avatarUploaded] = await Promise.all([
          uploadImageIfLocal(cccdFront, bucket, `${base}/cccd-front`),
          uploadImageIfLocal(cccdBack, bucket, `${base}/cccd-back`),
          uploadImageIfLocal(bannerUrl, bucket, `${base}/banner`),
          uploadImageIfLocal(avatarUrl, bucket, `${base}/avatar`),
        ]);
      } catch (upErr) {
        console.error("[submit] upload avatar/banner/cccd", upErr);
        throw new Error(
          "Upload ảnh thất bại: " + formatSubmitError(upErr) +
          " — Kiểm tra đã chạy sql/011 (bucket photographer-applications public) chưa."
        );
      }

      let uploadedBoards: typeof boards = [];
      let uploadedStandalonePins: string[] = [];
      let uploadedRentalBoards: typeof rentalBoards = [];
      let uploadedRentalPins: string[] = [];
      try {
        [uploadedBoards, uploadedStandalonePins, uploadedRentalBoards, uploadedRentalPins] = await Promise.all([
          Promise.all(boards.map(async (b, i) => {
            const pins = await uploadImagesIfLocal(b.pins, bucket, `${base}/board-${i}-pin`);
            const cover = b.cover
              ? await uploadImageIfLocal(b.cover, bucket, `${base}/board-${i}-cover`)
              : (pins[0] ?? "");
            return { ...b, pins, cover };
          })),
          uploadImagesIfLocal(standalonePins, bucket, `${base}/standalone-pin`),
          Promise.all(rentalBoards.map(async (b, i) => {
            const pins = await uploadImagesIfLocal(b.pins, bucket, `${base}/rental-board-${i}-pin`);
            const cover = b.cover
              ? await uploadImageIfLocal(b.cover, bucket, `${base}/rental-board-${i}-cover`)
              : (pins[0] ?? "");
            return { ...b, pins, cover };
          })),
          uploadImagesIfLocal(rentalPins, bucket, `${base}/rental-pin`),
        ]);
      } catch (upErr) {
        console.error("[submit] upload portfolio", upErr);
        throw new Error(
          "Upload portfolio thất bại: " + formatSubmitError(upErr) +
          " — Kiểm tra Storage bucket + policy sql/011."
        );
      }

      const payload = {
        user_id: profile.id,
        full_name: fullName.trim(),
        birth_date: birthDate || null,
        phone: phone.trim(),
        cccd_front_url: cccdFrontUrl || null,
        cccd_back_url: cccdBackUrl || null,
        bank_name: bankName.trim() || bankCode,
        bank_code: bankCode,
        bank_account: bankAccount.trim(),
        bank_account_name: bankAccountName.trim() || fullName.trim(),
        work_locations: workLocations,
        experience_years: experienceYears,
        equipment: equipment.trim(),
        languages,
        work_model: workModel,
        style_description: styleDescription.trim(),
        specialty_tags: [] as string[],
        experience_detail: experienceDetail.trim() || null,
        bio: bio.trim(),
        skill_makeup: skillMakeup,
        skill_edit: skillEdit,
        skill_rental: skillRental,
        selected_styles: selectedStyles,
        price_groups: priceGroups,
        proof_link: proofLink.trim(),
        banner_url: bannerUploaded || null,
        avatar_url: avatarUploaded || null,
        boards: uploadedBoards,
        standalone_pins: uploadedStandalonePins,
        rental_boards: uploadedRentalBoards,
        rental_pins: uploadedRentalPins,
        agreed_terms: agreedTerms,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      };

      // 2) Lưu DB
      const { error } = await supabase
        .from("photographer_applications")
        .upsert(payload, { onConflict: "user_id" });
      if (error) {
        console.error("[submit] upsert photographer_applications", error);
        throw new Error(
          "Lưu hồ sơ thất bại: " + formatSubmitError(error) +
          " — Chạy sql/009_photographer_applications.sql (bảng + RLS insert/update)."
        );
      }

      setBannerUrl(bannerUploaded);
      if (avatarUploaded && avatarUploaded !== avatarUrl) {
        try { await persistAvatar(avatarUploaded); } catch (e) { console.warn("[submit] persistAvatar", e); }
      }
      setBoards(uploadedBoards);
      setStandalonePins(uploadedStandalonePins);
      setRentalBoards(uploadedRentalBoards);
      setRentalPins(uploadedRentalPins);

      // 3) Email support — không chặn submit nếu mail lỗi
      const allPortfolioUrls = [
        ...uploadedBoards.flatMap(b => b.pins || []),
        ...uploadedStandalonePins,
      ].filter(Boolean).slice(0, 24);

      try {
        const mail = await notifySupportNewApplication({
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: profile.email,
          birthDate: birthDate || undefined,
          locations: workLocations,
          styles: selectedStyles,
          proofLink: proofLink.trim(),
          bio: bio.trim(),
          experience: EXPERIENCE_OPTIONS.find(o => o.value === experienceYears)?.label,
          styleDescription: styleDescription.trim(),
          equipment: equipment.trim() || undefined,
          languages,
          workModel: workModel || undefined,
          skillMakeup,
          skillEdit,
          skillRental,
          priceGroups: priceGroups.map(g => ({
            title: g.title,
            category: g.category,
            lines: g.lines.map(l => ({ name: l.name, price: l.price, detail: l.detail })),
          })),
          userId: profile.id,
          avatarUrl: avatarUploaded || undefined,
          bannerUrl: bannerUploaded || undefined,
          cccdFrontUrl: cccdFrontUrl || undefined,
          cccdBackUrl: cccdBackUrl || undefined,
          portfolioUrls: allPortfolioUrls,
        });
        if (!mail.sent) {
          console.warn("[submit] EmailJS không gửi được:", mail.error);
        }
      } catch (mailErr) {
        console.warn("[submit] EmailJS exception (hồ sơ vẫn đã lưu):", mailErr);
      }

      return true;
    } catch (err) {
      console.error("[submitApplication]", err);
      setSubmitError(formatSubmitError(err));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

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
    <div className="flex flex-col min-h-full pb-10" style={{ background: BG }}>
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
        {/* Thông báo đã điền lại thông tin cũ (hồ sơ bị từ chối / nháp) */}
        {prefillInfo && step === 1 && (
          <div className="mb-4 p-3 rounded-2xl border"
            style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
            <p className="text-xs font-bold" style={{ color: TEAL }}>
              Đã điền sẵn thông tin từ lần đăng ký trước — bạn chỉ cần chỉnh lại phần cần sửa.
            </p>
            {prefillInfo.status === "rejected" && prefillInfo.note && (
              <p className="text-xs mt-1.5 leading-relaxed whitespace-pre-line text-red-700">
                Lý do từ chối: {prefillInfo.note}
              </p>
            )}
          </div>
        )}

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

              {/* Tài khoản ngân hàng — chỉ admin thấy trên dashboard */}
              <div className="mt-4 pt-4 border-t border-border" ref={setFieldRef("bank")}>
                <p className="font-bold text-sm mb-1" style={{ color: TEAL }}>Tài khoản nhận tiền *</p>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Dùng để nhận thanh toán từ khách. Thông tin này <strong>không hiện công khai</strong> trên app — chỉ admin duyệt hồ sơ mới thấy.
                </p>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Ngân hàng *</p>
                <select
                  value={bankCode}
                  onChange={e => {
                    const b = VN_BANKS.find(x => x.code === e.target.value);
                    setBankCode(e.target.value);
                    setBankName(b?.name || e.target.value);
                    clearFieldError("bank");
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none mb-3"
                  style={errorFields.has("bank") && !bankCode ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined}
                >
                  {VN_BANKS.map(b => (
                    <option key={b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Số tài khoản *</p>
                <input
                  value={bankAccount}
                  onChange={e => { setBankAccount(e.target.value.replace(/\s/g, "")); clearFieldError("bank"); }}
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none mb-3"
                  style={errorFields.has("bank") && !bankAccount.trim() ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined}
                  placeholder="Chỉ số, không khoảng trắng"
                  inputMode="numeric"
                />
                <p className="text-xs font-semibold text-muted-foreground mb-1">Tên chủ tài khoản *</p>
                <input
                  value={bankAccountName}
                  onChange={e => { setBankAccountName(e.target.value); clearFieldError("bank"); }}
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
                  style={errorFields.has("bank") && !bankAccountName.trim() ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined}
                  placeholder="HOANG VU DAT (in hoa, không dấu càng tốt)"
                />
                <FieldError show={errorFields.has("bank")} />
              </div>

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

            {/* Skill phụ đi kèm — makeup / edit / thuê & phụ kiện */}
            <div className="bg-white rounded-2xl p-4 border border-border">
              <p className="font-bold mb-1" style={{ color: TEAL }}>Skill phụ đi kèm</p>
              <p className="text-xs text-muted-foreground mb-3">
                Bạn có thể tích nếu có kỹ năng hỗ trợ thêm cho buổi chụp (không bắt buộc).
                Tick <strong>Thuê &amp; phụ kiện</strong> nếu bạn cho thuê studio / máy / đèn / đạo cụ — sẽ mở category bảng giá và tab riêng trên hồ sơ.
              </p>
              <div className="flex flex-col gap-2.5">
                {[
                  { key: "makeup" as const, label: "Trang điểm (Makeup)", checked: skillMakeup, toggle: () => setSkillMakeup(v => !v) },
                  { key: "edit" as const, label: "Chỉnh sửa ảnh (Edit / Retouch)", checked: skillEdit, toggle: () => setSkillEdit(v => !v) },
                  {
                    key: "rental" as const,
                    label: "Thuê & phụ kiện (Studio / Máy / Đạo cụ)",
                    checked: skillRental,
                    toggle: () => {
                      setSkillRental(prev => {
                        const next = !prev;
                        // Bỏ tick → gỡ nhóm giá category rental
                        if (!next) setPriceGroups(gs => gs.filter(g => g.category !== "rental"));
                        return next;
                      });
                    },
                  },
                ].map(({ key, label, checked, toggle }) => (
                  <button key={key} type="button" onClick={toggle}
                    className="flex items-center gap-3 text-left">
                    <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0"
                      style={{ borderColor: checked ? TEAL : "#d1d5db", background: checked ? TEAL : "transparent" }}>
                      {checked && <CheckCircle size={12} className="text-white" strokeWidth={3} />}
                    </div>
                    <span className="text-sm font-semibold" style={{ color: checked ? TEAL : "#374151" }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-border" ref={setFieldRef("styleDescription")}>
              <p className="font-bold mb-1" style={{ color: TEAL }}>Kinh nghiệm / phong cách chụp ảnh của bạn *</p>
              <p className="text-xs text-muted-foreground mb-2">
                Viết vài câu về thế mạnh và phong cách bạn chuyên — khách hàng sẽ thấy phần này trên hồ sơ.
              </p>
              <div className="relative">
                <textarea value={styleDescription}
                  onChange={e => { setStyleDescription(e.target.value.slice(0, 300)); clearFieldError("styleDescription"); }}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none resize-none"
                  style={errorFields.has("styleDescription") ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined}
                  placeholder="Ví dụ: Mình là Photographer chuyên về ảnh vintage và retro ở Hà Nội, và đặc biệt là chuyên ảnh couple..." />
                <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">{styleDescription.length}/300</span>
              </div>
              <FieldError show={errorFields.has("styleDescription")} />
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

        {/* STEP 2 — Phân loại + Bảng giá + Link minh chứng */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            {/* ── 4 category chính (Phong cách chụp) ─────────────────────── */}
            <div className="bg-white rounded-2xl p-4 border border-border" ref={setFieldRef("selectedStyles")}>
              <p className="font-bold mb-1" style={{ color: TEAL }}>Phân loại chụp *</p>
              <p className="text-xs mb-3" style={{ color: errorFields.has("selectedStyles") ? "#dc2626" : "var(--muted-foreground)" }}>
                Chọn ít nhất 1 thể loại bạn chuyên — hiện trên hồ sơ phía trên các tag.
              </p>
              <div className="relative" ref={styleWrapperRef}>
                <div className="grid grid-cols-4 gap-1.5">
                  {styles.map(s => {
                    const countSelected = s.subcategories.filter(sub => selectedStyles.includes(sub)).length;
                    const active = openStyleFor === s.label || countSelected > 0;
                    return (
                      <button key={s.label} type="button" onClick={e => handleStyleTileClick(s, e)}
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
                    <div className="absolute z-20 w-3 h-3 bg-white border-l border-t border-border rotate-45"
                      style={{ top: "calc(100% + 3px)", left: styleDropdownLeft + styleCaretLeft - 6 }} />
                    <div className="absolute top-full mt-2.5 z-20 bg-white rounded-2xl shadow-lg border border-border overflow-hidden"
                      style={{ left: styleDropdownLeft, minWidth: 200, maxWidth: 220 }}>
                      {styles.find(s => s.label === openStyleFor)!.subcategories.map(sub => {
                        const checked = selectedStyles.includes(sub);
                        return (
                          <button key={sub} type="button" onClick={() => toggleStyle(sub)}
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
                      <button type="button" onClick={() => toggleStyle(s)}><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
              <FieldError show={errorFields.has("selectedStyles")} />
            </div>

            {/* ── Bảng giá dạng nhóm + category bắt buộc ──────────────── */}
            <div className="bg-white rounded-2xl p-4 border border-border" ref={setFieldRef("priceGroups")}>
              <p className="font-bold mb-1" style={{ color: TEAL }}>Bảng giá *</p>
              <p className="text-xs text-muted-foreground mb-3">
                Mỗi nhóm phải chọn <strong>thể loại</strong> (Chụp ảnh / Make Up / Editor / Thuê &amp; phụ kiện)
                để dễ lọc trên hồ sơ. Tạo nhóm rồi thêm các mục con bên trong.
              </p>

              {priceGroups.map(g => (
                <div key={g.id} className="mb-3 p-3 rounded-xl bg-muted">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="min-w-0">
                      <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-full mb-1"
                        style={{
                          background: g.category === "rental" ? "#fef3c7" : g.category === "makeup" ? "#fce7f3" : g.category === "editor" ? "#e0e7ff" : "#e8f5f0",
                          color: g.category === "rental" ? "#b45309" : g.category === "makeup" ? "#be185d" : g.category === "editor" ? "#4338ca" : TEAL,
                        }}>
                        {categoryLabel(g.category)}
                      </span>
                      <p className="text-sm font-black truncate" style={{ color: TEAL }}>{g.title}</p>
                    </div>
                    <button type="button" onClick={() => removePriceGroup(g.id)}
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#fee2e2" }}>
                      <X size={11} style={{ color: "#dc2626" }} />
                    </button>
                  </div>
                  {g.lines.map(line => (
                    <div key={line.id} className="flex items-start gap-2 py-1.5 border-t border-border/60 first:border-0">
                      <div className="flex-1 min-w-0 pl-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm text-foreground">{line.name}</p>
                          <p className="text-sm font-bold flex-shrink-0" style={{ color: TEAL }}>
                            {Number(line.price).toLocaleString("vi-VN")}đ
                          </p>
                        </div>
                        {line.detail ? (
                          <p className="text-[11px] text-muted-foreground mt-0.5">({line.detail})</p>
                        ) : null}
                      </div>
                      <button type="button" onClick={() => removePriceLine(g.id, line.id)} className="mt-0.5">
                        <X size={12} className="text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                  {addingLineToGroupId === g.id ? (
                    <div className="mt-2 p-2.5 rounded-lg border-2" style={{ borderColor: TEAL_LIGHT, background: "white" }}>
                      <input value={newLineName} onChange={e => setNewLineName(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-muted text-sm outline-none mb-1.5"
                        placeholder="Tên mục (vd: Makeup cơ bản)" autoFocus />
                      <input value={formatVnd(newLinePrice)} onChange={e => setNewLinePrice(e.target.value.replace(/\D/g, ""))}
                        inputMode="numeric"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-muted text-sm outline-none mb-1.5"
                        placeholder="Giá VND" />
                      <input value={newLineDetail} onChange={e => setNewLineDetail(e.target.value.slice(0, 120))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-muted text-sm outline-none mb-2"
                        placeholder="Chi tiết (tuỳ chọn)" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => addPriceLine(g.id)}
                          disabled={!newLineName.trim() || !newLinePrice.replace(/\D/g, "")}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40" style={{ background: TEAL }}>Thêm</button>
                        <button type="button" onClick={() => { setAddingLineToGroupId(null); setNewLineName(""); setNewLinePrice(""); setNewLineDetail(""); }}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold border" style={{ borderColor: TEAL, color: TEAL }}>Hủy</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setAddingLineToGroupId(g.id)}
                      className="mt-2 text-xs font-bold flex items-center gap-1" style={{ color: TEAL_LIGHT }}>
                      <Plus size={12} /> Thêm mục trong nhóm
                    </button>
                  )}
                </div>
              ))}

              {showGroupForm ? (
                <div className="p-3 rounded-xl border-2 mb-2" style={{ borderColor: TEAL_LIGHT }}>
                  <p className="text-xs font-bold mb-2" style={{ color: TEAL }}>Thể loại nhóm *</p>
                  <div className="grid grid-cols-2 gap-1.5 mb-3">
                    {PRICE_CATEGORIES
                      .filter(c => c.value !== "rental" || skillRental)
                      .map(c => {
                        const active = newGroupCategory === c.value;
                        return (
                          <button key={c.value} type="button" onClick={() => setNewGroupCategory(c.value)}
                            className="text-left px-2.5 py-2 rounded-xl border-2 transition-colors"
                            style={{
                              borderColor: active ? TEAL : "#e5e7eb",
                              background: active ? "#e8f5f0" : "white",
                            }}>
                            <p className="text-xs font-bold" style={{ color: active ? TEAL : "#374151" }}>{c.label}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight">{c.hint}</p>
                          </button>
                        );
                      })}
                  </div>
                  {!skillRental && (
                    <p className="text-[10px] text-muted-foreground mb-2">
                      Muốn thêm <strong>Thuê &amp; phụ kiện</strong>? Quay lại bước 1, tick skill phụ tương ứng.
                    </p>
                  )}
                  <p className="text-xs font-bold mb-1.5" style={{ color: TEAL }}>Tên nhóm giá *</p>
                  <input value={newGroupTitle} onChange={e => setNewGroupTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-muted text-sm outline-none mb-2"
                    placeholder={
                      newGroupCategory === "rental" ? "Ví dụ: Thuê studio, Thuê máy..."
                        : newGroupCategory === "makeup" ? "Ví dụ: Make Up cô dâu..."
                          : newGroupCategory === "editor" ? "Ví dụ: Retouch cơ bản..."
                            : "Ví dụ: Gói Indoor, Outdoor..."
                    }
                    autoFocus />
                  <div className="flex gap-2">
                    <button type="button" onClick={addPriceGroup}
                      disabled={!newGroupTitle.trim() || !newGroupCategory}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background: TEAL }}>Tạo nhóm</button>
                    <button type="button" onClick={() => { setShowGroupForm(false); setNewGroupTitle(""); setNewGroupCategory(null); }}
                      className="flex-1 py-2 rounded-xl text-xs font-bold border-2" style={{ borderColor: TEAL, color: TEAL }}>Hủy</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setShowGroupForm(true)}
                  className="w-full py-2.5 rounded-xl text-xs font-bold border-2 border-dashed flex items-center justify-center gap-1.5"
                  style={{ borderColor: TEAL, color: TEAL }}>
                  <Plus size={14} /> Thêm nhóm giá
                </button>
              )}

              <FieldError show={errorFields.has("priceGroups")} />

              {(needsMakeupPrice || needsEditPrice || needsRentalPrice) && (
                <div className="mt-3 p-3 rounded-xl text-xs leading-relaxed"
                  style={{ background: "#fff8e1", border: "1px solid #f59e0b40", color: "#92400e" }}>
                  <p className="font-bold mb-1">Gợi ý từ skill phụ bạn đã chọn</p>
                  {needsMakeupPrice && (
                    <p>• Đã tick <strong>Makeup</strong> — nên tạo nhóm thể loại <strong>Make Up</strong> (vd: Makeup cơ bản, Makeup cô dâu).</p>
                  )}
                  {needsEditPrice && (
                    <p className={needsMakeupPrice ? "mt-1" : ""}>• Đã tick <strong>Edit ảnh</strong> — nên tạo nhóm thể loại <strong>Editor</strong> (retouch / chỉnh màu).</p>
                  )}
                  {needsRentalPrice && (
                    <p className={(needsMakeupPrice || needsEditPrice) ? "mt-1" : ""}>
                      • Đã tick <strong>Thuê &amp; phụ kiện</strong> — nên tạo nhóm thể loại <strong>Thuê &amp; phụ kiện</strong>
                      (studio, máy, đèn, đạo cụ). Tab này sẽ hiện riêng trên hồ sơ.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Link minh chứng ───────────────────────────────────────── */}
            <div className="bg-white rounded-2xl p-4 border border-border" ref={setFieldRef("proofLink")}>
              <p className="font-bold mb-1" style={{ color: TEAL }}>Link Profile *</p>
              <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                Chia sẻ link Facebook / Instagram / Portfolio nơi bạn từng đăng ảnh đã chụp — giúp tăng khả năng duyệt hồ sơ nhanh hơn và đội ngũ dễ hình dung phong cách của bạn hơn.
              </p>
              <input value={proofLink} onChange={e => { setProofLink(e.target.value); clearFieldError("proofLink"); }}
                className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none"
                style={errorFields.has("proofLink") ? { boxShadow: "0 0 0 1.5px #dc2626" } : undefined}
                placeholder="Facebook / Instagram / link Portfolio..." />
              <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1">
                <span className="flex-shrink-0">💡</span>
                <span>Link cập nhật những bộ ảnh bạn đã chụp để kiểm tra tính xác thực và đảm bảo chất lượng hình ảnh.</span>
              </p>
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

                <div className="flex gap-3">
                  <button onClick={() => setStep(2)}
                    className="flex-1 py-3.5 rounded-2xl font-bold border-2"
                    style={{ borderColor: TEAL, color: TEAL }}>
                    ← Trở lại
                  </button>
                  <button onClick={() => setPortfolioSubStep("upload")}
                    className="flex-1 py-3.5 rounded-2xl font-bold text-white shadow-md active:scale-95 transition-transform"
                    style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
                    Tải ảnh portfolio
                  </button>
                </div>
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
                    <div className="flex gap-2">
                      <button onClick={createBoard} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: TEAL }}>Tạo</button>
                      <button onClick={() => setShowCreateBoard(false)} className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2" style={{ borderColor: TEAL, color: TEAL }}>Hủy</button>
                    </div>
                  </div>
                )}

                {boards.map(b => (
                  <div key={b.id} className="bg-white rounded-2xl p-4 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-sm" style={{ color: TEAL }}>
                        {b.name}
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

                {/* ── Khu vực riêng: Thuê & phụ kiện (board + ảnh lẻ) ── */}
                {skillRental && (
                  <>
                    <div className="bg-white rounded-2xl p-4 border-2 mt-1" style={{ borderColor: "#f59e0b60" }}>
                      <p className="font-bold mb-1" style={{ color: "#b45309" }}>Thuê &amp; phụ kiện — ảnh / bộ sưu tập</p>
                      <p className="text-xs text-muted-foreground mb-3">
                        Chỉ hiện ở tab <strong>Thuê &amp; phụ kiện</strong> trên hồ sơ — không lẫn với portfolio chụp ảnh.
                        Tạo board (vd: Studio, Máy ảnh, Đèn) hoặc đăng ảnh lẻ.
                      </p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowCreateRentalBoard(true)}
                          className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2 flex items-center justify-center gap-1.5"
                          style={{ borderColor: "#b45309", color: "#b45309" }}>
                          <Plus size={14} /> Tạo board thuê
                        </button>
                        <button type="button" onClick={() => pickImageFile(true, false, urls => setRentalPins(prev => [...prev, ...urls]))}
                          className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5"
                          style={{ background: "#b45309" }}>
                          <Plus size={14} /> Ảnh lẻ thuê
                        </button>
                      </div>
                    </div>

                    {showCreateRentalBoard && (
                      <div className="bg-white rounded-2xl p-4 border-2" style={{ borderColor: "#fbbf24" }}>
                        <p className="font-bold mb-3 text-sm" style={{ color: "#b45309" }}>Board thuê mới</p>
                        <input value={newRentalBoardName} onChange={e => setNewRentalBoardName(e.target.value)} autoFocus
                          className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none mb-3"
                          placeholder="Ví dụ: Studio Hà Nội, Bộ đèn Godox..." />
                        <div className="flex gap-2">
                          <button type="button" onClick={createRentalBoard} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: "#b45309" }}>Tạo</button>
                          <button type="button" onClick={() => setShowCreateRentalBoard(false)} className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2" style={{ borderColor: "#b45309", color: "#b45309" }}>Hủy</button>
                        </div>
                      </div>
                    )}

                    {rentalBoards.map(b => (
                      <div key={b.id} className="bg-white rounded-2xl p-4 border border-border" style={{ borderColor: "#fde68a" }}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-bold text-sm" style={{ color: "#b45309" }}>
                            {b.name}
                          </p>
                          <button type="button" onClick={() => pickImageFile(true, false, urls => addPinsToRentalBoard(b.id, urls))}
                            className="text-xs font-bold" style={{ color: "#d97706" }}>+ Thêm ảnh</button>
                        </div>
                        {b.pins.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Chưa có ảnh trong board này.</p>
                        ) : (
                          <div className="grid grid-cols-4 gap-1.5">
                            {b.pins.map(url => (
                              <div key={url} className="relative aspect-square rounded-lg overflow-hidden cursor-pointer" onClick={() => setLightboxSrc(url)}>
                                <img src={url} alt="" className="w-full h-full object-cover" />
                                <button type="button" onClick={e => { e.stopPropagation(); removePinFromRentalBoard(b.id, url); }}
                                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center">
                                  <X size={10} className="text-white" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {rentalPins.length > 0 && (
                      <div className="bg-white rounded-2xl p-4 border border-border" style={{ borderColor: "#fde68a" }}>
                        <p className="font-bold text-sm mb-2" style={{ color: "#b45309" }}>Ảnh lẻ — thuê</p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {rentalPins.map(url => (
                            <div key={url} className="relative aspect-square rounded-lg overflow-hidden cursor-pointer" onClick={() => setLightboxSrc(url)}>
                              <img src={url} alt="" className="w-full h-full object-cover" />
                              <button type="button" onClick={e => { e.stopPropagation(); setRentalPins(prev => prev.filter(p => p !== url)); }}
                                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center">
                                <X size={10} className="text-white" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
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
                    {/* Category phân loại — nằm TRÊN tag xanh */}
                    {selectedStyles.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {selectedStyles.map(s => (
                          <span key={s} className="text-[11px] font-semibold px-2 py-0.5 rounded-md border"
                            style={{ borderColor: TEAL_LIGHT, color: TEAL }}>{s}</span>
                        ))}
                      </div>
                    )}
                    {/* Tag xanh (khu vực làm việc) */}
                    {workLocations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {workLocations.map(t => (
                          <span key={t} className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "#e8f5f0", color: TEAL }}>#{t}</span>
                        ))}
                      </div>
                    )}

                    {/* About box kiểu PotoNow — 1 ô gộp, tóm tắt + Xem thêm */}
                    <div className="mt-3 p-3.5 rounded-xl border border-border bg-white">
                      <div className="mb-2.5">
                        <p className="text-xs font-bold flex items-center gap-1.5 mb-1" style={{ color: TEAL }}>
                          <span className="opacity-70">💬</span> Giới thiệu
                        </p>
                        {editingBioInline ? (
                          <textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 200))} rows={3} autoFocus
                            className="w-full bg-muted rounded-lg px-2 py-1.5 text-sm outline-none resize-none" />
                        ) : (
                          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                            {bio || "Chưa có giới thiệu bản thân."}
                          </p>
                        )}
                        <button onClick={() => setEditingBioInline(o => !o)}
                          className="mt-1 text-[11px] font-semibold" style={{ color: TEAL }}>
                          {editingBioInline ? "Xong" : "Sửa giới thiệu"}
                        </button>
                      </div>

                      {(equipment || experienceYears || styleDescription.trim() || languages.length > 0 || workModel || workLocations.length > 0 || skillMakeup || skillEdit || skillRental) && (
                        <>
                          {equipment.trim() && (
                            <div className="mb-2.5">
                              <p className="text-xs font-bold flex items-center gap-1.5 mb-1" style={{ color: TEAL }}>
                                <span className="opacity-70">📷</span> Thiết bị
                              </p>
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                                {aboutExpanded ? equipment : (equipment.length > 80 ? equipment.slice(0, 80).trim() + "…" : equipment)}
                              </p>
                            </div>
                          )}

                          {styleDescription.trim() && (
                            <div className="mb-2.5">
                              <p className="text-xs font-bold flex items-center gap-1.5 mb-1" style={{ color: TEAL }}>
                                <span className="opacity-70">🖼️</span> Kinh nghiệm
                              </p>
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                                {aboutExpanded || styleDescription.length <= 100
                                  ? styleDescription
                                  : styleDescription.slice(0, 100).trim() + "…"}
                              </p>
                            </div>
                          )}

                          {aboutExpanded && (
                            <>
                              {languages.length > 0 && (
                                <div className="mb-2.5">
                                  <p className="text-xs font-bold flex items-center gap-1.5 mb-1.5" style={{ color: TEAL }}>
                                    <span className="opacity-70">🗣️</span> Ngôn ngữ có thể sử dụng
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {languages.map(l => (
                                      <span key={l} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                                        style={{ background: "#fff7ed", color: "#ea580c" }}>{l}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {workModel && (
                                <div className="mb-2.5">
                                  <p className="text-xs font-bold flex items-center gap-1.5 mb-1.5" style={{ color: TEAL }}>
                                    <span className="opacity-70">👤</span> Mô hình làm việc
                                  </p>
                                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                                    style={{ background: "#fff7ed", color: "#ea580c" }}>
                                    {workModel === "solo" ? "Cá nhân" : workModel === "team" ? "Nhóm / Team" : workModel}
                                  </span>
                                </div>
                              )}
                              {experienceYears && (
                                <div className="mb-2.5">
                                  <p className="text-xs font-bold flex items-center gap-1.5 mb-1" style={{ color: TEAL }}>
                                    <span className="opacity-70">⏱️</span> Số năm kinh nghiệm
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {EXPERIENCE_OPTIONS.find(o => o.value === experienceYears)?.label ?? experienceYears}
                                    {experienceDetail.trim() ? ` · ${experienceDetail}` : ""}
                                  </p>
                                </div>
                              )}
                              {workLocations.length > 0 && (
                                <div className="mb-2.5">
                                  <p className="text-xs font-bold flex items-center gap-1.5 mb-1.5" style={{ color: TEAL }}>
                                    <MapPin size={12} /> Địa chỉ / Khu vực làm việc
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {workLocations.map(loc => (
                                      <span key={loc} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                                        style={{ background: "#fff7ed", color: "#ea580c" }}>{loc}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {(skillMakeup || skillEdit || skillRental) && (
                                <div className="mb-2.5">
                                  <p className="text-xs font-bold flex items-center gap-1.5 mb-1.5" style={{ color: TEAL }}>
                                    <span className="opacity-70">✨</span> Skill phụ
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {skillMakeup && (
                                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                                        style={{ background: "#fff7ed", color: "#ea580c" }}>Makeup</span>
                                    )}
                                    {skillEdit && (
                                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                                        style={{ background: "#fff7ed", color: "#ea580c" }}>Edit ảnh</span>
                                    )}
                                    {skillRental && (
                                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                                        style={{ background: "#fef3c7", color: "#b45309" }}>Thuê & phụ kiện</span>
                                    )}
                                  </div>
                                </div>
                              )}
                              {/* Bảng giá / Thuê KHÔNG hiện trong phần giới thiệu — chỉ ở tab bên dưới */}
                            </>
                          )}

                          <button type="button" onClick={() => setAboutExpanded(e => !e)}
                            className="w-full text-center text-xs font-bold mt-1 py-1"
                            style={{ color: "#ea580c" }}>
                            {aboutExpanded ? "⌃ Thu gọn" : "∨ Xem thêm"}
                          </button>
                        </>
                      )}
                    </div>

                    {/* 4 tab: Ảnh | Đánh giá | Bảng giá | Thuê — nội dung tách riêng */}
                    <div className="flex mt-3 bg-muted rounded-xl p-0.5 gap-0.5">
                      {([
                        { id: "portfolio" as const, label: "Ảnh" },
                        { id: "reviews" as const, label: "Đánh giá" },
                        { id: "pricing" as const, label: "Bảng giá" },
                        { id: "rental" as const, label: "Thuê" },
                      ]).map(t => (
                        <button key={t.id} type="button" onClick={() => { setPreviewTab(t.id); setPreviewOpenBoardId(null); }}
                          className="flex-1 py-1.5 rounded-lg text-[10px] font-bold"
                          style={{
                            background: previewTab === t.id ? TEAL : "transparent",
                            color: previewTab === t.id ? "white" : "#6b7280",
                          }}>
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {previewTab === "pricing" && (
                      <div className="mt-3 flex flex-col gap-2">
                        {priceGroups.filter(g => g.category !== "rental").length === 0 ? (
                          <p className="text-xs text-center text-muted-foreground py-4">Chưa có bảng giá chụp / makeup / editor</p>
                        ) : (
                          priceGroups.filter(g => g.category !== "rental").map(g => (
                            <div key={g.id} className="rounded-xl border border-border p-3">
                              <p className="text-[10px] font-black mb-1 opacity-70">[{categoryLabel(g.category)}] {g.title}</p>
                              {g.lines.map(line => (
                                <div key={line.id} className="flex justify-between gap-2 text-xs py-0.5">
                                  <span className="text-muted-foreground truncate">{line.name}{line.detail ? ` (${line.detail})` : ""}</span>
                                  <span className="font-bold flex-shrink-0" style={{ color: TEAL }}>{Number(line.price).toLocaleString("vi-VN")}đ</span>
                                </div>
                              ))}
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {previewTab === "rental" && (
                      <div className="mt-3 flex flex-col gap-2">
                        {priceGroups.filter(g => g.category === "rental").map(g => (
                          <div key={g.id} className="rounded-xl border p-3" style={{ borderColor: "#fde68a" }}>
                            <p className="text-[10px] font-black mb-1" style={{ color: "#b45309" }}>[Thuê & phụ kiện] {g.title}</p>
                            {g.lines.map(line => (
                              <div key={line.id} className="flex justify-between gap-2 text-xs py-0.5">
                                <span className="text-muted-foreground truncate">{line.name}</span>
                                <span className="font-bold flex-shrink-0" style={{ color: TEAL }}>{Number(line.price).toLocaleString("vi-VN")}đ</span>
                              </div>
                            ))}
                          </div>
                        ))}
                        {(rentalBoards.length > 0 || rentalPins.length > 0) && (
                          previewOpenBoardId && (previewOpenBoardId.startsWith("rental:") || previewOpenBoardId === "__rental_standalone__") ? (
                            <div className="mt-1">
                              <button type="button" onClick={() => setPreviewOpenBoardId(null)}
                                className="flex items-center gap-1 text-sm font-bold mb-2" style={{ color: TEAL }}>
                                <ChevronLeft size={16} />
                                {previewOpenBoardId === "__rental_standalone__"
                                  ? "Ảnh lẻ thuê"
                                  : rentalBoards.find(b => `rental:${b.id}` === previewOpenBoardId)?.name ?? "Board thuê"}
                              </button>
                              <InfiniteMasonryBox pins={previewRentalPins} resetKey={previewOpenBoardId} onPinClick={setLightboxSrc} />
                            </div>
                          ) : (
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            {rentalBoards.map(b => (
                              <button key={b.id} type="button" onClick={() => setPreviewOpenBoardId(`rental:${b.id}`)} className="text-left">
                                <div className="aspect-square rounded-lg overflow-hidden">
                                  <BoardCoverCollage pins={b.cover ? [b.cover, ...b.pins.filter(p => p !== b.cover)] : b.pins} />
                                </div>
                                <p className="text-xs font-bold mt-1">{b.name}</p>
                                <p className="text-[10px] text-muted-foreground">{b.pins.length} ảnh</p>
                              </button>
                            ))}
                            {rentalPins.length > 0 && (
                              <button type="button" onClick={() => setPreviewOpenBoardId("__rental_standalone__")} className="text-left">
                                <div className="aspect-square rounded-lg overflow-hidden">
                                  <BoardCoverCollage pins={rentalPins} />
                                </div>
                                <p className="text-xs font-bold mt-1">Ảnh lẻ thuê</p>
                                <p className="text-[10px] text-muted-foreground">{rentalPins.length} ảnh</p>
                              </button>
                            )}
                          </div>
                          )
                        )}
                        {priceGroups.filter(g => g.category === "rental").length === 0 && rentalBoards.length === 0 && rentalPins.length === 0 && (
                          <p className="text-xs text-center text-muted-foreground py-4">Chưa có mục thuê &amp; phụ kiện</p>
                        )}
                      </div>
                    )}

                    {previewTab === "reviews" && (
                      <p className="text-xs text-center text-muted-foreground py-6 mt-2">Chưa có đánh giá</p>
                    )}

                    {previewTab === "portfolio" && (boards.length > 0 || standalonePins.length > 0) && (
                      <div className="mt-3">
                        {previewOpenBoardId ? (
                          /* ── Mở board: masonry Pinterest, chỉ ảnh, bấm → lightbox ── */
                          <div>
                            <button type="button" onClick={() => setPreviewOpenBoardId(null)}
                              className="flex items-center gap-1 text-sm font-bold mb-2" style={{ color: TEAL }}>
                              <ChevronLeft size={16} />
                              {previewOpenBoardId === "__standalone__"
                                ? "Ảnh đăng lẻ"
                                : boards.find(b => b.id === previewOpenBoardId)?.name ?? "Bộ sưu tập"}
                            </button>
                            <InfiniteMasonryBox pins={previewGalleryPins} resetKey={previewOpenBoardId} onPinClick={setLightboxSrc} />
                          </div>
                        ) : (
                          <>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Bộ sưu tập</p>
                            <div className="grid grid-cols-3 gap-2">
                              {boards.map(b => (
                                <button key={b.id} type="button" onClick={() => setPreviewOpenBoardId(b.id)} className="text-left">
                                  <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                                    <BoardCoverCollage pins={b.cover ? [b.cover, ...b.pins.filter(p => p !== b.cover)] : b.pins} />
                                  </div>
                                  <p className="text-[11px] font-bold mt-1 truncate">
                                    {b.name}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">{b.pins.length} ảnh</p>
                                </button>
                              ))}
                            </div>
                            {standalonePins.length > 0 && (
                              <>
                                <div className="h-px mt-4 mb-3" style={{ background: "var(--border)" }} />
                                <button type="button" onClick={() => setPreviewOpenBoardId("__standalone__")}
                                  className="text-xs font-bold mb-2" style={{ color: TEAL }}>
                                  Ảnh đăng lẻ · {standalonePins.length} ảnh →
                                </button>
                                <InfiniteMasonryBox pins={standalonePins} resetKey={"standalone-list"} onPinClick={setLightboxSrc} />
                              </>
                            )}
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

        {/* STEP 4 — Điều khoản (theo MEMENTO.docx, cập nhật 21/09/2026) */}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2"
                style={{ background: `${TEAL}10` }}>
                <BookOpen size={16} style={{ color: TEAL }} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm" style={{ color: TEAL }}>Điều khoản & Chính sách Memento</p>
                  <p className="text-[10px] text-muted-foreground">Dành cho nhiếp ảnh gia · Cập nhật 21/09/2026</p>
                </div>
              </div>
              <div className="px-4 py-4 max-h-72 overflow-y-auto space-y-4">
                {/* Tóm tắt vai trò nền tảng */}
                <div>
                  <p className="text-xs font-bold text-foreground mb-1">1. Vai trò của Memento</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Memento là nền tảng kết nối khách hàng và photographer, cung cấp công cụ tìm kiếm, xem portfolio, đánh giá và gửi yêu cầu đặt lịch.
                    Trừ khi có thông báo khác, Memento không trực tiếp cung cấp dịch vụ chụp ảnh.
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-foreground mb-1">2. Trách nhiệm của photographer</p>
                  <ul className="text-xs text-muted-foreground leading-relaxed list-disc pl-4 space-y-1">
                    <li>Cung cấp thông tin cá nhân và thông tin dịch vụ chính xác.</li>
                    <li>Chỉ đăng tải portfolio mà mình có quyền sử dụng; không dùng ảnh của người khác để giả mạo sản phẩm.</li>
                    <li>Cung cấp thông tin giá và dịch vụ trung thực.</li>
                    <li>Phản hồi booking một cách phù hợp; tôn trọng khách hàng và thỏa thuận đã thống nhất.</li>
                    <li>Tuân thủ pháp luật và quy định của Memento.</li>
                    <li>Cung cấp thông tin/tài liệu cần thiết khi Memento yêu cầu xác minh hồ sơ.</li>
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-bold text-foreground mb-1">3. Portfolio & nội dung đăng tải</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Bạn chịu trách nhiệm với nội dung mình đăng. Khi upload ảnh/video/portfolio, bạn xác nhận: có quyền sử dụng nội dung;
                    không xâm phạm bản quyền, quyền riêng tư hay quyền bên thứ ba; không chứa nội dung bị pháp luật cấm.
                    Memento có quyền ẩn, gỡ hoặc hạn chế hiển thị nội dung vi phạm.
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-foreground mb-1">4. Booking & thỏa thuận</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Giá, thời gian, địa điểm, số lượng ảnh, thời gian giao ảnh, phí phát sinh và chính sách hủy cần được các bên trao đổi và thống nhất rõ trước khi thực hiện dịch vụ.
                    Booking request chưa đồng nghĩa đã xác nhận — chỉ xác nhận khi các bên hoàn tất theo cơ chế của Memento.
                    Khi có tranh chấp, Memento có thể hỗ trợ tiếp nhận thông tin theo chính sách nền tảng, nhưng không mặc nhiên chịu trách nhiệm thay một bên trong thỏa thuận dịch vụ.
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-foreground mb-1">5. Phí nền tảng</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Memento <strong className="text-foreground">không thu phí tạo tài khoản</strong> nhiếp ảnh gia.
                    Khi hệ thống thanh toán/booking hoàn tất được triển khai, Memento thu hoa hồng khoảng <strong className="text-foreground">10% trên mỗi đơn thành công</strong>
                    (trừ trước khi thanh toán cho photographer). Điều khoản thanh toán/hoàn tiền chi tiết sẽ được công bố trước khi bạn thực hiện giao dịch trên nền tảng.
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-foreground mb-1">6. Xác minh & kiểm duyệt</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Hồ sơ photographer được xét duyệt trước khi hiển thị chính thức trên marketplace.
                    Nhãn &quot;Đã xác minh&quot; chỉ thể hiện đã hoàn thành quy trình xác minh do Memento quy định tại thời điểm đó — không phải bảo đảm tuyệt đối về chất lượng dịch vụ.
                    Memento có quyền từ chối, đình chỉ hoặc khóa tài khoản nếu vi phạm Điều khoản hoặc gây ảnh hưởng đến người dùng khác.
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-foreground mb-1">7. Hành vi bị cấm</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Không lừa đảo, mạo danh; không đăng nội dung bất hợp pháp/khiêu dâm/quấy rối; không spam, thao túng rating/review/booking;
                    không thu thập dữ liệu trái phép hay phá hoại hệ thống. Vi phạm có thể dẫn tới cảnh báo, gỡ nội dung, hạn chế tính năng hoặc khóa tài khoản.
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-foreground mb-1">8. Quyền riêng tư (tóm tắt)</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Memento thu thập thông tin tài khoản, hồ sơ photographer, booking và dữ liệu kỹ thuật để vận hành dịch vụ, xác minh và cải thiện sản phẩm.
                    Một số thông tin profile (tên hiển thị, avatar, portfolio, giá, khu vực, rating…) có thể hiển thị công khai sau khi được duyệt.
                    Memento không bán thông tin cá nhân cho bên thứ ba. Chi tiết xem Chính sách quyền riêng tư (privacy@memento.vn).
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-foreground mb-1">9. Giới hạn trách nhiệm</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Memento cố gắng duy trì thông tin chính xác và hệ thống ổn định nhưng không đảm bảo mọi thông tin người dùng luôn đúng, mọi photographer luôn phù hợp nhu cầu,
                    hay hệ thống luôn hoạt động liên tục không lỗi. Người dùng tự kiểm tra và thống nhất điều kiện dịch vụ trước khi booking.
                  </p>
                </div>

                <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                  Toàn văn: Điều khoản sử dụng · Chính sách quyền riêng tư · Chính sách cộng đồng — Memento Support: support@memento.vn
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-border">
              <div className="flex items-start gap-2 p-3 rounded-xl mb-3"
                style={{ background: "#fff8e1", border: "1px solid #f59e0b40" }}>
                <span className="text-base flex-shrink-0">⚠️</span>
                <p className="text-xs leading-relaxed" style={{ color: "#92400e" }}>
                  Hồ sơ sẽ được đội ngũ Memento <strong>xét duyệt thủ công</strong> trong vài giờ đến vài ngày.
                  Kết quả gửi qua email/SĐT. Nhãn xác minh chỉ phản ánh quy trình duyệt của nền tảng, không bảo đảm chất lượng dịch vụ tuyệt đối.
                </p>
              </div>
              <button type="button" onClick={() => setAgreedTerms(!agreedTerms)}
                className="flex items-start gap-3 w-full text-left">
                <div className="w-5 h-5 rounded-md border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all"
                  style={{ borderColor: agreedTerms ? TEAL_LIGHT : "var(--border)", background: agreedTerms ? TEAL_LIGHT : "transparent" }}>
                  {agreedTerms && <span className="text-white text-xs font-black">✓</span>}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Tôi đã đọc và đồng ý với{" "}
                  <span style={{ color: TEAL_LIGHT }} className="font-semibold">Điều khoản sử dụng</span>,{" "}
                  <span style={{ color: TEAL_LIGHT }} className="font-semibold">Chính sách quyền riêng tư</span> và{" "}
                  <span style={{ color: TEAL_LIGHT }} className="font-semibold">Chính sách cộng đồng</span> của Memento.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* STEP 5 — Gửi hồ sơ xét duyệt (không thu phí tạo acc) */}
        {step === 5 && !applicationSubmitted && (
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl p-5 border border-border text-center">
              <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-3xl"
                style={{ background: `${TEAL}12` }}>
                📝
              </div>
              <p className="font-black text-lg mb-1" style={{ color: TEAL }}>Gửi hồ sơ để xét duyệt</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Memento <strong>không thu phí</strong> tạo tài khoản nhiếp ảnh gia.
                Nền tảng chỉ thu hoa hồng khoảng <strong>10%</strong> trên mỗi đơn đặt lịch thành công.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-border">
              <p className="font-bold mb-2 text-sm" style={{ color: TEAL }}>Hồ sơ của bạn sẽ gồm</p>
              <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                <li>Thông tin cá nhân, CCCD, khu vực & thiết bị</li>
                <li>Phân loại chụp, bảng giá, link portfolio</li>
                <li>Ảnh bìa, ảnh đại diện & bộ sưu tập</li>
                <li>Đã đồng ý điều khoản dịch vụ</li>
              </ul>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-xl"
              style={{ background: "#fff8e1", border: "1px solid #f59e0b40" }}>
              <span className="text-base flex-shrink-0">⏱️</span>
              <p className="text-xs leading-relaxed" style={{ color: "#92400e" }}>
                Đội ngũ Memento sẽ xem xét thủ công trong <strong>vài giờ đến vài ngày</strong>.
                Kết quả sẽ được gửi qua email / SĐT bạn đã đăng ký.
              </p>
            </div>

            {submitError && (
              <p className="text-xs font-semibold text-center" style={{ color: "#dc2626" }}>{submitError}</p>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={async () => {
                if (await submitApplication()) setApplicationSubmitted(true);
              }}
              className="w-full py-3.5 rounded-2xl font-bold text-white shadow-lg active:scale-95 transition-all disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
              {submitting ? "Đang gửi hồ sơ..." : "Gửi hồ sơ xét duyệt"}
            </button>
          </div>
        )}

        {/* STEP 5 done — Pending review */}
        {step === 5 && applicationSubmitted && (
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl p-6 border border-border text-center">
              <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl"
                style={{ background: `${TEAL_LIGHT}20` }}>
                🎉
              </div>
              <h3 className="font-black text-xl mb-2" style={{ color: TEAL }}>Đã nhận hồ sơ!</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Hồ sơ đã được gửi tới đội ngũ Memento. Chúng mình sẽ liên hệ qua email và SĐT khi có kết quả duyệt.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { icon: "📋", label: "Thông tin cá nhân", status: "Đã nhận" },
                { icon: "💰", label: "Bảng giá & Minh chứng", status: "Đã nhận" },
                { icon: "🖼️", label: "Portfolio", status: "Đang xem xét" },
                { icon: "📜", label: "Điều khoản", status: "Đã đồng ý" },
                { icon: "🔍", label: "Xét duyệt", status: "Chờ duyệt" },
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

        {/* Nav buttons — ẩn ở step 3 (tự quản lý) và khi đã submit xong */}
        {!(step === 5 && applicationSubmitted) && step !== 3 && !(step === 5 && !applicationSubmitted) && (
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
              {step === 4 ? "Tiếp theo → Gửi hồ sơ" : "Tiếp theo →"}
            </button>
          </div>
        )}

        {/* Step 5 trước khi submit: chỉ hiện nút Trở lại (nút Gửi nằm trong nội dung) */}
        {step === 5 && !applicationSubmitted && (
          <div className="flex gap-3 mt-5">
            <button onClick={() => { setErrorFields(new Set()); setStep(4); }}
              className="flex-1 py-3.5 rounded-2xl font-bold border-2"
              style={{ borderColor: TEAL, color: TEAL }}>
              ← Trở lại
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
