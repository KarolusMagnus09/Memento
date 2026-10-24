import { Capacitor } from "@capacitor/core";
import { FirebaseAnalytics } from "@capacitor-firebase/analytics";

/** Chỉ gửi khi chạy trong app Android/iOS thật. Trình duyệt và localhost bị bỏ qua. */
const isNative = () => Capacitor.isNativePlatform();

export async function initAnalytics(): Promise<void> {
  if (!isNative()) return;
  try {
    await FirebaseAnalytics.setEnabled({ enabled: true });
    await FirebaseAnalytics.logEvent({ name: "app_open_custom" });
  } catch (e) {
    console.warn("[analytics] init lỗi", e);
  }
}

export async function setAnalyticsUser(userId: string | null): Promise<void> {
  if (!isNative()) return;
  try {
    await FirebaseAnalytics.setUserId({ userId });
  } catch (e) {
    console.warn("[analytics] setUserId lỗi", e);
  }
}

export async function trackBookingPaid(bookingId: string, amount: number): Promise<void> {
  if (!isNative()) return;
  try {
    await FirebaseAnalytics.logEvent({
      name: "booking_paid",
      params: { booking_id: bookingId, value: amount, currency: "VND" },
    });
  } catch (e) {
    console.warn("[analytics] logEvent lỗi", e);
  }
}
