import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Lingify", template: "%s - Lingify" },
  description: "Grow your English reading and vocabulary with texts matched to what you already know.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
