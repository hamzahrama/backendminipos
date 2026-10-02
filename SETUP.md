# Setup Lokal

## Kebutuhan

- Docker Engine dengan Docker Compose v2
- Node.js 20+ dan pnpm 9 (untuk menjalankan aplikasi langsung di host)

## Jalankan dengan Docker

1. Salin `.env.example` menjadi `.env` dan sesuaikan nilainya.
2. Jalankan `docker compose up --build` dari direktori proyek.
3. Buka web di <http://localhost:3000>, API di <http://localhost:4000/health>, dan Adminer di <http://localhost:8080>.
4. Untuk Adminer, pilih server `postgres`, database `hni_pos`, username `hni_pos`, dan password dari `.env`.

PostgreSQL dan Redis menyimpan data dalam Docker volumes. Hentikan stack dengan `docker compose down`; gunakan `docker compose down -v` hanya jika data lokal ingin dihapus.

## Jalankan aplikasi di host

1. Salin `.env.example` menjadi `.env`.
2. Jalankan `docker compose up -d postgres redis adminer`.
3. Jalankan `pnpm install`, lalu `pnpm dev`.

Perintah workspace tersedia melalui `pnpm dev`, `pnpm lint`, `pnpm test`, dan `pnpm build`. Skema awal Prisma berada di `apps/api/prisma/schema.prisma`; jalankan `pnpm db:generate` setelah mengubah skema.

## Struktur

- `apps/web`: Next.js 14 dengan TypeScript.
- `apps/api`: NestJS, Prisma, dan endpoint pemeriksaan `/health`.
- `packages/shared`: tipe dan utilitas yang dibagikan antar aplikasi.
