"use client";
import { useCallback, useEffect, useRef } from "react";

export type AntiCheatType =
  | "tab_hidden"
  | "tab_visible"
  | "window_blur"
  | "window_focus"
  | "fullscreen_exit"
  | "fullscreen_enter"
  | "page_unload"
  | "page_reload";

interface Options {
  enabled: boolean;
  fullscreenMode: boolean;
  onWarning: (r: { warning_count: number; threshold: number; locked?: boolean }) => void;
}

/**
 * Observes ONLY this page: visibilitychange, window blur/focus, fullscreen
 * changes, unload/reload. It does not and cannot see other tabs or apps.
 *
 * `suspend(ms)` silences signals caused by our own UI (GPS/camera permission
 * prompts, native file pickers), which also blur the window on mobile.
 */
export function useAntiCheat({ enabled, fullscreenMode, onWarning }: Options) {
  const suspendedUntil = useRef(0);
  const away = useRef(false);
  const pendingWarning = useRef<{ warning_count: number; threshold: number; locked?: boolean } | null>(null);
  const onWarningRef = useRef(onWarning);
  onWarningRef.current = onWarning;

  const suspend = useCallback((ms = 8000) => {
    suspendedUntil.current = Date.now() + ms;
  }, []);

  const send = useCallback(
    async (type: AntiCheatType, beacon = false) => {
      if (!enabled) return;
      const body = JSON.stringify({ type, client_at: Date.now() });
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/team/anticheat", new Blob([body], { type: "application/json" }));
        return;
      }
      try {
        const res = await fetch("/api/team/anticheat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        });
        const data = await res.json();
        if (data?.counted) {
          // Show the warning when the participant comes back to the page.
          if (document.visibilityState === "visible" && document.hasFocus()) onWarningRef.current(data);
          else pendingWarning.current = data;
        }
      } catch {
        /* offline: best effort */
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    const suspended = () => Date.now() < suspendedUntil.current;
    const flushWarning = () => {
      if (pendingWarning.current) {
        onWarningRef.current(pendingWarning.current);
        pendingWarning.current = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (suspended()) return;
        away.current = true;
        send("tab_hidden");
      } else {
        if (away.current) send("tab_visible");
        away.current = false;
        setTimeout(flushWarning, 300);
      }
    };
    const onBlur = () => {
      if (suspended()) return;
      // Ignore blur caused by focusing an iframe on this page.
      setTimeout(() => {
        if (document.activeElement?.tagName === "IFRAME") return;
        away.current = true;
        send("window_blur");
      }, 50);
    };
    const onFocus = () => {
      if (away.current) send("window_focus");
      away.current = false;
      setTimeout(flushWarning, 300);
    };
    const onFullscreen = () => {
      if (!fullscreenMode) return;
      if (document.fullscreenElement) send("fullscreen_enter");
      else if (!suspended()) send("fullscreen_exit");
    };
    const onUnload = () => send("page_unload", true);

    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "reload") send("page_reload");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("pagehide", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("pagehide", onUnload);
    };
  }, [enabled, fullscreenMode, send]);

  return { suspend };
}
