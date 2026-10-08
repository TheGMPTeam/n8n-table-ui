# Git updater (trusted LAN only)

The popup uses real public Git fetches from the fixed `TheGMPTeam/n8n-table-ui` repository. No GitHub login, administrator password, or secret is needed. Only `main` and `beta` are accepted. Normal full updates fast-forward a clean checkout; explicit confirmed branch switches/downgrades use an exact detached commit without reset/force. The popup remains nonmodal and never reloads tables as a substitute for updating assets.

## Security boundary

A host Node worker exposes only `/check` and `/apply` over a Unix socket. The UI container gets the socket directory only, read-only: never a Docker socket, host shell, repository mount, or arbitrary command/path/URL input. Apply is disabled unless the host operator explicitly sets `UPDATE_ALLOW_UNAUTHENTICATED_LAN=1`. With that flag, **any LAN client can update this application**. Same-origin checks prevent cross-site browser requests but do not authenticate curl clients or prevent compromised LAN devices. Keep the app LAN-bound, firewall untrusted clients, and do not expose updater routes through public tunnels. Passwordless LAN mode is an explicit operator risk choice, not authentication.

## Deployment (local operator)

After merging and deploying the chosen commit, copy `updater-host.cjs` outside the managed checkout to `/home/dad/Config/n8n-table-ui-update-state/updater-host.cjs` (directory mode 0700). This worker is host infrastructure and survives switching to an older application commit. Updating the worker itself requires a deliberate operator copy/restart.

Add to the existing local UI compose, preserving every existing setting/mount:

```yaml
environment:
  UPDATE_CONTROL_SOCKET: /run/ui-updater/control.sock
volumes:
  - ./n8n-table-ui-update-state/run:/run/ui-updater:ro
```

Create `run/` with mode 0750 owned by the worker account; the existing root UI container can connect. Restart/recreate only `n8n-table-ui`. Then register the actual deployed commit:

```sh
node /home/dad/Config/n8n-table-ui-update-state/updater-host.cjs register FULL_40_CHARACTER_SHA
UPDATE_ALLOW_UNAUTHENTICATED_LAN=1 node /home/dad/Config/n8n-table-ui-update-state/updater-host.cjs serve
```

Registration compares Git blobs to source and the actual served HTML plus **running proxy startup hash** from `/updates/identity`. Operator `.data/version.json` labels are not used for update comparisons. `.data/index.html` must match the registered commit exactly; reconcile intentional edits before registration. A full target whose proxy lacks `/updates/identity` cannot pass health verification and is rolled back; old main releases may therefore require manual deployment rather than claiming a verified automated update.

For a supervised service use `deploy/n8n-table-ui-updater.service` as a user-systemd unit. The narrow runtime directory is the only container mount. The worker requires host Git, Node, npm, curl and Docker Compose access; no root service is needed when the operator already has Docker access.

## Modes and recovery

- **Databind:** compile the staged inline scripts, atomically replace `.data/index.html`, verify served bytes, preserve source checkout/server/container. No npm scripts, image build or restart. Reject changes outside HTML/docs/tests relative to the actual deployed server commit.
- **Full:** stage exact fetched SHA in an isolated worktree; run `npm test` and `npm run build` before changing deployment; advance checkout, replace `.data/index.html`, run fixed `docker compose -p table-ui -f /home/dad/Config/docker-compose.n8n-table-ui.local.yml up -d --build --no-deps n8n-table-ui`; verify actual UI/server bytes.
- Neither mode modifies n8n workflows, tables, tokens, operator environment, `.data/version.json`, persistent media caches, or the host compose configuration.
- Dirty checkout, operator overrides, invalid inputs, changed remote SHA, concurrent updates and incompatible UI-only updates are refused.
- Each mutation backs up old HTML, deployment identity and Git HEAD into protected `backup-*` directories. Failure restores checkout/HTML and redeploys the old full image. Failed rollback retains the lock for operator recovery; a crashed worker may leave a lock. Stop the worker before manual recovery. Inspect the matching `recovery.json`, then `node updater-host.cjs recover /absolute/state/backup-TIMESTAMP`; verify identity and only then remove a stale `apply.lock` and restart the worker. Never delete a lock while an update is running.
- Full restart can break the browser's waiting HTTP request. Check the branch again to determine success; do not blindly repeat. Reload the document explicitly to load new browser code.

## Routes

`GET /updates/identity`: actual startup server hash and currently served UI hash.

`GET /updates/check?branch=main|beta`: exact remote/UI/server SHAs, availability, changed files, compatibility and downgrade/switch warning. No code application.

`POST /updates/apply`: same-origin request with `{branch, mode:'full'|'databind', sha, confirm:true}`; forwarded only to the fixed Unix worker. No arbitrary shell or paths.

## Manual host CLI

```sh
node updater-host.cjs check beta
node updater-host.cjs apply beta databind CHECKED_SHA
node updater-host.cjs apply beta full CHECKED_SHA --confirm
```

CLI execution is local operator authorization; no login service is introduced. Tests exercise real isolated Git repositories and file swaps with mocked Docker actions. They never update production to main or trigger n8n jobs.
