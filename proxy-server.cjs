const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('node:crypto');
const RUNNING_SERVER_HASH = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');

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
const COMFYUI_HOST = process.env.COMFYUI_HOST || '10.0.0.157';
const COMFYUI_PORT = parseInt(process.env.COMFYUI_PORT, 10) || 8188;
const COMFYUI_TOKEN_FILE = process.env.COMFYUI_TOKEN_FILE;

function proxyReq(res, host, port, pathname, search, method, body, incoming) {
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': body.length,
    'Host': host + ':' + port,
  };
  // Only send the key when one is actually configured — an undefined header
  // value makes http.request throw and would break every proxied call.
  // CRUD webhooks are not REST endpoints. Do not attach an administrator API
  // key to unauthenticated webhook calls (nor proxy arbitrary REST routes).
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
  // Bound buffered JSON requests before forwarding; never send partial bodies.
  const maxBodyBytes = 1024 * 1024;
  const body = [];
  let bodyBytes = 0;
  try {
    for await (const chunk of req) {
      bodyBytes += chunk.length;
      if (bodyBytes > maxBodyBytes) {
        res.writeHead(413, {'Content-Type':'application/json','Connection':'close'});
        res.end(JSON.stringify({error:'payload_too_large',message:'Request body exceeds 1 MiB'}));
        return;
      }
      body.push(chunk);
    }
  } catch {
    if (!res.headersSent) res.writeHead(400, {'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'invalid_request',message:'Request body interrupted'}));
    return;
  }
  const buf = Buffer.concat(body, bodyBytes);

  // Dedicated deletion transport: fixed loopback or protected Unix socket only.
  // Browser credentials and helper HMAC keys never enter HTML or JS bundles.
  if (pathname.startsWith('/home-delete/')) {
    const reply = (status, data, extra={}) => {res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data));};
    const capabilities = pathname === '/home-delete/capabilities' && method === 'GET';
    const mutation = pathname === '/home-delete/delete' && method === 'POST';
    const login=pathname==='/home-delete/login' && method==='GET';
    if (!capabilities && !mutation && !login) return reply(404,{error:'unknown_route'});
    const trustedTLS=process.env.HOME_DELETE_TRUSTED_PROXY_IP && req.socket.remoteAddress===process.env.HOME_DELETE_TRUSTED_PROXY_IP && req.headers['x-forwarded-proto']==='https' && /^https:\/\/[^/]+$/.test(process.env.HOME_DELETE_TLS_ORIGIN||'');
    const origin=trustedTLS ? process.env.HOME_DELETE_TLS_ORIGIN : (req.socket.encrypted?'https://':'http://')+req.headers.host;
    if (mutation && req.headers.origin !== origin) return reply(403,{error:'forbidden_origin'});
    const privateFile = file => {
      const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
      try {const st=fs.fstatSync(fd);if (!st.isFile() || (st.mode & 0o077) || st.uid!==process.getuid()) throw Error('Private owned credential required');return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
    };
    let secret, credential;
    try {secret=privateFile(process.env.HOME_DELETE_SECRET_FILE);credential=privateFile(process.env.HOME_DELETE_BROWSER_AUTH_FILE).toString().trim();if(secret.length<32 || (!credential.startsWith('home-delete:') || credential.length<44))throw Error('Invalid credentials');}
    catch {return capabilities ? reply(200,{available:false,reason:'Output deletion backend is not activated'}) : reply(503,{error:'delete_unavailable'});}
    // Basic authentication must be protected by TLS or an SSH loopback tunnel.
    const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (!local && !req.socket.encrypted && !trustedTLS) return capabilities ? reply(200,{available:false,reason:'Authenticated TLS or local tunnel required'}) : reply(403,{error:'secure_transport_required'});
    const expected=Buffer.from('Basic '+Buffer.from(credential).toString('base64'));const actual=Buffer.from(req.headers.authorization||'');
    if(actual.length!==expected.length || !crypto.timingSafeEqual(actual,expected)) return capabilities ? reply(200,{available:false,reason:'Authenticated deletion session required'}) : reply(401,{error:'authentication_required'},{'WWW-Authenticate':'Basic realm="Home deletion", charset="UTF-8"'});
    if(login)return reply(200,{authenticated:true,message:'Return to Home and Refresh to check deletion capabilities.'});
    if(buf.length>65536)return reply(413,{error:'payload_too_large'});
    const target=capabilities?'/capabilities':'/delete';const stamp=String(Math.floor(Date.now()/1000));const nonce=crypto.randomBytes(16).toString('hex');
    const signature=crypto.createHmac('sha256',secret).update([method,target,stamp,nonce,crypto.createHash('sha256').update(buf).digest('hex')].join('\n')).digest('hex');
    const opts={method,path:target,headers:{'Content-Type':'application/json','Content-Length':buf.length,'X-Delete-Time':stamp,'X-Delete-Nonce':nonce,'X-Delete-Signature':signature}};
    if(process.env.HOME_DELETE_CONTROL_SOCKET)opts.socketPath=process.env.HOME_DELETE_CONTROL_SOCKET;
    else {opts.hostname='127.0.0.1';opts.port=3461;}
    const helper=http.request(opts,upstream=>{res.writeHead(upstream.statusCode,{'Content-Type':'application/json','Cache-Control':'no-store'});upstream.pipe(res);});
    helper.setTimeout(30000,()=>helper.destroy());helper.on('error',()=>{if(!res.headersSent)reply(capabilities?200:503,capabilities?{available:false,reason:'Deletion helper unavailable'}:{error:'delete_unavailable'});else res.end();});helper.end(buf);return;
  }

  if (pathname === '/updates/identity' && method === 'GET') {
    const file = fs.existsSync(HTML_OVERRIDE) ? HTML_OVERRIDE : path.join(__dirname, 'index.html');
    res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({serverHash:RUNNING_SERVER_HASH,uiHash:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
    return;
  }

  // Narrow host-worker transport: no Docker socket, shell, remote URL or host
  // path is accepted from the browser. Web apply requires explicit host opt-in.
  if (pathname === '/updates/check' || pathname === '/updates/apply') {
    const expected = pathname === '/updates/check' ? 'GET' : 'POST';
    const reject = (status, error) => { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify({error})); };
    if (method !== expected) return reject(405, 'Method not allowed');
    if (method === 'POST') {
      const origin = req.headers.origin;
      const protocol = req.socket.encrypted ? 'https:' : 'http:';
      if (origin !== protocol + '//' + req.headers.host) return reject(403, 'Same-origin browser request required');
    }
    const socketPath = process.env.UPDATE_CONTROL_SOCKET;
    if (!socketPath) return reject(503, 'Host updater is not configured');
    const headers = {'Content-Type':'application/json'};
    const target = pathname === '/updates/check' ? '/check?branch=' + encodeURIComponent(u.searchParams.get('branch') || '') : '/apply';
    const worker = http.request({socketPath, path:target, method, headers}, upstream => {
      res.writeHead(upstream.statusCode, {'Content-Type':'application/json','Cache-Control':'no-store'}); upstream.pipe(res);
    });
    worker.setTimeout(600000, () => worker.destroy());
    worker.on('error', () => { if (!res.headersSent) reject(503, 'Host updater unavailable; check host worker status'); else res.end(); });
    worker.end(method === 'POST' ? buf : undefined);
    return;
  }

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

  // Narrow download-only route to a configured host. Never accept a destination
  // URL from the browser or follow redirects with the bearer credential.
  if (pathname === '/media/comfy/view' && method === 'GET') {
    const query = u.searchParams;
    const filename = query.get('filename') || '';
    const subfolder = query.get('subfolder') || '';
    const type = query.get('type') || 'output';
    const fail = (status, message) => { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify({error:'media_unavailable',message})); };
    if ([...query.keys()].some(k => !['filename','subfolder','type'].includes(k) || query.getAll(k).length !== 1) || !filename || filename.length > 255 || /[/\\\x00-\x1f\x7f]/.test(filename) || ['.','..'].includes(filename) || subfolder.length > 1024 || subfolder.startsWith('/') || /[\\\x00-\x1f\x7f:]/.test(subfolder) || subfolder.split('/').some(x => x === '..' || x === '.') || !['input','output','temp'].includes(type)) { fail(400,'Use a filename, safe relative subfolder and input/output/temp type'); return; }
    if (!['10.0.0.157','127.0.0.1','localhost','comfyui'].includes(COMFYUI_HOST)) { fail(503,'Output destination is not allowlisted'); return; }
    const q = new URLSearchParams({filename,subfolder,type});
    const crypto = require('crypto');
    const cacheDir = path.join(DATA_DIR,'media-cache');
    const key = crypto.createHash('sha256').update(COMFYUI_HOST + ':' + COMFYUI_PORT + '/view?' + q).digest('hex');
    const cached = path.join(cacheDir,key + '.media');
    const metaPath = path.join(cacheDir,key + '.json');
    const types = new Set(['image/png','image/jpeg','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime','video/x-matroska']);
    const maxBytes = 512 * 1024 * 1024;
    const readCache = () => { try { const m=JSON.parse(fs.readFileSync(metaPath,'utf8')); const stat=fs.statSync(cached); if (types.has(m.contentType) && stat.size === m.size && stat.size > 0 && stat.size <= maxBytes) return m; } catch {} return null; };
    try {
      let meta = readCache();
      if (!meta) {
        // A single in-flight fill per key; only complete validated downloads commit.
        if (!server.mediaFills) server.mediaFills = new Map();
        let fill = server.mediaFills.get(key);
        if (!fill) {
          fill = (async () => {
            const token = fs.readFileSync(COMFYUI_TOKEN_FILE,'utf8').split(/\r?\n/)[0].trim();
            if (!token) throw Error('auth');
            fs.mkdirSync(cacheDir,{recursive:true});
            const tmp = cached + '.' + crypto.randomUUID() + '.tmp';
            let timer;
            try {
              const upstream = await new Promise((resolve,reject) => {
                const request = http.get({hostname:COMFYUI_HOST,port:COMFYUI_PORT,path:'/view?' + q,headers:{Authorization:'Bearer ' + token}},resolve);
                timer=setTimeout(()=>request.destroy(Error('deadline')),120000); timer.unref();
                request.setTimeout(30000,()=>request.destroy(Error('timeout'))); request.on('error',reject);
              });
              const contentType=String(upstream.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
              if (upstream.statusCode !== 200 || !types.has(contentType) || Number(upstream.headers['content-length'] || 0) > maxBytes) { upstream.destroy(); throw Error('invalid upstream'); }
              const out = await fs.promises.open(tmp,'wx',0o600); let size=0;
              try { for await (const chunk of upstream) { size+=chunk.length; if(size>maxBytes) { upstream.destroy(); throw Error('size'); } await out.writeFile(chunk); } await out.sync(); } finally { await out.close(); }
              if (!size || (upstream.headers['content-length'] && size !== Number(upstream.headers['content-length']))) throw Error('incomplete');
              await fs.promises.rename(tmp,cached);
              const metadata={contentType,size}; const mt=tmp+'.json';
              try { await fs.promises.writeFile(mt,JSON.stringify(metadata),{flag:'wx',mode:0o600}); await fs.promises.rename(mt,metaPath); } finally { await fs.promises.rm(mt,{force:true}); }
              return metadata;
            } finally { clearTimeout(timer); await fs.promises.rm(tmp,{force:true}); }
          })();
          server.mediaFills.set(key,fill);
          fill.finally(()=>server.mediaFills.delete(key)).catch(()=>{});
        }
        meta = await fill;
      }
      let start=0,end=meta.size-1,status=200;
      const headers={'Content-Type':meta.contentType,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'};
      if (req.headers.range) {
        const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (range && (range[1] || range[2])) {
          if (!range[1]) { start=Math.max(0,meta.size-Number(range[2])); } else {start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}
        }
        if (!range || (!range[1] && (!range[2] || Number(range[2])===0)) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>end || start>=meta.size) {res.writeHead(416,{'Content-Range':'bytes */'+meta.size});res.end();return;}
        status=206;headers['Content-Range']=`bytes ${start}-${end}/${meta.size}`;
      }
      headers['Content-Length']=end-start+1;
      res.writeHead(status,headers);
      const stream=fs.createReadStream(cached,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    } catch { if(!res.headersSent) fail(502,'Authenticated media download/cache unavailable'); else res.destroy(); }
    return;
  }

  // Fixed exact-row execution transports only. No URL, bulk, or review input.
  const dispatch = {
    '/dispatch/research': {path:'/webhook/Research',key:'Row'},
    '/dispatch/scene': {path:'/webhook/Production',key:'RowID'},
    '/dispatch/dispatcher': {path:'/webhook/Dispatcher',key:'RowID'},
    '/dispatch/runner': {path:'/webhook/yt-Test',key:'Id',post:true},
  }[pathname];
  if (dispatch && method === 'POST') {
    if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host && req.headers.origin !== 'https://' + req.headers.host) {
      res.writeHead(403, {'Content-Type':'application/json'});res.end(JSON.stringify({error:'forbidden_origin',message:'Same-origin access required'}));return;
    }
    let input;
    try { input=JSON.parse(buf.toString()); } catch {}
    if (!input || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.rowId !== 'string' || !/^[1-9]\d{0,14}$/.test(input.rowId) || u.search) {
      res.writeHead(400, {'Content-Type':'application/json'});res.end(JSON.stringify({error:'invalid_request',message:'Exactly one positive decimal string rowId is required'}));return;
    }
    // Fresh published workflows expose POST-only explicit bypass entries.
    const payload=Buffer.from(JSON.stringify({Id:input.rowId,ByPass:true}));
    proxyReq(res,N8N_HOST,N8N_PORT,dispatch.path,'','POST',payload,req);
    return;
  }

  // Explicit webhook-only contract. Review decisions are editor-only.
  const allowed = new Set(['/webhook/yt-get','/webhook/yt-create','/webhook/yt-wright','/webhook/yt-update','/webhook/yt-remove']);
  if (allowed.has(pathname) && method === 'POST') {
    if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host && req.headers.origin !== 'https://' + req.headers.host) {
      res.writeHead(403, {'Content-Type':'application/json'});
      res.end(JSON.stringify({error:'forbidden_origin',message:'Same-origin access required'}));
      return;
    }
    writeLog('-> ' + method + ' ' + pathname + '  n8n=' + N8N_HOST + ':' + N8N_PORT);
    proxyReq(res, N8N_HOST, N8N_PORT, pathname, u.search, method, buf, req);
    return;
  }

  res.writeHead(404, {'Content-Type':'application/json'});
  res.end(JSON.stringify({error:'not_found',message:'Only configured CRUD webhook routes are supported; review decisions require the authenticated editor'}));
});

server.listen(PORT, '0.0.0.0', () => {
  writeLog('n8n-table-ui proxy listening on ' + PORT + ' -> n8n ' + N8N_HOST + ':' + N8N_PORT);
  writeLog('data dir: ' + DATA_DIR);
});
