import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

/** Self-hosted at build time: no request to Google when a page opens, and the offline copy keeps it. */
const barlow = Barlow({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-barlow", display: "swap" });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin", "latin-ext"], weight: ["600", "700"], variable: "--font-barlow-condensed", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Lingify", template: "%s - Lingify" },
  description: "Grow your English reading and vocabulary with texts matched to what you already know.",
  applicationName: "Lingify",
  appleWebApp: { capable: true, title: "Lingify", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#1e2a2c", colorScheme: "light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full ${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="flex min-h-full flex-col font-sans antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
