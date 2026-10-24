/** Cài đặt thông báo — lưu trên thiết bị (localStorage) để app đọc lại được. */
export type NotifPrefs = {
  master: boolean;
  orderAccepted: boolean;
  newMessage: boolean;
  reminderOn: boolean;
  reminders: { dayBefore: boolean; hours4: boolean; hours24: boolean };
};

const KEY = "memento:notif-prefs:v1";

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  master: true,
  orderAccepted: true,
  newMessage: true,
  reminderOn: true,
  reminders: { dayBefore: true, hours4: true, hours24: true },
};

export function loadNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_NOTIF_PREFS;
    const p = JSON.parse(raw) as Partial<NotifPrefs>;
    return {
      ...DEFAULT_NOTIF_PREFS,
      ...p,
      reminders: { ...DEFAULT_NOTIF_PREFS.reminders, ...(p.reminders || {}) },
    };
  } catch {
    return DEFAULT_NOTIF_PREFS;
  }
}

export function saveNotifPrefs(p: NotifPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Có nên báo khi có tin nhắn mới không */
export function messageNotifEnabled(): boolean {
  const p = loadNotifPrefs();
  return p.master && p.newMessage;
}

/** Trạng thái quyền thông báo của trình duyệt */
export function browserNotifState(): "granted" | "denied" | "default" | "unsupported" {
  try {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission;
  } catch {
    return "unsupported";
  }
}

/** Xin quyền thông báo của trình duyệt (chỉ gọi khi người dùng chủ động bật) */
export async function askBrowserNotifPermission() {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  } catch {
    /* ignore */
  }
}
