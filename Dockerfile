FROM node:20-alpine

RUN apk add --no-cache openssl postgresql-client && corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 4000
CMD ["pnpm", "start:prod"]
