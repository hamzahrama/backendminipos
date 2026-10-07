"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Session = { accessToken: string; user: { tenant: { id: string } } };
type Report = {
  totalRevenue: number; transactionCount: number; averageBasketSize: number; averageTransactionValue: number;
  hourly: Array<{ hour: number; label: string; transactions: number; revenue: number }>;
  categories: Array<{ categoryId: string | null; category: string; quantity: number; revenue: number }>;
};
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const money = (value: number) => `Rp ${value.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
const todayJakarta = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default function ReportsPanel({ session }: { session: Session }) {
  const today = todayJakarta();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ from, to });
      const response = await fetch(`${API_URL}/reports/summary?${query}`, {
        headers: { Authorization: `Bearer ${session.accessToken}`, "x-tenant-id": session.user.tenant.id },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Laporan tidak dapat dimuat.");
      setReport(result as Report);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Laporan tidak dapat dimuat."); }
    finally { setLoading(false); }
  }, [from, to, session.accessToken, session.user.tenant.id]);
  useEffect(() => { void load(); }, [load]);

  return <div className="reports-panel"><div className="catalog-heading"><div><span className="dashboard-label">RINGKASAN PENJUALAN</span><h3>Laporan toko</h3><p>Angka penjualan mengikuti zona waktu Jakarta.</p></div></div>
    <section className="catalog-panel"><form className="report-filter" onSubmit={(event) => { event.preventDefault(); void load(); }}><label>Dari<input required type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Sampai<input required type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="button button-primary" disabled={loading} type="submit">{loading ? "Memuat…" : "Terapkan"}</button></form></section>
    {error && <p className="feedback error" role="alert">{error}</p>}
    {report && <><section className="report-kpis"><article><span>Omzet bersih</span><strong>{money(report.totalRevenue)}</strong></article><article><span>Transaksi</span><strong>{report.transactionCount.toLocaleString("id-ID")}</strong></article><article><span>Rata-rata item per transaksi</span><strong>{report.averageBasketSize.toLocaleString("id-ID")}</strong></article><article><span>Rata-rata nilai transaksi</span><strong>{money(report.averageTransactionValue)}</strong></article></section>
      <section className="catalog-panel report-chart"><div className="section-title"><h4>Penjualan per jam (WIB)</h4><span className="field-hint">Omzet dan jumlah transaksi</span></div><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.hourly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" interval={2} tick={{ fontSize: 10 }} /><YAxis yAxisId="left" tick={{ fontSize: 9 }} /><YAxis yAxisId="right" orientation="right" allowDecimals={false} tick={{ fontSize: 9 }} /><Tooltip formatter={(value, name) => name === "Omzet" ? money(Number(value)) : value} /><Legend /><Bar yAxisId="left" dataKey="revenue" name="Omzet" fill="#18744b" radius={[3, 3, 0, 0]} /><Bar yAxisId="right" dataKey="transactions" name="Transaksi" fill="#88bd99" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></section>
      <section className="catalog-panel report-chart"><div className="section-title"><h4>Penjualan per kategori</h4></div><div className="product-table-wrap"><table className="product-table"><thead><tr><th>Kategori</th><th>Jumlah item</th><th>Omzet item</th></tr></thead><tbody>{report.categories.map((category) => <tr key={category.categoryId ?? "uncategorized"}><td>{category.category}</td><td>{category.quantity.toLocaleString("id-ID")}</td><td>{money(category.revenue)}</td></tr>)}{!report.categories.length && <tr><td className="empty-table" colSpan={3}>Belum ada transaksi pada rentang ini.</td></tr>}</tbody></table></div></section>
    </>}
  </div>;
}
