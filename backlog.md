# 📋 BACKLOG.md — Rencana Eksekusi 30 Hari

## Web Mini POS & Inventaris HNI

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

- [ ] Bulk import CSV (upload → validasi → preview → commit).
- [ ] Bulk update harga massal.
- [ ] Soft delete + restore produk.
- [ ] Halaman detail produk dengan riwayat harga.
- [ ] **Deliverable:** Import 100 produk dari CSV dalam < 10 detik.

### **Day 6 — Inventory Basic & Batch**

- [ ] Skema: `product_batches`, `stock_movements`, `warehouses`.
- [ ] Setiap produk bisa punya banyak batch (expiry berbeda).
- [ ] Input stok masuk → otomatis create batch baru.
- [ ] Halaman manajemen batch per produk.
- [ ] **Deliverable:** Stok per produk & per batch terlihat.

### **Day 7 — FEFO Engine & Alert**

- [ ] Logic FEFO: pilih batch dengan expiry terdekat saat penjualan.
- [ ] Cron job harian: cek stok < limit & expiry < 30 hari.
- [ ] Endpoint `GET /alerts` untuk dashboard.
- [ ] Widget alert di dashboard (badge merah).
- [ ] **Deliverable:** Alert otomatis muncul di dashboard.

---

## 🗓️ MINGGU 2 — POS Terminal & Customer (Day 8-14)

### **Day 8 — POS UI Skeleton**

- [ ] Layout POS: sidebar produk, keranjang, panel pembayaran.
- [ ] Pencarian produk + filter kategori (real-time).
- [ ] Grid produk dengan gambar.
- [ ] Zustand store untuk keranjang.
- [ ] **Deliverable:** UI POS bisa diklik, keranjang bertambah.

### **Day 9 — Dual Price Logic**

- [ ] Toggle Member/Non-Member.
- [ ] Auto-switch harga sesuai status.
- [ ] Input ID Member HNI (validasi format).
- [ ] Kalkulasi real-time: subtotal, PV, total, kembalian.
- [ ] **Deliverable:** Harga berubah otomatis saat toggle.

### **Day 10 — Customer Management**

- [ ] Skema: `customers`, `customer_hni_profile`.
- [ ] CRUD customer + auto-complete di POS.
- [ ] Quick-add customer dari modal POS.
- [ ] Halaman profil member (riwayat transaksi + PV).
- [ ] **Deliverable:** Pilih customer di POS → harga & PV akurat.

### **Day 11 — Checkout & Transaction Atomic**

- [ ] Endpoint `POST /transactions` dengan DB transaction.
- [ ] Potong stok FEFO dalam transaction.
- [ ] Generate nomor invoice unik per tenant.
- [ ] Simpan PV log ke `pv_logs`.
- [ ] Idempotency key untuk cegah double submit.
- [ ] **Deliverable:** Checkout sukses → stok berkurang, transaksi tercatat.

### **Day 12 — Struk Thermal & PDF**

- [ ] Template struk 58mm & 80mm (react-to-print).
- [ ] QR code verifikasi struk.
- [ ] Halaman struk digital publik (`/receipt/{token}`).
- [ ] Download PDF struk.
- [ ] **Deliverable:** Cetak struk ke printer thermal berhasil.

### **Day 13 — WhatsApp Integration**

- [ ] Setup WA gateway (Fonnte/Wablas).
- [ ] Template pesan struk (approved template).
- [ ] Tombol "Kirim via WA" → trigger API.
- [ ] Log pengiriman WA.
- [ ] **Deliverable:** Struk terkirim ke WA pelanggan < 5 detik.

### **Day 14 — POS Polish & Hold Order**

- [ ] Hold/resume order (multiple drafts).
- [ ] Diskon per item & per transaksi.
- [ ] Voucher code engine (basic).
- [ ] Keyboard shortcuts untuk kasir cepat.
- [ ] **Deliverable:** Kasir bisa layani 10 transaksi tanpa reload.

---

## 🗓️ MINGGU 3 — Report, Public Catalog & PV (Day 15-21)

### **Day 15 — Report Dashboard**

- [ ] Endpoint agregasi: omset, transaksi, basket size.
- [ ] KPI cards di dashboard.
- [ ] Grafik penjualan per jam & per kategori (Recharts).
- [ ] Filter tanggal global di dashboard.
- [ ] **Deliverable:** Dashboard menampilkan data real-time.

### **Day 16 — Laporan Keuangan & P&L**

- [ ] Laporan laba-rugi: omset - HPP - opex.
- [ ] Input opex per periode.
- [ ] Export PDF & Excel.
- [ ] **Deliverable:** Owner bisa unduh P&L bulanan.

### **Day 17 — Rekap PV Bulanan**

- [ ] Agregasi PV per member per bulan.
- [ ] Mapping kode produk → PV standar HPAI.
- [ ] Export CSV format HPAI.
- [ ] Halaman rekap PV per member.
- [ ] **Deliverable:** File CSV siap upload ke HPAI.

### **Day 18 — Public Catalog (Part 1)**

- [ ] Route SSR `/katalog/{tenant-slug}`.
- [ ] List produk ready stock (filter stok > 0).
- [ ] Pencarian & filter kategori.
- [ ] SEO meta tags + Open Graph.
- [ ] **Deliverable:** Katalog publik bisa diakses tanpa login.

### **Day 19 — Public Catalog (Part 2)**

- [ ] Keranjang publik (localStorage).
- [ ] Generate link WA berisi daftar pesanan.
- [ ] Halaman detail produk publik.
- [ ] Sitemap.xml otomatis per tenant.
- [ ] **Deliverable:** Pengunjung bisa order via WA.

### **Day 20 — Scheduled Report & Email**

- [ ] Cron job kirim laporan harian jam 8 pagi.
- [ ] Template email laporan (HTML).
- [ ] Setting jadwal report per tenant.
- [ ] **Deliverable:** Owner terima email laporan otomatis.

### **Day 21 — Buffer & Bug Fixing**

- [ ] Perbaikan bug dari minggu sebelumnya.
- [ ] Refactor kode yang berantakan.
- [ ] Update dokumentasi.
- [ ] **Deliverable:** Codebase bersih, test coverage > 60%.

---

## 🗓️ MINGGU 4 — Scale, Security & Launch (Day 22-30)

### **Day 22 — Downline & Jaringan**

- [ ] Skema: `network_tree` (parent-child relationship).
- [ ] Visualisasi tree downline (react-d3-tree).
- [ ] Rekap PV per leg.
- [ ] **Deliverable:** Owner bisa lihat struktur jaringan HNI-nya.

### **Day 23 — Bonus Simulator**

- [ ] Input skema bonus HPAI (configurable).
- [ ] Simulator: "jika downline X naik level, bonus saya?"
- [ ] Leaderboard PV bulanan.
- [ ] **Deliverable:** Owner bisa simulasi skenario bonus.

### **Day 24 — Super Admin Panel**

- [ ] Halaman list tenant (super admin only).
- [ ] Usage metrics per tenant (storage, transaksi).
- [ ] Suspend/activate tenant.
- [ ] **Deliverable:** Super admin kelola semua tenant.

### **Day 25 — Billing & Subscription**

- [ ] Integrasi Midtrans.
- [ ] Paket: Free, Pro, Enterprise.
- [ ] Invoice otomatis + reminder.
- [ ] Feature flags per paket.
- [ ] **Deliverable:** Tenant bisa bayar langganan.

### **Day 26 — Security & Audit**

- [ ] Audit log semua aksi kritikal.
- [ ] Rate limiting per endpoint.
- [ ] Anti-fraud: deteksi anomali transaksi.
- [ ] Helmet, CORS, CSRF protection.
- [ ] **Deliverable:** Security checklist OWASP terpenuhi.

### **Day 27 — Backup & Monitoring**

- [ ] Daily backup ke S3 + retensi 30 hari.
- [ ] Sentry untuk error tracking.
- [ ] Grafana dashboard untuk metrics.
- [ ] Alert ke Telegram/Slack jika ada error.
- [ ] **Deliverable:** Monitoring & backup berjalan.

### **Day 28 — PWA & Offline Mode**

- [ ] Service worker + manifest.
- [ ] Cache produk & antrian transaksi di IndexedDB.
- [ ] Background sync saat online.
- [ ] Install prompt.
- [ ] **Deliverable:** POS bisa dipakai offline.

### **Day 29 — End-to-End Testing**

- [ ] Playwright test untuk flow kritikal.
- [ ] Load test (k6): 100 concurrent user.
- [ ] UAT dengan Ibu (owner asli).
- [ ] Perbaikan feedback UAT.
- [ ] **Deliverable:** Semua flow utama lulus test.

### **Day 30 — Launch Preparation**

- [ ] Deploy ke production (VPS + Cloudflare).
- [ ] Setup domain + SSL.
- [ ] Dokumentasi user (video tutorial singkat).
- [ ] Onboarding tenant pertama (Ibu).
- [ ] **🎉 LAUNCH!**

---

## 📊 Tracking Progress

| Minggu | Target Selesai | Status |
| ------ | -------------- | ------ |
| Week 1 | 7/7 Day        | ⬜     |
| Week 2 | 14/14 Day      | ⬜     |
| Week 3 | 21/21 Day      | ⬜     |
| Week 4 | 30/30 Day      | ⬜     |

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
