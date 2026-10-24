import { useBackHandler } from "../lib/backNavigation";
import {
  ChevronLeft, CheckCircle, XCircle, Loader2, RefreshCw,
  ExternalLink, Phone, MapPin, Camera,
} from "lucide-react";
import type { Screen } from "../types";
import { TEAL, TEAL_MID, TEAL_LIGHT, BG } from "../constants";
import { supabase } from "../lib/supabase";
import { notifyUserApplicationResult } from "../lib/notifySupport";
import { useCallback, useEffect, useState } from "react";

type PriceLine = { id?: string; name: string; price: string; detail?: string };
type PriceGroup = { id?: string; title: string; category?: string; lines: PriceLine[] };
type Board = { id?: string; name?: string; cover?: string; pins?: string[] };

type AppRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  birth_date?: string | null;
  status: string;
  admin_note: string | null;
  submitted_at: string | null;
  bio: string | null;
  work_locations: string[] | null;
  selected_styles: string[] | null;
  proof_link: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  experience_years: string | null;
  equipment: string | null;
  style_description: string | null;
  languages?: string[] | null;
  work_model?: string | null;
  skill_makeup?: boolean | null;
  skill_edit?: boolean | null;
  skill_rental?: boolean | null;
  price_groups?: PriceGroup[] | null;
  boards?: Board[] | null;
  standalone_pins?: string[] | null;
  rental_boards?: Board[] | null;
  rental_pins?: string[] | null;
  cccd_front_url?: string | null;
  cccd_back_url?: string | null;
};

const EXPERIENCE_LABEL: Record<string, string> = {
  under1: "Dưới 1 năm",
  "1to3": "Từ 1–3 năm",
  "3to5": "Trên 3 năm",
  over5: "Trên 5 năm",
};

function formatVnd(raw: string) {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "—";
  return Number(d).toLocaleString("vi-VN") + "đ";
}

function collectPins(row: AppRow): string[] {
  const fromBoards = (row.boards || []).flatMap((b) => b.pins || []);
  const standalone = row.standalone_pins || [];
  return Array.from(new Set([...fromBoards, ...standalone].filter(Boolean)));
}

function collectRentalPins(row: AppRow): string[] {
  const fromBoards = (row.rental_boards || []).flatMap((b) => b.pins || []);
  const standalone = row.rental_pins || [];
  return Array.from(new Set([...fromBoards, ...standalone].filter(Boolean)));
}

export default function AdminReviewScreen({ setScreen }: { setScreen: (s: Screen) => void }) {
  const [rows, setRows] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [updateLogs, setUpdateLogs] = useState<{ id: string; photographer_name: string | null; change_summary: string; created_at: string; user_id: string }[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  useBackHandler(!!lightbox, () => setLightbox(null));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("photographer_applications")
      .select("*")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false });
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows((data as AppRow[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(row: AppRow, approved: boolean) {
    if (busy) return;
    if (!approved && !rejectNote.trim()) {
      setToast("Vui lòng ghi lý do từ chối trước khi gửi.");
      return;
    }
    setBusy(true);
    setToast(null);
    try {
      const note = approved ? null : rejectNote.trim();
      const { error: upErr } = await supabase
        .from("photographer_applications")
        .update({
          status: approved ? "approved" : "rejected",
          admin_note: note,
        })
        .eq("user_id", row.user_id);
      if (upErr) throw upErr;

      if (approved) {
        await supabase.from("profiles").update({ role: "photographer" }).eq("id", row.user_id);

        // Đồng bộ sang bảng photographers (kèm rental_boards / rental_pins / price_groups)
        const { data: full } = await supabase
          .from("photographer_applications")
          .select("*")
          .eq("user_id", row.user_id)
          .maybeSingle();
        if (full) {
          const payload = {
            user_id: row.user_id,
            name: full.full_name || row.full_name || "Photographer",
            location: Array.isArray(full.work_locations) ? full.work_locations.join(", ") : (row.work_locations || []).join(", ") || "—",
            price: 0,
            rating: 0,
            bookings: 0,
            specialty: Array.isArray(full.selected_styles) ? (full.selected_styles[0] || "") : "",
            avatar: full.avatar_url || row.avatar_url || "",
            cover: full.banner_url || row.banner_url || "",
            portfolio: full.standalone_pins || [],
            bio: full.bio || row.bio || "",
            tags: full.selected_styles || row.selected_styles || [],
            boards: full.boards || [],
            standalone_pins: full.standalone_pins || [],
            rental_boards: full.rental_boards || [],
            rental_pins: full.rental_pins || [],
            price_groups: full.price_groups || [],
            skill_makeup: !!full.skill_makeup,
            skill_edit: !!full.skill_edit,
            skill_rental: !!full.skill_rental,
          };
          const { data: existing } = await supabase
            .from("photographers")
            .select("id")
            .eq("user_id", row.user_id)
            .maybeSingle();
          if (existing?.id) {
            await supabase.from("photographers").update(payload).eq("id", existing.id);
          } else {
            await supabase.from("photographers").insert(payload);
          }
        }
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", row.user_id)
        .maybeSingle();

      if (prof?.email) {
        await notifyUserApplicationResult({
          toEmail: prof.email,
          fullName: row.full_name || prof.full_name || "Bạn",
          approved,
          adminNote: note || undefined,
        });
      }

      setToast(approved ? `✓ Đã duyệt ${row.full_name || row.user_id}` : `Đã từ chối ${row.full_name || row.user_id}`);
      setActiveId(null);
      setRejectNote("");
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Lỗi khi cập nhật hồ sơ");
    } finally {
      setBusy(false);
    }
  }


  useEffect(() => {
    let c = false;
    (async () => {
      const { data } = await supabase
        .from("photographer_update_logs")
        .select("id, user_id, photographer_name, change_summary, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!c && data) setUpdateLogs(data as any);
    })();
    return () => { c = true; };
  }, [toast]);

  return (
    <div className="flex flex-col min-h-full pb-12" style={{ background: BG }}>
      {/* Header */}
      <div className="px-5 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-20" style={{ background: TEAL }}>
        <button
          type="button"
          onClick={() => setScreen("profile")}
          className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
        >
          <ChevronLeft size={20} className="text-white" strokeWidth={2.5} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-base">Duyệt hồ sơ photographer</h1>
          <p className="text-white/70 text-xs">
            {loading ? "Đang tải…" : `${rows.length} hồ sơ chờ duyệt`}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
          aria-label="Tải lại"
        >
          <RefreshCw size={16} className="text-white" />
        </button>
      </div>

      <div className="px-4 mt-4 flex flex-col gap-3">
        {toast && (
          <div className="text-xs font-semibold px-3 py-2.5 rounded-xl bg-white border border-border shadow-sm" style={{ color: TEAL }}>
            {toast}
          </div>
        )}

        {/* Log cập nhật hồ sơ (không CCCD) */}
        <div className="bg-white rounded-2xl border border-border p-3">
          <p className="font-bold text-xs mb-2" style={{ color: TEAL }}>Log cập nhật hồ sơ gần đây</p>
          {updateLogs.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Photographer chưa cập nhật gì thêm</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {updateLogs.slice(0, 15).map((log) => (
                <div key={log.id} className="rounded-xl bg-muted/40 px-2.5 py-2">
                  <div className="flex justify-between gap-2 mb-0.5">
                    <p className="font-semibold text-xs">{log.photographer_name || "PTG"}</p>
                    <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("vi-VN")}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground whitespace-pre-line line-clamp-4">{log.change_summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
            <Loader2 size={18} className="animate-spin" /> Đang tải hồ sơ…
          </div>
        )}

        {error && (
          <div className="text-xs text-red-700 bg-red-50 rounded-2xl px-4 py-3 border border-red-100">
            <p className="font-bold mb-1">Không tải được danh sách</p>
            <p className="leading-relaxed">{error}</p>
            <p className="mt-2 text-muted-foreground leading-relaxed">
              Cần: (1) SQL <code className="bg-white px-1 rounded">009 + 012</code> — policy admin SELECT/UPDATE;
              (2) <code className="bg-white px-1 rounded">profiles.role = &apos;admin&apos;</code> cho tài khoản này.
            </p>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-2">✅</p>
            <p className="text-sm font-bold" style={{ color: TEAL }}>Không có hồ sơ chờ duyệt</p>
            <p className="text-xs text-muted-foreground mt-1">Hồ sơ mới sẽ hiện ở đây sau khi người dùng gửi.</p>
          </div>
        )}

        {rows.map((row) => {
          const open = activeId === row.user_id;
          const portfolio = collectPins(row);
          const rentalPins = collectRentalPins(row);
          const skills = [
            row.skill_makeup ? "Makeup" : null,
            row.skill_edit ? "Edit" : null,
            row.skill_rental ? "Thuê & PK" : null,
          ].filter(Boolean);

          return (
            <div key={row.user_id} className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
              {/* Card header — luôn hiện */}
              <button
                type="button"
                className="w-full text-left px-4 py-3 flex gap-3 items-center active:bg-muted/40"
                onClick={() => {
                  setActiveId(open ? null : row.user_id);
                  setRejectNote("");
                }}
              >
                {row.avatar_url ? (
                  <img src={row.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-white shadow" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-lg">👤</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm truncate" style={{ color: TEAL }}>
                    {row.full_name || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Phone size={11} /> {row.phone || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <MapPin size={11} /> {(row.work_locations || []).join(", ") || "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {row.submitted_at ? new Date(row.submitted_at).toLocaleString("vi-VN") : "—"}
                    {portfolio.length > 0 ? ` · ${portfolio.length} ảnh` : ""}
                  </p>
                </div>
                <span className="text-[10px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-800 flex-shrink-0">
                  CHỜ
                </span>
              </button>

              {/* Chi tiết mở rộng */}
              {open && (
                <div className="border-t border-border">
                  {/* Banner */}
                  {row.banner_url && (
                    <button type="button" className="w-full block" onClick={() => setLightbox(row.banner_url!)}>
                      <img src={row.banner_url} alt="Banner" className="w-full h-36 object-cover" />
                    </button>
                  )}

                  <div className="px-4 py-3 space-y-3">
                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <Info label="Ngày sinh" value={row.birth_date || "—"} />
                      <Info
                        label="Kinh nghiệm"
                        value={EXPERIENCE_LABEL[row.experience_years || ""] || row.experience_years || "—"}
                      />
                      <Info label="Thiết bị" value={row.equipment || "—"} />
                      <Info
                        label="Mô hình"
                        value={row.work_model === "team" ? "Team" : row.work_model === "solo" ? "Solo" : row.work_model || "—"}
                      />
                      <Info label="Ngôn ngữ" value={(row.languages || []).join(", ") || "—"} />
                      <Info label="Skill phụ" value={skills.length ? skills.join(", ") : "Không"} />
                    </div>

                    {(row.selected_styles || []).length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Phân loại chụp</p>
                        <div className="flex flex-wrap gap-1">
                          {(row.selected_styles || []).map((s) => (
                            <span key={s} className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${TEAL}15`, color: TEAL }}>
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {row.style_description && (
                      <Block title="Kinh nghiệm / phong cách">{row.style_description}</Block>
                    )}
                    {row.bio && <Block title="Giới thiệu (bio)">{row.bio}</Block>}

                    {row.proof_link && (
                      <a
                        href={row.proof_link.startsWith("http") ? row.proof_link : `https://${row.proof_link}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs font-bold underline break-all"
                        style={{ color: TEAL_LIGHT }}
                      >
                        <ExternalLink size={13} /> Link minh chứng
                      </a>
                    )}

                    {/* Bảng giá */}
                    {(row.price_groups || []).length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Bảng giá</p>
                        <div className="space-y-2">
                          {(row.price_groups || []).map((g, gi) => (
                            <div key={g.id || gi} className="rounded-xl border border-border overflow-hidden">
                              <div className="px-3 py-1.5 text-xs font-bold flex items-center justify-between" style={{ background: `${TEAL}10`, color: TEAL }}>
                                <span>{g.title || "Mục"}</span>
                                {g.category && (
                                  <span className="text-[10px] font-semibold opacity-70">{g.category}</span>
                                )}
                              </div>
                              {(g.lines || []).map((l, li) => (
                                <div key={l.id || li} className="px-3 py-1.5 text-xs flex justify-between border-t border-border">
                                  <span>
                                    {l.name}
                                    {l.detail ? <span className="text-muted-foreground"> · {l.detail}</span> : null}
                                  </span>
                                  <span className="font-bold" style={{ color: TEAL }}>{formatVnd(l.price)}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Portfolio ảnh */}
                    {portfolio.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Camera size={11} /> Portfolio · {portfolio.length} ảnh
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {portfolio.slice(0, 18).map((url, i) => (
                            <button
                              key={url + i}
                              type="button"
                              onClick={() => setLightbox(url)}
                              className="aspect-square rounded-lg overflow-hidden bg-muted"
                            >
                              <img src={url} alt="" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                        {portfolio.length > 18 && (
                          <p className="text-[10px] text-muted-foreground mt-1">+{portfolio.length - 18} ảnh nữa</p>
                        )}
                      </div>
                    )}

                    {/* Boards tên */}
                    {(row.boards || []).length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Bộ sưu tập</p>
                        <div className="flex flex-wrap gap-1">
                          {(row.boards || []).map((b, i) => (
                            <span key={b.id || i} className="text-[11px] px-2 py-0.5 rounded-full bg-muted">
                              {b.name || "Board"} ({(b.pins || []).length})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Rental pins */}
                    {rentalPins.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                          Thuê &amp; phụ kiện · {rentalPins.length} ảnh
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {rentalPins.slice(0, 9).map((url, i) => (
                            <button
                              key={url + i}
                              type="button"
                              onClick={() => setLightbox(url)}
                              className="aspect-square rounded-lg overflow-hidden bg-muted"
                            >
                              <img src={url} alt="" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* CCCD */}
                    {(row.cccd_front_url || row.cccd_back_url) && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                          CCCD (chỉ admin)
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {row.cccd_front_url && (
                            <button type="button" onClick={() => setLightbox(row.cccd_front_url!)} className="rounded-xl overflow-hidden border border-border">
                              <img src={row.cccd_front_url} alt="CCCD trước" className="w-full h-28 object-cover" />
                              <p className="text-[10px] text-center py-1 bg-muted">Mặt trước</p>
                            </button>
                          )}
                          {row.cccd_back_url && (
                            <button type="button" onClick={() => setLightbox(row.cccd_back_url!)} className="rounded-xl overflow-hidden border border-border">
                              <img src={row.cccd_back_url} alt="CCCD sau" className="w-full h-28 object-cover" />
                              <p className="text-[10px] text-center py-1 bg-muted">Mặt sau</p>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <p className="text-[10px] text-muted-foreground break-all">user_id: {row.user_id}</p>

                    {/* Reject note + actions */}
                    <div>
                      <label className="block text-xs font-bold mb-1" style={{ color: TEAL }}>
                        Lý do từ chối (bắt buộc nếu Từ chối)
                      </label>
                      <textarea
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        rows={3}
                        placeholder="VD: Portfolio chưa đủ chất lượng, CCCD mờ…"
                        className="w-full text-sm rounded-xl border border-border px-3 py-2 outline-none resize-none focus:ring-2"
                        style={{ ["--tw-ring-color" as string]: TEAL_LIGHT }}
                      />
                    </div>

                    <div className="flex gap-2 pt-1 pb-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => decide(row, true)}
                        className="flex-1 py-3.5 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-md active:scale-[0.98]"
                        style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}
                      >
                        <CheckCircle size={17} /> Đồng ý
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => decide(row, false)}
                        className="flex-1 py-3.5 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-md active:scale-[0.98]"
                        style={{ background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)" }}
                      >
                        <XCircle size={17} /> Từ chối
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox xem ảnh lớn */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute top-10 right-5 w-10 h-10 rounded-full bg-white/20 text-white font-bold"
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-2.5 py-2">
      <p className="text-[10px] text-muted-foreground font-semibold">{label}</p>
      <p className="text-xs font-semibold text-foreground mt-0.5 break-words">{value}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">{title}</p>
      <p className="text-xs leading-relaxed text-foreground whitespace-pre-line">{children}</p>
    </div>
  );
}
