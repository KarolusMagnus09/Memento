// Chuẩn hoá và kiểm tra số điện thoại di động Việt Nam.
// Chấp nhận các dạng người dùng hay gõ: "0901234567", "84901234567",
// "+84 90 123 4567", có khoảng trắng/dấu gạch ngang đều được dọn sạch.
const VN_MOBILE_PREFIXES = /^(3[2-9]|5[689]|7[06-9]|8[1-9]|9\d)\d{7}$/;

/** Trả về dạng chuẩn "+84xxxxxxxxx" nếu hợp lệ, ngược lại null. */
export function normalizeVnPhone(raw: string): string | null {
  const digits = raw.replace(/[\s.\-()]/g, "");
  let national: string | null = null;
  if (/^\+?84\d{9}$/.test(digits)) national = digits.replace(/^\+?84/, "");
  else if (/^0\d{9}$/.test(digits)) national = digits.slice(1);
  if (!national || !VN_MOBILE_PREFIXES.test(national)) return null;
  return `+84${national}`;
}

export function isValidVnPhone(raw: string): boolean {
  return normalizeVnPhone(raw) !== null;
}

/** Diễn giải lỗi từ Supabase phone-OTP API sang tiếng Việt dễ hiểu. */
export function describePhoneAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid otp") || lower.includes("token has expired") || lower.includes("invalid token"))
    return "Mã xác minh không đúng hoặc đã hết hạn.";
  if (lower.includes("sms") || lower.includes("provider") || lower.includes("unsupported phone provider"))
    return "Hệ thống chưa gửi được SMS lúc này. Vui lòng thử lại sau hoặc bỏ qua bước này.";
  if (lower.includes("rate limit") || lower.includes("for security purposes"))
    return "Bạn thao tác quá nhanh, vui lòng chờ một chút rồi thử lại.";
  if (lower.includes("already") && lower.includes("registered"))
    return "Số điện thoại này đã được dùng cho một tài khoản khác.";
  return "Có lỗi xảy ra, vui lòng thử lại.";
}
