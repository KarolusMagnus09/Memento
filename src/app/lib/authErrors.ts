// ── Dịch lỗi Supabase (tiếng Anh, có phần động như số giây) sang tiếng Việt ──
export function translateAuthError(message: string): string {
  const rules: { test: RegExp; vi: (m: RegExpMatchArray) => string }[] = [
    { test: /password should be at least (\d+) characters?/i, vi: (m) => `Mật khẩu tối thiểu ${m[1]} ký tự.` },
    { test: /password should contain at least one character of each/i, vi: () => "Mật khẩu cần có đủ chữ thường, chữ hoa và số." },
    { test: /user already registered/i, vi: () => "Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác." },
    { test: /user is banned|user_banned/i, vi: () => "Tài khoản này đã bị khóa. Liên hệ hỗ trợ nếu bạn cho rằng đây là nhầm lẫn." },
    { test: /invalid login credentials/i, vi: () => "Email hoặc mật khẩu không đúng." },
    { test: /email not confirmed/i, vi: () => "Email chưa được xác nhận. Kiểm tra hộp thư của bạn." },
    { test: /unable to validate email address/i, vi: () => "Định dạng email không hợp lệ." },
    { test: /token has expired or is invalid/i, vi: () => "Mã xác nhận đã hết hạn hoặc không đúng." },
    { test: /invalid otp/i, vi: () => "Mã xác nhận không đúng." },
    { test: /for security purposes.*after (\d+) seconds/i, vi: (m) => `Vì lý do bảo mật, vui lòng chờ ${m[1]} giây rồi thử lại.` },
    { test: /captcha protection/i, vi: () => "Vui lòng hoàn thành xác minh CAPTCHA." },
    { test: /email rate limit exceeded/i, vi: () => "Đã gửi quá nhiều email, vui lòng thử lại sau ít phút." },
    { test: /rate limit/i, vi: () => "Bạn thao tác quá nhanh, vui lòng thử lại sau." },
    { test: /same password/i, vi: () => "Mật khẩu mới phải khác mật khẩu cũ." },
    { test: /signups?\s*(is|are)?\s*disabled/i, vi: () => "Tính năng đăng ký hiện đang tắt." },
    { test: /duplicate key value violates unique constraint.*username/i, vi: () => "Tên tài khoản này đã có người sử dụng." },
    { test: /database error saving new user/i, vi: () => "Tên tài khoản này đã có người sử dụng, vui lòng thử tên khác." },
    { test: /a user with this email address has already been registered/i, vi: () => "Email này đã được đăng ký cho tài khoản khác." },
  ];
  for (const r of rules) {
    const m = message.match(r.test);
    if (m) return r.vi(m);
  }
  // Không nhận diện được lỗi cụ thể — TUYỆT ĐỐI không in lỗi gốc ra giao
  // diện (dễ lộ chi tiết backend như tên hàm, tên bảng, thông tin schema).
  // Log lỗi thật ra console để debug, còn người dùng chỉ thấy thông báo
  // chung chung, an toàn.
  // eslint-disable-next-line no-console
  console.error("Lỗi chưa được dịch:", message);
  return "Đã có lỗi xảy ra, vui lòng thử lại.";
}
