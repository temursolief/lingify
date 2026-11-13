import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

/** Self-hosted at build time: no request to Google when a page opens, and the offline copy keeps it. */
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Lingify", template: "%s - Lingify" },
  description: "Grow your English reading and vocabulary with texts matched to what you already know.",
  applicationName: "Lingify",
  appleWebApp: { capable: true, title: "Lingify", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#161826", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full ${inter.variable}`}>
      <body className="flex min-h-full flex-col font-sans antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
