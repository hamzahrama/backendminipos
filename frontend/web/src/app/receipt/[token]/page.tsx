"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";

type Receipt = {
  invoiceNo: string; memberMode: boolean; subtotal: string; discount: string; total: string;
  cashReceived: string; changeAmount: string; totalPv: string; createdAt: string; receiptToken: string;
  tenant: { name: string; slug: string }; customer: { name: string; phone: string | null } | null;
  items: Array<{ productName: string; sku: string; quantity: string; unitPrice: string; lineTotal: string }>;
};
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export default function ReceiptPage({ params }: { params: { token: string } }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [qr, setQr] = useState("");
  const [width, setWidth] = useState<58 | 80>(58);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`${API_URL}/receipt/${encodeURIComponent(params.token)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? "Struk tidak ditemukan.");
        if (active) setReceipt(body as Receipt);
      })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Struk tidak dapat dimuat."); });
    return () => { active = false; };
  }, [params.token]);

  useEffect(() => {
    if (!receipt) return;
    void QRCode.toDataURL(window.location.href, { width: 180, margin: 1, errorCorrectionLevel: "M" })
      .then(setQr).catch(() => setQr(""));
  }, [receipt]);

  if (error) return <main className="receipt-state"><h1>Struk tidak tersedia</h1><p>{error}</p></main>;
  if (!receipt) return <main className="receipt-state">Memuat struk…</main>;

  return <main className="receipt-page">
    <div className="receipt-tools"><label>Ukuran kertas<select value={width} onChange={(event) => setWidth(Number(event.target.value) as 58 | 80)}><option value={58}>58 mm</option><option value={80}>80 mm</option></select></label><button className="button button-primary" onClick={() => window.print()} type="button">Cetak / Simpan PDF</button></div>
    <article className={`receipt-paper receipt-${width}`}>
      <header><h1>{receipt.tenant.name}</h1><p>Struk transaksi penjualan</p><small>{new Date(receipt.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB</small></header>
      <div className="receipt-rule" /><div className="receipt-meta"><span>Invoice</span><strong>{receipt.invoiceNo}</strong><span>Kasir</span><strong>POS</strong>{receipt.customer && <><span>Customer</span><strong>{receipt.customer.name}</strong></>}{receipt.memberMode && <><span>Jenis</span><strong>Member HNI</strong></>}</div>
      <div className="receipt-rule" />
      <section className="receipt-items">{receipt.items.map((item, index) => <div className="receipt-item" key={`${item.sku}-${index}`}><strong>{item.productName}</strong><small>{item.sku}</small><div><span>{Number(item.quantity)} × {money.format(Number(item.unitPrice))}</span><b>{money.format(Number(item.lineTotal))}</b></div></div>)}</section>
      <div className="receipt-rule" /><div className="receipt-totals"><div><span>Subtotal</span><b>{money.format(Number(receipt.subtotal))}</b></div>{Number(receipt.discount) > 0 && <div><span>Diskon</span><b>−{money.format(Number(receipt.discount))}</b></div>}<div className="receipt-total"><strong>Total</strong><strong>{money.format(Number(receipt.total))}</strong></div><div><span>Tunai</span><b>{money.format(Number(receipt.cashReceived))}</b></div><div><span>Kembalian</span><b>{money.format(Number(receipt.changeAmount))}</b></div>{receipt.memberMode && <div><span>Total PV</span><b>{Number(receipt.totalPv).toLocaleString("id-ID")}</b></div>}</div>
      <div className="receipt-qr">{qr && <Image src={qr} width={120} height={120} unoptimized alt="QR untuk membuka struk digital" />}<small>Pindai untuk melihat struk digital</small></div>
      <footer>Terima kasih telah berbelanja.<br />Simpan struk ini sebagai bukti transaksi.</footer>
    </article>
  </main>;
}
