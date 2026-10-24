import { Home, Search, Calendar, MessageCircle, User } from "lucide-react";
import type { Screen } from "../../types";
import { TEAL_LIGHT } from "../../constants";

export function BottomNav({
  tab,
  setTab,
  setScreen,
  unread = 0,
}: {
  tab: string;
  setTab: (t: string) => void;
  setScreen: (s: Screen) => void;
  /** Số tin chưa đọc — hiện badge trên tab "Tin nhắn" */
  unread?: number;
}) {
  const items = [
    { id: "home", label: "Trang chủ", icon: Home },
    { id: "search", label: "Khám phá", icon: Search },
    { id: "bookings", label: "Lịch hẹn", icon: Calendar },
    { id: "messages", label: "Tin nhắn", icon: MessageCircle },
    { id: "profile", label: "Hồ sơ", icon: User },
  ];
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm bg-white border-t border-border flex items-center justify-around px-2 py-2 z-50" style={{ boxShadow: "0 -4px 20px rgba(0,0,0,0.06)" }}>
      {items.map(({ id, label, icon: Icon }) => (
        <button key={id} onClick={() => { setTab(id); setScreen(id as Screen); }}
          aria-label={id === "messages" && unread > 0 ? `${label}, ${unread} tin chưa đọc` : label}
          className="flex flex-col items-center gap-0.5 min-w-[52px] py-1 px-2 rounded-xl transition-all"
          style={{ color: tab === id ? TEAL_LIGHT : "#9cac9c" }}>
          <span className="relative">
            <Icon size={22} strokeWidth={tab === id ? 2.5 : 1.8} />
            {id === "messages" && unread > 0 && (
              <span
                className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                style={{ background: "#ef4444" }}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </span>
          <span className="text-[10px] font-semibold">{label}</span>
        </button>
      ))}
    </nav>
  );
}
