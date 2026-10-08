# Dispatcher duration regression — October 8, 2026

Live failed execution `57447`, Shorts Dispatcher `M9SnVr1xBYNDwJDF`, row `11`:
`Merge Scenes + Build Jobs` rejected `Scenes[0].duration = "0-5"` at line 265.
Scene Production's published agent/parser explicitly emits second-based timeline
ranges; Dispatcher inherits them while its former Params validator required a number.
The agent returns no duration field. This is a producer/consumer schema mismatch.

Only the Merge Code-node body changed. Parse positive numeric seconds, numeric
second strings, explicit s/sec/seconds suffixes, and increasing nonnegative
start-end second ranges. Reject invalid supplied values with row, scene, field,
raw value and computed seconds; do not coerce booleans, null, objects or blanks.
FPS remains strict positive numeric. No speculative Duration/Params aliases were
added because the retrieved producer schema does not use them.

Scene timeline strings remain unchanged in mergedScenesJson. Generation Params
for I2V/FLF use exactly 10 seconds per the existing published Dispatcher Agent
Rule 4a, including split scenes; this is not an invented fallback. Image-only
missing duration stays absent. Static image scenes inheriting timing retain the
source span (a split image's individual edit length is not inferred). No final
trim/assembly duration allocation was added.

Both published video templates use duration * fps + 1 for the LTX latent length.
Actual recorded Merge output replayed through the published Runner injector gives
10 seconds, template FPS 24, length 241 for SCENE_02, SCENE_04A and SCENE_04B.
No frame count clamp, seed, negative prompt, frame linkage, generation type,
locking, error context, StopAndError connection or UI behavior was changed.

Proof: published activeVersionId `ffac64b7-a89d-4f2f-a59c-855def4bfe4f`, exact
published nodes/connections read back; only Merge differs from the fresh backup.
Native isolated Code-runtime replay of the actual failed inputs produced 9 jobs.
The probe contained only a webhook and fixture/merge Code nodes, no row writes,
locks, AI calls or generation. Probe `I4OdXqB6UmvyQ0Hr` was deleted, GET 404 verified.
No production execution was retried and no Home Delete backend was activated.

Tests: duration regression 28/28; npm test 119/119; build exit 0;
workflow-contract tests 58/58. Before patch, exact failed input reproduced
`Invalid duration` in the entire-node sandbox. After patch it passed.
Run `node --test workflow-contract/dispatcher-duration.test.cjs` for the public,
sanitized timing/linkage fixture. The original execution and fresh definitions
are private, not committed: `/home/dad/.hermes/duration-repair-20261008-095429/`.
