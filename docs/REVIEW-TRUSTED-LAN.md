# Review: trusted LAN

Review now uses the same trusted-LAN operating boundary as Home Push. No n8n operator login, cookie, browser-ID bridge or login panel is required. The UI remains LAN-bound at 10.0.0.157:3458. Do not expose it to the Internet. Same-origin Origin/Host checks constrain browser requests; they are not user authentication and do not defend against malicious trusted-LAN clients.

The backend keeps the existing encrypted native webhook header credential private and calls only the fixed Review webhook. Workflow actor records say `trusted-LAN Web UI`, not verified n8n owner. Manual editor actors say `manual authenticated editor`.

Loading Review automatically obtains current queue metadata and checks each original allowlisted ComfyUI URL using a small Range request, stopping after response headers. Browser image load/naturalWidth and video loadedmetadata can also enable controls. No whole-file download/hash or manual Verify button is required. Direct preview links are unchanged; private browser playback separately requires an existing ComfyUI login. HTTP readability is not quality approval or cryptographic integrity evidence.

Ten-minute single-use nonces bind decisions to the production JobID, origin and current metadata snapshot. Native logic rechecks current parent, queue output URL/prompt/timestamps/dependencies and aggregate individual decisions. Snapshot changes require review again. Enhancement remains draft-only; explicit regeneration retains its exact-asset Runner dispatch and superseded-file history. No assembler is configured: all-approved remains Review, Completed false, next step unavailable.

Read-only browser verification: Job 1 has 15 assets / 60 enabled action buttons; Job 2 has 6 assets / 24 enabled action buttons with no n8n session. No production approval or regeneration was executed during verification. Existing historical tests covering native per-asset decisions were run separately; those saved fixtures are not evidence of newly executing production generation.
