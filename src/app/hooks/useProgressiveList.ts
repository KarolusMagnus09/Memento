import { useState, useEffect, useRef, useCallback } from "react";

/** Tìm container đang scroll (App shell overflow-y-auto trên mobile). */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    const oy = style.overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Hiện dần danh sách ảnh trên mobile:
 * - 6 ảnh đầu, vuốt gần đáy → +6
 * - IntersectionObserver + fallback scroll/touchmove (iOS/Capacitor)
 * - ↓ bấm load thêm, ↑ về đầu gallery
 */
export function useProgressiveList<T>(items: T[], pageSize = 6, resetKey?: string | number | null) {
  const [visible, setVisible] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    setVisible(pageSize);
  }, [resetKey, items.length, pageSize]);

  const loadMore = useCallback(() => {
    setVisible((v) => Math.min(v + pageSize, items.length));
  }, [pageSize, items.length]);

  const scrollToTop = useCallback(() => {
    const top = topRef.current;
    if (!top) return;
    const parent = findScrollParent(top);
    if (parent) {
      const y = top.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop;
      parent.scrollTo({ top: Math.max(0, y - 8), behavior: "smooth" });
    } else {
      top.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || items.length <= pageSize) return;

    const tryLoad = () => {
      if (visibleRef.current >= items.length) return;
      const parent = findScrollParent(node);
      const bottom = parent ? parent.getBoundingClientRect().bottom : window.innerHeight;
      const rect = node.getBoundingClientRect();
      if (rect.top < bottom + 160) {
        setVisible((v) => Math.min(v + pageSize, items.length));
      }
    };

    const root = findScrollParent(node);

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible((v) => Math.min(v + pageSize, items.length));
        }
      },
      { root, rootMargin: "160px 0px", threshold: 0 }
    );
    io.observe(node);

    const scrollTarget: HTMLElement | Window = root ?? window;
    const onScroll = () => tryLoad();
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    scrollTarget.addEventListener("touchmove", onScroll, { passive: true });

    return () => {
      io.disconnect();
      scrollTarget.removeEventListener("scroll", onScroll);
      scrollTarget.removeEventListener("touchmove", onScroll);
    };
  }, [visible, items.length, pageSize]);

  return {
    items: items.slice(0, visible),
    hasMore: visible < items.length,
    remaining: Math.max(0, items.length - visible),
    sentinelRef,
    topRef,
    loadMore,
    scrollToTop,
  };
}
