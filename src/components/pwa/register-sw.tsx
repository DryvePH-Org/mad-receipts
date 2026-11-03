"use client";

import { useEffect } from "react";

/** Registers the small service worker that shows an offline page. Production only. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Not installable here (for example an unsupported browser). The app works the same without it.
    });
  }, []);
  return null;
}
