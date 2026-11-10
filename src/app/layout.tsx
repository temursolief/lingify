import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Lingify", template: "%s - Lingify" },
  description: "Grow your English reading and vocabulary with texts matched to what you already know.",
  applicationName: "Lingify",
  appleWebApp: { capable: true, title: "Lingify", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col font-sans antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
