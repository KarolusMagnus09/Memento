import { supabase } from "./supabase";

export type PasswordCheck = "ok" | "wrong" | "locked" | "error";

/**
 * Kiểm tra mật khẩu hiện tại của người đang đăng nhập (RPC verify_my_password).
 * Không dùng CAPTCHA và không tạo phiên mới, nên token CAPTCHA vẫn còn nguyên
 * để dùng cho việc gửi email OTP.
 */
export async function verifyMyPassword(password: string): Promise<{ result: PasswordCheck; message?: string }> {
  const { data, error } = await supabase.rpc("verify_my_password", { p_password: password });
  if (error) {
    if (/TOO_MANY_ATTEMPTS/.test(error.message)) return { result: "locked" };
    return { result: "error", message: error.message };
  }
  return { result: data === true ? "ok" : "wrong" };
}
