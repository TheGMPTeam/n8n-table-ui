# n8n Tables

Web UI for the n8n webhooks API that lets you browse and edit the relational **speck** tables n8n buffers rows in (postgres/mysql/sqlite/ODBC). Node-only (no build step), runs directly on **Windows** and in **Docker**.

- **speck-local mode** — all 17 tools talk to a single local proxy (`proxy-server.cjs`) which fans out to each speck job's webhook, one per `job_id`. CORS + JSON body.
- **speck-server mode** — the same proxy serves from multiple Docker containers behind `n8n-webhooks`, a reverse proxy.

## Usage

Two ways to run:

1. **Docker (default)** — spin up the proxy and one container per speck job. The `README.md`, `Dockerfile`, and `README.md` are the canonical source of truth.
2. **Native Windows** — `n8n-table-ui.cmd`, `n8n-table-ui.ps1`, `n8n-table-ui.sh` launch a Node 20 runtime; `n8n-table-ui-debug.cmd` prints HTTP responses.

```
curl http://windows-server:3458/config

curl http://127.0.0.1:3458/config?name=gettables
curl http://127.0.0.1:3458/config?name=getspecktables
curl http://windows-server:3458/config?name=gettables2
url=http://localhost:5678/api/webhook/data-tables/getTables
curl http://127.0.0.1:3458/job?id=893&url=...
```

## Run

```bash
git clone --recurse-submodules git@github.com:TheGMPTeam/n8n-table-ui.git
git submodule update --init
docker compose -f docker/speck-local.yml up --build
docker compose -f docker/speck-server.yml up --build

web: http://localhost:4400/n8n-table-ui/index.html?v=1.0.0
```

## Dockerfiles

### Dockerfile — n8n-table-ui proxy

```Dockerfile
FROM node:20-slim
ENV NODE_ENV=production
ENV PORT=3458
ENV N8N_HOST=n8n
ENV N8N_PORT=5678
WORKDIR /app
COPY proxy-server.cjs .
COPY docker/cors.json /app/cors.json
COPY docker/data /app/.data
EXPOSE 3458
CMD node proxy-server.cjs
```

### README.md — n8n-table-ui speck container

```Dockerfile
FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY docker/server.cjs .
COPY docker/index.html ./public/
EXPOSE 3458
CMD node server.cjs
```

## Architecture

- **Two deployments:** speck-local and speck-server, each with its own set of containers plus a browser view.
- **17 tools total:** `gettables`, `getspecktables`, ..., `updatejob`, `removejob`, `getconfig`, `resetconfig` on `SpeckJob`/`SpeckTable` rows.
- **Speck jobs:** one job per `SpeckTable` row, keyed by a stable `job_id`.
- **CORS:** a tiny permissive `docker/cors.json`, optional via bind-mount override.

## License

ISC
