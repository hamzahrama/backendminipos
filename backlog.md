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

- [x] Setup WA gateway (Fonnte/Wablas) — adapter via env `WHATSAPP_PROVIDER` + `WHATSAPP_TOKEN` (nonaktif bila kosong).
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
- [ ] Export CSV mengikuti template resmi HPAI (menunggu template kosong dari pemilik) — export kini dapat dikonfigurasi penuh sehingga tinggal disesuaikan.
- [x] Halaman rekap PV per member.
- [ ] **Deliverable:** CSV dapat disesuaikan dan siap upload setelah format resmi HPAI dikonfirmasi.

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

- [x] Audit log untuk aksi tulis terautentikasi.
- [x] Rate limiting per endpoint/family di satu proses API.
- [x] Anti-fraud dasar: tandai diskon transaksi di atas ambang configurable untuk review owner.
- [x] Security headers dan CORS allowlist; CSRF tidak dibutuhkan pada alur API bearer token tanpa cookie.
- [ ] **Deliverable:** Security checklist OWASP terpenuhi.

### **Day 27 — Backup & Monitoring**

- [x] Job daily backup ke S3 + retensi 30 hari (memerlukan bucket/kredensial; pemulihan belum diuji).
- [ ] Sentry untuk error tracking.
- [ ] Grafana dashboard untuk metrics.
- [ ] Alert ke Telegram/Slack jika ada error.
- [ ] **Deliverable:** Monitoring & backup berjalan.

### **Day 28 — PWA & Offline Mode**

- [x] Service worker + manifest.
- [ ] Cache produk & antrian transaksi di IndexedDB.
- [ ] Background sync saat online.
- [x] Install prompt.
- [ ] **Deliverable:** POS dapat dipakai offline.

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
| Week 1 | 7/7 Day done   | ✅     |
| Week 2 | 6/7 Day done   | 🟡     |
| Week 3 | 4/7 Day done   | 🟡     |
| Week 4 | 0/9 Day done; beberapa kode parsial | 🟡 |

---

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
