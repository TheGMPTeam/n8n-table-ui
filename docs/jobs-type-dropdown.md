# Jobs Type cells

Every Jobs stage spreadsheet offers Research, Script, Scenes, Review, Video Review and Uploaded. This explicit Type-cell requirement supersedes the earlier no-Type interpretation for Jobs cells, not the separate Jobs editor: the editor still omits template API and Type controls.

Only Shorts_Production is writable. The update sends operation=update, configured table id, exact match.id, and row={Type}; no Status, API, prompt, generation or dispatch. Unknown current values remain disabled options. Per-row locks reject overlapping client requests. Preflight detects stale Type; HTTP success plus exact ID readback (and comparison of unrelated fields excluding updatedAt) gates UI reclassification and selection transfer. Filters are retained. Review/final stages have no fabricated Push; missing workflow warnings do not prevent manual Type changes.

CRUD has no atomic compare-and-swap: an external writer racing between preflight and update cannot be atomically excluded. Readback detects conflicts; failures retain the prior UI value/tab and show structured inline errors. A successful write with failed verification is not automatically reversed, since that could overwrite an external writer. Reload before retrying.
