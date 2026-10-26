import { supabase } from "./supabase";
import { categoryLabel as svcCategoryLabel } from "./serviceCategories";

/** Trạng thái vòng đời đơn */
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "processing"   // user đã CK, admin đang xử lý / chờ chuyển 20%
  | "active"       // đã ứng 20%, đơn đang hiệu lực
  | "deposit_paid" // legacy → coi như processing
  | "handover"     // PTG đã gửi Drive bàn giao
  | "closing"      // 2 bên đang / đã xác nhận hoàn tất
  | "final_payment"
  | "completed"
  | "rejected"
  | "cancelled"
  | "paid"; // legacy

export type PaymentStatus = "unpaid" | "deposit_paid" | "fully_paid" | "paid";

export type BookingRow = {
  id: string;
  client_id: string;
  client_name?: string | null;
  client_avatar?: string | null;
  photographer_user_id: string | null;
  photographer_id: number | null;
  photographer_name: string;
  photographer_avatar: string | null;
  package_name: string;
  package_price: number;
  package_category: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  client_note: string | null;
  ptg_note: string | null;
  status: BookingStatus;
  payment_status?: PaymentStatus | null;
  payment_ref?: string | null;
  paid_at?: string | null;
  deposit_amount?: number | null;
  remaining_amount?: number | null;
  deposit_paid_at?: string | null;
  final_paid_at?: string | null;
  ptg_advance_paid_at?: string | null;
  ptg_final_paid_at?: string | null;
  drive_url?: string | null;
  drive_submitted_at?: string | null;
  shoot_done_at?: string | null;
  /** Mỗi bên xác nhận buổi chụp xong (chỉ từ ngày chụp) */
  shoot_confirm_client_at?: string | null;
  shoot_confirm_ptg_at?: string | null;
  client_approved_at?: string | null;
  client_success_at?: string | null;
  ptg_success_at?: string | null;
  drive_released_at?: string | null;
  handover_note?: string | null;
  created_at: string;
  updated_at?: string;
};

export type BookingServiceOption = {
  id: string;
  name: string;
  detail: string;
  price: number;
  category: string;
  groupTitle: string;
};

export type PhotoFeedback = {
  id: string;
  booking_id: string;
  user_id: string;
  photo_label: string;
  note: string;
  resolved: boolean;
  created_at: string;
  round?: number | null;
  images?: string[];
  /** URL đã ký (chỉ có sau khi fetchPhotoFeedback) */
  image_urls?: string[];
  resolved_at?: string | null;
};

/** Bucket storage ảnh đính kèm yêu cầu chỉnh sửa */
export const FEEDBACK_BUCKET = "feedback-images";
/** Tối đa ảnh mỗi yêu cầu (khớp SQL constraint max 4) */
export const MAX_FEEDBACK_IMAGES = 4;

const LOCAL_KEY = "memento:bookings:v1";
const COMMISSION_RATE = 0.1; // platform giữ 10% hoa hồng
/** User trả 100% tổng deal khi PTG xác nhận */
const USER_PAY_RATE = 1;
/** Ứng PTG 20% ngay sau khi user thanh toán */
const PTG_ADVANCE_RATE = 0.2;

function readLocal(): BookingRow[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLocal(rows: BookingRow[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

export function formatVnd(n: number) {
  return `${Number(n || 0).toLocaleString("vi-VN")}đ`;
}

/**
 * User thanh toán 100% tổng deal (ví dụ 100k).
 * Memento giữ tiền → ứng PTG 20% → khi xong chuyển thêm 70% (PTG tổng 90%, platform 10%).
 */
export function calcDeposit(total: number) {
  // alias: số tiền user phải trả = 100%
  return Math.round(Number(total || 0) * USER_PAY_RATE);
}

/** @deprecated user không còn trả phần 2 — giữ để không vỡ import */
export function calcRemaining(total: number) {
  return 0;
}

export function calcCommission(total: number) {
  return Math.round(Number(total || 0) * COMMISSION_RATE);
}

/** Tổng PTG nhận khi hoàn tất = 90% */
export function calcPtgPayout(total: number) {
  return Math.round(Number(total || 0) * (1 - COMMISSION_RATE));
}

/** Ứng PTG ngay sau user thanh toán = 20% */
export function calcPtgAdvance(total: number) {
  return Math.round(Number(total || 0) * PTG_ADVANCE_RATE);
}

/** Phần còn lại chuyển PTG khi xong deal = 70% */
export function calcPtgFinalTransfer(total: number) {
  return calcPtgPayout(total) - calcPtgAdvance(total);
}

/** Số tiền user cần CK (100% deal) */
export function getDepositAmount(b: BookingRow) {
  if (b.deposit_amount != null && Number(b.deposit_amount) > 0) return Number(b.deposit_amount);
  return calcDeposit(b.package_price);
}

export function getRemainingAmount(_b: BookingRow) {
  return 0;
}

/** Chờ user thanh toán 100% sau khi PTG xác nhận */
export function isAwaitingDeposit(b: BookingRow) {
  return b.status === "confirmed" && !b.deposit_paid_at;
}

/** User đã bấm «Đã chuyển khoản», chờ admin xác nhận */
export const USER_REPORTED_PREFIX = "USER_REPORTED";

export function isUserTransferReported(b: BookingRow): boolean {
  const ref = (b.payment_ref || "").trim();
  return ref.startsWith(USER_REPORTED_PREFIX) && !b.deposit_paid_at && b.status === "confirmed";
}

/** User báo đã CK — status giữ confirmed, QR tạm khóa đến khi admin xử lý */
export async function reportUserTransfer(id: string): Promise<string | null> {
  const bill = `MMT-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const patch: Record<string, unknown> = {
    payment_ref: `${USER_REPORTED_PREFIX}|${new Date().toISOString()}|${bill}`,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("bookings").update(patch).eq("id", id);
  if (error) return error.message;
  return null;
}

/** Admin: chưa nhận tiền → mở lại QR (xóa báo cáo user) */
export async function rejectUserTransferReport(id: string): Promise<string | null> {
  const patch: Record<string, unknown> = {
    payment_ref: null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("bookings").update(patch).eq("id", id);
  if (error) return error.message;
  return null;
}

export function isAwaitingFinal(_b: BookingRow) {
  return false;
}

export function isAwaitingPayment(b: BookingRow) {
  return isAwaitingDeposit(b);
}

/** User đã trả, admin chưa ứng 20% */
export function isProcessing(b: BookingRow) {
  if (b.status === "processing") return true;
  if ((b.status === "deposit_paid" || b.status === "paid") && !b.ptg_advance_paid_at && !b.final_paid_at) {
    return b.status !== "active" && b.status !== "handover" && b.status !== "closing" && b.status !== "completed";
  }
  return false;
}

/** Đã ứng 20%, đang trong thời gian thực hiện (chưa có Drive) */
export function isActiveOrder(b: BookingRow) {
  if (["rejected", "cancelled", "completed", "closing"].includes(b.status)) return false;
  // Có Drive → đã sang bàn giao, không còn phase chụp
  if (b.drive_url || b.drive_submitted_at) return false;
  if (b.status === "active") return true;
  // deposit_paid + đã ứng cọc, chưa Drive
  if (b.ptg_advance_paid_at && !b.drive_url) return true;
  // status handover nhưng chưa có link = PTG bấm chụp xong sớm → vẫn coi là đang chụp
  if (b.status === "handover" && !b.drive_url) return true;
  return false;
}

/** Đang trong quá trình chụp / hiệu lực (chưa bàn giao ảnh) */
export function isShooting(b: BookingRow) {
  return isActiveOrder(b);
}

/** Bàn giao ảnh — CHỈ khi đã có link Drive từ PTG */
export function isHandover(b: BookingRow) {
  if (b.status === "closing" || b.status === "completed") return false;
  return !!(b.drive_url || b.drive_submitted_at) && (
    b.status === "handover" ||
    b.status === "active" ||
    b.status === "deposit_paid" ||
    !!b.ptg_advance_paid_at
  );
}

export function isClosing(b: BookingRow) {
  return b.status === "closing";
}

export function bothSuccessConfirmed(b: BookingRow) {
  return !!(b.client_success_at && b.ptg_success_at);
}

export function isFullyDone(b: BookingRow) {
  return b.status === "completed" || !!b.drive_released_at;
}


/* ───────── Flow từng bước (1 nút / bước) ─────────
 * wait_date     : đang chụp, chưa đến ngày → chỉ hiện chữ
 * shoot_confirm : đến ngày chụp → mỗi bên bấm «Xác nhận đơn thành công»
 * drive         : cả hai đã xác nhận → PTG gửi Drive, khách chờ
 * review        : đã có Drive → khách góp ý, 2 bên xác nhận hoàn tất
 * closing       : cả hai đã xác nhận hoàn tất → Memento xử lý
 */
export type FlowStep = "none" | "wait_date" | "shoot_confirm" | "drive" | "review" | "closing" | "done";

/** Ngày hôm nay theo giờ Việt Nam (YYYY-MM-DD). Server mới là nơi kiểm tra thật. */
export function todayVN(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isShootDay(b: BookingRow): boolean {
  return (b.booking_date || "").slice(0, 10) <= todayVN();
}

/** Đơn cũ đã có shoot_done_at coi như đã qua bước xác nhận chụp */
export function bothShootConfirmed(b: BookingRow): boolean {
  return !!(b.shoot_confirm_client_at && b.shoot_confirm_ptg_at) || !!b.shoot_done_at;
}

export function flowStep(b: BookingRow): FlowStep {
  if (b.status === "completed" || b.drive_released_at) return "done";
  if (b.status === "closing" || bothSuccessConfirmed(b)) return "closing";
  if (b.drive_url) return "review";
  if (!isActiveOrder(b)) return "none";
  if (bothShootConfirmed(b)) return "drive";
  return isShootDay(b) ? "shoot_confirm" : "wait_date";
}

/** Sau bao lâu bên kia im lặng thì cho phép báo cáo */
export const SILENCE_HOURS = 48;

export type SilenceInfo = { waitingOn: "client" | "ptg"; since: string; overdue: boolean };

/** Ai đang bị chờ, từ lúc nào, đã quá hạn chưa (dùng để gợi ý nút Báo cáo) */
export function silenceInfo(b: BookingRow): SilenceInfo | null {
  const step = flowStep(b);
  let waitingOn: "client" | "ptg" | null = null;
  let since: string | null = null;

  if (step === "shoot_confirm") {
    if (b.shoot_confirm_client_at && !b.shoot_confirm_ptg_at) {
      waitingOn = "ptg";
      since = b.shoot_confirm_client_at;
    } else if (b.shoot_confirm_ptg_at && !b.shoot_confirm_client_at) {
      waitingOn = "client";
      since = b.shoot_confirm_ptg_at;
    }
  } else if (step === "drive") {
    waitingOn = "ptg";
    const a = b.shoot_confirm_client_at || "";
    const p = b.shoot_confirm_ptg_at || "";
    since = (a > p ? a : p) || b.shoot_done_at || b.updated_at || null;
  } else if (step === "review") {
    if (b.client_success_at && !b.ptg_success_at) {
      waitingOn = "ptg";
      since = b.client_success_at;
    } else if (b.ptg_success_at && !b.client_success_at) {
      waitingOn = "client";
      since = b.ptg_success_at;
    }
  }
  if (!waitingOn || !since) return null;
  const overdue = Date.now() - new Date(since).getTime() > SILENCE_HOURS * 3600 * 1000;
  return { waitingOn, since, overdue };
}

export function isPaid(b: BookingRow) {
  return (
    !!b.deposit_paid_at ||
    ["processing", "active", "handover", "closing", "completed", "deposit_paid", "paid"].includes(b.status) ||
    b.payment_status === "deposit_paid" ||
    b.payment_status === "fully_paid" ||
    b.payment_status === "paid"
  );
}

/** Nhãn hiển thị đẹp cho app */
export function bookingPhaseLabel(b: BookingRow): string {
  if (b.status === "pending") return "Chờ xác nhận";
  if (b.status === "confirmed") return "Chờ thanh toán";
  if (isProcessing(b)) return "Đang xử lý đơn";
  if (isHandover(b)) return "Bàn giao ảnh";
  if (isShooting(b) || isActiveOrder(b)) return "Đang chụp ảnh";
  if (b.status === "closing") return "Chờ xác nhận hoàn tất";
  if (b.status === "completed") return "Hoàn thành đơn";
  if (b.status === "rejected") return "Đã từ chối";
  if (b.status === "cancelled") return "Đã hủy";
  return b.status;
}

export function buildServiceOptions(photographer: {
  price_groups?: {
    id: string;
    title: string;
    category: string;
    lines: { id: string; name: string; price: string | number; detail?: string }[];
  }[];
  packages?: { name: string; price: number; desc?: string; includes?: string[] }[];
}): BookingServiceOption[] {
  const out: BookingServiceOption[] = [];
  const groups = photographer.price_groups || [];
  for (const g of groups) {
    for (const line of g.lines || []) {
      out.push({
        id: `${g.id}:${line.id}`,
        name: line.name,
        detail: line.detail || "",
        price: Number(line.price) || 0,
        category: g.category || "photo",
        groupTitle: g.title || "",
      });
    }
  }
  if (out.length === 0 && photographer.packages?.length) {
    photographer.packages.forEach((p, i) => {
      out.push({
        id: `pkg-${i}`,
        name: p.name,
        detail: p.desc || "",
        price: Number(p.price) || 0,
        category: "photo",
        groupTitle: "Gói",
      });
    });
  }
  return out;
}

export function categoryLabel(cat: string) {
  return svcCategoryLabel(cat);
}

export function buildBillCode(bookingId: string, prefix = "MMT"): string {
  const raw = bookingId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const short = (raw.slice(0, 8) || String(Date.now()).slice(-8)).toUpperCase();
  return `${prefix}-${short}`;
}

export function buildPaymentDescription(bookingId: string, prefix = "MMT"): string {
  return buildBillCode(bookingId, prefix);
}

/** Mã CK cọc */
export function buildDepositDescription(bookingId: string, prefix = "MMT"): string {
  return `${buildBillCode(bookingId, prefix)}C`;
}

/** Mã CK phần còn lại */
export function buildFinalDescription(bookingId: string, prefix = "MMT"): string {
  return `${buildBillCode(bookingId, prefix)}F`;
}

export function buildVietQrUrl(opts: {
  account: string;
  bank: string;
  amount: number;
  description: string;
  accountName?: string;
  storeName?: string;
}): string {
  const params = new URLSearchParams();
  params.set("acc", opts.account);
  params.set("bank", opts.bank);
  params.set("amount", String(Math.round(opts.amount)));
  params.set("des", opts.description.replace(/[^a-zA-Z0-9\- ]/g, "").slice(0, 25));
  // qronly: chỉ ảnh mã QR (không logo/chữ trong ảnh). Thông tin chuyển khoản app tự hiển thị bên dưới.
  params.set("template", "qronly");
  return `https://qr.sepay.vn/img?${params.toString()}`;
}

export async function createBooking(
  input: Omit<
    BookingRow,
    | "id"
    | "created_at"
    | "status"
    | "ptg_note"
    | "updated_at"
    | "payment_status"
    | "payment_ref"
    | "deposit_amount"
    | "remaining_amount"
  > & { status?: BookingStatus }
): Promise<{ data: BookingRow | null; error: string | null }> {
  if (input.photographer_user_id && input.client_id === input.photographer_user_id) {
    return { data: null, error: "Bạn không thể tự đặt lịch với chính mình." };
  }
  const total = Number(input.package_price) || 0;
  const row = {
    ...input,
    status: input.status || ("pending" as BookingStatus),
    payment_status: "unpaid" as PaymentStatus,
    deposit_amount: calcDeposit(total),
    remaining_amount: 0,
  };

  const { data, error } = await supabase.from("bookings").insert(row).select("*").single();
  if (error) {
    // local fallback
    const local: BookingRow = {
      ...row,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ptg_note: null,
    };
    const all = readLocal();
    all.unshift(local);
    writeLocal(all);
    return { data: local, error: null };
  }
  return { data: data as BookingRow, error: null };
}

export async function fetchMyBookings(userId: string): Promise<BookingRow[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .or(`client_id.eq.${userId},photographer_user_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error || !data) {
    return readLocal().filter(
      (r) => r.client_id === userId || r.photographer_user_id === userId
    );
  }
  return data as BookingRow[];
}

export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
  extra?: Partial<BookingRow>
): Promise<string | null> {
  const patch: Record<string, unknown> = { status, ...extra, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("bookings").update(patch).eq("id", id);
  if (error) {
    const all = readLocal();
    const i = all.findIndex((r) => r.id === id);
    if (i >= 0) {
      all[i] = { ...all[i], status, ...extra };
      writeLocal(all);
      return null;
    }
    return error.message;
  }
  return null;
}

/** Admin / webhook: ghi nhận đã nhận cọc 10% */
export async function markDepositPaid(id: string, paymentRef?: string): Promise<string | null> {
  // Dùng deposit_paid (có trong CHECK cũ). processing có thể chưa được DB cho phép.
  return updateBookingStatus(id, "deposit_paid", {
    payment_status: "deposit_paid",
    deposit_paid_at: new Date().toISOString(),
    payment_ref: paymentRef || null,
    paid_at: new Date().toISOString(),
  });
}

/** Admin đã chuyển 20% cọc cho PTG → đơn hiệu lực */
export async function markPtgAdvancePaid(id: string, ref?: string): Promise<string | null> {
  return updateBookingStatus(id, "active", {
    ptg_advance_paid_at: new Date().toISOString(),
    ...(ref ? { payment_ref: ref } : {}),
  });
}

/** Admin / webhook: ghi nhận đã nhận 90% còn lại → completed */
export async function markFinalPaid(id: string, paymentRef?: string): Promise<string | null> {
  return updateBookingStatus(id, "completed", {
    payment_status: "fully_paid",
    final_paid_at: new Date().toISOString(),
    payment_ref: paymentRef || null,
  });
}

/** @deprecated → markDepositPaid hoặc markFinalPaid */
export async function markBookingPaid(id: string, paymentRef?: string): Promise<string | null> {
  return markDepositPaid(id, paymentRef);
}

export async function markShootDone(id: string): Promise<string | null> {
  // Chỉ ghi nhận đã chụp xong — phase bàn giao chỉ khi PTG gửi Drive (submitDriveUrl)
  const patch: Record<string, unknown> = {
    shoot_done_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("bookings").update(patch).eq("id", id);
  if (error) return error.message;
  return null;
}

export async function submitDriveUrl(id: string, driveUrl: string, note?: string): Promise<string | null> {
  // Đơn đã hoàn thành → không cho gửi/đổi link Drive nữa (kiểm tra trên dữ liệu mới nhất, không tin giao diện)
  const { data: cur } = await supabase
    .from("bookings")
    .select("status, drive_released_at")
    .eq("id", id)
    .maybeSingle();
  if (cur && (cur.status === "completed" || cur.drive_released_at)) {
    return "Đơn đã hoàn thành, không thể gửi hoặc đổi link Drive nữa";
  }
  // Ghi thẳng DB, KHÔNG dùng fallback local của updateBookingStatus:
  // nếu RLS/CHECK từ chối thì phải báo lỗi thật, không báo "đã gửi" giả.
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: "handover",
      drive_url: driveUrl,
      drive_submitted_at: now,
      handover_note: note || null,
      updated_at: now,
    })
    .eq("id", id)
    .select("id");
  if (error) return error.message;
  if (!data || data.length === 0) {
    return "Không lưu được link (không có quyền cập nhật đơn này). Hãy đăng nhập lại hoặc báo admin.";
  }
  return null;
}

/** Mỗi bên xác nhận buổi chụp xong — server kiểm tra ngày chụp + đúng người (RPC confirm_shoot) */
export async function confirmShoot(id: string): Promise<string | null> {
  const { error } = await supabase.rpc("confirm_shoot", { p_booking: id });
  return error ? error.message : null;
}

/** User hoặc PTG bấm xác nhận hoàn tất đơn (sau khi có Drive) — RPC confirm_final tự chuyển closing khi đủ 2 bên */
export async function confirmOrderSuccess(
  id: string,
  _role?: "client" | "ptg"
): Promise<string | null> {
  const { error } = await supabase.rpc("confirm_final", { p_booking: id });
  return error ? error.message : null;
}

/** Admin chuyển nốt 70% (sau khi 2 bên xác nhận) */
export async function markPtgFinalPaid(id: string, ref?: string): Promise<string | null> {
  return updateBookingStatus(id, "closing", {
    ptg_final_paid_at: new Date().toISOString(),
    payment_status: "fully_paid",
    ...(ref ? { payment_ref: ref } : {}),
  });
}

/** Admin gửi Drive đầy đủ cho user → hoàn thành */
export async function releaseDriveToClient(id: string): Promise<string | null> {
  return updateBookingStatus(id, "completed", {
    drive_released_at: new Date().toISOString(),
    final_paid_at: new Date().toISOString(),
    payment_status: "fully_paid",
  });
}

/** User duyệt ảnh → hoàn tất đơn. Ưu tiên RPC; fallback update trực tiếp nếu chưa deploy SQL. */
export async function clientApproveHandover(id: string): Promise<string | null> {
  return confirmOrderSuccess(id, "client");
}

/** Kiểm tra link Google Drive hợp lệ */
export function validateDriveUrl(url: string): string | null {
  const u = (url || "").trim();
  if (!u) return "Vui lòng dán link Google Drive";
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase();
    if (
      !host.includes("drive.google.com") &&
      !host.includes("docs.google.com") &&
      !host.includes("photos.google.com")
    ) {
      return "Link phải là Google Drive / Google Photos";
    }
  } catch {
    return "Link không hợp lệ";
  }
  return null;
}

/** Upload ảnh đính kèm yêu cầu chỉnh sửa → trả về storage paths */
export async function uploadFeedbackImages(
  files: File[],
  userId: string,
  bookingId: string
): Promise<{ paths: string[]; error: string | null }> {
  if (!files.length) return { paths: [], error: null };
  if (files.length > MAX_FEEDBACK_IMAGES) {
    return { paths: [], error: `Tối đa ${MAX_FEEDBACK_IMAGES} ảnh mỗi yêu cầu` };
  }
  const paths: string[] = [];
  for (const file of files) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userId}/${bookingId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(FEEDBACK_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });
    if (error) {
      if (paths.length) await supabase.storage.from(FEEDBACK_BUCKET).remove(paths);
      return { paths: [], error: error.message };
    }
    paths.push(path);
  }
  return { paths, error: null };
}

export async function addPhotoFeedback(
  bookingId: string,
  userId: string,
  photoLabel: string,
  note: string,
  images: string[] = []
): Promise<{ data: PhotoFeedback | null; error: string | null }> {
  const row: Record<string, unknown> = {
    booking_id: bookingId,
    user_id: userId,
    photo_label: photoLabel,
    note,
  };
  if (images.length) row.images = images;
  const { data, error } = await supabase
    .from("booking_photo_feedback")
    .insert(row)
    .select("*")
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as PhotoFeedback, error: null };
}

export async function fetchPhotoFeedback(bookingId: string): Promise<PhotoFeedback[]> {
  const { data, error } = await supabase
    .from("booking_photo_feedback")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  const rows = data as PhotoFeedback[];
  // Ký URL ảnh để PTG/khách xem được (bucket private)
  const allPaths = rows.flatMap((r) => r.images || []);
  let urlMap: Record<string, string> = {};
  if (allPaths.length) {
    const { data: signed } = await supabase.storage
      .from(FEEDBACK_BUCKET)
      .createSignedUrls(allPaths, 3600);
    (signed || []).forEach((x) => {
      if (x.path && x.signedUrl) urlMap[x.path] = x.signedUrl;
    });
  }
  return rows.map((r) => ({
    ...r,
    image_urls: (r.images || []).map((p) => urlMap[p]).filter(Boolean),
  }));
}

/** PTG đánh dấu đã chỉnh xong / mở lại yêu cầu */
export async function resolveFeedback(
  feedbackId: string,
  resolved: boolean
): Promise<string | null> {
  const { error } = await supabase.rpc("ptg_resolve_feedback", {
    p_feedback_id: feedbackId,
    p_resolved: resolved,
  });
  if (error) {
    // fallback trực tiếp nếu RPC chưa deploy (staging)
    const { error: e2 } = await supabase
      .from("booking_photo_feedback")
      .update({
        resolved,
        resolved_at: resolved ? new Date().toISOString() : null,
      })
      .eq("id", feedbackId);
    return e2 ? e2.message : null;
  }
  return null;
}

/** Xóa lịch hẹn đã từ chối / hủy (client hoặc PTG của đơn) */
export async function deleteBooking(id: string): Promise<string | null> {
  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error) {
    const all = readLocal().filter((r) => r.id !== id);
    writeLocal(all);
    // nếu local không có và supabase lỗi
    if (readLocal().find((r) => r.id === id)) return error.message;
    return error.message.includes("policy") || error.message.includes("row")
      ? error.message
      : null;
  }
  const all = readLocal().filter((r) => r.id !== id);
  writeLocal(all);
  return null;
}
