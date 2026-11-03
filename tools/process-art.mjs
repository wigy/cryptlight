#!/usr/bin/env node
// Hands the art manifest to the Python image processor.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import art, { ICONS } from './art-manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync('python3', [join(here, 'process-art.py')], { input: JSON.stringify({ art, icons: ICONS }), stdio: ['pipe', 'inherit', 'inherit'] });
process.exit(r.status ?? 1);
