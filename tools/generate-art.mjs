#!/usr/bin/env node
// Generates missing images in assets/raw with Gemini through the media-pipeline CLI. Existing files are kept.
// Usage: node tools/generate-art.mjs [--only id,id] [--jobs 4] [--force]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import art from './art-manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'assets', 'raw');
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const FORCE = process.argv.includes('--force');
const JOBS = Number(arg('jobs') ?? 4);
const only = arg('only')?.split(',');

function findCli() {
  if (process.env.MEDIA_PIPELINE_CLI) return process.env.MEDIA_PIPELINE_CLI;
  const base = join(homedir(), '.claude/plugins/cache/media-pipeline-marketplace/media-pipeline');
  const version = readdirSync(base).sort().at(-1);
  return join(base, version, 'mcp-server/build/cli.bundle.js');
}
const CLI = findCli();
mkdirSync(RAW, { recursive: true });

const queue = Object.entries(art).filter(([id]) => (!only || only.includes(id)) && (FORCE || !existsSync(join(RAW, `${id}.png`))));
console.log(`${queue.length} images to generate`);
let failed = 0;

function one(id, def) {
  return new Promise((resolve) => {
    const p = spawn('node', [CLI, '--prompt', def.prompt, '--output', join(RAW, `${id}.png`), '--aspect-ratio', def.aspect], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', () => {
      const ok = /"success":\s*true/.test(out);
      if (!ok) failed++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${id}${ok ? '' : `: ${out.slice(0, 300)}`}`);
      resolve();
    });
  });
}
await Promise.all(Array.from({ length: JOBS }, async () => {
  for (let next = queue.shift(); next; next = queue.shift()) await one(next[0], next[1]);
}));
console.log(failed ? `${failed} failed` : 'done');
process.exit(failed ? 1 : 0);
