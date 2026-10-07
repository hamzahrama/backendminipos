"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
type Session = { accessToken: string; user: { tenant: { id: string } } };
type Voucher = { id: string; code: string; discountType: "PERCENT" | "FIXED"; value: string; minSubtotal: string; maxDiscount: string | null; maxUses: number | null; usedCount: number; isActive: boolean; endsAt: string | null };
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function VouchersPanel({ session }: { session: Session }) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [form, setForm] = useState({ code: "", discountType: "PERCENT" as "PERCENT" | "FIXED", value: "", minSubtotal: "0", maxDiscount: "", maxUses: "", endsAt: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${path}`, { ...init, headers: {
      Authorization: `Bearer ${session.accessToken}`, "x-tenant-id": session.user.tenant.id,
      "Content-Type": "application/json", ...init.headers,
    } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? "Permintaan voucher gagal.");
    return result;
  }, [session.accessToken, session.user.tenant.id]);
  const load = useCallback(async () => setVouchers(await api("/vouchers") as Voucher[]), [api]);
  useEffect(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Voucher gagal dimuat.")); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await api("/vouchers", { method: "POST", body: JSON.stringify({
        code: form.code, discountType: form.discountType, value: Number(form.value),
        minSubtotal: Number(form.minSubtotal || 0), maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59+07:00`).toISOString() : undefined,
      }) });
      setForm({ code: "", discountType: "PERCENT", value: "", minSubtotal: "0", maxDiscount: "", maxUses: "", endsAt: "" });
      await load(); setMessage("Voucher dibuat.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Voucher gagal dibuat."); }
    finally { setBusy(false); }
  }

  async function deactivate(id: string, code: string) {
    if (!window.confirm(`Nonaktifkan voucher ${code}?`)) return;
    setError("");
    try { await api(`/vouchers/${id}`, { method: "DELETE" }); await load(); setMessage(`Voucher ${code} dinonaktifkan.`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Voucher gagal dinonaktifkan."); }
  }

  return <div className="customers-panel"><div className="catalog-heading"><div><span className="dashboard-label">PROMO</span><h3>Voucher toko</h3><p>Buat kode diskon untuk transaksi POS.</p></div><span className="product-count">{vouchers.filter((voucher) => voucher.isActive).length} aktif</span></div>
    {error && <p className="feedback error" role="alert">{error}</p>}{message && <p className="feedback success" role="status">{message}</p>}
    <section className="catalog-panel"><h4>Buat voucher</h4><form className="customer-form" onSubmit={create}>
      <label>Kode<input required pattern="[A-Za-z0-9_-]{3,32}" maxLength={32} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></label>
      <label>Jenis<select value={form.discountType} onChange={(event) => setForm({ ...form, discountType: event.target.value as "PERCENT" | "FIXED" })}><option value="PERCENT">Persen</option><option value="FIXED">Potongan rupiah</option></select></label>
      <label>Nilai diskon<input required min="0.01" step="0.01" max={form.discountType === "PERCENT" ? 100 : undefined} type="number" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} /></label>
      <label>Minimum belanja<input min="0" step="100" type="number" value={form.minSubtotal} onChange={(event) => setForm({ ...form, minSubtotal: event.target.value })} /></label>
      <label>Batas diskon maks. (opsional)<input min="0" step="100" type="number" value={form.maxDiscount} onChange={(event) => setForm({ ...form, maxDiscount: event.target.value })} /></label>
      <label>Batas penggunaan (opsional)<input min="1" step="1" type="number" value={form.maxUses} onChange={(event) => setForm({ ...form, maxUses: event.target.value })} /></label>
      <label>Berlaku sampai (opsional)<input type="date" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label>
      <div className="form-actions"><button className="button button-primary" disabled={busy} type="submit">{busy ? "Menyimpan…" : "Buat voucher"}</button></div>
    </form></section>
    <section className="catalog-panel"><h4>Daftar voucher</h4><div className="product-table-wrap"><table className="product-table"><thead><tr><th>Kode</th><th>Diskon</th><th>Minimum</th><th>Terpakai</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{vouchers.map((voucher) => <tr key={voucher.id}><td>{voucher.code}</td><td>{voucher.discountType === "PERCENT" ? `${Number(voucher.value)}%` : `Rp ${Number(voucher.value).toLocaleString("id-ID")}`}</td><td>Rp {Number(voucher.minSubtotal).toLocaleString("id-ID")}</td><td>{voucher.usedCount}{voucher.maxUses ? ` / ${voucher.maxUses}` : ""}</td><td>{voucher.isActive ? "Aktif" : "Nonaktif"}</td><td>{voucher.isActive && <button className="row-action danger-action" onClick={() => void deactivate(voucher.id, voucher.code)} type="button">Nonaktifkan</button>}</td></tr>)}{!vouchers.length && <tr><td className="empty-table" colSpan={6}>Voucher belum tersedia.</td></tr>}</tbody></table></div></section>
  </div>;
}
