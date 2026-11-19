#!/usr/bin/env node
// Compile a layout into a model with the engine.
//
//   node scripts/compile_design.mjs layout.json > layout.model.json
//   node scripts/compile_design.mjs layout.json --library web/assets/library.json
//
// The model records the git hash it was produced with (suffixed "-modified"
// when tracked files have uncommitted changes). A layout with `derive` runs
// the library's derived modules, whose code is read from
// library/modules/<id>/derive.js. Issues go into the model;
// the exit status is 1 only if the model has errors, 2 for unusable input.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileDesign } from '../web/js/engine/compile_design.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function gitHash() {
  try {
    const run = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    const hash = run(['rev-parse', 'HEAD']);
    return run(['status', '--porcelain', '--untracked-files=no']) ? `${hash}-modified` : hash;
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
const libraryAt = args.indexOf('--library');
const libraryPath = libraryAt >= 0 ? args[libraryAt + 1] : join(root, 'web', 'assets', 'library.json');
const layoutPath = args.find((a, i) => !a.startsWith('--') && !(libraryAt >= 0 && i === libraryAt + 1));
if (!layoutPath) {
  console.error('usage: node scripts/compile_design.mjs layout.json [--library library.json]');
  process.exit(2);
}

let model;
try {
  const layout = JSON.parse(readFileSync(layoutPath, 'utf8'));
  const asset = JSON.parse(readFileSync(libraryPath, 'utf8'));
  const derived = {};
  if (layout.derive !== undefined) {
    for (const [id, module] of Object.entries(asset.modules)) {
      const code = join(root, 'library', 'modules', id, 'derive.js');
      if (module.derived && existsSync(code)) derived[id] = await import(pathToFileURL(code).href);
    }
  }
  model = compileDesign(layout, asset, { git: gitHash(), derived });
} catch (err) {
  console.error(`compile_design: ${err.message}`);
  process.exit(2);
}
process.stdout.write(`${JSON.stringify(model, null, 1)}\n`);
for (const i of model.issues) console.error(`${i.severity}: ${i.rule}: ${i.message}`);
// exitCode, not exit(): exiting at once would cut off output still being
// written to a pipe.
process.exitCode = model.issues.some(i => i.severity === 'error') ? 1 : 0;
