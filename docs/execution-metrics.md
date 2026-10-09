# Execution tracking and AI Run Metrics

Home displays workflow-managed ExecutionID, AttemptCount, LastError and RequestKey from actual rows. Jobs adds those read-only columns to each of its seven existing Type stages. Editors show telemetry read-only and exclude it from save patches, including forged DOM input. The existing Jobs Type dropdown remains a separate exact-row Type-only operation; it never dispatches generation.

New creates only one Production Job Idea with AttemptCount=0 and blank LastError, ExecutionID and RequestKey. A request key is workflow-generated, not a browser idempotency claim. Existing scheduled consumers may pick up pending ideas. Uncertain creation stays locked with its draft intact; no automatic retries or dispatch.

Jobs includes an independent **AI Run Metrics · read-only** expandable section, not an eighth canonical Type. Live API discovery resolved AI_Run_Metrics to `MgzHSOR57oYxcmZq`, with Task, Model, ExecutionID, DurationMs, ValidOutput, Error and JobID. Refresh uses existing same-origin POST yt-get and native cursor pagination with limit 250. It performs no model calls. Durations are measured milliseconds rendered as seconds; absent or malformed values remain Pending / unknown. Execution links use the LAN n8n execution route and contain no credentials. Failed loads clear stale metrics rather than claiming success.

## Evidence and boundaries

The deployed proxy was tested unchanged against isolated mock upstream: all four dispatch routes are POST with exactly `{Id:decimalString,ByPass:true}` and no administrator key. Live invalid-route/ID/origin/body probes were rejection-only, never real generation. A uniquely named disposable table exercised create, write, two-page get, Type-only update/readback and remove; authenticated metadata readback verified exact cleanup HTTP404. Production Home and Jobs rows were byte-equivalent before/after the audit. Read-only metrics contained zero real records at verification; browser nonempty metrics were clearly intercepted test fixtures.

Missing `/health` and `/healthz` return 404; unknown table reads return native HTTP500, not structured table-not-found. Origin restrictions are not user authentication. Review decisions remain authenticated manual-editor only; final assembly/upload are not verified. CRUD Type preflight/readback is not atomic CAS; external writers can race. Generation, AI accuracy, lock ownership and metric writes belong to the production-workflow controller and were not changed here.
