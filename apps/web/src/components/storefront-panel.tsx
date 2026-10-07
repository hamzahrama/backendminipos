"use client";

import { FormEvent, useEffect, useState } from "react";

type Session = { accessToken: string; user: { tenant: { id: string; slug: string } } };
type Settings = { publicCatalogEnabled: boolean; whatsAppNumber: string | null; dailyReportEnabled: boolean; dailyReportHour: number };
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function StorefrontPanel({ session }: { session: Session }) {
  const [enabled, setEnabled] = useState(false);
  const [number, setNumber] = useState("");
  const [dailyReportEnabled, setDailyReportEnabled] = useState(false);
  const [dailyReportHour, setDailyReportHour] = useState(8);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const headers = { Authorization: `Bearer ${session.accessToken}`, "x-tenant-id": session.user.tenant.id, "Content-Type": "application/json" };
  useEffect(() => {
    void fetch(`${apiUrl}/storefront/settings`, { headers }).then(async (response) => {
      const body = await response.json() as Settings & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Pengaturan katalog gagal dimuat.");
      setEnabled(body.publicCatalogEnabled); setNumber(body.whatsAppNumber ?? ""); setDailyReportEnabled(body.dailyReportEnabled); setDailyReportHour(body.dailyReportHour); setLoaded(true);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Pengaturan katalog gagal dimuat."));
  // The session token is stable until login refresh; this effect only loads the initial form.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    try {
      const response = await fetch(`${apiUrl}/storefront/settings`, { method: "PATCH", headers, body: JSON.stringify({ publicCatalogEnabled: enabled, whatsAppNumber: number || null, dailyReportEnabled, dailyReportHour }) });
      const body = await response.json() as Settings & { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message[0] : body.message ?? "Pengaturan gagal disimpan.");
      setEnabled(body.publicCatalogEnabled); setNumber(body.whatsAppNumber ?? ""); setDailyReportEnabled(body.dailyReportEnabled); setDailyReportHour(body.dailyReportHour); setNotice("Pengaturan toko tersimpan.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Pengaturan gagal disimpan."); }
  }
  return <section className="mx-auto max-w-2xl space-y-5 p-6"><header><h1 className="text-2xl font-bold">Katalog publik & WhatsApp</h1><p className="mt-1 text-sm text-slate-600">Buka katalog hanya setelah memeriksa produk dan harga yang tampil ke pengunjung.</p></header>
    {error && <p role="alert" className="text-red-700">{error}</p>}{notice && <p role="status" className="text-emerald-700">{notice}</p>}
    {loaded && <form onSubmit={save} className="space-y-5 rounded-xl border bg-white p-5"><label className="flex items-start gap-3"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span><strong>Aktifkan katalog publik</strong><span className="block text-sm text-slate-600">Alamat: <a className="underline" href={`/katalog/${encodeURIComponent(session.user.tenant.slug)}`} target="_blank" rel="noreferrer">/katalog/{session.user.tenant.slug}</a></span></span></label>
      <label className="block"><span className="mb-1 block font-medium">Nomor WhatsApp toko</span><input className="w-full rounded-lg border px-3 py-2" inputMode="tel" value={number} onChange={(event) => setNumber(event.target.value.replace(/[^0-9+]/g, ""))} placeholder="62812..." /><span className="mt-1 block text-xs text-slate-500">Pakai kode negara, contoh 62812… Tautan pesanan baru dibuka setelah pengunjung menekan tombol WhatsApp.</span></label>
      <fieldset className="space-y-3 border-t pt-4"><legend className="font-semibold">Email laporan harian</legend><label className="flex items-center gap-3"><input type="checkbox" checked={dailyReportEnabled} onChange={(event) => setDailyReportEnabled(event.target.checked)} /><span>Kirim ringkasan kepada email owner tenant</span></label><label className="flex items-center gap-3">Jam kirim (WIB)<input className="w-24 rounded border px-3 py-2" type="number" min={0} max={23} value={dailyReportHour} onChange={(event) => setDailyReportHour(Number(event.target.value))} /></label><p className="text-xs text-slate-500">Perlu SMTP dikonfigurasi server. Ringkasan hanya dikirim kepada owner setelah opsi ini diaktifkan.</p></fieldset>
      <button className="rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white">Simpan</button>
    </form>}</section>;
}
