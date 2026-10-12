import { X, Heart } from "lucide-react";

// Modal xem ảnh full màn hình: nền sau bị làm tối (backdrop), ảnh nổi lên
// giữa màn hình, bấm X hoặc bấm ra ngoài ảnh để đóng — đúng kiểu "image
// lightbox" quen thuộc (Pinterest/Instagram). Icon tim đặt thẳng dưới ảnh,
// KHÔNG bọc trong khung/nền xám nào cả.
export function ImageLightbox({
  src, liked, likeCount, onToggleLike, onClose, showLike = true,
}: {
  src: string;
  liked: boolean;
  likeCount: number;
  onToggleLike: () => void;
  onClose: () => void;
  // Ẩn nút tim khi xem ảnh lúc CHƯA vào hồ sơ thật (vd: đang tải ảnh portfolio
  // lúc đăng ký) — mặc định vẫn hiện như cũ để không ảnh hưởng chỗ khác đang dùng.
  showLike?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
      onClick={onClose}>
      {/* Nút quay lại (góc trái) + đóng (góc phải) */}
      <button onClick={onClose}
        className="absolute top-6 left-5 h-9 px-3 rounded-full flex items-center gap-1.5 text-white text-sm font-semibold"
        style={{ background: "rgba(255,255,255,0.18)" }}>
        ← Quay lại
      </button>
      <button onClick={onClose}
        className="absolute top-6 right-5 w-9 h-9 rounded-full flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.15)" }}>
        <X size={18} className="text-white" strokeWidth={2.5} />
      </button>

      <img src={src} alt="" onClick={e => e.stopPropagation()}
        className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl" />

      {showLike && (
        <div className="flex items-center gap-2 mt-5" onClick={e => e.stopPropagation()}>
          <button onClick={onToggleLike}>
            <Heart size={30} strokeWidth={2}
              className={liked ? "text-red-500" : "text-white"}
              fill={liked ? "currentColor" : "none"} />
          </button>
          <span className="text-white text-sm font-semibold">{likeCount}</span>
        </div>
      )}
    </div>
  );
}
