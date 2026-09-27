# n8n Tables

Web UI for the n8n webhooks API that lets you browse and edit the relational **speck** tables n8n buffers rows in (postgres/mysql/sqlite/ODBC). Docker-only deployment on the server stack.

- **server-stack mode** — the proxy runs as a Docker service on the same `automation` network as n8n, talking to it by service name (`n8n:5678`).
- Single compose drop-in at `docker-compose.n8n-table-ui.yml`.
- 17 tools total across `SpeckJob`/`SpeckTable` rows, keyed by a stable `job_id`.

## Run

### Server stack (10.0.0.157)

The server compose lives at `/home/dad/Config/docker-compose.yml` on `10.0.0.157`. Add the n8n-table-ui service from this repo:

```bash
# From the server's Config dir, after copying docker-compose.n8n-table-ui.yml next to docker-compose.yml:
docker compose up -d n8n-table-ui

# Or build from this repo and point at the server compose:
docker compose -f docker-compose.n8n-table-ui.yml up --build
```

Web UI:

```bash
curl http://10.0.0.157:3458/config
curl http://127.0.0.1:3458/config
```

### Local smoke test (standalone)

```bash
docker compose -f docker/speck-local.yml up --build
```

## Architecture

- **Docker-only** — the proxy and n8n share the `automation` network; the proxy reaches n8n by service name.
- Legacy native-Windows `server.js` direct-SQLite path is not part of the Docker image.
- Speck jobs driven by `SpeckJob`/`SpeckTable` rows, keyed by a stable `job_id`.

## Dockerfile

```Dockerfile
FROM node:20-slim
ENV NODE_ENV=production
ENV PORT=3458
ENV N8N_HOST=n8n
ENV N8N_PORT=5678
ENV API_BASE=n8n
ENV API_PORT=5678
ENV DATA_DIR=/app/.data
WORKDIR /app
COPY proxy-server.cjs ./
COPY index.html ./
EXPOSE 3458
CMD ["node", "proxy-server.cjs"]
```

## License

ISC
