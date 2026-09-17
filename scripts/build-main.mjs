#!/usr/bin/env node
// Bundles the main process and the preload into dist/main.
//
// Both run in Electron's Node side, so they are built as CommonJS with `electron` left
// as a require. The preload is bundled rather than shipped as several files because a
// sandboxed preload cannot require anything except electron.
//
//   node scripts/build-main.mjs [--watch] [--minify]
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Electron 44 ships Node 22.
  target: 'node22',
  external: ['electron'],
  alias: { '@shared': path.join(root, 'src/shared') },
  sourcemap: watch ? 'inline' : false,
  minify,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': JSON.stringify(minify ? 'production' : 'development') },
  logLevel: 'warning',
};

const targets = [
  { entry: 'src/main/main.ts', out: 'dist/main/main.js' },
  { entry: 'src/preload/preload.ts', out: 'dist/main/preload.js' },
];

const configs = targets.map((t) => ({
  ...common,
  entryPoints: [path.join(root, t.entry)],
  outfile: path.join(root, t.out),
}));

if (watch) {
  const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('build:main watching for changes');
} else {
  await Promise.all(configs.map((c) => esbuild.build(c)));
  console.log(`build:main ${targets.map((t) => t.out).join(', ')}`);
}
