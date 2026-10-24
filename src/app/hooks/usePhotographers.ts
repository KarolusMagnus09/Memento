import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import type { Photographer } from "../types";
import { asBoards, asPinUrls } from "../lib/normalizeBoards";

function normalizePhotographer(row: any): Photographer {
  const portfolio = Array.isArray(row.portfolio) ? row.portfolio : [];
  const standalone_pins = asPinUrls(row.standalone_pins);
  const boards = asBoards(row.boards);
  const rental_boards = asBoards(row.rental_boards);
  const rental_pins = asPinUrls(row.rental_pins);

  let price_groups = row.price_groups;
  if (typeof price_groups === "string") {
    try {
      price_groups = JSON.parse(price_groups);
    } catch {
      price_groups = [];
    }
  }
  if (!Array.isArray(price_groups)) price_groups = [];

  return {
    ...row,
    id: Number(row.id),
    portfolio,
    boards,
    standalone_pins: standalone_pins.length > 0 ? standalone_pins : portfolio,
    pin_likes: row.pin_likes && typeof row.pin_likes === "object" ? row.pin_likes : {},
    price_groups,
    skill_makeup: !!row.skill_makeup,
    skill_edit: !!row.skill_edit,
    skill_rental: !!row.skill_rental,
    rental_boards,
    rental_pins,
    user_id: row.user_id ?? null,
  } as Photographer;
}

export function usePhotographers() {
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error: err } = await supabase
        .from("photographers")
        .select("*")
        .order("id", { ascending: true });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      let list = (data ?? []).map(normalizePhotographer);

      // Bổ sung rental_boards từ application approved nếu photographers thiếu ảnh
      try {
        const need = list.filter(
          (p) =>
            p.user_id &&
            (!(p.rental_boards && p.rental_boards.length) && !(p.rental_pins && p.rental_pins.length))
        );
        if (need.length > 0) {
          const ids = need.map((p) => p.user_id!).filter(Boolean);
          const { data: apps } = await supabase
            .from("photographer_applications")
            .select("user_id, rental_boards, rental_pins, price_groups, skill_rental, boards, standalone_pins")
            .eq("status", "approved")
            .in("user_id", ids);
          if (apps?.length) {
            const byUser = new Map(apps.map((a: any) => [a.user_id, a]));
            list = list.map((p) => {
              const a = p.user_id ? byUser.get(p.user_id) : null;
              if (!a) return p;
              const rb = asBoards(a.rental_boards);
              const rp = asPinUrls(a.rental_pins);
              let pg = a.price_groups;
              if (typeof pg === "string") {
                try { pg = JSON.parse(pg); } catch { pg = null; }
              }
              return {
                ...p,
                rental_boards: rb.length ? rb : p.rental_boards,
                rental_pins: rp.length ? rp : p.rental_pins,
                price_groups:
                  Array.isArray(pg) && pg.length ? pg : p.price_groups,
                skill_rental: a.skill_rental ?? p.skill_rental,
                boards: asBoards(a.boards).length ? asBoards(a.boards) : p.boards,
                standalone_pins: asPinUrls(a.standalone_pins).length
                  ? asPinUrls(a.standalone_pins)
                  : p.standalone_pins,
              };
            });
          }
        }
      } catch (e) {
        console.warn("[usePhotographers] merge applications", e);
      }

      // Số liệu thật: dùng CÙNG nguồn (RPC) với trang hồ sơ để thẻ ngoài và hồ sơ luôn khớp
      try {
        const { data: stats, error: statsErr } = await supabase.rpc("get_photographers_stats");
        if (statsErr) throw statsErr;
        if (Array.isArray(stats) && stats.length) {
          const byId = new Map<number, any>(stats.map((s: any) => [Number(s.photographer_id), s]));
          list = list.map((p) => {
            const s = byId.get(p.id);
            if (!s) return p;
            return {
              ...p,
              rating: Number(s.rating) || 0,
              review_count: Number(s.review_count) || 0,
              bookings: Number(s.completed_deals) || 0,
              hearts: Number(s.hearts) || 0,
            };
          });
        }
      } catch (e) {
        console.warn("[usePhotographers] get_photographers_stats (đã chạy SQL 031 chưa?)", e);
      }

      // Ẩn photographer đã bị admin ban khỏi marketplace
      try {
        const { data: banned } = await supabase.from("profiles").select("id").not("banned_at", "is", null);
        const bannedIds = new Set((banned ?? []).map((b: { id: string }) => b.id));
        if (bannedIds.size) list = list.filter((p) => !p.user_id || !bannedIds.has(p.user_id));
      } catch {
        /* chưa chạy SQL 030 thì bỏ qua */
      }

      if (!cancelled) {
        setPhotographers(list);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { photographers, loading, error, refresh };
}
