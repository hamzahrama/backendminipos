import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HNI POS & Inventaris", short_name: "HNI POS", description: "Kasir dan inventaris toko HNI.",
    start_url: "/", display: "standalone", background_color: "#f8fafc", theme_color: "#047857",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
