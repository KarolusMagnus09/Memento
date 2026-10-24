// Yêu cầu mật khẩu: tối thiểu 8 ký tự, có chữ hoa, chữ thường và số,
// và không được chứa ký tự có dấu tiếng Việt (á, à, ă, ạ, â, đ...).
export const PASSWORD_HINT = "Mật khẩu cần tối thiểu 8 ký tự, gồm ít nhất 1 chữ hoa, 1 chữ thường, 1 chữ số, và không chứa dấu tiếng Việt.";

// Bắt cả 2 dạng Unicode: ký tự có dấu đã ghép sẵn (NFC, vd "á") lẫn dạng
// tách rời chữ cái + dấu riêng (NFD, vd "a" + dấu sắc ghép sau) — một số
// bàn phím/gõ tiếng Việt có thể tạo ra dạng NFD mà mắt thường nhìn giống hệt.
const VIETNAMESE_DIACRITIC_MARK = /[\u0300-\u036f]/;
// "đ"/"Đ" không tách được thành chữ cái + dấu (không phải ký tự ghép),
// nên phải kiểm tra riêng.
const D_WITH_STROKE = /[đĐ]/;

function containsVietnameseDiacritics(pw: string): boolean {
  return VIETNAMESE_DIACRITIC_MARK.test(pw.normalize("NFD")) || D_WITH_STROKE.test(pw);
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 8) return "Mật khẩu cần tối thiểu 8 ký tự.";
  if (!/[a-z]/.test(pw)) return "Mật khẩu cần có ít nhất 1 chữ thường.";
  if (!/[A-Z]/.test(pw)) return "Mật khẩu cần có ít nhất 1 chữ hoa.";
  if (!/[0-9]/.test(pw)) return "Mật khẩu cần có ít nhất 1 chữ số.";
  if (containsVietnameseDiacritics(pw)) return "Mật khẩu không được chứa ký tự có dấu tiếng Việt (á, à, ă, đ...).";
  return null;
}
