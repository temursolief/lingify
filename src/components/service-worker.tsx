"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production builds. In development it is removed instead, because cached
 * files would hide code changes.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    } else {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    }
  }, []);
  return null;
}
