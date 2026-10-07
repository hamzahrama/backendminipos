FROM node:20-alpine

RUN apk add --no-cache openssl postgresql-client && corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

EXPOSE 4000
CMD ["pnpm", "dev"]
