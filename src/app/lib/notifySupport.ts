import emailjs from "@emailjs/browser";

const EMAILJS_SERVICE_ID = "service_f2sph86";
const EMAILJS_TEMPLATE_ID = "template_s2j4wug";
const EMAILJS_PUBLIC_KEY = "ATfzf7zUhhyxQGRws";
const SUPPORT_EMAIL = "mementoffical@gmail.com";

export type PriceGroupMail = {
  title: string;
  category?: string;
  lines: { name: string; price: string; detail?: string }[];
};

export type NotifyApplicationParams = {
  fullName: string;
  phone: string;
  email?: string | null;
  birthDate?: string;
  locations: string[];
  styles: string[];
  proofLink: string;
  bio: string;
  experience?: string;
  styleDescription?: string;
  equipment?: string;
  languages?: string[];
  workModel?: string;
  skillMakeup?: boolean;
  skillEdit?: boolean;
  skillRental?: boolean;
  priceGroups?: PriceGroupMail[];
  userId: string;
  avatarUrl?: string;
  bannerUrl?: string;
  cccdFrontUrl?: string;
  cccdBackUrl?: string;
  portfolioUrls?: string[];
};

function line(label: string, value: string | undefined | null) {
  if (!value || !String(value).trim()) return null;
  return `${label}: ${value}`;
}

/**
 * Gửi hồ sơ PTG mới tới Gmail support (EmailJS).
 * Template: title, message, name, email, time
 *
 * Duyệt/từ chối: mở app với tài khoản admin → menu "Duyệt hồ sơ PTG"
 * (EmailJS không hỗ trợ nút Approve/Reject gọi thẳng Supabase).
 */
export async function notifySupportNewApplication(
  params: NotifyApplicationParams
): Promise<{ sent: boolean; error?: string }> {
  const priceBlock =
    params.priceGroups && params.priceGroups.length > 0
      ? [
          "",
          "—— BẢNG GIÁ ——",
          ...params.priceGroups.flatMap((g) => [
            `• ${g.title || "Mục"}${g.category ? ` [${g.category}]` : ""}`,
            ...g.lines.map(
              (l) =>
                `   - ${l.name}${l.detail ? ` (${l.detail})` : ""}: ${l.price || "—"}`
            ),
          ]),
        ]
      : [];

  const skills = [
    params.skillMakeup ? "Makeup" : null,
    params.skillEdit ? "Edit ảnh" : null,
    params.skillRental ? "Thuê & phụ kiện" : null,
  ].filter(Boolean);

  const portfolio = (params.portfolioUrls || []).filter(Boolean);

  const body = [
    "══════════════════════════════════",
    "  HỒ SƠ NHIẾP ẢNH GIA MỚI — MEMENTO",
    "══════════════════════════════════",
    "",
    "—— THÔNG TIN CÁ NHÂN ——",
    line("Họ tên", params.fullName),
    line("SĐT", params.phone),
    line("Email", params.email),
    line("Ngày sinh", params.birthDate),
    line("Khu vực", params.locations?.join(", ")),
    line("Kinh nghiệm", params.experience),
    line("Thiết bị", params.equipment),
    line("Ngôn ngữ", params.languages?.join(", ")),
    line(
      "Mô hình",
      params.workModel === "team"
        ? "Team"
        : params.workModel === "solo"
          ? "Solo"
          : params.workModel
    ),
    line("Skill phụ", skills.length ? skills.join(", ") : "Không"),
    "",
    "—— PHÂN LOẠI & PHONG CÁCH ——",
    line("Phân loại chụp", params.styles?.join(", ")),
    line("Kinh nghiệm / phong cách", params.styleDescription),
    line("Giới thiệu (bio)", params.bio),
    "",
    "—— LINK MINH CHỨNG (FB / Instagram / …) ——",
    params.proofLink?.trim()
      ? `🔗 ${params.proofLink.trim()}`
      : "(chưa gửi link)",
    ...priceBlock,
    "",
    "—— ẢNH ĐẠI DIỆN ——",
    params.avatarUrl ? `📷 ${params.avatarUrl}` : "(chưa có)",
    "",
    "—— ẢNH BÌA (BANNER) ——",
    params.bannerUrl ? `🖼️ ${params.bannerUrl}` : "(chưa có)",
    "",
    `—— PORTFOLIO (${portfolio.length} ảnh) ——`,
    ...(portfolio.length
      ? portfolio.map((u, i) => `${i + 1}. ${u}`)
      : ["(chưa upload portfolio)"]),
    "",
    "—— CCCD (chỉ support xem) ——",
    params.cccdFrontUrl ? `Mặt trước: ${params.cccdFrontUrl}` : "Mặt trước: (chưa có)",
    params.cccdBackUrl ? `Mặt sau: ${params.cccdBackUrl}` : "Mặt sau: (chưa có)",
    "",
    "—— CÁCH DUYỆT ——",
    `user_id: ${params.userId}`,
    "1) Đăng nhập app Memento bằng tài khoản admin",
    "2) Hồ sơ → Duyệt hồ sơ PTG → Đồng ý / Từ chối (+ ghi chú)",
    "Hoặc Supabase Table Editor → photographer_applications",
    "   status = approved | rejected + admin_note",
  ]
    .filter((x) => x !== null)
    .join("\n");

  // Rút gọn nếu body quá dài (EmailJS/Gmail limit)
  const maxLen = 45000;
  const message = body.length > maxLen ? body.slice(0, maxLen) + "\n…(đã rút gọn)" : body;

  try {
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        title: `[Memento] Hồ sơ PTG mới: ${params.fullName}`,
        message,
        name: params.fullName || "Photographer applicant",
        email: params.email || SUPPORT_EMAIL,
        time: new Date().toLocaleString("vi-VN"),
        to_email: SUPPORT_EMAIL,
      },
      { publicKey: EMAILJS_PUBLIC_KEY }
    );
    return { sent: true };
  } catch (err) {
    const msg =
      err && typeof err === "object" && "text" in err
        ? String((err as { text?: string }).text)
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("[notifySupport] EmailJS error:", msg, err);
    return { sent: false, error: msg };
  }
}

/** Gửi kết quả duyệt/từ chối tới email của photographer. */
export async function notifyUserApplicationResult(params: {
  toEmail: string;
  fullName: string;
  approved: boolean;
  adminNote?: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!params.toEmail?.trim()) return { sent: false, error: "Thiếu email user" };

  const body = params.approved
    ? [
        `Xin chào ${params.fullName},`,
        "",
        "Hồ sơ nhiếp ảnh gia của bạn trên Memento đã được DUYỆT.",
        "Bạn có thể mở app → Hồ sơ nhiếp ảnh gia để xem profile công khai.",
        "",
        "Cảm ơn bạn đã đồng hành cùng Memento!",
      ].join("\n")
    : [
        `Xin chào ${params.fullName},`,
        "",
        "Rất tiếc, hồ sơ nhiếp ảnh gia của bạn trên Memento chưa được duyệt.",
        params.adminNote?.trim()
          ? `\nLý do / góp ý từ đội ngũ Memento:\n${params.adminNote.trim()}\n`
          : "",
        "Bạn có thể chỉnh sửa hồ sơ trong app và gửi lại để xét duyệt.",
        "",
        "— Đội ngũ Memento",
      ].join("\n");

  try {
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        title: params.approved
          ? `[Memento] Hồ sơ PTG đã được duyệt`
          : `[Memento] Hồ sơ PTG chưa được duyệt`,
        message: body,
        name: params.fullName || "Bạn",
        email: params.toEmail,
        time: new Date().toLocaleString("vi-VN"),
      },
      { publicKey: EMAILJS_PUBLIC_KEY }
    );
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[notifyUserApplicationResult]", msg);
    return { sent: false, error: msg };
  }
}


/** Thông báo admin: PTG cập nhật hồ sơ / ảnh / bảng giá (không cần duyệt CCCD lại). */
export async function notifyProfileUpdate(params: {
  fullName: string;
  userId: string;
  summary: string;
  email?: string | null;
}): Promise<void> {
  const body = [
    "══════════════════════════════════",
    "  CẬP NHẬT HỒ SƠ PTG — MEMENTO",
    "══════════════════════════════════",
    "",
    `Tên: ${params.fullName}`,
    `User ID: ${params.userId}`,
    `Email: ${params.email || "—"}`,
    "",
    "Thay đổi:",
    params.summary,
    "",
    "→ Xem log: Admin app / bảng photographer_update_logs",
    "→ Nội dung đã áp dụng lên hồ sơ public (không cần duyệt CCCD lại).",
  ].join("\n");

  try {
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        title: `[Memento] PTG cập nhật hồ sơ — ${params.fullName}`,
        message: body,
        name: params.fullName,
        email: params.email || SUPPORT_EMAIL,
        time: new Date().toLocaleString("vi-VN"),
      },
      EMAILJS_PUBLIC_KEY
    );
  } catch (e) {
    console.warn("[notifyProfileUpdate]", e);
  }
}
