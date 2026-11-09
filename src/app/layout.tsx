import type { Metadata } from "next";
import { Geist, Literata } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const literata = Literata({ variable: "--font-literata", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Lingify", template: "%s · Lingify" },
  description: "Grow your English reading and vocabulary with texts matched to what you already know.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${literata.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
