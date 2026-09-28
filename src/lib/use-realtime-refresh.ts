"use client";

import { useEffect, useRef } from "react";

export function useRealtimeRefresh(load: () => void | Promise<void>, intervalMs = 15000) {
  const loadRef = useRef(load);
  const runningRef = useRef(false);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    const refresh = async () => {
      if (document.hidden || runningRef.current) return;
      runningRef.current = true;
      try {
        await loadRef.current();
      } finally {
        runningRef.current = false;
      }
    };

    const interval = window.setInterval(refresh, intervalMs);
    const onFocus = () => refresh();
    const onVisible = () => {
      if (!document.hidden) refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
}
