# Ollama enhancement configuration

Config → **Ollama enhancement** lists every installed exact tag from server-side `GET /api/tags`. The current service can report duplicate tags; the UI deduplicates exact names, sorts them, and advertises the unique count. There is no pagination, hidden limit, model-name rewriting, pulling or benchmark of every tag.

Select **Default enhancement model** and use the existing **Save** action. Only a changed model is posted. The server atomically persists `{ "defaultEnhancementModel": "<exact installed tag>" }` in `.data/ollama-enhancement-settings.json`, mode 0600. Browser storage does not determine enhancement's model. The initial/default selection remains the existing native `qwen3.8:latest`.

Routes:
- `GET /ollama/settings`: saved default and read-only connection details.
- `GET /ollama/models`: `{models: [exact tags], count, baseURL}`.
- `POST /ollama/settings`: accepts only the typed `defaultEnhancementModel` key, with exact configured trusted-LAN Origin/Host matching. Unknown tags and additional keys are rejected. Origin checking is not authentication; do not expose this app publicly.

Discovery defaults to the fixed existing operator LAN service `http://10.0.0.157:11434`; the distributable Compose explicitly sets server-only `OLLAMA_BASE_URL=http://ollama:11434`. This operator-managed origin rejects URL credentials/query/path overrides. No client-selected destination, credentials or redirect following is accepted. Generation retains the existing encrypted n8n **Ollama account** credential. Ensure this credential points at the same Ollama service when installing; the displayed endpoint is not an editable replacement credential. Changing the service requires operator changes to the fixed server connection and the n8n credential together, not a browser URL proxy.

Only Review's `Prompt Enhancement Ollama` model node changes. The private backend ignores any browser-supplied enhancement model, reads the persisted selection and freshly verifies it against installed tags immediately before the native enhancement call. Native `Review Request` carries this trusted `enhancementModel` through `Build Prompt Enhancement Context`; the model node uses `={{ $json.enhancementModel }}`. Manual-editor enhancement without a supplied model retains the original `qwen3.8:latest` fallback; it does not read Web UI settings. No other AI workflow or global provider is changed.

Connection failures and missing saved tags do not pick another model. Config retains the choice and shows an unavailable/missing message. A selected model that cannot chat or produce the required enhancement schema fails visibly and leaves the original draft unchanged. Enhancement remains draft-only; saving Config does not generate assets or mutate production rows.

## Runtime packaging

`review-backend.cjs` requires adjacent `ollama-settings.cjs`. Ship both modules with `proxy-server.cjs` and `index.html` (Docker image COPY or adjacent bind mounts). The current local deployment loads both from the writable `/app/.data` bind and restarts only the UI after backend changes. Keep the runtime settings, Review secret, environment drop-in and other private state out of Git. `/updates/identity` includes startup-captured `ollamaSettingsHash` independently from server, Review-module and served-HTML hashes.

The public packaging worker must include both backend modules in the image or documented mounts; the older Dockerfile copies neither. Keep existing Home timer `.data/home-next-run-runtime` and Review private transport secret setup intact. Do not ship live `.data` state or credential secrets.

## Verification

Focused tests: `node --test ollama-settings.test.cjs per-asset-enhancement.test.cjs review-lan.test.cjs review-home-push.test.cjs`; build: `npm run build`.

Live verification found **11 unique installed tags from 12 raw entries**, including one exact duplicate `gemma4:e4b`. Backend count, tag set and browser options match. Real browser Save/reload persisted `granite4.2:latest`, then restored `qwen3.8:latest`; intercepted failures retained the selection. Desktop and 390px Config views verified. Genuine isolated native executions used both models against the same real prompt fixture; independent draft schema validation passed, fixture rows/timestamps were unchanged and every clone/table was deleted with GET404. Evidence is private under `/home/dad/Config/production-readiness/ollama-enhancement-config/`, not a release asset. The dirty checkout's full test suite retains 22 prior-contract failures; do not describe it as clean.
