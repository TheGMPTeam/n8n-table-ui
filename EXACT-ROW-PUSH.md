# Exact-row Push and settings lifecycle

The single settings entry is **Setup** while configured Home, Jobs and Templates IDs cannot all be read; after successful read-only validation it becomes **Config**. Empty tables are valid. Reconfigure reopens the walkthrough without deleting stored settings. Validation does not load a different table into current row state.

| Row/table | Same-origin request | Upstream |
| --- | --- | --- |
| Ideas / Research production | POST `/dispatch/research`, `{rowId:"17"}` | GET `Research?Row=17&ByPass=true` |
| Script production | POST `/dispatch/scene` | GET `Production?RowID=17&ByPass=true` |
| Scene production | POST `/dispatch/dispatcher` | GET `Dispatcher?RowID=17&ByPass=true` |
| ComfyUI | POST `/dispatch/runner` | POST `yt-Test`, `{Id:"17"}` |

Unsupported production types have Edit rather than Push. Review is never dispatched or approved here. Push never clones or pre-locks a row.

## n8n contract repair

Execution **56162** failed at the Scene Production webhook with `No Respond to Webhook node found in the workflow`. Its responseNode mode was invalid. Runner executions **56155** and **56157** received `{Id:"1"}` but the row reader returned an empty item and raised `No Jobs Ready!`: startup recovery overwrote `$json.body`, and row 1's nullable Working did not match the old strict false filter. All four production entry points now acknowledge immediately and route directly to their exact-row reader, avoiding schedule startup stale-lock cleanup and broad row selection. Readers recover the original trigger query/body, validate a positive safe integer, and filter on numeric `id` with limit 1. Invalid IDs resolve to an impossible ID, not all rows. An exact-row gate suppresses rows whose Working is true and permits existing nullable Working values. Scheduled recovery paths are unchanged.

Safe verification used independent temporary workflows containing only the actual webhook and actual selected-row reader plus a JSON response, with generation/write nodes omitted. All four returned the requested existing ID (production row 11; ComfyUI row 1); all probes were deactivated and archived. This proves the live read transport/parameter contract, **not** generation, approval, or downstream completion. Original workflow backups and detailed evidence are kept outside the checkout in `/home/dad/.hermes/cache/scratch/push-audit`.
