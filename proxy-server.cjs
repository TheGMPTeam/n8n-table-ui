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

  // Route /api/* to server.js (port 3456) — reads n8n SQLite directly
  if (pathname.startsWith('/api/')) {
    proxyReq(res, API_BASE, API_PORT, pathname, u.search, method, buf, req);
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
