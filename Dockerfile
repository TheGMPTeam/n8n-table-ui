# n8n-table-ui — Docker image for the n8n data-table web UI (speck)
FROM node:20-slim

WORKDIR /app

# Only the active components: proxy + UI. server.js / better-sqlite3 are the
# legacy direct-SQLite path and are NOT included in this image.
COPY proxy-server.cjs ./
COPY index.html ./
COPY webhook-workflow-template.json ./

ENV NODE_ENV=production
ENV PORT=3458
# Baked at build time via --build-arg GIT_COMMIT=... / GIT_BRANCH=... /
# VERSION=... . The proxy also seeds .data/version.json from these on first
# startup, and the /version endpoint reads .data/version.json first so the
# version string can be updated without a rebuild (drop a new version.json into
# the data dir and restart).
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
ARG VERSION=0.0.0
# Persist build args into the image as files so the proxy can read them at
# runtime even when the container env does not carry them (the common case with
# compose). GIT_COMMIT is the short hash from the build context's git checkout.
RUN printf '%s' "${GIT_COMMIT}" > /app/git-commit.txt \
 && printf '%s' "${GIT_BRANCH}" > /app/git-branch.txt \
 && printf '%s' "${VERSION}" > /app/version.txt
ENV GIT_COMMIT=${GIT_COMMIT}
ENV GIT_BRANCH=${GIT_BRANCH}
ENV VERSION=${VERSION}
ENV DATA_DIR=/app/.data
# Service name on the shared automation network. Falls back to 10.0.0.157 for
# local dev where the proxy is not on the same network as n8n.
ENV N8N_HOST=n8n
ENV N8N_PORT=5678
# N8N_API_KEY is deliberately NOT baked in here — inject it at runtime via
# compose (N8N_API_KEY=${N8N_API_KEY}) or the .data/env drop-in. The proxy
# simply omits the X-N8N-API-KEY header when it is unset.
# /api/* and /webhook/* are both proxied to n8n in the Docker-only stack.
ENV API_BASE=n8n
ENV API_PORT=5678
# Writable runtime state: env drop-in, logs/, optional index.html override.
ENV DATA_DIR=/app/.data

EXPOSE 3458

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3458)+'/config',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "proxy-server.cjs"]
