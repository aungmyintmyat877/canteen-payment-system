import type { Metadata } from "next";
import "./globals.css";
import { UNIVERSITY_NAME } from "@/lib/site";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";

export const metadata: Metadata = {
  title: {
    default: `${UNIVERSITY_NAME} - Canteen Payment`,
    template: `%s - Canteen Payment`,
  },
  description:
    "Cashless canteen payments and digital student ID cards, powered by signed QR codes.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}