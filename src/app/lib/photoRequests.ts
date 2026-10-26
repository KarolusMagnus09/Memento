import { supabase } from "./supabase";
import { categoryLabel, type ServiceCategory } from "./serviceCategories";

/* ───────── Kiểu dữ liệu ───────── */

export type PhotoRequestStatus = "open" | "closed" | "matched" | "expired";
export type RequestSetting = "indoor" | "outdoor" | "studio" | "both";

/** Một đơn "tìm nhiếp ảnh gia" do khách đăng (bảng photo_requests). */
export type PhotoRequest = {
  id: string;
  /** Mã đơn, vd "PTN-vKx5es" */
  code: string;
  title: string;
  requester_id: string | null;
  requester_name: string;
  /** Số người tham gia buổi chụp (form hiện không hỏi → có thể null) */
  participants: number | null;
  /** Bối cảnh: trong nhà / ngoài trời / studio */
  setting: RequestSetting | null;
  /** Thể loại chụp (cùng danh sách `styles` trong constants), chọn được nhiều, vd ["Yearbook", "Couple"] */
  genres: string[];
  /** Ngày chụp (ISO) — dữ liệu cũ; đơn mới dùng shoot_start / shoot_end */
  shoot_date: string | null;
  /** Bắt đầu chụp (ISO, có giờ) */
  shoot_start: string | null;
  /** Kết thúc chụp (ISO, có giờ) */
  shoot_end: string | null;
  /** "Nội dung thêm" do khách tự nhập (không giới hạn độ dài) */
  note: string | null;
  /** Tỉnh / thành, vd "Hà Nội" (cùng danh sách VN_PROVINCES) */
  city: string | null;
  /** Địa điểm cụ thể, vd "THPT FPT Hòa Lạc" */
  venue: string | null;
  /** Loại dịch vụ cần thuê */
  services: ServiceCategory[];
  /** Chữ hiển thị tự do trên nhãn dịch vụ, vd "Make-up + Làm tóc (4 người)" (không có thì tự ghép từ services) */
  services_note: string | null;
  budget_min: number | null;
  budget_max: number | null;
  /** Hạn tìm nhiếp ảnh gia (ISO) */
  deadline: string | null;
  status: PhotoRequestStatus;
  /** Số nhiếp ảnh gia đã đề nghị chụp */
  offer_count: number;
  created_at: string;
};

/* ───────── Bộ lọc ───────── */

export type RequestSort = "newest" | "oldest" | "price_desc" | "price_asc";

export type RequestFilter = {
  sort: RequestSort;
  services: ServiceCategory[];
  genres: string[];
  locations: string[];
};

export const EMPTY_REQUEST_FILTER: RequestFilter = {
  sort: "newest",
  services: [],
  genres: [],
  locations: [],
};

export const REQUEST_SORT_OPTIONS: { id: RequestSort; label: string }[] = [
  { id: "newest", label: "Mới nhất" },
  { id: "oldest", label: "Cũ nhất" },
  { id: "price_desc", label: "Giá cao → thấp" },
  { id: "price_asc", label: "Giá thấp → cao" },
];

/** Số bộ lọc đang bật (không tính sắp xếp) */
export function countRequestFilters(f: RequestFilter): number {
  return f.services.length + f.genres.length + f.locations.length;
}

/* ───────── Định dạng hiển thị ───────── */

const fmtNum = (n: number) => n.toLocaleString("vi-VN");
const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); // "YYYY-MM-DD" → giờ địa phương, tránh lệch múi giờ
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2.000.000 - 4.000.000 VND" | "2.000.000 VND" | "Thỏa thuận" */
export function formatBudget(min: number | null, max: number | null): string {
  const lo = min && min > 0 ? min : null;
  const hi = max && max > 0 ? max : null;
  if (lo && hi) return lo === hi ? `${fmtNum(lo)} VND` : `${fmtNum(lo)} - ${fmtNum(hi)} VND`;
  if (hi) return `Tối đa ${fmtNum(hi)} VND`;
  if (lo) return `Từ ${fmtNum(lo)} VND`;
  return "Thỏa thuận";
}

/** "T7, 14/11/2026" */
export function formatShootDate(s: string | null): string {
  const d = parseDate(s);
  if (!d) return "Chưa chốt ngày";
  return `${WEEKDAY[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dmy = (d: Date) => `${WEEKDAY[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const dm = (d: Date) => `${WEEKDAY[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

/**
 * Thời gian chụp:
 *   cùng ngày  → "08:00 - 12:00 · T7, 14/11/2026"
 *   khác ngày  → "08:00 T7, 14/11 → 18:00 CN, 15/11/2026"
 * Đơn cũ chỉ có ngày → "T7, 14/11/2026".
 */
export function formatShootRange(r: Pick<PhotoRequest, "shoot_start" | "shoot_end" | "shoot_date">): string {
  const a = parseDate(r.shoot_start);
  if (!a) return formatShootDate(r.shoot_date);
  const b = parseDate(r.shoot_end);
  if (!b) return `${hhmm(a)} · ${dmy(a)}`;
  const sameDay = a.toDateString() === b.toDateString();
  if (sameDay) return `${hhmm(a)} - ${hhmm(b)} · ${dmy(a)}`;
  const sameYear = a.getFullYear() === b.getFullYear();
  return `${hhmm(a)} ${sameYear ? dm(a) : dmy(a)} → ${hhmm(b)} ${dmy(b)}`;
}

/** "23:59 T4, 11/11/2026" */
export function formatDeadline(s: string | null): string {
  const d = parseDate(s);
  if (!d) return "Không giới hạn";
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${WEEKDAY[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Ngày tạo đơn dạng "22-10" */
export function formatCreatedShort(s: string): string {
  const d = parseDate(s);
  return d ? `${pad(d.getDate())}-${pad(d.getMonth() + 1)}` : "";
}

/** "Cá nhân (1 người)" | "Cặp đôi (2 người)" | "Nhóm (4 người)"; không có số người → "" */
export function formatParticipants(n: number | null): string {
  if (n == null) return "";
  const c = Math.max(1, Math.round(n) || 1);
  return `${c === 1 ? "Cá nhân" : c === 2 ? "Cặp đôi" : "Nhóm"} (${c} người)`;
}

export const SETTING_OPTIONS: { id: Exclude<RequestSetting, "both">; label: string }[] = [
  { id: "outdoor", label: "Ngoài trời" },
  { id: "indoor", label: "Trong nhà" },
  { id: "studio", label: "Studio" },
];

export function formatSetting(s: RequestSetting | null): string {
  return s === "indoor" ? "Trong nhà"
    : s === "outdoor" ? "Ngoài trời"
    : s === "studio" ? "Studio"
    : s === "both" ? "Trong nhà & ngoài trời"
    : "";
}

/** "Couple, Birthday" */
export function formatGenres(genres: string[]): string {
  return genres.join(", ");
}

/** "Hà Nội · THPT FPT Hòa Lạc" */
export function formatPlace(r: Pick<PhotoRequest, "city" | "venue">): string {
  return [r.city, r.venue].filter(Boolean).join(" · ") || "Chưa chốt địa điểm";
}

/** Nhãn dịch vụ: ưu tiên chữ tự do, không có thì ghép "Chụp ảnh + Make up" */
export function formatServices(r: Pick<PhotoRequest, "services" | "services_note">): string {
  if (r.services_note && r.services_note.trim()) return r.services_note.trim();
  return r.services.map((s) => categoryLabel(s)).join(" + ");
}

/* ───────── Truy vấn (phân trang vô hạn) ───────── */

export const REQUEST_PAGE_SIZE = 10;

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") {
    try { const j = JSON.parse(v); return Array.isArray(j) ? j.filter((x) => typeof x === "string") : []; } catch { return []; }
  }
  return [];
}

export function normalizeRow(row: any): PhotoRequest {
  const num = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
  const id = String(row.id);
  return {
    id,
    code: String(row.code || `PTN-${id.replace(/-/g, "").slice(0, 6)}`),
    title: String(row.title || "Đơn tìm nhiếp ảnh gia"),
    requester_id: row.requester_id ?? null,
    requester_name: String(row.requester_name || "Người dùng Memento"),
    participants: row.participants == null ? null : Math.max(1, Number(row.participants) || 1),
    setting: row.setting ?? null,
    genres: asArray(row.genres).length ? asArray(row.genres) : row.genre ? [String(row.genre)] : [],
    shoot_date: row.shoot_date ?? null,
    shoot_start: row.shoot_start ?? null,
    shoot_end: row.shoot_end ?? null,
    note: row.note ?? null,
    city: row.city ?? null,
    venue: row.venue ?? null,
    services: asArray(row.services) as ServiceCategory[],
    services_note: row.services_note ?? null,
    budget_min: num(row.budget_min),
    budget_max: num(row.budget_max),
    deadline: row.deadline ?? null,
    status: (row.status as PhotoRequestStatus) || "open",
    offer_count: Number(row.offer_count) || 0,
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

export type RequestPage = { rows: PhotoRequest[]; hasMore: boolean; sample: boolean };

/**
 * Lấy 1 trang đơn đang mở (còn hạn), lọc + sắp xếp phía server.
 * Chạy photo_requests.sql rồi photo_requests_v2.sql để tạo / cập nhật bảng. Trong lúc dev (npm run dev) nếu chưa có bảng,
 * tự dùng dữ liệu mẫu để xem giao diện; bản build thật thì báo lỗi bình thường.
 */
export async function fetchPhotoRequests(filter: RequestFilter, page: number): Promise<RequestPage> {
  const from = page * REQUEST_PAGE_SIZE;
  const to = from + REQUEST_PAGE_SIZE - 1;
  try {
    let q = supabase
      .from("photo_requests")
      .select("*")
      .eq("status", "open")
      .or(`deadline.is.null,deadline.gt.${new Date().toISOString()}`);

    if (filter.services.length) q = q.overlaps("services", filter.services);
    if (filter.genres.length) q = q.overlaps("genres", filter.genres);
    if (filter.locations.length) q = q.in("city", filter.locations);

    switch (filter.sort) {
      case "oldest":
        q = q.order("created_at", { ascending: true });
        break;
      case "price_desc":
        q = q.order("budget_max", { ascending: false, nullsFirst: false });
        break;
      case "price_asc":
        q = q.order("budget_min", { ascending: true, nullsFirst: false });
        break;
      default:
        q = q.order("created_at", { ascending: false });
    }
    // id làm khóa phụ để các trang không bị trùng / sót khi nhiều đơn cùng giá hay cùng giờ
    const { data, error } = await q.order("id", { ascending: true }).range(from, to);
    if (error) throw error;
    const rows = (data ?? []).map(normalizeRow);
    return { rows, hasMore: rows.length === REQUEST_PAGE_SIZE, sample: false };
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[photoRequests] Chưa có bảng photo_requests (hoặc lỗi truy vấn) → dùng dữ liệu mẫu để dev", e);
      return sampleQuery(filter, page);
    }
    throw e;
  }
}

/* ───────── Tạo đơn ───────── */

export type NewPhotoRequestInput = {
  /** Thể loại chụp (≥ 1), lấy từ danh sách `styles` */
  genres: string[];
  shootStart: Date;
  shootEnd: Date;
  /** Tỉnh / thành (VN_PROVINCES) */
  city: string;
  /** Địa chỉ cụ thể (tùy chọn) */
  venue: string;
  budgetMin: number;
  budgetMax: number;
  /** Dịch vụ đi kèm (make up, thuê studio...). "Chụp ảnh" luôn được thêm tự động. */
  extraServices: ServiceCategory[];
  setting: Exclude<RequestSetting, "both">;
  /** "Nội dung thêm", không giới hạn độ dài (tùy chọn) */
  note: string;
};

/** Tiêu đề tự tạo từ thể loại: "Chụp Couple, Birthday" · "Chụp Couple, Birthday +1" */
export function buildRequestTitle(genres: string[]): string {
  if (!genres.length) return "Đơn chụp ảnh";
  const shown = genres.slice(0, 2).join(", ");
  return `Chụp ${shown}${genres.length > 2 ? ` +${genres.length - 2}` : ""}`;
}

/**
 * Đăng đơn mới. Tên người đăng, mã đơn, trạng thái và số đề nghị do server đặt (trigger trong photo_requests_v2.sql);
 * `requesterName` chỉ là giá trị dự phòng. Hạn tìm nhiếp ảnh gia = giờ bắt đầu chụp.
 */
export async function createPhotoRequest(
  input: NewPhotoRequestInput,
  requesterName: string
): Promise<{ error: string | null }> {
  const start = input.shootStart;
  const row = {
    title: buildRequestTitle(input.genres),
    requester_name: requesterName,
    genres: input.genres,
    genre: input.genres[0] ?? null,
    setting: input.setting,
    shoot_date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    shoot_start: start.toISOString(),
    shoot_end: input.shootEnd.toISOString(),
    city: input.city,
    venue: input.venue.trim() || null,
    services: ["photo", ...input.extraServices.filter((s) => s !== "photo")],
    budget_min: input.budgetMin,
    budget_max: input.budgetMax,
    deadline: start.toISOString(),
    note: input.note.trim() || null,
  };
  const { error } = await supabase.from("photo_requests").insert(row);
  if (!error) return { error: null };
  const msg = error.message || "";
  if (/column|schema cache|photo_requests_setting_check/i.test(msg)) {
    return { error: "Cơ sở dữ liệu chưa được cập nhật (cần chạy file photo_requests_v2.sql trong Supabase)." };
  }
  if (/tương lai/i.test(msg)) return { error: "Thời gian chụp phải ở tương lai." };
  return { error: `Không đăng được đơn: ${msg}` };
}

/* ───────── Đơn của tôi (Quản lý đơn) ───────── */

export const STATUS_LABEL: Record<PhotoRequestStatus, string> = {
  open: "Đang tìm NAG",
  matched: "Đã chọn NAG",
  closed: "Đã đóng",
  expired: "Hết hạn",
};

/** Mọi đơn do mình đăng (mọi trạng thái), mới nhất trước, phân trang vô hạn */
export async function fetchMyPhotoRequests(
  userId: string,
  page: number,
): Promise<{ rows: PhotoRequest[]; hasMore: boolean; error: string | null }> {
  const from = page * REQUEST_PAGE_SIZE;
  const { data, error } = await supabase
    .from("photo_requests")
    .select("*")
    .eq("requester_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + REQUEST_PAGE_SIZE - 1);
  if (error) return { rows: [], hasMore: false, error: error.message };
  const rows = (data ?? []).map(normalizeRow);
  return { rows, hasMore: rows.length === REQUEST_PAGE_SIZE, error: null };
}

/** Xóa đơn của chính mình (cần policy DELETE trong photo_requests_phase1.sql) */
export async function deleteMyPhotoRequest(id: string): Promise<string | null> {
  const { data, error } = await supabase.from("photo_requests").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Không xóa được đơn (không có quyền hoặc đơn không còn tồn tại).";
  return null;
}

/* ───────── Dữ liệu mẫu (chỉ dùng khi dev & chưa có bảng) ───────── */

let SAMPLE_CACHE: PhotoRequest[] | null = null;

function buildSamples(): PhotoRequest[] {
  const names = ["Nhật Minh Đào", "Lê Thu Hà", "Trần Quang Huy", "Phạm Mai Anh", "Võ Gia Bảo", "Nguyễn Ngọc Lan", "Đỗ Khánh Vy"];
  const titles = [
    "Chụp kỷ yếu lớp 12A3", "Cosplay ngoài trời", "Chụp couple kỷ niệm", "Chân dung nghệ thuật",
    "Chụp sản phẩm shop mỹ phẩm", "Sinh nhật bé 1 tuổi", "Ảnh gia đình dịp Tết", "Lookbook thời trang",
  ];
  const places: [string, string][] = [
    ["Hà Nội", "THPT FPT Hòa Lạc"], ["Hồ Chí Minh", "Nhà thờ Đức Bà"], ["Đà Nẵng", "Bãi biển Mỹ Khê"],
    ["Hải Phòng", "Đồ Sơn"], ["Lâm Đồng", "Đồi chè Cầu Đất"], ["Huế", "Đại Nội"],
  ];
  const genres = ["Yearbook", "Festival anime/cosplay", "Couple", "Personal", "Product/E-commerce", "Birthday", "Family activities", "Fashion Shows"];
  const svc: ServiceCategory[][] = [
    ["photo"], ["photo", "makeup"], ["photo", "rental_outfit"], ["photo", "editor"],
    ["photo", "rental_studio"], ["makeup"], ["photo", "makeup", "editor"], ["others"],
  ];
  const settings: RequestSetting[] = ["outdoor", "indoor", "studio", "both"];
  const out: PhotoRequest[] = [];
  const now = Date.now();
  for (let i = 0; i < 38; i++) {
    const lo = [500, 800, 1200, 2000, 3000][i % 5] * 1000;
    const hi = lo + [500, 1000, 2000, 3000][i % 4] * 1000;
    out.push({
      id: `sample-${i + 1}`,
      code: `PTN-${(0x7a3f21 + i * 7919).toString(36).slice(0, 6)}`,
      title: titles[i % titles.length],
      requester_id: null,
      requester_name: names[i % names.length],
      participants: null,
      setting: settings[i % 4],
      genres: i % 3 === 0 ? [genres[i % genres.length], genres[(i + 3) % genres.length]] : [genres[i % genres.length]],
      shoot_date: new Date(now + (3 + i) * 86400000).toISOString().slice(0, 10),
      shoot_start: new Date(now + (3 + i) * 86400000).toISOString(),
      shoot_end: new Date(now + (3 + i) * 86400000 + (2 + (i % 4)) * 3600000).toISOString(),
      note: null,
      city: places[i % places.length][0],
      venue: places[i % places.length][1],
      services: svc[i % svc.length],
      services_note: i % 4 === 1 ? "Make-up + Làm tóc (4 người)" : null,
      budget_min: lo,
      budget_max: hi,
      deadline: new Date(now + (2 + (i % 9)) * 86400000).toISOString(),
      status: "open",
      offer_count: i % 6,
      created_at: new Date(now - i * 5.3 * 3600000).toISOString(),
    });
  }
  return out;
}

function sampleQuery(filter: RequestFilter, page: number): RequestPage {
  if (!SAMPLE_CACHE) SAMPLE_CACHE = buildSamples();
  let list = SAMPLE_CACHE.filter(
    (r) =>
      (!filter.services.length || r.services.some((s) => filter.services.includes(s))) &&
      (!filter.genres.length || r.genres.some((g) => filter.genres.includes(g))) &&
      (!filter.locations.length || (r.city != null && filter.locations.includes(r.city)))
  );
  const t = (r: PhotoRequest) => new Date(r.created_at).getTime();
  list = [...list].sort((a, b) =>
    filter.sort === "oldest" ? t(a) - t(b)
    : filter.sort === "price_desc" ? (b.budget_max ?? 0) - (a.budget_max ?? 0)
    : filter.sort === "price_asc" ? (a.budget_min ?? Infinity) - (b.budget_min ?? Infinity)
    : t(b) - t(a)
  );
  const from = page * REQUEST_PAGE_SIZE;
  const rows = list.slice(from, from + REQUEST_PAGE_SIZE);
  return { rows, hasMore: from + REQUEST_PAGE_SIZE < list.length, sample: true };
}
