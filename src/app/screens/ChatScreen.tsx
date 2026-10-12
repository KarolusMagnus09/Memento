import { ChevronLeft, Send, Phone, Video, MoreVertical, Image, Smile, Paperclip, Mic } from "lucide-react";
import type { Screen, Photographer } from "../types";
import { TEAL, TEAL_LIGHT, BG } from "../constants";
import { Avatar } from "../components/shared/Avatar";
import { useState } from "react";

export default function ChatScreen({ photographer, setScreen }: { photographer: Photographer; setScreen: (s: Screen) => void }) {
  const [msg, setMsg] = useState("");
  const messages = [
    { from: "them", text: "Chào bạn! Mình là Dương. Bạn muốn chụp gì vậy? 📷", time: "10:00" },
    { from: "me", text: "Chào anh! Mình muốn chụp ảnh cưới ạ. Gói nào phù hợp nhất?", time: "10:05" },
    { from: "them", text: "Tuyệt vời! Với ảnh cưới, mình recommend Gói Nâng Cao – full day, album cứng và drone shots nữa. Bạn cần thêm thông tin không?", time: "10:07" },
    { from: "me", text: "Giá $350 thì hơi cao không anh? 😅", time: "10:12" },
    { from: "them", text: "Mình có thể trao đổi thêm nha! Ngoài ra mình đang có ưu đãi 10% cho đám cưới tháng 11. Bạn có muốn đặt lịch tư vấn trực tiếp không? ☺️", time: "10:15" },
    { from: "me", text: "Được ạ! Mình sẽ đặt lịch ngay", time: "10:20" },
    { from: "them", text: "Mình sẽ đến địa điểm trước 15 phút nhé bạn!", time: "10:32" },
  ];

  return (
    <div className="flex flex-col h-screen" style={{ background: BG }}>
      {/* Header */}
      <div className="bg-white border-b border-border px-4 pt-12 pb-3 flex items-center gap-3">
        <button onClick={() => setScreen("messages")} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
        <div className="relative flex-shrink-0">
          <Avatar src={photographer.avatar} size={40} />
          <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white bg-green-400" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-sm" style={{ color: TEAL }}>{photographer.name}</p>
          <p className="text-xs text-green-500 font-semibold">Đang hoạt động</p>
        </div>
        <div className="flex gap-2">
          <button className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <Phone size={16} style={{ color: TEAL }} />
          </button>
          <button className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <Video size={16} style={{ color: TEAL }} />
          </button>
          <button className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <MoreVertical size={16} style={{ color: TEAL }} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        <div className="text-center">
          <span className="text-xs text-muted-foreground bg-white px-3 py-1.5 rounded-full border border-border">Hôm nay · 10:00 SA</span>
        </div>
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.from === "me" ? "flex-row-reverse" : ""}`}>
            {m.from === "them" && <Avatar src={photographer.avatar} size={28} className="mt-auto flex-shrink-0" />}
            <div className="max-w-[72%]">
              <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${m.from === "me" ? "rounded-br-sm text-white" : "rounded-bl-sm bg-white border border-border"}`}
                style={m.from === "me" ? { background: TEAL } : {}}>
                {m.text}
              </div>
              <p className={`text-xs text-muted-foreground mt-1 ${m.from === "me" ? "text-right" : ""}`}>{m.time}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick replies */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
        {["Xem portfolio 📸", "Xem giá 💰", "Đặt lịch ngay 📅"].map(q => (
          <button key={q} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border"
            style={{ borderColor: TEAL, color: TEAL, background: `${TEAL}10` }}>
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="bg-white border-t border-border px-4 py-3 pb-8 flex items-center gap-2">
        <button className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <Paperclip size={16} className="text-muted-foreground" />
        </button>
        <button className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <Image size={16} className="text-muted-foreground" />
        </button>
        <div className="flex-1 flex items-center gap-2 bg-muted rounded-2xl px-4 py-2.5">
          <input value={msg} onChange={e => setMsg(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none" placeholder="Nhắn tin..." />
          <button>
            <Smile size={16} className="text-muted-foreground" />
          </button>
        </div>
        {msg.trim() ? (
          <button className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: TEAL_LIGHT }}>
            <Send size={16} strokeWidth={2} className="text-white" />
          </button>
        ) : (
          <button className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <Mic size={16} className="text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

// PROFILE
