# Per-asset Review + Enhancement contract

## Visible UI
- Review displays only Type `Review`, idle/error-free production rows whose current required scene asset bundles are complete and correctly linked. Unsupported/incomplete/missing-dependency jobs are omitted, not marked ready.
- Individual original-URL image/video previews, scene/frame role, editable regeneration prompt, Enhancement, type-correct Regenerate Image/Video, Approve and Deny controls.
- No Authenticated section, browser-ID textbox, Connect/Disconnect buttons or console-copy instructions. A minimal Sign in to n8n link appears only after an actual 401.
- Prompt typing and Enhancement change only the in-memory selected draft. Enhancement exposes before/after text; empty/model/error/unchanged/stale output preserves the original draft. Only explicit Regenerate saves the selected prompt and dispatches media.

## Authentication and native routing
POST `/review/session`, `/review/list`, `/review/decision`, `/review/enhance` remain fixed same-origin, native HttpOnly cookie + original browser binding + live n8n owner/admin `/rest/login` checks. No browser API keys, public generic review CRUD or new unauthenticated AI/generation endpoints.
Validated browser bindings are AES-256-GCM-encrypted in HttpOnly, SameSite=Strict, /review-scoped cookies bound to the unchanged native cookie hash and Origin, no longer than native JWT expiry / 24 hours. CSRF/session nonces and single-use snapshot tickets expire after at most 10 minutes. Native cookies are never minted/modified. Cold browsers without a validated binding cannot read another port's editor localStorage automatically: a login link alone is not a browser-ID bridge. Bootstrap from an already authenticated native browser under existing authorization, or report the limitation; never resurrect removed controls or forge sessions.

Native workflow: `KMtoCzHcKMiTKNvZ`, active version at completion `1ec845a7-dc79-44f0-a880-f09b6bee6395` (re-fetch before subsequent edits). Private existing header-auth webhook remains `/webhook/review-private-v1`; secret stays server-side/encrypted in n8n.
Actions: inspect (read-only), list (snapshot enrollment), verify (read-only file/source snapshot verification), approve_asset, reject_asset, regenerate, enhance_prompt. Whole-job approve/reject is rejected.

## Safety
- Persist each asset decision in existing Pipeline_Review_Gate Outputs, bound to exact current metadata, source script/scenes and measured SHA256 + byte length. Existing required IDs cannot silently disappear.
- Native and backend freshness/owner checks precede decisions; never equate transport Completed with visual/audio quality approval.
- Scope running_job owners by configured Runner workflow, not numeric rowId alone: production and generation IDs can collide. Unknown ownership fails closed.
- Regeneration conditional exact-row patches preserve Params/Dependencies and source narration/timing. Selected pending marker prevents scheduled consumption before explicit Runner dispatch. Image changes invalidate only exact dependent videos and their approval, preserving old files/URLs/hashes in the superseded ledger. Do not delete files or clear live locks.
- Native Basic LLM Chain + existing installed `qwen3.8:latest` Ollama model has no tools. Enhancement strictly validates nonblank changed JSON prompt, literal asset type and source narration, protected quoted wording; frame binding/Params/source fields are immutable server data. Enhancement bypasses every table writer. Re-hash/revalidate after AI and renew a ticket through read-only verify before returning the draft.
- Native assembler is absent. All current assets approved persists approved but visibly reports “Approved — next step not configured”; do not falsely set Video Review or claim assembly occurred. An inactive manual FFmpeg HTTP suite is not a production assembler.
- Owner reads/table updates are best-effort, not distributed atomic CAS; per-job backend mutex does not make external native writers atomic.

## Acceptance evidence
- 36 focused tests pass; full suite 126 tests, 115 passed and exactly the independently reproduced 11 baseline failures. Build/whole inline script compilation pass.
- 19 isolated real native Review/Runner checks, ComfyUI HTTP nodes explicitly mocked; actual selected claims/attempts/completion/dependency binding/owner release verified. No GPU generation on production.
- 11 genuine native Ollama enhancement checks: image and FLF drafts, immutable rows/timestamps/narration/dependencies, blank rejection, read-only verification; actual 19.67 / 18.86 seconds. Initial unchanged-model-output failure is retained as evidence of fail-closed behavior.
- Actual deployed browser intercepts verify per-asset decisions/regen plus Enhancement pending/success/failure with zero production writes. All six original Job2 file hashes, complete rows, script/scenes and pending review state unchanged.
- Source/served/override UI and startup private backend identities verified, main proxy hash and Docker image unchanged. Removed authentication controls absent in served HTML and DOM. Mobile width 390 has no horizontal overflow.
- Native fixture execution evidence captured before exact workflow/table deletion; all captured fixture targets verified GET404.

Evidence and backups: `/home/dad/Config/production-readiness/per-asset-review/`. Preserve dirty operator files and independent deployment identities; do not run full updater Apply or promote public main as part of this feature.
