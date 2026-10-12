import { Search } from "lucide-react";
import type { Screen, Photographer } from "../types";
import { TEAL, TEAL_LIGHT, BG, conversationsMock } from "../constants";
import { Avatar } from "../components/shared/Avatar";

export default function MessagesScreen({ setScreen, setChatPartner, photographers }: { setScreen: (s: Screen) => void; setChatPartner: (p: Photographer) => void; photographers: Photographer[] }) {
  const conversations = conversationsMock
    .map((c, i) => photographers[i] ? { ...c, photographer: photographers[i] } : null)
    .filter((c): c is (typeof conversationsMock[number] & { photographer: Photographer }) => c !== null);
  return (
    <div className="flex flex-col min-h-screen pb-24" style={{ background: BG }}>
      <div className="px-5 py-3 relative" style={{ background: TEAL }}>
        <h2 className="font-bold text-base text-white mb-2">Tin nhắn</h2>
        <div className="flex items-center gap-2 bg-white rounded-2xl px-4 py-2.5 shadow-md">
          <Search size={14} className="text-muted-foreground" />
          <input className="flex-1 bg-transparent text-sm outline-none text-foreground" placeholder="Tìm cuộc trò chuyện..." />
        </div>
      </div>

      <div className="px-4 mt-3">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <span className="text-6xl mb-3">💬</span>
            <h3 className="font-bold mb-1" style={{ color: TEAL }}>Chưa có tin nhắn nào</h3>
            <p className="text-sm text-muted-foreground">Đặt lịch và bắt đầu trò chuyện với nhiếp ảnh gia!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {conversations.map(c => (
              <button key={c.id} onClick={() => { setChatPartner(c.photographer); setScreen("chat"); }}
                className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-border active:bg-muted transition-colors text-left w-full">
                <div className="relative flex-shrink-0">
                  <Avatar src={c.photographer.avatar} size={50} />
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white bg-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-sm">{c.photographer.name}</p>
                    <p className="text-xs text-muted-foreground">{c.time}</p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{c.lastMsg}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.photographer.specialty}</p>
                </div>
                {c.unread > 0 && (
                  <span className="w-5 h-5 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                    style={{ background: TEAL_LIGHT }}>
                    {c.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
