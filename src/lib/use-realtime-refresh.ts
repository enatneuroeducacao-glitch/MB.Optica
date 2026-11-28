"use client";

import { useEffect, useRef } from "react";

const DATA_UPDATED_EVENT = "mb:data-updated";
const DATA_SYNC_CHANNEL = "mb-data-sync-v1";
const DATA_SYNC_STORAGE_KEY = "mb:data-sync";

export function useRealtimeRefresh(load: () => void | Promise<void>, intervalMs = 15000) {
  const loadRef = useRef(load);
  const runningRef = useRef(false);
  const pendingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    let disposed = false;

    const refresh = async () => {
      if (disposed || document.hidden) return;
      if (runningRef.current) {
        pendingRef.current = true;
        return;
      }

      runningRef.current = true;
      try {
        await loadRef.current();
      } finally {
        runningRef.current = false;
        if (pendingRef.current && !disposed) {
          pendingRef.current = false;
          scheduleRefresh();
        }
      }
    };

    function scheduleRefresh() {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void refresh();
      }, 180);
    }

    const onLocalUpdate = () => scheduleRefresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === DATA_SYNC_STORAGE_KEY && event.newValue) scheduleRefresh();
    };
    const channel = typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(DATA_SYNC_CHANNEL)
      : null;
    const onBroadcast = () => scheduleRefresh();

    channel?.addEventListener("message", onBroadcast);
    window.addEventListener(DATA_UPDATED_EVENT, onLocalUpdate);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onLocalUpdate);
    document.addEventListener("visibilitychange", onLocalUpdate);

    const interval = intervalMs > 0 ? window.setInterval(refresh, intervalMs) : null;

    return () => {
      disposed = true;
      if (interval !== null) window.clearInterval(interval);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      channel?.removeEventListener("message", onBroadcast);
      channel?.close();
      window.removeEventListener(DATA_UPDATED_EVENT, onLocalUpdate);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onLocalUpdate);
      document.removeEventListener("visibilitychange", onLocalUpdate);
    };
  }, [intervalMs]);
}
