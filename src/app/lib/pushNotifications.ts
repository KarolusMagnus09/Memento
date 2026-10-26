import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "./supabase";

/**
 * Push điện thoại (FCM). Chỉ chạy khi là app Android/iOS thật; trình duyệt bỏ qua.
 * Token được lưu vào bảng device_tokens (qua RPC register_device_token) để Edge Function `send-push`
 * gửi thông báo tới đúng thiết bị — kể cả khi app đang tắt.
 */
const isNative = () => Capacitor.isNativePlatform();

let currentToken: string | null = null;
let listenersReady = false;
let onTapHandler: ((data: Record<string, string>) => void) | null = null;

async function saveToken(token: string) {
  currentToken = token;
  const { error } = await supabase.rpc("register_device_token", {
    p_token: token,
    p_platform: Capacitor.getPlatform(),
  });
  if (error) console.warn("[push] lưu token lỗi", error.message);
}

export async function registerPush(onTap: (data: Record<string, string>) => void): Promise<void> {
  if (!isNative()) return;
  onTapHandler = onTap;
  try {
    if (!listenersReady) {
      listenersReady = true;
      await PushNotifications.addListener("registration", (t) => void saveToken(t.value));
      await PushNotifications.addListener("registrationError", (e) => console.warn("[push] đăng ký lỗi", e));
      // Bấm vào thông báo trên thanh trạng thái → mở đúng màn
      await PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
        const data = (a.notification?.data ?? {}) as Record<string, string>;
        onTapHandler?.(data);
      });
    }
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return;
    await PushNotifications.register();
  } catch (e) {
    console.warn("[push] init lỗi", e);
  }
}

/** Gọi TRƯỚC khi đăng xuất để máy này không còn nhận thông báo của tài khoản cũ */
export async function unregisterPush(): Promise<void> {
  if (!isNative() || !currentToken) return;
  try {
    await supabase.rpc("unregister_device_token", { p_token: currentToken });
  } catch {
    /* ignore */
  }
}

export async function signOutSafely(): Promise<void> {
  await unregisterPush();
  await supabase.auth.signOut();
}
