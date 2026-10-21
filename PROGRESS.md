# Laporan Progres Pengerjaan

> Catatan ini diperbarui selama backlog dikerjakan. Status `selesai` berarti fitur dan implementasinya sudah ada; pekerjaan yang perlu layanan/akun eksternal atau UAT tetap ditandai terpisah sampai benar-benar bisa diverifikasi.

## Selesai pada 6 Oktober 2026

- **Day 8 — POS UI:** terminal kasir, pencarian SKU/nama, filter kategori, kartu produk bergambar, Zustand cart, dan batas jumlah berdasarkan stok.
- **Day 9 — Dual price:** toggle member/non-member, harga dan PV dihitung ulang, validasi ID HNI, subtotal, uang diterima, dan kembalian.
- **Day 10 — Customer:** tabel customer dan profil HNI, CRUD, quick-add dari POS, histori transaksi, serta total PV.
- **Day 11 — Checkout:** endpoint checkout atomik, harga diambil ulang dari server, pengurangan batch FEFO, invoice berurutan per toko/hari, pencatatan PV, dan idempotency key.
- **Day 12 — Struk:** halaman publik ber-token acak, QR verifikasi, tata letak cetak 58/80 mm, dan browser print / Save as PDF.
- **Day 14 — POS polish:** tahan/lanjut draft di browser per tenant, diskon item/transaksi, voucher berkuota, dan shortcut kasir.
- **Day 15 — Laporan:** KPI omzet/transaksi/isi keranjang, grafik omzet dan transaksi per jam WIB, ringkasan kategori, serta filter tanggal.
- **Day 16 — Laba rugi:** catat pengeluaran, hitung HPP dari batch terkait invoice, tandai HPP yang hilang, dan ekspor XLSX/PDF.
- **Day 17 — Rekap PV (sebagian):** agregasi bulanan per member/SKU dan halaman unduh CSV dasar sudah ada. Format unggah HPAI masih menunggu template resmi kosong.
- **Day 18 — Katalog publik:** katalog SSR per slug tenant, stok ready yang belum kedaluwarsa, pencarian/filter kategori, halaman detail, SEO/OG, sitemap untuk toko aktif, dan pengaturan owner untuk mengaktifkan katalog.
- **Day 19 — Order WhatsApp:** keranjang browser per toko dan draft tautan WhatsApp dengan daftar barang/harga; pengunjung tetap mengirim sendiri. Nomor WA bisa diatur owner dari panel katalog publik.
- **Day 20 — Email laporan (kode tersedia):** owner dapat memilih hidup/mati dan jam WIB; job membuat email HTML agregat kemarin kepada akun owner. Pengiriman tetap mati sampai SMTP dikonfigurasi, lalu perlu uji email pemilik.
- **Day 22 — Jaringan (sebagian):** pohon downline dan akumulasi PV bulanan ditampilkan dari ID upline yang sudah disimpan di profil HNI. Relasi belum dinormalisasi ke tabel `network_tree`.
- **Day 26 — Keamanan (sebagian):** audit log untuk request tulis terautentikasi, pembatasan request per IP, CORS allowlist, security headers, dan penanda review untuk diskon >= ambang konfigurasi. Rate limit masih per proses; checklist OWASP/staging belum selesai.
- **Day 28 — PWA (sebagian):** manifest, ikon, service worker, install prompt, cache aset statis, dan halaman offline. Cache produk dan antrean checkout offline belum dibuat; transaksi tetap perlu server untuk validasi stok.
- **Day 27 — Backup (kode tersedia):** job `pg_dump` ke S3 terjadwal pukul 03.00 WIB, enkripsi server-side, file lokal sementara dibersihkan, dan objek lama dihapus setelah 30 hari. S3 belum diatur dan restore belum diuji.
- Migrasi fitur checkout, katalog publik, audit log, dan jadwal email sudah diterapkan ke database lokal; Prisma melaporkan 13 migrasi sinkron.
- Runtime smoke-check pada Docker: `/health`, daftar slug katalog publik, halaman katalog tenant yang tidak ada, dan halaman web merespons 200; pengaturan storefront tanpa login merespons 401.
- Alur checkout, deduplikasi idempotency, receipt publik, dan voucher/discount sudah smoke-check terhadap API lokal; data tenant uji sudah dihapus.
- Laporan omzet dan P&L juga cocok dengan transaksi/pengeluaran sementara; seluruh akun uji dan tenant terkait telah dihapus.
- Lint dan build API/web berhasil setelah perubahan terakhir. Empat file suite API yang sudah ada lulus, total 13 test. `git diff --check` bersih. Coverage belum dihitung dan flow E2E/load/UAT belum berjalan.

## Selesai pada 8 Oktober 2026

- **Day 13 WhatsApp (hardening keamanan di `main`):** `GET /whatsapp/logs` dan pencarian transaksi pada `POST /transactions/:id/whatsapp` kini difilter `tenantId` secara eksplisit (sebelumnya lintas toko — owner toko A bisa membaca nomor pelanggan toko B). Batas kirim 3×/10 menit kini hanya menghitung `SENT`/`FAILED`, sehingga `SKIPPED` (gateway belum aktif) tidak lagi memicu 429. Empat unit test baru; total 216 test lulus, lint/build bersih.
- **Day 24 Super Admin (backend + test):** `AdminService`/`AdminController` (`/admin/summary`, `/admin/tenants`, `/admin/tenants/:id`, `PATCH /admin/tenants/:id/status`) lengkap dengan `runUnscoped` agar query platform tidak terkontaminasi scope tenant; suspend menolak diri sendiri, mewajibkan alasan, mencabut semua refresh token, menulis audit `PLATFORM_SUSPEND`/`PLATFORM_ACTIVATE`, dan meng-invalidate cache status tenant. 12 unit test baru (`admin.service.spec.ts`); total **228 test** lulus, coverage 73,8% lines / 85,3% branches, lint/build bersih.
- Integrasi eksternal (WhatsApp Fonnte/Wablas, SMTP laporan, backup S3) dipastikan sudah lengkap kodenya dan ter-wiring di compose; yang tersisa adalah kredensial pemilik layanan serta verifikasi kirim/restore. Langkah operasional tercatat di `SETUP.md`.

## Selesai pada 9 Oktober 2026

- **Audit workspace:** `pnpm lint` 0 warning, `pnpm build` sukses, `git diff --check` bersih.
- **Day 13 WA selesai (kode):** provider `mock` sandbox tanpa pulsa (`WHATSAPP_PROVIDER=mock`), Fonnte/Wablas tetap didukung; verifikasi kirim asli menunggu token owner.
- **Day 17 CSV final:** `src/reports/pv-csv.ts` + `GET /reports/pv.csv?month=&mode=` + template `docs/pv-upload-template.csv` (4 test).
- **Bonus HPAI helper:** `src/bonus/hpai-formula.ts` (`validateHpaiScheme`, `calculateHpaiPayout`) siap diisi angka resmi (4 test).
- **Integrasi eksternal:** `src/integrations/external.service.ts` — Midtrans sandbox/mock, Telegram/Slack mock, Sentry in-memory mock (5 test).
- **Day 25 billing:** `src/billing/plans.ts` Free/Pro/Enterprise + feature flags + invoice + reminder (5 test).
- **Day 28 offline:** `src/offline/offline.ts` snapshot + validator antrean (2 test); UI IndexedDB menunggu repo web.
- **Day 29/30:** `UAT_CHECKLIST.md` + `INSTRUCTIONS_FOR_OWNER.md` dibuat; E2E Playwright/load k6/UAT manusia + deploy VPS tetap tugas owner.
- Total **26 suite / 248 test lulus** (naik dari 228).

## Sedang dikerjakan

- **2026-10-07 — Polyrepo + satu branch:** repo terpecah menjadi `night-atrociraptor` (backend, repo ini) dan `night-atrociraptor-web` (frontend Next.js, repo baru). `packages/shared` dihapus (tidak terpakai), konfigurasi monorepo (turbo/workspace filter) dihilangkan, tiap repo punya lockfile, Dockerfile, CI, dan dokumentasi sendiri. Branch `feature/lanjutkan-fitur-ai-baru` sudah di-merge ke `main` dan dihapus (lokal + remote) — pengembangan berjalan di `main` saja.
- API dan web sudah dibangun ulang dari source terbaru di Compose. Layanan berjalan; database sehat dan endpoint yang dicek merespons sesuai status di atas.

## Selesai pada 20 Oktober 2026 (Audit & Sinkronisasi PRD v2.0)

- **Audit & Penyelarasan PRD:** Seluruh file backend (`Projectke2`) dan frontend (`Projectke2-web`) telah dicek ulang terhadap PRD v2.0 (Epik E1 s/d E12).
- **Backend Test Suite:** 27 test suite lulus (251 unit test), mencakup seluruh logika inti POS, FEFO, Multi-Tenant, Jaringan Downline, Bonus Simulator, Super Admin, Billing Plans, Alerting, dan Backup S3.
- **Frontend Test Suite:** Penambahan `vitest.config.mjs` di frontend agar unit test vitest terpisah rapi dari skenario Playwright E2E; 4 unit test cart store lulus 100%.
- **Matriks & Gap Backlog:** Dokumen `backlog.md` diperbarui dengan matriks sinkronisasi detail PRD vs implementasi aktual, memisahkan pekerjaan yang membutuhkan input kredensial pemilik (unblocking), tugas teknis tersisa, gap fitur lanjutan, dan persiapan peluncuran.

## Belum dikerjakan / Butuh Tindak Lanjut

1. **Masukan dari Pemilik Proyek (Kredensial & Data Resmi):**
   - Token WhatsApp (Fonnte/Wablas) untuk tes struk live.
   - Kredensial SMTP untuk live delivery laporan harian otomatis.
   - Template resmi CSV HPAI & persentase marketing plan resmi HPAI.
   - Kredensial Midtrans & bucket S3 untuk backup live + restore test.
2. **Pekerjaan Teknis Tersisa:**
   - Frontend IndexedDB & antrean transaksi offline kasir (Day 28).
   - UI upgrade billing & webhook payment di frontend (Day 25).
   - Eksekusi Playwright E2E (`npm run test:e2e`) dan k6 load testing (Day 29).
3. **Peluncuran (Day 30):**
   - Deploy VPS, domain + Cloudflare SSL, dan UAT operasional dengan pemilik toko.

