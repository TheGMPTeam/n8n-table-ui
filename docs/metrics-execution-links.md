# Execution links and AI metric Model display

Execution links use `http://10.0.0.157:5678/workflow/{workflowId}/executions/{executionId}`.
They do not infer execution ownership from a job's current Type or a metric's Task.
Home/Jobs use the claim-time RequestKey (`workflowId:tableId:rowId`) only when its row ID and ExecutionID match. Metrics paginate the two configured queue tables and join by exact ExecutionID; missing/ambiguous ownership renders an unlinked ID with an explanatory tooltip, not a guessed link. No browser API key or backend route was added. Historical metrics whose queue execution has been superseded remain unlinked until an authenticated server-side execution-owner lookup is separately authorized.

The metrics Model column reads casing-insensitively, wraps the complete recorded tag and provides a complete tooltip. Null, blank and `unknown` values show `Unknown — model metadata unavailable`. The renderer never substitutes the configured primary model.

Live execution 58229 belongs to Research workflow x4AirppgK2nvJGuf, while production row 1 has already advanced to Type Script. Its RequestKey retains the Research owner. AI_Run_Metrics row 1 records Model `unknown`; this is a producer/metadata limitation, not a hidden column or schema-casing defect. The execution snapshot contains successful runs of both `Ollama Chat Model` (`muse-glimmer:30b-q4_K_M-dflash`) and connected fallback `Ollama Chat Model1` (`qwen3.8:latest`), plus an initial primary error. Native response generation text/metadata does not identify which tag produced the returned parsed Agent output. The disconnected `nemotron-3.5-lightning:latest` node did not run. No historical row or production model setting was changed: assigning one primary/fallback tag would be unsupported attribution.

Regression coverage: Research execution after Type advances to Script; valid scoped URL and no-opener link; click propagation isolation; invalid execution/request IDs; missing/mismatched/ambiguous owner; exact execution joins; unknown/blank/cased Model; full multi-tag value. Tests use in-memory fixtures and never submit generation or change production rows.
