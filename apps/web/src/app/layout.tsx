import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HNI POS",
  description: "Web Mini POS & Inventaris HNI",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
