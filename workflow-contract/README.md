# Captured pipeline execution and error contract

Implemented and API-readback verified October 8, 2026. This directory contains sanitized snapshots of the actual production Code nodes/lock filters, executable regression tests, publication versions, safe-clone evidence and a read-only live stalled-job audit. Full recovery exports, credentials and production row contents are deliberately outside Git at `/home/dad/n8n-contract-backups/20261008-025929/` (restricted permissions).

## External transport

Only an explicit UI **Push** dispatches the selected existing row. A Type dropdown writes only that row's Type through CRUD and does not dispatch, pre-lock, clone, approve or generate. The UI retains its existing same-origin `/dispatch/research|scene|dispatcher|runner` proxy and legacy upstream transports; this workflow change does not require backend activation, Docker restart or updater Apply.

| Workflow | Uniform transport | Preserved legacy transport |
|---|---|---|
| Research | POST `/webhook/Research`, JSON `{"Id":"7","ByPass":true}` | GET `/webhook/Research?Row=7&ByPass=true` |
| Scene Production | POST `/webhook/Production`, same JSON | GET `/webhook/Production?RowID=7&ByPass=true` |
| Shorts Dispatcher | POST `/webhook/Dispatcher`, same JSON | GET `/webhook/Dispatcher?RowID=7&ByPass=true` |
| ComfyUI Runner | POST `/webhook/yt-Test`, same JSON | POST `/webhook/yt-Test`, JSON `{"Id":"7"}` |

`Id` is accepted in legacy GET queries too. Positive safe decimal integers only: reject zero, negative, leading-zero, fractional, exponent, unsafe integer and conflicting Id/Row/RowID values. Query/body are merged deliberately because GET webhook data may include an empty body object. Research/Production/Dispatcher require explicit ByPass true (`true` or legacy string `"true"`); Runner preserves its historical Id-only POST. Explicit ByPass false is rejected. Broad Runner ALL/Type dispatch routes are no longer reachable from its webhook: exact Id selection only.

Every webhook uses `onReceived`; no Respond to Webhook node remains in these four generation workflows. Immediate HTTP 200 `{"message":"Workflow was started"}` acknowledges receipt only, not success/completion. Invalid inputs terminate asynchronously before row reads/work/locks; an immediate ACK is not a structured HTTP validation result. The existing proxy/client must validate selected IDs and inspect execution failures rather than interpreting acknowledgement as completed generation.

Same-path distinct-method GET/POST registration was proved against disposable clones before publication; legacy GET has not been removed. Selected-row webhook paths do not run startup cleanup or scheduled Type selection. Exact reads use id equality/limit 1, reject Working=true, and preserve nullable unlocked flags. Scene's manual Type gate is bypassed only for this normalized exact-row route; its required Script content remains validated.

## Internal context and lock ownership

Each selected/scheduled row captures:

```js
_context = {
  workflowId: String($workflow.id), // actual owning n8n workflow
  currentId: selectedRow.id,        // production/job table row
  lockId: null,                    // populated from acquired running_job.id
  source: 'webhook' | 'schedule',
  executionId: String($execution.id)
};
```

The lock table retains its existing `workflow`, `rowId`, `status` fields. A non-destructive API column addition adds nullable string `executionId`. Existing locks/fields/timestamps were verified unchanged, with the new field null. New lock inserts record actual workflow/current row/current execution before Working=true or generation. `Capture Acquired Lock` validates acquired ownership and returns the original row with its exact newly acquired lock ID, not the overwritten lock JSON. No fixed/shared numeric lock ID exists.

All lock deletion filters are `allConditions`: `id = _context.lockId AND workflow = _context.workflowId AND rowId = _context.currentId`. Selected-row updates use currentId, never running_job.id. Captured accessors survive table overwrites. Every production Code output explicitly preserves n8n pairedItem linkage, including synthetic missing-frame skip results and loop iterations; this avoids losing captured ownership through multi-row table/frame outputs.

Unsafe startup stale-lock unlock/delete chains have been disabled; scheduled triggers go directly to the existing pending readers and canonical stage gates/loops. Pending means strict Completed=false AND Working=false. Canonical aliases remain Research/Ideas -> Research, Script -> Scene Production, Scenes/Scene -> Dispatcher; Runner schedules only its three supported canonical queue types/explicit underscore aliases. Future transitions remain Research -> Script, Scene -> Scenes, Dispatcher -> Review/Queued. Existing rows are not migrated by these workflow definitions.

## Shared error workflow

Actual settings mappings:

| Workflow | ID | errorWorkflow |
|---|---|---|
| Research | x4AirppgK2nvJGuf | buw89dDrqgXnuCDz |
| Scene Production | TWMnQqnEwD7qTfbp | buw89dDrqgXnuCDz |
| Shorts Dispatcher | M9SnVr1xBYNDwJDF | buw89dDrqgXnuCDz |
| ComfyUI Runner | MZK3Pv01FHqZbooz | buw89dDrqgXnuCDz |
| Write Jobs Loop | OxJfxFqOABCWu6Q6 | buw89dDrqgXnuCDz |
| Data Table CRUD | 5x0Dy4rbBRZfov7K | buw89dDrqgXnuCDz |
| Review — Manual Approval Gate | KMtoCzHcKMiTKNvZ | buw89dDrqgXnuCDz; remains inactive/manual |
| ComfyUI Error Reset | buw89dDrqgXnuCDz | none; never self-references |

Dispatcher calls Write Jobs Loop and Data Table CRUD; Scene calls Data Table CRUD. Shared helpers retain all existing trigger/credential/parameter semantics: error settings only, no fabricated generation webhook. Helper errors can propagate into the owning parent execution; Error Reset's mutating recovery allowlist covers only the four workflows that actually acquire pipeline locks. A helper's standalone error has no captured pipeline ownership and cannot unlock production rows.

Review remains authenticated editor-only manual approval with unchanged snapshot/readiness logic. n8n manual editor execution does not fire ErrorTrigger; setting errorWorkflow does not prove manual error-trigger delivery. No review/generation/assembly endpoint was invented.

Archived inactive ComfyUI Job Submitter `FHfySQklUCmatW2B` was inspected, is not called by the production graph, and is excluded. Its API refused PUT with `Cannot update an archived workflow`; it was not revived. Other Fiverr, Trend-to-Gig, digest, reply, FFmpeg sample, generic/test and historical probe workflows are excluded as nonpipeline or read-only/archived. Fresh full workflow graph inspection found no additional callers of the four production generation workflow IDs/endpoints.

### Error recovery safety policy

Error Reset derives `eventworkflowId` from ErrorTrigger's actual workflow.id, never its own `$workflow.id`. It freshly reads that exact failed execution with data and actual running/waiting/new execution lists. Status must be error/crashed/canceled, stoppedAt present, waitTill absent. running/waiting/new/unknown/success are not failed-terminal ownership evidence. An active owner ID, incomplete execution-list pagination or missing/mismatched execution metadata blocks recovery.

Ownership comes from the failed execution's most recent captured acquired context; historical `Set Running ID`/`Insert row` output remains supported as exact acquisition evidence. No latest-lock/workflow-only heuristic exists. Error Reset then reads the live lock by exact lockId + eventworkflowId + currentId and validates its executionId against the failed event. A null legacy executionId is accepted only with exact captured acquisition proof and no active owner-workflow execution. Missing/ambiguous/orphan metadata is report-only. Both job unlock and exact lock deletion are downstream of this live ownership guard.

Recoverable Scene Retry remains recoverable. Fatal Research/Dispatcher/Runner local failure branches preserve exact-row/exact-lock cleanup and explicitly StopAndError instead of swallowing continueErrorOutput. Error Reset will not re-delete a lock already removed by local cleanup. No scheduled mutating sweeper was added; stale age alone is never authorization to unlock.

## Evidence and limitations

Run `node --test workflow-contract/*.test.cjs`; the root `workflow-contract.test.cjs` integrates these tests into `npm test` without modifying the shared index. Tests cover overwrite/linkage, row/lock ID collisions, same row ID in different workflows, exact deletion/no crossunlock, invalid IDs, scheduled loop identities, legacy/current error metadata, event workflow IDs, running/waiting/new block, terminal exact ownership and ambiguous/orphan report-only behavior. Existing UI tests cover Type-only updates without dispatch.

Safe disposable clones proved all seven GET/POST transports with real read-only row selection and mocked lock acquisition (executions 57329–57335), an isolated ErrorTrigger failed caller -> read-only handler (57362 -> 57363), and two scheduled-loop contexts across mocked table overwrite/frame skip (57395). All disposable workflows were deactivated/deleted and exact 404 readbacks verified. No real lock insertion, deliberate production failure, production generation or approval request was used for tests.

Seven active changed workflows were published and checked by versionId == activeVersionId and exact published nodes/connections; manual Review was saved inactive. Original credential references and parameter maps are preserved. See publication-ledger.json for exact versions. Full before/after backups and original errorWorkflow settings are outside Git.

Read-only live audit: zero Working=true Shorts_Production rows, zero Working=true ComfyUI rows, zero active/running/waiting/new pipeline owner executions. Two pre-existing Scene locks (lock 1 -> row 12; lock 2 -> row 11) have no executionId and remain report-only/untouched. The numeric legacy lock values are data, not a shared hardcoded ID.

Independent production webhook callers were observed during this work: production row 11 and some queue completion/output fields changed concurrently. These were not clone tests or requests initiated by this worker. Their failed Runner frame-skip executions exposed the pre-existing pairing defect; inspection led to the verified linkage fix. The installed terminal/exact-owner Error Reset also handled independently occurring failed production executions. Therefore no assertion is made that *all* production rows stayed byte-identical throughout the maintenance window; the two ambiguous legacy locks did remain byte-identical. Actual end-to-end generation and approval were not initiated or certified by this worker.

No shared index edit, Docker restart, updater Apply, forced push or main-branch modification is part of this change.
