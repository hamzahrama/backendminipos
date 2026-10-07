import type { MetadataRoute } from "next";

const apiUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const response = await fetch(`${apiUrl}/public/catalog/slugs`, { cache: "no-store" });
    if (!response.ok) return [];
    const stores = await response.json() as { slug: string; updatedAt: string }[];
    return stores.map((store) => ({ url: `${siteUrl}/katalog/${encodeURIComponent(store.slug)}`, lastModified: new Date(store.updatedAt), changeFrequency: "daily", priority: 0.7 }));
  } catch { return []; }
}
