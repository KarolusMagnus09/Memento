import { useEffect, useRef, useSyncExternalStore } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Điều hướng "Back" (vuốt cạnh màn hình / nút Back của Android).
 *
 * Thứ tự xử lý mỗi lần Back:
 *   1. Popup / bottom sheet / menu đang mở  → đóng nó (component gọi useBackHandler)
 *   2. Đang ở màn con                       → lùi 1 màn (App.tsx đăng ký handler ưu tiên thấp nhất)
 *   3. Đã ở Trang chủ (hoặc Đăng nhập)      → hiện "Vuốt thêm lần nữa để thoát",
 *                                             vuốt tiếp trong EXIT_WINDOW_MS thì thoát app;
 *                                             hết thời gian thì thông báo tự tắt, vuốt lại sẽ hiện lại.
 *
 * Có 2 cách bắt sự kiện Back:
 *   - Native (Capacitor + plugin @capacitor/app): lắng nghe sự kiện "backButton". Chính xác nhất.
 *   - Dự phòng (trình duyệt / chưa cài plugin): giữ 1 mục "guard" trong history, bắt popstate.
 */

export const EXIT_WINDOW_MS = 3000;

/* ───────────── Registry handler ───────────── */

/** Trả về false = "không xử lý", để handler kế tiếp thử. Mọi giá trị khác = đã xử lý. */
type Handler = () => boolean | void;
type Entry = { id: number; priority: number; fn: Handler };

const entries: Entry[] = [];
let seq = 0;

export function registerBackHandler(fn: Handler, priority = 1): () => void {
  const entry: Entry = { id: ++seq, priority, fn };
  entries.push(entry);
  return () => {
    const i = entries.indexOf(entry);
    if (i >= 0) entries.splice(i, 1);
  };
}

/** Ưu tiên cao trước; cùng ưu tiên thì handler đăng ký SAU (popup mở sau) chạy trước. */
function runHandlers(): boolean {
  const list = [...entries].sort((a, b) => b.priority - a.priority || b.id - a.id);
  for (const e of list) {
    if (e.fn() !== false) return true;
  }
  return false;
}

/**
 * Đăng ký handler Back khi `active` = true (vd. popup đang mở).
 * Component chỉ render khi popup mở thì truyền active = true.
 */
export function useBackHandler(active: boolean, fn: Handler, priority = 1) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    return registerBackHandler(() => ref.current(), priority);
  }, [active, priority]);
}

/* ───────────── Thông báo "vuốt lần nữa để thoát" ───────────── */

let hintVisible = false;
const hintListeners = new Set<() => void>();
function setHint(v: boolean) {
  if (hintVisible === v) return;
  hintVisible = v;
  hintListeners.forEach((l) => l());
}
export function useExitHint(): boolean {
  return useSyncExternalStore(
    (cb) => {
      hintListeners.add(cb);
      return () => { hintListeners.delete(cb); };
    },
    () => hintVisible,
    () => false,
  );
}

/* ───────────── Bộ điều khiển ───────────── */

type AppPluginLike = {
  addListener(ev: "backButton", cb: () => void): Promise<{ remove: () => Promise<void> }>;
  exitApp(): Promise<void>;
};

let armed = false; // đang hiện thông báo, chờ vuốt lần 2
let timer: ReturnType<typeof setTimeout> | null = null;
let mode: "native" | "history" | null = null;
let appPlugin: AppPluginLike | null = null;

function disarm() {
  armed = false;
  if (timer) { clearTimeout(timer); timer = null; }
  setHint(false);
}

function armExit() {
  armed = true;
  setHint(true);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    disarm();
    if (mode === "history") ensureGuard(); // quay lại trạng thái có guard để lần vuốt sau hiện lại thông báo
  }, EXIT_WINDOW_MS);
}

/* --- Native --- */

function onNativeBack() {
  if (runHandlers()) { disarm(); return; }
  if (armed) {
    disarm();
    appPlugin?.exitApp().catch(() => {});
    return;
  }
  armExit();
}

/* --- History (dự phòng) --- */
// Lịch sử luôn là [base(0), guard(1)]. Người dùng đứng ở guard; Back đưa về base → popstate.
// Ở base mà vuốt tiếp thì WebView/trình duyệt không còn gì để lùi → app tự thoát.

const isGuard = () => (history.state as { __memento?: number } | null)?.__memento === 1;
const isBase = () => (history.state as { __memento?: number } | null)?.__memento === 0;

function ensureGuard() {
  if (!isGuard()) history.pushState({ __memento: 1 }, "");
}

function onPopState() {
  if (isGuard() || !isBase()) return;
  if (runHandlers()) {
    disarm();
    ensureGuard();
    return;
  }
  armExit(); // đứng yên ở base: vuốt tiếp là thoát
}

// Đang chờ vuốt lần 2 mà người dùng chạm vào màn hình → huỷ trạng thái chờ và dựng lại guard,
// nếu không lần Back kế tiếp sẽ thoát app ngoài ý muốn.
function onPointerDownWhileArmed() {
  if (!armed || mode !== "history") return;
  disarm();
  ensureGuard();
}

function installHistory(): () => void {
  mode = "history";
  let initialised = false;
  const init = () => {
    if (initialised) return;
    initialised = true;
    if (isGuard()) return; // tải lại trang: guard còn nguyên
    history.replaceState({ __memento: 0 }, "");
    history.pushState({ __memento: 1 }, "");
  };
  // Chrome/WebView bỏ qua mục history tạo ra khi người dùng chưa chạm vào trang,
  // nên chỉ dựng guard sau lần chạm đầu tiên.
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  const evs = ["pointerdown", "touchstart", "keydown"] as const;
  if (ua?.hasBeenActive) init();
  else evs.forEach((e) => window.addEventListener(e, init, { once: true, capture: true }));

  window.addEventListener("popstate", onPopState);
  window.addEventListener("pointerdown", onPointerDownWhileArmed, true);
  return () => {
    evs.forEach((e) => window.removeEventListener(e, init, true));
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("pointerdown", onPointerDownWhileArmed, true);
  };
}

/* --- Khởi động --- */

/** Gọi 1 lần khi app mount (BackExitHost làm việc này). Trả về hàm dọn. */
export function startBackNavigation(): () => void {
  let stopped = false;
  let teardown: (() => void) | null = null;
  let handle: { remove: () => Promise<void> } | null = null;

  const useHistoryFallback = () => {
    if (!stopped) teardown = installHistory();
  };

  if (Capacitor.isNativePlatform()) {
    try {
      appPlugin = registerPlugin<AppPluginLike>("App");
      appPlugin
        .addListener("backButton", onNativeBack)
        .then((h) => {
          if (stopped) { h.remove().catch(() => {}); return; }
          handle = h;
          mode = "native";
        })
        .catch(useHistoryFallback); // chưa cài/sync plugin @capacitor/app
    } catch {
      useHistoryFallback();
    }
  } else {
    useHistoryFallback();
  }

  return () => {
    stopped = true;
    disarm();
    teardown?.();
    handle?.remove().catch(() => {});
    mode = null;
  };
}
