# Home output deletion — inactive groundwork

This is NOT a deployed or complete deletion feature. No production output or row was deleted. The Home control remains disabled. The library has no listener, credentials, production path default, or n8n transport.

## Read-only discoveries

Docker `inspect comfyui` proves the RW bind:
`/home/dad/Config/data/comfyui/storage-user/output` -> `/root/ComfyUI/output`.
The current UI container has no output mount and no Docker socket. Do not mount the whole host or Docker socket.
Fresh API export: `/home/dad/.hermes/cache/scratch/home-safe-delete-backup.json`, ComfyUI `xKckTZI3ZU5HqIpZ`, 42 rows at inspection. URLs include omitted `type` (images and videos). Strict explicit-output resolver intentionally rejects these until server-side handling of ComfyUI's omitted-type default is verified; do not rewrite original browser URLs.

## Verified isolated REST contract

Primary upstream source inspected: n8n `packages/cli/src/public-api/v1/controllers/data-tables.public.controller.ts` and generated `deleteDataTableRows.generated.yml`.
Installed server supports **DELETE `/api/v1/data-tables/{tableId}/rows/delete`** with required query `filter` and explicit `returnData=true&dryRun=false`.
Use compact JSON and percent encoding with `%20`, not `+`. Example logical filter:
`{"type":"and","filters":[{"columnName":"id","condition":"eq","value":1},{"columnName":"URL","condition":"eq","value":"fixture-a"}]}`.
Isolated disposable table test returned only row 1, preserved row 2, verified readback, deleted the disposable table and verified 404. Initial spaced urlencode filter returned 400; double encoding also returned 400. All created disposable tables cleaned up and readback 404 confirmed.
NEVER use `/webhook/yt-remove` for selected rows; it removes a table.

## Implemented and exercised

`home_delete.py`: URL authority/path/query allowlist, explicit output type, one decoding pass, nested subfolder support, image/video suffix allowlist, canonical root, component-by-component directory fd opening with O_NOFOLLOW, lstat-like regular/single-link checks, file identity recheck, unlink only, absence verification. Coordinator rejects wrong table/invalid ID/stale URL/Working/incomplete/shared references, rechecks fresh queue/busy callback, records intent before unlink, verifies absence before exact-row delete, verifies row absence, supports only previously recorded file-deleted retries.
10 Python fixture tests pass. Existing 86 JavaScript tests and build passed before adding disabled-control regression; run full suite again before commit.

## Activation blockers / missing implementation

- Need authenticated narrow transport, durable fsynced intent store, fresh paginated n8n adapters, actual active execution + running_job lock checks, permission dry-run and exact CAS-like row delete (URL/Working/Completed filter).
- Need shared generation/deletion exclusion: repeated reads alone are not atomic and cannot prevent external generation race. Directory fd traversal prevents symlink escape but a concurrent writer renaming an opened directory outside root needs stronger confinement/exclusion (not solved here). Do not activate this library on production until addressed.
- No batch selector/confirmation or browser interception yet; disabled Home control is honest capability state only.
- Need authorization before scoped output RW mount/helper deployment and any UI/worker restart. Previous full apply/restart denial must not be bypassed. No compose edit, restart, service install, updater-worker change, shared workflow edit or production write performed.
- Parent must approve/finish activation design and independent security review. This branch is safe inactive groundwork, not a finished feature.
