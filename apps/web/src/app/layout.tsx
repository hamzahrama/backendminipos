import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Masuk | HNI POS",
  description: "Masuk atau daftarkan toko HNI POS Anda.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
