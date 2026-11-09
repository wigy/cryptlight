#!/usr/bin/env node
// Minimal server for local play: `npm start`. Serves the game's files and keeps the save in DATA_DIR.
import { createReadStream, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '127.0.0.1'; // Local only unless asked: the Docker image sets 0.0.0.0.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg' };
const DATA_DIR = resolve(process.env.DATA_DIR ?? join(ROOT, '.data')); // Kept apart from data/, which holds the SRD and is served to everyone.
const SAVE_FILE = join(DATA_DIR, 'save.json');
const MAX_SAVE_BYTES = 8 * 1024 * 1024;

/** The one save slot: GET gives 200 with the save or 204 if there is none, PUT replaces it. */
function handleSave(req, res) {
  if (req.method === 'GET') {
    let json;
    try { json = readFileSync(SAVE_FILE); } catch (e) { res.writeHead(e.code === 'ENOENT' ? 204 : 500).end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(json);
    return;
  }
  if (req.method !== 'PUT') { res.writeHead(405, { Allow: 'GET, PUT' }).end(); return; }
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size <= MAX_SAVE_BYTES) chunks.push(chunk);
  });
  req.on('end', () => {
    if (size > MAX_SAVE_BYTES) { res.writeHead(413).end(); return; }
    const body = Buffer.concat(chunks);
    try { JSON.parse(body.toString()); } catch { res.writeHead(400).end(); return; }
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(`${SAVE_FILE}.tmp`, body); // Then rename, so a crash mid-write can't ruin the existing save.
      renameSync(`${SAVE_FILE}.tmp`, SAVE_FILE);
      res.writeHead(204).end();
    } catch (e) {
      console.error(e);
      res.writeHead(500).end();
    }
  });
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/api/save') { handleSave(req, res); return; }
  const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
  if (file === DATA_DIR || file.startsWith(DATA_DIR + sep)) { res.writeHead(403).end(); return; }
  try {
    if (!statSync(file).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, HOST, () => console.log(`Cryptlight running at http://localhost:${PORT}`));

// Node ignores these by default when it runs as a container's main process, which makes `docker stop` hang.
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
