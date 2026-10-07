"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CartLine, CartProduct, useCartStore } from "../stores/cart-store";

type PosSession = {
  accessToken: string;
  user: { tenant: { id: string; name: string } };
};
type ApiProduct = {
  id: string; name: string; sku: string; memberPrice: string; retailPrice: string; pv: string;
  categoryId: string | null; category: { id: string; name: string } | null;
  images: { url: string; alt: string | null }[];
};
type Category = { id: string; name: string };
type StockItem = { id: string; quantity: number };
type Customer = { id: string; name: string; phone: string | null; hniProfile: { hniId: string } | null };
type CheckoutResult = { id: string; invoiceNo: string; receiptToken: string; total: string; totalPv: string; changeAmount: string };
type VoucherPreview = { code: string; discountAmount: number; subtotal: number };
type PosDraft = { id: string; label: string; lines: CartLine[]; memberMode: boolean; memberId: string; customerId: string; cash: string; discount: string; voucherCode: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export default function PosTerminal({ session }: { session: PosSession }) {
  const [products, setProducts] = useState<CartProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [memberMode, setMemberMode] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [cash, setCash] = useState("");
  const [orderDiscount, setOrderDiscount] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherPreview, setVoucherPreview] = useState<VoucherPreview | null>(null);
  const [drafts, setDrafts] = useState<PosDraft[]>([]);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState({ name: "", phone: "", hniId: "" });
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [waPhone, setWaPhone] = useState("");
  const [waStatus, setWaStatus] = useState<{ kind: "idle" | "sending" | "sent" | "error"; text: string }>({ kind: "idle", text: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const idempotency = useRef<{ fingerprint: string; key: string } | null>(null);
  const lines = useCartStore((state) => state.lines);
  const add = useCartStore((state) => state.add);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const setDiscount = useCartStore((state) => state.setDiscount);
  const setLines = useCartStore((state) => state.setLines);
  const remove = useCartStore((state) => state.remove);
  const clear = useCartStore((state) => state.clear);

  const authHeaders = useCallback((token: string, tenantId: string) => ({
    Authorization: `Bearer ${token}`, "x-tenant-id": tenantId,
  }), []);

  useEffect(() => {
    clear();
    try {
      const stored = window.localStorage.getItem(`hni-pos-drafts-${session.user.tenant.id}`);
      setDrafts(stored ? JSON.parse(stored) as PosDraft[] : []);
    } catch { setDrafts([]); }
    setDraftsLoaded(true);
  }, [session.user.tenant.id, clear]);

  useEffect(() => {
    if (draftsLoaded) window.localStorage.setItem(`hni-pos-drafts-${session.user.tenant.id}`, JSON.stringify(drafts));
  }, [drafts, draftsLoaded, session.user.tenant.id]);

  useEffect(() => {
    let active = true;
    const headers = authHeaders(session.accessToken, session.user.tenant.id);
    async function load() {
      setLoading(true); setError("");
      try {
        const [productResponse, categoryResponse, stockResponse, customerResponse] = await Promise.all([
          fetch(`${API_URL}/products?limit=100`, { headers }),
          fetch(`${API_URL}/categories`, { headers }),
          fetch(`${API_URL}/inventory/stock`, { headers }),
          fetch(`${API_URL}/customers`, { headers }),
        ]);
        const results = await Promise.all([productResponse.json(), categoryResponse.json(), stockResponse.json(), customerResponse.json()]);
        const failed = [productResponse, categoryResponse, stockResponse, customerResponse].find((response) => !response.ok);
        if (failed) throw new Error("Katalog POS tidak dapat dimuat. Pastikan akun memiliki akses kasir.");
        if (!active) return;
        const stockById = new Map((results[2] as StockItem[]).map((item) => [item.id, item.quantity]));
        setProducts((results[0] as { items: ApiProduct[] }).items.map((item) => ({
          id: item.id, name: item.name, sku: item.sku, categoryId: item.categoryId, memberPrice: Number(item.memberPrice),
          retailPrice: Number(item.retailPrice), pv: Number(item.pv), imageUrl: item.images[0]?.url ?? null,
          stock: stockById.get(item.id) ?? 0,
        })));
        setCategories(results[1] as Category[]);
        setCustomers(results[3] as Customer[]);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Katalog POS tidak dapat dimuat.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [session, authHeaders]);

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesSearch = `${product.name} ${product.sku}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (!categoryId || product.categoryId === categoryId);
  }), [products, search, categoryId]);
  const subtotal = lines.reduce((sum, line) => sum + (memberMode ? line.product.memberPrice : line.product.retailPrice) * line.quantity, 0);
  const itemDiscountTotal = lines.reduce((sum, line) => sum + Math.min(line.discountAmount, (memberMode ? line.product.memberPrice : line.product.retailPrice) * line.quantity), 0);
  const orderDiscountValue = Math.max(0, Number(orderDiscount) || 0);
  const voucherBase = Math.max(0, subtotal - itemDiscountTotal - orderDiscountValue);
  const currentVoucherDiscount = voucherPreview && voucherPreview.subtotal === voucherBase ? voucherPreview.discountAmount : 0;
  const total = Math.max(0, subtotal - itemDiscountTotal - orderDiscountValue - currentVoucherDiscount);
  const pvTotal = memberMode ? lines.reduce((sum, line) => sum + line.product.pv * line.quantity, 0) : 0;
  const paid = Number(cash) || 0;
  const change = Math.max(0, paid - total);
  const memberIdValid = !memberMode || /^[a-z0-9-]{4,32}$/i.test(memberId.trim());
  const searchableRef = useRef<HTMLInputElement>(null);

  async function addCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (quickCustomer.hniId && !/^[a-z0-9-]{4,32}$/i.test(quickCustomer.hniId)) {
      setError("ID HNI harus berisi 4–32 karakter alfanumerik atau tanda hubung."); return;
    }
    try {
      const response = await fetch(`${API_URL}/customers`, {
        method: "POST", headers: { ...authHeaders(session.accessToken, session.user.tenant.id), "Content-Type": "application/json" },
        body: JSON.stringify({ name: quickCustomer.name, phone: quickCustomer.phone || undefined, hniId: quickCustomer.hniId || undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Customer gagal disimpan.");
      const customer = result as Customer;
      setCustomers((current) => [...current.filter((item) => item.id !== customer.id), customer].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerId(customer.id);
      if (customer.hniProfile) { setMemberMode(true); setMemberId(customer.hniProfile.hniId); }
      setQuickCustomer({ name: "", phone: "", hniId: "" }); setShowQuickAdd(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Customer gagal disimpan."); }
  }

  async function checkout() {
    setError(""); setCheckingOut(true);
    const payload = {
      customerId: customerId || undefined, memberMode, memberHniId: memberMode ? memberId.trim() : undefined,
      items: lines.map(({ product, quantity, discountAmount }) => ({
        productId: product.id, quantity,
        discountAmount: Math.min(discountAmount, (memberMode ? product.memberPrice : product.retailPrice) * quantity),
      })), cashReceived: paid,
      discountAmount: orderDiscountValue,
      voucherCode: currentVoucherDiscount ? voucherPreview?.code : undefined,
    };
    const fingerprint = JSON.stringify(payload);
    if (!idempotency.current || idempotency.current.fingerprint !== fingerprint) {
      idempotency.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      const response = await fetch(`${API_URL}/transactions`, {
        method: "POST", headers: {
          ...authHeaders(session.accessToken, session.user.tenant.id), "Content-Type": "application/json",
          "Idempotency-Key": idempotency.current.key,
        }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message[0] : result.message ?? "Checkout gagal.");
      const sale = result as CheckoutResult;
      setWaPhone(customers.find((customer) => customer.id === (customerId || undefined))?.phone ?? "");
      setWaStatus({ kind: "idle", text: "" });
      setCheckoutResult(sale); clear(); setCash(""); setOrderDiscount(""); setVoucherCode(""); setVoucherPreview(null); idempotency.current = null;
      const stockResponse = await fetch(`${API_URL}/inventory/stock`, { headers: authHeaders(session.accessToken, session.user.tenant.id) });
      if (stockResponse.ok) {
        const updatedStock = await stockResponse.json() as StockItem[];
        setProducts((current) => current.map((product) => ({ ...product, stock: updatedStock.find((item) => item.id === product.id)?.quantity ?? 0 })));
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Checkout gagal."); }
    finally { setCheckingOut(false); }
  }

  async function sendReceiptWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checkoutResult) return;
    setWaStatus({ kind: "sending", text: "Mengirim struk…" });
    try {
      const response = await fetch(`${API_URL}/transactions/${checkoutResult.id}/whatsapp`, {
        method: "POST", headers: { ...authHeaders(session.accessToken, session.user.tenant.id), "Content-Type": "application/json" },
        body: JSON.stringify({ phone: waPhone.trim() || undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message[0] : result.message ?? "Struk gagal dikirim.");
      setWaStatus({ kind: "sent", text: `Struk terkirim ke ${result.phone} (${(Number(result.durationMs) / 1000).toFixed(1)} detik).` });
    } catch (caught) { setWaStatus({ kind: "error", text: caught instanceof Error ? caught.message : "Struk gagal dikirim." }); }
  }

  async function previewVoucher() {
    setError(""); setVoucherPreview(null);
    if (!voucherCode.trim()) return;
    try {
      const response = await fetch(`${API_URL}/vouchers/validate`, {
        method: "POST", headers: { ...authHeaders(session.accessToken, session.user.tenant.id), "Content-Type": "application/json" },
        body: JSON.stringify({ code: voucherCode, subtotal: voucherBase }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Voucher tidak dapat digunakan.");
      setVoucherPreview(result as VoucherPreview);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Voucher tidak dapat digunakan."); }
  }

  function holdOrder() {
    if (!lines.length) return;
    const now = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    const draft: PosDraft = {
      id: crypto.randomUUID(), label: `Pesanan ${now}`, lines, memberMode, memberId, customerId,
      cash, discount: orderDiscount, voucherCode,
    };
    setDrafts((current) => [draft, ...current]);
    clear(); setCash(""); setOrderDiscount(""); setVoucherCode(""); setVoucherPreview(null); setMemberId(""); setCustomerId(""); setMemberMode(false);
  }

  function resumeOrder(draft: PosDraft) {
    if (lines.length) holdOrder();
    setLines(draft.lines); setMemberMode(draft.memberMode); setMemberId(draft.memberId);
    setCustomerId(draft.customerId); setCash(draft.cash); setOrderDiscount(draft.discount);
    setVoucherCode(draft.voucherCode); setVoucherPreview(null);
    setDrafts((current) => current.filter((item) => item.id !== draft.id));
  }

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if (event.key === "F2") { event.preventDefault(); searchableRef.current?.focus(); }
      if (event.key === "F4") { event.preventDefault(); setMemberMode((current) => !current); }
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        if (lines.length && memberIdValid && paid >= total && !checkingOut) void checkout();
      }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "h") { event.preventDefault(); holdOrder(); }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  });

  return <div className="pos-shell">
    <header className="pos-header"><div><strong className="pos-brand">HNI POS</strong><span>{session.user.tenant.name}</span></div></header>
    <div className="pos-layout">
      <section className="pos-products">
        <div className="pos-title"><div><p className="dashboard-label">TERMINAL KASIR</p><h1>Pilih produk</h1></div><span>{visibleProducts.length} produk</span></div>
        <div className="pos-filters"><input ref={searchableRef} aria-label="Cari produk" placeholder="Cari nama atau SKU… (F2)" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="Filter kategori" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Semua kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
        {error && <p className="feedback error" role="alert">{error}</p>}
        {loading ? <p className="pos-empty">Memuat katalog…</p> : <div className="pos-product-grid">{visibleProducts.map((product) => <button key={product.id} className="pos-product-card" disabled={product.stock <= 0} onClick={() => add(product)} type="button">
          {product.imageUrl ? <Image src={product.imageUrl} alt="" width={240} height={160} unoptimized /> : <span className="pos-product-placeholder">{product.name.slice(0, 1)}</span>}
          <span className="pos-product-info"><strong>{product.name}</strong><small>{product.sku} · Stok {product.stock}</small><b>{money.format(memberMode ? product.memberPrice : product.retailPrice)}</b></span>
        </button>)}</div>}
        {!loading && visibleProducts.length === 0 && <p className="pos-empty">Produk tidak ditemukan.</p>}
      </section>
      <aside className="pos-checkout">
        <div className="pos-title"><div><p className="dashboard-label">PESANAN</p><h2>Keranjang</h2></div><div className="pos-cart-actions"><button className="text-button" disabled={!lines.length} onClick={holdOrder} type="button">Tahan pesanan</button><button className="text-button" onClick={() => { clear(); setCash(""); setOrderDiscount(""); setVoucherCode(""); setVoucherPreview(null); }} type="button">Kosongkan</button></div></div>
        {drafts.length > 0 && <div className="pos-drafts"><strong>Pesanan ditahan ({drafts.length})</strong>{drafts.map((draft) => <div key={draft.id}><button className="text-button" onClick={() => resumeOrder(draft)} type="button">Lanjutkan {draft.label} · {draft.lines.length} produk</button><button aria-label={`Hapus ${draft.label}`} onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))} type="button">×</button></div>)}</div>}
        <div className="pos-member-toggle"><button className={!memberMode ? "active" : ""} onClick={() => { setMemberMode(false); setMemberId(""); }} type="button">Non-member</button><button className={memberMode ? "active" : ""} onClick={() => setMemberMode(true)} type="button">Member</button></div>
        {memberMode && <label className="pos-member-input">ID Member HNI<input maxLength={32} placeholder="ID member" value={memberId} onChange={(event) => setMemberId(event.target.value)} />{memberId && !memberIdValid && <small className="pos-validation">Gunakan 4–32 huruf, angka, atau tanda hubung.</small>}</label>}
        <div className="pos-customer-select"><label>Customer (opsional)<select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Tanpa customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.hniProfile ? ` · HNI ${customer.hniProfile.hniId}` : ""}</option>)}</select></label><button className="text-button" onClick={() => setShowQuickAdd((value) => !value)} type="button">+ Customer baru</button></div>
        {showQuickAdd && <form className="pos-quick-customer" onSubmit={addCustomer}><label>Nama<input required maxLength={120} value={quickCustomer.name} onChange={(event) => setQuickCustomer({ ...quickCustomer, name: event.target.value })} /></label><label>No. WhatsApp<input inputMode="tel" maxLength={32} value={quickCustomer.phone} onChange={(event) => setQuickCustomer({ ...quickCustomer, phone: event.target.value })} /></label><label>ID HNI (opsional)<input maxLength={32} value={quickCustomer.hniId} onChange={(event) => setQuickCustomer({ ...quickCustomer, hniId: event.target.value })} /></label><button className="button button-secondary" type="submit">Simpan customer</button></form>}
        {checkoutResult && <div className="pos-receipt-message" role="status"><strong>Transaksi berhasil</strong><span>{checkoutResult.invoiceNo} · {money.format(Number(checkoutResult.total))}</span><small>PV {Number(checkoutResult.totalPv).toLocaleString("id-ID")} · kembalian {money.format(Number(checkoutResult.changeAmount))}</small><a href={`/receipt/${checkoutResult.receiptToken}`} target="_blank" rel="noreferrer">Lihat dan cetak struk</a><form className="pos-wa-form" onSubmit={sendReceiptWhatsApp}><label>No. WhatsApp<input inputMode="tel" maxLength={32} placeholder="08xxxxxxxxxx" value={waPhone} onChange={(event) => setWaPhone(event.target.value)} /></label><button className="button button-secondary" disabled={waStatus.kind === "sending" || waStatus.kind === "sent" || !waPhone.trim()} type="submit">{waStatus.kind === "sending" ? "Mengirim…" : "Kirim via WA"}</button></form>{waStatus.text && <small className={waStatus.kind === "error" ? "pos-validation" : undefined} role="status">{waStatus.text}</small>}<button className="text-button" onClick={() => setCheckoutResult(null)} type="button">Tutup</button></div>}
        <div className="pos-cart-lines">{lines.map(({ product, quantity, discountAmount }) => { const price = memberMode ? product.memberPrice : product.retailPrice; const lineDiscount = Math.min(discountAmount, price * quantity); return <div className="pos-cart-line" key={product.id}><div><strong>{product.name}</strong><small>{money.format(price)} / item</small><label className="pos-line-discount">Diskon baris<input aria-label={`Diskon ${product.name}`} min="0" max={price * quantity} step="100" type="number" value={discountAmount} onChange={(event) => setDiscount(product.id, Number(event.target.value) || 0)} /></label></div><div className="pos-quantity"><button aria-label={`Kurangi ${product.name}`} onClick={() => setQuantity(product.id, quantity - 1)} type="button">−</button><span>{quantity}</span><button aria-label={`Tambah ${product.name}`} disabled={quantity >= product.stock} onClick={() => setQuantity(product.id, quantity + 1)} type="button">+</button></div><b>{money.format(price * quantity - lineDiscount)}</b><button className="pos-remove" aria-label={`Hapus ${product.name}`} onClick={() => remove(product.id)} type="button">×</button></div>; })}</div>
        {lines.length === 0 && <p className="pos-empty">Pilih produk untuk mulai transaksi.</p>}
        <div className="pos-totals"><div><span>Subtotal</span><b>{money.format(subtotal)}</b></div>{itemDiscountTotal > 0 && <div><span>Diskon item</span><b>−{money.format(itemDiscountTotal)}</b></div>}
          <label>Diskon transaksi<input min="0" max={Math.max(0, subtotal - itemDiscountTotal)} step="100" type="number" value={orderDiscount} onChange={(event) => setOrderDiscount(event.target.value)} /></label>
          <div className="pos-voucher-entry"><label>Kode voucher<input maxLength={32} value={voucherCode} onChange={(event) => { setVoucherCode(event.target.value.toUpperCase()); setVoucherPreview(null); }} /></label><button className="button button-secondary" disabled={!voucherCode.trim()} onClick={() => void previewVoucher()} type="button">Pakai</button></div>
          {currentVoucherDiscount > 0 && <div><span>Voucher {voucherPreview?.code}</span><b>−{money.format(currentVoucherDiscount)}</b></div>}
          <div><span>PV {memberMode ? "member" : "(khusus member)"}</span><b>{pvTotal.toLocaleString("id-ID")}</b></div><div className="pos-grand-total"><span>Total</span><strong>{money.format(total)}</strong></div>
          <label>Uang diterima<input inputMode="numeric" min="0" type="number" value={cash} onChange={(event) => setCash(event.target.value)} /></label><div><span>Kembalian</span><b>{money.format(change)}</b></div>
          <button className="button button-primary pos-pay-button" disabled={!lines.length || !memberIdValid || paid < total || checkingOut || orderDiscountValue > subtotal - itemDiscountTotal || (!!voucherCode && !currentVoucherDiscount) || (memberMode && !customers.some((customer) => customer.hniProfile?.hniId === memberId.trim()))} onClick={() => void checkout()} type="button">{checkingOut ? "Menyimpan transaksi…" : "Selesaikan pembayaran"}</button>
          {memberMode && memberIdValid && memberId && !customers.some((customer) => customer.hniProfile?.hniId === memberId.trim()) && <small className="pos-validation">ID HNI harus terdaftar sebagai customer untuk mencatat PV.</small>}
          <small className="pos-checkout-note">Pintasan: F2 cari · F4 member · Ctrl+Enter bayar · Ctrl+Shift+H tahan</small>
        </div>
      </aside>
    </div>
  </div>;
}
