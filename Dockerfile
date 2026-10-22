FROM node:24.18.0-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
# Optional corporate/cloud CA is mounted for this build step only, never copied
# into the image. Regular Docker Desktop builds need no additional certificate.
RUN --mount=type=secret,id=npm_ca \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund

COPY server.mjs ./
COPY lib ./lib
COPY db ./db
COPY public ./public
COPY scripts ./scripts
RUN mkdir -p /app/data && chmod 700 /app/data

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD ["node", "--input-type=module", "-e", "const r = await fetch('http://127.0.0.1:3001/api/health', {signal: AbortSignal.timeout(4000)}); const body = await r.json(); if (!r.ok || body.status !== 'ok' || body.database !== 'postgresql') process.exit(1);"]

CMD ["node", "server.mjs"]
