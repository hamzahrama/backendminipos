"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type Product = {
  id: string; name: string; sku: string; description: string | null;
  memberPrice: string | number; retailPrice: string | number; pv: string | number;
  category: { name: string } | null; images: { url: string }[]; availableQuantity: number;
};
type Store = { name: string; slug: string; whatsAppNumber: string | null };
type CartItem = { productId: string; quantity: number; product: Product };
const money = (value: string | number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value));

export function PublicCatalogView({ store, products }: { store: Store; products: Product[] }) {
  const key = `public-catalog-cart-${store.slug}`;
  const [cart, setCart] = useState<CartItem[]>([]);
  useEffect(() => { try { setCart(JSON.parse(localStorage.getItem(key) ?? "[]") as CartItem[]); } catch { setCart([]); } }, [key]);
  useEffect(() => { localStorage.setItem(key, JSON.stringify(cart)); }, [cart, key]);
  const cartProducts = useMemo(() => cart.map((item) => ({
    product: products.find((candidate) => candidate.id === item.productId) ?? item.product,
    quantity: Math.min(item.quantity, products.find((candidate) => candidate.id === item.productId)?.availableQuantity ?? item.product.availableQuantity),
  })).filter((item) => item.quantity > 0), [cart, products]);
  const setQuantity = (product: Product, change: number) => setCart((current) => {
    const existing = current.find((item) => item.productId === product.id);
    const quantity = Math.max(0, Math.min(product.availableQuantity, (existing?.quantity ?? 0) + change));
    return [...current.filter((item) => item.productId !== product.id), ...(quantity ? [{ productId: product.id, quantity, product }] : [])];
  });
  const total = cartProducts.reduce((sum, item) => sum + Number(item.product.retailPrice) * item.quantity, 0);
  const message = [`Halo ${store.name}, saya ingin memesan:`, ...cartProducts.map(({ product, quantity }) => `- ${product.name} x${quantity} (${money(product.retailPrice)})`), `Perkiraan total: ${money(total)}`].join("\n");
  const waLink = store.whatsAppNumber ? `https://wa.me/${store.whatsAppNumber.replace(/\D/g, "")}?text=${encodeURIComponent(message)}` : null;

  return <>
    {products.length === 0 ? <p className="rounded-xl border bg-white p-8 text-center text-slate-600">Belum ada produk ready stock yang cocok.</p> :
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{products.map((product) => {
        const quantity = cart.find((item) => item.productId === product.id)?.quantity ?? 0;
        return <article className="overflow-hidden rounded-xl border bg-white" key={product.id}>
          <Link href={`/katalog/${encodeURIComponent(store.slug)}/${encodeURIComponent(product.id)}`} aria-label={`Lihat ${product.name}`}>
            {product.images[0]?.url ? <Image unoptimized width={640} height={400} className="h-48 w-full object-cover" src={product.images[0].url} alt={product.name} /> : <div className="flex h-48 items-center justify-center bg-slate-100 text-slate-400">Tidak ada foto</div>}
          </Link>
          <div className="p-4"><p className="text-xs text-slate-500">{product.category?.name ?? "Tanpa kategori"} · SKU {product.sku}</p>
            <Link className="mt-1 block text-lg font-semibold" href={`/katalog/${encodeURIComponent(store.slug)}/${encodeURIComponent(product.id)}`}>{product.name}</Link>
            <p className="mt-2 font-bold text-emerald-800">Harga retail {money(product.retailPrice)}</p><p className="text-sm text-slate-600">Member {money(product.memberPrice)} · {product.pv} PV</p>
            <p className="mt-2 text-xs text-slate-500">Stok tersedia: {product.availableQuantity}</p>
            <div className="mt-4 flex items-center gap-2"><button type="button" className="h-9 w-9 rounded border" onClick={() => setQuantity(product, -1)} aria-label={`Kurangi ${product.name}`}>−</button><span className="min-w-6 text-center">{quantity}</span><button type="button" className="h-9 w-9 rounded border" onClick={() => setQuantity(product, 1)} aria-label={`Tambah ${product.name}`} disabled={quantity >= product.availableQuantity}>+</button></div>
          </div>
        </article>;
      })}</section>}
    {cartProducts.length > 0 && <aside className="sticky bottom-3 mt-8 rounded-xl border bg-white p-4 shadow-lg"><div className="flex flex-wrap items-center justify-between gap-4"><div><strong>{cartProducts.reduce((sum, item) => sum + item.quantity, 0)} barang</strong><p className="text-sm text-slate-600">Perkiraan total: {money(total)}</p></div>{waLink ? <a className="rounded-lg bg-green-700 px-5 py-3 font-semibold text-white" href={waLink} target="_blank" rel="noreferrer">Pesan via WhatsApp</a> : <p className="text-sm text-amber-800">Toko belum mengatur nomor WhatsApp.</p>}</div></aside>}
  </>;
}
