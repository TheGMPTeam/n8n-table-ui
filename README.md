# n8n-table-ui — beta

Trusted-LAN UI for n8n's native Data Tables and the Research → Script → Scenes → Review pipeline. **Beta publication is not deployment or production-readiness certification.** No final-video assembler or upload handoff is connected. Approval does not create a finished short.

## Quick start

Use a separate host/directory for first installation; never import this bundle over an existing production stack.

```sh
git clone --branch beta https://github.com/TheGMPTeam/n8n-table-ui.git
cd n8n-table-ui
npm test
npm run build
# Supply your compatible external FFmpeg image before preflight:
export FFMPEG_IMAGE=your-existing-compatible-ffmpeg-image:tag
python3 full-stack/check_setup.py
python3 full-stack/test_setup.py
```

The nine-service setup is `full-stack/compose.json` (JSON is valid Compose input). It was derived programmatically from **all nine** services in the operator's main and UI-only Compose files. Pocket build source is bundled with its MIT license. **FFmpeg API source is deliberately excluded: this is not a self-contained FFmpeg build. Before preflight/start, obtain an existing compatible image or build one from your own separately authorized source outside this checkout, then set `FFMPEG_IMAGE` to that locally available tag.** The sample `ffmpeg-api:latest` is not published by this repository; Compose never pulls it and has no FFmpeg build context.

```sh
# First prerequisite, before running check_setup.py:
export FFMPEG_IMAGE=your-existing-compatible-ffmpeg-image:tag
docker image inspect "$FFMPEG_IMAGE" >/dev/null
# Or, only with your own authorized external source:
# docker build -t "$FFMPEG_IMAGE" /operator/authorized/external/ffmpeg-source
```

Preflight rejects missing/unavailable FFmpeg images rather than substituting a stub. Configure the same image in private `full-stack/.env`. Workflow HTTP calls to its compatible API are included; implementation code and generated source patches/archives are not.

```sh
cd full-stack
python3 prepare_local.py --prepare --comfy-token-file /operator/private/comfyui-api-token
# Edit the newly created private .env; never commit it.
docker compose --env-file .env -f compose.json config --quiet
# On your NEW installation, after configuring bind permissions and prerequisites:
docker compose --env-file .env -f compose.json build
# Operator-controlled first start, not an updater or release operation:
docker compose --env-file .env -f compose.json up -d
```

`prepare_local.py` creates directories, a private random n8n encryption key, private Review transport secret and initial enhancement setting. It never starts services, deletes data or overwrites existing settings/token files. If you do not yet have a ComfyUI token, omit `--comfy-token-file`, initialize ComfyUI's own authentication first, then place its genuine token in `data/comfyui/storage-user/login/PASSWORD` before starting media consumers. No reference audio or authentication database is shipped.

Set `LAN_BIND_IP` to the intended trusted-LAN IP; the example is loopback for safe validation. Set `N8N_HOSTNAME`, `COMFYUI_PUBLIC_HOST`, and `REVIEW_UI_ORIGINS` to matching real hostnames/origins. ComfyUI media URLs must be directly browser-reachable. Supply an **explicit RTX 5060 Ti UUID** in `COMFYUI_5060_TI_UUID`; verify the UUID/model with `nvidia-smi -L`. ComfyUI has no all-GPU/3060 fallback. Ollama's separate `OLLAMA_GPU_UUID` is independently operator-selected. Install Docker Compose, NVIDIA drivers and NVIDIA Container Toolkit before GPU use.

## Full-stack services and persistent bindings

| Service | Host port(s) | Source | Persistent host bindings under `full-stack/` |
|---|---:|---|---|
| n8n-table-ui | 3458 | root Dockerfile | `data/n8n-table-ui/.data`; read-only source HTML/proxy binds |
| n8n | 5678 | `n8nio/n8n:latest` | `data/n8n`, read-only `data` |
| ComfyUI | 8188 | `yanwk/comfyui-boot:cu130-megapak-pt211` | `data/comfyui/storage-{cache,nodes,models,user}` |
| Ollama | 11434 | `ollama/ollama:latest` | `data/ollama` |
| FFmpeg API | 8765 | operator-supplied `FFMPEG_IMAGE` (no source/build context bundled) | `data/ffmpeg-api/uploads`, operator voice references, private ComfyUI token file |
| Pocket TTS | 49112 | `full-stack/pockettts/Dockerfile` | `data/pockettts/{voices,logs,voice-cache,huggingface-cache}` |
| SearXNG | 8080 | `docker.io/searxng/searxng:latest` | `data/searxng/ect`, `data/searxng/Cache` (original spelling preserved) |
| LLM evaluation suite | 9090 → 8080 | `ghcr.io/thecodacus/llm-eval-suite:latest` | `data/llm-eval` |
| Caddy gateway | 8081, 8443 | `caddy:2-alpine` | safe `Caddyfile`, `data/caddy` |

The supplied Caddyfile is a minimal optional LAN HTTP gateway, not the operator's private TLS/proxy configuration. Port 8443 is preserved in the service export but no HTTPS listener/certificate is configured by the example. Use direct n8n port 5678 for initial setup; path-prefixed editor proxying needs separate n8n path/public URL configuration.

**Keep every relative `./data` binding.** Back up persistent data before upgrades. Do not use stack-wide `down`, volume deletion, resets or blanket ownership changes. n8n and Pocket run as UID 1000 and need write access to their own data/cache/log directories; grant narrowly scoped ownership/ACLs on a fresh installation. ComfyUI retains its root-dependent startup and `umask 000`; do not force an incompatible non-root entrypoint. Never replace existing model/voice caches with empty directories.

Pocket is CPU-only, non-quantized FP32, **four processing threads and eight CPU quota**. Its distributable `pockettts/cpu_startup.py` imports Pocket before setting Torch thread counts, preserving the fix for Pocket's import-time thread reset. Torch CPU wheels and dedicated Pocket runtime remain separate from FFmpeg's HTTP consumer. Stock/authorized voices and model access must be supplied by the operator; a new host does **not** inherit Jarvis.

## CRUD-first setup: every required table through webhooks

The source exports include **11 linked workflows**, **7 table schemas**, and **4 template configuration rows**. Discovery used current UI routes/configured IDs, published webhook paths, `executeWorkflow` and `errorWorkflow` closure; unrelated personal Fiverr automations and diagnostic clones are excluded. Workflow snapshots have no production rows, pinData, staticData or credential values. Source IDs are remapping identifiers, not valid destination IDs.

Required schemas: `running_job`, `ComfyUI`, `Pipeline_Review_Gate`, `Pipeline_Status_History`, `Shorts_Production`, `AI_Run_Metrics`, `ComfyUI_Templates`. Exact names, column capitalization/types and native credential dependencies are in `full-stack/manifest.json` and `tables.json`.

1. Create the destination n8n account and private API key. Configure the required encrypted native credentials yourself; no script creates credentials on the live operator system. The n8n API credential used **inside CRUD** is separate from the UI server's read-only inventory/schedule key.
2. Import/configure/publish **Data Table CRUD first**. For manual UI setup, use the fresh `full-stack/crud-bootstrap.json`, configure its native n8n credential and publish it. Do not restore the legacy generic onboarding fixture over repaired production CRUD.
3. The Setup wizard orders **CRUD → connectivity → Build all required tables → verify IDs → optional isolated smoke test**. Explicit Build creates every required typed schema via native `yt-create`, verifies IDs/rows via `yt-get` and read-only schema metadata, then writes only empty-table template configuration via `yt-wright`. Compatible existing names/schemas are reused, conflicts fail without deletion, existing nonempty template configuration is preserved. The server saves its assigned-ID mapping privately. No production job is inserted or dispatched by Build.
4. Run the importer for the full native workflow-ID/table-ID/credential remapping. It can bootstrap CRUD itself or reuse tables created by the wizard. It uses REST only for workflow definitions/publication and read-only table inventory/metadata; **no REST table creation route is used**.

```sh
# Working directory: full-stack. Edit copies, not the example files.
cp credential-map.example.json credential-map.json
cp endpoint-map.example.json endpoint-map.json
# Fill each old native credential ID with destination {id,name}; no secret values.
# Set actual fixed server/LAN origins in endpoint-map.json.
# Export your private N8N_API_KEY into the process environment without printing it.
python3 import_setup.py \
  --url http://YOUR_NEW_N8N_HOST:5678 \
  --expected-url http://YOUR_NEW_N8N_HOST:5678 \
  --credentials credential-map.json --endpoint-map endpoint-map.json \
  --journal import-state.json --import-templates --apply
```

Optional `--project DESTINATION_PROJECT_ID` passes the native project ID through the distributable CRUD create contract. Without it, n8n's credential-owner personal project is used. Read the destination's existing project ID, never copy a production project identity. The importer reserves fresh inactive workflow IDs, publishes only CRUD, builds compatible tables through its webhooks, then remaps every string/resource-locator/resource-mapper/embedded Code dependency and credential reference. It journals assigned IDs atomically and reads targets back. **All non-CRUD workflows/schedulers remain inactive.** Reruns preserve tables and reject schema conflicts/active non-CRUD targets; never automatically retry an uncertain create/write. Inspect native execution/state and the journal first.

Set `HOME_RUNNER_WORKFLOW_ID` from the import journal's new Runner ID, populate Home/Jobs/Templates IDs in Config (Build fills these), and configure native endpoints/credentials. Review's private `X-Review-Transport` credential must match the generated server-only `review-secret`. ComfyUI's native Bearer credential and `COMFYUI_TOKEN_FILE` must refer to the same authenticated service, with destination restrictions. Browser bundles, URLs and storage never receive those credentials. Publish helpers/error workflows before callers; enable production schedules only after models, templates, credentials, dependencies and isolated acceptance checks are validated.

## Models and enhancement defaults

`full-stack/model-requirements.json` lists exact workflow model tags and template model filenames. Supply Ollama models, ComfyUI custom-node packages and model files yourself; exports do not prove these are installed on a new host. Three template graphs are configured; `Text to image 20` is intentionally incomplete and must remain unsupported rather than being silently invented.

Config → **Ollama enhancement** shows all unique installed exact tags from server-side `/api/tags`, preserving duplicate elimination without tag rewriting. The default is `qwen3.8:latest`; Config Save atomically persists a changed installed selection privately in `.data/ollama-enhancement-settings.json`. The backend validates the saved tag immediately before draft-only native enhancement. No model pull, job save, approval or generation occurs when selecting a model. Missing tags/connection/model errors retain the draft and fail visibly. Manual-editor enhancement has its documented original fallback; no other workflow model is changed.

`OLLAMA_BASE_URL` is operator-managed server configuration (Compose uses `http://ollama:11434`), never a client-selected proxy destination. Point the native Ollama credential at the same service. Docker copies **both adjacent `review-backend.cjs` and `ollama-settings.cjs`**, plus the Setup module/assets; durable settings stay in the data bind. The Home schedule engine is separately pinned to the installed native `cron@4.4.0`, with the existing private runtime override honored when present.

## Review, Push and schedule behavior

Review actions intentionally require **no operator/n8n login** on this trusted LAN. Exact Origin/Host checks are not authentication and cannot defend against malicious LAN clients. Private native webhook credentials stay server-only. Never publish this unauthenticated UI/CRUD network directly to the Internet.

Review lists complete, idle, dependency-valid assets with original direct ComfyUI previews, editable prompts, Enhance, per-asset Approve/Deny and type-specific Regenerate. A parent job's all-assets-approved aggregate is a review state, not final-video completion. Final assembly/upload remains missing. Decisions bind to fresh metadata snapshots and expiring single-use job-bound nonces; approvals for changed assets/dependent video are invalidated. Enhance returns only an editable prompt draft. **Regenerate first saves/confirms the exact queue row, then calls the shared Home `doPush`**. Native regeneration is prepare-only, avoiding duplicate dispatch. If Push fails after save, the row remains pending with “Saved; push failed”; there is no automatic retry. Queue acknowledgment means accepted, not generated.

Home remains the ComfyUI queue; Jobs contains only Shorts_Production partitioned by Type. New creates a pending Research idea, not a new table or arbitrary generation graph. Only Push dispatches an exact positive row ID. Published Research/Production/Dispatcher/yt-Test transports are POST with `Id` and boolean `ByPass`; no pre-locking or cloning. Exact table+row suppression and the first-acknowledgment 60-second refresh preserve source tabs/unsaved edits. Existing schedules can independently consume pending rows; creation is not an indefinite manual hold.

Home's next-run display reads the **published Runner schedule**, explicit timezone and recognized night-eligibility contract. Inactive schedules show paused, missing/changed contracts fail unavailable, and empty queues still retain the timer. The captured schedules are America/New_York: Research 07:00, Scene 08:00, Dispatcher 09:00, Morning Brief 07:00, and Runner every 15 minutes during 22:00–06:59. These actual definitions are preserved, not replaced by an invented new chronology; they remain inactive on import. Keep preparation order and the overnight gate in mind when configuring your own approved schedule. Direct image/video URLs are not rewritten through the UI: original filename/subfolder/type/query encoding stays intact. Browser playback may require a separate ComfyUI login/session; backend readability does not prove browser playback.

## Morning integration

The exported Morning workflow preserves its current complete briefing context/template and deterministic validation; there is **no HTML Morning renderer** added. Delivery/response-validation nodes are disabled and the private receiver URL/credential binding is not distributed. An external Hermes receiver is optional and must be separately configured/authorized by the operator. Its current sentence-audio integration is `pockettts_brief_audio_v2`; do not replace it with an older audio tool or assume Jarvis voice/reference/cache exists. This repository does not export Hermes auth, route configuration or private voice data. Structured JSON/parser validation checks the current full text/template contract, not pronunciation, speaker identity or acoustic quality. No ASR round-trip for this release candidate was exercised; even a later transcript match would not certify Jarvis timbre, every sentence boundary, scene timing or human listening acceptance.

## Updates and component identity

Updates consume public main/beta releases; they do not commit or push GitHub. Public checks require no GitHub login. Static bind assets can be reloaded; startup-loaded backend/helper changes need only an explicitly authorized UI-process restart; Dockerfile/dependency changes require a reviewed image rebuild/recreate. Preserve `.data/index.html` overrides, private backend overrides, hand-managed `version.json` and dirty operator source. A source SHA/version label cannot identify mixed running UI/server/Review/Ollama/updater bytes: compare `/updates/identity` component hashes and updater readiness separately. The full-stack example intentionally does not install/register the private host updater service; Apply is unavailable until the operator separately configures it. Publishing beta never activates it.

## Troubleshooting, backups and rollback

From `full-stack/`, use read-only checks:

```sh
docker compose --env-file .env -f compose.json ps
docker compose --env-file .env -f compose.json logs --tail 100 n8n n8n-table-ui pockettts ffmpeg-api
python3 check_setup.py
python3 test_setup.py
python3 test_helpers.py
```

Keep logs private: native errors can contain prompts or upstream credentials. Do not dump Docker environment, active `.env`, n8n databases or full execution snapshots into support tickets. A missing webhook means CRUD was not published/registered or its method/path differs; an API credential is not webhook authentication. Unknown tables mean IDs were not remapped. Schema conflicts require operator review, not table deletion. Missing models/voices must be supplied explicitly; never silently substitute a different model/GPU/voice. Schedule unavailable can mean inactive Runner, missing private read key or a changed eligibility contract. Missing audio/media may be an auth/URL/permissions/model issue; do not restart unrelated services to diagnose it.

Before any authorized update, take application-consistent backups of the exact persistent binds and private configuration, retaining file permissions and model/voice caches. Preserve the private encryption key with the n8n backup: rotating it can make stored credentials unreadable. Keep the import journal and component identities with the backup, outside Git. Restore a prior reviewed image/source set in a separate checkout, reconcile existing overrides, then recreate/restart **only the explicitly authorized changed service**. Never reset the operator's dirty checkout or overwrite its index. Do not use stack-wide down/reset, delete volumes or import stale production rows to roll back a UI release.

## Verification and limitations

Run `npm test`, `npm run build`, `node --test setup-bootstrap.test.cjs ollama-settings.test.cjs per-asset-enhancement.test.cjs review-lan.test.cjs review-home-push.test.cjs`, `python3 full-stack/check_setup.py`, and `python3 full-stack/test_setup.py`.

The fresh origin/beta baseline passed 156 tests. The current complete candidate run returned **211 tests: 194 passed, 17 failed, exit 1**. The 18 focused current-contract tests and 7 Python importer/helper tests passed. Integrating existing dirty operator work and fresh published contracts currently yields historical-contract failures (authenticated Review/file-hash expectations, old editor/Model behavior and guarded Home deletion); see `BETA-LIMITATIONS.md` for the actual final run. Do not treat a clean syntax/focused/mock suite as a clean full suite. Setup tests exercise actual exported CRUD normalization plus instrumented mocked transports, not a new native full-stack boot. Compose config checks syntax, not model availability, GPU drivers, permissions or startup. No production generation, approval, live schema write, workflow import or stack deployment was performed for this publication.

Final assembly/upload, cross-host installation acceptance, complete audiovisual generation, public-Internet security and live updater activation remain unverified or missing. Images retaining `latest` reflect the operator's actual stack, not reproducible pinned upstream releases.

## Licenses and source provenance

The UI repository declares ISC; its license is now included as `LICENSE`. Pocket server source preserves its upstream MIT license under `full-stack/pockettts/LICENSE` and records the pinned source commit in `full-stack/SOURCE-PROVENANCE.md`; local changes are bundled as actual source, not fabricated images. FFmpeg implementation source is excluded; its external image and the startup helper are documented separately. No FFmpeg source redistribution license is implied. Model weights, third-party dependencies, authorized voice references and container image licenses are separate operator obligations.
