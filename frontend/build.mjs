import { build, context } from 'esbuild';
import { solidPlugin } from 'esbuild-plugin-solid';

const watch = process.argv.includes('--watch');
const options = {
  entryPoints: ['src/index.tsx'],
  outfile: 'dist/app.js',
  bundle: true,
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  minify: !watch,
  sourcemap: false,
  conditions: ['browser'],
  plugins: [solidPlugin()],
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching…');
} else {
  await build(options);
}
