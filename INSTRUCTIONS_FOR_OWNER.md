# INSTRUCTIONS_FOR_OWNER — Kredensial Real yang Harus Diisi Pemilik Toko

> AI sudah menyiapkan semua kode + mock/sandbox. Tanpa kredensial di bawah ini,
> fitur eksternal berjalan dalam **mock mode** (tidak kirim/bayar sungguhan).
> Isi di server produksi (file `.env.production`), JANGAN commit ke git.

## 1. WhatsApp Gateway (Day 13) — WAJIB untuk struk WA
- [ ] Pilih provider: `fonnte` atau `wablas`
- [ ] Daftar di fonnte.com / wablas.com, verifikasi nomor pengirim
- [ ] Daftarkan template `receipt_v1` dan tunggu approve
- [ ] Isi: `WHATSAPP_PROVIDER=fonnte`, `WHATSAPP_TOKEN=<token>`, `WABLAS_BASE_URL=<khusus wablas>`
- [ ] Uji: `POST /transactions/:id/whatsapp` ke nomor HP asli, cek < 5 detik
- Sandbox tanpa token: `WHATSAPP_PROVIDER=mock` (log terkirim, tidak ada pulsa terpakai)

## 2. CSV HPAI (Day 17)
- [ ] Minta template CSV kosong resmi ke admin HPAI / upline
- [ ] Cocokkan dengan `docs/pv-upload-template.csv` (header: `hni_id,nama,sku,produk,qty,total_pv`)
- [ ] Unduh final: `GET /reports/pv.csv?month=YYYY-MM&mode=per-member-sku`
- [ ] Upload ke sistem HPAI dan konfirmasi terbaca

## 3. Email Laporan (Day 20) — SMTP
- [ ] `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE=false`, `SMTP_USER`, `SMTP_PASSWORD` (app password), `SMTP_FROM`
- [ ] Aktifkan dari panel toko + atur jam WIB, lalu cek inbox owner besok pagi

## 4. Backup S3 (Day 27)
- [ ] Buat bucket + IAM key: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BACKUP_BUCKET`
- [ ] Tunggu job 03.00 WIB, pastikan objek muncul, lalu **uji restore ke DB kosong**

## 5. Billing Midtrans (Day 25)
- [ ] Daftar Midtrans, ambil sandbox keys dulu: `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION=false`
- [ ] Uji bayar paket Pro Rp99.000 di sandbox sampai callback sukses
- [ ] Ganti ke production keys + `MIDTRANS_IS_PRODUCTION=true` saat launch
- [ ] Kunci keputusan: harga paket Free/Pro/Enterprise di `src/billing/plans.ts`

## 6. Monitoring & Alert (Day 27)
- [ ] Buat project Sentry, isi `SENTRY_DSN`
- [ ] Buat bot Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) dan/atau Slack webhook (`SLACK_WEBHOOK_URL`)
- [ ] Picu error uji, pastikan alert masuk

## 7. Rumus Bonus Resmi (Day 23)
- [ ] Minta marketing plan resmi HPAI (peringkat, syarat PV, % bonus, nilai Rp per PV)
- [ ] Ganti skema contoh di `PUT /bonus/scheme` (`isExample: false`), validasi via `validateHpaiScheme`
- [ ] Cek leaderboard + simulator sebelum umumkan ke member

## 8. Launch (Day 30)
- [ ] Siapkan VPS + domain + Cloudflare DNS, ikut `SETUP.md` bagian produksi
- [ ] Tentukan akun super-admin pertama
- [ ] Jadwalkan UAT dengan Ibu memakai `UAT_CHECKLIST.md`
