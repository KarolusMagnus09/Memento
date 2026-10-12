import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { ScrollText } from "./ScrollText";
import {
  FEEDBACK_BUCKET,
  MAX_FEEDBACK_IMAGES,
  addPhotoFeedback,
  clientApproveHandover,
  fetchPhotoFeedback,
  resolveFeedback,
  submitDriveUrl,
  uploadFeedbackImages,
  validateDriveUrl,
  type BookingRow,
  type PhotoFeedback,
} from "../../lib/bookings";

type Props = {
  booking: BookingRow;
  role: "ptg" | "client";
  userId: string | null;
  accent: string;
  onChanged: () => void;
  notify: (msg: string) => void;
};

const GREEN = "#16a34a";
const AMBER = "#f59e0b";
const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Tải danh sách yêu cầu, tự làm mới 15 giây/lần khi tab đang mở (không đổi state nếu không có gì mới → ảnh không bị nháy) */
function useFeedback(bookingId: string) {
  const [list, setList] = useState<PhotoFeedback[]>([]);
  const sig = useRef("");
  const load = useCallback(async () => {
    const rows = await fetchPhotoFeedback(bookingId);
    const next = rows.map((r) => `${r.id}:${r.resolved}:${r.note}`).join("|");
    if (next !== sig.current) {
      sig.current = next;
      setList(rows);
    }
  }, [bookingId]);
  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, 15000);
    return () => clearInterval(t);
  }, [load]);
  return { list, reload: load };
}

function Thumbs({ urls }: { urls?: string[] }) {
  if (!urls || urls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noreferrer">
          <img src={u} alt="Ảnh đính kèm" className="w-14 h-14 rounded-lg object-cover border border-border" />
        </a>
      ))}
    </div>
  );
}

function StatusChip({ resolved }: { resolved: boolean }) {
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0"
      style={{ background: resolved ? GREEN : AMBER }}
    >
      {resolved ? "Đã chỉnh" : "Chờ chỉnh"}
    </span>
  );
}

function PtgPanel({ booking, accent, onChanged, notify }: Props) {
  const { list, reload } = useFeedback(booking.id);
  const [url, setUrl] = useState("");
  const [viewOnly, setViewOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const hasLink = !!booking.drive_url;
  const pending = list.filter((f) => !f.resolved).length;

  async function send() {
    const bad = validateDriveUrl(url);
    if (bad) return notify(bad);
    if (!viewOnly) return notify("Hãy xác nhận bạn đã chia sẻ Drive ở quyền Người xem");
    if (url.trim() === booking.drive_url) return notify("Link này đang được dùng rồi");
    setBusy(true);
    const err = await submitDriveUrl(booking.id, url.trim());
    setBusy(false);
    if (err) return notify(err);
    notify(hasLink ? "Đã cập nhật link Drive — khách sẽ thấy link mới" : "Đã gửi link Drive cho khách");
    setUrl("");
    setViewOnly(false);
    onChanged();
  }

  async function toggle(f: PhotoFeedback) {
    setTogglingId(f.id);
    const err = await resolveFeedback(f.id, !f.resolved);
    setTogglingId(null);
    if (err) return notify(err);
    await reload();
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="rounded-xl px-3 py-2 text-[11px] leading-relaxed" style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
        <strong>Trước khi gửi:</strong> mở Google Drive → Chia sẻ → chọn "Bất kỳ ai có đường liên kết" với quyền{" "}
        <strong>Người xem (Viewer)</strong>. Đừng để quyền <strong>Người chỉnh sửa (Editor)</strong> để khách không vô tình
        xóa hoặc đổi ảnh.
      </div>

      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={hasLink ? "Dán link Drive MỚI để thay thế..." : "Dán link album Google Drive tại đây..."}
        className="w-full rounded-xl border border-border px-3 py-2 text-xs"
      />
      <label className="flex items-start gap-2 text-[11px] text-muted-foreground cursor-pointer">
        <input type="checkbox" checked={viewOnly} onChange={(e) => setViewOnly(e.target.checked)} className="mt-0.5" />
        <span>Mình đã đặt quyền chia sẻ là Người xem (Viewer)</span>
      </label>
      <button
        type="button"
        disabled={busy || !url.trim()}
        onClick={send}
        className="w-full py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50"
        style={{ background: accent }}
      >
        {busy ? "Đang gửi..." : hasLink ? "Cập nhật link ảnh" : "Gửi link ảnh cho khách"}
      </button>
      {hasLink && (
        <>
          <a href={booking.drive_url!} target="_blank" rel="noreferrer" className="block text-xs underline truncate" style={{ color: accent }}>
            Drive hiện tại: {booking.drive_url}
          </a>
          <p className="text-[11px] text-muted-foreground">Mỗi lần đổi link, hệ thống lưu lại cả link cũ và link mới.</p>
        </>
      )}

      <div className="pt-1">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-bold">Yêu cầu chỉnh sửa từ khách</p>
          {pending > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: AMBER }}>
              {pending} chờ chỉnh
            </span>
          )}
        </div>
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có yêu cầu nào.</p>
        ) : (
          <div className="space-y-2">
            {list.map((f, i) => (
              <div key={f.id} className="rounded-xl border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold">
                    Yêu cầu #{f.round ?? i + 1} · {f.photo_label}
                  </p>
                  <StatusChip resolved={f.resolved} />
                </div>
                <ScrollText maxHeightClass="max-h-24" className="text-xs mt-1">{f.note}</ScrollText>
                <Thumbs urls={f.image_urls} />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-muted-foreground">{new Date(f.created_at).toLocaleString("vi-VN")}</span>
                  <button
                    type="button"
                    disabled={togglingId === f.id}
                    onClick={() => toggle(f)}
                    className="text-[11px] font-bold underline disabled:opacity-50"
                    style={{ color: accent }}
                  >
                    {f.resolved ? "Mở lại" : "Đã chỉnh xong"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientPanel({ booking, userId, accent, onChanged, notify }: Props) {
  const { list, reload } = useFeedback(booking.id);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [basedOn, setBasedOn] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const unresolved = list.filter((f) => !f.resolved).length;

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = (Array.from(e.target.files || []) as File[]).filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    const room = MAX_FEEDBACK_IMAGES - files.length;
    if (picked.length > room) notify(`Tối đa ${MAX_FEEDBACK_IMAGES} ảnh cho mỗi yêu cầu`);
    const ok = picked.slice(0, Math.max(0, room)).filter((f) => f.size <= MAX_FILE_BYTES);
    if (ok.length < Math.min(picked.length, Math.max(0, room))) notify("Có ảnh lớn hơn 15MB nên đã được bỏ qua");
    setFiles((prev) => [...prev, ...ok]);
  }

  function reuse(f: PhotoFeedback, n: number) {
    setLabel(f.photo_label === "Ảnh" ? "" : f.photo_label);
    setNote(f.note);
    setFiles([]);
    setBasedOn(n);
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function send() {
    if (!userId || !note.trim()) return;
    setSending(true);
    const up = await uploadFeedbackImages(files, userId, booking.id);
    if (up.error) {
      setSending(false);
      return notify(up.error);
    }
    const { error } = await addPhotoFeedback(booking.id, userId, label.trim() || "Ảnh", note.trim(), up.paths);
    if (error) {
      if (up.paths.length) await supabase.storage.from(FEEDBACK_BUCKET).remove(up.paths);
      setSending(false);
      return notify(error);
    }
    setSending(false);
    notify(`Đã gửi yêu cầu #${list.length + 1} cho photographer`);
    setLabel("");
    setNote("");
    setFiles([]);
    setBasedOn(null);
    await reload();
  }

  async function approve() {
    if (
      unresolved > 0 &&
      !confirm(`Còn ${unresolved} yêu cầu chưa được photographer đánh dấu "đã chỉnh". Bạn vẫn muốn hoàn tất lịch hẹn?`)
    ) {
      return;
    }
    setApproving(true);
    const err = await clientApproveHandover(booking.id);
    setApproving(false);
    if (err) return notify(err);
    notify("Cảm ơn bạn! Lịch hẹn đã hoàn tất");
    onChanged();
  }

  return (
    <div className="mt-2 space-y-2">
      {booking.drive_url ? (
        <a
          href={booking.drive_url}
          target="_blank"
          rel="noreferrer"
          className="block w-full py-2.5 rounded-xl text-xs font-bold text-center border"
          style={{ borderColor: accent, color: accent }}
        >
          Xem ảnh demo (Drive)
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">Photographer chưa gửi ảnh demo, bạn đợi chút nhé...</p>
      )}

      {list.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold">Các yêu cầu bạn đã gửi</p>
          {list.map((f, i) => {
            const n = f.round ?? i + 1;
            return (
              <div key={f.id} className="rounded-xl border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold">
                    Yêu cầu #{n} · {f.photo_label}
                  </p>
                  <StatusChip resolved={f.resolved} />
                </div>
                <ScrollText maxHeightClass="max-h-24" className="text-xs mt-1">{f.note}</ScrollText>
                <Thumbs urls={f.image_urls} />
                <button
                  type="button"
                  onClick={() => reuse(f, n)}
                  className="text-[11px] font-bold underline mt-1.5"
                  style={{ color: accent }}
                >
                  Sửa lại nội dung này để gửi tiếp
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div ref={composerRef} className="space-y-2">
        <p className="text-xs font-bold">
          Yêu cầu chỉnh sửa mới (#{list.length + 1})
          {basedOn != null && <span className="font-normal text-muted-foreground"> — dựa trên #{basedOn}</span>}
        </p>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Bạn muốn chỉnh ảnh nào? (vd: ảnh số 3, ảnh chụp đôi)"
          className="w-full rounded-xl border border-border px-3 py-2 text-xs"
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Bạn muốn photographer chỉnh sửa gì?"
          className="w-full rounded-xl border border-border px-3 py-2 text-xs min-h-[60px]"
        />
        <div className="flex flex-wrap items-center gap-2">
          {previews.map((u, i) => (
            <div key={u} className="relative">
              <img src={u} alt="Ảnh sẽ gửi" className="w-14 h-14 rounded-lg object-cover border border-border" />
              <button
                type="button"
                aria-label="Bỏ ảnh này"
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"
              >
                <X size={12} className="text-white" />
              </button>
            </div>
          ))}
          {files.length < MAX_FEEDBACK_IMAGES && (
            <label
              className="w-14 h-14 rounded-lg border border-dashed flex flex-col items-center justify-center cursor-pointer"
              style={{ borderColor: accent, color: accent }}
            >
              <Camera size={16} />
              <span className="text-[9px] font-bold mt-0.5">Thêm ảnh</span>
              <input type="file" accept="image/*" multiple onChange={pickFiles} className="hidden" />
            </label>
          )}
        </div>
        <button
          type="button"
          disabled={sending || !note.trim() || !userId}
          onClick={send}
          className="w-full py-2 rounded-xl text-xs font-bold border disabled:opacity-50"
          style={{ borderColor: accent, color: accent }}
        >
          {sending ? "Đang gửi..." : `Gửi yêu cầu #${list.length + 1}`}
        </button>
      </div>

      <button
        type="button"
        disabled={approving || !booking.drive_url}
        onClick={approve}
        className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
        style={{ background: accent }}
      >
        Mình hài lòng — hoàn tất lịch hẹn
      </button>
    </div>
  );
}

export function HandoverPanel(props: Props) {
  return props.role === "ptg" ? <PtgPanel {...props} /> : <ClientPanel {...props} />;
}
