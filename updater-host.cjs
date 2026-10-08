"use strict";
// Host only. Never mount Docker's socket or this process into the UI container.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  http = require("node:http");
const { execFileSync } = require("node:child_process");
const REMOTE = "https://github.com/TheGMPTeam/n8n-table-ui.git";
function branch(v) {
  if (!["main", "beta"].includes(v)) throw Error("Invalid branch");
  return v;
}
function mode(v) {
  if (!["full", "databind"].includes(v)) throw Error("Invalid mode");
  return v;
}
const digest = (b) => crypto.createHash("sha256").update(b).digest("hex");
function atomic(file, bytes, permissions = 0o600) {
  const tmp = file + ".update-" + crypto.randomBytes(8).toString("hex");
  fs.writeFileSync(tmp, bytes, { mode: permissions, flag: "wx" });
  fs.renameSync(tmp, file);
}
function createUpdater(config, deps = {}) {
  const { repo, data, stateDir, compose } = config;
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const run =
    deps.run ||
    ((cmd, args, cwd = repo) =>
      execFileSync(cmd, args, {
        cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        encoding: "utf8",
        timeout: 300000,
        maxBuffer: 16 * 1024 * 1024,
      }));
  const git = (...args) => run("git", args);
  const manifest = path.join(stateDir, "deployment.json"),
    lock = path.join(stateDir, "apply.lock");
  const served = () =>
    fs.existsSync(path.join(data, "index.html"))
      ? path.join(data, "index.html")
      : path.join(repo, "index.html");
  const blob = (sha, file) => git("show", sha + ":" + file);
  const identity =
    deps.identity ||
    (() =>
      JSON.parse(
        run("curl", [
          "--silent",
          "--show-error",
          "--fail",
          "--max-time",
          "5",
          "--retry",
          "12",
          "--retry-connrefused",
          "--retry-delay",
          "1",
          "http://10.0.0.157:3458/updates/identity",
        ]),
      ));
  function verifyRunning(hashes) {
    const actual = identity();
    if (
      actual.uiHash !== hashes[served()] ||
      actual.serverHash !== hashes[path.join(repo, "proxy-server.cjs")]
    )
      throw Error(
        "Running UI/server bytes differ from registered SHA; deploy/restart and register first",
      );
  }
  function current() {
    const m = JSON.parse(fs.readFileSync(manifest));
    for (const [file, hash] of Object.entries(m.hashes)) {
      if (digest(fs.readFileSync(file)) !== hash)
        throw Error(
          "Operator changes detected; reconcile and register deployment first",
        );
    }
    verifyRunning(m.hashes);
    return m;
  }
  function register(sha) {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw Error("Invalid SHA");
    const hashes = {};
    for (const [file, source] of [
      [served(), "index.html"],
      [path.join(repo, "proxy-server.cjs"), "proxy-server.cjs"],
    ]) {
      const bytes = fs.readFileSync(file);
      if (digest(bytes) !== digest(blob(sha, source)))
        throw Error("Deployed bytes do not match SHA: " + source);
      hashes[file] = digest(bytes);
    }
    verifyRunning(hashes);
    atomic(manifest, JSON.stringify({ uiSha: sha, serverSha: sha, hashes }));
    return current();
  }
  function fetchBranch(b) {
    branch(b);
    git("fetch", "--no-tags", REMOTE, "refs/heads/" + b + ":refs/updater/" + b);
    return git("rev-parse", "refs/updater/" + b).trim();
  }
  function check(b) {
    branch(b);
    const m = current(),
      sha = fetchBranch(b);
    let forward = true;
    try {
      git("merge-base", "--is-ancestor", m.uiSha, sha);
    } catch {
      forward = false;
    }
    // Only index.html is actually mounted and copied by this deployment.
    // Compare both identities: a prior HTML-only apply leaves serverSha behind.
    const files = [...new Set([m.serverSha, m.uiSha].flatMap(base =>
      git("diff", "--name-only", "-z", base, sha).split("\0").filter(Boolean)))].sort();
    const backendChanged = files.some(f => f !== "index.html");
    const recommendedMode = backendChanged ? "full" : "databind";
    const modeReason = backendChanged
      ? "Full update required: non-mounted UI or server/build/unknown files changed: " + files.filter(f => f !== "index.html").join(", ")
      : "Only mounted index.html differs; no server/build changes or restart required.";
    return {
      branch: b,
      remoteSha: sha,
      deployedSha: m.uiSha,
      serverSha: m.serverSha,
      updateAvailable: sha !== m.uiSha,
      requiresConfirmation: !forward,
      databindCompatible: !backendChanged,
      recommendedMode,
      modeReason,
      files,
    };
  }
  function composeRun() {
    run("docker", [
      "compose",
      "-p",
      "table-ui",
      "-f",
      compose,
      "up",
      "-d",
      "--build",
      "--no-deps",
      "n8n-table-ui",
    ]);
  }
  async function apply(input) {
    branch(input.branch);
    if (input.mode !== undefined) mode(input.mode);
    if (!/^[a-f0-9]{40}$/.test(input.sha)) throw Error("Invalid SHA");
    let fd;
    try {
      fd = fs.openSync(lock, "wx", 0o600);
    } catch {
      throw Error(
        "Update already running; stale lock requires operator recovery",
      );
    }
    let stage,
      backup,
      old,
      changed = false,
      retainLock = false;
    try {
      if (git("status", "--porcelain").trim())
        throw Error("Local repository changes block updates");
      old = current();
      const c = check(input.branch);
      if (c.remoteSha !== input.sha) throw Error("Branch changed; check again");
      if (c.requiresConfirmation && input.confirm !== true)
        throw Error("Branch switch or downgrade requires confirmation");
      if (input.mode === "databind" && !c.databindCompatible)
        throw Error("Server/build changes require full mode");
      if (input.mode !== undefined && input.mode !== c.recommendedMode)
        throw Error("Update mode mismatch; check again (" + c.recommendedMode + " required)");
      input = { ...input, mode: c.recommendedMode };
      if (!c.updateAvailable) return { status: "unchanged", ...c };
      stage = path.join(
        stateDir,
        "stage-" + crypto.randomBytes(8).toString("hex"),
      );
      git("worktree", "add", "--detach", stage, c.remoteSha);
      if (input.mode === "full") {
        run("npm", ["test"], stage);
        run("npm", ["run", "build"], stage);
      } else {
        const html = fs.readFileSync(path.join(stage, "index.html"), "utf8");
        const scripts = [
          ...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g),
        ];
        if (!scripts.length) throw Error("UI script missing");
        for (const script of scripts)
          new (require("node:vm").Script)(script[1]);
      }
      backup = path.join(stateDir, "backup-" + Date.now());
      fs.mkdirSync(backup, { mode: 0o700 });
      fs.copyFileSync(manifest, path.join(backup, "deployment.json"));
      fs.copyFileSync(served(), path.join(backup, "index.html"));
      const hadOverride = fs.existsSync(path.join(data, "index.html"));
      fs.writeFileSync(
        path.join(backup, "recovery.json"),
        JSON.stringify({
          head: git("rev-parse", "HEAD").trim(),
          hadOverride,
          mode: input.mode,
        }),
      );
      changed = true;
      if (input.mode === "full") {
        let ff = true;
        try {
          git("merge-base", "--is-ancestor", "HEAD", c.remoteSha);
        } catch {
          ff = false;
        }
        if (ff) git("merge", "--ff-only", c.remoteSha);
        else {
          if (input.confirm !== true)
            throw Error("Checkout branch switch requires confirmation");
          git("switch", "--detach", c.remoteSha);
        }
      }
      atomic(
        path.join(data, "index.html"),
        fs.readFileSync(path.join(stage, "index.html")),
        0o644,
      );
      if (input.mode === "full") composeRun();
      const hashes = {
        [path.join(data, "index.html")]: digest(
          fs.readFileSync(path.join(data, "index.html")),
        ),
        [path.join(repo, "proxy-server.cjs")]: digest(
          fs.readFileSync(path.join(repo, "proxy-server.cjs")),
        ),
      };
      if (
        hashes[path.join(data, "index.html")] !==
        digest(blob(c.remoteSha, "index.html"))
      )
        throw Error("UI SHA verification failed");
      if (
        input.mode === "full" &&
        hashes[path.join(repo, "proxy-server.cjs")] !==
          digest(blob(c.remoteSha, "proxy-server.cjs"))
      )
        throw Error("Server SHA verification failed");
      if (deps.health) await deps.health();
      verifyRunning(hashes);
      atomic(
        manifest,
        JSON.stringify({
          uiSha: c.remoteSha,
          serverSha: input.mode === "full" ? c.remoteSha : old.serverSha,
          hashes,
        }),
      );
      return { status: "applied", mode: input.mode, sha: c.remoteSha, backup };
    } catch (e) {
      if (changed && backup) {
        try {
          recover(backup);
        } catch {
          retainLock = true;
          throw Error(
            "Update failed and rollback failed; retain lock and recover from " +
              backup,
          );
        }
      }
      throw e;
    } finally {
      if (stage)
        try {
          git("worktree", "remove", "--force", stage);
        } catch {}
      fs.closeSync(fd);
      if (!retainLock && fs.existsSync(lock)) fs.unlinkSync(lock);
    }
  }
  function recover(backup) {
    if (
      path.dirname(backup) !== stateDir ||
      !path.basename(backup).startsWith("backup-")
    )
      throw Error("Invalid backup");
    const r = JSON.parse(fs.readFileSync(path.join(backup, "recovery.json")));
    if (r.mode === "full") git("switch", "--detach", r.head);
    if (r.hadOverride)
      atomic(
        path.join(data, "index.html"),
        fs.readFileSync(path.join(backup, "index.html")),
        0o644,
      );
    else fs.rmSync(path.join(data, "index.html"), { force: true });
    if (r.mode === "full") composeRun();
    atomic(manifest, fs.readFileSync(path.join(backup, "deployment.json")));
    return current();
  }
  return { register, check, apply, recover, current };
}
function serve(updater, config) {
  let checking = false;
  const server = http.createServer(async (req, res) => {
    const reply = (s, b) => {
      res.writeHead(s, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(b));
    };
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET" && url.pathname === "/check") {
        if (checking) return reply(429, { error: "Check in progress" });
        checking = true;
        try {
          return reply(200, updater.check(url.searchParams.get("branch")));
        } finally {
          checking = false;
        }
      }
      if (req.method !== "POST" || url.pathname !== "/apply")
        return reply(404, { error: "Not found" });
      if (config.allowLanApply !== true)
        return reply(403, {
          error:
            "Web apply disabled: host operator must explicitly enable trusted-LAN updates. Local CLI remains available.",
        });
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096) return reply(413, { error: "Too large" });
      }
      reply(200, await updater.apply(JSON.parse(body)));
    } catch (e) {
      reply(409, { error: e.message });
    }
  });
  const runtime = path.join(config.stateDir, "run");
  fs.mkdirSync(runtime, { recursive: true, mode: 0o750 });
  const socket = path.join(runtime, "control.sock");
  if (fs.existsSync(socket))
    throw Error("Socket exists; check existing worker before removing");
  server.listen(socket, () => fs.chmodSync(socket, 0o660));
  return server;
}
module.exports = { branch, mode, createUpdater, serve, digest };
if (require.main === module) {
  const config = {
    repo: process.env.UPDATE_REPO || "/home/dad/Config/n8n-table-ui",
    data: process.env.UPDATE_DATA || "/home/dad/Config/data/n8n-table-ui/.data",
    stateDir:
      process.env.UPDATE_STATE || "/home/dad/Config/n8n-table-ui-update-state",
    compose: "/home/dad/Config/docker-compose.n8n-table-ui.local.yml",
    allowLanApply: process.env.UPDATE_ALLOW_UNAUTHENTICATED_LAN === "1",
  };
  const u = createUpdater(config);
  const command = process.argv[2];
  if (command === "register") console.log(u.register(process.argv[3]));
  else if (command === "check") console.log(u.check(process.argv[3]));
  else if (command === "apply")
    u.apply({
      branch: process.argv[3],
      mode: process.argv[4],
      sha: process.argv[5],
      confirm: process.argv[6] === "--confirm",
    })
      .then(console.log)
      .catch((e) => {
        console.error(e.message);
        process.exitCode = 1;
      });
  else if (command === "recover") console.log(u.recover(process.argv[3]));
  else if (command === "serve") serve(u, config);
  else
    throw Error(
      "Usage: register SHA | check main/beta | apply BRANCH full/databind SHA [--confirm] | recover BACKUP | serve",
    );
}
