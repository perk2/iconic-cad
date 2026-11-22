// The library builder (web/js/library/builder.js, scripts/build_library.mjs)
// and the library.
//
//   node tests/library_builder.mjs                     # the tests
//   node tests/library_builder.mjs --write-fixtures    # tests/fixtures/engine/library_variants.json
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildAt } from '../scripts/build_library.mjs';
import { ASSET, checkRuleTable, dumps, problemText, ruleTransform } from '../web/js/library/builder.js';
import { contact } from '../web/js/library/geometry.js';
import { fromFrame, toFrame } from '../web/js/library/frames.js';
import {
  BROKEN, CALIFORNIA, COMPILER, CORNER_SEH, OPENING_SCHEMA, OPENING_VARIANTS, SYSTEM, WALLS, WALL_SCHEMA, WALL_VARIANTS,
} from './library_broken_cases.mjs';

const SOURCES = ['library/joint_types.yaml', 'library/systems', 'library/modules', 'library/interfaces'];
const VARIANTS_FIXTURE = 'tests/fixtures/engine/library_variants.json';
const dirs = [];
process.on('exit', () => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** A copy of the library source (and, for edits to it, the library core). */
function copyLibrary({ core = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'library-builder-'));
  dirs.push(dir);
  for (const rel of SOURCES) cpSync(rel, join(dir, rel), { recursive: true });
  if (core) {
    cpSync('web/js/library', join(dir, 'web/js/library'), { recursive: true });
    cpSync('web/js/engine', join(dir, 'web/js/engine'), { recursive: true });
    cpSync('web/vendor', join(dir, 'web/vendor'), { recursive: true });
  }
  return dir;
}
function edit(dir, rel, old, replacement) {
  const path = join(dir, rel);
  const text = readFileSync(path, 'utf8');
  assert.ok(text.includes(old), `test setup: ${JSON.stringify(old)} not found in ${rel}`);
  writeFileSync(path, text.replace(old, replacement));
}
/** Build a copy with (rel, old, new) edits; edits to the core use an edited core. */
async function copyWith(...edits) {
  const core = edits.some(([rel]) => rel.startsWith('web/'));
  const dir = copyLibrary({ core });
  for (const [rel, old, replacement] of edits) edit(dir, rel, old, replacement);
  const options = core ? { core: (await import(pathToFileURL(resolve(dir, 'web/js/library/core.js')).href)).CORE } : {};
  return buildAt(dir, options);
}
const broken = (rel, old, replacement) => copyWith([rel, old, replacement]);
const messages = result => result.problems.items.map(problemText);
const noProblems = result => assert.deepEqual(messages(result), []);
const some = (result, text) => assert.ok(messages(result).some(m => m.includes(text)), `${text}\n${messages(result).join('\n')}`);
const compiled = (result, module, variant) => result.compiled.get(`${module}|seh_no|${variant}`);
const baked = (result, iface) => result.baked.get(iface).get('seh_no');
// Pairs of plain wall panels; wallsOnly: of the 1200 variant only.
const allWalls = entries => entries.filter(e => Object.values(e.participants).every(p => p.module === 'wall_panel'));
const wallsOnly = entries => allWalls(entries).filter(e => Object.values(e.participants).every(p => p.variant === '1200'));
const roles = out => {
  const counts = {};
  for (const p of out.parts) counts[p.role] = (counts[p.role] ?? 0) + 1;
  return counts;
};

/**
 * A copy whose window_10x12 variant has the given values, and optionally
 * another rough opening; without the door variant (its head, on the bottom
 * plate, sits higher than these window cases allow).
 */
async function openingCopy(variant, catalog = null) {
  const dir = copyLibrary();
  const path = join(dir, OPENING_VARIANTS);
  let text = readFileSync(path, 'utf8');
  const old = '  window_10x12:\n    width: 1800\n    unit: window_10x12\n    sill_height: 838\n';
  assert.ok(text.includes(old));
  const own = Object.fromEntries(Object.entries(variant).filter(([k]) => !['height', 'spacing'].includes(k)));
  const fields = { width: 1800, unit: 'window_10x12', sill_height: 790, ...own };
  text = text.replace(old, '  window_10x12:\n' + Object.entries(fields).map(([k, v]) => `    ${k}: ${v}\n`).join(''));
  const door = '  door_10x20:\n    width: 1800\n    unit: door_10x20\n    sill_height: 48\n    status: draft\n';
  assert.ok(text.includes(door));
  text = text.replace(door, '');
  for (const key of ['height', 'spacing']) { // set in fixed
    if (key in variant) text = text.replace(new RegExp(`^  ${key}: \\d+`, 'm'), `  ${key}: ${variant[key]}`);
  }
  writeFileSync(path, text);
  if (catalog) {
    const [w, h] = catalog;
    edit(dir, SYSTEM, 'window_10x12: {size: [990, 1190], rough_opening: [1010, 1210]}',
      `window_10x12: {size: [${w - 20}, ${h - 20}], rough_opening: [${w}, ${h}]}`);
  }
  return buildAt(dir);
}
/** Every touching pair has a joint (sheet contacts under 20 mm wide can't be nailed). */
function assertJoined(out) {
  const joined = new Set(out.joints.map(j => Object.values(j.parts).sort().join('|')));
  const parts = out.parts;
  for (let i = 0; i < parts.length; i++) {
    for (const b of parts.slice(i + 1)) {
      const a = parts[i];
      if (a.layer && b.layer) continue;
      const c = contact(a.box, b.box);
      if (c.axis === null) continue;
      let ok = joined.has([a.id, b.id].sort().join('|'));
      if (a.layer || b.layer) {
        const sizes = [0, 1, 2].map(k => c.face.max[k] - c.face.min[k]).sort((p, q) => p - q);
        ok ||= sizes[1] < 20;
      }
      assert.ok(ok, `${a.id} and ${b.id} touch with no joint`);
    }
  }
}

/** The variants copy for the engine tests: wall variants 1200, 600 and 1200_tall. */
async function buildVariantsAsset() {
  const dir = copyLibrary();
  rmSync(join(dir, 'library/modules/wall_panel_with_opening'), { recursive: true });
  edit(dir, WALL_VARIANTS, '  height: 2400            # one sheet height\n', '');
  edit(dir, WALL_VARIANTS, '  "1200":\n    width: 1200\n    status: draft\n',
    '  "1200":\n    width: 1200\n    height: 2400\n    status: draft\n');
  edit(dir, WALL_VARIANTS, '    width: 600\n    status: draft\n',
    '    width: 600\n    height: 2400\n    status: draft\n'
    + '  "1200_tall":\n    width: 1200\n    height: 2700\n    status: draft\n');
  const result = await buildAt(dir);
  assert.ok(result.asset, messages(result).join('\n'));
  return dumps(result.asset);
}
if (process.argv.includes('--write-fixtures')) {
  writeFileSync(VARIANTS_FIXTURE, await buildVariantsAsset());
  console.log(`wrote ${VARIANTS_FIXTURE}`);
  process.exit(0);
}

// ---- the real library -------------------------------------------------------
const built = await buildAt('.');
noProblems(built);
assert.ok(built.asset);

{ // the wall variant resolves
  const r = built.resolved.find(x => x.module === 'wall_panel' && x.variant === '1200');
  assert.equal(r.default, true);
  const p = r.params;
  assert.equal(p.width, 1200); assert.equal(p.height, 2400); assert.equal(p.spacing, 600);
  assert.deepEqual(p.stud, { id: '48x148', section: [48, 148], grade: 'C24' });
  const bracing = p.buildup.face_a[0];
  assert.deepEqual([bracing.role, bracing.stage, bracing.thickness, bracing.sheet.size], ['bracing', 'workshop', 12, [1200, 2400]]);
  // Open panels: only the bracing sheet is a workshop layer.
  assert.deepEqual(['face_a', 'cavity', 'face_b'].flatMap(g => p.buildup[g]).filter(l => l.stage === 'workshop').map(l => l.role), ['bracing']);
}
{ // the wall compiles
  const wall = compiled(built, 'wall_panel', '1200');
  // Workshop panel depth: bracing 12 + framing 148.
  assert.deepEqual(wall.size, { width: 1200, height: 2400, depth: 160, framing: 148 });
  const studs = wall.parts.filter(p => p.role === 'stud');
  assert.deepEqual(studs.map(p => p.box.min[0]), [0, 576, 1152]);
  for (const s of studs) {
    assert.equal(s.box.max[2] - s.box.min[2], 2256); // 2400 - 3 x 48
    assert.deepEqual([s.box.min[1], s.box.max[1]], [12, 160]);
  }
  const sheets = wall.parts.filter(p => p.role === 'bracing');
  assert.deepEqual(sheets.map(p => p.box), [{ min: [0, 0, 0], max: [1200, 12, 2400] }]);
  assert.deepEqual([...new Set(wall.parts.map(p => p.stage))], ['workshop']);
  // 3 studs x 2 plates, sheet to 5 framing parts; the upper top plate is
  // fitted on site along the wall line, so the sheet's top 48 stands above
  // the panel's framing.
  assert.deepEqual(wall.parts.map(p => p.role).filter(r => r.endsWith('plate')).sort(), ['bottom_plate', 'top_plate']);
  const count = type => wall.joints.filter(j => j.type === type).length;
  assert.deepEqual([count('stud_to_plate'), count('top_plates'), count('sheathing_to_framing')], [6, 0, 5]);
  const right = wall.ports.right;
  // Ports sit on the framing's outer face, behind the 12 mm bracing sheet.
  assert.deepEqual(right.origin, [1200, 12, 0]);
  assert.deepEqual([right.normal, right.along, right.across], [[1, 0, 0], [0, 0, 1], [0, 1, 0]]);
  assert.deepEqual([right.hand, wall.ports.left.hand], ['right', 'left']);
  assert.deepEqual(right.exposes, { end_stud: 'stud_right', end_sheet: 'a1_bracing_1', bottom_plate: 'bottom_plate', top_plate: 'top_plate_lower' });
  assert.equal(wall.ports.left.exposes.end_stud, 'stud_left');
  // Exposed parts in the port frame: 48 back from the end, up the stud,
  // across the framing from its outer face.
  const parts = Object.fromEntries(wall.parts.map(p => [p.id, p]));
  for (const port of ['left', 'right']) {
    const frame = wall.ports[port];
    assert.deepEqual(toFrame(parts[frame.exposes.end_stud].box, frame), { min: [-48, 48, 0], max: [0, 2304, 148] });
  }
}
{ // the rule table
  assert.deepEqual(checkRuleTable(), []);
  assert.deepEqual(ruleTransform('corner', 160), { origin: [0, 0, 160], normal: [0, 0, -1], along: [0, 1, 0], across: [-1, 0, 0] });
  assert.deepEqual(ruleTransform('flush'), { origin: [0, 0, 0], normal: [-1, 0, 0], along: [0, 1, 0], across: [0, 0, 1] });
}
{ // the corner, baked for both hands
  const entries = wallsOnly(baked(built, 'wall_corner'));
  // Two right ends (or two left ends) would need a mirrored wall: not baked.
  assert.deepEqual(entries.map(e => [e.participants.through.port, e.participants.butt.port]).sort(), [['left', 'right'], ['right', 'left']]);
  const excluded = wallsOnly(built.excluded.get('wall_corner').get('seh_no'));
  assert.deepEqual(excluded.map(e => [e.participants.through.port, e.reason]).sort(), [['left', 'hands'], ['right', 'hands']]);
  for (const entry of entries) {
    assert.equal(entry.implementation, 'california');
    // The offset is the through wall's framing depth.
    assert.deepEqual(entry.transform, ruleTransform('corner', 148));
    const [turned, strip] = entry.parts;
    assert.deepEqual([turned.id, strip.id], ['turned_stud', 'sheathing_strip']);
    assert.ok(entry.parts.every(p => p.host === 'through' && p.stage === 'site'));
    // [normal, along, across]: the turned stud lies flat from the end stud
    // (-48) to 48 past the butt wall's inside face (-148), against the
    // through wall's inside framing face (148), between the plates.
    assert.deepEqual(turned.box, { min: [-196, 48, 100], max: [-48, 2304, 148] });
    // The strip: the bracing sheet (12) on the butt wall's face, from the
    // through wall's sheet face (-12) to the butt wall's end (148).
    assert.deepEqual(strip.box, { min: [0, 0, -12], max: [12, 2400, 148] });
    assert.deepEqual([strip.layer, strip.catalog], ['bracing', 'osb_12']);
    const throughEnd = `stud_${entry.participants.through.port}`, buttEnd = `stud_${entry.participants.butt.port}`;
    assert.deepEqual(entry.joints.map(j => j.type),
      ['corner_studs', 'corner_studs', 'backer_to_stud', 'backer_to_plate', 'backer_to_plate', 'sheathing_to_framing']);
    assert.deepEqual(entry.joints[0].parts, { stud: { of: 'butt', part: buttEnd }, backing: { of: 'through', part: throughEnd } });
    assert.deepEqual(entry.joints[1].parts, { stud: { of: 'butt', part: buttEnd }, backing: { of: 'implementation', part: 'turned_stud' } });
    // The strip on the end stud: 150 along its 2256 contact, 10 from each end: 16.
    assert.deepEqual(entry.joints[5].fasteners, { item: 'nail_25x60_ring', count: 16 });
    assert.ok(entry.joints.every(j => j.stage === 'site'));
  }
}
{ // the wall's joints, fastened
  const wall = compiled(built, 'wall_panel', '1200');
  assert.deepEqual(wall.joints.map(j => j.id), Array.from({ length: 11 }, (_, i) => `j${i + 1}`));
  assert.deepEqual(wall.joints[2].parts, { plate: 'bottom_plate', stud: 'stud_1' });
  assert.ok(wall.joints.every(j => j.stage === 'workshop'));
  const nails = {};
  for (const j of wall.joints) nails[j.fasteners.item] = (nails[j.fasteners.item] ?? 0) + j.fasteners.count;
  // 150 along the sheet's edges, 300 in the middle, 10 from each end; the
  // sheet's top edge lies on the upper top plate, so the lower one gets 300.
  assert.deepEqual(Object.fromEntries(wall.joints.filter(j => j.type === 'sheathing_to_framing').map(j => [j.parts.framing, j.fasteners.count])),
    { stud_left: 16, stud_1: 9, stud_right: 16, bottom_plate: 9, top_plate_lower: 5 });
  assert.deepEqual(nails, { nail_25x60_ring: 55, nail_28x95: 12 });
}
{ // the wall with an opening
  const win = compiled(built, 'wall_panel_with_opening', 'window_10x12');
  const door = compiled(built, 'wall_panel_with_opening', 'door_10x20');
  // Rough opening 1010 x 1210 centred in 1800 (x 395 to 1405), sill at 838.
  assert.deepEqual(roles(win), { bottom_plate: 1, top_plate: 1, stud: 2, king: 2, jack: 2, header: 2, sill: 1, cripple: 4, bracing: 6 });
  const boxes = Object.fromEntries(win.parts.map(p => [p.id, p.box]));
  assert.deepEqual(boxes.king_right, { min: [1453, 12, 48], max: [1501, 160, 2304] });
  // The header on the jacks, its underside the top of the opening (2048).
  assert.deepEqual(boxes.jack_left, { min: [347, 12, 48], max: [395, 160, 2048] });
  assert.deepEqual(boxes.header_outer, { min: [347, 12, 2048], max: [1453, 60, 2196] });
  assert.deepEqual(boxes.header_inner, { min: [347, 112, 2048], max: [1453, 160, 2196] });
  assert.deepEqual(boxes.sill, { min: [395, 12, 790], max: [1405, 160, 838] });
  // Cripples only at the grid positions 576 and 1176.
  assert.deepEqual(Object.keys(boxes).filter(i => i.startsWith('cripple')).sort(), ['cripple_bottom_1', 'cripple_bottom_2', 'cripple_top_1', 'cripple_top_2']);
  assert.deepEqual(boxes.cripple_bottom_1, { min: [576, 12, 48], max: [624, 160, 790] });
  assert.deepEqual(boxes.cripple_top_1, { min: [576, 12, 2196], max: [624, 160, 2304] });
  assert.ok(!Object.keys(boxes).some(i => /^stud_\d+$/.test(i)));
  const types = new Set(win.joints.map(j => j.type));
  for (const t of ['sill_to_jack', 'cripple_to_sill', 'cripple_to_header']) assert.ok(types.has(t));
  for (const t of ['header_to_plate', 'head_to_jack', 'head_to_header', 'cripple_to_jack']) assert.ok(!types.has(t));
  // Door: the bottom plate whole under the threshold, the opening on it; no sill.
  assert.deepEqual(roles(door), { bottom_plate: 1, top_plate: 1, stud: 2, king: 2, jack: 2, header: 2, cripple: 2, bracing: 6 });
  assert.deepEqual(door.parts.find(p => p.id === 'bottom_plate').box, { min: [0, 12, 0], max: [1800, 160, 48] });
  assert.deepEqual(door.parts.find(p => p.id === 'header_outer').box, boxes.header_outer);
  assert.equal(door.ports.right.exposes.bottom_plate, 'bottom_plate');
  assert.deepEqual(Object.keys(door.ports).sort(), ['left', 'right']);
  // Each sheet is one sheet with the opening cut out.
  const sheets = {};
  for (const p of win.parts.filter(q => q.role === 'bracing')) (sheets[p.sheet] ??= []).push([p.box.min[0], p.box.min[2], p.box.max[0], p.box.max[2]]);
  assert.deepEqual(sheets, {
    a1_bracing_sheet_1: [[0, 0, 1200, 838], [0, 2048, 1200, 2400], [0, 838, 395, 2048]],
    a1_bracing_sheet_2: [[1200, 0, 1800, 838], [1200, 2048, 1800, 2400], [1405, 838, 1800, 2048]],
  });
  // Edge spacing only along real edges.
  const counts = Object.fromEntries(win.joints.filter(j => j.type === 'sheathing_to_framing').map(j => [`${j.parts.sheet} ${j.parts.framing}`, j.fasteners.count]));
  assert.deepEqual([counts['a1_bracing_3 jack_left'], counts['a1_bracing_1 jack_left'], counts['a1_bracing_1 sill'],
    counts['a1_bracing_1 cripple_bottom_2'], counts['a1_bracing_1 cripple_bottom_1'], counts['a1_bracing_2 header_outer'],
    counts['a1_bracing_2 cripple_top_1']], [9, 4, 7, 6, 4, 7, 2]);
  // Jack to king: 2108 long, 50 from each end, at 300: 8.
  assert.deepEqual([...new Set(win.joints.filter(j => j.type === 'jack_to_king').map(j => j.fasteners.count))], [8]);
  assert.ok([...win.joints, ...door.joints].every(j => j.stage === 'workshop'));
}
{ // derived modules in the asset, with their parameters, no variants
  const wallLine = built.asset.modules.wall_line;
  assert.equal(wallLine.derived, true);
  assert.deepEqual(wallLine.systems.seh_no, { params: { max_piece: 2400, min_from_joint: 600 } });
  assert.deepEqual(wallLine.parameters.map(p => p.name), ['max_piece', 'min_from_joint']);
  assert.deepEqual(built.asset.modules.storey.systems.seh_no, { params: {} });
  assert.ok(![...built.compiled.keys()].some(k => /^(wall_line|storey|floor)\|/.test(k)));
}
{ // every compiled variant: touching parts are joined (sheets meeting at a seam excepted)
  for (const [key, out] of built.compiled) {
    const joined = new Set(out.joints.map(j => Object.values(j.parts).sort().join('|')));
    for (let i = 0; i < out.parts.length; i++) {
      for (const b of out.parts.slice(i + 1)) {
        const a = out.parts[i];
        if (a.layer && b.layer) continue;
        if (contact(a.box, b.box).axis !== null) assert.ok(joined.has([a.id, b.id].sort().join('|')), `${key}: ${a.id} ${b.id}`);
      }
    }
  }
}
{ // pairs across modules (four variants): inline 4 x 4, corner two port pairs x 4 x 4
  assert.equal(baked(built, 'wall_inline').length, 16);
  assert.equal(baked(built, 'wall_corner').length, 32);
  const modules = new Set(baked(built, 'wall_corner').map(e => Object.values(e.participants).map(p => p.module).sort().join(',')));
  assert.deepEqual([...modules].sort(), ['wall_panel,wall_panel', 'wall_panel,wall_panel_with_opening', 'wall_panel_with_opening,wall_panel_with_opening']);
}
{ // the inline seam, baked once for plain walls
  const [entry, ...rest] = wallsOnly(baked(built, 'wall_inline'));
  assert.equal(rest.length, 0);
  assert.equal(entry.implementation, 'plain');
  assert.deepEqual(entry.transform, ruleTransform('flush'));
  assert.deepEqual(entry.parts, []);
  assert.deepEqual([entry.participants.a.port, entry.participants.b.port], ['right', 'left']);
  // 148 x 2256 contact, spacing 600 with 100 at each end: ceil(2056 / 600) + 1.
  assert.deepEqual(entry.joints, [{ id: 'j1', type: 'panel_seam', parts: { a: { of: 'a', part: 'stud_right' }, b: { of: 'b', part: 'stud_left' } },
    stage: 'site', fasteners: { item: 'nail_28x95', count: 5 } }]);
}
{ // the asset: up to date, in the authored order
  assert.equal(readFileSync(ASSET, 'utf8'), dumps(built.asset), `${ASSET} is out of date; run node scripts/build_library.mjs`);
  const wall = built.asset.modules.wall_panel;
  assert.deepEqual(wall.parameters.map(p => p.name), ['width', 'height', 'spacing', 'stud', 'buildup']);
  assert.deepEqual(wall.systems.seh_no.variants.map(v => v.name), ['1200', '600']);
  assert.equal(readFileSync(VARIANTS_FIXTURE, 'utf8'), await buildVariantsAsset(),
    `${VARIANTS_FIXTURE} is out of date; run node tests/library_builder.mjs --write-fixtures`);
}
for (const [throughPort, buttPort] of [['right', 'left'], ['left', 'right']]) { // the corner in the world
  const wall = compiled(built, 'wall_panel', '1200');
  const entry = wallsOnly(baked(built, 'wall_corner')).find(e => e.participants.through.port === throughPort);
  assert.equal(entry.participants.butt.port, buttPort);
  const R = wall.ports[throughPort];
  const add = (a, b) => a.map((v, i) => v + b[i] + 0), scale = (k, v) => v.map(x => k * x + 0);
  const M = { origin: add(R.origin, scale(wall.size.framing, R.across)), normal: scale(-1, R.across), across: scale(-1, R.normal), along: R.along };
  // The stored transform puts the butt port in the same place.
  const vector = v => [0, 1, 2].map(i => ["normal", "along", "across"].reduce((n, key, k) => n + v[k] * R[key][i], 0) + 0);
  assert.deepEqual({ origin: add(R.origin, vector(entry.transform.origin)), normal: vector(entry.transform.normal),
    along: vector(entry.transform.along), across: vector(entry.transform.across) }, M);
  const lap = (a, b, i) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]);
  const intersects = (a, b) => [0, 1, 2].every(i => lap(a, b, i) > 0);
  const touches = (a, b) => { const g = [0, 1, 2].map(i => lap(a, b, i)); return g.filter(x => x > 0).length === 2 && g.includes(0); };
  const B = wall.ports[buttPort];
  const through = Object.fromEntries(wall.parts.map(p => [p.id, p.box]));
  const butt = Object.fromEntries(wall.parts.map(p => [p.id, fromFrame(toFrame(p.box, B), M)]));
  const [turned, strip] = entry.parts.map(p => fromFrame(p.box, R));
  for (const a of Object.values(through)) for (const b of Object.values(butt)) assert.ok(!intersects(a, b));
  // The butt wall's framing is flush with the through wall's end.
  const endX = R.origin[0];
  assert.ok(Object.entries(butt).filter(([id]) => !id.startsWith('a1_')).some(([, b]) => (R.normal[0] > 0 ? b.max[0] : b.min[0]) === endX));
  for (const b of [...Object.values(through), ...Object.values(butt), strip]) assert.ok(!intersects(turned, b));
  assert.ok(touches(turned, butt[`stud_${buttPort}`]) && touches(turned, through[`stud_${throughPort}`]));
  assert.ok(touches(through[`stud_${throughPort}`], butt[`stud_${buttPort}`]));
  for (const plate of ['bottom_plate', 'top_plate_lower']) assert.ok(touches(turned, through[plate]));
  for (const b of [...Object.values(through), ...Object.values(butt)]) assert.ok(!intersects(strip, b));
  assert.ok(touches(strip, through[`stud_${throughPort}`]) && touches(strip, through.a1_bracing_1) && touches(strip, butt.a1_bracing_1));
}

// ---- other openings ---------------------------------------------------------
{
  // At height 2700 the cripples above the header run from 2148 to 2604.
  let r = await openingCopy({ height: 2700 });
  noProblems(r);
  let out = compiled(r, 'wall_panel_with_opening', 'window_10x12');
  assert.equal(out.parts.find(p => p.id === 'header_outer').box.min[2], 2000);
  assert.deepEqual(out.parts.find(p => p.id === 'cripple_top_1').box, { min: [576, 12, 2148], max: [624, 160, 2604] });
  assertJoined(out);
  // Height 2244: the header tight under the lower top plate, nailed to it.
  r = await openingCopy({ height: 2244 });
  noProblems(r);
  out = compiled(r, 'wall_panel_with_opening', 'window_10x12');
  assert.ok(!out.parts.some(p => p.id.startsWith('cripple_top')));
  assert.equal(out.joints.filter(j => j.type === 'header_to_plate').length, 2);
  assertJoined(out);
  some(await openingCopy({ height: 2300 }), 'the space above the header (56) is too short for cripples (100)');
  // A 500 wide opening: no grid position between the jacks for cripples.
  some(await openingCopy({ sill_height: 1200 }, [500, 600]), 'no stud grid position between the jacks (650 to 1150) for cripples');
  // A 1010 wide opening in a 2100 panel at spacing 300 keeps grid cripples.
  r = await openingCopy({ width: 2100, spacing: 300 });
  noProblems(r);
  assertJoined(compiled(r, 'wall_panel_with_opening', 'window_10x12'));
  // Sizes the schema allows build, and every touching pair has a joint.
  for (const [variant, catalog] of [[{ width: 2400 }, null], [{ width: 2400 }, [960, 1210]], [{ width: 2400 }, [910, 1210]],
    [{ width: 1800 }, [744, 1210]], [{ width: 2700, sill_height: 790 }, [1910, 1210]], [{ width: 1800, height: 2600 }, null],
    [{ width: 1800, height: 3000, spacing: 300 }, null]]) {
    r = await openingCopy(variant, catalog);
    noProblems(r);
    assertJoined(compiled(r, 'wall_panel_with_opening', 'window_10x12'));
  }
  // Every sheet edge needs framing behind it.
  for (const [variant, catalog, expected] of [
    [{ width: 3600 }, [1210, 1210], 'the bracing sheet edge at x 1200 has no framing behind it from z 48 to 742'],
    [{ width: 3600 }, [960, 1210], 'the bracing sheet edge at x 1200 has no framing behind it from z 48 to 2304'],
    [{ width: 2700 }, [2010, 1210], 'the bracing sheet edge at x 2400 has no framing behind it from z 2148 to 2304'],
    [{ width: 1800, spacing: 450 }, null, 'the bracing sheet edge at x 1200 has no framing behind it']]) {
    some(await openingCopy(variant, catalog), expected);
  }
  // The turned stud reaches 196 from the through wall's end; at c/c 400 an
  // 1800 panel has a stud centred 200 from its right end.
  some(await openingCopy({ width: 1800, height: 3000, spacing: 400 }), "part 'turned_stud' overlaps through part 'stud_4'");
}

// ---- the corner, edited ------------------------------------------------------
const BRACING_WORKSHOP = '      - role: bracing\n        sheet: osb_12\n        stage: workshop\n';
{
  // The bracing put up on site: no end sheet, so no corner; the builder says so.
  let r = await copyWith([SYSTEM, BRACING_WORKSHOP, BRACING_WORKSHOP.replace('workshop', 'site')]);
  assert.ok(!messages(r).some(m => m.includes('no face A sheet')));
  some(r, "can fill 'wall_corner.through', which needs end_sheet exposed");
  // Two workshop sheets on face A: the strip covers one.
  some(await copyWith([SYSTEM, '      - {role: wind_barrier, material: wind barrier membrane',
    '      - {role: outer_board, sheet: osb_12, stage: workshop}\n      - {role: wind_barrier, material: wind barrier membrane']),
  "the through wall's exterior face has more than one workshop layer");
  // Opening walls with 198 studs: corners with the 148 walls are excluded.
  r = await copyWith([OPENING_VARIANTS, '  stud: "48x148"', '  stud: "48x198"']);
  const mixed = new Set(r.excluded.get('wall_corner').get('seh_no').filter(e => e.reason === 'same_framing')
    .map(e => `${e.participants.through.module},${e.participants.butt.module}`));
  assert.deepEqual([...mixed].sort(), ['wall_panel,wall_panel_with_opening', 'wall_panel_with_opening,wall_panel']);
  assert.ok(!messages(r).some(m => m.includes('turned stud')));
  // The corner's offset reads a size the walls must have.
  some(await copyWith([WALLS, ', framing: this.deep }', ' }']), 'the offset through.framing needs size \'framing\', which variant');
  some(await copyWith([CALIFORNIA, 'layer: sheet.role,', "layer: 'cladding_board',"]), "part 'sheathing_strip': layer 'cladding_board' is not a layer");
  // The strip is exempt from the touch rule, but must be fastened to something.
  some(await copyWith([CALIFORNIA, "  joints.push({ type: 'sheathing_to_framing',", "  0 && joints.push({ type: 'sheathing_to_framing',"]),
    "part 'sheathing_strip' has no joint");
  // Corner parts fitted in the workshop: joined to their host only, a joint
  // is a workshop joint; joined to the other wall it is a site joint.
  r = await broken(CORNER_SEH, 'stage: site', 'stage: workshop');
  noProblems(r);
  for (const entry of baked(r, 'wall_corner')) {
    const stages = {};
    for (const j of entry.joints) (stages[j.type] ??= new Set()).add(j.stage);
    assert.deepEqual(Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, [...v]])),
      { corner_studs: ['site'], backer_to_stud: ['workshop'], backer_to_plate: ['workshop'], sheathing_to_framing: ['workshop'] });
  }
}

// ---- derived modules ----------------------------------------------------------
{
  const WALL_LINE_SEH = 'library/modules/wall_line/systems/seh_no.yaml';
  for (const [rel, old, replacement, expected] of [
    [WALL_LINE_SEH, '  max_piece: 2400', '  max_piece: 2400\n  spacing: 600', "fixed: 'spacing' is not a parameter"],
    [WALL_LINE_SEH, '  max_piece: 2400', '  max_piece: 200', 'max_piece: 200 is below the minimum 600'],
    [WALL_LINE_SEH, 'fixed:', 'default: x\nfixed:', "system file: unknown key 'default'"],
    ['library/modules/wall_line/schema.yaml', 'derived: true', 'derived: false', 'derived: expected true'],
    ['library/modules/wall_line/schema.yaml', 'parameters:\n', 'parameters:\n  ridge:\n    type: choice\n    description: x\n', "parameter 'ridge': missing 'values'"],
    ['library/modules/wall_line/schema.yaml', 'parameters:\n', 'parameters:\n  ridge:\n    type: choice\n    values: [a, a]\n    description: x\n', "parameter 'ridge': values: expected a list of distinct names"],
    ['library/modules/wall_line/schema.yaml', 'parameters:\n', 'parameters:\n  pitch:\n    type: angle\n    max: 120\n    description: x\n', "parameter 'pitch': an angle's min and max are degrees, at most 90"],
  ]) some(await broken(rel, old, replacement), expected);
  // A derived module's system file may fix only some parameters: the layout
  // gives the rest, and the asset holds only the fixed ones.
  {
    const partial = await broken(WALL_LINE_SEH, '  min_from_joint: 600\n', '');
    noProblems(partial);
    assert.deepEqual(partial.asset.modules.wall_line.systems.seh_no, { params: { max_piece: 2400 } });
    const typed = await copyWith(['library/modules/wall_line/schema.yaml', 'parameters:\n',
      'parameters:\n  pitch:\n    type: angle\n    min: 5\n    max: 45\n    description: x\n  ridge:\n    type: choice\n    values: [east_west, north_south]\n    description: x\n'],
    [WALL_LINE_SEH, '  max_piece: 2400', '  max_piece: 2400\n  pitch: 27\n  ridge: east_west']);
    noProblems(typed);
    assert.deepEqual(typed.asset.modules.wall_line.systems.seh_no.params, { max_piece: 2400, min_from_joint: 600, pitch: 27, ridge: 'east_west' });
    some(await copyWith(['library/modules/wall_line/schema.yaml', 'parameters:\n',
      'parameters:\n  ridge:\n    type: choice\n    values: [east_west, north_south]\n    description: x\n'],
    [WALL_LINE_SEH, '  max_piece: 2400', '  max_piece: 2400\n  ridge: up']), "fixed: ridge: 'up' is not one of east_west, north_south");
  }
  const dir = copyLibrary();
  unlinkSync(join(dir, 'library/modules/wall_line/derive.js'));
  some(await buildAt(dir), "derived module 'wall_line' has no library/modules/wall_line/derive.js");
}

// ---- layers, sheets and variants -----------------------------------------------
{
  // Only parts made from a layer use its fastening, whatever its role.
  let r = await broken(SYSTEM, '{role: cladding, material: timber cladding, thickness: 19, stage: site}',
    '{role: stud, material: timber cladding, thickness: 19, stage: site, fastening: {fastener: nail_28x95, from: stud, count: 7}}');
  noProblems(r);
  assert.deepEqual([...new Set(compiled(r, 'wall_panel', '1200').joints.filter(j => j.type === 'stud_to_plate').map(j => j.fasteners.count))], [2]);
  // Two sheets: the stud at the seam carries both sheets' edges.
  r = await broken(WALL_VARIANTS, 'width: 1200', 'width: 2400');
  noProblems(r);
  const counts = Object.fromEntries(compiled(r, 'wall_panel', '1200').joints.filter(j => j.type === 'sheathing_to_framing')
    .map(j => [`${j.parts.sheet} ${j.parts.framing}`, j.fasteners.count]));
  assert.deepEqual(counts, {
    'a1_bracing_1 stud_left': 16, 'a1_bracing_1 stud_1': 9, 'a1_bracing_1 stud_2': 16, 'a1_bracing_2 stud_2': 16,
    'a1_bracing_2 stud_3': 9, 'a1_bracing_2 stud_right': 16, 'a1_bracing_1 bottom_plate': 9, 'a1_bracing_1 top_plate_lower': 5,
    'a1_bracing_2 bottom_plate': 9, 'a1_bracing_2 top_plate_lower': 5,
  });
  // A sheet cut to a sliver: joints only where it overlaps framing by more than 1 mm.
  for (const [old, replacement] of [['height: 2400 ', 'height: 2449 '], ['width: 1200', 'width: 1201']]) {
    r = await broken(WALL_VARIANTS, old, replacement);
    noProblems(r);
    assert.ok(!compiled(r, 'wall_panel', '1200').joints.some(j => j.type === 'sheathing_to_framing' && j.parts.sheet === 'a1_bracing_2'));
  }
  // Two wall variants (1200, 600): inline 2 x 2, corner two port pairs x 4.
  r = built;
  assert.deepEqual(compiled(r, 'wall_panel', '600').parts.filter(p => p.role === 'stud').map(p => p.box.min[0]), [0, 552]);
  assert.equal(allWalls(baked(r, 'wall_inline')).length, 4);
  const corner = allWalls(baked(r, 'wall_corner'));
  assert.equal(corner.length, 8);
  assert.deepEqual([...new Set(corner.map(e => `${e.participants.through.variant},${e.participants.butt.variant}`))].sort(),
    ['1200,1200', '1200,600', '600,1200', '600,600']);
}

// ---- broken libraries -----------------------------------------------------------
for (const [rel, old, replacement, expected, id] of BROKEN) {
  const r = await broken(rel, old, replacement);
  assert.ok(messages(r).some(m => m.includes(expected)), `${id}: ${expected}\n${messages(r).join('\n') || 'no errors'}`);
  assert.equal(r.asset, null, id);
}
{
  let dir = copyLibrary();
  unlinkSync(join(dir, COMPILER));
  assert.ok(messages(await buildAt(dir)).includes(`error: ${COMPILER}: missing`));
  dir = copyLibrary();
  unlinkSync(join(dir, CORNER_SEH));
  some(await buildAt(dir), "interface 'wall_corner' has no implementations for system 'seh_no'");
  some(await broken(SYSTEM, 'grid: 600', 'grid: [600'), 'not valid YAML');
  // Only right ends can fill wall_inline: two right ends never fit a mirroring rule.
  dir = copyLibrary();
  for (const schema of [WALL_SCHEMA, OPENING_SCHEMA]) {
    const path = join(dir, schema);
    writeFileSync(path, readFileSync(path, 'utf8').replace('roles: [wall_inline.b, ', 'roles: [')
      .replace('roles: [wall_inline.a, ', 'roles: [wall_inline.a, wall_inline.b, '));
  }
  some(await buildAt(dir), "no possible port pair in system 'seh_no' (hands, checks or fit never work)");
}

// ---- interface checks exclude pairs (the variants copy) ----------------------------
{
  const asset = JSON.parse(readFileSync(VARIANTS_FIXTURE, 'utf8'));
  const corner = asset.interfaces.wall_corner.systems.seh_no;
  const reasons = {};
  for (const e of corner.excluded) {
    const p = e.participants;
    reasons[`${p.through.variant} ${p.butt.variant} ${p.through.port} ${p.butt.port}`] = e.reason;
  }
  assert.equal(reasons['1200 1200_tall right left'], 'same_height');
  assert.equal(reasons['1200 1200 right right'], 'hands');
  const bakedPairs = new Set(corner.pairs.map(e => `${e.participants.through.variant} ${e.participants.butt.variant}`));
  assert.ok(!bakedPairs.has('1200 1200_tall') && bakedPairs.has('1200 600') && bakedPairs.has('1200_tall 1200_tall'));
  assert.deepEqual(asset.modules.wall_panel.systems.seh_no.variants.map(v => v.name), ['1200', '600', '1200_tall']);
}

// ---- the command line -----------------------------------------------------------
{
  const run = (...args) => spawnSync(process.execPath, ['scripts/build_library.mjs', ...args], { encoding: 'utf8' });
  assert.equal(run('--verify').status, 0);
  const dir = copyLibrary();
  assert.equal(run('--root', dir, '--verify').status, 1); // no asset yet
  assert.equal(run('--root', dir).status, 0);
  assert.equal(run('--root', dir, '--verify').status, 0);
  unlinkSync(join(dir, 'library/joint_types.yaml'));
  assert.equal(run('--root', dir).status, 1);
}
console.log(`library builder: the library, ${BROKEN.length} broken copies, openings, corners, derived modules and the command line`);
