import type { Metadata } from "next";
import Link from "next/link";
import { PublicCatalogView } from "../../../components/public-catalog-view";

type Product = {
  id: string; name: string; sku: string; description: string | null;
  memberPrice: string | number; retailPrice: string | number; pv: string | number;
  category: { name: string } | null; images: { url: string }[]; availableQuantity: number;
};
type Catalog = { store: { name: string; slug: string; whatsAppNumber: string | null }; categories: string[]; products: Product[] };
const apiUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function getCatalog(slug: string, search = "", category = ""): Promise<Catalog | null> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category) params.set("category", category);
  try {
    const response = await fetch(`${apiUrl}/public/catalog/${encodeURIComponent(slug)}?${params}`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as Catalog;
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const catalog = await getCatalog(params.slug);
  if (!catalog) return { title: "Katalog tidak tersedia | HNI POS" };
  const title = `Katalog ${catalog.store.name}`;
  const description = `Lihat produk dan ketersediaan stok di ${catalog.store.name}.`;
  const url = `/katalog/${encodeURIComponent(params.slug)}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website", locale: "id_ID" } };
}

export default async function PublicCatalogPage({ params, searchParams }: {
  params: { slug: string }; searchParams: { q?: string; kategori?: string };
}) {
  const catalog = await getCatalog(params.slug, searchParams.q, searchParams.kategori);
  if (!catalog) return <main className="mx-auto max-w-3xl p-8"><h1 className="text-2xl font-bold">Katalog belum tersedia</h1><p className="mt-2 text-slate-600">Toko ini belum membuka katalog publik atau alamatnya tidak ditemukan.</p></main>;
  return <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div><p className="text-sm font-medium text-emerald-700">Katalog toko</p><h1 className="mt-1 text-3xl font-bold">{catalog.store.name}</h1><p className="mt-2 text-sm text-slate-600">Produk yang tersedia saat ini</p></div>
      <Link className="text-sm font-medium text-emerald-700 underline" href={`/katalog/${encodeURIComponent(params.slug)}`}>Lihat semua produk</Link>
    </header>
    <form className="mb-6 grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-[1fr_220px_auto]" action={`/katalog/${encodeURIComponent(params.slug)}`}>
      <input className="rounded-lg border px-3 py-2" name="q" defaultValue={searchParams.q} placeholder="Cari nama atau SKU produk" aria-label="Cari produk" />
      <select className="rounded-lg border px-3 py-2" name="kategori" defaultValue={searchParams.kategori ?? ""} aria-label="Filter kategori">
        <option value="">Semua kategori</option>{catalog.categories.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>
      <button className="rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white">Cari</button>
    </form>
    <PublicCatalogView store={catalog.store} products={catalog.products} />
  </main>;
}
