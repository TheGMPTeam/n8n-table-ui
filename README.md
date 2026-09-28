# n8n-table-ui

Web UI for n8n data tables — browse, edit, and manage rows in the data tables n8n buffers rows in (Postgres/MySQL/SQLite/ODBC).

The UI talks to n8n exclusively through webhook endpoints. A small Node.js proxy serves the static UI and forwards `POST /webhook/yt-*` requests to n8n. Docker-only deployment on the server stack.

- **Server-stack mode** — proxy runs as a Docker service on the same `automation` network as n8n, talking to it by service name (`n8n:5678`).
- **Single compose drop-in** at `docker-compose.n8n-table-ui.yml`.
- **Setup tab** — first-time setup wizard: (1) test proxy + n8n webhook connectivity, (2) configure table IDs by reading them back from n8n to verify they're live, (3) download the Data Table CRUD workflow template and import it into n8n, (4) run a smoke test. The wizard auto-switches to the Setup tab on load if n8n is not reachable or tables are missing.

## Architecture

```
Browser (port 3458)
  │
  ▼
n8n-table-ui proxy (Node.js, Docker)
  ├── GET  /                    → serves index.html (static, no-store)
  ├── GET  /config              → proxy env snapshot
  ├── POST /webhook/yt-get      → n8n:5678/webhook/yt-get
  ├── POST /webhook/yt-create   → n8n:5678/webhook/yt-create
  ├── POST /webhook/yt-wright   → n8n:5678/webhook/yt-wright
  ├── POST /webhook/yt-update   → n8n:5678/webhook/yt-update
  ├── POST /webhook/yt-remove   → n8n:5678/webhook/yt-remove
  └── (fallback)                → n8n:5678/<anything-else>
                                    │
                                    ▼
                                 n8n (automation network)
                                 ├── Webhook CRUD workflow (5 webhook triggers)
                                 └── Data tables (created in n8n UI)
```

**Key constraint:** The UI never uses n8n's REST API. It only knows about the 5 webhook paths. If the n8n webhook CRUD workflow is missing, the UI is non-functional.

### Prerequisites

#### n8n side (must exist before the UI works)

1. **Webhook CRUD workflow** — one active n8n workflow named **Data Table CRUD** with these 5 webhook triggers:
   - `POST /webhook/yt-get` — read rows from a table
   - `POST /webhook/yt-create` — create a new table
   - `POST /webhook/yt-wright` — write rows into a table
   - `POST /webhook/yt-update` — update rows by match
   - `POST /webhook/yt-remove` — delete a table

   Each HTTP node in the workflow calls `http://n8n:5678/api/v1/data-tables` (or your n8n host) using an **n8n API credential**. Download the bundled template from the proxy at `GET /webhook-workflow-template.json` (or copy `webhook-workflow-template.json` from this repo) and import it via **n8n → Workflows → Import from File**, then activate it. After importing, open each HTTP node and confirm the credential field shows your n8n API credential — if it shows a red warning, re-select it from the dropdown.

2. **Data tables** — created in the n8n UI (**Data Tables → Create**), not via webhook. The UI needs these table IDs recorded in its config:
   - **ComfyUI Jobs** — generation queue (default ID: `xKckTZI3ZU5HqIpZ`)
   - **Shorts_Production** — script + scene data (default ID: `vN5vMR56WpEsdLMn`)
   - **ComfyUI_Templates** — ComfyUI workflow templates per type (default ID: `haulC2FnGWqHb0no`)
   - **running_job** — job tracker

   The setup wizard's **Configure your n8n data tables** step reads each table back via `yt-get` to verify the IDs are live — it does not create tables. Create the tables in n8n first, then paste their IDs into the wizard.

3. **API key (if n8n requires auth)** — set `N8N_API_KEY` in the proxy compose env so the proxy can authenticate to n8n webhooks. If the proxy has no API key, the setup wizard will tell you during the workflow download step that you need to re-select the credential in n8n after importing.

## Run

### Server stack (10.0.0.157)

The server compose lives at `/home/dad/Config/docker-compose.yml` on `10.0.0.157`. Add the n8n-table-ui service from this repo:

```bash
# From the server's Config dir, after copying docker-compose.n8n-table-ui.yml next to docker-compose.yml:
docker compose up -d n8n-table-ui

# Or build from this repo and point at the server compose:
docker compose -f docker-compose.n8n-table-ui.yml up --build
```

Web UI: `http://10.0.0.157:3458/`

### Local smoke test (standalone)

```bash
docker compose -f docker/speck-local.yml up --build
```

## Setup Wizard

The Setup tab walks through first-time configuration:

1. **Connect to n8n** — verify the proxy can reach n8n.
2. **Configure table IDs** — enter the IDs of your existing n8n data tables. (Tables are created in the n8n UI, not from the wizard.)
3. **Download webhook workflow** — get the workflow JSON to import into n8n.
4. **Smoke test** — verify read/write/update operations work end-to-end.

## UI Features

- **Home tab** — browse ComfyUI Jobs rows (Completed / Next Up / Working panels), edit rows, push to working.
- **Jobs tab** — browse Shorts_Production rows, edit in-place.
- **Job ID linking** — click a Job ID to see all linked ComfyUI rows for a Shorts_Production row.
- **Edit modal** — inline edit with type→API template mapping from the templates table.
- **Config tab** — view/edit localStorage config + read-only proxy env fields.
- **Debug panel** — toggleable request/response log.

## Configuration

### Proxy environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3458 | Proxy listen port |
| `N8N_HOST` | n8n | n8n hostname on Docker network |
| `N8N_PORT` | 5678 | n8n port |
| `N8N_API_KEY` | (none) | Sent as `X-N8N-API-KEY` header. Set if n8n requires API auth. |
| `DATA_DIR` | /app/.data | Writable dir for logs, env override, HTML override |

### UI config (localStorage key `n8n-table-ui-config`)

| Key | Default | Description |
|-----|---------|-------------|
| `tableHome` | xKckTZI3ZU5HqIpZ | ComfyUI Jobs table ID |
| `tableJobs` | vN5vMR56WpEsdLMn | Shorts_Production table ID |
| `tableTemplates` | haulC2FnGWqHb0no | ComfyUI_Templates table ID |
| `tableLink` | ComfyUI.JobID == Shorts_Production.id | Reference — describes how Home and Jobs rows are joined |
| `webhookBase` | http://10.0.0.157:5678/webhook | Override webhook base URL (rarely needed) |
| `refreshInterval` | 15000 | Auto-refresh interval (ms) |
| `maxDebugLines` | 100 | Debug panel scrollback |
| `debugDefault` | false | Open debug panel on load |
| `autoRefreshDefault` | true | Auto-refresh enabled by default |

### Files

| File | Purpose |
|------|---------|
| `proxy-server.cjs` | Node.js HTTP proxy — serves UI, forwards webhooks to n8n |
| `index.html` | Full UI (single file, inline JS) |
| `Dockerfile` | Docker image definition |
| `docker-compose.n8n-table-ui.yml` | Drop-in compose for server stack |
|| `docker/speck-local.yml` | Standalone local compose for smoke testing |
|| `webhook-workflow-template.json` | Bundled n8n **Data Table CRUD** workflow (5 webhooks + HTTP nodes) — served by the proxy at `GET /webhook-workflow-template.json` for the setup wizard download |
|| `SPEC_ANALYSIS.md` | Full specification analysis and optimization notes |

## License

ISC
