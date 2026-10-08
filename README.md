# n8n-table-ui

## Local repaired-pipeline integration

The local checkout is `/home/dad/Config/n8n-table-ui`. The UI-only deployment is
`/home/dad/Config/docker-compose.n8n-table-ui.local.yml`, separate from the main
n8n stack. It preserves the operator-configured **10.0.0.157:3458** LAN listener.
This is not app authentication: restrict access to a trusted LAN.

```bash
npm test
npm run build
docker compose -p table-ui -f /home/dad/Config/docker-compose.n8n-table-ui.local.yml up -d --build --no-deps n8n-table-ui
```

- Browser requests always use the same-origin `/webhook/yt-*` proxy. Only the
  five explicit POST routes are forwarded; arbitrary REST/fallback and review
  routes return 404. n8n administrator API keys are **not** forwarded to these
  currently unauthenticated CRUD webhooks. Cross-origin writes return 403.
- Row loaders follow `nextCursor` using a page limit of 250. Structured n8n
  validation errors are displayed as errors, even in a successful HTTP envelope.
- Push updates the matched existing row; it does not clone an incomplete queue
  job. Type aliases map to `Text to image`, `Image to video`, `FLF to video`.
  Template APIs are previews only; the queue has no API column. Params JSON,
  including `seed: 0`, explicit empty `negativePrompt`, and scene linkage, is
  preserved. Invalid Params fail before the update request.
- Review reads `Pipeline_Review_Gate` (`5xZbQOeVq0mh9cJu`) and displays current
  job outputs/readiness plus pending/approved/rejected/stale state. Production
  status must be the literal `Qued`, and every linked queue job must be completed,
  not Working, with an HTTP(S) output URL. UI readiness is informational only.
- Decisions remain in the **authenticated n8n editor** workflow
  `KMtoCzHcKMiTKNvZ`: set explicit JobID/action in Review Request; execute `list`,
  inspect Capture Output Snapshot, then execute `approve` or `reject`. The workflow
  binds approval to the previously listed unchanged snapshot. UI approval buttons
  are intentionally disabled: no authenticated app review transport exists yet.
  The workflow is manual/inactive; this does not prevent authenticated editor use.
- **No final-video assembly workflow is connected or implemented.** Approval
  does not generate a final video. A future assembler must freshly revalidate the
  approved snapshot and readiness server-side before starting.
- ComfyUI image/video src and fallback/open links use the **original direct**
  `http://10.0.0.157:8188/view?...` URL, not the UI media proxy. Filename,
  subfolder, type, query encoding and omitted parameters are preserved exactly.
  Log in to ComfyUI at the same host on port 8188 to obtain its session cookie.
  Browser img/video elements cannot inject a bearer Authorization header;
  no server token is added to browser URLs or bundles. Actual playback requires
  reachable ComfyUI, valid output files and a session accepted by `/view`.
- Preserve `.data/index.html` overrides: they take precedence over the checkout
  bind mount. Compare them with the checkout before updating, back up and merge
  operator changes, then verify served HTML bytes. Hand-managed version metadata
  is retained, so its commit label is not proof of current asset identity.

The bundled setup import template is generic legacy onboarding, not the freshly
repaired production workflow. Do not re-import it over an existing repaired CRUD
workflow. Isolated CRUD smoke tests do not establish end-to-end generation.

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
  └── (unknown routes)          → 404, never arbitrary n8n REST access
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

3. **Authentication** — an n8n REST API key is not webhook authentication. The local UI does not forward an administrator API key. Keep the UI loopback-only until authenticated app access is configured; Review decisions require the authenticated editor.

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
+ - **Bottom bar** — always-visible strip at the bottom showing the running version, git commit short hash, and branch, served by `GET /version`. The values come from the container, not GitHub.
+ - **Check for updates popup** — click the bottom-bar button to open a modal explaining the two update paths (drop into `.data/` for no-rebuild UI/version changes vs full image rebuild for proxy/dependency changes), the beta-vs-main split, and quick verify commands.

+## Version Bar, Updater Popup, Beta vs Main
+
+### Bottom bar
+
+The bottom bar is fixed to the bottom of the viewport and shows `n8n-table-ui  <version>  commit <sha>  (<branch>)` pulled from `GET /version`. It is visible on every tab. A **Check for updates** button opens the updater popup.
+
+`GET /version` returns a JSON object shaped `{ version, commit, branch }`. Priority:
+
+1. `.data/version.json` when it was **hand-dropped by an operator** (no `_seeded` marker) — wins over everything, never overwritten by a restart/rebuild.
+2. `.data/version.json` auto-seeded by a prior container run (`_seeded: true`) — corrected by the new build's baked files when they differ.
+3. `/app/version.txt`, `/app/git-commit.txt`, `/app/git-branch.txt` baked into the image at build time from `--build-arg`.
+4. `VERSION` / `GIT_COMMIT` / `GIT_BRANCH` env (baked in by Dockerfile `ENV`, surviving when compose doesn't pass them).
+5. `'0.0.0'` / `'unknown'` fallback.
+
+On first run (or after a clean `.data/`), the proxy auto-seeds `.data/version.json` from the baked files and writes `_seeded: true` into it.
+
+### Updater popup
+
+The popup explains two update paths and the beta/main split, and gives quick verify commands (`curl -s http://localhost:3458/version`, `ls -la .../.data/`). It is not a GitHub poll — there is no automatic "new version available" check. To wire one, add a call against the GitHub API and compare the returned ref SHA against the bottom-bar commit.
+
+### Beta vs main
+
+- **main** = production.
+- **beta** = testing. Build from the `beta` branch, deploy, and point the container at it when you want to test new UI or build changes. Do not swap beta onto the production container unless you intend a beta rollout.
+
+When building for beta, pass the branch so the bottom bar reads `(beta)`:
+
+```bash
+docker build \
+  --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
+  --build-arg GIT_BRANCH=beta \
+  --build-arg VERSION=0.1.0-beta.1 \
+  -t n8n-table-ui:beta-v1 .
+```
+
+When building for main, pass `GIT_BRANCH=main` and a release `VERSION`.
+
+### No-rebuild updates (drop into `.data/`)
+
+The proxy serves `.data/index.html` when it exists, and reads `.data/version.json` for the version bar. So UI tweaks and version bumps can be applied without a build:
+
+```bash
+# On the server (10.0.0.157), drop the new UI file and an optional version bump:
+cp new-index.html /home/dad/Config/data/n8n-table-ui/.data/index.html
+echo '{"version":"0.1.0","commit":"manual","branch":"main","_seeded":false}' \
+  > /home/dad/Config/data/n8n-table-ui/.data/version.json
+
+# Restart to pick it up (no docker build):
+docker restart n8n-table-ui
+```
+
+Notes:
+
+- A hand-dropped `version.json` must **not** carry `_seeded` (or carry `_seeded: false`) so a later rebuild does not overwrite it. The proxy writes `_seeded: true` only on files it auto-generates.
+- Changes to `proxy-server.cjs`, the Dockerfile, or image dependencies still require a build + deploy + restart.
+- The `.data/` dir is owned by `dad` and writable by the container (the container runs as root, so files it writes end up root-owned — re-own with `sudo chown -R dad:dad .../.data` if you need to edit them as `dad`). Set up the `.data/` dir once before first run:
+
+```bash
+ssh dad@10.0.0.157 'mkdir -p /home/dad/Config/data/n8n-table-ui/.data && sudo chown -R dad:dad /home/dad/Config/data/n8n-table-ui/.data'
+```
+
+## Build Args
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

## Build Args

The image bakes three values at build time via `--build-arg`; these survive when compose does not pass them as env vars, and they seed `.data/version.json` on first run:

|| Build arg | Default | Description ||
|| `GIT_COMMIT` | `unknown` | Short git commit hash baked into `/app/git-commit.txt` and the bottom bar ||
|| `GIT_BRANCH` | `unknown` | Branch name baked into `/app/git-branch.txt` (e.g. `beta` or `main`) ||
|| `VERSION` | `0.0.0` | Version string baked into `/app/version.txt` and the bottom bar ||

Example (beta build):

```bash
docker build \
  --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
  --build-arg GIT_BRANCH=beta \
  --build-arg VERSION=0.1.0-beta.1 \
  -t n8n-table-ui:beta-v1 .
```

Example (main build):

```bash
docker build \
  --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
  --build-arg GIT_BRANCH=main \
  --build-arg VERSION=1.0.0 \
  -t n8n-table-ui:1.0.0 .
```

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

## Beta audit and update testing

The `beta` branch contains the tested UI fixes; `main` is not changed by this
rollout. The update popup is informational and reloads table data: it does not
fetch GitHub, select a branch, install assets, or refresh the document script.
Test beta in a separate checkout/deployment, or explicitly deploy its assets,
then reload the browser document. Preserve `.data/index.html` and manually
managed version metadata; verify served bytes rather than trusting a version label.

The proxy rejects request bodies over 1 MiB with structured HTTP 413 before
forwarding. Current observed template row maximum was 11,441 serialized bytes.
Create-table column parsing now returns an array rather than a Promise.

**Unresolved Push linkage:** Push currently sends POST `/webhook/yt-update`
with `{operation:'update',id:tableId,match:{id:rowId},row:{Working:true}}`.
This preserves the exact row but does not execute Research, Scene Production,
Dispatcher, or Runner. Their queue selectors require `Working=false`, so marking
it true can strand it. Do not use Push as a generation trigger until an
explicit exact-row, authenticated execution contract is designed and tested.
The Runner's current direct POST `/webhook/yt-Test` takes body `Id`/`Type`;
other generation workflows use GET and different row query keys. No production
generation calls were made during this audit, and no workflow was edited.

## Direct ComfyUI browser media

The user's explicit preference is original direct ComfyUI `:8188/view` URLs
for image/video src and open/fallback links: **no `/media/comfy/view` rewrite**.
For example, `http://10.0.0.157:8188/view?filename=LTX-2.5_i2v_00110_.mp4&subfolder=video`
remains that exact URL. Never guess subfolders, default missing type in the
browser, or add bearer credentials to URLs/bundles.

Log in to ComfyUI at the same host `:8188` first. Browser img/video elements
cannot inject bearer Authorization; direct media relies on the ComfyUI session
cookie and endpoint support for that session. Unreachable or rejecting ComfyUI
means previews/playback are not verified, regardless of passing UI tests.

The server-side authenticated cache route is retained as unused infrastructure;
the UI never invokes it. Its bearer token remains server-side in the read-only
`COMFYUI_TOKEN_FILE` mount. Existing cache contents and version metadata are
preserved; no ComfyUI or n8n settings are changed.

Run `npm test` and `npm run build` for contracts and full inline-script syntax.
Never queue generation or approve real jobs as a preview test.

## License

ISC
