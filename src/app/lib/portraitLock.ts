/**
 * Giữ app ở chế độ dọc.
 * 1) Thử khóa thật bằng Screen Orientation API (PWA đã cài / toàn màn hình / một số webview).
 * 2) Luôn gắn html[data-rot] để CSS dự phòng (styles/portrait-lock.css) giữ khung dọc khi máy xoay ngang.
 * Khóa chắc chắn nhất cho app Android/iOS là cấu hình native (AndroidManifest, Info.plist).
 */
export function initPortraitLock(): void {
  if (typeof window === "undefined") return;

  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (t: string) => Promise<void> };
    void o?.lock?.("portrait")?.catch(() => {
      /* trình duyệt không cho khóa → dùng CSS dự phòng */
    });
  } catch {
    /* ignore */
  }

  const apply = () => {
    let angle = 0;
    try {
      if (screen.orientation && typeof screen.orientation.angle === "number") {
        angle = screen.orientation.angle;
      } else if (typeof (window as unknown as { orientation?: number }).orientation === "number") {
        angle = (window as unknown as { orientation: number }).orientation;
      }
    } catch {
      /* ignore */
    }
    const a = ((angle % 360) + 360) % 360;
    const el = document.documentElement;
    if (a === 90) el.setAttribute("data-rot", "ccw");
    else if (a === 270 || a === -90) el.setAttribute("data-rot", "cw");
    else el.removeAttribute("data-rot");
  };

  apply();
  try {
    screen.orientation?.addEventListener?.("change", apply);
  } catch {
    /* ignore */
  }
  window.addEventListener("orientationchange", apply);
  window.addEventListener("resize", apply);
}
