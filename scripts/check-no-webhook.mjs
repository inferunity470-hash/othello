#!/usr/bin/env node
/**
 * CI guard: ensure no error-reporting webhook URL is inlined into the
 * production bundle. The app's privacy policy declares "no server
 * communication" — if VITE_ERROR_WEBHOOK_URL was set at build time, the
 * URL would be replaced into the bundle by Vite, violating that promise.
 *
 * Run after `npm run build`.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const DIST = 'dist/assets';
const SUSPICIOUS = [
  /https?:\/\/[^"'`\s]+\.(?:webhook|hooks)\b/i,
  /https?:\/\/hooks\.slack\.com/i,
  /https?:\/\/[^"'`\s]*sentry\.io/i,
  /https?:\/\/[^"'`\s]*logflare/i,
  /https?:\/\/[^"'`\s]*datadog/i,
];

const files = (await readdir(DIST)).filter(f => f.endsWith('.js'));
let bad = 0;
for (const f of files) {
  const text = await readFile(path.join(DIST, f), 'utf8');
  for (const re of SUSPICIOUS) {
    const m = text.match(re);
    if (m) {
      console.error(`::error file=${DIST}/${f}::suspicious URL inlined: ${m[0]}`);
      bad++;
    }
  }
}

if (bad > 0) {
  console.error(`Found ${bad} suspicious URL(s) in production bundle.`);
  process.exit(1);
}
console.log('OK: no webhook URLs inlined in production bundle.');
