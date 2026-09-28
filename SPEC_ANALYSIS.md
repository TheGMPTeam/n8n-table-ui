# n8n-table-ui — Specification Analysis

**Date:** 2026-09-28  
**Scope:** n8n-table-ui repo (proxy-server.cjs, index.html, Dockerfile, docker-compose.n8n-table-ui.yml, README.md)  
**Target deployment:** Docker-only, server stack at `dad@10.0.0.157` (n8n on `automation` network, port 5678)

---

## 1. What This Project Actually Is

A single-file web UI (index.html + inline JS) served by a tiny Node.js HTTP proxy (proxy-server.cjs, ~158 lines). The proxy:

1. Serves the static UI on `GET /` and `GET /index.html`.
2. Exposes `GET /config` so the UI can read the proxy's own env (n8n host/port, API key presence, bind port).
3. Forwards `POST /webhook/yt-*` requests to n8n on the `automation` network (`n8n:5678`).
4. Everything else falls through to n8n as well (catch-all fallback).

The UI talks to n8n exclusively through **webhook endpoints** (`/yt-get`, `/yt-create`, `/yt-wright`, `/yt-update`, `/yt-remove`). It does **not** use the n8n REST API directly. The n8n side must have a workflow with matching webhook triggers that implement the data-table CRUD.

---

## 2. Architecture Diagram

```
Browser
  │
  ▼  HTTPS/HTTP  (port 3458)
n8n-table-ui proxy (Node.js, Docker)
  │
  ├── GET  /                    → serves index.html (static, no-store)
  ├── GET  /config              → proxy env snapshot (n8n host/port, api key bool)
  ├── POST /webhook/yt-get      → n8n:5678/webhook/yt-get
  ├── POST /webhook/yt-create   → n8n:5678/webhook/yt-create
  ├── POST /webhook/yt-wright   → n8n:5678/webhook/yt-wright
  ├── POST /webhook/yt-update   → n8n:5678/webhook/yt-update
  ├── POST /webhook/yt-remove   → n8n:5678/webhook/yt-remove
  └── (fallback)                → n8n:5678/<anything-else>
                                      │
                                      ▼
                                 n8n (automation network)
                                 ├── Data Table CRUD workflow (webhook triggers)
                                 │   └── n8n Data Table nodes → postgres/mysql/sqlite/ODBC
                                 └── Data tables:
                                     ├── ComfyUI Jobs          (xKckTZI3ZU5HqIpZ)
                                     ├── Shorts_Production     (vN5vMR56WpEsdLMn)
                                     ├── ComfyUI_Templates     (haulC2FnGWqHb0no)
                                     └── running_job           (vxItbJ4B8uYBtqJ3)
```

**Key constraint:** The UI never touches n8n's REST API. It only knows about the 5 webhook paths. If the n8n webhook CRUD workflow is missing or misconfigured, the UI is non-functional — there is no fallback and no error message that tells the user what's wrong beyond "n8n did not respond."

---

## 3. Current UI Capabilities (index.html)

### Tabs
| Tab | Purpose | State |
|-----|---------|-------|
| Home | ComfyUI Jobs table — browse rows, edit, push to working | Working |
| Jobs | Shorts_Production table — browse rows, edit | Working |
| Setup | Step-by-step wizard for first-time setup | Partially wired (see §4) |
| New | Create a new n8n data table via `yt-create` webhook | Working (but see §4.2) |
| Config | View/edit localStorage config + server env read-only fields | Working |

### Data flow
1. `loadConfig()` reads `localStorage` → merges with `CONFIG_DEFAULTS`.
2. `fetchServerConfig()` hits `GET /config` → fills read-only n8n host/port fields.
3. `applyLiveConfig()` pushes table IDs into `TABLES.comfy` / `TABLES.shorts` and re-points tab buttons.
4. `checkSetupHealthy()` tries `yt-get` on the home table → if it fails, switches UI to Setup tab.
5. `loadTable(tableId)` → `callWebhook('/yt-get', {operation:'get', id})` → renders 3 sub-panels (Completed / Next Up / Working).
6. `loadLinkedTable(tableId)` → background-fetches the sister table for Job ID linking.
7. `loadTemplates()` → `yt-get` on templates table → used for type→API mapping in edit modal.

### Edit modal
- Opens on row click (Edit button or Job ID link).
- Type pulldown populated from templates table; selecting a type fills the API preview textarea.
- Completed/Working checkboxes update the row object in-memory, then `sendPatch()` → `yt-update` webhook.
- Job ID links open a multi-row "jobs" modal showing all ComfyUI rows linked to a Shorts_Production row.

---

## 4. Setup Wizard — Current State and Problems

The Setup tab (`panel-setup`) has a 4-step wizard (`SETUP_STEPS` array + `renderSetupPanel()`). Steps:

### Step 1: Connect to n8n
- Shows current n8n host/port/webhook base from config.
- Action: `callWebhook('/yt-get', {operation:'get', id:'__ping__'})`.
- **Problem:** `__ping__` is not a real n8n operation. The n8n webhook CRUD workflow's Switch node routes on `operation` — `__ping__` won't match any case. This call will either return an error from n8n or time out. The wizard treats any throw as "n8n did not respond," which is misleading. A real connectivity test should use a webhook path that n8n actually handles, or probe the n8n base URL directly.

### Step 2: Create data tables
- Shows 4 fields: ComfyUI Jobs ID, Shorts_Production ID, ComfyUI_Templates ID, link rule.
- Action: calls `yt-create` with `operation: 'create'` and a `columns` array for each table name.
- **Critical problem:** n8n data tables are **not** created via the webhook CRUD workflow. The `yt-create` webhook operation in the existing n8n workflow creates **rows** in an existing table, not the table itself. n8n data tables are created in the n8n UI (Data Tables → Create). Passing `{operation:'create', row:{name, columns}}` to the webhook will either be rejected by the Switch node (no matching case for table creation) or create a row in some default table — it will not create a new data table.
- The wizard displays the table IDs as if they're being created, but they must already exist. The fields should be "enter your existing table IDs" not "create tables."
- The columns array passed is hardcoded in the wizard and may not match what the n8n workflow expects.

### Step 3: Add the webhook workflow to n8n
- Action: downloads `webhook-workflow-template.json` from `/webhook-workflow-template.json` on the proxy.
- **Problem:** The proxy does not currently serve this file. There's no route for it. The file doesn't exist in the repo either (it was never committed). The wizard will fail with "Download failed."
- Even if served, the user must manually import it into n8n and configure the webhook paths — the wizard can't do this automatically without n8n API access (which requires an API key the proxy may not have).

### Step 4: Verify everything works
- Smoke test: creates a temporary table, writes a row, reads it back, updates it, removes the table.
- **Problem:** Same as step 2 — `yt-create` creates rows, not tables. The smoke test will fail at the first step if the table doesn't already exist. The "remove table" operation (`yt-remove`) — if it maps to n8n's data table delete API — would actually delete a real table, which is destructive.

---

## 5. Proxy Analysis

### What works
- Static file serving with `.data/index.html` override path (live-edit without rebuild).
- `/config` endpoint for env snapshot.
- Webhook forwarding with optional `X-N8N-API-KEY` header (only sent when env is set).
- CORS headers on all responses.
- Logging to `.data/logs/proxy.log` + stdout.
- `.data/env` drop-in for gap-filling env vars.

### What's missing / questionable
1. **No `/webhook-workflow-template.json` route.** The Setup wizard depends on this file being served. Either add the route or remove the download step from the wizard.
2. **`API_BASE` / `API_PORT` env vars are unused.** The proxy never calls n8n's REST API. All n8n interaction goes through webhooks. These env vars are dead configuration — they exist in the Dockerfile, compose file, and `/config` endpoint, but the proxy code never reads them for any request. Remove or repurpose.
3. **Fallback catch-all proxies everything to n8n.** This means `GET /favicon.ico`, `GET /static/*`, etc. all go to n8n. That's fine if n8n handles them, but it also means any typos in the UI's fetch paths hit n8n and may return confusing errors.
4. **No health endpoint.** There's no `/health` or liveness probe. Kubernetes/compose healthchecks can't verify the proxy is actually able to reach n8n.
5. **`hasApiKey` in `/config` is a boolean.** The UI can't distinguish between "no API key configured" and "API key configured but wrong." If n8n requires an API key and the proxy doesn't have one, every webhook call fails with 401 and the UI sees "n8n did not respond" — not "authentication failed."
6. **Single logging path.** All log lines go to one file. No log level, no rotation beyond the `writeLog` try/catch. Fine for a small proxy, but worth noting.

---

## 6. n8n-Side Requirements (what must exist for the UI to work)

For the UI to function, the n8n instance must have:

### A. Data tables (created in n8n UI, not via webhook)
| Table ID | Purpose | Required columns |
|----------|---------|-----------------|
| ComfyUI Jobs (xKckTZI3ZU5HqIpZ) | Generation queue | type, prompt, Working, Completed, URL, jobid, Status |
| Shorts_Production (vN5vMR56WpEsdLMn) | Script + scene data | Type, Reffrence, Completed, Script, Scenes, Status, Working, File |
| ComfyUI_Templates (haulC2FnGWqHb0no) | Template storage | type, API |
| running_job (vxItbJ4B8uYBtqJ3) | Job tracker | (varies) |

### B. Webhook CRUD workflow
A single n8n workflow with 5 webhook triggers:
- `yt-get` — GET rows from a data table by ID
- `yt-create` — CREATE ROWS in a data table (NOT create the table itself)
- `yt-wright` — WRITE/UPDATE rows (alias for update?)
- `yt-update` — UPDATE rows by match criteria
- `yt-remove` — DELETE rows or drop a table

The workflow must route on the `operation` field in the webhook body. The UI sends `{operation: 'get', id: '<tableId>'}` etc.

### C. Webhook URL
n8n must be configured with `N8N_WEBHOOK_URL=http://10.0.0.157:5678/` so webhook callbacks work. This is set in the server compose.

---

## 7. Configuration Reference

### Proxy env vars
| Var | Default | Used for |
|-----|---------|----------|
| `PORT` | 3458 | Proxy listen port |
| `N8N_HOST` | n8n | n8n hostname on Docker network |
| `N8N_PORT` | 5678 | n8n port |
| `N8N_API_KEY` | (none) | Sent as `X-N8N-API-KEY` header to n8n webhooks. If n8n requires API auth, this must be set. |
| `DATA_DIR` | /app/.data | Writable dir for logs, env override, HTML override |
| `API_BASE` / `API_PORT` | 127.0.0.1 / 3456 | **Unused.** Dead config. |

### UI config (localStorage key `n8n-table-ui-config`)
| Key | Default | Meaning |
|-----|---------|---------|
| `tableHome` | xKckTZI3ZU5HqIpZ | ComfyUI Jobs table ID |
| `tableJobs` | vN5vMR56WpEsdLMn | Shorts_Production table ID |
| `tableTemplates` | haulC2FnGWqHb0no | ComfyUI_Templates table ID |
| `tableLink` | ComfyUI.JobID == Shorts_Production.id | Reference only — describes join logic |
| `webhookBase` | http://10.0.0.157:5678/webhook | Override for webhook base URL (rarely needed; proxy handles routing) |
| `refreshInterval` | 15000 | Auto-refresh interval in ms |
| `maxDebugLines` | 100 | Debug panel scrollback |
| `debugDefault` | false | Open debug panel on load |
| `autoRefreshDefault` | true | Auto-refresh on by default |

---

## 8. Open Issues for UI Work

These should be resolved before extending the UI:

1. **Setup wizard step 1 uses a fake `__ping__` operation.** Replace with a real connectivity check (e.g., `GET /config` on the proxy itself, or a known-working webhook call).

2. **Setup wizard step 2 pretends to create tables via webhook.** It cannot. Either: (a) change the step to "enter your existing table IDs" with a link to n8n UI instructions for creating tables, or (b) add a real n8n REST API call to create tables (requires `N8N_API_KEY`).

3. **Setup wizard step 3 downloads a file that doesn't exist.** Either commit `webhook-workflow-template.json` and add a proxy route for it, or remove the download step and provide the workflow JSON in the README as copy-paste instructions.

4. **`API_BASE` / `API_PORT` are dead config.** Decide: remove them, or implement direct n8n API access in the proxy (e.g., for table creation/deletion, workflow import) and use them.

5. **No n8n API key handling in the UI.** If n8n requires an API key, the user must set `N8N_API_KEY` in the proxy compose env. The UI has no UI for this. Consider: proxy `/config` could report whether the key is set, and the Setup wizard could warn if it's missing but n8n requires it.

6. **The "New" tab creates rows, not tables.** The label "New Table" is misleading. It should be "New Row" or the function should be clarified.

7. **`yt-wright` vs `yt-update` Semantics.** The UI uses both: `yt-wright` for push (set Working=true) and `yt-update` for row edits. Are these distinct n8n operations or aliases? The naming is inconsistent and the n8n workflow may treat them differently.

8. **No error categorization.** All n8n errors surface as "n8n did not respond: <HTTP status> <body>". The UI can't distinguish between "table not found," "authentication failed," "n8n offline," and "webhook workflow missing." Better error parsing would help users self-diagnose.

---

## 9. Recommended Order of Operations

Before extending the UI, fix the foundation:

1. **Commit `webhook-workflow-template.json`** to the repo (the actual n8n workflow JSON for the 5 webhook triggers) and add a proxy route to serve it.
2. **Fix Setup wizard step 1** — use a real connectivity check.
3. **Fix Setup wizard step 2** — change from "create tables" to "enter existing table IDs" with n8n UI instructions, OR implement real table creation via n8n API.
4. **Remove or repurpose `API_BASE`/`API_PORT`.**
5. **Decide on n8n API key strategy** — if n8n requires it, document it clearly and add a check in the Setup wizard.
6. **Rename "New Table" tab** to "New Row" or clarify its behavior.
7. **Add error categorization** so users can tell what's wrong when something fails.

After that, the UI is stable enough to extend with new features.

---

*End of analysis.*
