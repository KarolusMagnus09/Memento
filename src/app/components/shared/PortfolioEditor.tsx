import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Plus, X, Trash2, Pencil, Check, ImagePlus } from "lucide-react";
import { ImageLightbox } from "./ImageLightbox";
import { ConfirmModal } from "./ConfirmModal";

export type PortfolioBoard = { id: string; name: string; private: boolean; cover: string; pins: string[] };

/** Chọn ảnh từ máy → trả về các blob: URL (upload thật sự khi bấm Lưu). */
export function pickImageFiles(onPicked: (urls: string[]) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.onchange = () => {
    const files = Array.from(input.files ?? []);
    if (files.length) onPicked(files.map(f => URL.createObjectURL(f)));
  };
  input.click();
}

const isLocal = (u: string) => u.startsWith("blob:") || u.startsWith("data:");

function Thumb({ url, onOpen, onRemove }: { url: string; onOpen: (u: string) => void; onRemove: () => void }) {
  return (
    <div className="relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer" onClick={() => onOpen(url)}>
      <img src={url} alt="" className="w-full h-full object-cover" />
      {isLocal(url) && (
        <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold px-1 rounded bg-black/60 text-white">Mới</span>
      )}
      <button type="button" aria-label="Xóa ảnh"
        onClick={e => { e.stopPropagation(); onRemove(); }}
        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
        <X size={11} className="text-white" />
      </button>
    </div>
  );
}

/**
 * Quản lý ảnh kiểu Pinterest: tạo board (đặt tên / đổi tên / xóa), thêm & xóa ảnh trong board,
 * và ảnh lẻ không thuộc board nào. Dùng cho cả Portfolio chụp ảnh lẫn Thuê & phụ kiện.
 */
export function PortfolioEditor({
  title, description, accent, accentSoft,
  createBoardLabel, addSingleLabel, boardPlaceholder, singleTitle,
  boards, setBoards, pins, setPins,
}: {
  title: string;
  description: string;
  accent: string;       // màu nhấn (nút, tiêu đề)
  accentSoft: string;   // màu viền nhạt
  createBoardLabel: string;
  addSingleLabel: string;
  boardPlaceholder: string;
  singleTitle: string;
  boards: PortfolioBoard[];
  setBoards: Dispatch<SetStateAction<PortfolioBoard[]>>;
  pins: string[];
  setPins: Dispatch<SetStateAction<string[]>>;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const total = pins.length + boards.reduce((n, b) => n + b.pins.length, 0);

  function createBoard() {
    const name = newName.trim();
    if (!name) return;
    setBoards(prev => [...prev, { id: `board-${Date.now()}`, name, private: false, cover: "", pins: [] }]);
    setNewName("");
    setCreating(false);
  }
  function renameBoard(id: string) {
    const name = editingName.trim();
    if (name) setBoards(prev => prev.map(b => (b.id === id ? { ...b, name } : b)));
    setEditingId(null);
  }
  function addToBoard(id: string, urls: string[]) {
    setBoards(prev => prev.map(b => (b.id === id ? { ...b, pins: [...b.pins, ...urls], cover: b.cover || urls[0] } : b)));
  }
  function removeFromBoard(id: string, url: string) {
    setBoards(prev => prev.map(b => {
      if (b.id !== id) return b;
      const next = b.pins.filter(p => p !== url);
      return { ...b, pins: next, cover: b.cover === url ? (next[0] ?? "") : b.cover };
    }));
  }

  const boardToDelete = boards.find(b => b.id === deleteId);

  return (
    <div className="space-y-3">
      <section className="bg-white rounded-2xl border p-4" style={{ borderColor: accentSoft }}>
        <p className="font-bold text-sm" style={{ color: accent }}>{title} ({total})</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">{description}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setCreating(true)}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2 flex items-center justify-center gap-1.5"
            style={{ borderColor: accent, color: accent }}>
            <Plus size={14} /> {createBoardLabel}
          </button>
          <button type="button" onClick={() => pickImageFiles(urls => setPins(prev => [...prev, ...urls]))}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5"
            style={{ background: accent }}>
            <ImagePlus size={14} /> {addSingleLabel}
          </button>
        </div>
      </section>

      {creating && (
        <section className="bg-white rounded-2xl border-2 p-4" style={{ borderColor: accent }}>
          <p className="font-bold text-sm mb-2" style={{ color: accent }}>{createBoardLabel}</p>
          <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === "Enter") createBoard(); }}
            className="w-full px-3 py-2.5 rounded-xl bg-muted text-sm outline-none mb-3" placeholder={boardPlaceholder} />
          <div className="flex gap-2">
            <button type="button" onClick={createBoard} disabled={!newName.trim()}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50" style={{ background: accent }}>Tạo</button>
            <button type="button" onClick={() => { setCreating(false); setNewName(""); }}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2" style={{ borderColor: accent, color: accent }}>Hủy</button>
          </div>
        </section>
      )}

      {boards.map(b => (
        <section key={b.id} className="bg-white rounded-2xl border p-4" style={{ borderColor: accentSoft }}>
          <div className="flex items-center gap-2 mb-2">
            {editingId === b.id ? (
              <>
                <input value={editingName} onChange={e => setEditingName(e.target.value)} autoFocus
                  onKeyDown={e => { if (e.key === "Enter") renameBoard(b.id); }}
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border text-sm font-bold" />
                <button type="button" aria-label="Lưu tên" onClick={() => renameBoard(b.id)} className="p-1" style={{ color: accent }}>
                  <Check size={16} />
                </button>
              </>
            ) : (
              <>
                <p className="flex-1 min-w-0 font-bold text-sm truncate" style={{ color: accent }}>
                  {b.name} <span className="text-[11px] font-normal text-muted-foreground">({b.pins.length})</span>
                </p>
                <button type="button" aria-label="Đổi tên board" onClick={() => { setEditingId(b.id); setEditingName(b.name); }}
                  className="p-1 text-muted-foreground"><Pencil size={14} /></button>
                <button type="button" aria-label="Xóa board" onClick={() => setDeleteId(b.id)}
                  className="p-1 text-red-400"><Trash2 size={14} /></button>
              </>
            )}
          </div>

          {b.pins.length === 0 ? (
            <p className="text-xs text-muted-foreground mb-2">Chưa có ảnh nào trong board này.</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {b.pins.map(url => <Thumb key={url} url={url} onOpen={setLightbox} onRemove={() => removeFromBoard(b.id, url)} />)}
            </div>
          )}
          <button type="button" onClick={() => pickImageFiles(urls => addToBoard(b.id, urls))}
            className="w-full text-xs font-bold py-2 rounded-xl border border-dashed text-center"
            style={{ borderColor: accent, color: accent }}>
            + Thêm ảnh vào board
          </button>
        </section>
      ))}

      <section className="bg-white rounded-2xl border p-4" style={{ borderColor: accentSoft }}>
        <p className="font-bold text-sm mb-2" style={{ color: accent }}>
          {singleTitle} <span className="text-[11px] font-normal text-muted-foreground">({pins.length})</span>
        </p>
        {pins.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có ảnh lẻ nào.</p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {pins.map(url => <Thumb key={url} url={url} onOpen={setLightbox} onRemove={() => setPins(prev => prev.filter(p => p !== url))} />)}
          </div>
        )}
      </section>

      {lightbox && (
        <ImageLightbox src={lightbox} liked={false} likeCount={0} showLike={false}
          onToggleLike={() => {}} onClose={() => setLightbox(null)} />
      )}

      {boardToDelete && (
        <ConfirmModal
          title="Xóa board?"
          message={`Board "${boardToDelete.name}" và ${boardToDelete.pins.length} ảnh trong đó sẽ bị gỡ khỏi hồ sơ sau khi bạn bấm Lưu cập nhật.`}
          onBackdropClick={() => setDeleteId(null)}
          actions={[
            { label: "Xóa board", variant: "danger", onClick: () => { setBoards(prev => prev.filter(x => x.id !== boardToDelete.id)); setDeleteId(null); } },
            { label: "Giữ lại", variant: "secondary", onClick: () => setDeleteId(null) },
          ]}
        />
      )}
    </div>
  );
}
