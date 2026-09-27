import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3456;
const DB_PATH = 'G:/Docker/n8n/database.sqlite';

const TABLE_SCHEMAS = {};
const TABLE_IDS = {};
let db;

function q(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params && params.length) return stmt.all(params);
  return stmt.all();
}

function initDb() {
  db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = WAL');
  refreshSchema();
}

async function refreshSchema() {
  const rows = q("SELECT id,name FROM data_table");
  for (const t of rows) {
    TABLE_IDS[t.name] = t.id;
    const cols = q(`PRAGMA table_info(data_table_user_${t.id})`);
    TABLE_SCHEMAS[t.name] = cols.map(c => c.name);
  }
  console.log('tables', Object.keys(TABLE_IDS));
  console.log('schemas', TABLE_SCHEMAS);
}

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

const mimes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (pathname === '/api/tables') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ tables: Object.keys(TABLE_IDS), schemas: TABLE_SCHEMAS }));
  }

  if (pathname === '/api/rows' && req.method === 'GET') {
    const table = url.searchParams.get('table');
    if (!table || !TABLE_IDS[table]) { res.writeHead(400).end(JSON.stringify({ error: 'missing table' })); return; }
    const userTable = `data_table_user_${TABLE_IDS[table]}`;
    const schema = TABLE_SCHEMAS[table] || [];
    const rows = q(`SELECT rowid as _rowid, ${schema.map(s => `"${s}"`).join(',')} FROM ${userTable} ORDER BY rowid DESC LIMIT 500`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ columns: schema, rows }));
  }

  if (pathname === '/api/rows' && req.method === 'POST') {
    const table = url.searchParams.get('table');
    if (!table || !TABLE_IDS[table]) { res.writeHead(400).end(JSON.stringify({ error: 'missing table' })); return; }
    const chunks = [];
    for await (const d of req) chunks.push(d);
    const body = Buffer.concat(chunks).toString();
    try {
      const { row } = JSON.parse(body || '{}');
      const schema = TABLE_SCHEMAS[table] || [];
      const userTable = `data_table_user_${TABLE_IDS[table]}`;
      const cols = schema.filter(c => row[c] !== undefined);
      const placeholders = cols.map(() => '?').join(',');
      const values = cols.map(c => (typeof row[c] === 'boolean' ? (row[c] ? 1 : 0) : row[c]));
      const sql = `INSERT INTO ${userTable} (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${placeholders})`;
      const info = db.prepare(sql).run(values);
      const newRow = q(`SELECT rowid as _rowid, ${schema.map(s=>`"${s}"`).join(',')} FROM ${userTable} WHERE rowid=?`, [info.lastInsertRowid]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, row: newRow[0] }));
    } catch (e) {
      res.writeHead(500).end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if (pathname === '/api/rows' && req.method === 'PATCH') {
    const table = url.searchParams.get('table');
    if (!table || !TABLE_IDS[table]) { res.writeHead(400).end(JSON.stringify({ error: 'missing table' })); return; }
    const chunks = [];
    for await (const d of req) chunks.push(d);
    const body = Buffer.concat(chunks).toString();
    try {
      const { id, row } = JSON.parse(body || '{}');
      const schema = TABLE_SCHEMAS[table] || [];
      const userTable = `data_table_user_${TABLE_IDS[table]}`;
      const setCols = schema.filter(c => row[c] !== undefined).map(c => `"${c}" = ?`).join(', ');
      const values = schema.filter(c => row[c] !== undefined).map(c => (typeof row[c] === 'boolean' ? (row[c] ? 1 : 0) : row[c]));
      values.push(id);
      db.prepare(`UPDATE ${userTable} SET ${setCols} WHERE rowid = ?`).run(values);
      const updated = q(`SELECT rowid as _rowid, ${schema.map(s=>`"${s}"`).join(',')} FROM ${userTable} WHERE rowid=?`, [id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, row: updated[0] }));
    } catch (e) {
      res.writeHead(500).end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if (pathname === '/api/rows' && req.method === 'DELETE') {
    const table = url.searchParams.get('table');
    if (!table || !TABLE_IDS[table]) { res.writeHead(400).end(JSON.stringify({ error: 'missing table' })); return; }
    const chunks = [];
    for await (const d of req) chunks.push(d);
    const body = Buffer.concat(chunks).toString();
    try {
      const { id } = JSON.parse(body || '{}');
      const userTable = `data_table_user_${TABLE_IDS[table]}`;
      db.prepare(`DELETE FROM ${userTable} WHERE rowid = ?`).run(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500).end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  // static
  const ext = path.extname(pathname) || '.html';
  const rel = pathname === '/' ? '/index.html' : pathname;
  const full = path.join(__dirname, decodeURIComponent(rel));
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404).end('not found'); return; }
  const data = fs.readFileSync(full);
  res.writeHead(200, { 'Content-Type': (mimes[ext] || 'application/octet-stream') }).end(data);
});

initDb();
server.listen(PORT, '0.0.0.0', () => console.log(`n8n table UI on http://localhost:${PORT}`));
