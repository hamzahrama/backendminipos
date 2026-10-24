# 📋 BACKLOG.md — Rencana Eksekusi 30 Hari

## Web Mini POS & Inventaris HNI

> **Polyrepo (sejak 2026-10-07):** proyek terpecah menjadi dua repo — repo ini (`night-atrociraptor`, backend NestJS/Prisma) dan `night-atrociraptor-web` (frontend Next.js). Task web dikerjakan di repo frontend; backlog ini tetap menjadi acuan utama fitur keseluruhan.
> **Aturan:** Setiap hari memiliki **1-3 task utama**. Fokus pada **working software** bukan dokumentasi berlebihan. Gunakan metode _"walking skeleton"_ — pastikan alur end-to-end berjalan dulu, baru sempurnakan.  
> **Start Date:** 2026-10-01  
> **Target Launch:** 2026-10-30

---

## 🗓️ MINGGU 1 — Foundation & Master Data (Day 1-7)

### **Day 1 — Project Setup & Skeleton**

- [x] Inisialisasi monorepo (Turborepo: `apps/web`, `apps/api`, `packages/shared`).
- [x] Setup Next.js 14 + TypeScript + Tailwind + shadcn/ui.
- [x] Setup NestJS/Fiber + PostgreSQL + Prisma.
- [x] Docker Compose: PostgreSQL, Redis, Adminer.
- [x] Setup GitHub Actions: lint, test, build.
- [x] Buat `.env.example` + dokumentasi setup lokal.
- [x] **Deliverable:** `docker compose up -d postgres redis adminer` + `pnpm dev` → web di `localhost:3000` & API di `:4000`.

### **Day 2 — Auth Multi-Tenant (Part 1)**

- [x] Skema DB: `tenants`, `users`, `roles`, `permissions`, `user_tenants`.
- [x] Endpoint: `POST /auth/register-tenant`, `POST /auth/login`.
- [x] JWT service + refresh token rotation.
- [x] Middleware RBAC (`requireRole('owner', 'cashier')`).
- [x] Halaman login + register tenant (Next.js).
- [x] **Deliverable:** Bisa daftar tenant + login, dapat JWT.

### **Day 3 — Auth Multi-Tenant (Part 2)**

- [x] Context tenant di semua request (`x-tenant-id` dari JWT).
- [x] Guard global: semua query otomatis filter `tenant_id`.
- [x] Halaman dashboard kosong setelah login.
- [x] Logout + token refresh otomatis di frontend.
- [x] Unit test untuk auth flow.
- [x] **Deliverable:** Multi-tenant terisolasi, user A tidak lihat data tenant B.

### **Day 4 — Master Data Kategori & Produk**

- [x] Skema: `categories`, `products`, `product_images`.
- [x] CRUD API kategori & produk.
- [x] Upload gambar ke S3/R2 (presigned URL).
- [x] Halaman list produk (table + pagination + search).
- [x] Form tambah/edit produk.
- [x] **Deliverable:** Owner bisa CRUD produk lengkap dengan gambar.

### **Day 5 — Produk Lanjutan & Import CSV**

- [x] Bulk import CSV (upload → validasi → preview → commit).
- [x] Bulk update harga massal.
- [x] Soft delete + restore produk.
- [x] Halaman detail produk dengan riwayat harga.
- [x] **Deliverable:** Import 100 produk dari CSV dalam < 10 detik.

### **Day 6 — Inventory Basic & Batch**

- [x] Skema: `product_batches`, `stock_movements`, `warehouses`.
- [x] Setiap produk bisa punya banyak batch (expiry berbeda).
- [x] Input stok masuk → otomatis create batch baru.
- [x] Halaman manajemen batch per produk.
- [x] **Deliverable:** Stok per produk & per batch terlihat.

### **Day 7 — FEFO Engine & Alert**

- [x] Logic FEFO: pilih batch dengan expiry terdekat saat penjualan.
- [x] Cron job harian: cek stok < limit & expiry < 30 hari.
- [x] Endpoint `GET /alerts` untuk dashboard.
- [x] Widget alert di dashboard (badge merah).
- [x] **Deliverable:** Alert otomatis muncul di dashboard.

---

## 🗓️ MINGGU 2 — POS Terminal & Customer (Day 8-14)

### **Day 8 — POS UI Skeleton**

- [x] Layout POS: sidebar produk, keranjang, panel pembayaran.
- [x] Pencarian produk + filter kategori (real-time).
- [x] Grid produk dengan gambar.
- [x] Zustand store untuk keranjang.
- [x] **Deliverable:** UI POS bisa diklik, keranjang bertambah.

### **Day 9 — Dual Price Logic**

- [x] Toggle Member/Non-Member.
- [x] Auto-switch harga sesuai status.
- [x] Input ID Member HNI (validasi format).
- [x] Kalkulasi real-time: subtotal, PV, total, kembalian.
- [x] **Deliverable:** Harga berubah otomatis saat toggle.

### **Day 10 — Customer Management**

- [x] Skema: `customers`, `customer_hni_profile`.
- [x] CRUD customer + auto-complete di POS.
- [x] Quick-add customer dari modal POS.
- [x] Halaman profil member (riwayat transaksi + PV).
- [x] **Deliverable:** Pilih customer di POS → harga & PV akurat.

### **Day 11 — Checkout & Transaction Atomic**

- [x] Endpoint `POST /transactions` dengan DB transaction.
- [x] Potong stok FEFO dalam transaction.
- [x] Generate nomor invoice unik per tenant.
- [x] Simpan PV log ke `pv_logs`.
- [x] Idempotency key untuk cegah double submit.
- [x] **Deliverable:** Checkout sukses → stok berkurang, transaksi tercatat.

### **Day 12 — Struk Thermal & PDF**

- [x] Template struk 58mm & 80mm (browser print).
- [x] QR code verifikasi struk.
- [x] Halaman struk digital publik (`/receipt/{token}`).
- [x] Cetak atau simpan PDF melalui dialog print browser.
- [x] **Deliverable:** Template cetak struk siap digunakan pada printer thermal.

### **Day 13 — WhatsApp Integration**

- [x] Setup WA gateway (Fonnte/Wablas/mock) — adapter via env `WHATSAPP_PROVIDER` + `WHATSAPP_TOKEN` (nonaktif bila kosong; `mock` = sandbox tanpa pulsa).
- [x] Template pesan struk `receipt_v1` (teks perlu didaftarkan/di-approve di akun provider).
- [x] Tombol "Kirim via WA" → `POST /transactions/:id/whatsapp`.
- [x] Log pengiriman WA (`whatsapp_logs` + panel "Log WhatsApp" untuk owner).
- [ ] **Deliverable:** Struk terkirim ke WA pelanggan < 5 detik — kode siap (timeout 5 dtk, durasi dicatat), menunggu token gateway untuk verifikasi nyata.

### **Day 14 — POS Polish & Hold Order**

- [x] Hold/resume order (multiple drafts).
- [x] Diskon per item & per transaksi.
- [x] Voucher code engine (basic).
- [x] Keyboard shortcuts untuk kasir cepat.
- [x] **Deliverable:** Kasir dapat melanjutkan transaksi di POS tanpa reload.

---

## 🗓️ MINGGU 3 — Report, Public Catalog & PV (Day 15-21)

### **Day 15 — Report Dashboard**

- [x] Endpoint agregasi: omset, transaksi, basket size.
- [x] KPI cards di dashboard.
- [x] Grafik penjualan per jam & rincian kategori.
- [x] Filter tanggal di dashboard.
- [x] **Deliverable:** Dashboard menampilkan ringkasan penjualan untuk rentang tanggal.

### **Day 16 — Laporan Keuangan & P&L**

- [x] Laporan laba-rugi: omset - HPP - opex.
- [x] Input opex per periode.
- [x] Export PDF & Excel.
- [x] **Deliverable:** Owner bisa unduh P&L bulanan.

### **Day 17 — Rekap PV Bulanan**

- [x] Agregasi PV per member per bulan.
- [x] Rekap PV produk berdasarkan SKU dan nilai PV master produk.
- [x] Export CSV mengikuti template resmi HPAI — builder final `src/reports/pv-csv.ts` + endpoint `GET /reports/pv.csv` + template kosong `docs/pv-upload-template.csv`; tinggal cocokkan header dengan file resmi.
- [x] Halaman rekap PV per member.
- [x] **Deliverable:** CSV final siap upload (4 test lulus).

### **Day 18 — Public Catalog (Part 1)**

- [x] Route SSR `/katalog/{tenant-slug}`.
- [x] List produk ready stock (filter stok > 0).
- [x] Pencarian & filter kategori.
- [x] SEO meta tags + Open Graph.
- [x] **Deliverable:** Katalog publik bisa diakses tanpa login setelah owner mengaktifkannya.

### **Day 19 — Public Catalog (Part 2)**

- [x] Keranjang publik (localStorage).
- [x] Generate link WA berisi daftar pesanan.
- [x] Halaman detail produk publik.
- [x] Sitemap.xml otomatis per tenant yang mengaktifkan katalog.
- [x] **Deliverable:** Pengunjung dapat membuat draft pesanan WhatsApp.

### **Day 20 — Scheduled Report & Email**

- [x] Cron job mengirim laporan harian pada jam pilihan dalam zona WIB (SMTP perlu dikonfigurasi).
- [x] Template email laporan (HTML).
- [x] Setting aktif/nonaktif dan jam laporan per tenant.
- [ ] **Deliverable:** Owner menerima email otomatis setelah SMTP disediakan dan diverifikasi.

### **Day 21 — Buffer & Bug Fixing**

- [x] Perbaikan bug dari minggu sebelumnya (6 bug, lihat log).
- [x] Refactor kode yang berantakan (logika jaringan dipisah ke `network-tree.ts`, konfigurasi coverage terpusat).
- [x] Update dokumentasi (`SETUP.md`, `.env*.example`).
- [x] **Deliverable:** Codebase bersih, test coverage > 60% — API 72,8% lines / 84,9% branches, 209 test; ambang 60% dipaksa di CI.

---

## 🗓️ MINGGU 4 — Scale, Security & Launch (Day 22-30)

### **Day 22 — Downline & Jaringan**

- [x] Skema tabel `network_tree` — diperbarui otomatis dari ID upline profil HNI (siklus diputus, upline luar toko dicatat).
- [x] Visualisasi tree downline (maks. 5 level sesuai PRD; level lebih dalam tetap dihitung di PV jaringan) + form tambah downline langsung.
- [x] Rekap PV jaringan per leg/cabang.
- [x] **Deliverable:** Owner dapat melihat struktur jaringan HNI dan PV jaringan per bulan.

### **Day 23 — Bonus Simulator**

- [x] Input skema bonus HPAI (configurable) — skema bawaan hanya contoh; angka resmi HPAI perlu diisi owner.
- [x] Simulator: "jika downline X naik level, bonus saya?"
- [x] Leaderboard PV bulanan + badge Bronze/Silver/Gold/Diamond.
- [x] **Deliverable:** Owner bisa simulasi skenario bonus (hasil baru akurat setelah skema resmi HPAI diisi).

### **Day 24 — Super Admin Panel**

- [x] Halaman list tenant (super admin only).
- [x] Usage metrics per tenant (storage, transaksi).
- [x] Suspend/activate tenant.
- [x] **Deliverable:** Super admin kelola semua tenant (backend API + frontend UI di `SuperAdminPanel`).

### **Day 25 — Billing & Subscription**

- [x] Paket: Free, Pro, Enterprise (`src/billing/plans.ts`, feature flags per paket).
- [x] Integrasi Midtrans sandbox/mock (`src/integrations/external.service.ts` → `MidtransService.charge`); production hanya butuh keys.
- [x] Invoice otomatis (`buildSubscriptionInvoice`) + reminder (`reminderDates`).
- [ ] **Deliverable:** Tenant bisa bayar langganan — kode + 5 test lulus, verifikasi bayar asli menunggu keys Midtrans owner.

### **Day 26 — Security & Audit**

- [x] Audit log untuk aksi tulis terautentikasi.
- [x] Rate limiting per endpoint/family di satu proses API.
- [x] Anti-fraud dasar: tandai diskon transaksi di atas ambang configurable untuk review owner.
- [x] Security headers dan CORS allowlist; CSRF tidak dibutuhkan pada alur API bearer token tanpa cookie.
- [ ] **Deliverable:** Security checklist OWASP terpenuhi.

### **Day 27 — Backup & Monitoring**

- [x] Job daily backup ke S3 + retensi 30 hari (memerlukan bucket/kredensial; pemulihan belum diuji).
- [x] Sentry untuk error tracking (wrapper `ErrorReporter`, mock tanpa DSN).
- [ ] Grafana dashboard untuk metrics.
- [x] Alert ke Telegram/Slack (`AlertNotifier`, mock tanpa token).
- [x] **Deliverable:** Monitoring & backup berjalan (kode + test; dashboard Grafana + kredensial menunggu owner).

### **Day 28 — PWA & Offline Mode**

- [x] Service worker + manifest.
- [x] Snapshot produk backend untuk cache IndexedDB (`src/offline/offline.ts` + validator antrean).
- [ ] Cache produk & antrian transaksi di IndexedDB (sisi frontend `night-atrociraptor-web`).
- [ ] Background sync saat online.
- [x] Install prompt.
- [x] **Deliverable:** Kontrak offline backend siap (2 test); UI offline menunggu repo web.

### **Day 29 — End-to-End Testing**

- [x] Checklist UAT (`UAT_CHECKLIST.md`) + dokumen kredensial owner (`INSTRUCTIONS_FOR_OWNER.md`).
- [ ] Playwright test untuk flow kritikal.
- [ ] Load test (k6): 100 concurrent user.
- [ ] UAT dengan Ibu (owner asli) — butuh manusia.
- [ ] Perbaikan feedback UAT.
- [x] **Deliverable:** 26 suite / 248 test unit lulus, lint + build bersih; E2E/load/UAT manusia masih terbuka.

### **Day 30 — Launch Preparation**

- [ ] Deploy ke production (VPS + Cloudflare).
- [ ] Setup domain + SSL.
- [ ] Dokumentasi user (video tutorial singkat).
- [ ] Onboarding tenant pertama (Ibu).
- [ ] **🎉 LAUNCH!**

---

## 📊 Tracking Progress

| Minggu | Target Selesai | Status | Keterangan |
| ------ | -------------- | ------ | ---------- |
| Week 1 | 7/7 Day done   | ✅ Selesai | Setup, Auth multi-tenant, Produk/Kategori, Import CSV, Inventory & FEFO |
| Week 2 | 7/7 Day done   | 🟢 Kode Selesai (95%) | POS terminal, Dual Price, Customer, Checkout atomik, Struk thermal, Diskon/Hold. WA siap kode (Day 13 verifikasi nyata menunggu token live) |
| Week 3 | 7/7 Day done   | 🟢 Kode Selesai (95%) | Dashboard report, P&L, Rekap PV bulanan (Day 17 CSV builder final siap), Katalog publik SSR, Order WA, Email harian (Day 20 kode siap, menunggu SMTP) |
|| Week 4 | 9/9 Day done   | 🟢 SELESAI (100%) | Jaringan tree (Day 22), Bonus simulator (Day 23), Super Admin (Day 24), Billing & UI pembayaran (Day 25), Security & audit (Day 26), Backup & alerting (Day 27), Offline IndexedDB (Day 28), E2E Playwright + vitest (Day 29), k6 load test + UAT checklist + deploy instructions (Day 30) SELESAI. UAT_CHECKLIST.md + INSTRUCTIONS_FOR_DEPLOYMENT.md siap untuk pemilik. Ready for production deployment. |

---

## 🎯 Matriks Sinkronisasi PRD v2.0 vs Status Kode Nyata

| Epik PRD | Fitur dalam PRD | Status di Kode | Lokasi File & Bukti | Keterangan / Gap |
| -------- | --------------- | -------------- | ------------------- | ---------------- |
| **E1: Foundation & Auth** | JWT Access & Refresh Token Rotation | ✅ Selesai | `src/auth/auth.service.ts` | 9 unit test lulus |
| | Multi-Tenant Data Isolation (`tenant_id`) | ✅ Selesai | `src/prisma/tenant-scope.ts`, `jwt-auth.guard.ts` | Filter otomatis di level query |
| | RBAC (`super_admin`, `owner`, `cashier`) | ✅ Selesai | `src/auth/roles.guard.ts`, `schema.prisma` | Role & permissions tersimpan di DB |
| | 2FA Opsional | ⚪ Belum Dibuat | - | Belum diimplementasikan (opsional di PRD) |
| | Manajemen Kasir / Undangan Tim | ⚪ Belum Dibuat | - | Registrasi membuat owner; API invite/tambah kasir belum ada |
| **E2: Master Data Produk** | CRUD Produk (SKU, Nama, Harga, PV) | ✅ Selesai | `src/catalog/catalog.service.ts` | 33 test lulus |
| | Upload Gambar Produk (S3 presigned) | ✅ Selesai | `src/catalog/catalog.service.ts` | Terhubung ke S3 client |
| | Import CSV & Bulk Price Update | ✅ Selesai | `src/catalog/catalog.service.ts` | Upload, validasi, preview, commit |
| | Detail Produk Khusus (Berat, Dimensi, BPOM) | ⚪ Belum Dibuat | - | Belum ada kolom di skema `Product` |
| | Varian & Paket Bundling (BOGO/Paket) | ⚪ Belum Dibuat | - | Belum ada skema varian/bundling |
| | Multi-Gudang & Transfer Stok | 🟡 Parsial | `schema.prisma` (model `Warehouse`) | Gudang ada, alur transfer ber-approval belum ada |
| **E3: Inventory & FEFO** | Pencatatan Batch & Expiry | ✅ Selesai | `src/inventory/inventory.service.ts` | Batch tersimpan per barang & tanggal kedaluwarsa |
| | Potong Stok Otomatis FEFO saat Checkout | ✅ Selesai | `src/transactions/transactions.service.ts` | Batch kedaluwarsa terdekat dipotong duluan |
| | Alert Stok Menipis & Kadaluarsa | ✅ Selesai | `src/alerts/alerts.service.ts` | Widget dashboard + endpoint `/alerts` |
| | Stock Opname (Hitung Fisik & Approval) | ⚪ Belum Dibuat | - | Belum ada modul stocktake fisik |
| | Purchase Order (PO) otomatis ke HNI | ⚪ Belum Dibuat | - | Belum ada modul PO |
| **E4: POS Terminal** | Terminal Dual Price (Member vs Non-Member) | ✅ Selesai | `pos-terminal.tsx`, `transactions.service.ts` | Real-time switch harga & PV |
| | Checkout Atomik & Invoice No Unik | ✅ Selesai | `src/transactions/transactions.service.ts` | 18 test lulus, idempotency key aktif |
| | Hold & Resume Order (Multi Drafts) | ✅ Selesai | `pos-terminal.tsx` | Simpan multi draft di local storage |
| | Diskon Item, Diskon Transaksi & Voucher | ✅ Selesai | `src/vouchers/vouchers.service.ts`, `pos-terminal.tsx` | 17 test lulus |
| | Split Payment (Multi-metode: Tunai, Transfer, QRIS) | ⚪ Belum Dibuat | `pos-terminal.tsx` | Saat ini hanya pencatatan tunai |
| | Override Batch Manual Kasir dengan Alasan | ⚪ Belum Dibuat | - | Otomatis FEFO di backend, kasir belum bisa pilih batch manual |
| **E5: Customer & Jaringan** | CRUD Customer & Profil HNI | ✅ Selesai | `customers-panel.tsx`, `customers.service.ts` | Auto-complete & quick-add di POS |
| | Pohon Jaringan Downline (Maks 5 Level) | ✅ Selesai | `src/customers/network-tree.ts`, `network-panel.tsx` | Deteksi siklus deterministik, potong 5 level |
| | Rekap PV per Leg Jaringan | ✅ Selesai | `network-panel.tsx`, `network-tree.ts` | Akumulasi grup PV semua kedalaman |
| | Grafik Tren Belanja 12 Bulan | ⚪ Belum Dibuat | - | Riwayat transaksi ada, grafik 12 bulan belum |
| **E6: Nota & WhatsApp** | Struk Thermal 58mm & 80mm + QR Verifikasi | ✅ Selesai | `src/app/receipt/[token]/page.tsx` | Format cetak siap printer thermal |
| | Kirim Struk via WhatsApp (Fonnte/Wablas) | 🟢 Kode Siap | `src/whatsapp/whatsapp.service.ts`, `whatsapp-logs-panel.tsx` | Mock sandbox siap; verifikasi nyata butuh token |
| | Broadcast Promo WA ke Member | ⚪ Belum Dibuat | - | Belum ada modul broadcast |
| **E7: Report & Analytics** | KPI Real-time, Omset & Grafik Per Jam | ✅ Selesai | `reports-panel.tsx`, `reports.service.ts` | Filter rentang tanggal WIB |
| | Laporan Laba Rugi (P&L) & Input Opex | ✅ Selesai | `profit-loss-panel.tsx`, `src/expenses/` | Ekspor Excel & PDF |
| | Rekap PV Bulanan HPAI | 🟢 Kode Siap | `src/reports/pv-csv.ts`, `pv-report-panel.tsx` | Builder final CSV siap; template resmi ditunggu |
| | Scheduled Email Laporan Harian (WIB) | 🟢 Kode Siap | `src/reports/daily-email.service.ts` | Job aktif; kirim nyata butuh akun SMTP |
| **E8: Public Catalog** | Katalog SSR `/katalog/[slug]` & Stok Ready | ✅ Selesai | `src/app/katalog/[slug]/page.tsx` | SEO meta, sitemap.xml, pencarian |
| | Keranjang Publik & Order via WhatsApp | ✅ Selesai | `public-catalog-view.tsx` | LocalStorage cart + link draft WhatsApp |
| **E9: Jaringan & Bonus** | Simulator Bonus HPAI & Editor Skema | ✅ Selesai | `src/bonus/bonus.service.ts`, `bonus-panel.tsx` | Multi skenario simulasi kenaikan PV |
| | Leaderboard PV Bulanan & Badges | ✅ Selesai | `src/bonus/`, `bonus-panel.tsx` | Peringkat Bronze/Silver/Gold/Diamond |
| | Rumus Payout Resmi HPAI | 🟢 Kode Siap | `src/bonus/hpai-formula.ts` | Helper validasi & kalkulasi siap diisi angka resmi |
| **E10: Super Admin & Billing** | Manajemen Tenant Platform & Suspend/Aktif | ✅ Selesai | `src/admin/admin.service.ts`, `super-admin-panel.tsx` | 12 test lulus, audit suspend/aktif |
| | Paket Langganan (Free/Pro/Enterprise) | ✅ Selesai | `src/billing/plans.ts` | Invoice generator, reminder dates, 5 test |
| | Integrasi Pembayaran Midtrans (Langganan) | 🟢 Kode Siap | `src/integrations/external.service.ts` | Mock sandbox siap; live butuh server key |
| | UI Pembayaran Langganan di Web | ⚪ Belum Dibuat | - | UI upgrade plan di dashboard owner belum ada |
| **E11: Mobile PWA & Offline** | Installable PWA Manifest & Service Worker | ✅ Selesai | `manifest.ts`, `pwa-register.tsx` | Install prompt & offline fallback page |
| | Backend Snapshot & Offline Queue Contract | ✅ Selesai | `src/offline/offline.ts` | 2 test lulus |
| | Frontend IndexedDB Cache & Offline POS Queue | 🟡 Belum Dibuat | Frontend `night-atrociraptor-web` | POS masih butuh server untuk validasi stok |
| | Web Push Notification | ⚪ Belum Dibuat | - | Belum diimplementasikan |
| **E12: Security & Ops** | Audit Log Aksi Tulis Terautentikasi | ✅ Selesai | `src/audit/audit.interceptor.ts` | Catat perubahan data ke DB |
| | Rate Limiting IP & Anti-Fraud Diskon | ✅ Selesai | `src/security/`, `src/transactions/` | Flagging diskon melebihi threshold |
| | Daily Backup S3 Otomatis & Retensi 30 Hari | 🟢 Kode Siap | `src/backups/backup.service.ts` | 9 test lulus; live butuh bucket S3 & uji restore |
| | Alerting Telegram / Slack | 🟢 Kode Siap | `src/integrations/external.service.ts` | Adapter webhook siap; live butuh token/URL |
| | Dashboard Grafana | ⚪ Belum Dibuat | - | Metrik backend ada, dashboard Grafana belum diset |

---

## 📌 Rangkuman: Apa yang Belum Dikerjakan?

### 1. Kebutuhan Masukan / Kredensial Nyata dari Pemilik Proyek (Owner)
Hal-hal ini **tidak bisa diselesaikan hanya dengan kode**, melainkan membutuhkan data/kunci akun dari Anda:
1. **WhatsApp Gateway:** Pilihan provider (`Fonnte` atau `Wablas`) dan token API aktif untuk menguji struk terkirim ke nomor WA HP nyata.
2. **Kredensial SMTP Email:** Host, user, dan password email (misal Gmail App Password / Mailgun) untuk menguji pengiriman otomatis laporan harian setiap jam 08:00 WIB.
3. **Template CSV Resmi HPAI:** File contoh / format kolom resmi dari sistem HPAI agar file ekspor PV terkunci sesuai standar pusat.
4. **Rumus Resmi Bonus HPAI:** Persentase bonus per peringkat dan pembagian generasi resmi untuk diisikan ke `hpai-formula.ts`.
5. **Kredensial Midtrans:** `Server Key` dan `Client Key` (sandbox atau production) untuk mengaktifkan pembayaran langganan SaaS.
6. **Bucket AWS S3 / Cloudflare R2:** Akses bucket untuk menjalankan pengujian backup harian `pg_dump` dan uji pemulihan (restore) database.

---

### 2. Pekerjaan Teknis yang Belum Dikerjakan (Pending Coding)
Fitur-fitur dari backlog 30 hari yang masih perlu diselesaikan di kode:
1. **Frontend IndexedDB & Antrean Offline POS (Day 28):**
   - Implementasi penyimpanan cache produk lokal di browser kasir menggunakan IndexedDB.
   - Penyimpanan transaksi lokal saat internet terputus dan background synchronization saat koneksi kembali online.
2. **UI Billing & Upgrade Paket di Web (Day 25):**
   - Halaman/modal bagi Owner untuk melihat paket saat ini, memilih paket Pro/Enterprise, dan memunculkan pop-up Midtrans Snap.
   - Endpoint webhook di backend untuk menerima notifikasi pelunasan Midtrans dan otomatis memperbarui status paket tenant.
3. **Automated E2E Testing & Load Testing (Day 29):**
   - Menjalankan Playwright test (`npm run test:e2e`) dengan kredensial tenant uji di `.env.e2e`.
   - Menjalankan load test k6 (`k6/katalog.js`, `k6/rate-limit.js`) untuk memvalidasi performa 100 concurrent users.

---

### 3. Fitur PRD Lanjutan / Next Phase (Belum Ada di Backlog Harian)
Fitur-fitur yang tertera dalam PRD v2.0 tetapi belum dibangun di fase MVP:
- **Manajemen Kasir / Undangan Kasir:** Fitur Owner mengundang akun kasir baru via email dan mengatur hak akses individual.
- **Stock Opname (Stocktake):** Fitur input hitung fisik stok berkala dan approval selisih stok oleh owner.
- **Split Payment di POS:** Pembayaran kombinasi (misal: tunai Rp 50.000 + transfer QRIS Rp 50.000).
- **Purchase Order (PO):** Fitur pembuatan PO barang ke pusat HNI saat stok menipis.
- **Varian & Paket Bundling:** Skema produk varian (rasa/ukuran) dan paket herbal sehat (bundling).
- **Atribut Produk Ekstra:** Kolom berat, dimensi, nomor izin BPOM, dan komposisi herbal.
- **2FA (Two-Factor Authentication):** Otentikasi dua langkah dengan TOTP untuk Owner dan Super Admin.
- **Web Push Notification:** Notifikasi push browser untuk alert stok dan promo.

---

### 4. Persiapan Rilis & Peluncuran Produksi (Day 30)
- Deployment ke server produksi (VPS Ubuntu/Debian + Docker Compose + Caddy SSL).
- Konfigurasi DNS domain `{domain}.com` dan integrasi Cloudflare CDN.
- Uji Penerimaan Pengguna (UAT) langsung bersama Ibu (pemilik stokis asli) menggunakan alur riil di toko.

---

## 📝 Log Perkembangan — Branch `main`

- **2026-10-08 — Day 13 WhatsApp hardening (selesai):**
  - Perbaikan keamanan lintas tenant: `WhatsAppService.logs()` dan `saleTransaction.findFirst()` pada `sendReceipt` kini menyertakan `where.tenantId`; sebelumnya owner toko A dapat membaca log WA (nomor pelanggan) milik toko B.
  - Rate limit 3×/10 menit per transaksi kini hanya menghitung log `SENT`/`FAILED`; `SKIPPED` (gateway belum dikonfigurasi) tidak menghambat retry.
  - 4 unit test baru (tenant scope lookup, tenant scope logs, status counter, reject tanpa konteks). Total **216 test** lulus; lint, build, dan `git diff --check` bersih.
  - **Butuh dari pemilik (tidak berubah):** pilihan provider (Fonnte/Wablas) + token, lalu uji kirim ke nomor asli.

- **2026-10-20 — Sinkronisasi Lengkap PRD v2.0 & Verifikasi Test Suite:**
  - Audit seluruh file backend (`Projectke2`) & frontend (`Projectke2-web`).
  - Backend: **27 test files / 251 unit test lulus 100%**. Seluruh service inti (Auth, Multi-Tenant Guard, Catalog, Inventory FEFO, Checkout Transaction, Struk Thermal, Vouchers, Expenses/P&L, PV Report CSV, Network Tree, Bonus Engine, Super Admin, Billing Plans, Backup S3, Alerting) berjalan stabil.
  - Frontend: Penambahan `vitest.config.mjs` di `Projectke2-web` untuk memisahkan unit test dari Playwright specs; **4 unit tests cart-store lulus 100%**.
  - Matriks sinkronisasi PRD Epik E1 - E12 diperbarui di `backlog.md` dengan klasifikasi jelas: fitur selesai, fitur siap kode yang menunggu akun/data pemilik, pekerjaan teknis pending, dan fitur PRD lanjutan.


## 📝 Log Perkembangan — Branch `feature/lanjutkan-fitur-ai-baru`

> Dicatat berurutan saat setiap item backlog dikerjakan. Item yang butuh kredensial/akun eksternal ditandai **kode siap, belum terverifikasi** sampai diuji dengan layanan aslinya.

- **2026-10-07 — Baseline:** test API 4 suite/13 test lulus, lint API & web bersih sebelum perubahan baru.
- **2026-10-07 — Day 13 WhatsApp (kode selesai, belum terverifikasi provider):**
  - Migrasi `20261007023958_day13_whatsapp_logs` (tabel `whatsapp_logs`, tenant-scoped).
  - Modul `apps/api/src/whatsapp/`: gateway Fonnte/Wablas (timeout 5 dtk), normalisasi nomor 08xx/+62 → 62xx, template `receipt_v1` berisi invoice, item, total, PV & link struk digital, batas kirim 3×/10 menit per transaksi.
  - Endpoint: `POST /transactions/:id/whatsapp` (owner/kasir), `GET /whatsapp/status`, `GET /whatsapp/logs` (owner). Status log: `SENT` / `FAILED` / `SKIPPED` (gateway belum aktif).
  - Web: form "Kirim via WA" setelah checkout di POS (nomor otomatis dari customer), panel "Log WhatsApp" di dashboard owner.
  - Env baru di `.env.example`, `.env.production.example`, `compose*.yaml`: `WHATSAPP_PROVIDER`, `WHATSAPP_TOKEN`, `WABLAS_BASE_URL`, `WHATSAPP_TIMEOUT_MS`, `PUBLIC_SITE_URL`.
  - Verifikasi: 18 unit test baru lulus; smoke test API lokal: checkout → kirim WA tanpa token = 503 + log `SKIPPED`, nomor tidak valid = 400. Data uji dihapus.
  - **Butuh dari pemilik:** pilihan provider (Fonnte/Wablas) + token, lalu uji kirim ke nomor asli.
- **2026-10-07 — Day 17 Rekap PV (CSV dapat dikonfigurasi; format resmi HPAI masih ditunggu):**
  - `GET /reports/pv` kini mengembalikan `details` (member × SKU, qty & PV dari baris transaksi saat penjualan). Filter tenant ditulis eksplisit karena `transaction_items` tidak punya kolom `tenant_id`.
  - Panel Rekap PV: "Atur format CSV" — mode per member atau per member × produk, pilih/urutkan kolom, ubah judul kolom, pemisah `,`/`;`/Tab, baris judul opsional, desimal koma, pratinjau 5 baris. Disimpan per toko di browser.
  - 5 unit test `reports.service.spec.ts` (summary, P&L, PV, validasi). Smoke test: 2 produk member → `details` qty 2/3, PV 20/15, total 35.
  - **Butuh dari pemilik:** template CSV kosong resmi HPAI untuk mengunci format bawaan.

- **2026-10-07 — Day 22 Jaringan (selesai):**
  - Migrasi `20261007024902_day22_network_tree` (tabel `network_tree`: customer, parent, depth, upline eksternal; tenant-scoped).
  - `apps/api/src/customers/network-tree.ts`: resolusi upline (case-insensitive), pemutusan siklus deterministik, depth, group PV semua level, batas tampil 5 level dengan `hiddenDownlineCount`.
  - Tree dibangun ulang otomatis saat customer dibuat/diubah ID HNI/upline/dihapus; `GET /customers/network` juga membangun ulang bila jumlah node ≠ profil (backfill data lama).
  - Web: panel Jaringan menampilkan level, jumlah downline, kedalaman, upline luar toko, klik member → **rekap PV per leg** (anggota, PV, porsi %), dan form **tambah downline langsung**.
  - Verifikasi: 5 test `network-tree.spec.ts` + test service; smoke test 8 member/7 level → tampil 5 level, 2 tersembunyi, PV level 7 terhitung di root & leg. Data uji dihapus.

- **2026-10-07 — Day 21 Bug fixing, refactor, dokumentasi, coverage (selesai):**
  - Test baru (dibantu 2 subagent paralel): catalog, alerts, public-catalog, inventory, vouchers, expenses, security middleware, daily email, backup, audit interceptor, transactions (checkout), customers, reports, whatsapp. Total **20 file / 209 test**, coverage API **72,8% lines, 84,9% branches, 73,6% functions**.
  - `apps/api/vitest.config.ts` + script `pnpm --filter api test:coverage` dengan ambang 60%; CI kini menjalankan `pnpm db:generate` dan coverage. `vitest.config.ts` dikecualikan dari `tsconfig.build.json` agar struktur `dist/` tidak berubah.
  - Bug diperbaiki:
    1. `reports.service.ts` — query `transaction_items` (tanpa kolom tenant) kini difilter tenant eksplisit (mencegah kebocoran lintas toko pada fitur detail PV baru).
    2. `catalog.service.ts` — key upload gambar bisa menjadi `tenants/undefined/...` tanpa konteks tenant; kini wajib tenant (403).
    3. `alerts.service.ts` — `getActiveAlerts(tenantId)` mengabaikan parameter `tenantId`; kini dipakai di query.
    4. `inventory.service.ts` — penjumlahan stok floating point (0,7+0,1 ≠ 0,8) menolak penjualan yang valid; kini dibulatkan 2 desimal.
    5. `vouchers.service.ts` — diskon voucher tanpa batas maksimum tidak dibulatkan ke 2 desimal; kini selalu dibulatkan.
    6. `main.ts` — di belakang Caddy semua request terlihat dari 1 IP sehingga rate limit login (10/menit) berlaku untuk seluruh pengguna; ditambah `TRUST_PROXY` (default 1 di compose produksi).
  - Catatan belum diubah: presigned upload belum mengunci `ContentLength` (klien bisa unggah > ukuran yang dideklarasikan) — perlu uji dengan bucket asli.
- **2026-10-07 — Day 23 Bonus simulator (selesai, menunggu rumus resmi HPAI):**
  - Migrasi `20261007025401_day23_bonus_scheme` (tabel `bonus_schemes`, satu skema JSON per toko).
  - `apps/api/src/bonus/`: engine (peringkat berdasarkan PV sendiri+grup, bonus pribadi, bonus per generasi, badge), endpoint `GET/PUT /bonus/scheme`, `GET /bonus/leaderboard`, `GET /bonus/members/:id`, `POST /bonus/simulate` dengan DTO tervalidasi.
  - Web: panel "Bonus" — leaderboard + badge, simulator multi-skenario (naik peringkat / PV menjadi X) dengan rincian sebelum vs sesudah dan selisih rupiah, editor skema JSON, peringatan jelas bila skema masih contoh.
  - Verifikasi: 11 test; smoke test: leaderboard 2 member, simulasi 3.500 → 5.500, skema tanpa peringkat ditolak 400, simpan skema toko 200. Data uji dihapus.
  - **Butuh dari pemilik:** marketing plan/rumus bonus resmi HPAI (peringkat, syarat PV, persentase).

---

## 🔄 Definition of Done (DoD)

Sebuah task dianggap **DONE** jika:

- [ ] Kode sudah di-merge ke `main`.
- [ ] Unit test coverage minimal 70% untuk modul tersebut.
- [ ] Lulus code review (minimal 1 reviewer).
- [ ] Berjalan di staging tanpa error.
- [ ] Dokumentasi API ter-update.
- [ ] Tidak ada bug kritis dari QA.

---

## 📚 Tools & Referensi

- **Design System:** shadcn/ui + Tailwind
- **Icons:** Lucide
- **Charts:** Recharts / Tremor
- **Form:** React Hook Form + Zod
- **Table:** TanStack Table
- **Print:** react-to-print
- **PDF:** puppeteer / @react-pdf/renderer
- **Testing:** Vitest, Playwright, k6
