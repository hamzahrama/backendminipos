"use client";

import { useCallback, useEffect, useState } from "react";

type Session = { accessToken: string; user: { tenant: { id: string } } };
type Log = {
  id: string; phone: string; template: string; provider: string; status: "SENT" | "FAILED" | "SKIPPED";
  error: string | null; durationMs: number | null; createdAt: string; transaction: { invoiceNo: string } | null;
};
type Status = { provider: string; enabled: boolean; template: string };
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const statusLabel = { SENT: "Terkirim", FAILED: "Gagal", SKIPPED: "Gateway nonaktif" } as const;

export default function WhatsAppLogsPanel({ session }: { session: Session }) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const headers = { Authorization: `Bearer ${session.accessToken}`, "x-tenant-id": session.user.tenant.id };
    const [logResponse, statusResponse] = await Promise.all([
      fetch(`${API_URL}/whatsapp/logs?limit=100`, { headers }), fetch(`${API_URL}/whatsapp/status`, { headers }),
    ]);
    const [logBody, statusBody] = await Promise.all([logResponse.json(), statusResponse.json()]);
    if (!logResponse.ok) throw new Error(logBody.message ?? "Log WhatsApp gagal dimuat.");
    setLogs(logBody as Log[]);
    if (statusResponse.ok) setStatus(statusBody as Status);
  }, [session.accessToken, session.user.tenant.id]);
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Log WhatsApp gagal dimuat.")); }, [load]);

  return <div className="customers-panel"><div className="catalog-heading"><div><span className="dashboard-label">NOTIFIKASI</span><h3>Log pengiriman WhatsApp</h3><p>Riwayat struk yang dikirim kasir melalui gateway WhatsApp.</p></div><span className="product-count">{status ? status.enabled ? `Gateway: ${status.provider}` : "Gateway belum aktif" : "…"}</span></div>
    {error && <p className="feedback error" role="alert">{error}</p>}
    {status && !status.enabled && <p className="feedback error" role="status">Atur WHATSAPP_PROVIDER (fonnte/wablas) dan WHATSAPP_TOKEN di server agar tombol &quot;Kirim via WA&quot; dapat mengirim struk.</p>}
    <section className="catalog-panel"><div className="section-title"><h4>100 pengiriman terakhir</h4><button className="button button-secondary" onClick={() => void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Log WhatsApp gagal dimuat."))} type="button">Muat ulang</button></div>
      <div className="product-table-wrap"><table className="product-table"><thead><tr><th>Waktu</th><th>Invoice</th><th>Nomor</th><th>Provider</th><th>Status</th><th>Durasi</th><th>Keterangan</th></tr></thead><tbody>
        {logs.map((log) => <tr key={log.id}><td>{new Date(log.createdAt).toLocaleString("id-ID")}</td><td>{log.transaction?.invoiceNo ?? "—"}</td><td>{log.phone}</td><td>{log.provider}</td><td><span className={log.status === "SENT" ? "status-active" : "status-inactive"}>{statusLabel[log.status] ?? log.status}</span></td><td>{log.durationMs !== null ? `${(log.durationMs / 1000).toFixed(1)} dtk` : "—"}</td><td>{log.error ?? "—"}</td></tr>)}
        {!logs.length && <tr><td className="empty-table" colSpan={7}>Belum ada pengiriman WhatsApp.</td></tr>}
      </tbody></table></div></section>
  </div>;
}
