# Canonical production workflow contracts

Future success chain: Research → Script → Scenes → Review. Video Review and Uploaded are unimplemented; no workflows invented.

Scheduled readers use exact Shorts_Production.Type explicit allowlists in canonical-workflow-contracts.json, never ComfyUI.type or Status override. Native pending filters remain AND; Code gates add alias membership before existing loop/empty handling. Null/unknown/wrong-stage/locked/completed rows cannot pass. Explicit webhook Row/RowID ByPass retains exact selected-id read and lock guard; stage gate applies only to scheduled path.

Research success writes Script; Scene Production Pass writes Scenes only after successful Scenes persistence; Dispatcher Finish Row writes Review, Status Queued only after Write Jobs Loop. Existing error paths/Retry preserve original Type. Existing rows 11 and 12 remain Script / Qued byte-for-byte. Manual Review accepts Queued or legacy Qued without assigning stages from status; remains inactive editor-only and never starts assembly.

Research and Dispatcher use onReceived and terminal NoOp with existing Respond node name/connections; no Respond to Webhook nodes remain. Acknowledgement is not completion. Three isolated read-only clones returned HTTP 200 and selected only id 11, successful executions recorded in JSON. All clones deleted after deactivation. No generation, approval, production rows mutation, Docker restart or Apply performed.

Backups and readbacks: /home/dad/Config/n8n-table-ui-backups/canonical-pipeline-20261008/. Workflow exports contain credential references only, not credential values. Tests: node --test canonical-workflow.test.cjs; npm test; npm run build.
