import type { Metadata } from "next";
import { OfflineApp } from "./offline-app";

export const metadata: Metadata = { title: "Offline" };

/**
 * A fully static page: the service worker keeps it on the laptop and shows it whenever the internet is down.
 * Everything on it comes from the copy saved in the browser, so it needs no server at all.
 */
export default function OfflinePage() {
  return <OfflineApp />;
}
