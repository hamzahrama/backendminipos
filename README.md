# Web Mini POS & Inventaris HNI

Monorepo: `frontend/web` (Next.js), `backend/api` (NestJS), `packages/shared`. PostgreSQL + Redis + Prisma. Docker Compose untuk dev.

## Quick Start

```bash
docker compose up -d postgres redis adminer
pnpm install
pnpm dev
```

- Web: `localhost:3000`
- API: `localhost:4000`
- Adminer: `localhost:8080`

## Struktur

```
frontend/web/   → Next.js (dashboard, POS, katalog, receipt)
backend/api/    → NestJS + Prisma (auth, produk, transaksi, laporan)
packages/shared/ → skema & konstanta bersama
```

## Progress

Lihat [PROGRESS.md](PROGRESS.md) — rinci per hari, apa yang selesai & yang masih terbuka.

## Backlog 30 Hari

Lihat [backlog.md](backlog.md) — rencana eksekusi Minggu 1-4 (Day 1-30).

## Siap deploy (belum production)

Template deployment produksi ada di `Dockerfile.production`, `compose.production.yaml`, dan `Caddyfile`. Domain, VPS, secret, serta kredensial storage/email harus diisi pemilik sebelum layanan ini dijalankan. Instruksi ada di [SETUP.md](SETUP.md).

## Tech

Next.js 14, TypeScript, Tailwind, shadcn/ui, NestJS, Prisma, PostgreSQL, Redis, Docker, Turborepo.
