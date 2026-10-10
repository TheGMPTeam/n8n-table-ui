# n8n-table-ui — six-service beta

A trusted-LAN table and per-asset Review interface for n8n. **Beta publication is not deployment or production-readiness certification.** Final assembly/upload is not connected, and the complete UI test suite still has 17 failures.

## Docker Hub

```sh
docker pull thegmpteam/n8n-table-ui:latest
```

- [Docker Hub — thegmpteam/n8n-table-ui](https://hub.docker.com/r/thegmpteam/n8n-table-ui)
- Tags: `latest` (current), `beta` (branch build), `sha-<commit>` (immutable)

Platform: `linux/amd64`.

## Run

Two compose files, for two situations:

| File | Use when |
|---|---|
| `docker-compose.n8n-table-ui.yml` | **Adding to the stack this repo belongs to.** Drop-in service block that joins the existing `automation` network and talks to n8n by service name. |
| `docker-compose.n8n-table-ui.standalone.yml` | **Adding to a different stack.** Self-contained, no local checkout, everything configurable by env var. |

Both pull `thegmpteam/n8n-table-ui:latest` — neither needs a local build. To build
from a checkout instead, comment out `image:` and uncomment the `build:` block in
`docker-compose.n8n-table-ui.yml`.

### 1. Stack compose (the server stack)

`docker-compose.n8n-table-ui.yml` is a drop-in for the server's own stack. It
assumes n8n is already on the `automation` network as service `n8n`:

```sh
# From the server's Config dir, after copying the file next to docker-compose.yml:
docker compose up -d n8n-table-ui
```

```yaml
services:
  n8n-table-ui:
    image: thegmpteam/n8n-table-ui:latest
    pull_policy: daily
    container_name: n8n-table-ui
    restart: unless-stopped
    ports:
      - "3458:3458"
    environment:
      - NODE_ENV=production
      - PORT=3458
      - N8N_HOST=n8n
      - N8N_PORT=5678
      - N8N_API_KEY=${N8N_API_KEY}
      - API_BASE=n8n
      - API_PORT=5678
      - DATA_DIR=/app/.data
    volumes:
      - ./data/n8n-table-ui/.data:/app/.data
    networks:
      - automation
    depends_on:
      - n8n

networks:
  automation:
    external: true
    name: automation
```

Web UI: `http://<server-ip>:3458/`

### 2. Standalone compose (add to another stack)

`docker-compose.n8n-table-ui.standalone.yml` is self-contained. No checkout, no
build, and it hardcodes no host or network — configure it entirely with
environment variables so it drops into any stack:

```sh
docker compose -f docker-compose.n8n-table-ui.standalone.yml up -d
```

| Variable | Default | Purpose |
|---|---|---|
| `N8N_UI_TAG` | `latest` | Image tag to pull |
| `N8N_UI_NETWORK` | `n8n-table-ui` | Docker network to join |
| `N8N_UI_NETWORK_EXTERNAL` | `false` | `true` when joining an existing network |
| `N8N_UI_BIND` | `127.0.0.1` | Host interface to publish on |
| `N8N_UI_PORT` | `3458` | Host port |
| `N8N_UI_CONTAINER` | `n8n-table-ui` | Container name |
| `N8N_UI_DATA` | `./data/n8n-table-ui/.data` | Host path for runtime state |
| `N8N_HOST` | `n8n` | n8n service name, or a reachable host/IP |
| `N8N_PORT` | `5678` | n8n port |
| `N8N_API_KEY` | (none) | Only if n8n requires API auth |

**Shared network (default)** — the UI joins the network n8n is already on and
resolves it by service name; nothing needs to be published by n8n:

```sh
N8N_UI_NETWORK=<n8n-network> N8N_UI_NETWORK_EXTERNAL=true N8N_HOST=n8n \
N8N_UI_BIND=10.0.0.157 \
docker compose -f docker-compose.n8n-table-ui.standalone.yml up -d
```

Find the network name with:

```sh
docker inspect <n8n-container> \
  --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'
```

**Isolated** — no shared network; point `N8N_HOST` at an address the container can
reach and leave the network to this file:

```sh
N8N_HOST=10.0.0.157 N8N_PORT=5678 N8N_UI_BIND=10.0.0.157 \
docker compose -f docker-compose.n8n-table-ui.standalone.yml up -d
```

Verify either mode:

```sh
curl -s http://<bind>:<port>/config   # proxy env snapshot
curl -s http://<bind>:<port>/version  # version / commit / branch
curl -s http://<bind>:<port>/         # serves the UI (HTTP 200)
```

The default `N8N_UI_BIND` is `127.0.0.1`, so the port is **not** exposed on the LAN
until you set it.

Publishing the image does not change the trust boundary: the UI is a
trusted-LAN service, and the container still needs `N8N_API_KEY` supplied at
runtime. Never expose port 3458 unauthenticated.

## Install: VirusGPT-derived terminal CLI, no host Python

The stack installer now lives in the separate [TheGMPTeam/n8n-ai-stack](https://github.com/TheGMPTeam/n8n-ai-stack) repository. It is derived from the actual [VirusGPT](https://github.com/TheGMPTeam/VirusGPT) `vgctl.py` control/diagnostic foundation, ported to JavaScript to meet the no-host-Python requirement. Its source mapping, preserved MIT attribution and pinned foundation commit are documented in that repository's `FOUNDATION.md`.

The new stack and customized [PocketTTS server](https://github.com/TheGMPTeam/pockettts-server) repositories are **private**, default branch **beta**. Access requires authentication; this public UI repository alone is not an anonymously accessible complete installation bundle. The existing Comfy Docker repository is [YanWenKun/ComfyUI-Docker](https://github.com/YanWenKun/ComfyUI-Docker), not a new redundant fork.

Requirements: Node.js 20+, Git, Docker/Compose and private-source GitHub access. Python remains inside the Pocket image, not a host installer prerequisite.

```sh
gh repo clone TheGMPTeam/n8n-ai-stack
cd n8n-ai-stack
node bin/n8n-stack.cjs doctor
node bin/n8n-stack.cjs install --dir ../my-ai-stack
```

Optional `npm install --global .` provides `n8n-stack` (including an npm Windows command shim). Otherwise use `node bin/n8n-stack.cjs` for every command below. Full questions, confirmations, source locks, native import options, persistence paths and troubleshooting are in the **single installation guide** at the stack repository's README.

```sh
n8n-stack doctor --dir ../my-ai-stack
n8n-stack doctor --fix --dir ../my-ai-stack
n8n-stack run pockettts --dir ../my-ai-stack
n8n-stack stop pockettts --dir ../my-ai-stack
n8n-stack status --dir ../my-ai-stack
n8n-stack logs n8n --dir ../my-ai-stack
n8n-stack models list --dir ../my-ai-stack
```

Install asks service selection, project, listener/advertised hostname, timezone, each host port, external replacements, explicit GPU UUIDs, Pocket CPU budget and enhancement tag. Preparation/source fetch and later build/start have **separate default-No confirmations**. Cancellation writes nothing. Secrets are masked in a real terminal and kept in private files. Starting Pocket can download weights; no model downloader/importer runs automatically.

Exactly six selectable services: **n8n-table-ui, n8n, ollama, pockettts, searxng, comfyui**. Defaults: 3458, 5678, 11434, 49112, 8080, 8188. No FFmpeg, Caddy, Redis or evaluator service. Source clones/build contexts are self-contained inside the selected installation. Project identity and custom n8n advertised port persist. SearXNG gets a generated private secret and HTML/JSON formats. The UI's Comfy token file is explicitly mounted read-only; private Review file/environment bytes are checked for equivalence.

CPU Ollama is supported. Local Comfy's prepared image is CUDA/NVIDIA and requires an explicit available UUID; on this server it must use the RTX 5060 Ti, not silently fall back to the RTX 3060. macOS must use external Comfy; Windows GPU readiness depends on its Docker/WSL environment. CLI platform CI does not prove six-service GPU deployment. Root-dependent Comfy binds and UID1000 n8n/Pocket binds require scoped access; never recursively change unrelated host data.

Doctor is diagnostic, not readiness certification. WARNs return zero, FAILs return nonzero. `--fix` creates only missing binds beneath an existing owned installation; it does not install drivers/packages, kill ports, chmod sockets, rotate secrets, delete data or restart services. `run SERVICE` is selected-only `up -d --no-deps`, not a broad stack operation. Never expose this unauthenticated UI/CRUD directly to the public Internet.

## Native setup: CRUD first

Exports retain **11 workflows, 7 typed schemas, 6 credential metadata mappings and 4 template configuration rows**, without production rows or credential values. Source IDs are remapping inputs, not destination IDs. See [manifest](full-stack/manifest.json), [schema export](full-stack/tables.json) and [provenance](full-stack/SOURCE-PROVENANCE.md).

Create the destination n8n account and required encrypted native credentials yourself. Its native CRUD credential differs from the UI's backend inventory/schedule REST key. Copy the stack repository's `exports/credential-map.example.json` and `endpoint-map.example.json` outside Git; supply actual destination IDs/names and credential-free origins. Configure native Review `X-Review-Transport` with the exact generated `private/review-webhook-secret` bytes.

```sh
n8n-stack workflows import --url http://localhost:5678 --expected-url http://localhost:5678 --credentials ../credential-map.json --endpoint-map ../endpoint-map.json --journal ../setup.journal.json --import-templates --apply
```

Use your chosen n8n host port. The REST key comes from `N8N_API_KEY` or a masked terminal prompt, not a command-line value. Optional `--project ID` identifies the destination native project.

The Node importer reserves fresh inert IDs, configures/publishes **Data Table CRUD first**, then creates/verifies required tables through `yt-create`/`yt-get` and remaps dependent workflows. REST is used for workflow definitions/publication and **read-only** table metadata, never table creation. Only CRUD is published; every non-CRUD schedule remains inactive. Compatible schemas are reused; conflicts stop without deletion. Empty-table template seeding uses `yt-wright` and exact readback. The private source/target-bound journal stops uncertain create/write retries for manual reconciliation.

Do not manually import a duplicate published CRUD before the importer. UI Setup separately orders CRUD → connectivity → Build all required tables → verification → optional isolated smoke test. Build reuses compatible schemas, seeds only empty templates and privately saves destination IDs, but **does not import all workflows**. If Setup already seeded templates, omit `--import-templates`. Set `HOME_RUNNER_WORKFLOW_ID` to the journal's new Runner ID and populate UI Config from assigned table IDs. Review endpoint/credential readiness before selectively publishing helpers and callers.

Legacy Python `full-stack/installer.py`, `prepare_local.py`, `import_setup.py`, `download_models.py` and nine-stack `check_setup.py` remain historical source, **not the supported host quickstart**. Do not run them as the new installation path.

## Models, enhancement and Pocket

[Model requirements](full-stack/model-requirements.json) and [Comfy inventory](full-stack/comfy-model-manifest.json) list current workflow tags/template files. All ten Comfy download URLs remain manual-unresolved; no weights or invented upstream URLs are supplied. Validate actual loaders, custom nodes, licensing, hashes, gated access and available space. Three graphs are configured; **Text to image 20 is incomplete/unsupported**. The new CLI has no automatic model downloader.

Config lists every unique exact installed Ollama `/api/tags` tag. An installed enhancement choice persists privately in `.data/ollama-enhancement-settings.json` as `defaultEnhancementModel` and affects draft-only enhancement, not other workflows. The new installer initializes the operator's choice rather than a different hardcoded tag. Model listing/selection does not pull a model, save a job, dispatch or approve. [Enhancement guide](OLLAMA-ENHANCEMENT.md).

Pocket's separate repository preserves upstream MIT source, browser-upload cloning and post-import Torch thread configuration. It remains CPU-only with explicit budgets and persistent voice/model caches. Full precision is not a perceptual-quality guarantee. No voice recording/clone, token or gated weight is shipped; new hosts do not inherit the existing Jarvis voice. Obtain voice consent and gated-model rights independently. No standalone FFmpeg API source/service is bundled; exported FFmpeg HTTP consumers need an independently supplied external integration and stay unusable without it.

## Using the UI and review gate

- **Home:** Comfy generation queue. **Jobs:** Shorts_Production, partitioned by its Type into Research, Script, Scenes, Review, Video Review, Uploaded and Unknown. Status Queued/Qued/Error never substitutes for Type.
- **New:** a pending Research idea, not a new table or arbitrary generation graph. Existing approved schedules can independently consume pending rows; creation is not an indefinite manual-only hold.
- Table edits do not Push. Push sends the selected existing positive row through fixed POST Research/Production/Dispatcher/yt-Test transports with `Id` and boolean `ByPass`, without pre-locking/cloning. Exact table+row suppression and first-accepted-ACK 60-second guarded refresh preserve source views/unsaved edits. ACK is acceptance, not completion. [Contracts](docs/current-push-contracts.md).
- Review lists complete/readable current dependency-valid assets with their original direct Comfy previews, prompts, draft Enhance, Approve/Deny and type-specific Regenerate. Decisions bind fresh metadata and expiring single-use nonces; changed/dependent assets need new approval. No mandatory full-file fingerprint or operator-login panel is imposed. [Trusted-LAN contract](docs/REVIEW-TRUSTED-LAN.md), [per-asset contract](docs/PER-ASSET-REVIEW.md).
- Regenerate saves/confirms the exact queue row and calls shared Home doPush once; native regeneration is prepare-only. A saved-but-failed Push stays pending and is not blindly retried. [Regeneration wiring](docs/review-home-push.md).
- A parent's all-assets-approved state is **not final-video completion**. Final assembly/upload remains absent. User approval must precede any future final assembly.

Origin/Host checks are not authentication. Native credentials stay backend-only; browser direct media retains the original filename/subfolder/type/query encoding without a UI rewrite. Comfy playback may require its separate browser login; backend readability does not prove playback.

## Schedules and Morning Brief

The captured America/New_York schedules are Research 07:00, Scene 08:00, Dispatcher 09:00, Morning Brief 07:00 and Runner every 15 minutes in 22:00–23:45 and 00:00–06:45. They remain **inactive after import**. Home reads the published Runner/timezone/recognized eligibility contract: inactive shows paused, unknown fails unavailable and an empty queue retains its timer. No time guarantees completion.

Morning retains its full briefing JSON/context/template and deterministic validation. Delivery/response validation is disabled; the optional external Hermes receiver and `pockettts_brief_audio_v2` integration require separate configuration/authorization. No HTML Morning renderer, private route/token or cloned voice reference is distributed. Structured parser validation is not acoustic/speaker/ASR acceptance.

## Updates, backups and rollback

The UI updater reads public main/beta and never commits/pushes GitHub. Public read checks need no login. Static binds reload independently; startup-loaded backend changes require an authorized UI-only restart; actual Docker dependency changes require a reviewed rebuild. Preserve dirty source/index, `.data/index.html`, hand-managed version/override files, caches and component identities. `/updates/identity` component hashes matter more than a single source/version label for mixed deployments. The six-service example installs no host updater/socket registration; publishing beta does not activate Apply. [Updater](UPDATER.md), [bind-first activation](docs/updater-bind-first-activation.md).

Keep logs/executions/private env out of Git/support tickets. Make application-consistent backups of exact binds, private keys, n8n encryption key, modes/ownership and the import journal before authorized changes. Rotating the n8n encryption key can invalidate stored credentials. Roll back through a separate reviewed checkout/image set; reconcile existing overrides and recreate only authorized changed services. Never broad `down -v`, reset a dirty worktree, overwrite its index, discard caches or restore stale production rows.

## Actual verification and remaining gates

- UI baseline: **211 tests, 194 pass, 17 fail, zero skipped**; complete browser/backend build passes. The baseline is documented, not deleted or treated as green. [Beta limitations](BETA-LIMITATIONS.md).
- Node CLI tests/build pass independently, including source-derived VirusGPT helpers, strict service validation, cancellation, project/port persistence, private secret bytes in actual Compose/container inspection, owned-path rejection and a fixture importer exercising all eleven workflows/seven schemas.
- Isolated pinned source fetches, Compose validation, scoped doctor/fix and UI/Pocket image builds were exercised without starting the new stack. Importer transport fixtures are not native schema/import evidence. Stack CLI GitHub Actions run 38030760653 passed Linux, Windows and macOS on Node 20/24: 16 pass/1 unavailable-local-image Docker skip on Linux/Windows, 15 pass/2 unavailable-Docker skips on macOS; the local Linux run passed all 17 without skips. All six CI builds/help checks passed. This is CLI contract coverage, not six-service GPU deployment.
- No production restart, native table/workflow mutation, model download, generation, approval, acoustic acceptance, final assembly/upload or live updater activation occurred for this source publication.

For this app checkout, `npm test` and `npm run build` verify source. For the installer, run them in the separate stack repository. Legacy Python helper test results are historical and do not make Python a host prerequisite.

## Licensing

This UI declares [ISC](LICENSE). The derived CLI preserves VirusGPT's MIT attribution and this UI's ISC source notice. Pocket preserves upstream [MIT](full-stack/pockettts/LICENSE). Model, voice, image and third-party dependency rights are separate; no external FFmpeg source license or voice/model rights are granted by publication.
