# Current explicit Push contracts (2026-10-08)

Fresh n8n API published graphs, not historical workflow fixtures, are authoritative.

| UI action | Workflow ID | Published bypass HTTP |
|---|---|---|
| Research | x4AirppgK2nvJGuf | POST /webhook/Research |
| Script | TWMnQqnEwD7qTfbp | POST /webhook/Production |
| Scenes | M9SnVr1xBYNDwJDF | POST /webhook/Dispatcher |
| Home ComfyUI | MZK3Pv01FHqZbooz | POST /webhook/yt-Test |

Browser transport remains POST `/dispatch/research|scene|dispatcher|runner` with exactly `{rowId:"12"}`. Backend emits exactly `{Id:"12",ByPass:true}` as POST body, no query and no REST key. No URL/method override or CRUD pre-lock fallback exists. GET dispatch assumptions are obsolete.

Review is authenticated manual-editor-only (KMtoCzHcKMiTKNvZ), with no public bypass. Video Review and Uploaded have no generation bypass/final-assembly implementation in the current inventory. Type editing and idea creation remain CRUD-only. Existing scheduled paths remain enabled.

Push safety adds actual row-source table checks, completed/working blocking, supported Home types, canonical Scenes routing and per-table/row duplicate suppression shared between Home and Jobs. After attempted dispatch the document retains the pending key: ACK/timeout is not completion; inspect execution before reloading and retrying. This is browser duplicate suppression, not a backend distributed lock or durable idempotency.

Verification: 72 local executions of fresh published Normalize Bypass Context code; four disposable native no-write probes received HTTP200 workflow-start acknowledgements and were deleted with GET404. Native probes contain only fresh webhook/normalizer nodes plus an unconnected Respond node; they do not read/write production tables or run generation. ACKs do not prove completion or connected Respond-node compatibility. Local proxy tests assert exact POST paths/body and no credentials against mock upstream. Production dispatch was not called.

Deployment: HTML can be patched without restarting. Backend source changes require an explicitly authorized UI-service-only restart; do not use full updater Apply or interpret HTML deployment as backend activation.
