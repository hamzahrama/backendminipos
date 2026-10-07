"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
type Session = { accessToken: string; user: { tenant: { id: string } } };
type Pnl = { revenue: number; costOfGoods: number; grossProfit: number; operatingExpense: number; netProfit: number; missingCostMovementCount: number; expenseCategories: Array<{ category: string; amount: number }> };
type Expense = { id: string; date: string; category: string; description: string | null; amount: string };
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const money = (amount: number) => `Rp ${amount.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;

export default function ProfitLossPanel({ session }: { session: Session }) {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<Pnl | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expense, setExpense] = useState({ date: today(), category: "Operasional", description: "", amount: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${path}`, { ...init, headers: {
      Authorization: `Bearer ${session.accessToken}`, "x-tenant-id": session.user.tenant.id,
      "Content-Type": "application/json", ...init.headers,
    } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? "Permintaan laporan gagal.");
    return result;
  }, [session.accessToken, session.user.tenant.id]);

  const load = useCallback(async () => {
    setError(""); setBusy(true);
    try {
      const query = new URLSearchParams({ from, to });
      const [pnl, expenseRows] = await Promise.all([
        api(`/reports/profit-loss?${query}`), api(`/expenses?${query}`),
      ]);
      setReport(pnl as Pnl); setExpenses(expenseRows as Expense[]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Laporan gagal dimuat."); }
    finally { setBusy(false); }
  }, [api, from, to]);
  useEffect(() => { void load(); }, [load]);

  async function createExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      await api("/expenses", { method: "POST", body: JSON.stringify({ ...expense, amount: Number(expense.amount) }) });
      setExpense((current) => ({ ...current, description: "", amount: "" }));
      await load(); setMessage("Pengeluaran disimpan.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Pengeluaran gagal disimpan."); }
  }

  async function removeExpense(item: Expense) {
    if (!window.confirm(`Hapus pengeluaran ${item.category} sebesar ${money(Number(item.amount))}?`)) return;
    try { await api(`/expenses/${item.id}`, { method: "DELETE" }); await load(); setMessage("Pengeluaran dihapus."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Pengeluaran gagal dihapus."); }
  }

  function exportExcel() {
    if (!report) return;
    const rows = [
      ["Laporan", "Nilai"], ["Periode", `${from} - ${to}`], ["Omzet", report.revenue],
      ["HPP", report.costOfGoods], ["Laba kotor", report.grossProfit],
      ["Pengeluaran operasional", report.operatingExpense], ["Laba bersih", report.netProfit],
      ["Pergerakan stok tanpa HPP", report.missingCostMovementCount],
      ["Kategori pengeluaran", "Jumlah"], ...report.expenseCategories.map((row) => [row.category, row.amount]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Laba Rugi");
    XLSX.writeFile(workbook, `laba-rugi-${from}-${to}.xlsx`);
  }

  return <div className="profit-loss-panel"><div className="catalog-heading"><div><span className="dashboard-label">KEUANGAN</span><h3>Laba rugi</h3><p>HPP dihitung dari harga pokok batch yang keluar pada transaksi.</p></div></div>
    {error && <p className="feedback error" role="alert">{error}</p>}{message && <p className="feedback success" role="status">{message}</p>}
    <section className="catalog-panel pnl-screen-only"><form className="report-filter" onSubmit={(event) => { event.preventDefault(); void load(); }}><label>Dari<input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Sampai<input type="date" required value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="button button-primary" disabled={busy} type="submit">Perbarui</button>{report && <><button className="button button-secondary" onClick={exportExcel} type="button">Unduh Excel (.xlsx)</button><button className="button button-secondary" onClick={() => window.print()} type="button">Cetak / PDF</button></>}</form></section>
    {report && <section id="pnl-printable"><div className="catalog-panel"><div className="section-title"><h4>Ringkasan · {from} sampai {to}</h4></div><div className="report-kpis"><article><span>Omzet</span><strong>{money(report.revenue)}</strong></article><article><span>HPP batch</span><strong>{money(report.costOfGoods)}</strong></article><article><span>Laba kotor</span><strong>{money(report.grossProfit)}</strong></article><article><span>Pengeluaran operasional</span><strong>{money(report.operatingExpense)}</strong></article><article><span>Laba bersih</span><strong>{money(report.netProfit)}</strong></article></div>{report.missingCostMovementCount > 0 && <p className="feedback error">Ada {report.missingCostMovementCount} pergerakan stok keluar tanpa harga pokok batch; HPP dan laba bisa lebih rendah dari nilai sebenarnya.</p>}</div>
      <div className="catalog-panel"><h4>Rincian pengeluaran</h4><div className="product-table-wrap"><table className="product-table"><thead><tr><th>Kategori</th><th>Jumlah</th></tr></thead><tbody>{report.expenseCategories.map((row) => <tr key={row.category}><td>{row.category}</td><td>{money(row.amount)}</td></tr>)}{!report.expenseCategories.length && <tr><td className="empty-table" colSpan={2}>Belum ada pengeluaran.</td></tr>}</tbody></table></div></div></section>}
    <section className="catalog-panel pnl-screen-only"><h4>Catat pengeluaran</h4><form className="customer-form" onSubmit={createExpense}><label>Tanggal<input required type="date" value={expense.date} onChange={(event) => setExpense({ ...expense, date: event.target.value })} /></label><label>Kategori<input required maxLength={80} value={expense.category} onChange={(event) => setExpense({ ...expense, category: event.target.value })} /></label><label>Nominal<input required min="0.01" step="0.01" type="number" value={expense.amount} onChange={(event) => setExpense({ ...expense, amount: event.target.value })} /></label><label className="wide-field">Catatan<input maxLength={500} value={expense.description} onChange={(event) => setExpense({ ...expense, description: event.target.value })} /></label><div className="form-actions"><button className="button button-primary" type="submit">Simpan pengeluaran</button></div></form></section>
    <section className="catalog-panel pnl-screen-only"><h4>Daftar pengeluaran ({expenses.length})</h4><div className="product-table-wrap"><table className="product-table"><thead><tr><th>Tanggal</th><th>Kategori</th><th>Catatan</th><th>Nominal</th><th>Aksi</th></tr></thead><tbody>{expenses.map((item) => <tr key={item.id}><td>{item.date.slice(0, 10)}</td><td>{item.category}</td><td>{item.description ?? "—"}</td><td>{money(Number(item.amount))}</td><td><button className="row-action danger-action" onClick={() => void removeExpense(item)} type="button">Hapus</button></td></tr>)}{!expenses.length && <tr><td className="empty-table" colSpan={5}>Tidak ada pengeluaran untuk rentang ini.</td></tr>}</tbody></table></div></section>
  </div>;
}
