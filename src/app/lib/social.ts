import { supabase } from "./supabase";

/* ───────────── Ghim hồ sơ (lưu trên server, mỗi tài khoản 1 lần/photographer) ───────────── */

export async function fetchPins(): Promise<number[]> {
  const { data, error } = await supabase.from("pinned_photographers").select("photographer_id");
  if (error || !data) return [];
  return data.map((r) => Number((r as { photographer_id: number | string }).photographer_id));
}

/** Trả về null nếu thành công, ngược lại là thông báo lỗi */
export async function setPinned(photographerId: number, pinned: boolean): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return "Bạn cần đăng nhập để ghim";
  if (pinned) {
    const { error } = await supabase
      .from("pinned_photographers")
      .upsert({ user_id: uid, photographer_id: photographerId }, { onConflict: "user_id,photographer_id", ignoreDuplicates: true });
    return error ? error.message : null;
  }
  const { error } = await supabase
    .from("pinned_photographers")
    .delete()
    .eq("user_id", uid)
    .eq("photographer_id", photographerId);
  return error ? error.message : null;
}

/* ───────────── Đánh giá / bình luận ───────────── */

export type ReviewRow = {
  id: string;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_avatar: string | null;
  reviewer_is_photographer: boolean;
  rating: number;
  comment: string;
  has_deal: boolean;
  created_at: string;
  updated_at: string;
};

export type ReviewSummary = {
  count: number;
  average: number;
  breakdown: Record<"1" | "2" | "3" | "4" | "5", number>;
  my_review: { id: string; rating: number; comment: string; hidden: boolean } | null;
};

export const EMPTY_SUMMARY: ReviewSummary = {
  count: 0,
  average: 0,
  breakdown: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
  my_review: null,
};

export async function fetchReviewSummary(photographerId: number): Promise<ReviewSummary> {
  const { data, error } = await supabase.rpc("get_review_summary", { p_photographer_id: photographerId });
  if (error || !data) return EMPTY_SUMMARY;
  const d = data as Partial<ReviewSummary>;
  return {
    count: Number(d.count) || 0,
    average: Number(d.average) || 0,
    breakdown: { ...EMPTY_SUMMARY.breakdown, ...(d.breakdown || {}) },
    my_review: d.my_review ?? null,
  };
}

export async function fetchReviews(photographerId: number, limit = 10, offset = 0): Promise<ReviewRow[]> {
  const { data, error } = await supabase.rpc("list_photographer_reviews", {
    p_photographer_id: photographerId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error || !data) return [];
  const arr = Array.isArray(data) ? data : (typeof data === "object" ? data : []);
  return (arr as ReviewRow[]) || [];
}

export async function submitReview(photographerId: number, rating: number, comment: string): Promise<string | null> {
  const { error } = await supabase.rpc("submit_review", {
    p_photographer_id: photographerId,
    p_rating: rating,
    p_comment: comment,
  });
  return error ? error.message : null;
}

export async function deleteMyReview(photographerId: number): Promise<string | null> {
  const { error } = await supabase.rpc("delete_my_review", { p_photographer_id: photographerId });
  return error ? error.message : null;
}

/** Photographer báo cáo bình luận trên hồ sơ của mình */
export async function reportReview(reviewId: string, reason: string, description: string): Promise<string | null> {
  const { error } = await supabase.rpc("report_review", {
    p_review_id: reviewId,
    p_reason: reason,
    p_description: description,
  });
  return error ? error.message : null;
}

/* ───────────── Thẻ thông tin người dùng ───────────── */

export type UserCard = {
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  gender: string | null;
  total_bookings: number;
  cancelled_bookings: number;
  paid_bookings: number;
  photographer_id: number | null;
};

export async function fetchUserCard(userId: string): Promise<UserCard | null> {
  const { data, error } = await supabase.rpc("get_public_user_card", { p_user_id: userId });
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    full_name: (d.full_name as string) ?? null,
    username: (d.username as string) ?? null,
    avatar_url: (d.avatar_url as string) ?? null,
    gender: (d.gender as string) ?? null,
    total_bookings: Number(d.total_bookings) || 0,
    cancelled_bookings: Number(d.cancelled_bookings) || 0,
    paid_bookings: Number(d.paid_bookings) || 0,
    photographer_id: d.photographer_id != null ? Number(d.photographer_id) : null,
  };
}

/* ───────────── Báo cáo hồ sơ / ảnh (ghi vào profile_reports) ───────────── */

export async function submitProfileReport(args: {
  reportedUserId: string;
  reportedName: string | null;
  subject: "profile" | "photo";
  reason: string;
  description: string;
  photoUrl?: string;
}): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return "Bạn cần đăng nhập để báo cáo";
  if (uid === args.reportedUserId) return "Bạn không thể báo cáo chính mình";
  const { error } = await supabase.from("profile_reports").insert({
    reporter_id: uid,
    reported_user_id: args.reportedUserId,
    reported_name: args.reportedName,
    reason: args.reason,
    description: args.description,
    subject: args.subject,
    photo_url: args.photoUrl ?? null,
  });
  return error ? error.message : null;
}


/* ───────────── Tim ảnh portfolio (online) ───────────── */

export type PhotoLikesState = {
  counts: Record<string, number>;
  likedUrls: Set<string>;
};

export async function fetchPhotoLikes(photographerId: number): Promise<PhotoLikesState> {
  const { data, error } = await supabase.rpc("get_photo_likes", { p_photographer_id: photographerId });
  if (error || !data) return { counts: {}, likedUrls: new Set() };
  const d = data as { counts?: Record<string, number>; liked_urls?: string[] };
  return {
    counts: d.counts || {},
    likedUrls: new Set(d.liked_urls || []),
  };
}

/** Toggle like 1 ảnh. Trả về { liked, count } hoặc error string */
export async function togglePhotoLike(
  photographerId: number,
  photoUrl: string
): Promise<{ liked: boolean; count: number } | { error: string }> {
  const { data, error } = await supabase.rpc("toggle_photo_like", {
    p_photographer_id: photographerId,
    p_photo_url: photoUrl,
  });
  if (error) return { error: error.message };
  const d = data as { liked?: boolean; count?: number };
  return { liked: !!d.liked, count: Number(d.count) || 0 };
}
