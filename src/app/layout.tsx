import type { Metadata } from "next";
import "./globals.css";
import { UNIVERSITY_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: {
    default: `${UNIVERSITY_NAME} — Canteen Payment`,
    template: `%s · Canteen Payment`,
  },
  description:
    "Cashless canteen payments and digital student ID cards, powered by signed QR codes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
