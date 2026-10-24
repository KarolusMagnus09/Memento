import { ChevronRight, ChevronLeft, Video, BookOpen } from "lucide-react";
import type { Screen } from "../types";
import { TEAL, TEAL_LIGHT, BG } from "../constants";
import { Toggle } from "../components/shared/Toggle";
import { useState } from "react";

export default function PrivacyScreen({ setScreen }: { setScreen: (s: Screen) => void }) {
  const [twoFA, setTwoFA] = useState(true);
  const [privateMode, setPrivateMode] = useState(false);
  const [showStatus, setShowStatus] = useState(true);

  return (
    <div className="flex flex-col min-h-full pb-10" style={{ background: BG }}>
      <div className="px-5 pt-12 pb-4 bg-white border-b border-border flex items-center gap-3">
        <button onClick={() => setScreen("profile")} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
        <h2 className="font-bold text-base" style={{ color: TEAL }}>Quyền riêng tư & Bảo mật</h2>
        <button className="ml-auto w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <BookOpen size={15} style={{ color: TEAL }} />
        </button>
      </div>

      <div className="px-5 mt-4 flex flex-col gap-4">
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b border-border">🔐 Bảo mật tài khoản</p>
          {[
            { icon: "🔑", label: "Đổi mật khẩu", action: <ChevronRight size={16} className="text-muted-foreground" /> },
            { icon: "🛡️", label: "Xác thực 2 yếu tố", action: <Toggle on={twoFA} onToggle={() => setTwoFA(!twoFA)} /> },
            { icon: "💻", label: "Thiết bị đã đăng nhập", sub: "3 thiết bị đang hoạt động", action: <ChevronRight size={16} className="text-muted-foreground" /> },
          ].map(({ icon, label, sub, action }) => (
            <div key={label} className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0">
              <span className="text-xl">{icon}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold">{label}</p>
                {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
              </div>
              {action}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b border-border">👁️ Quyền riêng tư</p>
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
            <span className="text-xl">🔒</span>
            <div className="flex-1">
              <p className="text-sm font-semibold">Chế độ riêng tư</p>
              <p className="text-xs text-muted-foreground">Chỉ người theo dõi mới xem được ảnh</p>
            </div>
            <Toggle on={privateMode} onToggle={() => setPrivateMode(!privateMode)} />
          </div>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="text-xl">🟢</span>
            <div className="flex-1">
              <p className="text-sm font-semibold">Hiển thị trạng thái</p>
              <p className="text-xs text-muted-foreground">Cho phép người khác thấy bạn trực tuyến</p>
            </div>
            <Toggle on={showStatus} onToggle={() => setShowStatus(!showStatus)} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b border-border">📂 Quản lý dữ liệu</p>
          <div className="flex gap-2 px-4 py-3">
            <button className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2 flex items-center justify-center gap-1"
              style={{ borderColor: TEAL, color: TEAL }}>
              ⬇️ Tải xuống
            </button>
            <button className="flex-1 py-2.5 rounded-xl text-xs font-bold border-2 border-destructive text-destructive flex items-center justify-center gap-1">
              🗑️ Xóa dữ liệu
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b border-border">📱 Quyền truy cập</p>
          {[
            { icon: "📷", label: "Máy ảnh", status: "Đã cho phép", ok: true },
            { icon: "📍", label: "Vị trí", status: "Khi dùng ứng dụng", ok: true },
            { icon: "🖼️", label: "Ảnh & Video", status: "Toàn bộ quyền", ok: true },
          ].map(({ icon, label, status, ok }) => (
            <div key={label} className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0">
              <span className="text-xl">{icon}</span>
              <p className="flex-1 text-sm font-semibold">{label}</p>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: ok ? (TEAL_LIGHT + "20") : "#e5e7eb", color: TEAL_LIGHT }}>{status}</span>
            </div>
          ))}
        </div>

        {/* Tóm tắt Chính sách quyền riêng tư (MEMENTO.docx · 21/09/2026) */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs font-bold mb-2" style={{ color: TEAL }}>Chính sách quyền riêng tư (tóm tắt)</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
            Memento thu thập thông tin tài khoản, hồ sơ, booking và dữ liệu kỹ thuật để vận hành dịch vụ, xác minh và cải thiện sản phẩm.
            Một số thông tin profile photographer có thể hiển thị công khai sau khi duyệt. Memento không bán dữ liệu cá nhân cho bên thứ ba.
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Bạn có thể yêu cầu truy cập, chỉnh sửa hoặc xóa thông tin phù hợp quy định pháp luật.
            Liên hệ: <span className="font-semibold" style={{ color: TEAL }}>privacy@memento.vn</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// QR code SVG placeholder
