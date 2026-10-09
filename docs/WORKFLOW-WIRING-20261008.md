# Native workflow wiring and bounded AI contracts — October 8, 2026 EDT

Production workflow changes were applied through n8n's API, published, and read back. Restricted original definitions and execution evidence are held outside Git in `n8n-table-ui-backups/workflow-wiring-20261008/`. This document is not a production generation or final-video acceptance claim.

## Tracking and dispatch

- Research, Scene Production, Shorts Dispatcher and ComfyUI Runner write `ExecutionID`, a sanitized previous finite/nonnegative `AttemptCount + 1`, cleared `LastError`, and a diagnostic `RequestKey` at their exact native Working claim.
- RequestKey is `workflowId:sourceTableId:rowId`. It is **not an atomic claim or deduplication guarantee**. Existing native read/insert/update locking has a concurrent-writer race; no distributed exclusion was invented.
- Acquired running_job records retain executionId, workflow and rowId and add ISO HeartbeatAt and LeaseUntil. AI stages have only an acquisition heartbeat. They do not pretend to have periodic heartbeat while the Agent is running.
- Runner records a genuine heartbeat after each successful bounded history validation, filtered by exact lock id, workflow, source row, executionId and Working status. LeaseUntil remains the original bounded execution deadline; a poll does not extend execution indefinitely. Its existing 10-second wait and 120-poll guard are retained; workflow execution timeout is 1800 seconds. Other stages have a 3600-second timeout.
- Local error writers set LastError and require the production row's ExecutionID to match the current execution. Shared Error Reset retains terminal-execution/live-owner checks and now writes the exact failed execution's LastError with an ExecutionID owner condition. No blanket unlock was added.
- Write Jobs Loop initializes future queue rows with AttemptCount 0 and null ExecutionID/LastError/RequestKey.

All four generation bypasses are native POST webhooks using explicit onReceived:

| Stage | Case-sensitive path | Body |
|---|---|---|
| Research | `/webhook/Research` | `{Id: positiveDecimalString, ByPass: true}` |
| Scene Production | `/webhook/Production` | same |
| Shorts Dispatcher | `/webhook/Dispatcher` | same |
| ComfyUI Runner | `/webhook/yt-Test` | same |

The response is an asynchronous acknowledgement, not completion or successful input validation. Invalid inputs can receive HTTP 200 and subsequently fail the native execution. No auto-retry is warranted after uncertain ACK/timeouts. Official native NoOp markers previously named Respond were renamed Finish with graph references updated. There is no Respond to Webhook in these generation graphs. CRUD remains responseNode with actual official Respond to Webhook success/400 nodes; its contract was not rewritten here.

## AI responsibility and model choices

| Stage | Primary | Fallback | Decision |
|---|---|---|---|
| Research/script creation | muse-glimmer:30b-q4_K_M-dflash | qwen3.8:latest | Retained existing search-capable primary and tested fallback; primary speed/factual superiority is not inferred. |
| Full Scene Production | qwen3.8:latest | muse-glimmer:30b-q4_K_M-dflash | Qwen is the previously coverage/type-compatible full-scene candidate. Its tested think=false, numPredict=4096, numCtx=8192 options are used. Muse is installed but not claimed a validated fast full-scene fallback. |
| Shorts Dispatcher | muse-glimmer:30b-q4_K_M-dflash | qwen3.8:latest | Retained: no comparative Dispatcher winner was measured. Existing fixed ten-second video-job contract remains. |

Research preserves the complete actual output object, including full_voiceover and scenes, as serialized Script. The legacy read of absent `output.script` was removed. Scene's manual parser now contains actual JSON Schema rather than a sample object. It requires supported generation types and timeline ranges; a minimal appended clarification specifies cumulative START-END, exact source narration/timing and ordered scene coverage without replacing the user's existing prompt.

Post-parse native Code checks require complete fields, nonempty scenes, sequential IDs, duration consistency and full narration. Scene also compares every voiceover and timeline against the complete supplied Script. Missing facts or changed content fail visibly; no missing-negative-prompt or other field defaults are synthesized. Free AI auto-fix is disabled in all three structured parsers because measured models attempted missing-hook synthesis. Existing Nemotron model configuration is retained but disconnected from unsafe auto-fix; **no new syntax-only formatter pipeline was installed**. A fact-preserving syntax repair stage needs an exact source-object comparison before it can be safely enabled.

Success-only stage transitions remain Research → Script → Scenes → Review. Manual Review remains mandatory. No automatic approval, final assembly or upload path was invented.

## AI_Run_Metrics coverage

Successful Agent return/parse events pass through timing/content validation, an append-only native Data Table insert, and a restore/validation continuation. DurationMs measures elapsed wall time across that stage's actual native Agent/parser/tools/retries, not tokens/sec or TTFT. ValidOutput reflects explicit content checks, not parser success alone. An invalid returned object is recorded false and the production continuation then fails.

Model is taken only from actual returned response metadata; absent metadata is recorded `unknown`, not the configured primary. Native execution evidence can establish successful fallback model-node invocation separately. This installation's parsed outputs did not expose the model tag, so test metric records correctly say unknown.

Metrics append is best-effort and logs its error without destroying a valid production result. The continuation still throws on an invalid AI event. Parser/model failures that never return an Agent output **do not yet produce an AI_Run_Metrics row**; Runner has no AI call and does not invent one. Production metrics were not populated from old benchmark results.

## Real verification

- Three disposable native claim/error/heartbeat executions 58103–58105: previous counts 0, 5, -1 became 2, 7, 2 after two actual claims. LastError cleared on claim; wrong execution owner updated no row; owned terminal error and ISO heartbeat/lease persisted. Exact test workflow/table cleanup read back 404.
- Thirty-two native no-write POST probes: eight input cases across four fresh bypass normalizers. Valid Id=1 succeeded; missing, zero, negative, fractional, unsafe integer, boolean Id and false ByPass failed native execution while onReceived returned ACK 200. All probe workflows were deleted and verified 404.
- Actual native Research 58106 returned valid full script after primary/fallback node runs: 260.573s HTTP, metric DurationMs 260510. Forced-missing-primary Research 58149 succeeded through qwen fallback; real metric DurationMs 107717.
- Initial new Scene 58136 returned `4s` durations. Content validation correctly recorded ValidOutput=false and blocked continuation. The schema/prompt range clarification was then applied and independently read back.
- Actual native Scene 58159 passed full source coverage, exact narration/timing and supported types: 49.502s HTTP. Disposable metric insertion persisted its actual measured event. All AI test clones and metric tables were removed and verified 404; no production job dispatch or ComfyUI /prompt was initiated by these scripts.
- Best-effort metric-failure replays 58240/58241 used the captured real 58106 event, not a new model call: unavailable metric table preserved a valid response (HTTP200/success); an invalid event still failed (HTTP500/error). No replay metrics were written into production.
- `node --test workflow-wiring-contract.test.cjs`: six tests passed against retained real output fixtures and live validation code, covering complete facts, missing hook, changed durations/narration, dropped/reordered scene coverage, unsupported types and honest unknown-model attribution. On the fresh beta worktree, the complete `npm test` suite passed **144/144** and `npm run build` passed.

## Boundaries and concurrent activity

No production media rendering, invalid-template submission, final assembly or upload was tested. Parser policy was made fail-closed, but arbitrary factual hallucination in a newly authored Research script is not mechanically proven absent by structural checks. Scene coverage checks are exact against its source.

A separate production Research webhook execution **58229** appeared while this task's no-write clones were being tested. At observation it owned source row 1 and the corresponding running_job record. This task did not send that production request and did not cancel, unlock or restore it. Therefore a final global assertion that all original production fields stayed unchanged or running_job remained empty would be false. Preserve that live owner and distinguish concurrent user/other-controller activity from the isolated tests.

Private progress files are durable recovery points. All installed credentials remained attached to their existing native nodes; no secret-bearing definition was committed here. UI changes and CRUD endpoint integration testing are owned by the separate UI task.
