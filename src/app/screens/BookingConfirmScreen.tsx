import { MessageCircle } from "lucide-react";
import type { Screen, Photographer } from "../types";
import { TEAL, TEAL_MID, TEAL_LIGHT, BG } from "../constants";
import { Avatar } from "../components/shared/Avatar";

export default function BookingConfirmScreen({ photographer, setScreen, setTab, pkg, price, bookingDate, bookingTime }:
  { photographer: Photographer; setScreen: (s: Screen) => void; setTab: (t: string) => void; pkg?: string; price?: number; bookingDate?: string; bookingTime?: string }) {
  const amount = price ?? 150;
  const note = encodeURIComponent(`Booking Memento - ${photographer.name} - ${bookingDate ?? "Oct 9, 2024"}`);
  const momoPhone = "0901234567";
  const momoLink = `momo://app?action=payWithApp&isScanQR=false&serviceType=transfer&target=${momoPhone}&targetType=phone&amount=${amount * 23000}&note=${note}&appId=memento`;

  return (
    <div className="flex flex-col min-h-screen px-6 pb-10 pt-14" style={{ background: BG }}>
      <div className="w-full max-w-sm mx-auto flex flex-col gap-4">
        {/* Success banner */}
        <div className="bg-white rounded-3xl p-6 border border-border shadow-sm text-center">
          <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-white text-3xl"
            style={{ background: `linear-gradient(135deg, ${TEAL_LIGHT} 0%, ${TEAL_MID} 100%)` }}>
            ✅
          </div>
          <h2 className="font-black text-xl mb-1" style={{ color: TEAL }}>Đặt lịch thành công!</h2>
          <p className="text-sm text-muted-foreground">Hãy thanh toán để hoàn tất lịch hẹn của bạn</p>
        </div>

        {/* Booking summary */}
        <div className="bg-white rounded-2xl p-4 border border-border">
          <div className="flex items-center gap-3 mb-3">
            <Avatar src={photographer.avatar} size={44} />
            <div>
              <p className="font-bold" style={{ color: TEAL }}>{photographer.name}</p>
              <p className="text-xs text-muted-foreground">{pkg ?? "Gói Cơ Bản"}</p>
            </div>
            <p className="ml-auto font-black text-lg" style={{ color: TEAL_LIGHT }}>${amount}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted rounded-xl p-3">
              <p className="text-xs text-muted-foreground">Ngày</p>
              <p className="font-bold text-sm">{bookingDate ?? "Oct 9, 2024"}</p>
            </div>
            <div className="bg-muted rounded-xl p-3">
              <p className="text-xs text-muted-foreground">Giờ</p>
              <p className="font-bold text-sm">{bookingTime ?? "02:00 PM"}</p>
            </div>
          </div>
        </div>

        {/* MoMo payment */}
        <div className="bg-white rounded-2xl p-4 border border-border">
          <p className="font-bold mb-1" style={{ color: TEAL }}>💜 Thanh toán qua MoMo</p>
          <p className="text-xs text-muted-foreground mb-3">
            Nhấn bên dưới để mở MoMo — thông tin lịch hẹn đã được điền sẵn. Bạn tự bấm <strong>Xác nhận</strong> trong MoMo.
          </p>
          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground mb-3">
            {[
              { label: "Người nhận", val: `${photographer.name} · ${momoPhone}` },
              { label: "Số tiền", val: `${(amount * 23000).toLocaleString("vi-VN")} VND (~$${amount})` },
              { label: "Nội dung", val: `Booking Memento · ${bookingDate ?? "Oct 9, 2024"}` },
            ].map(({ label, val }) => (
              <div key={label} className="flex justify-between gap-2">
                <span>{label}:</span>
                <span className="font-semibold text-right" style={{ color: TEAL }}>{val}</span>
              </div>
            ))}
          </div>
          <a
            href={momoLink}
            onClick={e => { e.preventDefault(); alert("Sẽ mở app MoMo với thông tin đã điền sẵn. Bạn tự bấm Xác nhận trong MoMo."); }}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-white active:scale-95 transition-transform"
            style={{ background: "linear-gradient(135deg, #ae2070 0%, #d82d8b 100%)", display: "flex" }}>
            <span className="text-2xl">🟣</span>
            Mở MoMo để thanh toán
          </a>
          <p className="text-center text-[11px] text-muted-foreground mt-2">
            Bạn vẫn tự xác nhận lần cuối trong MoMo · Memento không thu tiền trực tiếp
          </p>
        </div>

        {/* Secondary actions */}
        <div className="flex gap-3">
          <button onClick={() => setScreen("chat")}
            className="flex-1 py-3 rounded-2xl font-bold border-2 flex items-center justify-center gap-1.5 text-sm"
            style={{ borderColor: TEAL, color: TEAL }}>
            <MessageCircle size={16} /> Chat
          </button>
          <button onClick={() => { setTab("bookings"); setScreen("bookings"); }}
            className="flex-1 py-3 rounded-2xl font-bold text-white text-sm"
            style={{ background: TEAL }}>
            Lịch đặt của tôi
          </button>
        </div>
      </div>
    </div>
  );
}
