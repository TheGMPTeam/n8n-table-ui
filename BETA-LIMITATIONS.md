# Beta limitations and verification

This is an explicitly authorized experimental beta, not a production-ready release. Publication does not deploy anything. The original operator checkout/index, runtime configuration and running services are not changed.

## Actual final verification

- Complete `npm test`: **211 tests, 194 passed, 17 failed, zero skipped; exit 1**.
- Three Jobs editor harness failures were repaired by supplying the DOM focus/document and tracking helper dependencies used by the current editor; all three original behavioral assertions now pass.
- `npm run build`: passed, including complete inline browser script compilation.
- Focused current-contract Config/enhancement/trusted-LAN Review/Home Push/CRUD-first Setup tests: 18 passed.
- Python importer/helper tests: 7 passed, using instrumented mock transports and mocked Torch, not live imports/model boot.
- External FFmpeg prerequisite tests: 3 passed (missing image, unavailable image, inspect-only success).
- Preflight passed with the operator's existing local `config-ffmpeg-api` image: all nine services, real bundled build contexts, Python AST, 11 native workflow Code graphs and Compose config. The sample `ffmpeg-api:latest` was unavailable and was correctly rejected; no image was pulled or built.
- No fresh stack boot, production generation, schema write, approval, workflow import, acoustic acceptance or live updater activation was performed.

## Remaining full-suite failures

The majority explicitly exercise obsolete cookie/browser-ID/owner authentication or mandatory full-file hash contracts. The newer user-approved contract is trusted-LAN Review with metadata/readability and private native transport. These tests have not been deleted, skipped or changed to unconditional successes. Model-display tests target the removed Model field. Home deletion tests expect earlier helper surfaces absent from this candidate; deletion remains unavailable rather than implemented by an unsafe substitute.

Two pipeline harness failures remain: readiness fixture/contract mismatch and an extracted Push fragment missing `pushRefreshRole`. They do not establish production correctness. Current-contract Review/Home Push tests pass independently, but this does not make the entire suite green. The complete remaining list is:

- Home batch confirms snapshot, calls only helper, reports partial counts
- Home transport refuses unauthenticated access and absent activation
- Home deletion remains unavailable until safe backend activation
- Missing, unknown and differently cased Model cells are explicit and complete
- mock scoped enhancement is authenticated, consumes its ticket, returns only a draft and renews after read-only verification
- changed file hash invalidates only changed asset approval
- validated existing binding is reused via HttpOnly cookie without browser-ID UI
- mock native session binding survives CSRF renewal but never outlives native JWT expiry
- review readiness is complete-only and stale snapshots lose approved display
- push dispatches the exact existing row without pre-lock or cloning
- browser ID transfer accepts only bounded editor identifiers
- native role validation never trusts client role
- Review automatically reuses bounded existing binding without connection panel or storage
- native snapshot binds source metadata and server file hashes
- native rejects hash mapping that differs from fresh output
- review auth binds cookie browser ID identity origin expiry and single-use nonce (mock native)
- mock transport: streaming hashes, native identity, single-use/expiry/logout/member and fixed URL guards

## External dependencies and missing stages

FFmpeg implementation source and generated source patches are excluded by the user's publication choice. The nine-service Compose requires an operator-supplied compatible `FFMPEG_IMAGE`, verified locally by preflight; the example local tag is not a published image. Pocket source retains its upstream MIT license. No external model/voice/source rights are granted or presumed.

Final assembly/upload is not connected. Approval is not final-video completion. Cross-host installation, actual GPU/model/voice readiness, end-to-end audiovisual production and updater activation are unverified. Trusted-LAN Origin checks are not authentication; do not expose this UI directly to the public Internet. Mutable image tags are not reproducible pinned releases.
