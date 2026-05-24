FROM node:22-bookworm-slim AS base

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates dumb-init tini \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

USER node
ENTRYPOINT ["dumb-init", "--"]
