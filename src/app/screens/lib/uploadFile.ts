import { supabase } from "./supabase";

// Ảnh trong form (CCCD, banner, portfolio...) thường là blob:/data: (mới chọn từ máy).
// Nếu url đã là http(s) thì giữ nguyên; nếu blob/data thì upload lên Storage và trả URL.
export async function uploadImageIfLocal(
  url: string,
  bucket: string,
  path: string
): Promise<string> {
  if (!url || (!url.startsWith("blob:") && !url.startsWith("data:"))) return url;

  const res = await fetch(url);
  const blob = await res.blob();
  const ext = blob.type.split("/")[1]?.split("+")[0] || "jpg";
  const fullPath = `${path}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fullPath, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (error) throw error;

  // Bucket private: publicUrl chỉ dùng nội bộ / signed sau này; vẫn lưu path URL để admin biết file.
  const { data } = supabase.storage.from(bucket).getPublicUrl(fullPath);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function uploadImagesIfLocal(
  urls: string[],
  bucket: string,
  prefix: string
): Promise<string[]> {
  return Promise.all(urls.map((url, i) => uploadImageIfLocal(url, bucket, `${prefix}-${i}`)));
}
