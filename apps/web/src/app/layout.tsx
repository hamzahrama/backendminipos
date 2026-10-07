import type { Metadata } from "next";
import "./globals.css";
import PwaRegister from "../components/pwa-register";

export const metadata: Metadata = {
  title: "Masuk | HNI POS",
  description: "Masuk atau daftarkan toko HNI POS Anda.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}<PwaRegister /></body>
    </html>
  );
}
