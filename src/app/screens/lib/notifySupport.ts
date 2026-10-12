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
 * Email chi tiết giống hồ sơ app: thông tin + link FB/IG + ảnh đại diện / bìa / portfolio / CCCD.
 * Template EmailJS: title, message, name, email, time
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
            `• [${g.category || "?"}] ${g.title || "Mục"}`,
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
    "—— DUYỆT HỒ SƠ ——",
    `user_id: ${params.userId}`,
    "Supabase → Table Editor → photographer_applications → lọc user_id.",
    "Duyệt: status = approved  |  Từ chối: status = rejected + admin_note.",
    "",
    "※ Link ảnh có hiệu lực ~7 ngày (signed URL). Sau đó xem lại trên Storage / Table.",
  ]
    .filter((x) => x !== null)
    .join("\n");

  try {
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        title: `[Memento] Hồ sơ PTG mới: ${params.fullName}`,
        message: body,
        name: params.fullName || "Photographer applicant",
        email: params.email || SUPPORT_EMAIL,
        time: new Date().toLocaleString("vi-VN"),
      },
      { publicKey: EMAILJS_PUBLIC_KEY }
    );
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[notifySupport] EmailJS error:", msg);
    return { sent: false, error: msg };
  }
}
