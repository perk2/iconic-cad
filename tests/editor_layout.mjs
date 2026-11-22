// The editor's document functions (web/js/editor/layout.js;
// hut/design/ic_editor.md, 4.2): placing, attaching to free ports, joining
// two free ports, removing; the hut's loop built through them closes with
// no issues.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileDesign } from '../web/js/engine/compile_design.js';
import { attachOptions, deriveList, derivedChoices, emptyLayout, freePorts, isLayout, joinCandidates, update } from '../web/js/editor/layout.js';
import * as storey from '../library/modules/storey/derive.js';
import * as wallLine from '../library/modules/wall_line/derive.js';
import * as floor from '../library/modules/floor/derive.js';
import * as roof from '../library/modules/roof/derive.js';

const asset = JSON.parse(readFileSync('web/assets/library.json', 'utf8'));
const errors = layout => compileDesign(layout, asset).issues.filter(i => i.severity === 'error');

// ---- place and attach ----------------------------------------------------------
let layout = emptyLayout('seh_no');
assert.ok(isLayout(layout));
assert.deepEqual(freePorts(asset, layout), []);
layout = update(layout, { type: 'place', module: 'wall_panel', variant: '1200' }, asset);
assert.deepEqual(layout.anchor, { entity: 'P1', position: [0, 0, 0], facing: 0 });
assert.throws(() => update(layout, { type: 'place', module: 'wall_panel', variant: '1200' }, asset), /attach to a free port/);
assert.deepEqual(freePorts(asset, layout), [{ entity: 'P1', port: 'left' }, { entity: 'P1', port: 'right' }]);
// A 1200 panel's right end takes another 1200 inline, or at a corner either way round.
const options = attachOptions(asset, layout, { entity: 'P1', port: 'right' }, 'wall_panel', '1200');
assert.deepEqual(options.map(o => `${o.interface}:${o.role}-${o.otherRole}:${o.otherPort}`).sort(),
  ['wall_corner:butt-through:left', 'wall_corner:through-butt:left', 'wall_inline:a-b:left']);

// ---- the hut's loop, as an owner would build it ---------------------------------
const pick = (at, module, variant, test) => {
  const option = attachOptions(asset, layout, at, module, variant).find(test);
  assert.ok(option, `${at.entity}.${at.port} + ${module}/${variant}`);
  layout = update(layout, { type: 'attach', at, module, variant, option }, asset);
  return layout.entities[layout.entities.length - 1].id;
};
const inline = o => o.interface === 'wall_inline';
const through = o => o.interface === 'wall_corner' && o.role === 'through';
const butt = o => o.interface === 'wall_corner' && o.role === 'butt';
let last = 'P1';
for (const [module, variant, how] of [
  ['wall_panel_with_opening', 'window_10x12', inline], ['wall_panel', '600', inline], // south
  ['wall_panel', '1200', through], ['wall_panel', '1200', inline], // east (the south wall runs through)
  ['wall_panel', '1200', butt], ['wall_panel', '1200', inline], ['wall_panel', '1200', inline], // north (runs through)
  ['wall_panel', '600', through], ['wall_panel_with_opening', 'door_10x20', inline], // west
]) last = pick({ entity: last, port: 'right' }, module, variant, how);
assert.equal(layout.entities.length, 10);
assert.deepEqual(errors(layout), []);
// Closing the loop: the last panel's right end joins the first's left end,
// with the first running through; the loop closes with no gap.
const joins = joinCandidates(asset, layout, { entity: last, port: 'right' });
const closing = joins.find(o => o.other.entity === 'P1' && o.other.port === 'left' && o.interface === 'wall_corner' && o.otherRole === 'through');
assert.ok(closing, JSON.stringify(joins));
layout = update(layout, { type: 'join', at: { entity: last, port: 'right' }, other: closing.other, option: closing }, asset);
assert.deepEqual(freePorts(asset, layout), []);
const model = compileDesign(layout, asset);
assert.deepEqual(model.issues, []);
assert.deepEqual(model.summary.outline.size, [3624, 2720]);
// The other ways round don't close the loop.
const wrong = joins.find(o => o !== closing && o.other.entity === 'P1');
if (wrong) {
  const trial = update({ ...layout, connections: layout.connections.slice(0, -1) },
    { type: 'join', at: { entity: last, port: 'right' }, other: wrong.other, option: wrong }, asset);
  assert.ok(errors(trial).length > 0);
}

// ---- remove ----------------------------------------------------------------
// Removing the anchor moves it to a neighbour, where the model placed it:
// the rest stays put.
const removed = update(layout, { type: 'remove', entity: 'P1', model }, asset);
assert.equal(removed.entities.length, 9);
assert.ok(!removed.connections.some(c => Object.values(c).some(v => typeof v === 'string' && v.startsWith('P1.'))));
assert.notEqual(removed.anchor.entity, 'P1');
const after = compileDesign(removed, asset);
for (const e of after.entities) {
  const before = model.entities.find(x => x.id === e.id);
  assert.deepEqual(e.transform.t.map(Math.round), before.transform.t.map(Math.round), e.id);
}

// ---- derived modules -----------------------------------------------------------
{
  const derived = { storey, wall_line: wallLine, floor, roof };
  // The storey and the roof can be listed (wall_line and floor run inside the
  // storey); the roof needs the storey first.
  let choices = derivedChoices(asset, layout);
  assert.deepEqual(choices.map(c => [c.module, c.ready]).sort(), [['roof', false], ['storey', true]]);
  assert.throws(() => update(layout, { type: 'add_derived', module: 'roof' }, asset), /needs 'storey' listed first/);
  let l = update(layout, { type: 'add_derived', module: 'storey' }, asset);
  assert.deepEqual(deriveList(l), [{ module: 'storey' }]);
  assert.deepEqual(derivedChoices(asset, l).map(c => [c.module, c.ready]), [['roof', true]]);
  // The roof after the storey, with the schema's defaults for what the layout gives.
  l = update(l, { type: 'add_derived', module: 'roof' }, asset);
  assert.deepEqual(deriveList(l)[1], { module: 'roof', after: ['storey'], parameters: { pitch: 27, ridge: 'east_west', eaves: 400, gables: 300 } });
  assert.deepEqual(derivedChoices(asset, l), []);
  let built = compileDesign(l, asset, { derived });
  assert.deepEqual(built.issues, [], JSON.stringify(built.issues));
  assert.ok(built.parts.some(p => p.owner === 'roof' && p.role === 'rafter'));
  // A parameter changed; out of range, the engine reports it.
  l = update(l, { type: 'set_parameter', id: 'roof', name: 'pitch', value: 25 }, asset);
  assert.equal(deriveList(l)[1].parameters.pitch, 25);
  assert.deepEqual(compileDesign(l, asset, { derived }).issues, []);
  const steep = update(l, { type: 'set_parameter', id: 'roof', name: 'pitch', value: 60 }, asset);
  assert.ok(compileDesign(steep, asset, { derived }).issues.some(i => /pitch.*above the maximum/.test(i.message)));
  // Removing the storey removes the roof after it, and the empty list.
  const bare = update(l, { type: 'remove_derived', id: 'storey' }, asset);
  assert.equal(bare.derive, undefined);
  assert.deepEqual(update(l, { type: 'remove_derived', id: 'roof' }, asset).derive, [{ module: 'storey' }]);
}

// ---- formats ------------------------------------------------------------------
assert.ok(isLayout(JSON.parse(readFileSync('tests/fixtures/engine/hut.json', 'utf8'))));
assert.ok(!isLayout({ version: 2, units: 'mm', entities: [], connections: [], anchor: null, system: 'seh' }), 'a v1 design file');

console.log('editor layout: the hut\'s loop built by attaching and one join closes with no issues; removing the anchor keeps the rest in place; the storey and roof added with their defaults');
