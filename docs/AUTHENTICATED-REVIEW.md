# Authenticated inline Review (local deployment)

The current LAN Web UI stays at `http://10.0.0.157:3458`. No n8n core assets, login page, password handling, JWT creation or API-key impersonation are used.

## Connect your existing session

1. Open native n8n on **the same hostname** at port 5678 and log in normally as an owner/admin.
2. In that n8n tab's developer console, run `copy(localStorage.getItem('n8n-browserId'))`. Paste **only that existing browser ID** into Review → Connect existing n8n session. Never paste passwords, cookies or tokens.
3. Click **Connect existing session**. The ID is kept only in page memory and the textarea is cleared. Connection expires within 10 minutes or on page reload. n8n's existing HttpOnly cookie is separately required; the ID alone grants nothing.
4. For a production, click **Inspect / lock fresh snapshot**. The displayed script, scenes and original asset URLs are replaced by the exact fresh native response. Inspect every asset, then choose Approve or Reject and confirm. A changed snapshot, file bytes, expired/used nonce, missing cookie, logged-out session or disallowed role refuses the decision. On an ambiguous/error response, inspect again; do not blindly retry.

## Server contract

Only POST `/review/session`, `/review/list` and `/review/decision` exist. Every request requires an exact configured UI Origin plus matching Host, the native `n8n-auth` HttpOnly cookie and the original `browser-id` header. Native GET `/rest/login` is called against the fixed configured n8n destination with only that cookie and browser ID; no administrator REST API key is forwarded. Only native `global:owner` / `global:admin` roles are accepted. The connection nonce is bound to native user ID, cookie, browser ID and origin; per-job decision tickets expire and are consumed before I/O. Native identity is revalidated after file downloads before writes.

The private native Review webhook uses a separately generated encrypted header-auth credential, with a mode-0600 `.data/review-secret` matching server-only file. The UI never receives it. Public Data Table CRUD denies mutations/removal of the production Review_State table; read-only listing is still available. Native private webhook's installed auth refusal is HTTP403; absent native session on the UI routes is HTTP401. Native Review does not persist execution request data, avoiding stored private transport header values. Fixture execution exports are redacted and their native executions removed by exact workflow deletion.

Snapshots include source Type/Status/Script/Scenes plus all sorted output IDs, original URLs, flags, Params, prompts and SHA256/byte length. Media downloads are streamed and limited to the fixed ComfyUI host/port `/view`, no redirects, no alternate destinations, max 64 assets, max 256 MiB per asset and two concurrent review requests. The private ComfyUI bearer token remains server-side; original direct browser URLs and Open video fallback links are unchanged. Browser authenticated playback is independent and not established by server-side download tests.

Native table persistence is **read-then-write, not atomic CAS**. A concurrent external writer can race validation/persistence; do not claim distributed exclusion. No final assembler exists, no final dispatch is connected and `FinalGenerationAllowed` is always false. Any future assembler must freshly revalidate the approved source/output metadata and file hashes immediately before assembly; these records alone do not grant a launch.

## Local activation and evidence

`review-backend.cjs` is copied to the existing `.data` bind; the bound proxy loads and independently hashes it. Only the UI container was restarted; no image pull, main release, updater Apply, n8n restart, generation or production approval occurred. `/updates/identity` reports startup `serverHash`, `reviewBackendHash` and served `uiHash`. Historical updater Git anchors are not relabeled as this dirty mixed patch. Preserve concurrent Home schedule changes and operator overrides.

Tests: `node --test review-*.test.cjs` and `npm run build`. Real native fixture tests are a separate operator script under `/home/dad/Config/production-readiness/review-ui-integration/`; they use uniquely created disposable tables/workflows, actual existing ComfyUI image bytes, and exact GET404 cleanup. Browser decision tests intercept only Review routes and are explicitly mocks, not proof of a genuine logged-in browser decision. See RESULT.md there for exact current counts, publication IDs, deployed hashes and the remaining user connection check.
