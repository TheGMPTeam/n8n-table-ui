const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// .data bind mount — the single writable path the container needs.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '.data');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'proxy.log');
const ENV_FILE = path.join(DATA_DIR, 'env');
const HTML_OVERRIDE = path.join(DATA_DIR, 'index.html');

// Optional .data/env drop-in. Real environment variables always win, so this
// only fills gaps — it can never override what compose passes in.
// git-commit detection: the proxy tries to read .git at runtime (when the
// image includes .git or the build context is a git checkout) and falls back
// to GIT_COMMIT env (build arg) → 'unknown'.
function loadEnvFile() {
  let raw;
  try {
    raw = fs.readFileSync(ENV_FILE, 'utf8');
  } catch (e) {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = val;
      console.log('env from .data/env: ' + key);
    }
  }
}
loadEnvFile();

function writeLog(line) {
  console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + line + '\n');
  } catch (e) {
    // read-only .data or unwritable path — stdout is enough
  }
}

const PORT = parseInt(process.env.PORT, 10) || 3458;
const API_BASE = process.env.API_BASE || '127.0.0.1';
const API_PORT = parseInt(process.env.API_PORT, 10) || 3456;
const N8N_HOST = process.env.N8N_HOST || 'n8n';
const N8N_PORT = parseInt(process.env.N8N_PORT, 10) || 5678;

const N8N_API_KEY = process.env.N8N_API_KEY;

function proxyReq(res, host, port, pathname, search, method, body, incoming) {
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': body.length,
    'Host': host + ':' + port,
  };
  // Only send the key when one is actually configured — an undefined header
  // value makes http.request throw and would break every proxied call.
  if (N8N_API_KEY) headers['X-N8N-API-KEY'] = N8N_API_KEY;
  const opts = {
    hostname: host,
    port: port,
    path: pathname + search,
    method: method,
    headers: headers,
  };
  const p = http.request(opts, (pr) => {
    const hdrs = {};
    for (const k in pr.headers) {
      if (k.toLowerCase() === 'access-control-allow-origin') continue;
      hdrs[k] = pr.headers[k];
    }
    hdrs['Access-Control-Allow-Origin'] = '*';
    res.writeHead(pr.statusCode, hdrs);
    pr.pipe(res);
  });
  p.on('error', (e) => {
    writeLog('proxy error ' + host + ':' + port + ' ' + pathname + ' — ' + e.message);
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('proxy error: ' + e.message + ' (target ' + host + ':' + port + ')');
  });
  p.write(body);
  p.end();
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const pathname = u.pathname;
  const method = req.method;
  const body = [];
  for await (const chunk of req) body.push(chunk);
  const buf = Buffer.concat(body);

  // CORS preflight (UI may call same-origin /webhook/* which we forward)
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-N8N-API-KEY',
      'Content-Length': '0',
    });
    res.end();
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    // Prefer a .data/index.html override so the UI can be live-edited without
    // a rebuild; fall back to the copy baked into the image.
    let file = path.join(__dirname, 'index.html');
    try {
      fs.accessSync(HTML_OVERRIDE, fs.constants.R_OK);
      file = HTML_OVERRIDE;
    } catch (e) {}
    const html = fs.readFileSync(file, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }

  // Report this proxy's endpoint env so the UI's Config tab can show the real
  // values instead of guessed defaults. N8N_API_KEY is reported as a boolean
  // only — the key itself is never sent to the browser.
  if (pathname === '/config') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      n8nHost: N8N_HOST,
      n8nPort: N8N_PORT,
      apiBase: API_BASE,
      apiPort: API_PORT,
      port: PORT,
      hasApiKey: Boolean(N8N_API_KEY),
      proxyBase: 'http://' + (req.headers.host || 'localhost:' + PORT),
      dataDir: DATA_DIR,
    }));
    return;
  }

  // Version / build info. Priority:
  //   1. .data/version.json  (no-rebuild update: drop this file + restart)
  //   2. /app/git-commit.txt, /app/git-branch.txt, /app/version.txt  (baked at
  //      build time from --build-arg; survives compose not passing those envs)
  //   3. GIT_COMMIT / GIT_BRANCH / VERSION env  (baked in by Dockerfile ENV)
  //   4. 'unknown' / '0.0.0' fallback
  const VERSION_PATH = path.join(DATA_DIR, 'version.json');
  const BAKED_COMMIT_PATH = path.join(__dirname, 'git-commit.txt');
  const BAKED_BRANCH_PATH = path.join(__dirname, 'git-branch.txt');
  const BAKED_VERSION_PATH = path.join(__dirname, 'version.txt');
  let _versionInfo = null;
  function readVersionInfo() {
    if (_versionInfo) return _versionInfo;
    let commit = null, branch = null, version = null;
    // 1. .data/version.json (runtime override / no-rebuild update). A file that
    //    was auto-seeded by a previous container run carries "_seeded": true and
    //    can be safely refreshed from the new build's baked files. A file dropped
    //    by hand (e.g. an ops person updating the version string) has no such
    //    marker and is left alone — it wins over the baked values.
    let fromOverride = false;
    let overriddenByHand = false;
    try {
      if (fs.existsSync(VERSION_PATH)) {
        const v = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf8'));
        if (!v._seeded) overriddenByHand = true;   // manual drop — preserve
        if (v.commit) commit = String(v.commit).trim();
        if (v.branch) branch = String(v.branch).trim();
        if (v.version) version = String(v.version).trim();
        fromOverride = true;
      }
    } catch (e) { /* fall through */ }
    // 2. baked files from build args — win over a stale AUTO-seeded .data/version.json
    //    so a fresh build always corrects a version that a prior container seeded,
    //    even when the stale value was a real (non-unknown) string.
    let bakedCommit = null, bakedBranch = null, bakedVersion = null;
    if (!bakedCommit) { try { if (fs.existsSync(BAKED_COMMIT_PATH)) bakedCommit = String(fs.readFileSync(BAKED_COMMIT_PATH, 'utf8')).trim(); } catch (e) {} }
    if (!bakedBranch) { try { if (fs.existsSync(BAKED_BRANCH_PATH)) bakedBranch = String(fs.readFileSync(BAKED_BRANCH_PATH, 'utf8')).trim(); } catch (e) {} }
    if (!bakedVersion) { try { if (fs.existsSync(BAKED_VERSION_PATH)) bakedVersion = String(fs.readFileSync(BAKED_VERSION_PATH, 'utf8')).trim(); } catch (e) {} }
    if (bakedCommit || bakedBranch || bakedVersion) {
      if (!overriddenByHand) {
        if (bakedCommit) commit = bakedCommit;
        if (bakedBranch) branch = bakedBranch;
        if (bakedVersion) version = bakedVersion;
        fromOverride = false; // force re-seed from baked below
      }
    }
    // 3. env fallback (only when no baked file supplied the field)
    if (!commit) commit = (process.env.GIT_COMMIT || '').trim() || 'unknown';
    if (!branch) branch = (process.env.GIT_BRANCH || '').trim() || 'unknown';
    if (!version) version = (process.env.VERSION || process.env.npm_package_version || '').trim() || '0.0.0';
    _versionInfo = { version, commit, branch };
    // Write .data/version.json when it is missing or was auto-seeded by a prior
    // container and the baked values changed. A hand-dropped file (no _seeded
    // marker) is never overwritten.
    try {
      const onDisk = fs.existsSync(VERSION_PATH) ? JSON.parse(fs.readFileSync(VERSION_PATH, 'utf8')) : null;
      const needsWrite = !onDisk || (onDisk._seeded && (onDisk.commit !== _versionInfo.commit || onDisk.branch !== _versionInfo.branch || onDisk.version !== _versionInfo.version));
      if (needsWrite) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(VERSION_PATH, JSON.stringify({ ..._versionInfo, _seeded: true }, null, 2) + '\n');
        writeLog('version.json updated: ' + JSON.stringify(_versionInfo));
      }
    } catch (e) {
      writeLog('WARNING: could not write .data/version.json — ' + e.message);
    }
    return _versionInfo;
  }

  // Serve /version so the UI can show build info in the bottom bar + updater popup.
  if (pathname === '/version') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(readVersionInfo()));
    return;
  }
  // Serve the n8n Data Table CRUD workflow import template so the setup wizard
  // can download it without the user having to find the file in the repo.
  if (pathname === '/webhook-workflow-template.json') {
    const tpl = path.join(__dirname, 'webhook-workflow-template.json');
    let content;
    try {
      content = fs.readFileSync(tpl, 'utf8');
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('workflow template not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(content);
    return;
  }

  // Route /webhook/* to n8n
  if (pathname.startsWith('/webhook/')) {
    writeLog('-> ' + method + ' ' + pathname + '  n8n=' + N8N_HOST + ':' + N8N_PORT);
    proxyReq(res, N8N_HOST, N8N_PORT, pathname, u.search, method, buf, req);
    return;
  }

  // Fallback: proxy to n8n
  writeLog('-> ' + method + ' ' + pathname + '  (fallback) n8n=' + N8N_HOST + ':' + N8N_PORT);
  proxyReq(res, N8N_HOST, N8N_PORT, pathname, u.search, method, buf, req);
});

server.listen(PORT, '0.0.0.0', () => {
  writeLog('n8n-table-ui proxy listening on ' + PORT + ' -> n8n ' + N8N_HOST + ':' + N8N_PORT);
  writeLog('data dir: ' + DATA_DIR);
});
