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

## Sedang dikerjakan

- **2026-10-07 — Polyrepo + satu branch:** repo terpecah menjadi `night-atrociraptor` (backend, repo ini) dan `night-atrociraptor-web` (frontend Next.js, repo baru). `packages/shared` dihapus (tidak terpakai), konfigurasi monorepo (turbo/workspace filter) dihilangkan, tiap repo punya lockfile, Dockerfile, CI, dan dokumentasi sendiri. Branch `feature/lanjutkan-fitur-ai-baru` sudah di-merge ke `main` dan dihapus (lokal + remote) — pengembangan berjalan di `main` saja.
- API dan web sudah dibangun ulang dari source terbaru di Compose. Layanan berjalan; database sehat dan endpoint yang dicek merespons sesuai status di atas.

## Belum dikerjakan

- Day 13 (provider WA), format CSV akhir Day 17, Day 21 coverage, Day 23–25, bagian Day 26–28 yang belum selesai, Day 29, dan Day 30 masih terbuka di `backlog.md`.
- Integrasi nyata (WhatsApp, SMTP, backup S3, Midtrans, Sentry, monitoring, Telegram/Slack) perlu kredensial dan konfigurasi pemilik layanan sebelum pengiriman/pembayaran/backup/alert dapat dijalankan dan diverifikasi.
- UAT dengan pemilik toko dan peluncuran produksi memerlukan akses serta keputusan dari pemilik proyek.
- Masukan yang dibutuhkan: pilihan gateway dan token lokal; template kosong CSV dan rumus bonus HPAI; identitas super-admin, paket/harga/batas berlangganan, serta kredensial sandbox Midtrans. Pertanyaan sudah dikirim untuk dijawab di chat.
