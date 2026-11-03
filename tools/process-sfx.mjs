#!/usr/bin/env node
// Trims, levels and encodes the recordings in tools/sfx-manifest.mjs into assets/audio, which git ignores.
// Usage: npm run sfx:process [-- <sourceDir>]. Needs ffmpeg with libopus.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SFX } from './sfx-manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.argv[2] ?? join(ROOT, '.cache/sfx-candidates/files');
const OUT = join(ROOT, 'assets/audio');
const RATE = 48000;
const MAX_PEAK = -1; // dB. Limits the boost, so a take with a sharp transient can end up below its level.
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));

/** Peak and loudest 100 ms RMS of a take, in dB. */
function measure(file, start, end) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-af', `atrim=${start}:${end}`, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const s = new Float32Array(raw.buffer, raw.byteOffset, raw.length >> 2);
  const win = Math.min(RATE / 10, s.length);
  let sum = 0, loudest = 0, peak = 0;
  for (let i = 0; i < s.length; i++) {
    sum += s[i] * s[i];
    if (i >= win) sum -= s[i - win] * s[i - win];
    if (i >= win - 1) loudest = Math.max(loudest, sum / win);
    peak = Math.max(peak, Math.abs(s[i]));
  }
  return { peak: db(peak), rms: db(Math.sqrt(loudest)) };
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const index = {};
for (const [id, sfx] of Object.entries(SFX)) {
  const src = join(SOURCE, sfx.file);
  index[id] = sfx.takes.map(([start, end], i) => {
    const name = sfx.takes.length > 1 ? `${id}-${i + 1}.ogg` : `${id}.ogg`;
    const { peak, rms } = measure(src, start, end);
    const gain = Math.min(sfx.level - rms, MAX_PEAK - peak);
    const fade = Math.min(0.06, (end - start) * 0.2);
    const filter = `atrim=${start}:${end},asetpts=PTS-STARTPTS,volume=${gain.toFixed(2)}dB,afade=t=in:d=0.003,afade=t=out:st=${(end - start - fade).toFixed(3)}:d=${fade.toFixed(3)}`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', filter, '-ar', String(RATE), '-c:a', 'libopus', '-b:a', '96k', join(OUT, name)]);
    console.log(`${name.padEnd(14)} ${(end - start).toFixed(2)}s  level ${(rms + gain).toFixed(1)} dB (asked ${sfx.level})  gain ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB`);
    return name;
  });
}
writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
