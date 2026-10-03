# Setup Lokal

## Kebutuhan

- Docker Engine dengan Docker Compose v2
- Node.js 20+ dan Corepack (jalankan `corepack enable` untuk mengaktifkan pnpm 9 yang dipatok di proyek)

## Jalankan dengan Docker

1. Salin `.env.example` menjadi `.env` dan sesuaikan nilainya. Ganti kedua secret JWT dengan nilai acak minimal 32 karakter sebelum production.
2. Jalankan `docker compose up --build` dari direktori proyek.
3. Buka web di <http://localhost:3000>, API di <http://localhost:4000/health>, dan Adminer di <http://localhost:8080>.
4. Untuk Adminer, pilih server `postgres`, database `hni_pos`, username `hni_pos`, dan password dari `.env`.

PostgreSQL dan Redis menyimpan data dalam Docker volumes. Hentikan stack dengan `docker compose down`; gunakan `docker compose down -v` hanya jika data lokal ingin dihapus.

## Jalankan aplikasi di host

1. Salin `.env.example` menjadi `.env` dan `apps/api/.env` agar Prisma bisa membaca URL database saat migrasi lokal.
2. Jalankan `docker compose up -d postgres redis adminer`.
3. Jalankan `pnpm install`, `pnpm db:migrate`, lalu `pnpm dev`.

Perintah workspace tersedia melalui `pnpm dev`, `pnpm lint`, `pnpm test`, dan `pnpm build`. Skema Prisma berada di `apps/api/prisma/schema.prisma`; jalankan `pnpm db:generate` setelah mengubah skema. Docker otomatis menjalankan migrasi yang tersedia saat API mulai.

## Autentikasi

- Daftar tenant dan akun pemilik: `POST /auth/register-tenant` dengan `tenantName`, `ownerName`, `email`, dan `password`.
- Login: `POST /auth/login` dengan `email`, `password`, dan `tenantSlug`.
- Rotasi token: `POST /auth/refresh` dengan `refreshToken`; refresh token lama langsung tidak berlaku setelah dipakai.
- Profil terautentikasi: `GET /auth/me` dengan header `Authorization: Bearer <accessToken>` dan `x-tenant-id` yang sama dengan tenant pada JWT.
- Keluar dan mencabut refresh token: `POST /auth/logout` dengan Bearer token, `x-tenant-id`, dan `refreshToken`.

Access token berlaku 15 menit dan refresh token 7 hari. Password di-hash dengan bcrypt; refresh token disimpan dalam bentuk hash. Secret development bawaan hanya untuk pengembangan lokal; production wajib mengatur `ACCESS_TOKEN_SECRET` dan `REFRESH_TOKEN_SECRET`.

Request yang sudah login wajib mengirim `x-tenant-id` sesuai `tenant.id` dari respons login. Server mencocokkannya dengan tenant di JWT dan membatasi query Prisma pada tenant tersebut. Dashboard awal sengaja kosong sampai data transaksi dan stok tersedia; refresh token diperbarui otomatis selama halaman tetap terbuka.

## Kategori, produk, dan gambar

- Semua endpoint master data memerlukan access token pemilik (`owner`) serta header `x-tenant-id` yang cocok.
- Kategori: `GET/POST /categories`, `PATCH/DELETE /categories/:id`.
- Produk: `GET /products?page=1&limit=10&search=...&categoryId=...`, `GET/POST /products`, `PATCH/DELETE /products/:id`.
- Upload gambar: minta `POST /products/images/presign` dengan `fileName`, `contentType`, dan `size`; browser lalu `PUT` file ke `uploadUrl`, kemudian simpan URL/key dengan `POST /products/:id/images`.
- Upload menerima JPEG, PNG, atau WebP hingga 10 MB. Supaya upload aktif, isi `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, dan `S3_PUBLIC_URL` di `.env`. Nilai ini cocok untuk S3-compatible storage seperti Cloudflare R2. Atur CORS bucket agar mengizinkan origin web lokal, method `PUT`, serta header `Content-Type`.
- Gambar tersimpan memakai key tenant-specific `tenants/{tenantId}/products/...`; konfigurasi storage tidak wajib untuk mencoba CRUD teks produk.

## Struktur

- `apps/web`: Next.js 14 dengan TypeScript.
- `apps/api`: NestJS, Prisma, dan endpoint pemeriksaan `/health`.
- `packages/shared`: tipe dan utilitas yang dibagikan antar aplikasi.
