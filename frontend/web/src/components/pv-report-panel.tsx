"use client";

import { useCallback, useEffect, useState } from "react";
type Session = { accessToken: string; user: { tenant: { id: string } } };
type DetailRow = { customerId: string | null; hniId: string | null; name: string; sku: string; product: string; quantity: number; totalPv: number };
type PvReport = {
  month: string; totalPv: number;
  members: Array<{ customerId: string | null; name: string; hniId: string | null; totalPv: number }>;
  products: Array<{ sku: string; product: string; totalPv: number }>;
  details: DetailRow[];
};
type Granularity = "member" | "detail";
type ColumnKey = "hniId" | "name" | "sku" | "product" | "quantity" | "totalPv" | "month" | "period";
type ColumnSetting = { key: ColumnKey; label: string; enabled: boolean };
type CsvSettings = { granularity: Granularity; delimiter: "," | ";" | "\t"; includeHeader: boolean; decimalComma: boolean; columns: ColumnSetting[] };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const currentMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(new Date());
const COLUMN_TITLES: Record<ColumnKey, string> = {
  hniId: "ID HNI", name: "Nama member", sku: "Kode produk (SKU)", product: "Nama produk", quantity: "Jumlah", totalPv: "PV", month: "Bulan (YYYY-MM)", period: "Periode (MMYYYY)",
};
const DEFAULT_SETTINGS: CsvSettings = {
  granularity: "member", delimiter: ",", includeHeader: true, decimalComma: false,
  columns: [
    { key: "hniId", label: "ID HNI", enabled: true }, { key: "name", label: "Nama Member", enabled: true },
    { key: "sku", label: "Kode Produk", enabled: false }, { key: "product", label: "Nama Produk", enabled: false },
    { key: "quantity", label: "Qty", enabled: false }, { key: "totalPv", label: "PV", enabled: true },
    { key: "month", label: "Bulan", enabled: true }, { key: "period", label: "Periode", enabled: false },
  ],
};

function loadSettings(tenantId: string): CsvSettings {
  try {
    const stored = window.localStorage.getItem(`hni-pv-csv-${tenantId}`);
    if (!stored) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(stored) as CsvSettings;
    const known = new Set(parsed.columns.map((column) => column.key));
    return { ...DEFAULT_SETTINGS, ...parsed, columns: [...parsed.columns.filter((column) => column.key in COLUMN_TITLES), ...DEFAULT_SETTINGS.columns.filter((column) => !known.has(column.key))] };
  } catch { return DEFAULT_SETTINGS; }
}

function buildPvCsv(report: PvReport, settings: CsvSettings): string {
  const columns = settings.columns.filter((column) => column.enabled);
  const formatNumber = (value: number) => settings.decimalComma ? String(value).replace(".", ",") : String(value);
  const [year, month] = report.month.split("-");
  const rows: Array<Record<ColumnKey, string>> = (settings.granularity === "detail"
    ? report.details.filter((row) => row.hniId)
    : report.members.filter((row) => row.hniId).map((row) => ({ ...row, sku: "", product: "", quantity: 0 }))
  ).map((row) => ({
    hniId: row.hniId ?? "", name: row.name, sku: row.sku, product: row.product,
    quantity: settings.granularity === "detail" ? formatNumber(row.quantity) : "", totalPv: formatNumber(row.totalPv),
    month: report.month, period: `${month}${year}`,
  }));
  const escape = (cell: string) => /["\r\n]/.test(cell) || cell.includes(settings.delimiter) ? `"${cell.replaceAll('"', '""')}"` : cell;
  const lines = rows.map((row) => columns.map((column) => escape(row[column.key])).join(settings.delimiter));
  if (settings.includeHeader) lines.unshift(columns.map((column) => escape(column.label)).join(settings.delimiter));
  return lines.join("\r\n");
}

export default function PvReportPanel({ session }: { session: Session }) {
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState<PvReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<CsvSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => { setSettings(loadSettings(session.user.tenant.id)); }, [session.user.tenant.id]);
  function updateSettings(next: CsvSettings) {
    setSettings(next);
    window.localStorage.setItem(`hni-pv-csv-${session.user.tenant.id}`, JSON.stringify(next));
  }
  function moveColumn(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= settings.columns.length) return;
    const columns = [...settings.columns];
    [columns[index], columns[target]] = [columns[target], columns[index]];
    updateSettings({ ...settings, columns });
  }

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API_URL}/reports/pv?month=${encodeURIComponent(month)}`, {
        headers: { Authorization: `Bearer ${session.accessToken}`, "x-tenant-id": session.user.tenant.id },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Rekap PV gagal dimuat.");
      setReport(result as PvReport);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Rekap PV gagal dimuat."); }
    finally { setLoading(false); }
  }, [month, session.accessToken, session.user.tenant.id]);
  useEffect(() => { void load(); }, [load]);

  function exportCsv() {
    if (!report) return;
    if (!settings.columns.some((column) => column.enabled)) { setError("Aktifkan minimal satu kolom CSV."); return; }
    const csv = buildPvCsv(report, settings);
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `rekap-pv-${settings.granularity}-${report.month}.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const preview = report ? buildPvCsv(report, settings).split("\r\n").slice(0, 6).join("\n") : "";

  return <div className="customers-panel"><div className="catalog-heading"><div><span className="dashboard-label">MEMBER HNI</span><h3>Rekap PV bulanan</h3><p>Agregasi PV dari transaksi member dan kode produk yang tersimpan.</p></div></div>
    <section className="catalog-panel"><form className="report-filter" onSubmit={(event) => { event.preventDefault(); void load(); }}><label>Bulan<input required type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><button className="button button-primary" disabled={loading} type="submit">{loading ? "Memuat…" : "Terapkan"}</button>{report && <button className="button button-secondary" onClick={exportCsv} type="button">Unduh CSV</button>}<button className="text-button" onClick={() => setShowSettings((value) => !value)} type="button">{showSettings ? "Tutup format CSV" : "Atur format CSV"}</button></form>
      {showSettings && <div className="csv-settings">
        <div className="csv-settings-row">
          <label>Isi baris<select value={settings.granularity} onChange={(event) => updateSettings({ ...settings, granularity: event.target.value as Granularity })}><option value="member">Satu baris per member</option><option value="detail">Satu baris per member × produk</option></select></label>
          <label>Pemisah<select value={settings.delimiter} onChange={(event) => updateSettings({ ...settings, delimiter: event.target.value as CsvSettings["delimiter"] })}><option value=",">Koma (,)</option><option value=";">Titik koma (;)</option><option value={"\t"}>Tab</option></select></label>
          <label className="checkbox-field"><input type="checkbox" checked={settings.includeHeader} onChange={(event) => updateSettings({ ...settings, includeHeader: event.target.checked })} /> Sertakan baris judul</label>
          <label className="checkbox-field"><input type="checkbox" checked={settings.decimalComma} onChange={(event) => updateSettings({ ...settings, decimalComma: event.target.checked })} /> Desimal pakai koma</label>
        </div>
        <table className="product-table"><thead><tr><th>Pakai</th><th>Data</th><th>Judul kolom di CSV</th><th>Urutan</th></tr></thead><tbody>{settings.columns.map((column, index) => <tr key={column.key}><td><input aria-label={`Pakai kolom ${COLUMN_TITLES[column.key]}`} type="checkbox" checked={column.enabled} onChange={(event) => updateSettings({ ...settings, columns: settings.columns.map((item) => item.key === column.key ? { ...item, enabled: event.target.checked } : item) })} /></td><td>{COLUMN_TITLES[column.key]}{settings.granularity === "member" && ["sku", "product", "quantity"].includes(column.key) ? " (kosong pada mode per member)" : ""}</td><td><input aria-label={`Judul ${COLUMN_TITLES[column.key]}`} maxLength={60} value={column.label} onChange={(event) => updateSettings({ ...settings, columns: settings.columns.map((item) => item.key === column.key ? { ...item, label: event.target.value } : item) })} /></td><td><button className="row-action" disabled={index === 0} onClick={() => moveColumn(index, -1)} type="button">↑</button><button className="row-action" disabled={index === settings.columns.length - 1} onClick={() => moveColumn(index, 1)} type="button">↓</button></td></tr>)}</tbody></table>
        <div className="form-actions"><button className="text-button" onClick={() => updateSettings(DEFAULT_SETTINGS)} type="button">Kembalikan format bawaan</button></div>
        {report && <><span className="field-hint">Pratinjau (maks. 5 baris data):</span><pre className="csv-preview">{preview || "(belum ada data)"}</pre></>}
      </div>}
    </section>
    {error && <p className="feedback error" role="alert">{error}</p>}
    {report && <><section className="report-kpis"><article><span>Total PV bulan {report.month}</span><strong>{report.totalPv.toLocaleString("id-ID")}</strong></article><article><span>Member tercatat</span><strong>{report.members.filter((member) => member.hniId).length.toLocaleString("id-ID")}</strong></article></section>
      <section className="catalog-panel"><div className="section-title"><h4>PV per member</h4></div><div className="product-table-wrap"><table className="product-table"><thead><tr><th>ID HNI</th><th>Nama</th><th>Total PV</th></tr></thead><tbody>{report.members.map((member, index) => <tr key={member.customerId ?? `unknown-${index}`}><td>{member.hniId ?? "—"}</td><td>{member.name}</td><td>{member.totalPv.toLocaleString("id-ID")}</td></tr>)}{!report.members.length && <tr><td className="empty-table" colSpan={3}>Belum ada catatan PV untuk bulan ini.</td></tr>}</tbody></table></div></section>
      <section className="catalog-panel"><div className="section-title"><h4>Mapping produk (SKU → PV tercatat)</h4></div><div className="product-table-wrap"><table className="product-table"><thead><tr><th>SKU</th><th>Produk</th><th>Total PV</th></tr></thead><tbody>{report.products.map((product) => <tr key={product.sku}><td>{product.sku}</td><td>{product.product}</td><td>{product.totalPv.toLocaleString("id-ID")}</td></tr>)}{!report.products.length && <tr><td className="empty-table" colSpan={3}>Belum ada PV per produk.</td></tr>}</tbody></table></div></section>
      <p className="field-hint">Format CSV disimpan di browser ini per toko. Sesuaikan kolom, judul, urutan, dan pemisah dengan template resmi HPAI sebelum diunggah.</p>
    </>}
  </div>;
}
