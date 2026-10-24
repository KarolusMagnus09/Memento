import { supabase } from "./supabase";

/** Signed URL sống 7 ngày — chỉ dùng khi cần gửi link private (email admin xem CCCD…). */
const SIGNED_TTL_SEC = 60 * 60 * 24 * 7;

/**
 * Trả public URL (ổn định, không hết hạn).
 * Bucket phải để public (xem sql/011_photographer_applications_storage.sql).
 * Thêm ?t= để tránh cache cũ sau khi upsert.
 */
function toPublicUrl(bucket: string, fullPath: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(fullPath);
  return `${data.publicUrl}?t=${Date.now()}`;
}

/** Signed URL — dùng cho file nhạy cảm khi bucket private. */
export async function toSignedUrl(bucket: string, fullPath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(fullPath, SIGNED_TTL_SEC);
  if (error || !data?.signedUrl) {
    return toPublicUrl(bucket, fullPath);
  }
  return data.signedUrl;
}

/**
 * Ảnh blob:/data: → upload Storage → trả public URL (xem được lâu dài trên portfolio).
 * URL http(s) giữ nguyên. Bucket nên public để portfolio không bị 403 / hết hạn.
 */
export async function uploadImageIfLocal(
  url: string,
  bucket: string,
  path: string
): Promise<string> {
  if (!url) return url;
  if (!url.startsWith("blob:") && !url.startsWith("data:")) return url;

  const res = await fetch(url);
  const blob = await res.blob();
  const ext = blob.type.split("/")[1]?.split("+")[0] || "jpg";
  const fullPath = `${path}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fullPath, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (error) throw error;

  return toPublicUrl(bucket, fullPath);
}

export async function uploadImagesIfLocal(
  urls: string[],
  bucket: string,
  prefix: string
): Promise<string[]> {
  return Promise.all(urls.map((url, i) => uploadImageIfLocal(url, bucket, `${prefix}-${i}`)));
}
