FROM node:20-alpine

RUN apk add --no-cache openssl postgresql-client && corepack enable
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY . .

EXPOSE 3000 4000
CMD ["pnpm", "dev"]
