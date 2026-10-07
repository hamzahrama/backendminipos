# API — Web Mini POS & Inventaris HNI

Backend service: NestJS + Prisma + PostgreSQL + Redis. Multi-tenant, FEFO inventory, POS & checkout, katalog publik, laporan, jaringan & bonus HNI.

Frontend (Next.js) berada di repo terpisah: **`night-atrociraptor-web`**.

## Quick Start

```bash
docker compose up -d postgres redis adminer
pnpm install
pnpm db:migrate
pnpm dev
```

- API: `localhost:4000` (`/health`)
- Adminer: `localhost:8080`
- Web: `localhost:3000` (jalankan dari repo frontend)

## Struktur

```
src/            → modul NestJS (auth, produk, transaksi, laporan, bonus, whatsapp, ...)
prisma/         → schema.prisma + migrasi
compose.yaml    → api + postgres + redis + adminer (dev)
Dockerfile      → build dev | Dockerfile.production → multi-stage production
```

## Perintah

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm test` · `pnpm test:coverage` · `pnpm db:generate|migrate|deploy|studio`

## Progress & backlog

- [PROGRESS.md](PROGRESS.md) — rinci per hari, apa yang selesai & yang masih terbuka.
- [backlog.md](backlog.md) — rencana eksekusi 30 hari (Day 1-30).
- [PRD.md](PRD.md) — kebutuhan produk.
- [SETUP.md](SETUP.md) — panduan setup lokal & deployment.

## Deploy (belum production)

Template deployment ada di `Dockerfile.production`, `compose.production.yaml`, dan `Caddyfile`. Layanan `web` di `compose.production.yaml` memakai gambar dari repo frontend (`WEB_IMAGE`, default `ghcr.io/hamzahrama/night-atrociraptor-web:latest`). Domain, VPS, secret, serta kredensial storage/email harus diisi pemilik sebelum layanan ini dijalankan.
