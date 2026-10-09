# Accepted Push refresh

Home Push and Jobs Research / Script / Scenes Push schedule a row-only refresh after an HTTP-success acknowledgement with no error body. The banner says `Accepted; refreshing in 60 seconds`; it is not a completion claim.

One pending timeout per source table; the first successful acknowledgement sets the 60000ms deadline. Later successful Pushes do not reset it. No failed Push schedules a timeout. The source table, originating Home/Jobs tab, Jobs stage and selected row ID are captured before awaiting dispatch.

At the deadline the original source is read only if the same table/tab/stage is visible. Otherwise it is marked due and read on return, without changing tabs. New form content is untouched. Open row editors defer the refresh until closing. Focused table inputs defer it; a subsequent navigation/render can flush the due read. Source configuration changes invalidate it; saving Config/page cleanup cancels pending timeouts. Existing filters and selections are retained; template loading and generation are not triggered by the timeout.

Refresh read promises are shared with simultaneous manual loads; current-table identity is checked before assigning loaded rows. Manual reads can satisfy a due refresh. Existing independent periodic refresh remains independently controlled by the operator.

Regression: `node --test push-refresh.test.cjs` uses a fake clock at 59999/60000ms, repeated success, navigation, editor protection, source replacement and cleanup. Full clean beta suite and build must also pass. Browser testing intercepts dispatch and row reads: do not test using production Pushes.

Deployment is HTML-only, preserving the active backend identity and hand-managed version.json; no service restart, updater Apply, workflow or table mutations.
