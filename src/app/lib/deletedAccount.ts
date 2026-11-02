import { supabase } from "./supabase";

/** Tên hiển thị của tài khoản đã xóa. PHẢI khớp biến `tomb` trong supabase_delete_account.sql */
export const DELETED_USER_NAME = "Người dùng đã bị xóa";

/** Tên này có phải của một tài khoản đã bị xóa không (đơn / chat / đề nghị lưu sẵn tên) */
export function isDeletedUserName(name?: string | null): boolean {
  return (name ?? "").trim().toLowerCase() === DELETED_USER_NAME.toLowerCase();
}

/**
 * Hỏi server trong danh sách id này ai đã xóa tài khoản (hàm deleted_user_ids trong
 * supabase_delete_account_part2.sql). Lỗi / chưa chạy SQL → trả về rỗng, UI vẫn nhận ra
 * tài khoản đã xóa qua tên hiển thị (isDeletedUserName).
 */
export async function fetchDeletedUserIds(ids: (string | null | undefined)[]): Promise<Set<string>> {
  const uniq = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (uniq.length === 0) return new Set();
  try {
    const { data, error } = await supabase.rpc("deleted_user_ids", { p_ids: uniq });
    if (error || !Array.isArray(data)) return new Set();
    return new Set(
      data.map((x: unknown) =>
        typeof x === "string" ? x : String((x as Record<string, unknown>)?.deleted_user_ids ?? (x as Record<string, unknown>)?.id ?? ""),
      ),
    );
  } catch {
    return new Set();
  }
}

/* ───────────── Xóa tài khoản ───────────── */

export type DeletionBlockers = {
  is_admin: boolean;
  /** Số đơn còn đang xử lý (khách hoặc photographer) */
  active_deals: number;
  /** Số khoản hoàn cọc chưa xử lý */
  pending_refunds: number;
  blocked: boolean;
};

/** Kiểm tra điều kiện xóa ở server (account_deletion_blockers). */
export async function fetchDeletionBlockers(): Promise<{ data: DeletionBlockers | null; error: string | null }> {
  const { data, error } = await supabase.rpc("account_deletion_blockers");
  if (error || !data) return { data: null, error: error?.message || "Không kiểm tra được" };
  const d = data as Partial<DeletionBlockers>;
  return {
    data: {
      is_admin: !!d.is_admin,
      active_deals: Number(d.active_deals) || 0,
      pending_refunds: Number(d.pending_refunds) || 0,
      blocked: !!d.blocked,
    },
    error: null,
  };
}

export type DeleteErrorCode = "OTP_REQUIRED" | "BLOCKED" | "OTHER";

/** Xóa tài khoản (delete_my_account). Trả về null nếu thành công. */
export async function deleteMyAccount(): Promise<{ code: DeleteErrorCode; message: string } | null> {
  const { error } = await supabase.rpc("delete_my_account");
  if (!error) return null;
  const msg = error.message || "";
  if (msg.includes("OTP_REQUIRED")) {
    return { code: "OTP_REQUIRED", message: "Phiên xác minh đã hết hạn (quá 15 phút). Vui lòng xác minh lại." };
  }
  if (msg.includes("BLOCKED")) {
    return { code: "BLOCKED", message: "Hiện chưa thể xóa tài khoản vì vẫn còn đơn đang xử lý." };
  }
  // eslint-disable-next-line no-console
  console.error("delete_my_account lỗi:", msg);
  return { code: "OTHER", message: "Chưa xóa được tài khoản, vui lòng thử lại." };
}
