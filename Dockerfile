# n8n-table-ui — Docker image for the n8n data-table web UI (speck)
FROM node:20-slim

WORKDIR /app

# Only the active components: proxy + UI. server.js / better-sqlite3 are the
# legacy direct-SQLite path and are NOT included in this image.
COPY proxy-server.cjs ./
COPY index.html ./

ENV NODE_ENV=production
ENV PORT=3458
# Service name on the shared automation network. Falls back to 10.0.0.157 for
# local dev where the proxy is not on the same network as n8n.
ENV N8N_HOST=n8n
ENV N8N_PORT=5678
# N8N_API_KEY is deliberately NOT baked in here — inject it at runtime via
# compose (N8N_API_KEY=${N8N_API_KEY}) or the .data/env drop-in. The proxy
# simply omits the X-N8N-API-KEY header when it is unset.
# Legacy server.js routing target (/api/*). server.js is not in this image, so
# /api/* will 502 unless you mount it alongside.
ENV API_BASE=127.0.0.1
ENV API_PORT=3456
# Writable runtime state: env drop-in, logs/, optional index.html override.
ENV DATA_DIR=/app/.data

EXPOSE 3458

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3458)+'/config',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "proxy-server.cjs"]
