#!/usr/bin/env node
// Library builder: library/ -> web/assets/library.json (the builder itself is
// web/js/library/builder.js; this gives it the file system).
//
//   node scripts/build_library.mjs [--root .] [--verify]
//
// Exit status 1 if there are errors (nothing is written), or with --verify if
// the committed library.json differs from a fresh build.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSET, build, dumps, problemText } from '../web/js/library/builder.js';

/** The builder's view of a library on disk, under root. */
export function fileSource(root) {
  const abs = rel => join(root, rel);
  const list = (rel, keep) => {
    try {
      return readdirSync(abs(rel)).filter(name => keep(join(abs(rel), name), name)).sort();
    } catch {
      return [];
    }
  };
  return {
    read: rel => readFileSync(abs(rel), 'utf8'),
    isFile: rel => existsSync(abs(rel)) && statSync(abs(rel)).isFile(),
    dirs: rel => list(rel, path => statSync(path).isDirectory()),
    files: (rel, suffix) => list(rel, (path, name) => name.endsWith(suffix) && statSync(path).isFile()),
    importCode: rel => import(pathToFileURL(resolve(abs(rel))).href),
  };
}

/** Build the library under root; returns the builder's result. */
export function buildAt(root, options = {}) {
  return build(fileSource(root), options);
}

async function main(argv) {
  const at = argv.indexOf('--root');
  const root = at >= 0 ? argv[at + 1] : '.';
  const verify = argv.includes('--verify');
  const result = await buildAt(root);
  for (const problem of result.problems.items) console.log(problemText(problem));
  if (!result.asset) {
    console.log(`${result.problems.errors.length} error(s), ${result.problems.warnings.length} warning(s)`);
    return 1;
  }
  const text = dumps(result.asset);
  const path = join(root, ASSET);
  if (verify) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
      console.log(`${ASSET} is out of date; run node scripts/build_library.mjs`);
      return 1;
    }
    console.log(`${ASSET} is up to date`);
    return 0;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  let baked = 0;
  for (const systems of result.baked.values()) for (const entries of systems.values()) baked += entries.length;
  console.log(`wrote ${ASSET}: ${result.lib.systems.size} system(s), ${result.compiled.size} compiled variant(s), ${baked} baked implementation(s)`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
