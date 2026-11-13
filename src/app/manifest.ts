import type { MetadataRoute } from "next";

/** Lets students install Lingify as its own app window, like Telegram Desktop. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lingify",
    short_name: "Lingify",
    description: "English reading and vocabulary at your level.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#efe9db",
    theme_color: "#1e2a2c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
