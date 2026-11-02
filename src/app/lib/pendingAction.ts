import { supabase } from "./supabase";

/**
 * Đánh dấu "người dùng đang làm việc gì" vào user_metadata trước khi gửi OTP,
 * để template email "Reset password" của Supabase đổi nội dung theo ngữ cảnh
 * (đọc bằng {{ .Data.pending_action }}).
 *
 * Cờ này CHỈ để đổi nội dung email. Quyền thật (xóa tài khoản, đổi mật khẩu...)
 * vẫn do server kiểm tra, không dựa vào cờ này.
 */
export type PendingAction = "delete_account" | "change_email" | "change_password";

let active: PendingAction | null = null;

/** Gọi TRƯỚC resetPasswordForEmail. Lỗi mạng thì bỏ qua (email sẽ ra nội dung mặc định). */
export async function setPendingAction(action: PendingAction): Promise<void> {
  if (active === action) return;
  try {
    const { error } = await supabase.auth.updateUser({ data: { pending_action: action } });
    if (!error) active = action;
  } catch { /* ignore */ }
}

/** Gọi khi xong / hủy / thoát màn. Không có cờ đang bật thì không gọi mạng. */
export async function clearPendingAction(): Promise<void> {
  if (!active) return;
  active = null;
  try {
    await supabase.auth.updateUser({ data: { pending_action: null } });
  } catch { /* ignore (phiên có thể đã bị thu hồi) */ }
}
