"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Customer = { id: string; name: string; phone: string | null; address: string | null; hniProfile: { hniId: string; uplineHniId: string | null } | null };
type CustomerProfile = Customer & {
  totalPv: number;
  transactions: Array<{ id: string; invoiceNo: string; total: string; totalPv: string; createdAt: string }>;
};
type Session = { accessToken: string; user: { tenant: { id: string } } };
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const empty = { name: "", phone: "", hniId: "", uplineHniId: "", address: "" };

export default function CustomersPanel({ session }: { session: Session }) {
  const [rows, setRows] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.accessToken}`, "x-tenant-id": session.user.tenant.id,
        "Content-Type": "application/json", ...init.headers,
      },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message[0] : body.message ?? "Permintaan customer gagal.");
    return body;
  }, [session.accessToken, session.user.tenant.id]);

  const load = useCallback(async () => {
    setRows(await api(`/customers${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`) as Customer[]);
  }, [api, search]);
  useEffect(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Customer gagal dimuat.")); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    if (form.hniId && !/^[a-z0-9-]{4,32}$/i.test(form.hniId)) { setError("ID HNI harus berisi 4–32 karakter alfanumerik atau tanda hubung."); setBusy(false); return; }
    try {
      await api(editing ? `/customers/${editing}` : "/customers", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ ...form, phone: form.phone || null, hniId: form.hniId || null, uplineHniId: form.uplineHniId || null, address: form.address || null }),
      });
      await load(); setForm(empty); setEditing(null); setMessage(editing ? "Customer diperbarui." : "Customer ditambahkan.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Customer gagal disimpan."); }
    finally { setBusy(false); }
  }

  function edit(customer: Customer) {
    setEditing(customer.id); setForm({
      name: customer.name, phone: customer.phone ?? "", hniId: customer.hniProfile?.hniId ?? "",
      uplineHniId: customer.hniProfile?.uplineHniId ?? "", address: customer.address ?? "",
    }); setProfile(null);
  }

  async function showProfile(id: string) {
    setError("");
    try { setProfile(await api(`/customers/${id}`) as CustomerProfile); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Profil customer gagal dimuat."); }
  }

  async function remove(customer: Customer) {
    if (!window.confirm(`Hapus data customer ${customer.name}? Data transaksi historis tetap disimpan tanpa tautan customer.`)) return;
    setError(""); setMessage("");
    try {
      await api(`/customers/${customer.id}`, { method: "DELETE" });
      setRows((current) => current.filter((row) => row.id !== customer.id));
      if (profile?.id === customer.id) setProfile(null);
      setMessage("Customer dihapus.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Customer gagal dihapus."); }
  }

  return <div className="customers-panel">
    <div className="catalog-heading"><div><span className="dashboard-label">DATA PELANGGAN</span><h3>Customer & member</h3><p>Kelola identitas member dan lihat ringkasan PV serta transaksi.</p></div><span className="product-count">{rows.length} customer</span></div>
    {error && <p className="feedback error" role="alert">{error}</p>}{message && <p className="feedback success" role="status">{message}</p>}
    <section className="catalog-panel"><h4>{editing ? "Ubah customer" : "Tambah customer"}</h4>
      <form className="customer-form" onSubmit={save}>
        <label>Nama<input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>No. WhatsApp<input maxLength={32} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label>ID Member HNI<input maxLength={32} value={form.hniId} onChange={(event) => setForm({ ...form, hniId: event.target.value })} /><small>Opsional, 4–32 huruf, angka, atau tanda hubung.</small></label>
        <label>ID Upline<input maxLength={32} value={form.uplineHniId} onChange={(event) => setForm({ ...form, uplineHniId: event.target.value })} /></label>
        <label className="wide-field">Alamat<input maxLength={500} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
        <div className="form-actions"><button className="button button-primary" disabled={busy} type="submit">{busy ? "Menyimpan…" : editing ? "Simpan perubahan" : "Tambah customer"}</button>{editing && <button className="button button-secondary" onClick={() => { setEditing(null); setForm(empty); }} type="button">Batal</button>}</div>
      </form>
    </section>
    <section className="catalog-panel"><div className="section-title"><h4>Daftar customer</h4><input className="search-input" placeholder="Cari nama, telepon, atau ID HNI" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load().catch((caught) => setError(caught.message)); }} /><button className="button button-secondary" onClick={() => void load().catch((caught) => setError(caught.message))} type="button">Cari</button></div>
      <div className="product-table-wrap"><table className="product-table"><thead><tr><th>Nama</th><th>WhatsApp</th><th>ID HNI</th><th>Aksi</th></tr></thead><tbody>{rows.map((customer) => <tr key={customer.id}><td>{customer.name}</td><td>{customer.phone ?? "—"}</td><td>{customer.hniProfile?.hniId ?? "Non-member"}</td><td><button className="row-action" onClick={() => void showProfile(customer.id)} type="button">Profil</button><button className="row-action" onClick={() => edit(customer)} type="button">Ubah</button><button className="row-action danger-action" onClick={() => void remove(customer)} type="button">Hapus</button></td></tr>)}{!rows.length && <tr><td className="empty-table" colSpan={4}>Customer belum tersedia.</td></tr>}</tbody></table></div>
    </section>
    {profile && <section className="catalog-panel customer-profile"><div className="section-title"><h4>Profil {profile.name}</h4><button className="text-button" onClick={() => setProfile(null)} type="button">Tutup</button></div><div className="detail-grid"><span>ID HNI<strong>{profile.hniProfile?.hniId ?? "Non-member"}</strong></span><span>Total PV<strong>{profile.totalPv.toLocaleString("id-ID")}</strong></span><span>Telepon<strong>{profile.phone ?? "—"}</strong></span><span>Alamat<strong>{profile.address ?? "—"}</strong></span></div><h4>Transaksi terakhir</h4><div className="product-table-wrap"><table className="product-table"><thead><tr><th>Invoice</th><th>Tanggal</th><th>Total</th><th>PV</th></tr></thead><tbody>{profile.transactions.map((transaction) => <tr key={transaction.id}><td>{transaction.invoiceNo}</td><td>{new Date(transaction.createdAt).toLocaleString("id-ID")}</td><td>Rp {Number(transaction.total).toLocaleString("id-ID")}</td><td>{Number(transaction.totalPv).toLocaleString("id-ID")}</td></tr>)}{!profile.transactions.length && <tr><td className="empty-table" colSpan={4}>Belum ada transaksi.</td></tr>}</tbody></table></div></section>}
  </div>;
}
