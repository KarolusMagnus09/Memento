import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    hcaptcha?: {
      render: (
        container: HTMLElement,
        params: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark";
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY as string | undefined;

/**
 * Renders an hCaptcha checkbox and reports the verification token back
 * to the parent via onToken (null when it expires/errors/resets).
 * If no site key is configured, renders nothing and the parent should
 * treat captcha as "not required" (dev/demo fallback).
 */
export function Captcha({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    function tryRender() {
      if (cancelled || !containerRef.current || !window.hcaptcha) return;
      if (widgetIdRef.current !== null) return; // already rendered
      widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
        sitekey: SITE_KEY!,
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
      setReady(true);
    }

    if (window.hcaptcha) {
      tryRender();
    } else {
      const interval = setInterval(() => {
        if (window.hcaptcha) {
          clearInterval(interval);
          tryRender();
        }
      }, 200);
      return () => { cancelled = true; clearInterval(interval); };
    }
    return () => { cancelled = true; };
  }, [onToken]);

  useEffect(() => {
    if (resetKey !== undefined && widgetIdRef.current !== null && window.hcaptcha) {
      window.hcaptcha.reset(widgetIdRef.current);
      onToken(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!SITE_KEY) return null; // captcha not configured — skip silently

  return <div ref={containerRef} className="my-3" style={{ minHeight: ready ? undefined : 78 }} />;
}

export const CAPTCHA_ENABLED = Boolean(SITE_KEY);
