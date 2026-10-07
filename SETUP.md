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

Perintah workspace tersedia melalui `pnpm dev`, `pnpm lint`, `pnpm test`, dan `pnpm build`. Coverage API: `pnpm --filter api test:coverage` (ambang minimum 60% untuk lines/statements/functions/branches, juga dijalankan di CI). Skema Prisma berada di `apps/api/prisma/schema.prisma`; jalankan `pnpm db:generate` setelah mengubah skema. Docker otomatis menjalankan migrasi yang tersedia saat API mulai.

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
- Import CSV: unggah file sebagai field multipart `file` ke `POST /products/import/preview`. API menampilkan kesalahan per baris; jika semua baris valid, kirim daftar `rows` hasil preview ke `POST /products/import/commit`. Kolom wajib: `name`, `sku`, `memberPrice`, `retailPrice`; opsional: `barcode`, `description`, `category`, `pv`. Batasnya 500 produk / 1 MB per file.
- Harga massal: `PATCH /products/bulk-prices` dengan `productIds` dan salah satu/kedua dari `memberPrice` atau `retailPrice` untuk menetapkan harga baru pada produk pilihan.
- Produk yang dihapus dari daftar utama diarsipkan secara soft delete. Pakai `GET /products?includeDeleted=true` untuk melihat arsip dan `POST /products/:id/restore` untuk memulihkan.
- Detail produk dan riwayat harga tersedia dari tombol **Detail** di daftar produk. Perubahan harga manual dan massal disimpan atomik; API riwayat tersedia melalui `GET /products/:id/price-history`.

## Stok, batch, FEFO, dan alert

- Gudang tenant: `GET /warehouses` dan `POST /warehouses` dengan `name` serta `code`.
- Stok masuk: `POST /inventory/stock-in` dengan `productId`, `batchCode`, `quantity`; `expiryDate`, `unitCost`, dan `warehouseId` opsional. Penerimaan dicatat sebagai batch serta pergerakan stok dalam satu transaksi. Kode batch yang sama di gudang yang sama menambah kuantitas batch itu.
- Batch per produk: `GET /products/:id/batches`; ringkasan stok semua produk: `GET /inventory/stock`.
- FEFO: `POST /inventory/fefo/preview` dengan `productId` dan `quantity` menunjukkan batch yang akan dipakai dari tanggal kedaluwarsa terdekat. Engine `InventoryService.consumeByFefo(...)` mengurangi batch dan mencatat pergerakan keluar di transaksi pemanggil; alur checkout akan memakainya pada Day 11.
- Ambang alert diatur lewat `lowStockLimit` pada produk (default 5). `GET /alerts` menampilkan stok di bawah ambang dan batch yang kedaluwarsa dalam 30 hari. Alert dihitung saat dibaca dan diperbarui oleh cron harian pukul 00.00 WIB; pemeriksaan awal juga berjalan saat API mulai.

## POS, customer, dan checkout

- Kasir dan owner dapat membaca `GET /products`, `GET /categories`, dan `GET /inventory/stock`; hak ubah katalog tetap khusus owner.
- `GET/POST/PATCH/DELETE /customers` mengelola customer dalam tenant aktif. `GET /customers/:id` menampilkan riwayat transaksi dan total PV. Profil HNI bersifat opsional; ID HNI menerima 4–32 huruf, angka, atau tanda hubung karena PRD belum menetapkan format ID khusus.
- Halaman dashboard punya terminal POS dengan pencarian, filter kategori, keranjang Zustand, harga member/non-member, PV, uang diterima, dan kembalian.
- `POST /transactions` menerima daftar `productId` + `quantity`, `memberMode`, `cashReceived`, serta header `Idempotency-Key` (8–128 karakter). Untuk member, kirim `memberHniId` yang sudah terdaftar. Harga dibaca server dari katalog, stok dipotong berdasarkan FEFO, invoice unik per tenant/hari, dan PV dicatat dalam satu transaksi DB.
- Ulangi permintaan checkout dengan idempotency key yang sama bila respons jaringan terputus; server mengembalikan transaksi yang sudah dibuat alih-alih menggandakan penjualan.
- Checkout menghasilkan tautan publik `/receipt/{token}` dengan token acak 256-bit. Halaman struk menyediakan lebar 58/80 mm, QR, dan dialog cetak browser (termasuk opsi Save as PDF).
- POS mendukung diskon per baris dan transaksi, kode voucher dengan kuota/tanggal/minimum belanja, serta draft pesanan yang disimpan di localStorage per tenant pada browser tersebut (tidak disinkronkan ke server/perangkat lain). Pintasan: `F2` fokus pencarian, `F4` ganti mode member, `Ctrl+Enter` checkout, `Ctrl+Shift+H` tahan pesanan.
- `POST /vouchers/validate` memeriksa kode untuk owner/kasir; owner dapat mengelola daftar lewat `GET/POST /vouchers` dan menonaktifkan dengan `DELETE /vouchers/:id`.
- `GET /reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` menampilkan omzet, jumlah transaksi, rata-rata isi keranjang, rata-rata nilai transaksi, tren per jam WIB, dan rincian kategori (maksimal rentang 93 hari).
- `GET /reports/profit-loss?from=YYYY-MM-DD&to=YYYY-MM-DD` menghitung omzet, HPP dari batch untuk stok keluar yang terkait invoice, pengeluaran operasional, dan laba. `GET/POST/DELETE /expenses` dipakai untuk mencatat pengeluaran. Halaman Laba Rugi menyediakan unduhan `.xlsx` dan print/Save as PDF. Baris stok keluar tanpa harga pokok ditandai agar angka laba tidak dianggap lengkap.
- `GET /reports/pv?month=YYYY-MM` mengagregasi PV per member, per SKU, dan `details` per member × SKU (qty dan PV per unit diambil dari baris transaksi). Halaman Rekap PV punya pengaturan format CSV (kolom, urutan, judul, pemisah, desimal koma, mode per member atau per member × produk) yang disimpan per toko di browser; format bawaan HPAI belum dikunci karena template resmi belum tersedia.
- Katalog publik aktif melalui `PATCH /storefront/settings` oleh owner. Default-nya mati; owner mengisi nomor WhatsApp format internasional lalu mengaktifkannya. Halaman katalog SSR ada di `/katalog/{tenant-slug}`, dengan pencarian, kategori, ready stock, halaman produk, dan sitemap `/katalog/sitemap.xml`. Katalog publik hanya menampilkan produk aktif yang jumlah stoknya masih positif dan belum kedaluwarsa.
- Pengunjung dapat menyimpan keranjang katalog di localStorage browser lalu membuka tautan WhatsApp dengan rincian pesanan; aplikasi tidak mengirim pesan otomatis. Nomor WhatsApp toko bisa diubah dari endpoint `GET/PATCH /storefront/settings`.
- Jaringan HNI owner tersedia di `GET /customers/network?month=YYYY-MM`. Relasi disimpan di tabel `network_tree` dan dibangun ulang otomatis dari ID upline profil customer setiap kali ID HNI/upline berubah (siklus diputus, upline di luar toko dicatat sebagai `externalUplines`). Tampilan dibatasi 5 level; level lebih dalam tetap dihitung di PV jaringan. Klik member di panel untuk rekap PV per leg; downline baru dapat ditambahkan langsung dari panel.
- Bonus & leaderboard: `GET/PUT /bonus/scheme` (owner) menyimpan skema bonus per toko (nilai rupiah per PV, peringkat dengan syarat PV sendiri/grup, persen bonus pribadi & per generasi, badge). Skema bawaan **hanya contoh** dan ditandai `isExample: true` sampai owner menggantinya dengan marketing plan resmi HPAI. `GET /bonus/leaderboard?month=` (owner/kasir/agen) mengurutkan member berdasarkan PV bulanan beserta peringkat dan badge Bronze/Silver/Gold/Diamond. `GET /bonus/members/:customerId?month=` menghitung rincian bonus; `POST /bonus/simulate` membandingkan bonus sekarang vs skenario (downline naik ke peringkat tertentu atau PV menjadi X). Simulasi target peringkat hanya menaikkan PV sendiri downline; syarat PV grup tetap dihitung apa adanya.
- WhatsApp struk: `POST /transactions/:id/whatsapp` (owner/kasir, body opsional `phone`) mengirim template `receipt_v1` lewat Fonnte atau Wablas. Atur `WHATSAPP_PROVIDER` (`fonnte`/`wablas`), `WHATSAPP_TOKEN`, `WABLAS_BASE_URL` (khusus Wablas), `WHATSAPP_TIMEOUT_MS` (default 5000), dan `PUBLIC_SITE_URL` untuk tautan struk. Tanpa konfigurasi, endpoint mengembalikan 503 dan mencatat status `SKIPPED`. Semua percobaan tercatat di `whatsapp_logs` (`GET /whatsapp/logs`, owner) dengan batas 3 kiriman per transaksi per 10 menit.
- Perubahan data melalui endpoint terautentikasi dicatat di `audit_logs` tanpa menyalin isi request atau data customer. Owner dapat membaca `GET /audit-logs?limit=100`. Diskon transaksi sebesar atau di atas `FRAUD_DISCOUNT_RATE_THRESHOLD` dari subtotal diberi tanda `REVIEW_HIGH_DISCOUNT` untuk pemeriksaan owner (peringatan, tidak memblokir). Nilai default 0,70 adalah ambang operasional awal, bukan aturan HPAI.
- API mengirim security headers, membatasi CORS ke `CORS_ORIGINS`, dan menerapkan pembatasan request in-memory per IP (120/menit umum, 30 transaksi/menit, 10 login/pendaftaran tenant/menit). Batas ini berlaku per proses API, bukan lintas replika. API memakai bearer token di header dan tidak memakai cookie autentikasi.

## Struktur

- `apps/web`: Next.js 14 dengan TypeScript.
- `apps/api`: NestJS, Prisma, dan endpoint pemeriksaan `/health`.
- `packages/shared`: tipe dan utilitas yang dibagikan antar aplikasi.

## Katalog publik dan deployment

- Set `API_INTERNAL_URL=http://api:4000` untuk server-side fetch dari web container, `NEXT_PUBLIC_SITE_URL` ke alamat publik, dan `CORS_ORIGINS` ke daftar origin web yang dipisahkan koma.
- Katalog tenant baru mati secara default dan hanya owner dapat mengaktifkannya. Publik melihat harga, nama, SKU, gambar, PV, serta kuantitas ready stock; jangan mengisi data yang tidak ingin dipublikasikan.
- Tautan WhatsApp membuka aplikasi WhatsApp pengunjung dengan draft pesanan. Pembeli harus meninjau lalu mengirim sendiri.
- Di belakang reverse proxy, set `TRUST_PROXY=1` (sudah default di `compose.production.yaml`) agar rate limit dihitung per IP klien, bukan IP Caddy. Biarkan `0` bila API diekspos langsung.
- Rate limiter saat ini menyimpan hitungan di memori satu proses. Untuk beberapa replika, pindahkan penghitung ke Redis sebelum mengandalkannya sebagai kontrol produksi.
- Backup database dijadwalkan harian pukul 03.00 WIB bila `S3_BACKUP_BUCKET` dan kredensial S3 tersedia. Backup memakai format custom `pg_dump`, enkripsi server-side AES256, penghapusan file sementara setelah unggah, dan retensi 30 hari. Tanpa bucket/kredensial, backup tetap nonaktif; verifikasi pemulihan database tetap perlu dilakukan sebelum produksi.
- Ringkasan laporan email dikirim pada jam WIB pilihan owner ke alamat akun owner di tenant. SMTP harus diatur di `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, dan `SMTP_FROM`; owner juga harus mengaktifkannya dari panel katalog. Email berisi total penjualan/HPP/pengeluaran hari sebelumnya, bukan daftar transaksi atau data pelanggan.

## Persiapan deployment produksi

Template produksi memisahkan web, API, PostgreSQL, Redis, dan Caddy reverse proxy. PostgreSQL/Redis/API tidak membuka port host; hanya Caddy membuka 80/443 dan membuat sertifikat TLS setelah DNS benar.

1. Siapkan VPS Linux dengan Docker Engine/Compose, domain web dan subdomain API. Arahkan DNS keduanya ke IP VPS dan izinkan TCP 80/443 serta UDP 443.
2. Salin `.env.production.example` menjadi `.env.production` di server. Isi domain, email sertifikat, password database URL-safe, dan dua secret JWT acak yang berbeda (masing-masing minimal 32 karakter). Jangan commit atau kirim file ini lewat chat.
3. Isi `NEXT_PUBLIC_SITE_URL` dan `NEXT_PUBLIC_API_URL` sesuai domain HTTPS; keduanya dipakai saat web dibangun. Origin web harus sama dengan `CORS_ORIGINS`.
4. Dari root project jalankan `docker compose --env-file .env.production -f compose.production.yaml up -d --build`.
5. Periksa `docker compose --env-file .env.production -f compose.production.yaml ps`, health API, halaman web, dan TLS di kedua domain. Migrasi berjalan saat API mulai.
6. Sebelum menerima transaksi nyata, isi konfigurasi S3 backup, jalankan backup, pulihkan ke database uji, dan pastikan login/checkout/receipt/laporan berfungsi di staging.

File produksi ini baru template deployment. Belum dijalankan terhadap VPS/domain nyata, belum ada kredensial produksi, dan belum ada verifikasi restore/UAT. Gunakan backup di luar host bila memungkinkan; retensi bucket 30 hari tidak melindungi dari kehilangan seluruh server atau akun bucket.
