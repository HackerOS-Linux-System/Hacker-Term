import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const SKIP_DIRS = new Set(['node_modules', 'src', 'test', 'scripts', '.git']);
const SKIP_FILES = new Set(['package.json', 'package-lock.json', 'build.mjs', 'tsconfig.json', '.DS_Store']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p, out); continue; }
    if (SKIP_FILES.has(name) || name.endsWith('.map') || name.endsWith('-LICENSE')) continue;
    out.push(p);
  }
  return out;
}

const files = walk(join(root, 'frontend'));
const icon = join(root, 'images', 'logo.png');
if (existsSync(icon)) files.push(icon);
if (!files.some((f) => f.endsWith(`dist${sep}app.js`))) { console.error('embed: brak frontend/dist/app.js — uruchom najpierw build'); process.exit(1); }

let body = '';
let total = 0;
for (const f of files) {
  const rel = relative(root, f).split(sep).join('/');
  const b64 = readFileSync(f).toString('base64');
  total += b64.length;
  body += `    app::register_asset("${rel}", "${b64}")\n`;
}
const text =
  ';; GENEROWANY przez frontend/scripts/embed.mjs (format `silver embed`) — nie edytuj ręcznie.\n' +
  `;; ${files.length} plików: frontend/ + images/logo.png. Woła je main() przez assets_gen::install().\n` +
  'use "bit -> silver" from "silver"\n\n' +
  'pub fn install() -> int is\n' + body + '    return app::embedded_count()\nend\n';
const out = join(root, 'src', 'assets_gen.h#');
const same = existsSync(out) && readFileSync(out, 'utf8') === text;
if (!same) writeFileSync(out, text);
console.log(`embed: ${files.length} plików, ${(total / 1024) | 0} KiB base64 → src/assets_gen.h#${same ? ' (bez zmian)' : ''}`);
