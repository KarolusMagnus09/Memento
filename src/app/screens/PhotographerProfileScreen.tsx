import { ChevronLeft, MapPin, Heart, Bookmark, CheckCircle, Edit3, Calendar, Layers, Star, Trash2 } from "lucide-react";
import type { Screen, Photographer } from "../types";
import { TEAL, TEAL_MID, TEAL_LIGHT, BG } from "../constants";
import { StarRow } from "../components/shared/StarRow";
import { Avatar } from "../components/shared/Avatar";
import { Badge } from "../components/shared/Badge";
import { ImageLightbox } from "../components/shared/ImageLightbox";
import { BoardCoverCollage } from "../components/shared/BoardCoverCollage";
import { InfiniteMasonryBox } from "../components/shared/InfiniteMasonryBox";
import { supabase } from "../lib/supabase";
import { ScrollText } from "../components/shared/ScrollText";
import { ReviewsSection } from "../components/shared/ReviewsSection";
import { ReportFlow, ReportIcon } from "../components/shared/ReportFlow";
import { EMPTY_SUMMARY, fetchReviewSummary, submitProfileReport, fetchPhotoLikes, togglePhotoLike, type ReviewSummary } from "../lib/social";
import { useProgressiveList } from "../hooks/useProgressiveList";
import { useState, useEffect, useRef, useCallback } from "react";
import { uniqueStyleLabels } from "../lib/photographerDisplay";

const ALL_PINS_ID = "__all__";
const STANDALONE_ID = "__standalone__";

export default function PhotographerProfileScreen({
  photographer, setScreen, savedIds, toggleSave,
  isOwner = false,
  applicationStatus = null,
  rejectionNote = null,
  onOpenPhotographer,
}: {
  photographer: Photographer;
  setScreen: (s: Screen) => void;
  savedIds: number[];
  toggleSave: (id: number) => void;
  /** true = đang xem hồ sơ của chính mình (từ menu Profile) */
  isOwner?: boolean;
  /** Trạng thái xét duyệt hồ sơ (khi isOwner) */
  applicationStatus?: "draft" | "submitted" | "approved" | "rejected" | null;
  /** Lý do từ chối (admin_note) khi isOwner + rejected */
  rejectionNote?: string | null;
  /** Mở hồ sơ photographer khác (từ thẻ người bình luận) */
  onOpenPhotographer?: (photographerId: number) => void;
}) {
  const [tab, setTab] = useState<"portfolio" | "reviews" | "pricing" | "rental">("portfolio");
  const [ptg, setPtg] = useState(photographer);
  const saved = savedIds.some((x) => Number(x) === Number(ptg.id));
  const isPending = isOwner && (applicationStatus === "submitted" || applicationStatus === "draft");
  const isRejected = isOwner && applicationStatus === "rejected";
  const totalLikes = Object.values(ptg.pin_likes || {}).reduce((a, b) => a + (b || 0), 0);

  // Đồng bộ khi prop đổi
  useEffect(() => {
    setPtg(photographer);
  }, [photographer]);

  // Nạp lại rental/portfolio: application (owner / approved public) + bảng photographers
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { asBoards, asPinUrls } = await import("../lib/normalizeBoards");

        const applyMedia = (data: Record<string, unknown> | null | undefined) => {
          if (!data || cancelled) return;
          const rental_boards = asBoards(data.rental_boards);
          const rental_pins = asPinUrls(data.rental_pins);
          let price_groups = data.price_groups;
          if (typeof price_groups === "string") {
            try { price_groups = JSON.parse(price_groups); } catch { price_groups = null; }
          }
          setPtg((prev) => ({
            ...prev,
            rental_boards: rental_boards.length ? rental_boards : (prev.rental_boards || []),
            rental_pins: rental_pins.length ? rental_pins : (prev.rental_pins || []),
            price_groups: Array.isArray(price_groups) && price_groups.length
              ? (price_groups as Photographer["price_groups"])
              : prev.price_groups,
            skill_rental: (data.skill_rental as boolean | undefined) ?? prev.skill_rental,
            skill_makeup: (data.skill_makeup as boolean | undefined) ?? prev.skill_makeup,
            skill_edit: (data.skill_edit as boolean | undefined) ?? prev.skill_edit,
            boards: asBoards(data.boards).length ? asBoards(data.boards) : prev.boards,
            standalone_pins: asPinUrls(data.standalone_pins).length
              ? asPinUrls(data.standalone_pins)
              : prev.standalone_pins,
            user_id: (data.user_id as string | undefined) || prev.user_id,
          }));
        };

        // 1) Bảng photographers (public) — theo id marketplace
        if (photographer.id > 0) {
          const { data: row } = await supabase
            .from("photographers")
            .select("rental_boards, rental_pins, price_groups, skill_rental, skill_makeup, skill_edit, boards, standalone_pins, user_id")
            .eq("id", photographer.id)
            .maybeSingle();
          if (row) applyMedia(row as Record<string, unknown>);
        }

        // 2) photographer_applications — owner mọi status; người khác chỉ approved (cần SQL 016)
        let appQuery = supabase.from("photographer_applications").select(
          "user_id, rental_boards, rental_pins, price_groups, skill_rental, boards, standalone_pins, skill_makeup, skill_edit, status"
        );
        if (isOwner) {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          appQuery = appQuery.eq("user_id", user.id);
        } else if (photographer.user_id) {
          appQuery = appQuery.eq("user_id", photographer.user_id).eq("status", "approved");
        } else if (photographer.id > 0) {
          // Lấy user_id từ row photographers vừa có trên state — thử theo tên (fallback yếu)
          const { data: byName } = await supabase
            .from("photographer_applications")
            .select("user_id, rental_boards, rental_pins, price_groups, skill_rental, boards, standalone_pins, skill_makeup, skill_edit, status, full_name")
            .eq("status", "approved")
            .ilike("full_name", photographer.name)
            .limit(1)
            .maybeSingle();
          if (byName) applyMedia(byName as Record<string, unknown>);
          return;
        } else {
          return;
        }
        const { data: app } = await appQuery.maybeSingle();
        if (app) applyMedia(app as Record<string, unknown>);
      } catch (e) {
        console.warn("[PhotographerProfile] reload media", e);
      }
    })();
    return () => { cancelled = true; };
  }, [isOwner, photographer.user_id, photographer.id, photographer.name]);

  // ── Xóa hồ sơ PTG (chỉ chủ hồ sơ) ─────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteCountdown, setDeleteCountdown] = useState(5);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!showDeleteModal) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      setDeleteCountdown(5);
      setDeleteError(null);
      return;
    }
    setDeleteCountdown(5);
    countdownRef.current = setInterval(() => {
      setDeleteCountdown((c) => {
        if (c <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [showDeleteModal]);

  async function handleDeletePtgProfile() {
    if (deleteCountdown > 0 || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Chưa đăng nhập.");

      // .select() sau delete để biết có xóa được dòng nào không
      // (RLS chặn delete thường trả error=null + data=[])
      const { data: deletedRows, error } = await supabase
        .from("photographer_applications")
        .delete()
        .eq("user_id", user.id)
        .select("user_id");
      if (error) throw error;
      if (!deletedRows || deletedRows.length === 0) {
        throw new Error(
          "Không xóa được hồ sơ (0 dòng bị xóa). Trên Supabase cần bật policy DELETE cho bảng photographer_applications — xem file sql/012_delete_photographer_application.sql rồi chạy lại."
        );
      }

      // Hạ role về customer (best-effort)
      await supabase.from("profiles").update({ role: "customer" }).eq("id", user.id);

      // Xóa cache local (chi tiết hồ sơ trên máy)
      try {
        window.localStorage.removeItem(`memento:photographer-profile:${user.id}`);
      } catch {
        // ignore
      }

      // Dọn storage folder (best-effort, cả file lồng folder)
      try {
        const bucket = "photographer-applications";
        const { data: top } = await supabase.storage.from(bucket).list(user.id);
        if (top && top.length > 0) {
          const paths: string[] = [];
          for (const item of top) {
            // folder (no metadata) → list con; file → path trực tiếp
            if (item.id === null || item.metadata == null) {
              const { data: nested } = await supabase.storage.from(bucket).list(`${user.id}/${item.name}`);
              if (nested) {
                for (const f of nested) paths.push(`${user.id}/${item.name}/${f.name}`);
              }
            } else {
              paths.push(`${user.id}/${item.name}`);
            }
          }
          if (paths.length > 0) await supabase.storage.from(bucket).remove(paths);
        }
      } catch {
        // ignore storage cleanup
      }

      setShowDeleteModal(false);
      // Về Profile — useEffect sẽ fetch lại, không còn row → hiện CTA đăng ký lại
      setScreen("profile");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Không xóa được hồ sơ. Thử lại sau.";
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  }

  // ── Ảnh (pins) + lượt tim online ───────────────────────────────────────
  const [likes, setLikes] = useState<Record<string, { liked: boolean; count: number }>>(() => {
    const initial: Record<string, { liked: boolean; count: number }> = {};
    for (const url of [...ptg.standalone_pins, ...ptg.boards.flatMap(b => b.pins)]) {
      initial[url] = { liked: false, count: Number(ptg.pin_likes?.[url] ?? 0) };
    }
    return initial;
  });
  const [likeBusy, setLikeBusy] = useState<string | null>(null);

  // Load counts + ảnh user đã tim từ server
  useEffect(() => {
    if (!ptg.id || ptg.id <= 0) return;
    let cancelled = false;
    (async () => {
      const state = await fetchPhotoLikes(ptg.id);
      if (cancelled) return;
      setLikes((prev) => {
        const next = { ...prev };
        const allUrls = new Set([
          ...Object.keys(next),
          ...Object.keys(state.counts),
          ...Array.from(state.likedUrls),
        ]);
        for (const url of allUrls) {
          const count = state.counts[url] ?? next[url]?.count ?? Number(ptg.pin_likes?.[url] ?? 0);
          next[url] = { liked: state.likedUrls.has(url), count };
        }
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [ptg.id]);
  const [openBoardId, setOpenBoardId] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [aboutExpanded, setAboutExpanded] = useState(false);

  // ── Tim hồ sơ: mỗi tài khoản 1 tim, lưu trên server ────────────────────
  const [heart, setHeart] = useState<{ hearted: boolean; hearts: number; deals: number }>({ hearted: false, hearts: 0, deals: 0 });
  const [heartBusy, setHeartBusy] = useState(false);
  const [heartMsg, setHeartMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!photographer.id || photographer.id <= 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_profile_stats", { p_photographer_id: photographer.id });
      if (!cancelled && data) {
        setHeart({ hearted: !!data.hearted, hearts: data.hearts ?? 0, deals: data.completed_deals ?? 0 });
      }
    })();
    return () => { cancelled = true; };
  }, [photographer.id]);

  // ── Thông báo nhỏ, tổng hợp đánh giá, báo cáo hồ sơ ──────────────────
  const [toast, setToast] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [revSummary, setRevSummary] = useState<ReviewSummary>(EMPTY_SUMMARY);
  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };
  const reloadSummary = useCallback(async () => {
    if (!photographer.id || photographer.id <= 0) return;
    setRevSummary(await fetchReviewSummary(photographer.id));
  }, [photographer.id]);
  useEffect(() => {
    reloadSummary();
  }, [reloadSummary]);

  async function toggleProfileHeart() {
    if (heartBusy || !ptg.id || ptg.id <= 0) return;
    setHeartBusy(true);
    setHeartMsg(null);
    const prev = heart;
    // Cập nhật ngay cho mượt, lỗi thì trả lại
    setHeart({ ...prev, hearted: !prev.hearted, hearts: Math.max(0, prev.hearts + (prev.hearted ? -1 : 1)) });
    const { data, error } = await supabase.rpc("toggle_profile_heart", { p_photographer_id: ptg.id });
    setHeartBusy(false);
    if (error || !data) {
      setHeart(prev);
      setHeartMsg(error?.message || "Không thả tim được, bạn thử lại nhé");
      setTimeout(() => setHeartMsg(null), 3000);
      return;
    }
    setHeart({ hearted: !!data.hearted, hearts: data.hearts ?? 0, deals: data.completed_deals ?? prev.deals });
  }

  async function toggleLike(url: string) {
    if (!ptg.id || ptg.id <= 0 || likeBusy === url) return;
    const cur = likes[url] ?? { liked: false, count: 0 };
    // optimistic
    setLikes((prev) => ({
      ...prev,
      [url]: { liked: !cur.liked, count: Math.max(0, cur.count + (cur.liked ? -1 : 1)) },
    }));
    setLikeBusy(url);
    const res = await togglePhotoLike(ptg.id, url);
    setLikeBusy(null);
    if ("error" in res) {
      setLikes((prev) => ({ ...prev, [url]: cur }));
      notify(res.error);
      return;
    }
    setLikes((prev) => ({ ...prev, [url]: { liked: res.liked, count: res.count } }));
  }

  const allPins = Array.from(new Set([...ptg.standalone_pins, ...ptg.boards.flatMap(b => b.pins)]));

  const openBoardPins =
    openBoardId === ALL_PINS_ID ? allPins :
    openBoardId === STANDALONE_ID ? ptg.standalone_pins :
    openBoardId && !String(openBoardId).startsWith("rental:") && openBoardId !== "__rental_standalone__"
      ? ptg.boards.find(b => b.id === openBoardId)?.pins ?? []
      : [];

  const openBoardName =
    openBoardId === ALL_PINS_ID ? "Tất cả ảnh" :
    openBoardId === STANDALONE_ID ? "Ảnh đăng lẻ" :
    ptg.boards.find(b => b.id === openBoardId)?.name ?? "";

  // Hiện 6 ảnh đầu — vuốt xuống mới hiện thêm dần
  const progressivePortfolio = useProgressiveList(openBoardPins, 6, openBoardId);
  const rentalOpenPins =
    openBoardId === "__rental_standalone__"
      ? (ptg.rental_pins || [])
      : openBoardId && String(openBoardId).startsWith("rental:")
        ? (ptg.rental_boards || []).find(b => `rental:${b.id}` === openBoardId)?.pins ?? []
        : [];
  const progressiveRental = useProgressiveList(rentalOpenPins, 6, openBoardId);

  return (
    <div className="flex flex-col min-h-full pb-28 touch-scroll" style={{ background: BG, touchAction: "pan-y" }}>
      {/* Cover — overflow chỉ bọc ảnh; avatar nằm ngoài để không bị cắt */}
      <div className="relative">
        <div
          className="relative h-64 overflow-hidden"
          style={{ background: ptg.cover ? undefined : "linear-gradient(135deg, #9ca3af 0%, #6b7280 50%, #4b5563 100%)" }}
        >
          {ptg.cover ? (
            <img src={ptg.cover} alt="cover" className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white/40 text-xs font-semibold tracking-wide">Chưa có ảnh bìa</span>
            </div>
          )}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 100%)" }} />
          <button onClick={() => setScreen(isOwner ? "profile" : "home")}
            className="absolute top-12 left-4 w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <ChevronLeft size={20} strokeWidth={2.5} className="text-white" />
          </button>
          <div className="absolute top-12 right-4 flex gap-2 items-center">
            {isPending && (
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-amber-400 text-amber-950 shadow">
                ĐANG DUYỆT
              </span>
            )}
            {/* Khách: Ghim + Báo cáo · Chủ hồ sơ: không có nút nào */}
            {!isOwner && (
              <button type="button" onClick={(e) => { e.stopPropagation(); toggleSave(Number(ptg.id)); }}
                aria-label={saved ? "Bỏ ghim hồ sơ" : "Ghim hồ sơ"} aria-pressed={saved}
                className="w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center"
                style={{ background: saved ? TEAL_LIGHT : "rgba(255,255,255,0.2)" }}>
                <Bookmark size={17} strokeWidth={2} fill={saved ? "white" : "none"} stroke="white" />
              </button>
            )}
            {!isOwner && (
              <button onClick={() => setReportOpen(true)} aria-label="Báo cáo hồ sơ"
                className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white">
                <ReportIcon size={17} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        {/* Avatar + nút xóa PTG (chủ hồ sơ) — nằm ngoài overflow nên không bị cắt */}
        <div className="absolute -bottom-10 left-5 z-10 flex items-end gap-2">
          <div className="relative">
            <Avatar src={ptg.avatar} size={80} className="border-4 border-white shadow-lg" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center"
              style={{ background: TEAL_LIGHT }}>
              <CheckCircle size={12} strokeWidth={2.5} className="text-white" />
            </div>
          </div>
          {isOwner && (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="mb-1 w-9 h-9 rounded-full flex items-center justify-center bg-red-50 border-2 border-white shadow-md active:scale-95 transition-transform"
              title="Xóa hồ sơ nhiếp ảnh gia"
              aria-label="Xóa hồ sơ nhiếp ảnh gia"
            >
              <Trash2 size={16} className="text-red-600" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="mt-12 px-5">
        {/* Tên + địa điểm + tag — không hiện giá $/hr (đã có tab Bảng giá) */}
        <div>
          <h2 className="font-black text-xl" style={{ color: TEAL }}>{ptg.name}</h2>
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin size={12} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{ptg.location}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {uniqueStyleLabels(ptg).slice(0, 6).map(t => <Badge key={t} text={t} color="teal" />)}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-3 mt-4">
          {[
            { label: "Buổi chụp", value: `${Math.max(ptg.bookings || 0, heart.deals)}` },
            { label: "Đánh giá", value: revSummary.count > 0 ? revSummary.average.toFixed(1) : (ptg.rating > 0 ? ptg.rating.toFixed(1) : "—") },
            { label: "Lượt thích", value: heart.hearts },
          ].map(s => (
            <div key={s.label} className="flex-1 bg-white rounded-2xl py-3 text-center border border-border shadow-sm">
              <p className="font-black text-lg" style={{ color: TEAL }}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Banner đang duyệt (chủ hồ sơ) */}
        {isPending && (
          <div className="mt-4 p-3 rounded-2xl flex items-start gap-2"
            style={{ background: "#fff8e1", border: "1px solid #f59e0b40" }}>
            <span className="text-base">⏳</span>
            <p className="text-xs leading-relaxed" style={{ color: "#92400e" }}>
              <strong>Profile đang trong quá trình duyệt.</strong> Bạn đang xem trước hồ sơ sẽ hiện với khách sau khi được duyệt.
              Vẫn có thể chỉnh sửa; <strong>chỉnh thông tin &amp; bảng giá</strong> cần duyệt lại. <strong>Thêm ảnh portfolio</strong> không cần duyệt lại.
            </p>
          </div>
        )}

        {/* Banner bị từ chối + lý do */}
        {isRejected && (
          <div className="mt-4 p-3 rounded-2xl flex items-start gap-2 bg-red-50 border border-red-100">
            <span className="text-base">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-red-700 mb-0.5">Hồ sơ chưa được duyệt</p>
              {rejectionNote ? (
                <p className="text-xs text-red-800/90 leading-relaxed whitespace-pre-line">{rejectionNote}</p>
              ) : (
                <p className="text-xs text-red-800/80">Vui lòng chỉnh sửa và gửi lại hồ sơ.</p>
              )}
            </div>
          </div>
        )}

        {/* Action buttons — chủ: Edit · khách: Book / Chat / Call */}
        {isOwner ? (
          <div className="flex gap-3 mt-4">
            <button onClick={() => setScreen(
                applicationStatus === "approved" || (!applicationStatus && !isPending && !isRejected)
                  ? "edit-photographer"
                  : "become-photographer"
              )}
              className="flex-1 py-3.5 rounded-2xl text-white font-bold shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
              <Edit3 size={17} strokeWidth={2} /> Cập nhật hồ sơ
            </button>
          </div>
        ) : (
          <div className="flex gap-3 mt-4">
            <button onClick={() => setScreen("booking")}
              className="flex-1 py-3.5 rounded-2xl text-white font-bold shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
              <Calendar size={17} strokeWidth={2} /> Đặt lịch ngay
            </button>
            <button type="button" onClick={toggleProfileHeart} disabled={heartBusy}
              aria-label={heart.hearted ? "Bỏ tim hồ sơ" : "Thả tim hồ sơ"} aria-pressed={heart.hearted}
              className="w-12 h-12 rounded-2xl border-2 flex items-center justify-center active:scale-95 transition-transform"
              style={{
                borderColor: heart.hearted ? "#ef4444" : TEAL,
                color: heart.hearted ? "#ef4444" : TEAL,
                background: heart.hearted ? "#fef2f2" : "transparent",
              }}>
              <Heart size={20} strokeWidth={2} fill={heart.hearted ? "#ef4444" : "none"} />
            </button>
          </div>
        )}
        {heartMsg && <p className="text-xs mt-2" style={{ color: "#ef4444" }}>{heartMsg}</p>}

        {/* About — 1 ô gộp kiểu PotoNow (tóm tắt + Xem thêm) */}
        <div className="mt-4 bg-white rounded-2xl p-4 border border-border">
          <div className="mb-2.5">
            <p className="text-xs font-bold flex items-center gap-1.5 mb-1" style={{ color: TEAL }}>
              <span className="opacity-70">💬</span> Giới thiệu
            </p>
            <ScrollText boxed maxHeightClass="max-h-36" className="text-sm text-muted-foreground leading-relaxed">
              {ptg.bio || "Chưa có giới thiệu."}
            </ScrollText>
          </div>

          {(ptg.equipment || ptg.experience_years || uniqueStyleLabels(ptg).length > 0 || (ptg.languages?.length ?? 0) > 0 || ptg.work_model || (ptg.work_locations?.length ?? 0) > 0) && (
            <>
              {ptg.equipment && (
                <div className="mb-2.5">
                  <p className="text-xs font-bold flex items-center gap-1.5 mb-1" style={{ color: TEAL }}>
                    <span className="opacity-70">📷</span> Thiết bị
                  </p>
                  <ScrollText boxed maxHeightClass="max-h-24" className="text-sm text-muted-foreground leading-relaxed">
                    {ptg.equipment}
                  </ScrollText>
                </div>
              )}

              {uniqueStyleLabels(ptg).length > 0 && (
                <div className="mb-2.5">
                  <p className="text-xs font-bold flex items-center gap-1.5 mb-1.5" style={{ color: TEAL }}>
                    <span className="opacity-70">🖼️</span> Thể loại chụp
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(aboutExpanded
                      ? uniqueStyleLabels(ptg)
                      : uniqueStyleLabels(ptg).slice(0, 4)
                    ).map((t) => (
                      <span key={t} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: "#e8f5f0", color: TEAL_MID }}>{t}</span>
                    ))}
                    {!aboutExpanded && uniqueStyleLabels(ptg).length > 4 && (
                      <span className="text-xs text-muted-foreground self-center">
                        +{uniqueStyleLabels(ptg).length - 4}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {aboutExpanded && (
                <>
                  {(ptg.languages?.length ?? 0) > 0 && (
                    <div className="mb-2.5">
                      <p className="text-xs font-bold flex items-center gap-1.5 mb-1.5" style={{ color: TEAL }}>
                        <span className="opacity-70">🗣️</span> Ngôn ngữ có thể sử dụng
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {ptg.languages!.map(l => (
                          <span key={l} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                            style={{ background: "#e8f5f0", color: TEAL_MID }}>{l}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {ptg.work_model && (
                    <div className="mb-2.5">
                      <p className="text-xs font-bold flex items-center gap-1.5 mb-1.5" style={{ color: TEAL }}>
                        <span className="opacity-70">👤</span> Mô hình làm việc
                      </p>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: "#e8f5f0", color: TEAL_MID }}>
                        {ptg.work_model === "solo" ? "Cá nhân"
                          : ptg.work_model === "team" ? "Nhóm / Team"
                          : ptg.work_model}
                      </span>
                    </div>
                  )}
                  {ptg.experience_years && (
                    <div className="mb-2.5">
                      <p className="text-xs font-bold flex items-center gap-1.5 mb-1" style={{ color: TEAL }}>
                        <span className="opacity-70">⏱️</span> Kinh nghiệm
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {ptg.experience_years}
                        {ptg.experience_detail ? ` · ${ptg.experience_detail}` : ""}
                      </p>
                    </div>
                  )}
                  {(ptg.work_locations?.length ?? 0) > 0 && (
                    <div className="mb-1">
                      <p className="text-xs font-bold flex items-center gap-1.5 mb-1.5" style={{ color: TEAL }}>
                        <MapPin size={12} /> Địa chỉ / Khu vực làm việc
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {ptg.work_locations!.map(loc => (
                          <span key={loc} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                            style={{ background: "#e8f5f0", color: TEAL_MID }}>{loc}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <button type="button" onClick={() => setAboutExpanded(e => !e)}
                className="w-full text-center text-xs font-bold mt-1 py-1"
                style={{ color: TEAL_MID }}>
                {aboutExpanded ? "⌃ Thu gọn" : "∨ Xem thêm"}
              </button>
            </>
          )}
        </div>

        {/* Tabs — 4 mục: Ảnh đã chụp | Đánh giá | Bảng giá | Thuê & phụ kiện
            Bảng giá / Thuê chỉ nằm trong tab tương ứng — không hiện ở phần giới thiệu */}
        <div className="flex mt-4 bg-white rounded-2xl p-1 border border-border gap-0.5 overflow-x-auto">
          {([
            { id: "portfolio" as const, label: "Ảnh đã chụp" },
            { id: "reviews" as const, label: "Đánh giá" },
            { id: "pricing" as const, label: "Bảng giá" },
            { id: "rental" as const, label: "Thuê & phụ kiện" },
          ]).map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setOpenBoardId(null); }}
              className="flex-1 min-w-0 py-2 px-1 rounded-xl text-[10px] sm:text-[11px] font-bold transition-all text-center leading-tight whitespace-nowrap"
              style={{
                background: tab === t.id ? TEAL : "transparent",
                color: tab === t.id ? "white" : "var(--muted-foreground)",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "portfolio" ? (
          openBoardId === null ? (
            /* ── Có board → lưới board; chỉ ảnh lẻ → masonry cuộn ngay (như lúc tạo acc) ── */
            <>
              {ptg.boards.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mt-4 mb-2">
                    <h4 className="font-bold" style={{ color: TEAL }}>Bộ sưu tập</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {allPins.length > 0 && (
                      <button type="button" onClick={() => setOpenBoardId(ALL_PINS_ID)} className="text-left">
                        <div className="aspect-square rounded-xl overflow-hidden relative">
                          <BoardCoverCollage pins={allPins} />
                        </div>
                        <p className="text-sm font-bold mt-1.5">Tất cả ảnh</p>
                        <p className="text-xs text-muted-foreground">{allPins.length} ảnh</p>
                      </button>
                    )}
                    {ptg.boards.map(b => (
                      <button type="button" key={b.id} onClick={() => setOpenBoardId(b.id)} className="text-left">
                        <div className="aspect-square rounded-xl overflow-hidden">
                          <BoardCoverCollage pins={b.cover ? [b.cover, ...b.pins.filter(p => p !== b.cover)] : b.pins} />
                        </div>
                        <p className="text-sm font-bold mt-1.5">{b.name}</p>
                        <p className="text-xs text-muted-foreground">{b.pins.length} ảnh</p>
                      </button>
                    ))}
                    {ptg.standalone_pins.length > 0 && (
                      <button type="button" onClick={() => setOpenBoardId(STANDALONE_ID)} className="text-left">
                        <div className="aspect-square rounded-xl overflow-hidden">
                          <BoardCoverCollage pins={ptg.standalone_pins} />
                        </div>
                        <p className="text-sm font-bold mt-1.5">Ảnh đăng lẻ</p>
                        <p className="text-xs text-muted-foreground">{ptg.standalone_pins.length} ảnh</p>
                      </button>
                    )}
                  </div>
                </>
              ) : ptg.standalone_pins.length > 0 ? (
                /* Chỉ ảnh đăng lẻ: hiện masonry cuộn trong khung, không gói thành 1 board */
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold" style={{ color: TEAL }}>Ảnh đã chụp</h4>
                    <span className="text-xs text-muted-foreground">{ptg.standalone_pins.length} ảnh</span>
                  </div>
                  <InfiniteMasonryBox
                    pins={ptg.standalone_pins}
                    resetKey={`standalone-${ptg.standalone_pins.length}`}
                    onPinClick={setLightboxSrc}
                    likes={likes}
                    onToggleLike={toggleLike}
                    likeDisabled={isOwner}
                  />
                </div>
              ) : (
                <p className="text-xs text-center text-muted-foreground py-8 mt-4">Chưa có ảnh portfolio</p>
              )}
            </>
          ) : (
            /* ── Bên trong 1 board — masonry Pinterest, chỉ ảnh (không tên file) ── */
            <div className="mt-4">
              <button onClick={() => setOpenBoardId(null)} className="flex items-center gap-1.5 mb-3 text-sm font-bold" style={{ color: TEAL }}>
                <ChevronLeft size={16} /> {openBoardName}
                <span className="text-xs font-normal text-muted-foreground ml-1">({openBoardPins.length} ảnh)</span>
              </button>
              <div ref={progressivePortfolio.topRef} />
              <div className="columns-2 gap-3">
                {progressivePortfolio.items.map((url, i) => {
                  const like = likes[url] ?? { liked: false, count: 0 };
                  return (
                    <div key={url + i} className="mb-3 break-inside-avoid">
                      <div
                        className="rounded-xl overflow-hidden cursor-pointer"
                        onClick={() => setLightboxSrc(url)}>
                        <img src={url} alt="" className="w-full h-auto object-cover block" />
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 px-0.5">
                        <button
                          type="button"
                          disabled={isOwner}
                          onClick={e => {
                            e.stopPropagation();
                            if (!isOwner) toggleLike(url);
                          }}
                          className={`flex items-center gap-1 ${isOwner ? "cursor-default opacity-80" : "active:scale-95"}`}
                          aria-label="Thích ảnh">
                          <Heart
                            size={18}
                            strokeWidth={2}
                            className={like.liked ? "text-red-500" : "text-muted-foreground"}
                            fill={like.liked ? "currentColor" : "none"}
                          />
                          <span className="text-xs font-semibold text-muted-foreground">{like.count}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div ref={progressivePortfolio.sentinelRef} className="py-3 flex justify-center">
                {progressivePortfolio.hasMore ? (
                  <button type="button" onClick={progressivePortfolio.loadMore}
                    className="touch-target w-11 h-11 rounded-full flex items-center justify-center text-xl font-bold text-muted-foreground active:bg-muted active:scale-95"
                    aria-label="Xem thêm">↓</button>
                ) : openBoardPins.length > 6 ? (
                  <button type="button" onClick={progressivePortfolio.scrollToTop}
                    className="touch-target w-11 h-11 rounded-full flex items-center justify-center text-xl font-bold text-muted-foreground active:bg-muted active:scale-95"
                    aria-label="Lên đầu">↑</button>
                ) : null}
              </div>
            </div>
          )
        ) : null}

        {tab === "reviews" && (
          <ReviewsSection
            photographer={ptg}
            isOwner={isOwner}
            summary={revSummary}
            onChanged={reloadSummary}
            onOpenPhotographer={onOpenPhotographer}
            notify={notify}
          />
        )}

        {tab === "pricing" && (
          <div className="mt-4 flex flex-col gap-3 mb-4">
            {(() => {
              const allGroups = ptg.price_groups || [];
              // Hiện TẤT CẢ nhóm giá (chụp / makeup / editor / thuê) — thuê cũng lặp ở tab Thuê & phụ kiện
              const groups = allGroups;
              const useLegacyPackages = allGroups.length === 0 && (ptg.packages || []).length > 0;
              if (groups.length === 0 && !useLegacyPackages) {
                return (
                  <div className="bg-white rounded-2xl p-6 text-center border border-border">
                    <p className="text-sm font-semibold text-muted-foreground">Chưa có bảng giá</p>
                  </div>
                );
              }
              return (
                <>
                  {groups.map(g => (
                    <div key={g.id} className="bg-white rounded-2xl p-4 border border-border shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                          style={{
                            background:
                              g.category === "makeup" ? "#fce7f3"
                              : g.category === "editor" ? "#e0e7ff"
                              : g.category === "rental" ? "#fef3c7"
                              : "#e8f5f0",
                            color:
                              g.category === "makeup" ? "#be185d"
                              : g.category === "editor" ? "#4338ca"
                              : g.category === "rental" ? "#b45309"
                              : TEAL,
                          }}>
                          {g.category === "makeup" ? "Make Up"
                            : g.category === "editor" ? "Editor"
                            : g.category === "rental" ? "Thuê & phụ kiện"
                            : "Chụp ảnh"}
                        </span>
                        <p className="font-bold text-sm" style={{ color: TEAL }}>{g.title}</p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {(g.lines || []).map(line => (
                          <div key={line.id} className="flex items-start justify-between gap-2 py-1 border-t border-border/50 first:border-0">
                            <div className="min-w-0">
                              <p className="text-sm">{line.name}</p>
                              {line.detail ? <p className="text-[11px] text-muted-foreground">({line.detail})</p> : null}
                            </div>
                            <p className="text-sm font-bold flex-shrink-0" style={{ color: TEAL }}>
                              {Number(line.price).toLocaleString("vi-VN")}đ
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {useLegacyPackages && (ptg.packages || []).map((pkg, i) => (
                    <div key={`pkg-${i}`} className="bg-white rounded-2xl p-4 border border-border shadow-sm">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="min-w-0">
                          <p className="font-bold" style={{ color: TEAL }}>{pkg.name}</p>
                          {pkg.desc ? <p className="text-xs text-muted-foreground mt-0.5">{pkg.desc}</p> : null}
                        </div>
                        <p className="font-black text-sm flex-shrink-0" style={{ color: TEAL }}>
                          {Number(pkg.price).toLocaleString("vi-VN")}đ
                        </p>
                      </div>
                      {!isOwner && (
                        <button type="button" onClick={() => setScreen("booking")}
                          className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-white"
                          style={{ background: TEAL }}>
                          Chọn gói này
                        </button>
                      )}
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        )}

        {tab === "rental" && (
          <div className="mt-4 flex flex-col gap-3 mb-4">
            {(() => {
              const rentalGroups = (ptg.price_groups || []).filter(g => g.category === "rental");
              const rentalBoards = ptg.rental_boards || [];
              const rentalPins = ptg.rental_pins || [];
              const hasAny = rentalGroups.length > 0 || rentalBoards.length > 0 || rentalPins.length > 0;
              if (!hasAny) {
                return (
                  <div className="bg-white rounded-2xl p-6 text-center border border-border">
                    <p className="text-sm font-semibold text-muted-foreground mb-1">Chưa có mục thuê &amp; phụ kiện</p>
                    <p className="text-xs text-muted-foreground">
                      {ptg.skill_rental
                        ? "PTG đã tick skill Thuê & phụ kiện — sẽ hiện bảng giá / ảnh khi cập nhật."
                        : "Photographer chưa mở dịch vụ cho thuê studio / máy / đạo cụ."}
                    </p>
                  </div>
                );
              }
              return (
                <>
                  {rentalGroups.map(g => (
                    <div key={g.id} className="bg-white rounded-2xl p-4 border border-border shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: "#fef3c7", color: "#b45309" }}>
                          Thuê & phụ kiện
                        </span>
                        <p className="font-bold text-sm" style={{ color: TEAL }}>{g.title}</p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {g.lines.map(line => (
                          <div key={line.id} className="flex items-start justify-between gap-2 py-1 border-t border-border/50 first:border-0">
                            <div className="min-w-0">
                              <p className="text-sm">{line.name}</p>
                              {line.detail ? <p className="text-[11px] text-muted-foreground">({line.detail})</p> : null}
                            </div>
                            <p className="text-sm font-bold flex-shrink-0" style={{ color: TEAL }}>
                              {Number(line.price).toLocaleString("vi-VN")}đ
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {/* Ảnh / board thuê — bấm mở gallery + lightbox giống portfolio */}
                  {(rentalBoards.length > 0 || rentalPins.length > 0) && (
                    <div>
                      <h4 className="font-bold mb-2 text-sm" style={{ color: TEAL }}>Hình ảnh thiết bị / studio</h4>
                      {openBoardId && (openBoardId.startsWith("rental:") || openBoardId === "__rental_standalone__") ? (
                        <div>
                          <button type="button" onClick={() => setOpenBoardId(null)}
                            className="flex items-center gap-1.5 mb-3 text-sm font-bold" style={{ color: TEAL }}>
                            <ChevronLeft size={16} />
                            {openBoardId === "__rental_standalone__"
                              ? "Ảnh lẻ thuê"
                              : rentalBoards.find(b => `rental:${b.id}` === openBoardId)?.name ?? "Board thuê"}
                            <span className="text-xs font-normal text-muted-foreground ml-1">
                              ({(openBoardId === "__rental_standalone__"
                                ? rentalPins
                                : rentalBoards.find(b => `rental:${b.id}` === openBoardId)?.pins ?? []).length} ảnh)
                            </span>
                          </button>
                          <div ref={progressiveRental.topRef} />
                          <div className="columns-2 gap-3">
                            {progressiveRental.items.map((url, i) => {
                              const like = likes[url] ?? { liked: false, count: 0 };
                              return (
                                <div key={url + i} className="mb-3 w-full break-inside-avoid">
                                  <button type="button" onClick={() => setLightboxSrc(url)}
                                    className="w-full rounded-xl overflow-hidden block">
                                    <img src={url} alt="" className="w-full h-auto object-cover block" />
                                  </button>
                                  <div className="flex items-center gap-1 mt-1.5 px-0.5">
                                    <button
                                      type="button"
                                      disabled={isOwner}
                                      onClick={e => {
                                        e.stopPropagation();
                                        if (!isOwner) toggleLike(url);
                                      }}
                                      className={`flex items-center gap-1 ${isOwner ? "cursor-default opacity-80" : "active:scale-95"}`}
                                      aria-label="Thích ảnh">
                                      <Heart
                                        size={16}
                                        strokeWidth={2}
                                        className={like.liked ? "text-red-500" : "text-muted-foreground"}
                                        fill={like.liked ? "currentColor" : "none"}
                                      />
                                      <span className="text-[11px] font-semibold text-muted-foreground">{like.count}</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div ref={progressiveRental.sentinelRef} className="py-3 flex justify-center">
                            {progressiveRental.hasMore ? (
                              <button type="button" onClick={progressiveRental.loadMore}
                                className="touch-target w-11 h-11 rounded-full flex items-center justify-center text-xl font-bold text-muted-foreground active:bg-muted active:scale-95"
                                aria-label="Xem thêm">↓</button>
                            ) : rentalOpenPins.length > 6 ? (
                              <button type="button" onClick={progressiveRental.scrollToTop}
                                className="touch-target w-11 h-11 rounded-full flex items-center justify-center text-xl font-bold text-muted-foreground active:bg-muted active:scale-95"
                                aria-label="Lên đầu">↑</button>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {rentalBoards.map(b => (
                            <button key={b.id} type="button" onClick={() => setOpenBoardId(`rental:${b.id}`)} className="text-left">
                              <div className="aspect-square rounded-xl overflow-hidden">
                                <BoardCoverCollage pins={b.cover ? [b.cover, ...b.pins.filter(p => p !== b.cover)] : b.pins} />
                              </div>
                              <p className="text-sm font-bold mt-1.5">{b.name}</p>
                              <p className="text-xs text-muted-foreground">{b.pins.length} ảnh</p>
                            </button>
                          ))}
                          {rentalPins.length > 0 && (
                            <button type="button" onClick={() => setOpenBoardId("__rental_standalone__")} className="text-left">
                              <div className="aspect-square rounded-xl overflow-hidden">
                                <BoardCoverCollage pins={rentalPins} />
                              </div>
                              <p className="text-sm font-bold mt-1.5">Ảnh lẻ</p>
                              <p className="text-xs text-muted-foreground">{rentalPins.length} ảnh</p>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      <ReportFlow
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetName={ptg.name}
        photos={allPins}
        kind="profile"
        onSubmit={async (r) => {
          if (!ptg.user_id) return "Hồ sơ này chưa gắn tài khoản nên chưa thể báo cáo";
          return submitProfileReport({
            reportedUserId: ptg.user_id,
            reportedName: ptg.name,
            subject: r.subject,
            reason: r.reason,
            description: r.description,
            photoUrl: r.photoUrl,
          });
        }}
        onDone={notify}
      />

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[120] px-4 py-2.5 rounded-full text-xs font-bold text-white shadow-lg max-w-[90%] text-center"
          style={{ background: "rgba(17,24,39,0.92)" }}>
          {toast}
        </div>
      )}

      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          liked={likes[lightboxSrc]?.liked ?? false}
          likeCount={likes[lightboxSrc]?.count ?? 0}
          onToggleLike={() => { if (!isOwner) toggleLike(lightboxSrc); }}
          onClose={() => setLightboxSrc(null)}
          showLike={!isOwner}
        />
      )}

      {/* Modal xóa hồ sơ PTG — đợi 5s rồi mới bấm Đồng ý */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => !deleting && setShowDeleteModal(false)}
        >
          <div
            className="w-full max-w-xs bg-white rounded-3xl p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <h3 className="text-base font-black text-red-700">Xóa hồ sơ nhiếp ảnh gia?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
              Hành động này <strong className="text-red-600">không thể hoàn tác</strong>. Toàn bộ thông tin
              hồ sơ PTG (banner, portfolio, bảng giá, trạng thái duyệt…) sẽ bị xóa vĩnh viễn.
              Bạn vẫn giữ tài khoản khách hàng bình thường.
            </p>
            {deleteError && (
              <p className="text-xs text-red-600 mb-3 bg-red-50 rounded-xl px-3 py-2">{deleteError}</p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={deleteCountdown > 0 || deleting}
                onClick={handleDeletePtgProfile}
                className="w-full py-3 rounded-2xl font-bold text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                style={{
                  background: deleteCountdown > 0 || deleting
                    ? "#fca5a5"
                    : "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                }}
              >
                {deleting
                  ? "Đang xóa…"
                  : deleteCountdown > 0
                    ? `Đồng ý xóa (đợi ${deleteCountdown}s)`
                    : "Đồng ý xóa hồ sơ PTG"}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteModal(false)}
                className="w-full py-3 rounded-2xl border-2 font-bold text-sm bg-white"
                style={{ borderColor: "#e5e7eb", color: TEAL }}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
