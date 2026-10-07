import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

const apiUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Detail = { store: { name: string; slug: string }; product: { name: string; sku: string; description: string | null; retailPrice: string | number; memberPrice: string | number; images: { url: string }[] } };
const getDetail = async (slug: string, id: string): Promise<Detail | null> => {
  try { const res = await fetch(`${apiUrl}/public/catalog/${encodeURIComponent(slug)}/products/${encodeURIComponent(id)}`, { cache: "no-store" }); return res.ok ? await res.json() as Detail : null; } catch { return null; }
};
export async function generateMetadata({ params }: { params: { slug: string; productId: string } }): Promise<Metadata> {
  const detail = await getDetail(params.slug, params.productId);
  return detail ? { title: `${detail.product.name} | ${detail.store.name}`, description: detail.product.description ?? `Informasi ${detail.product.name} di ${detail.store.name}.`, openGraph: { title: detail.product.name, description: detail.product.description ?? `Produk ${detail.store.name}`, images: detail.product.images.slice(0, 1).map((image) => image.url) } } : { title: "Produk tidak tersedia | HNI POS" };
}
export default async function PublicProductPage({ params }: { params: { slug: string; productId: string } }) {
  const detail = await getDetail(params.slug, params.productId);
  if (!detail) return <main className="mx-auto max-w-4xl p-8"><p>Produk tidak tersedia atau stoknya habis.</p><Link href={`/katalog/${encodeURIComponent(params.slug)}`}>Kembali ke katalog</Link></main>;
  const { product, store } = detail;
  return <main className="mx-auto max-w-4xl p-6"><Link className="text-emerald-700 underline" href={`/katalog/${encodeURIComponent(store.slug)}`}>← Kembali ke katalog {store.name}</Link><article className="mt-6 grid gap-6 rounded-2xl border bg-white p-6 md:grid-cols-2">{product.images[0]?.url ? <Image unoptimized width={900} height={700} className="max-h-96 w-full rounded-xl object-cover" src={product.images[0].url} alt={product.name} /> : <div className="flex min-h-64 items-center justify-center rounded-xl bg-slate-100">Tidak ada foto</div>}<div><p className="text-sm text-slate-500">SKU {product.sku}</p><h1 className="mt-2 text-3xl font-bold">{product.name}</h1>{product.description && <p className="mt-4 whitespace-pre-line text-slate-700">{product.description}</p>}<p className="mt-6 text-xl font-bold">Retail {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(product.retailPrice))}</p><p className="text-slate-600">Member {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(product.memberPrice))}</p></div></article></main>;
}
