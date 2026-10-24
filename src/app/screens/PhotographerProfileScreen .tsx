import { MessageCircle, ChevronLeft, MapPin, Heart, Share2, Bookmark, CheckCircle, Phone, Edit3, Calendar, Lock, Layers, Star, Trash2 } from "lucide-react";
import type { Screen, Photographer } from "../types";
import { TEAL, TEAL_MID, TEAL_LIGHT, BG } from "../constants";
import { StarRow } from "../components/shared/StarRow";
import { Avatar } from "../components/shared/Avatar";
import { Badge } from "../components/shared/Badge";
import { ImageLightbox } from "../components/shared/ImageLightbox";
import { BoardCoverCollage } from "../components/shared/BoardCoverCollage";
import { supabase } from "../lib/supabase";
import { useState, useEffect, useRef } from "react";

const ALL_PINS_ID = "__all__";
const STANDALONE_ID = "__standalone__";

export default function PhotographerProfileScreen({
  photographer, setScreen, savedIds, toggleSave,
  isOwner = false,
  applicationStatus = null,
}: {
  photographer: Photographer;
  setScreen: (s: Screen) => void;
  savedIds: number[];
  toggleSave: (id: number) => void;
  /** true = đang xem hồ sơ của chính mình (từ menu Profile) */
  isOwner?: boolean;
  /** Trạng thái xét duyệt hồ sơ (khi isOwner) */
  applicationStatus?: "draft" | "submitted" | "approved" | "rejected" | null;
}) {
  const [tab, setTab] = useState<"portfolio" | "reviews" | "pricing" | "rental">("portfolio");
  const saved = savedIds.includes(photographer.id);
  const isPending = isOwner && (applicationStatus === "submitted" || applicationStatus === "draft");
  const totalLikes = Object.values(photographer.pin_likes || {}).reduce((a, b) => a + (b || 0), 0);

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

  // ── Ảnh (pins) + lượt tim — chỉ lưu tạm trên máy, chưa nối API thật ─────
  const [likes, setLikes] = useState<Record<string, { liked: boolean; count: number }>>(() => {
    const initial: Record<string, { liked: boolean; count: number }> = {};
    for (const url of [...photographer.standalone_pins, ...photographer.boards.flatMap(b => b.pins)]) {
      initial[url] = { liked: false, count: photographer.pin_likes[url] ?? 0 };
    }
    return initial;
  });
  const [openBoardId, setOpenBoardId] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [aboutExpanded, setAboutExpanded] = useState(false);

  function toggleLike(url: string) {
    setLikes(prev => {
      const cur = prev[url] ?? { liked: false, count: 0 };
      return { ...prev, [url]: { liked: !cur.liked, count: cur.count + (cur.liked ? -1 : 1) } };
    });
  }

  const allPins = Array.from(new Set([...photographer.standalone_pins, ...photographer.boards.flatMap(b => b.pins)]));

  const openBoardPins =
    openBoardId === ALL_PINS_ID ? allPins :
    openBoardId === STANDALONE_ID ? photographer.standalone_pins :
    openBoardId ? photographer.boards.find(b => b.id === openBoardId)?.pins ?? [] : [];

  const openBoardName =
    openBoardId === ALL_PINS_ID ? "Tất cả ảnh" :
    openBoardId === STANDALONE_ID ? "Ảnh đăng lẻ" :
    photographer.boards.find(b => b.id === openBoardId)?.name ?? "";

  return (
    <div className="flex flex-col min-h-screen pb-28" style={{ background: BG }}>
      {/* Cover — overflow chỉ bọc ảnh; avatar nằm ngoài để không bị cắt */}
      <div className="relative">
        <div
          className="relative h-64 overflow-hidden"
          style={{ background: photographer.cover ? undefined : "linear-gradient(135deg, #9ca3af 0%, #6b7280 50%, #4b5563 100%)" }}
        >
          {photographer.cover ? (
            <img src={photographer.cover} alt="cover" className="w-full h-full object-cover" />
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
            {/* Khách: Pin + Share + Like · Chủ: Share */}
            {!isOwner && (
              <button onClick={() => toggleSave(photographer.id)}
                className="w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center"
                style={{ background: saved ? TEAL_LIGHT : "rgba(255,255,255,0.2)" }}>
                <Bookmark size={17} strokeWidth={2} fill={saved ? "white" : "none"} stroke="white" />
              </button>
            )}
            <button className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Share2 size={17} strokeWidth={2} className="text-white" />
            </button>
            {!isOwner && (
              <button className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Heart size={17} strokeWidth={2} className="text-white" />
              </button>
            )}
          </div>
        </div>

        {/* Avatar + nút xóa PTG (chủ hồ sơ) — nằm ngoài overflow nên không bị cắt */}
        <div className="absolute -bottom-10 left-5 z-10 flex items-end gap-2">
          <div className="relative">
            <Avatar src={photographer.avatar} size={80} className="border-4 border-white shadow-lg" />
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
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-black text-xl" style={{ color: TEAL }}>{photographer.name}</h2>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin size={12} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{photographer.location}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {photographer.tags.map(t => <Badge key={t} text={t} color="teal" />)}
            </div>
          </div>
          <div className="text-right">
            <p className="font-black text-xl" style={{ color: TEAL }}>${photographer.price}<span className="text-xs font-normal text-muted-foreground">/hr</span></p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-3 mt-4">
          {[
            { label: "Buổi chụp", value: `${photographer.bookings}` },
            { label: "Đánh giá", value: photographer.rating > 0 ? photographer.rating.toFixed(1) : "—" },
            { label: "Lượt thích", value: totalLikes || Object.values(likes).reduce((a, l) => a + l.count, 0) },
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
              Hồ sơ đang được đội ngũ Memento xét duyệt. Bạn vẫn có thể chỉnh sửa thông tin / thêm ảnh;
              <strong> chỉnh thông tin &amp; bảng giá</strong> sẽ cần duyệt lại. <strong>Thêm ảnh portfolio</strong> không cần duyệt lại.
            </p>
          </div>
        )}

        {/* Action buttons — chủ: Edit · khách: Book / Chat / Call */}
        {isOwner ? (
          <div className="flex gap-3 mt-4">
            <button onClick={() => setScreen("become-photographer")}
              className="flex-1 py-3.5 rounded-2xl text-white font-bold shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
              <Edit3 size={17} strokeWidth={2} /> Chỉnh sửa hồ sơ
            </button>
          </div>
        ) : (
          <div className="flex gap-3 mt-4">
            <button onClick={() => setScreen("booking")}
              className="flex-1 py-3.5 rounded-2xl text-white font-bold shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
              <Calendar size={17} strokeWidth={2} /> Đặt lịch ngay
            </button>
            <button onClick={() => setScreen("chat")}
              className="w-12 h-12 rounded-2xl border-2 flex items-center justify-center"
              style={{ borderColor: TEAL, color: TEAL }}>
              <MessageCircle size={20} strokeWidth={2} />
            </button>
            <button className="w-12 h-12 rounded-2xl border-2 flex items-center justify-center"
              style={{ borderColor: TEAL, color: TEAL }}>
              <Phone size={20} strokeWidth={2} />
            </button>
          </div>
        )}

        {/* About — 1 ô gộp kiểu PotoNow (tóm tắt + Xem thêm) */}
        <div className="mt-4 bg-white rounded-2xl p-4 border border-border">
          <div className="mb-2.5">
            <p className="text-xs font-bold flex items-center gap-1.5 mb-1" style={{ color: TEAL }}>
              <span className="opacity-70">💬</span> Giới thiệu
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {photographer.bio || "Chưa có giới thiệu."}
            </p>
          </div>

          {(photographer.equipment || photographer.experience_years || (photographer.shooting_styles?.length ?? 0) > 0 || photographer.tags.length > 0 || (photographer.languages?.length ?? 0) > 0 || photographer.work_model || (photographer.work_locations?.length ?? 0) > 0) && (
            <>
              {photographer.equipment && (
                <div className="mb-2.5">
                  <p className="text-xs font-bold flex items-center gap-1.5 mb-1" style={{ color: TEAL }}>
                    <span className="opacity-70">📷</span> Thiết bị
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {aboutExpanded
                      ? photographer.equipment
                      : (photographer.equipment.length > 90
                        ? photographer.equipment.slice(0, 90).trim() + "…"
                        : photographer.equipment)}
                  </p>
                </div>
              )}

              {((photographer.shooting_styles?.length ?? 0) > 0 || photographer.tags.length > 0) && (
                <div className="mb-2.5">
                  <p className="text-xs font-bold flex items-center gap-1.5 mb-1.5" style={{ color: TEAL }}>
                    <span className="opacity-70">🖼️</span> Thể loại chụp
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(aboutExpanded
                      ? [...(photographer.shooting_styles ?? []), ...photographer.tags]
                      : [...(photographer.shooting_styles ?? []), ...photographer.tags].slice(0, 4)
                    ).map((t, i) => (
                      <span key={`${t}-${i}`} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: "#e8f5f0", color: TEAL_MID }}>{t}</span>
                    ))}
                    {!aboutExpanded && [...(photographer.shooting_styles ?? []), ...photographer.tags].length > 4 && (
                      <span className="text-xs text-muted-foreground self-center">
                        +{[...(photographer.shooting_styles ?? []), ...photographer.tags].length - 4}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {aboutExpanded && (
                <>
                  {(photographer.languages?.length ?? 0) > 0 && (
                    <div className="mb-2.5">
                      <p className="text-xs font-bold flex items-center gap-1.5 mb-1.5" style={{ color: TEAL }}>
                        <span className="opacity-70">🗣️</span> Ngôn ngữ có thể sử dụng
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {photographer.languages!.map(l => (
                          <span key={l} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                            style={{ background: "#e8f5f0", color: TEAL_MID }}>{l}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {photographer.work_model && (
                    <div className="mb-2.5">
                      <p className="text-xs font-bold flex items-center gap-1.5 mb-1.5" style={{ color: TEAL }}>
                        <span className="opacity-70">👤</span> Mô hình làm việc
                      </p>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: "#e8f5f0", color: TEAL_MID }}>
                        {photographer.work_model === "solo" ? "Cá nhân"
                          : photographer.work_model === "team" ? "Nhóm / Team"
                          : photographer.work_model}
                      </span>
                    </div>
                  )}
                  {photographer.experience_years && (
                    <div className="mb-2.5">
                      <p className="text-xs font-bold flex items-center gap-1.5 mb-1" style={{ color: TEAL }}>
                        <span className="opacity-70">⏱️</span> Kinh nghiệm
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {photographer.experience_years}
                        {photographer.experience_detail ? ` · ${photographer.experience_detail}` : ""}
                      </p>
                    </div>
                  )}
                  {(photographer.work_locations?.length ?? 0) > 0 && (
                    <div className="mb-1">
                      <p className="text-xs font-bold flex items-center gap-1.5 mb-1.5" style={{ color: TEAL }}>
                        <MapPin size={12} /> Địa chỉ / Khu vực làm việc
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {photographer.work_locations!.map(loc => (
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

        {/* Tabs — 4 mục giống profile mẫu: Ảnh / Đánh giá / Bảng giá / Thuê & phụ kiện */}
        <div className="flex mt-4 bg-white rounded-2xl p-1 border border-border gap-0.5">
          {([
            { id: "portfolio" as const, label: "Ảnh" },
            { id: "reviews" as const, label: "Đánh giá" },
            { id: "pricing" as const, label: "Bảng giá" },
            { id: "rental" as const, label: "Thuê" },
          ]).map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setOpenBoardId(null); }}
              className="flex-1 py-2 rounded-xl text-[11px] font-bold transition-all text-center leading-tight px-0.5"
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
            /* ── Danh sách "board" kiểu Pinterest ─────────────────────── */
            <>
              <div className="flex items-center justify-between mt-4 mb-2">
                <h4 className="font-bold" style={{ color: TEAL }}>Bộ sưu tập</h4>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {allPins.length > 0 && (
                  <button onClick={() => setOpenBoardId(ALL_PINS_ID)} className="text-left">
                    <div className="aspect-square rounded-xl overflow-hidden relative">
                      <BoardCoverCollage pins={allPins} />
                    </div>
                    <p className="text-sm font-bold mt-1.5">Tất cả ảnh</p>
                    <p className="text-xs text-muted-foreground">{allPins.length} ảnh</p>
                  </button>
                )}
                {photographer.boards.map(b => (
                  <button key={b.id} onClick={() => setOpenBoardId(b.id)} className="text-left">
                    <div className="aspect-square rounded-xl overflow-hidden">
                      <BoardCoverCollage pins={b.cover ? [b.cover, ...b.pins.filter(p => p !== b.cover)] : b.pins} />
                    </div>
                    <p className="text-sm font-bold mt-1.5 flex items-center gap-1">
                      {b.private && <Lock size={11} className="text-muted-foreground" />}
                      {b.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{b.pins.length} ảnh</p>
                  </button>
                ))}
                {photographer.standalone_pins.length > 0 && (
                  <button onClick={() => setOpenBoardId(STANDALONE_ID)} className="text-left">
                    <div className="aspect-square rounded-xl overflow-hidden">
                      <BoardCoverCollage pins={photographer.standalone_pins} />
                    </div>
                    <p className="text-sm font-bold mt-1.5">Ảnh đăng lẻ</p>
                    <p className="text-xs text-muted-foreground">{photographer.standalone_pins.length} ảnh</p>
                  </button>
                )}
              </div>
            </>
          ) : (
            /* ── Bên trong 1 board — masonry Pinterest, chỉ ảnh (không tên file) ── */
            <div className="mt-4">
              <button onClick={() => setOpenBoardId(null)} className="flex items-center gap-1.5 mb-3 text-sm font-bold" style={{ color: TEAL }}>
                <ChevronLeft size={16} /> {openBoardName}
                <span className="text-xs font-normal text-muted-foreground ml-1">({openBoardPins.length} ảnh)</span>
              </button>
              <div className="columns-2 gap-3">
                {openBoardPins.map((url, i) => {
                  const like = likes[url] ?? { liked: false, count: 0 };
                  return (
                    <div key={url + i} className="mb-3 break-inside-avoid">
                      <div
                        className="rounded-xl overflow-hidden cursor-pointer"
                        onClick={() => setLightboxSrc(url)}>
                        <img src={url} alt="" className="w-full h-auto object-cover block" />
                      </div>
                      {/* Tim + số like nằm DƯỚI ảnh — khách bấm được; chủ chỉ xem */}
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
            </div>
          )
        ) : null}

        {tab === "reviews" && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold" style={{ color: TEAL }}>Đánh giá gần đây</h4>
              <button onClick={() => setScreen("reviews-list")} className="text-xs font-semibold" style={{ color: TEAL_LIGHT }}>Xem tất cả</button>
            </div>
            {photographer.reviews.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center border border-border">
                <Edit3 size={28} className="mx-auto mb-2 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-sm font-semibold text-muted-foreground">Chưa có đánh giá nào</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {photographer.reviews.slice(0, 3).map((r, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 border border-border">
                    <div className="flex items-center gap-3 mb-2">
                      <Avatar src={r.avatar} size={36} />
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-sm">{r.name}</p>
                          {r.verified && <CheckCircle size={13} style={{ color: TEAL_LIGHT }} strokeWidth={2.5} />}
                        </div>
                        <StarRow rating={r.rating} size={11} />
                      </div>
                      <span className="text-xs text-muted-foreground">{r.time}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{r.text}</p>
                  </div>
                ))}
              </div>
            )}
            {!isOwner && (
              <button onClick={() => setScreen("write-review")}
                className="w-full mt-4 py-3.5 rounded-2xl font-bold border-2 flex items-center justify-center gap-2 active:scale-95 transition-transform"
                style={{ borderColor: TEAL_LIGHT, color: TEAL, background: `${TEAL_LIGHT}15` }}>
                <Edit3 size={18} strokeWidth={2} style={{ color: TEAL_LIGHT }} />
                Viết đánh giá của bạn
              </button>
            )}
          </div>
        )}

        {tab === "pricing" && (
          <div className="mt-4 flex flex-col gap-3 mb-4">
            {(() => {
              const groups = (photographer.price_groups || []).filter(g => g.category !== "rental");
              if (groups.length === 0 && photographer.packages.length === 0) {
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
                            background: g.category === "makeup" ? "#fce7f3" : g.category === "editor" ? "#e0e7ff" : "#e8f5f0",
                            color: g.category === "makeup" ? "#be185d" : g.category === "editor" ? "#4338ca" : TEAL,
                          }}>
                          {g.category === "makeup" ? "Make Up" : g.category === "editor" ? "Editor" : "Chụp ảnh"}
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
                  {photographer.packages.map((pkg, i) => (
                    <div key={`pkg-${i}`} className="bg-white rounded-2xl p-4 border border-border shadow-sm">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-bold" style={{ color: TEAL }}>{pkg.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{pkg.desc}</p>
                        </div>
                        <p className="font-black text-lg" style={{ color: TEAL_LIGHT }}>${pkg.price}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {pkg.includes.map(inc => (
                          <span key={inc} className="text-xs px-2 py-1 rounded-lg bg-secondary text-secondary-foreground font-medium flex items-center gap-1">
                            <CheckCircle size={10} style={{ color: TEAL_LIGHT }} />
                            {inc}
                          </span>
                        ))}
                      </div>
                      {!isOwner && (
                        <button onClick={() => setScreen("booking")}
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
              const rentalGroups = (photographer.price_groups || []).filter(g => g.category === "rental");
              const rentalBoards = photographer.rental_boards || [];
              const rentalPins = photographer.rental_pins || [];
              const hasAny = rentalGroups.length > 0 || rentalBoards.length > 0 || rentalPins.length > 0;
              if (!hasAny) {
                return (
                  <div className="bg-white rounded-2xl p-6 text-center border border-border">
                    <p className="text-sm font-semibold text-muted-foreground mb-1">Chưa có mục thuê &amp; phụ kiện</p>
                    <p className="text-xs text-muted-foreground">
                      {photographer.skill_rental
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
                  {/* Ảnh / board thuê — cùng UX portfolio (group + pins), bổ sung sau */}
                  {(rentalBoards.length > 0 || rentalPins.length > 0) && (
                    <div>
                      <h4 className="font-bold mb-2 text-sm" style={{ color: TEAL }}>Hình ảnh thiết bị / studio</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {rentalBoards.map(b => (
                          <div key={b.id} className="text-left">
                            <div className="aspect-square rounded-xl overflow-hidden">
                              <BoardCoverCollage pins={b.cover ? [b.cover, ...b.pins.filter(p => p !== b.cover)] : b.pins} />
                            </div>
                            <p className="text-sm font-bold mt-1.5">{b.name}</p>
                            <p className="text-xs text-muted-foreground">{b.pins.length} ảnh</p>
                          </div>
                        ))}
                        {rentalPins.length > 0 && (
                          <div className="text-left">
                            <div className="aspect-square rounded-xl overflow-hidden">
                              <BoardCoverCollage pins={rentalPins} />
                            </div>
                            <p className="text-sm font-bold mt-1.5">Ảnh lẻ</p>
                            <p className="text-xs text-muted-foreground">{rentalPins.length} ảnh</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

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
