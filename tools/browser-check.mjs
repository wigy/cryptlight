#!/usr/bin/env node
// Drives the real game in headless Chrome over the DevTools protocol (no dependencies) and takes screenshots.
// Usage: node tools/browser-check.mjs <outDir> <script.mjs>; the script's default export gets {eval, click, key, wait, shot, errors}.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [outDir, scriptPath] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const PORT = 8123, DEBUG = 9333;
const profile = join(tmpdir(), `cryptlight-chrome-${process.pid}`);
const server = spawn('node', ['tools/serve.mjs'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: join(profile, 'server-data') }, stdio: 'ignore' }); // Never the real save.
const chrome = spawn(process.env.CHROME ?? 'google-chrome', ['--headless=new', `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 1;
try {
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    await sleep(200);
    try { page = (await (await fetch(`http://127.0.0.1:${DEBUG}/json`)).json()).find((t) => t.type === 'page'); } catch { /* still starting */ }
  }
  if (!page) throw new Error('Chrome did not start');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400 && !m.params.response.url.includes('/assets/audio/')) errors.push(`${m.params.response.status} ${m.params.response.url}`);
  };
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const api = {
    errors, sleep,
    wait: sleep,
    eval: async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
      return r.result?.result?.value;
    },
    click: async (x, y) => {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, pointerType: 'mouse' });
    },
    key: async (code) => {
      // The browser's own handling of Escape, such as closing a dialog, needs the virtual key code.
      const vk = code === 'Escape' ? { key: code, windowsVirtualKeyCode: 27 } : {};
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code, ...vk });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code, ...vk });
    },
    shot: async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.result.data, 'base64'));
    },
  };
  const script = (await import(pathToFileURL(resolve(scriptPath)).href)).default;
  await script(api);
  console.log(errors.length ? `browser errors:\n${errors.join('\n')}` : 'no browser errors');
  code = errors.length ? 1 : 0;
} catch (err) {
  console.error(err);
} finally {
  chrome.kill(); server.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
  process.exit(code);
}
