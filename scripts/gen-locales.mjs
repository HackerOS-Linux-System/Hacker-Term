import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'locales');
const skip = new Set(['index', '_all', 'locale']);
const names = readdirSync(dir).filter((f) => f.endsWith('.ts') && !skip.has(f.slice(0, -3))).map((f) => f.slice(0, -3)).sort();
const out = [
  '// PLIK GENEROWANY przez scripts/gen-locales.mjs — nie edytuj ręcznie.',
  "import type { LocaleModule } from './locale';",
  ...names.map((n) => `import ${n} from './${n}';`),
  `export const ALL_LOCALES: LocaleModule[] = [${names.join(', ')}];`,
  '',
].join('\n');
writeFileSync(join(dir, '_all.ts'), out);
console.log('locales:', names.join(', '));
