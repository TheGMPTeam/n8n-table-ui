# Automatic update mode

The host worker checks the latest selected `main` or `beta` commit against both registered UI and server SHAs. Only `index.html` is an actual mounted/copy-supported UI asset in the current deployment. Every other changed path (including unknown static assets, dependencies, schema, documentation and tests) conservatively requires a full update. Additional assets must not be allowlisted without adding deployment, hashing and rollback support for their actual mounts.

Check responses include `recommendedMode` and `modeReason`. Apply refetches under the exclusive lock, rejects stale SHAs and an explicitly supplied mode that differs from the recalculated mode, and uses the server recommendation when mode is omitted. Repository cleanliness, deployment identity, origin checks, host mutation enablement, downgrade confirmation and rollback are unchanged.

The previous popup checkbox was operator consent, not login authentication. It is removed; normal Apply is the deliberate action. Branch switches/downgrades still require a separate explicit confirmation dialog. No credentials, authentication system or new transport is introduced. The popup disables Apply if the running older host worker lacks automatic classification, so an HTML-only rollout does not falsely claim backend support.

This change requires a separately approved host-worker deployment/restart for backend behavior. Tests use temporary Git fixtures and mocked Docker; do not invoke production apply to verify it. Preserve concurrent popup-header/editor-Save and Jobs changes by cherry-picking this focused commit after their commits, resolving only these updater hunks.
