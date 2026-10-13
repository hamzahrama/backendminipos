# UAT Checklist — Web Mini POS & Inventaris HNI (Day 29)

Target: semua baris PASS sebelum Day 30 launch. Tester: pemilik toko (Ibu) + kasir.

## A. Auth & Tenant
- [ ] Register tenant baru, login, refresh token, logout
- [ ] User toko A tidak bisa melihat data toko B

## B. Produk & Stok
- [ ] CRUD produk + upload gambar, import CSV 100 produk < 10 detik
- [ ] Stok masuk multi-batch, FEFO mengambil batch kedaluwarsa terdekat
- [ ] Alert stok menipis & kedaluwarsa < 30 hari muncul di dashboard

## C. POS & Checkout
- [ ] Toggle member/non-member mengubah harga + PV otomatis
- [ ] Checkout memotong stok, nomor invoice unik, idempotency (double-klik = 1 transaksi)
- [ ] Struk publik `/receipt/{token}` + QR + cetak 58/80mm di printer thermal asli
- [ ] Hold/resume draft, diskon, voucher, shortcut F2/F4/Ctrl+Enter

## D. WhatsApp (butuh token real, atau `mock` untuk latihan)
- [ ] `POST /transactions/:id/whatsapp` terkirim < 5 detik ke nomor asli
- [ ] Rate limit 3x/10 mnt, log tampil di panel owner

## E. Laporan & PV
- [ ] Dashboard omzet/transaksi/basket + grafik per jam WIB + filter tanggal
- [ ] P&L (omzet − HPP − opex) + export XLSX/PDF cocok dengan data
- [ ] Rekap PV per member/SKU + `GET /reports/pv.csv` ter-upload ke HPAI

## F. Katalog Publik & Jaringan
- [ ] `/katalog/{slug}` tanpa login, sitemap, order via link WA
- [ ] Pohon downline 5 level, PV jaringan, tambah downline, bonus simulator + leaderboard

## G. Billing, PWA, Keamanan, Backup
- [ ] Bayar paket via Midtrans sandbox sampai callback sukses
- [ ] Install PWA, halaman offline; snapshot produk cached (IndexedDB)
- [ ] Audit log tercatat, rate limit aktif, backup S3 + restore ke DB kosong sukses
- [ ] Email laporan harian masuk inbox owner

## Tanda tangan
- Tester: __________ Tanggal: ______ Hasil: LULUS / ULANG
- Catatan bug: ___________________________________________
