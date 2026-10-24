import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

export type Profile = {
  id: string;
  username: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  phone: string | null;
  phone_verified: boolean;
  gender: "female" | "male" | "other" | null;
  role: "customer" | "photographer" | "admin";
  onboarding_completed: boolean;
  /** Có giá trị = tài khoản đã bị admin ban */
  banned_at?: string | null;
  ban_reason?: string | null;
};

// Trigger `handle_new_user` tạo dòng profiles khi signUp — có thể trễ vài trăm ms.
const RETRY_DELAYS_MS = [300, 600, 1000, 1500, 2000];

export function useProfile(userId: string | null | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  // true khi đang có userId cần load — tránh 1 frame loading=false + profile=null sau login (màn trắng)
  const [loading, setLoading] = useState(!!userId);
  const [error, setError] = useState<string | null>(null);
  const genRef = useRef(0);

  const load = useCallback(async (uid: string, attempt: number, gen: number) => {
    const { data, error: err } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();

    // Bỏ qua response cũ nếu userId đã đổi
    if (gen !== genRef.current) return;

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    if (!data && attempt < RETRY_DELAYS_MS.length) {
      setTimeout(() => load(uid, attempt + 1, gen), RETRY_DELAYS_MS[attempt]);
      return;
    }

    setProfile(data as Profile | null);
    setLoading(false);
  }, []);

  const refresh = useCallback(() => {
    const gen = ++genRef.current;
    if (!userId) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    load(userId, 0, gen);
  }, [userId, load]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { profile, loading, error, refresh, setProfile };
}
