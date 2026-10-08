# Home output deletion — tested source, production safety gate closed

No production output/row deletion, Docker restart, updater Apply, service install, compose edit or HTML-override deployment was performed. This is **not safe to activate for production deletion yet**: current writers do not share an atomic reservation or directory-relocation exclusion. The completed transport/UI/adapters are exercised against isolated fixtures; the production entrypoint deliberately returns `available:false` and rejects deletion. There is no environment switch that bypasses this gate.

## Source and contracts

- `home_delete.py`: fresh exact row/URL/Completed/Working checks, paginated queue ownership checks, shared-path rejection, durable intent before unlink, file-first then exact-row deletion, absence verification, retry only from matching table/root/URL intent. Nullable Working is rejected: the exact native delete predicate requires strict false.
- `home_delete_backend.py`: durable `IntentStore`, native `N8NAdapter`, bounded batch `Application`, authenticated HTTP helper and runnable entrypoint. The helper binds **127.0.0.1:3461 only**, or an explicitly configured private Unix socket; it has no public arbitrary URL/path/table/delete route.
- `proxy-server.cjs`: only GET `/home-delete/capabilities`, GET `/home-delete/login`, POST `/home-delete/delete`; fixed loopback helper or configured Unix socket. Other Home routes/methods return 404. Exact same-origin mutation required. Backend HMAC secret and browser credential files must be private, regular, non-symlink files owned by the serving UID. HMAC secret >=32 bytes; browser credential is `home-delete:<at-least-32-character-passphrase>`.
- Browser authentication uses HTTP Basic through a TLS connection or a local trusted tunnel, not a key in browser JS. `/home-delete/login` invokes the browser's native challenge. The existing LAN-only HTTP deployment is deliberately rejected for this feature. TLS termination is accepted only with an explicit exact trusted proxy IP, its `X-Forwarded-Proto:https`, and an explicit HTTPS origin; forwarded headers alone are never trusted. Do not set the trusted proxy IP to a client range or general Docker gateway.
- Helper requests use SHA256 HMAC over method, exact route, timestamp, random nonce, body digest; 30-second clock window, replay rejection, bounded payload, no redirects, no API-key forwarding to browsers. Nonce memory is bounded and fails closed at capacity rather than forgetting live replay IDs; a helper restart invalidates in-memory replay tracking, so a captured authenticated request within the 30-second window is a residual restart-replay limitation. A single-threaded listener and batch mutex serialize helper requests, **not external workflow writers**.
- `index.html`: Home-only completed-output checkboxes, Select All, selection snapshot confirmation with IDs and unmodified URLs, one supported helper request, successful-row selection removal, failed-row selection retention and separate file/row/failure counts. Controls start disabled and remain disabled unless authenticated backend capabilities explicitly return `available:true`. Jobs Type dropdowns, direct media URLs, workflow contracts and unrelated updater behavior are preserved.

## Durable and filesystem behavior

Intent directory 0700, records 0600; O_NOFOLLOW reads, owned/private file checks, temporary write + fsync + atomic replace + directory fsync. Before unlink, intent includes exact table/root/URL/file identity. After unlink, output parent is fsynced and the successful file phase is durably recorded before row deletion. Failed native row deletion retains a retry intent. A verified absent row on retry is treated as completed only if the matching durable file-deleted intent exists and the file remains absent. Missing file without that intent never authorizes row deletion.

A crash between unlink and the second intent fsync intentionally leaves an unconfirmed file phase and requires operator reconciliation; automatic row deletion is not guessed. Files/rows counts represent verified phases, not cross-system transactional rollback. Filesystem deletion and n8n deletion cannot form one atomic transaction.

Output resolution uses only server-configured root and fixed authorities at port 8188: `10.0.0.157`, `127.0.0.1`, `localhost`, `comfyui`; path `/view`; no redirects or arbitrary browser root. One query decoding pass, duplicate/unknown fields rejected, traversal/absolute paths/symlinks/hardlinks rejected, regular image/video file only. Filename/subfolder preserved; browser media URLs are never rewritten.

**Verified missing-type default:** read the installed primary ComfyUI `/root/ComfyUI/server.py`, `view_image`: when annotated filename did not select another directory, `request.rel_url.query.get("type", "output")` selects `folder_paths.get_directory_by_type(type)`. Library defaults remain strict unless `verified_default_output=True`; the verified entrypoint uses true. Explicit input/temp and filename annotations not ending in the allowed image/video suffix remain rejected. Local source evidence is `/home/dad/.hermes/cache/terminal-output/out-1791444151-11499-8c30.log` (view handler around lines 545–580).

Root dev/inode captured, component directory opens O_NOFOLLOW, ancestry checked by parent dirfds against root identity, inode rechecked before unlink and ancestry checked before/after it. This detects root replacement and an already-relocated open directory. **It cannot stop rename between final check and unlink**. It detects some races after the fact, not a guarantee of root confinement against concurrent directory movers. Output-tree ownership/protection and shared writer exclusion remain mandatory.

Known mount remains `/home/dad/Config/data/comfyui/storage-user/output` -> `/root/ComfyUI/output`. No permissions were broadened or mount added. Current generation output tree is shared with the root-running ComfyUI container; do not falsely call it exclusively owned by this helper.

## Native n8n API

No `/webhook/yt-remove`: that removes a table. Native DELETE `/api/v1/data-tables/{tableId}/rows/delete` has compact JSON encoded **once**, `returnData=true&dryRun=false`, AND of exact positive `id`, original `URL`, `Completed=true`, `Working=false`. Verify returned exact ID and fresh full-pagination row absence. All row/lock/workflow/execution pagination follows `nextCursor`, rejects missing/malformed envelopes, duplicate IDs/repeated cursors and excessive page counts, and fails closed on API failure. Global busy checks read all running_job locks and global executions with statuses running, waiting and new, not just the selected owner. This intentionally blocks on ambiguous legacy locks too. Fresh reads reduce risk but **are not atomic reservations/CAS**.

The current owner contract was merged from origin/beta `1e0d840`, including captured workflowId/currentId/lockId/executionId and exact allConditions cleanup. Read-only live API audit is `docs/home-delete-live-lock-audit.json`; current four owners have matching published version IDs. Their dataTable insert/delete lock nodes do not implement shared atomic generation/deletion reservation. Current global busy read returned true; nothing was unlocked or repaired.

### Required shared protocol before production enablement

1. Use one atomic authority for a **global output-tree writer/delete reservation** plus a per-row key `(sourceTableId,rowId)`; bare numeric rowId is not unique across tables. Record workflow ID, execution ID, acquired token and phase. A read-then-dataTable insert is not atomic.
2. Every scheduled/manual/webhook/helper generation entry must atomically acquire through that authority before row read/Working write/output work, retaining reservation through output writes/rename and terminal cleanup. Deletion takes the same reservations through final file and native-row readback. All directory writers and direct ComfyUI submissions must participate or be excluded by protected permissions/access policy. A UI dispatcher-only mutex does not cover schedules/direct/manual callers.
3. Crash recovery must retain uncertain reservations; release only by exact token with independently verified terminal execution ownership, never age/TTL alone. Reuse current captured ownership fields, not an invented lock ID or broad unlock.
4. Verify every live published entrypoint and actual output writer participates, then supply an independently reviewed exclusion provider to `Application`. Main currently supplies none, so starting the helper **does not** enable deletion. Repeated reads or setting an environment variable must not impersonate this proof.

Changing the shared production workflow/writer contract exceeds authorization for source-only selected Home deletion. It was not done. There is consequently **no honest one-command production enablement** in the current contract; parent approval and this integration are prerequisite work, not just a service restart.

## Real test evidence

Run from `/home/dad/.hermes/cache/scratch/home-safe-delete`:

```sh
npm test
npm run build
python3 -m unittest discover -p '*_test.py'
python3 home_delete_integration.py
```

- Full JS suite: 119 tests passed, including merged workflow-contract and Type-dropdown suites. Entire inline script and proxy syntax build passed.
- Python: 23 tests passed: URL/default type, symlinks/hardlinks, replacement/relocation, fresh active/shared/incomplete/stale checks, file-first/retry/absent-row reconciliation, private durable storage, pagination rejection, all active statuses, HMAC replay/tamper, inactive capabilities.
- `home_delete_integration.py` creates its own random disposable table, 3 rows and isolated temporary output/intent/socket/credential/proxy directories. It uses the real authenticated proxy -> HMAC Unix helper -> actual native n8n delete adapter; only execution/exclusion is fixture-local with exclusively controlled writers. A real three-page read (limit=1) succeeds. Batch gives 2 verified file phases, 1 deleted row, 1 injected row-transport failure; retry deletes that exact row; unrelated third row/file preserved. Fixtures are removed and exact table GET 404 verified. Auth 401 and cross-origin 403 verified. Real read-only global execution/lock adapter also succeeds. Recorded latest run: `docs/home-delete-integration-evidence.json` (table `G4IS2XP1RpFJWg58`, cleaned up).
- Real browser loaded the full source against a local fixture HTTP server, not production: select-all, two-row exact snapshot confirmation, single helper request, file-before-row event sequence, partial counts `2 files / 1 row / 1 failure`, failed row remains selected. Reload with capability false disables both buttons. Fixture harness is outside Git at `/home/dad/.hermes/cache/scratch/home-delete-browser-server.py`; disabled screenshot `/home/dad/.hermes/cache/scratch/home-delete-capability-disabled.png`. Browser interception is fixture evidence, not actual production media playback or workflow locking.

## Smallest deployment proposal — approval required, not applied

Existing UI container is on `table-ui_default` bridge, not host networking. Host loopback 3461 is therefore **not reachable from the current UI container**. Do not expose the helper on 0.0.0.0, mount the output tree into the UI, use the Docker socket, or change the entire stack to host networking.

Use the already-mounted **dedicated UI-updater run directory only as a transport directory**, with a separate deletion subdirectory/socket. The current bind `./n8n-table-ui-update-state/run:/run/ui-updater:ro` lets the root-running UI connect to a host-owned 0600 socket without additional output mounts. Do not change updater commands, worker or socket. Place separately owned private HMAC copies (identical bytes) for host helper UID and container UID, plus container-owned browser-auth file, in that dedicated protected directory outside .data and static assets. Container root and host dad need separate ownership-compatible copies; do not chmod secrets world-readable.

After parent approves and the shared atomic writer protocol is implemented/reviewed:

- Authorize host helper start using explicit output/intent/socket/table/lock/secret configuration, persisted API credential in host-only environment, and protected output-tree writer policy. No privileged shell/Docker capability needed by helper. Manual foreground command is `python3 /home/dad/.hermes/cache/scratch/home-safe-delete/home_delete_backend.py` with `HOME_DELETE_OUTPUT_ROOT=/home/dad/Config/data/comfyui/storage-user/output`, exact verified table IDs, and private intent/secret/socket paths. Today this remains unavailable by design.
- Add only `HOME_DELETE_CONTROL_SOCKET`, `HOME_DELETE_SECRET_FILE`, `HOME_DELETE_BROWSER_AUTH_FILE` and, if chosen, exact trusted TLS proxy IP/origin to UI environment (a reviewed .data/env drop-in is sufficient; do not place secret contents there). Existing run-directory mount can carry the private files/socket; **no compose change is required for that transport**. Authenticated access still needs approved TLS/tunnel routing, not assumed LAN authentication.
- Integrate the tested proxy source into the actual served checkout without clobbering unrelated work; parent must explicitly authorize the **UI-only** restart needed to load changed proxy/env. The smallest existing deployment restart is `docker compose -p table-ui -f /home/dad/Config/docker-compose.n8n-table-ui.local.yml restart n8n-table-ui`; **do not run it on current source/config**, and it does not implement the missing writer protocol. No full Apply/rebuild or other service restart is proposed.
- Merge/back up current `.data/index.html` operator override before any authorized in-place HTML deployment. Do not publish the entire stale override, change full deployment identity, or claim source push means activated backend. Read back served identities and capabilities after activation; only then test with a separately authorized disposable output under the approved protected policy.

Approvals still needed: shared workflow/ComfyUI writer coordination/access policy, authenticated TLS/tunnel route, scoped host helper/config/private files, actual proxy source integration and UI-only restart, and separately any production output deletion test. Prior denied Docker restart/full Apply remains binding.
