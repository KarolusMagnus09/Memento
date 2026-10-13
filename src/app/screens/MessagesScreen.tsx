import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { Screen } from "../types";
import { TEAL, TEAL_LIGHT, BG } from "../constants";
import { Avatar } from "../components/shared/Avatar";
import {
  conversationToTarget,
  fetchConversations,
  formatListTime,
  subscribeInbox,
  type ChatTarget,
  type ConversationItem,
} from "../lib/chat";

/** Bỏ dấu để tìm "duong" ra "Dương" */
const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export default function MessagesScreen({
  userId,
  onOpenChat,
}: {
  userId: string;
  onOpenChat: (target: ChatTarget, from?: Screen) => void;
}) {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const seq = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    const my = ++seq.current;
    const r = await fetchConversations();
    if (my !== seq.current) return; // đã có lần tải mới hơn
    if (r.error) {
      setError(r.error);
    } else {
      setError(null);
      setItems(r.items);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();

    // Có tin mới / có người đọc → tải lại danh sách (gộp nhiều sự kiện liên tiếp)
    const schedule = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void load(), 300);
    };
    const off = subscribeInbox(userId, { onIncoming: () => {}, onChange: schedule });

    const onVisible = () => {
      if (!document.hidden) void load();
    };
    const onOnline = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      off();
      window.clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [userId, load]);

  const shown = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return items;
    return items.filter((c) => norm(c.partner_name).includes(q) || norm(c.last_body ?? "").includes(q));
  }, [items, query]);

  return (
    <div className="flex flex-col min-h-screen pb-24" style={{ background: BG }}>
      <div className="px-5 py-3 relative" style={{ background: TEAL }}>
        <h2 className="font-bold text-base text-white mb-2">Tin nhắn</h2>
        <div className="flex items-center gap-2 bg-white rounded-2xl px-4 py-2.5 shadow-md">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none text-foreground"
            placeholder="Tìm cuộc trò chuyện..."
            aria-label="Tìm cuộc trò chuyện"
          />
        </div>
      </div>

      <div className="px-4 mt-3">
        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-16">Đang tải tin nhắn...</p>
        ) : error && items.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <p className="text-sm text-red-600 mb-3">Không tải được tin nhắn: {error}</p>
            <button
              type="button"
              onClick={() => { setLoading(true); void load(); }}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white"
              style={{ background: TEAL }}
            >
              Thử lại
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <span className="text-6xl mb-3">💬</span>
            <h3 className="font-bold mb-1" style={{ color: TEAL }}>
              {query.trim() ? "Không tìm thấy cuộc trò chuyện" : "Chưa có tin nhắn nào"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {query.trim() ? "Thử tìm bằng tên khác nhé." : "Đặt lịch với nhiếp ảnh gia, rồi bấm Chat trong mục Lịch hẹn để trò chuyện."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {shown.map((c) => {
              const unread = c.unread_count > 0;
              const mine = c.last_sender_id === userId;
              const preview = c.last_body ? `${mine ? "Bạn: " : ""}${c.last_body}` : "Chưa có tin nhắn";
              return (
                <button
                  key={c.conversation_id}
                  type="button"
                  onClick={() => onOpenChat(conversationToTarget(c), "messages")}
                  className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-border active:bg-muted transition-colors text-left w-full"
                >
                  {c.kind === "admin" ? (
                    <span
                      className="w-[50px] h-[50px] rounded-full flex items-center justify-center text-white font-black text-lg flex-shrink-0"
                      style={{ background: TEAL }}
                    >
                      M
                    </span>
                  ) : (
                    <Avatar src={c.partner_avatar} size={50} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${unread ? "font-black" : "font-bold"}`}>{c.partner_name}</p>
                      <p className="text-xs text-muted-foreground flex-shrink-0">{formatListTime(c.last_at)}</p>
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {preview}
                    </p>
                    {c.kind === "booking" && !c.can_send && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">Chỉ xem lại</p>
                    )}
                  </div>
                  {unread && (
                    <span
                      className="min-w-5 h-5 px-1.5 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                      style={{ background: TEAL_LIGHT }}
                    >
                      {c.unread_count > 99 ? "99+" : c.unread_count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
