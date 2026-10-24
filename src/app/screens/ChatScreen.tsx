import { useBackHandler } from "../lib/backNavigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronLeft, MoreVertical, Send, Flag, Lock, ArrowDown } from "lucide-react";
import type { Screen } from "../types";
import { TEAL, TEAL_LIGHT, BG } from "../constants";
import { Avatar } from "../components/shared/Avatar";
import { ChatReportModal } from "../components/shared/ChatReportModal";
import {
  MAX_MESSAGE_LENGTH,
  dayKey,
  fetchConversations,
  fetchMessages,
  formatClock,
  formatDayLabel,
  markConversationRead,
  mergeMessages,
  reportConversation,
  sendMessage,
  subscribeConversation,
  type ChatMessage,
  type ChatTarget,
} from "../lib/chat";

type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "msg"; m: ChatMessage; mine: boolean; showAvatar: boolean; showMeta: boolean; isLastMine: boolean };

/** Hai tin liền nhau của cùng một người trong 5 phút thì gộp thành một cụm */
const GROUP_GAP_MS = 5 * 60 * 1000;

function PartnerAvatar({ target, size }: { target: ChatTarget; size: number }) {
  if (target.kind === "admin") {
    return (
      <span
        className="rounded-full flex items-center justify-center text-white font-black flex-shrink-0"
        style={{ width: size, height: size, background: TEAL, fontSize: size * 0.4 }}
      >
        M
      </span>
    );
  }
  return <Avatar src={target.partnerAvatar} size={size} />;
}

export default function ChatScreen({
  target,
  userId,
  backTo = "messages",
  setScreen,
  onRead,
}: {
  target: ChatTarget;
  userId: string;
  /** Màn quay về khi bấm nút Back */
  backTo?: Screen;
  setScreen: (s: Screen) => void;
  /** Gọi sau khi đánh dấu đã đọc, để App cập nhật badge */
  onRead?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [canSend, setCanSend] = useState(target.canSend);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useBackHandler(menuOpen, () => setMenuOpen(false));
  const [reportOpen, setReportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [newBelow, setNewBelow] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true); // đang ở đáy danh sách → tự cuộn khi có tin mới
  const forceBottomRef = useRef(true); // ép cuộn xuống đáy ở lần render kế tiếp
  const prependRef = useRef<{ h: number; top: number } | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const readTimer = useRef<number | undefined>(undefined);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  const isAdminThread = target.kind === "admin";
  // Admin thread: user được trả lời (sau SQL 035). Booking: theo canSend.
  const readOnly = isAdminThread ? false : !canSend;

  /* ── Đánh dấu đã đọc (gộp nhiều lần gọi, bỏ qua khi tab đang ẩn) ── */
  const markRead = useCallback(() => {
    window.clearTimeout(readTimer.current);
    readTimer.current = window.setTimeout(async () => {
      if (document.hidden) return;
      await markConversationRead(target.id);
      onReadRef.current?.();
    }, 250);
  }, [target.id]);

  /* ── Tải trang tin mới nhất ── */
  const loadLatest = useCallback(
    async (initial: boolean) => {
      const r = await fetchMessages(target.id);
      if (r.error) {
        if (initial) {
          setLoadError(r.error);
          setLoading(false);
        }
        return;
      }
      setLoadError(null);
      setMessages((prev) => mergeMessages(prev, r.messages));
      if (initial) {
        setHasMore(r.hasMore);
        forceBottomRef.current = true;
        setLoading(false);
      }
    },
    [target.id],
  );

  /* ── Cập nhật quyền gửi từ server (đơn có thể vừa kết thúc / vừa có đơn mới) ── */
  const refreshCanSend = useCallback(async () => {
    if (isAdminThread) return;
    const { items, error } = await fetchConversations();
    if (error) return;
    const me = items.find((c) => c.conversation_id === target.id);
    if (me) setCanSend(me.can_send);
  }, [target.id, isAdminThread]);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    await loadLatest(true);
    markRead();
  }, [loadLatest, markRead]);

  useEffect(() => {
    void initialLoad();
    void refreshCanSend();
    return () => window.clearTimeout(readTimer.current);
  }, [initialLoad, refreshCanSend]);

  /* ── Realtime: tin mới + "đã xem"; kết nối lại thì bù tin bị lỡ ── */
  useEffect(() => {
    const off = subscribeConversation(target.id, {
      onInsert: (m) => {
        setMessages((prev) => mergeMessages(prev, [m]));
        if (m.sender_id !== userId) markRead();
      },
      onUpdate: (m) => setMessages((prev) => mergeMessages(prev, [m])),
      onResync: () => {
        void loadLatest(false);
        void refreshCanSend();
        markRead();
      },
    });
    return off;
  }, [target.id, userId, loadLatest, markRead, refreshCanSend]);

  /* ── Quay lại tab: đọc tiếp + bù tin ── */
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return;
      markRead();
      void loadLatest(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead, loadLatest]);

  /* ── Thông báo nhỏ tự tắt ── */
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  /* ── Cuộn ── */
  const scrollToBottom = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickRef.current = true;
    setNewBelow(false);
  };

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (stickRef.current) setNewBelow(false);
  };

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || loading) return;

    // Vừa tải thêm tin cũ → giữ nguyên vị trí đang đọc
    if (prependRef.current) {
      el.scrollTop = el.scrollHeight - prependRef.current.h + prependRef.current.top;
      prependRef.current = null;
      return;
    }

    const last = messages[messages.length - 1];
    const lastId = last?.id ?? null;
    const changed = lastId !== lastIdRef.current;
    lastIdRef.current = lastId;

    if (forceBottomRef.current || (changed && stickRef.current)) {
      forceBottomRef.current = false;
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (changed && last && last.sender_id !== userId) setNewBelow(true);
  }, [messages, loading, userId]);

  async function loadOlder() {
    if (loadingMore || !hasMore || messages.length === 0) return;
    const el = listRef.current;
    setLoadingMore(true);
    const r = await fetchMessages(target.id, messages[0].created_at);
    setLoadingMore(false);
    if (r.error) {
      setNotice("Không tải được tin cũ hơn, bạn thử lại nhé");
      return;
    }
    setHasMore(r.hasMore);
    if (r.messages.length === 0) return;
    if (el) prependRef.current = { h: el.scrollHeight, top: el.scrollTop };
    setMessages((prev) => mergeMessages(prev, r.messages));
  }

  /* ── Gửi tin ── */
  async function doSend() {
    const body = text.trim();
    if (!body || sending || readOnly) return;
    if (body.length > MAX_MESSAGE_LENGTH) {
      setSendError(`Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự`);
      return;
    }
    setSending(true);
    setSendError(null);
    const { message, error } = await sendMessage(target.id, body);
    setSending(false);
    if (error || !message) {
      setSendError(error || "Chưa gửi được tin nhắn");
      void refreshCanSend();
      return;
    }
    setText("");
    forceBottomRef.current = true;
    setMessages((prev) => mergeMessages(prev, [message])); // Realtime gửi lại cùng id → tự gộp, không bị trùng
    inputRef.current?.focus();
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return; // đang gõ dấu tiếng Việt → không gửi
    // Điện thoại: Enter xuống dòng, gửi bằng nút. Máy tính: Enter gửi, Shift+Enter xuống dòng.
    if (!window.matchMedia("(hover: hover)").matches) return;
    e.preventDefault();
    void doSend();
  }

  // Ô nhập tự cao dần tới 5 dòng
  useLayoutEffect(() => {
    const t = inputRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
  }, [text, readOnly]);

  /* ── Gom tin thành các dòng hiển thị ── */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let lastDay = "";
    let lastMineId: string | null = null;
    for (const m of messages) if (m.sender_id === userId) lastMineId = m.id;
    messages.forEach((m, i) => {
      const d = dayKey(m.created_at);
      if (d !== lastDay) {
        out.push({ kind: "day", key: `${d}-${m.id}`, label: formatDayLabel(m.created_at) });
        lastDay = d;
      }
      const next = messages[i + 1];
      const sameGroupNext =
        !!next &&
        next.sender_id === m.sender_id &&
        dayKey(next.created_at) === d &&
        Date.parse(next.created_at) - Date.parse(m.created_at) < GROUP_GAP_MS;
      out.push({
        kind: "msg",
        m,
        mine: m.sender_id === userId,
        showAvatar: !sameGroupNext,
        showMeta: !sameGroupNext,
        isLastMine: m.id === lastMineId,
      });
    });
    return out;
  }, [messages, userId]);

  const len = text.length;

  return (
    <div className="flex flex-col" style={{ background: BG, height: "100dvh" }}>
      {/* Header */}
      <div className="relative bg-white border-b border-border px-4 pt-12 pb-3 flex items-center gap-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => setScreen(backTo)}
          aria-label="Quay lại"
          className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
        <PartnerAvatar target={target} size={40} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate" style={{ color: TEAL }}>{target.partnerName}</p>
          {isAdminThread && <p className="text-xs text-muted-foreground">Tin nhắn với Memento — bạn có thể trả lời</p>}
          {!isAdminThread && !canSend && <p className="text-xs text-muted-foreground">Chỉ xem lại</p>}
        </div>
        {!isAdminThread && (
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Tùy chọn"
              aria-expanded={menuOpen}
              className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
            >
              <MoreVertical size={16} style={{ color: TEAL }} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-white rounded-2xl border border-border shadow-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setReportOpen(true); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-red-600 text-left"
                  >
                    <Flag size={15} /> Báo cáo cuộc trò chuyện
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Thông báo nhỏ */}
      {notice && (
        <div className="px-4 py-2 text-xs font-semibold text-center text-white flex-shrink-0" style={{ background: TEAL }} role="status">
          {notice}
        </div>
      )}

      {/* Danh sách tin */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={listRef}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          className="absolute inset-0 overflow-y-auto overscroll-contain px-4 py-4 flex flex-col"
        >
          {loading && <p className="text-center text-sm text-muted-foreground py-10">Đang tải tin nhắn...</p>}

          {!loading && loadError && (
            <div className="text-center py-10">
              <p className="text-sm text-red-600 mb-3">Không tải được tin nhắn: {loadError}</p>
              <button
                type="button"
                onClick={() => void initialLoad()}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: TEAL }}
              >
                Thử lại
              </button>
            </div>
          )}

          {!loading && !loadError && hasMore && (
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={loadingMore}
              className="self-center mb-3 px-4 py-1.5 rounded-full text-xs font-semibold border bg-white disabled:opacity-60"
              style={{ borderColor: TEAL, color: TEAL }}
            >
              {loadingMore ? "Đang tải..." : "Tải tin cũ hơn"}
            </button>
          )}

          {!loading && !loadError && messages.length === 0 && (
            <div className="flex flex-col items-center py-16 text-center">
              <span className="text-5xl mb-3">💬</span>
              <p className="font-bold text-sm mb-1" style={{ color: TEAL }}>Chưa có tin nhắn nào</p>
              <p className="text-xs text-muted-foreground">
                {readOnly ? "Cuộc trò chuyện này chưa có nội dung." : "Hãy gửi lời chào đầu tiên."}
              </p>
            </div>
          )}

          {rows.map((r) => {
            if (r.kind === "day") {
              return (
                <div key={r.key} className="text-center my-2">
                  <span className="text-xs text-muted-foreground bg-white px-3 py-1.5 rounded-full border border-border">
                    {r.label}
                  </span>
                </div>
              );
            }
            const { m, mine, showAvatar, showMeta, isLastMine } = r;
            return (
              <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""} ${showMeta ? "mb-3" : "mb-0.5"}`}>
                {!mine && (showAvatar ? <PartnerAvatar target={target} size={28} /> : <span className="w-7 flex-shrink-0" />)}
                <div className="max-w-[75%] min-w-0">
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      mine ? "rounded-br-sm text-white" : "rounded-bl-sm bg-white border border-border"
                    }`}
                    style={{ ...(mine ? { background: TEAL } : {}), overflowWrap: "anywhere" }}
                  >
                    {m.body}
                  </div>
                  {showMeta && (
                    <p className={`text-xs text-muted-foreground mt-1 ${mine ? "text-right" : ""}`}>
                      {formatClock(m.created_at)}
                      {isLastMine && ` · ${m.read_at ? "Đã xem" : "Đã gửi"}`}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {newBelow && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold text-white shadow-lg"
            style={{ background: TEAL_LIGHT }}
          >
            <ArrowDown size={14} /> Tin nhắn mới
          </button>
        )}
      </div>

      {/* Ô nhập / thông báo chỉ xem */}
      {readOnly ? (
        <div
          className="bg-white border-t border-border px-5 py-4 flex items-start gap-3 flex-shrink-0"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
        >
          <Lock size={16} className="text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isAdminThread
              ? "Đây là tin nhắn từ Memento, bạn không thể trả lời tại đây."
              : "Hai bên chưa có đơn hợp lệ (đơn bị từ chối hoặc đã huỷ), nên bạn chỉ xem lại được tin nhắn. Khi có đơn mới, bạn sẽ nhắn tiếp được."}
          </p>
        </div>
      ) : (
        <div
          className="bg-white border-t border-border px-4 pt-3 flex-shrink-0"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
        >
          {sendError && <p className="text-xs text-red-600 mb-2" role="alert">{sendError}</p>}
          <div className="flex items-end gap-2">
            <div className="flex-1 bg-muted rounded-2xl px-4 py-2.5">
              <textarea
                ref={inputRef}
                value={text}
                rows={1}
                maxLength={MAX_MESSAGE_LENGTH}
                onChange={(e) => { setText(e.target.value); if (sendError) setSendError(null); }}
                onKeyDown={onKeyDown}
                placeholder="Nhắn tin..."
                aria-label="Nhập tin nhắn"
                className="w-full bg-transparent text-sm outline-none resize-none block"
                style={{ maxHeight: 120 }}
              />
            </div>
            <button
              type="button"
              onClick={() => void doSend()}
              disabled={!text.trim() || sending}
              aria-label="Gửi tin nhắn"
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
              style={{ background: TEAL_LIGHT }}
            >
              <Send size={16} strokeWidth={2} className="text-white" />
            </button>
          </div>
          {len >= 1800 && (
            <p className="text-[11px] text-right mt-1" style={{ color: len >= MAX_MESSAGE_LENGTH ? "#ef4444" : "#6b7280" }}>
              {len}/{MAX_MESSAGE_LENGTH}
            </p>
          )}
        </div>
      )}

      <ChatReportModal
        open={reportOpen}
        partnerName={target.partnerName}
        onClose={() => setReportOpen(false)}
        onSubmit={(description) => reportConversation(target.id, description)}
        onDone={(msg) => setNotice(msg)}
      />
    </div>
  );
}
