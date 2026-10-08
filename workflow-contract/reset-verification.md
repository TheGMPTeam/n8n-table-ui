# Reset verification — October 8, 2026

The authorized reset previously removed 460 media files and 56 rows. A fresh recursive inventory reported zero remaining media and six preserved non-media regular files. Backups are outside output.

Fresh API readback confirms all five restored workflows active and draft/version publication IDs matching: Runner 43 nodes, Research 31, Scene Production 28, Dispatcher 28, Write Jobs Loop 5. The four sanitized contract fixtures reflect 19 removed nodes; reset-cleanup-audit.json records exact removed names/counts. No credentials or private row payloads are included.

All five reset tables are empty: ComfyUI, Shorts_Production, running_job, Resources, Pipeline_Review_Gate. Unrelated tables were left unchanged.

Authenticated ComfyUI system_stats and queue return 200; only RTX 5060 Ti is exposed and both queues are empty. Docker healthcheck's unauthenticated request returns 401; this expected authorization failure was not repaired or changed.

Empty Home regression executes the actual renderPanels function with mock DOM and asserts all three zero counters and No jobs, while a nonempty missing-flags table retains its warning. Browser Home and Jobs confirm zero counts. Deployment patches HTML in place only and explicitly leaves backendActivated=false. No production execution, media deletion, row deletion, service restart or backend deployment was performed during this verification.
