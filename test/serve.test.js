// The server keeps the one save slot in DATA_DIR, and doesn't hand that directory out as a static file.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const PORT = 8131, BASE = `http://127.0.0.1:${PORT}`, SAVE = `${BASE}/api/save`;
mkdirSync('.cache', { recursive: true });
const dataDir = mkdtempSync(join('.cache', 'serve-test-')); // Inside the project, to show it's still not served.
let server;

before(async () => {
  server = spawn('node', ['tools/serve.mjs'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('server did not start');
});
after(() => {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

const put = (body) => fetch(SAVE, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });

test('a save goes to the data directory and comes back', async () => {
  assert.equal((await fetch(SAVE)).status, 204, 'nothing saved yet');
  assert.equal((await put('{"a":1}')).status, 204);
  assert.equal(readFileSync(join(dataDir, 'save.json'), 'utf8'), '{"a":1}');
  const r = await fetch(SAVE);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '{"a":1}');
  assert.equal((await put('{"a":2}')).status, 204);
  assert.equal(await (await fetch(SAVE)).text(), '{"a":2}', 'a new save replaces the old one');
  assert.ok(!existsSync(join(dataDir, 'save.json.tmp')));
});

test('a bad save is refused and leaves the existing one alone', async () => {
  assert.equal((await put('{"keep":true}')).status, 204);
  assert.equal((await put('not json')).status, 400);
  assert.equal((await put(`"${'x'.repeat(9 * 1024 * 1024)}"`)).status, 413);
  assert.equal(await (await fetch(SAVE)).text(), '{"keep":true}');
  assert.equal((await fetch(SAVE, { method: 'DELETE' })).status, 405);
});

test('the data directory is not served as files', async () => {
  assert.equal((await put('{}')).status, 204);
  assert.equal((await fetch(`${BASE}/${dataDir}/save.json`)).status, 403);
});
