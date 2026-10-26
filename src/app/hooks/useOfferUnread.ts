import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_OFFER_UNREAD, fetchOfferUnread, subscribeOfferInbox, type OfferUnread } from "../lib/requestOffers";

/** Số tin chưa đọc của chat đề nghị, cập nhật realtime khi có tin mới. */
export function useOfferUnread(userId: string | null) {
  const [unread, setUnread] = useState<OfferUnread>(EMPTY_OFFER_UNREAD);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) { setUnread(EMPTY_OFFER_UNREAD); return; }
    const u = await fetchOfferUnread();
    if (u) setUnread(u);
  }, [userId]);

  useEffect(() => {
    void refresh();
    if (!userId) return;
    // gộp nhiều tin đến liên tiếp thành 1 lần tải
    const off = subscribeOfferInbox(userId, () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void refresh(), 300);
    });
    return () => { off(); if (timer.current) clearTimeout(timer.current); };
  }, [userId, refresh]);

  return { unread, refresh };
}
