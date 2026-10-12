import { MessageCircle, ChevronLeft, MapPin, Heart, Share2, Bookmark, CheckCircle, Phone, Edit3, Calendar, Lock, Layers, Star } from "lucide-react";
import type { Screen, Photographer } from "../types";
import { TEAL, TEAL_MID, TEAL_LIGHT, BG } from "../constants";
import { StarRow } from "../components/shared/StarRow";
import { Avatar } from "../components/shared/Avatar";
import { Badge } from "../components/shared/Badge";
import { ImageLightbox } from "../components/shared/ImageLightbox";
import { BoardCoverCollage } from "../components/shared/BoardCoverCollage";
import { useState } from "react";

const ALL_PINS_ID = "__all__";
const STANDALONE_ID = "__standalone__";

export default function PhotographerProfileScreen({
  photographer, setScreen, savedIds, toggleSave
}: {
  photographer: Photographer;
  setScreen: (s: Screen) => void;
  savedIds: number[];
  toggleSave: (id: number) => void;
}) {
  const [tab, setTab] = useState<"portfolio" | "reviews">("portfolio");
  const saved = savedIds.includes(photographer.id);

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
    <div className="flex flex-col min-h-screen pb-6" style={{ background: BG }}>
      {/* Cover */}
      <div className="relative h-64">
        <img src={photographer.cover} alt="cover" className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 100%)" }} />
        <button onClick={() => setScreen("home")}
          className="absolute top-12 left-4 w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <ChevronLeft size={20} strokeWidth={2.5} className="text-white" />
        </button>
        <div className="absolute top-12 right-4 flex gap-2">
          <button onClick={() => toggleSave(photographer.id)}
            className="w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center"
            style={{ background: saved ? TEAL_LIGHT : "rgba(255,255,255,0.2)" }}>
            <Bookmark size={17} strokeWidth={2} fill={saved ? "white" : "none"} stroke="white" />
          </button>
          <button className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Share2 size={17} strokeWidth={2} className="text-white" />
          </button>
          <button className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Heart size={17} strokeWidth={2} className="text-white" />
          </button>
        </div>
        {/* Avatar overlapping */}
        <div className="absolute -bottom-10 left-5">
          <div className="relative">
            <Avatar src={photographer.avatar} size={80} className="border-4 border-white shadow-lg" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center"
              style={{ background: TEAL_LIGHT }}>
              <CheckCircle size={12} strokeWidth={2.5} className="text-white" />
            </div>
          </div>
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
            { label: "Lượt đặt", value: `${photographer.bookings}+` },
            { label: "Đánh giá", value: photographer.rating.toFixed(1) },
            { label: "Reviews", value: photographer.reviews.length },
          ].map(s => (
            <div key={s.label} className="flex-1 bg-white rounded-2xl py-3 text-center border border-border shadow-sm">
              <p className="font-black text-lg" style={{ color: TEAL }}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Action buttons */}
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
                        style={{ background: "#fff7ed", color: "#ea580c" }}>{t}</span>
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
                            style={{ background: "#fff7ed", color: "#ea580c" }}>{l}</span>
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
                        style={{ background: "#fff7ed", color: "#ea580c" }}>
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
                            style={{ background: "#fff7ed", color: "#ea580c" }}>{loc}</span>
                        ))}
                      </div>
                    </div>
                  )}
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

        {/* Tabs */}
        <div className="flex mt-4 bg-white rounded-2xl p-1 border border-border">
          {(["portfolio", "reviews"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setOpenBoardId(null); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5"
              style={{
                background: tab === t ? TEAL : "transparent",
                color: tab === t ? "white" : "var(--muted-foreground)",
              }}>
              {t === "portfolio"
                ? <><Layers size={14} /> Portfolio</>
                : <><Star size={14} /> Đánh giá ({photographer.reviews.length})</>}
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
              <div className="columns-2 gap-1.5">
                {openBoardPins.map((url, i) => {
                  const like = likes[url] ?? { liked: false, count: 0 };
                  return (
                    <div key={url + i}
                      className="relative mb-1.5 break-inside-avoid rounded-lg overflow-hidden cursor-pointer"
                      onClick={() => setLightboxSrc(url)}>
                      <img src={url} alt="" className="w-full h-auto object-cover block" />
                      <button onClick={e => { e.stopPropagation(); toggleLike(url); }}
                        className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
                        <Heart size={16} className={like.liked ? "text-red-500" : "text-white"}
                          fill={like.liked ? "currentColor" : "none"}
                          style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }} />
                        <span className="text-white text-xs font-bold" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}>{like.count}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
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
          </div>
        )}

        {/* Write Review Button */}
        <button onClick={() => setScreen("write-review")}
          className="w-full mt-4 py-3.5 rounded-2xl font-bold border-2 flex items-center justify-center gap-2 active:scale-95 transition-transform"
          style={{ borderColor: TEAL_LIGHT, color: TEAL, background: `${TEAL_LIGHT}15` }}>
          <Edit3 size={18} strokeWidth={2} style={{ color: TEAL_LIGHT }} />
          Viết đánh giá của bạn
        </button>

        {/* Packages */}
        <h4 className="font-bold mt-5 mb-3" style={{ color: TEAL }}>Gói dịch vụ</h4>
        <div className="flex flex-col gap-3 mb-4">
          {photographer.packages.map((pkg, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 border border-border shadow-sm">
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
              <button onClick={() => setScreen("booking")}
                className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: TEAL }}>
                Chọn gói này
              </button>
            </div>
          ))}
        </div>
      </div>

      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          liked={likes[lightboxSrc]?.liked ?? false}
          likeCount={likes[lightboxSrc]?.count ?? 0}
          onToggleLike={() => toggleLike(lightboxSrc)}
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </div>
  );
}
