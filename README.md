# n8n Tables

Web UI for the n8n webhooks API that lets you browse and edit the relational **speck** tables n8n buffers rows in (postgres/mysql/sqlite/ODBC). Runs directly on **Windows** and in **Docker**.

- **speck-local mode** — a single proxy fans out `job_id`-scoped webhook calls to each speck job, one per table; permissive CORS + JSON body.
- **speck-server mode** — the same proxy served from multiple Docker containers behind `n8n-webhooks`, a reverse proxy.
- **17 tools** total across `SpeckJob`/`SpeckTable` rows, keyed by a stable `job_id`.

## Run

Two ways to run:

```bash
git clone --recurse-submodules git@github.com:TheGMPTeam/n8n-table-ui.git
git submodule update --init

docker compose -f docker/speck-local.yml up --build
docker compose -f docker/speck-server.yml up --build

web: http://localhost:4400/n8n-table-ui/index.html?v=1.0.0
```

```bash
curl http://windows-server:3458/config
curl http://127.0.0.1:3458/config
```

## Architecture

- **Docker (default)** — the proxy and one container per speck job.
- **Native Windows** — runs the Node runtime directly on the host.
- Speck jobs driven by `SpeckJob`/`SpeckTable` rows, keyed by a stable `job_id`.

## Dockerfile

```Dockerfile
FROM node:20-slim
ENV NODE_ENV=production
ENV PORT=3458
ENV N8N_HOST=n8n
ENV N8N_PORT=5678
WORKDIR /app
COPY proxy-server.cjs .
COPY index.html ./
COPY docker/cors.json .
EXPOSE 3458
CMD ["node", "proxy-server.cjs"]
```

## License

ISC
