# UAT Checklist — Web Mini POS & Inventaris HNI (Week 4, Day 30)

**Date:** 24 Oktober 2026 | **Status:** Ready for UAT  
Target: semua baris PASS sebelum production launch.  
Tester: Pemilik toko + kasir + tim QA

## A. Auth & Tenant (Day 1-8)
- [ ] Register tenant baru, login, refresh token, logout
- [ ] User toko A tidak bisa melihat data toko B
- [ ] JWT token expired handle (refresh or re-login)

## B. Produk & Stok (Day 9-10)
- [ ] CRUD produk + upload gambar, import CSV 100 produk < 10 detik
- [ ] Stok masuk multi-batch, FEFO mengambil batch kedaluwarsa terdekat
- [ ] Alert stok menipis & kedaluwarsa < 30 hari muncul di dashboard

## C. POS & Checkout (Day 11-14)
- [ ] Toggle member/non-member mengubah harga + PV otomatis
- [ ] Checkout memotong stok, nomor invoice unik, idempotency (double-klik = 1 transaksi)
- [ ] Struk publik `/receipt/{token}` + QR + cetak 58/80mm di printer thermal asli
- [ ] Hold/resume draft, diskon, voucher, shortcut F2/F4/Ctrl+Enter

## D. WhatsApp Order & Alert (Day 13, 20)
- [ ] `POST /transactions/:id/whatsapp` terkirim < 5 detik ke nomor (mock tested, live pending token)
- [ ] Rate limit 3x/10 mnt, log tampil di panel owner
- [ ] Email laporan harian masuk inbox (mock SMTP tested, live pending credentials)

## E. Dashboard & Laporan (Day 15-17)
- [ ] Dashboard omzet/transaksi/basket + grafik per jam WIB + filter tanggal
- [ ] P&L (omzet − HPP − opex) + export XLSX/PDF cocok dengan data
- [ ] Rekap PV per member/SKU + `GET /reports/pv.csv` ter-upload ke HPAI

## F. Katalog Publik & Jaringan (Day 18-19, 22)
- [ ] `/katalog/{slug}` tanpa login, sitemap, order via link WA
- [ ] Pohon downline 5 level, PV jaringan, tambah downline
- [ ] Bonus simulator calculate + leaderboard member

## G. Admin Super & Bonus (Day 23-24)
- [ ] Super admin panel (pemilik only): view all tenants, suspend/activate
- [ ] Bonus scheme simulator: input komisi, calculate payout
- [ ] Security: audit log tercatat, rate limit aktif

## H. Billing & Subscription (Day 25) ⭐ NEW
- [ ] Navigasi sidebar → "Langganan & Billing" muncul (icon Coins)
- [ ] Billing panel load → 3 paket grid (Free/Pro/Enterprise)
- [ ] Display current plan + status + next billing date
- [ ] Klik upgrade → Midtrans Snap modal buka (sandbox token)
- [ ] Mock payment → subscription update (status → active)
- [ ] Payment webhook received → order status update

## I. Backup & Security (Day 26-27)
- [ ] Manual backup trigger → file download
- [ ] Scheduled backup run daily (log check)
- [ ] Low stock alert trigger + expired stock alert
- [ ] Audit log CREATE/UPDATE/DELETE tercatat, CORS header correct
- [ ] SQL injection test → rejected, XSS test → sanitized

## J. Offline Mode & PWA (Day 28) ⭐ NEW
- [ ] POS terminal online badge (green Wifi) vs offline (amber WifiOff)
- [ ] Offline: search produk dari cache (tanpa network error)
- [ ] Offline: checkout → transaksi queue ke IndexedDB, message: "✓ Transaksi N item tertunda"
- [ ] Online kembali → auto-sync queue → transaksi masuk DB
- [ ] Install PWA, halaman offline; snapshot produk cached

## K. E2E Testing & Load (Day 29-30) ⭐ NEW
- [ ] Frontend Playwright E2E run: 6+ pass (auth env needed)
- [ ] Backend unit tests: 265 pass, all suites green
- [ ] k6 load test: 50 VU concurrent, p95 < 500ms response time
- [ ] Memory leak check (reload 10x, heap stable)
- [ ] Browser: Chrome/Chromium, responsive on mobile/tablet
- [ ] Accessibility: color contrast > 4.5:1, keyboard nav work

---

## Known Blockers

- **Midtrans live keys:** Sandbox tested; production keys pending pemilik
- **WhatsApp token:** Mock tested; live token pending integration
- **SMTP email:** Mock tested; live credentials pending
- **k6 load test:** Mock data only; realistic load test pending production data set
- **E2E auth:** .env.e2e credentials needed for full login test suite

---

## Tanda Tangan

| Role | Name | Date | Sign-Off |
|------|------|------|----------|
| Developer | (Kiro) | 2026-10-24 | ✓ Code ready |
| QA / Tester | (Pemilik / Tim) | \_\_\_\_\_\_ | \_\_\_\_\_\_ |
| Product Owner | (Pemilik) | \_\_\_\_\_\_ | \_\_\_\_\_\_ |

**Result:** 🟡 Ready for UAT (blockers documented)
