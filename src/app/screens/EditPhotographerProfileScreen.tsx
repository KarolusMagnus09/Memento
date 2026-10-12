import { ChevronLeft, Plus, Trash2, Save } from "lucide-react";
import type { Screen } from "./types";
import { TEAL, TEAL_MID, BG, styles, VN_PROVINCES } from "../constants";
import { supabase } from "../lib/supabase";
import { notifyProfileUpdate } from "../lib/notifySupport";
import { useEffect, useRef, useState } from "react";
import { uploadImagesIfLocal } from "../lib/uploadFile";
import { PortfolioEditor } from "../components/shared/PortfolioEditor";

type PriceLine = { id: string; name: string; price: string; detail: string };
type PriceGroup = {
  id: string;
  title: string;
  category: string;
  lines: PriceLine[];
};
type Board = { id: string; name: string; private: boolean; cover: string; pins: string[] };

/** 1 ảnh trong log cập nhật: thuộc khu vực nào, board nào */
type LogImage = { url: string; area: "portfolio" | "rental"; board?: string };

/** Gom toàn bộ ảnh hiện có (đã upload) thành danh sách phẳng, để so sánh trước/sau khi lưu */
function flattenImages(
  standalone: string[], boards: Board[], rentalPins: string[], rentalBoards: Board[]
): LogImage[] {
  return [
    ...standalone.map((url) => ({ url, area: "portfolio" as const })),
    ...boards.flatMap((b) => b.pins.map((url) => ({ url, area: "portfolio" as const, board: b.name }))),
    ...rentalPins.map((url) => ({ url, area: "rental" as const })),
    ...rentalBoards.flatMap((b) => b.pins.map((url) => ({ url, area: "rental" as const, board: b.name }))),
  ];
}

const LANGS = ["Tiếng Việt", "Tiếng Anh", "Tiếng Trung", "Tiếng Nhật", "Tiếng Hàn"];
const EXPERIENCE = [
  { id: "under1", label: "Dưới 1 năm" },
  { id: "1to3", label: "1–3 năm" },
  { id: "3to5", label: "3–5 năm" },
  { id: "over5", label: "Trên 5 năm" },
];
const ALL_STYLES = styles.flatMap((s) => s.subcategories);

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyGroup(cat = "photo"): PriceGroup {
  return {
    id: uid(),
    title: cat === "rental" ? "Thuê & phụ kiện" : cat === "makeup" ? "Make Up" : "Chụp ảnh",
    category: cat,
    lines: [{ id: uid(), name: "", price: "", detail: "" }],
  };
}

/**
 * Cập nhật hồ sơ PTG đã duyệt — không qua CCCD / bước đăng ký.
 * Lưu application + photographers + log admin.
 */
export default function EditPhotographerProfileScreen({
  setScreen,
  onSaved,
}: {
  setScreen: (s: Screen) => void;
  /** App tải lại danh sách PTG + hồ sơ của mình sau khi lưu (tránh hiện dữ liệu cũ) */
  onSaved?: () => void | Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");

  const [bio, setBio] = useState("");
  const [equipment, setEquipment] = useState("");
  const [experienceYears, setExperienceYears] = useState("1to3");
  const [styleDescription, setStyleDescription] = useState("");
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>(["Tiếng Việt"]);
  const [workModel, setWorkModel] = useState("solo");
  const [workLocations, setWorkLocations] = useState<string[]>([]);
  const [skillMakeup, setSkillMakeup] = useState(false);
  const [skillEdit, setSkillEdit] = useState(false);
  const [skillRental, setSkillRental] = useState(false);
  const [priceGroups, setPriceGroups] = useState<PriceGroup[]>([]);
  const [standalonePins, setStandalonePins] = useState<string[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [rentalPins, setRentalPins] = useState<string[]>([]);
  const [rentalBoards, setRentalBoards] = useState<Board[]>([]);
  // Ảnh có sẵn lúc mở màn hình → để biết ảnh nào bị gỡ khi lưu
  const originalImagesRef = useRef<LogImage[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth.user;
        if (!user) {
          setError("Bạn cần đăng nhập");
          setLoading(false);
          return;
        }
        setUserId(user.id);
        setEmail(user.email ?? null);

        const { data } = await supabase
          .from("photographer_applications")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (cancelled) return;
        if (!data) {
          setError("Chưa có hồ sơ nhiếp ảnh gia. Hãy đăng ký trước.");
          setLoading(false);
          return;
        }

        setFullName(data.full_name || "");
        setBio(data.bio || "");
        setEquipment(data.equipment || "");
        setExperienceYears(data.experience_years || "1to3");
        setStyleDescription(data.style_description || "");
        setSelectedStyles(Array.isArray(data.selected_styles) ? data.selected_styles : []);
        setLanguages(Array.isArray(data.languages) && data.languages.length ? data.languages : ["Tiếng Việt"]);
        setWorkModel(data.work_model || "solo");
        setWorkLocations(Array.isArray(data.work_locations) ? data.work_locations : []);
        setSkillMakeup(!!data.skill_makeup);
        setSkillEdit(!!data.skill_edit);
        setSkillRental(!!data.skill_rental);

        let pg = data.price_groups;
        if (typeof pg === "string") {
          try {
            pg = JSON.parse(pg);
          } catch {
            pg = [];
          }
        }
        setPriceGroups(Array.isArray(pg) && pg.length ? pg : [emptyGroup("photo")]);

        const asPins = (v: unknown): string[] => {
          if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
          if (typeof v === "string") {
            try {
              const j = JSON.parse(v);
              return Array.isArray(j) ? j.filter((x: unknown) => typeof x === "string") : [];
            } catch {
              return [];
            }
          }
          return [];
        };
        const asBoards = (v: unknown): Board[] => {
          if (!v) return [];
          let arr = v;
          if (typeof v === "string") {
            try {
              arr = JSON.parse(v);
            } catch {
              return [];
            }
          }
          if (!Array.isArray(arr)) return [];
          return arr.map((b: any, i: number) => ({
            id: b.id || `b-${i}`,
            name: b.name || `Board ${i + 1}`,
            private: !!b.private,
            cover: b.cover || (b.pins && b.pins[0]) || "",
            pins: Array.isArray(b.pins) ? b.pins : [],
          }));
        };

        const loadedStandalone = asPins(data.standalone_pins);
        const loadedBoards = asBoards(data.boards);
        const loadedRentalPins = asPins(data.rental_pins);
        const loadedRentalBoards = asBoards(data.rental_boards);
        setStandalonePins(loadedStandalone);
        setBoards(loadedBoards);
        setRentalPins(loadedRentalPins);
        setRentalBoards(loadedRentalBoards);
        originalImagesRef.current = flattenImages(loadedStandalone, loadedBoards, loadedRentalPins, loadedRentalBoards);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Không tải được hồ sơ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleIn(list: string[], v: string, set: (x: string[]) => void) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  function updateLine(gi: number, li: number, patch: Partial<PriceLine>) {
    setPriceGroups((gs) =>
      gs.map((g, i) =>
        i !== gi
          ? g
          : {
              ...g,
              lines: g.lines.map((l, j) => (j === li ? { ...l, ...patch } : l)),
            }
      )
    );
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      const bucket = "photographer-applications";
      const base = `${userId}/edit-${Date.now()}`;

      const isLocal = (u: string) => u.startsWith("blob:") || u.startsWith("data:");

      // Upload ảnh mới (blob:) → URL public; ảnh cũ (http) giữ nguyên
      const uploadBoards = (list: Board[], prefix: string) =>
        Promise.all(list.map(async (b, i) => {
          const upPins = await uploadImagesIfLocal(b.pins, bucket, `${base}/${prefix}-${i}-pin`);
          const ci = b.cover ? b.pins.indexOf(b.cover) : -1;
          const cover = ci >= 0 ? upPins[ci] : (upPins[0] ?? "");
          return { ...b, pins: upPins, cover };
        }));

      const [pins, rPins, uploadedBoards, uploadedRentalBoards] = await Promise.all([
        uploadImagesIfLocal(standalonePins, bucket, `${base}/standalone-pin`),
        uploadImagesIfLocal(rentalPins, bucket, `${base}/rental-pin`),
        uploadBoards(boards, "board"),
        uploadBoards(rentalBoards, "rental-board"),
      ]);

      // ── Ảnh thêm / gỡ trong lần lưu này (để ghi vào log cho admin xem) ──
      const addedImages: LogImage[] = [
        ...standalonePins.flatMap((u, i) => (isLocal(u) ? [{ url: pins[i], area: "portfolio" as const }] : [])),
        ...boards.flatMap((b, bi) =>
          b.pins.flatMap((u, i) => (isLocal(u) ? [{ url: uploadedBoards[bi].pins[i], area: "portfolio" as const, board: b.name }] : []))),
        ...rentalPins.flatMap((u, i) => (isLocal(u) ? [{ url: rPins[i], area: "rental" as const }] : [])),
        ...rentalBoards.flatMap((b, bi) =>
          b.pins.flatMap((u, i) => (isLocal(u) ? [{ url: uploadedRentalBoards[bi].pins[i], area: "rental" as const, board: b.name }] : []))),
      ];
      const finalImages = flattenImages(pins, uploadedBoards, rPins, uploadedRentalBoards);
      const finalUrls = new Set(finalImages.map((x) => x.url));
      const removedImages = originalImagesRef.current.filter((x) => !finalUrls.has(x.url));

      const cleanGroups = priceGroups
        .map((g) => ({
          ...g,
          lines: g.lines.filter((l) => l.name.trim() && String(l.price).trim()),
        }))
        .filter((g) => g.lines.length > 0);

      const patch = {
        bio: bio.trim(),
        equipment: equipment.trim(),
        experience_years: experienceYears,
        style_description: styleDescription.trim(),
        selected_styles: selectedStyles,
        languages,
        work_model: workModel,
        work_locations: workLocations,
        skill_makeup: skillMakeup,
        skill_edit: skillEdit,
        skill_rental: skillRental,
        price_groups: cleanGroups,
        standalone_pins: pins,
        boards: uploadedBoards,
        rental_pins: rPins,
        rental_boards: uploadedRentalBoards,
        updated_at: new Date().toISOString(),
      };

      // Ghi qua RPC (security definer): RLS chặn PTG đã duyệt UPDATE trực tiếp, và trước đây
      // lỗi bị bỏ qua nên app báo "đã lưu" dù DB không đổi. Lỗi giờ được ném ra để hiện cho người dùng.
      const { data: rpcRes, error: rpcErr } = await supabase.rpc("update_my_ptg_profile", { p_patch: patch });
      if (rpcErr) {
        const m = rpcErr.message || "";
        if (/update_my_ptg_profile|schema cache|does not exist/i.test(m)) {
          throw new Error("Chưa cài hàm lưu hồ sơ trên server. Hãy chạy sql/021_ptg_self_update_rpc.sql trong Supabase.");
        }
        throw rpcErr;
      }
      if (!rpcRes || (rpcRes as { ok?: boolean }).ok !== true) {
        throw new Error("Server không xác nhận đã lưu. Vui lòng thử lại.");
      }

      const summaryParts = [
        `Bio: ${bio.slice(0, 80) || "—"}`,
        `Thiết bị: ${equipment || "—"}`,
        `Styles: ${selectedStyles.join(", ") || "—"}`,
        `Ngôn ngữ: ${languages.join(", ")}`,
        `Địa điểm: ${workLocations.join(", ") || "—"}`,
        `Bảng giá: ${cleanGroups.length} nhóm / ${cleanGroups.reduce((n, g) => n + g.lines.length, 0)} mục`,
        `Portfolio: ${pins.length} ảnh lẻ · ${uploadedBoards.length} board (${uploadedBoards.reduce((n, x) => n + x.pins.length, 0)} ảnh)`,
        `Thuê & phụ kiện: ${rPins.length} ảnh lẻ · ${uploadedRentalBoards.length} board (${uploadedRentalBoards.reduce((n, x) => n + x.pins.length, 0)} ảnh)`,
        addedImages.length ? `+${addedImages.length} ảnh mới tải lên (xem ảnh trong Admin → Log cập nhật)` : null,
        removedImages.length ? `−${removedImages.length} ảnh đã gỡ` : null,
      ].filter(Boolean);

      const { error: logErr } = await supabase.from("photographer_update_logs").insert({
        user_id: userId,
        photographer_name: fullName,
        change_summary: summaryParts.join("\n"),
        snapshot: { ...patch, images: { added: addedImages, removed: removedImages } },
      });
      if (logErr) console.warn("[update_logs] insert", logErr);

      await notifyProfileUpdate({
        fullName: fullName || "PTG",
        userId,
        summary: [
          ...summaryParts,
          ...(addedImages.length
            ? ["", `Ảnh mới (${addedImages.length}):`, ...addedImages.slice(0, 20).map((x) =>
                `• [${x.area === "rental" ? "Thuê" : "Portfolio"}${x.board ? ` / ${x.board}` : ""}] ${x.url}`)]
            : []),
          ...(addedImages.length > 20 ? [`… và ${addedImages.length - 20} ảnh nữa (xem Admin → Log)`] : []),
        ].join("\n"),
        email,
      });
      originalImagesRef.current = finalImages;

      setStandalonePins(pins);
      setRentalPins(rPins);
      setBoards(uploadedBoards);
      setRentalBoards(uploadedRentalBoards);
      setToast("Đã lưu cập nhật · admin đã nhận log");
      try { await onSaved?.(); } catch (e) { console.warn("[edit] onSaved", e); }
      setTimeout(() => setScreen("photographer-profile"), 900);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as any).message) : "Lỗi lưu";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <p className="text-sm text-muted-foreground">Đang tải hồ sơ...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-28" style={{ background: BG }}>
      <div className="px-4 py-3 flex items-center gap-2 sticky top-0 z-10" style={{ background: TEAL }}>
        <button type="button" onClick={() => setScreen("photographer-profile")} className="p-2 text-white">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1">
          <h2 className="font-bold text-white text-sm">Cập nhật hồ sơ</h2>
          <p className="text-white/70 text-[11px]">Không cần nộp lại CCCD · lưu log cho admin</p>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>
        )}
        {toast && (
          <div className="text-sm rounded-xl px-3 py-2 border" style={{ background: "#ecfdf5", color: TEAL }}>
            {toast}
          </div>
        )}

        {/* Giới thiệu */}
        <section className="bg-white rounded-2xl border border-border p-4 space-y-3">
          <p className="font-bold text-sm" style={{ color: TEAL }}>
            Giới thiệu
          </p>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            placeholder="Bio ngắn..."
          />
          <p className="text-xs font-semibold text-muted-foreground">Thiết bị</p>
          <input
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            placeholder="VD: Sony A7IV, AWS Lens..."
          />
          <p className="text-xs font-semibold text-muted-foreground">Kinh nghiệm / phong cách</p>
          <textarea
            value={styleDescription}
            onChange={(e) => setStyleDescription(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            placeholder="Mình chuyên..."
          />
          <p className="text-xs font-semibold text-muted-foreground">Số năm kinh nghiệm</p>
          <div className="flex flex-wrap gap-2">
            {EXPERIENCE.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setExperienceYears(x.id)}
                className="px-3 py-1.5 rounded-full text-xs font-bold border"
                style={{
                  background: experienceYears === x.id ? TEAL : "white",
                  color: experienceYears === x.id ? "white" : TEAL,
                  borderColor: TEAL,
                }}
              >
                {x.label}
              </button>
            ))}
          </div>
        </section>

        {/* Thể loại */}
        <section className="bg-white rounded-2xl border border-border p-4">
          <p className="font-bold text-sm mb-2" style={{ color: TEAL }}>
            Thể loại chụp
          </p>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {ALL_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleIn(selectedStyles, s, setSelectedStyles)}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold border"
                style={{
                  background: selectedStyles.includes(s) ? `${TEAL}15` : "white",
                  borderColor: selectedStyles.includes(s) ? TEAL : "var(--border)",
                  color: TEAL,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* Ngôn ngữ + mô hình */}
        <section className="bg-white rounded-2xl border border-border p-4 space-y-3">
          <p className="font-bold text-sm" style={{ color: TEAL }}>
            Ngôn ngữ & mô hình
          </p>
          <div className="flex flex-wrap gap-2">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => toggleIn(languages, l, setLanguages)}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold border"
                style={{
                  background: languages.includes(l) ? TEAL : "white",
                  color: languages.includes(l) ? "white" : TEAL,
                  borderColor: TEAL,
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {[
              { id: "solo", label: "Cá nhân" },
              { id: "team", label: "Team" },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setWorkModel(m.id)}
                className="flex-1 py-2 rounded-xl text-xs font-bold border"
                style={{
                  background: workModel === m.id ? TEAL : "white",
                  color: workModel === m.id ? "white" : TEAL,
                  borderColor: TEAL,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>

        {/* Địa điểm */}
        <section className="bg-white rounded-2xl border border-border p-4">
          <p className="font-bold text-sm mb-2" style={{ color: TEAL }}>
            Địa chỉ / khu vực
          </p>
          <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
            {VN_PROVINCES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => toggleIn(workLocations, p, setWorkLocations)}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold border"
                style={{
                  background: workLocations.includes(p) ? `${TEAL}15` : "white",
                  borderColor: workLocations.includes(p) ? TEAL : "var(--border)",
                  color: TEAL,
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        {/* Skill phụ */}
        <section className="bg-white rounded-2xl border border-border p-4 space-y-2">
          <p className="font-bold text-sm" style={{ color: TEAL }}>
            Skill phụ
          </p>
          {[
            { v: skillMakeup, set: setSkillMakeup, label: "Make up" },
            { v: skillEdit, set: setSkillEdit, label: "Edit ảnh" },
            { v: skillRental, set: setSkillRental, label: "Thuê & phụ kiện" },
          ].map((x) => (
            <label key={x.label} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={x.v} onChange={(e) => x.set(e.target.checked)} />
              {x.label}
            </label>
          ))}
        </section>

        {/* Bảng giá */}
        <section className="bg-white rounded-2xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm" style={{ color: TEAL }}>
              Bảng giá
            </p>
            <button
              type="button"
              onClick={() => setPriceGroups((g) => [...g, emptyGroup("photo")])}
              className="text-xs font-bold flex items-center gap-1"
              style={{ color: TEAL }}
            >
              <Plus size={14} /> Thêm nhóm
            </button>
          </div>
          {priceGroups.map((g, gi) => (
            <div key={g.id} className="border border-border rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  value={g.title}
                  onChange={(e) =>
                    setPriceGroups((gs) =>
                      gs.map((x, i) => (i === gi ? { ...x, title: e.target.value } : x))
                    )
                  }
                  className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs font-bold"
                  placeholder="Tên nhóm"
                />
                <select
                  value={g.category}
                  onChange={(e) =>
                    setPriceGroups((gs) =>
                      gs.map((x, i) => (i === gi ? { ...x, category: e.target.value } : x))
                    )
                  }
                  className="rounded-lg border border-border px-2 py-1.5 text-xs"
                >
                  <option value="photo">Chụp</option>
                  <option value="makeup">Makeup</option>
                  <option value="editor">Edit</option>
                  <option value="rental">Thuê</option>
                </select>
                <button
                  type="button"
                  onClick={() => setPriceGroups((gs) => gs.filter((_, i) => i !== gi))}
                  className="text-red-500 p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {g.lines.map((l, li) => (
                <div key={l.id} className="flex flex-col gap-1.5 rounded-xl bg-muted/30 p-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      value={l.name}
                      onChange={(e) => updateLine(gi, li, { name: e.target.value })}
                      placeholder="Tên gói"
                      className="flex-1 min-w-0 rounded-lg border px-2 py-1.5 text-xs bg-white"
                    />
                    <input
                      value={l.price}
                      inputMode="numeric"
                      onChange={(e) => updateLine(gi, li, { price: e.target.value.replace(/\D/g, "") })}
                      placeholder="Giá"
                      className="w-24 flex-shrink-0 min-w-0 rounded-lg border px-2 py-1.5 text-xs bg-white"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPriceGroups((gs) =>
                          gs.map((x, i) =>
                            i === gi ? { ...x, lines: x.lines.filter((_, j) => j !== li) } : x
                          )
                        )
                      }
                      className="text-red-400 p-1 flex-shrink-0"
                      aria-label="Xóa dòng giá"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <input
                    value={l.detail}
                    onChange={(e) => updateLine(gi, li, { detail: e.target.value })}
                    placeholder="Chi tiết"
                    className="w-full min-w-0 rounded-lg border px-2 py-1.5 text-xs bg-white"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setPriceGroups((gs) =>
                    gs.map((x, i) =>
                      i === gi
                        ? {
                            ...x,
                            lines: [...x.lines, { id: uid(), name: "", price: "", detail: "" }],
                          }
                        : x
                    )
                  )
                }
                className="text-[11px] font-bold"
                style={{ color: TEAL }}
              >
                + Thêm dòng giá
              </button>
            </div>
          ))}
        </section>

        {/* Ảnh portfolio: board + ảnh lẻ */}
        <PortfolioEditor
          title="Portfolio chụp ảnh"
          description="Gom ảnh theo từng bộ sưu tập (board), hoặc đăng ảnh lẻ không cần gom nhóm."
          accent={TEAL} accentSoft="#e5e7eb"
          createBoardLabel="Tạo bộ sưu tập" addSingleLabel="Thêm ảnh lẻ"
          boardPlaceholder="Ví dụ: Ảnh cưới ngoại cảnh" singleTitle="Ảnh đăng lẻ"
          boards={boards} setBoards={setBoards} pins={standalonePins} setPins={setStandalonePins}
        />

        {/* Thuê & phụ kiện: board + ảnh lẻ (chỉ hiện ở tab Thuê & phụ kiện của hồ sơ) */}
        {(skillRental || rentalBoards.length > 0 || rentalPins.length > 0) && (
          <PortfolioEditor
            title="Thuê & phụ kiện"
            description="Chỉ hiện ở tab Thuê & phụ kiện trên hồ sơ, không lẫn với portfolio chụp ảnh."
            accent="#b45309" accentSoft="#fde68a"
            createBoardLabel="Tạo board thuê" addSingleLabel="Ảnh lẻ thuê"
            boardPlaceholder="Ví dụ: Studio Hà Nội, Bộ đèn Godox..." singleTitle="Ảnh lẻ — thuê"
            boards={rentalBoards} setBoards={setRentalBoards} pins={rentalPins} setPins={setRentalPins}
          />
        )}
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm z-30 p-4 bg-white border-t border-border">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="w-full py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}
        >
          <Save size={18} />
          {saving ? "Đang lưu..." : "Lưu cập nhật"}
        </button>
      </div>
    </div>
  );
}
