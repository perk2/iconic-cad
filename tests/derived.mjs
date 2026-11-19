/** Derived modules (hut/design/ic_derived.md): the storey and its wall lines'
 * upper top plates, run by the engine at design time. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileDesign } from '../web/js/engine/compile_design.js';
import { applyBox, invert } from '../web/js/engine/affine.js';
import { checkAdded } from '../web/js/library/checks.js';
import * as storey from '../library/modules/storey/derive.js';
import * as wallLine from '../library/modules/wall_line/derive.js';
import * as floor from '../library/modules/floor/derive.js';

const asset = JSON.parse(readFileSync('web/assets/library.json', 'utf8'));
const read = f => JSON.parse(readFileSync(`tests/fixtures/engine/${f}`, 'utf8'));
const copy = value => JSON.parse(JSON.stringify(value));
const derived = { storey, wall_line: wallLine, floor };
const withStorey = layout => ({ ...layout, derive: { module: 'storey' } });
const own = model => model.parts.filter(p => p.owner === 'storey');
const box = (model, id) => model.parts.find(p => p.id === `storey/${id}`).world;

// ---- the plain hut: ten 1200 panels ---------------------------------------
{
  const plain = compileDesign(read('hut.json'), asset);
  const model = compileDesign(withStorey(read('hut.json')), asset, { derived });
  assert.deepEqual(model.issues, [], JSON.stringify(model.issues, null, 1));
  // Without derive the model has no upper plates; with it, the placed parts
  // are unchanged and the storey adds its own.
  assert.equal(own(plain).length, 0);
  assert.deepEqual(model.parts.filter(p => p.owner !== 'storey'), plain.parts);

  // The long walls (south, north) run through at the corners: their upper
  // plates stop at the gable walls' inside faces (x 148 to 3452). The gable
  // walls (east, west) butt: theirs run to the outer corners (y 12 to 2708,
  // the long walls' outer framing faces), lapping over the long walls'
  // lower plates. Pieces of at most 2400, so each line has one joint, at a
  // panel's middle stud (600 from both of its ends): x 1800 on the long
  // walls, 1200 + 600 from each gable wall's start.
  assert.deepEqual(own(model).filter(p => p.id.startsWith('storey/line_')).map(p => [p.id.slice('storey/'.length), p.world]), [
    ['line_E1/upper_plate_1', { min: [3452, 12, 2352], max: [3600, 1960, 2400] }],
    ['line_E1/upper_plate_2', { min: [3452, 1960, 2352], max: [3600, 2708, 2400] }],
    ['line_N1/upper_plate_1', { min: [1800, 2560, 2352], max: [3452, 2708, 2400] }],
    ['line_N1/upper_plate_2', { min: [148, 2560, 2352], max: [1800, 2708, 2400] }],
    ['line_S1/upper_plate_1', { min: [148, 12, 2352], max: [1800, 160, 2400] }],
    ['line_S1/upper_plate_2', { min: [1800, 12, 2352], max: [3452, 160, 2400] }],
    ['line_W1/upper_plate_1', { min: [0, 760, 2352], max: [148, 2708, 2400] }],
    ['line_W1/upper_plate_2', { min: [0, 12, 2352], max: [148, 760, 2400] }],
  ]);
  assert.equal(own(model).filter(p => p.id.startsWith('storey/floor/')).length, 35);
  for (const p of own(model).filter(q => q.role === 'top_plate')) {
    assert.equal(p.stage, 'site');
    assert.equal(p.catalog, '48x148');
    const length = Math.max(...[0, 1].map(i => p.world.max[i] - p.world.min[i]));
    assert.ok(length <= 2400, `${p.id} is ${length} long`);
  }
  // Each joint in a plate stands over a stud, 600 from the panel joints.
  const studs = model.parts.filter(p => p.role === 'stud');
  for (const [a, b, axis] of [['line_S1/upper_plate_1', 'line_S1/upper_plate_2', 0],
    ['line_E1/upper_plate_1', 'line_E1/upper_plate_2', 1]]) {
    const at = box(model, a).max[axis];
    assert.equal(box(model, b).min[axis], at);
    assert.ok(studs.some(s => s.world.min[axis] < at && at < s.world.max[axis]), `no stud under the joint at ${at}`);
  }

  // Joints: every piece to the lower plates it lies on (the gable plates
  // also to the long walls' at the laps), and every sheet whose top edge it
  // covers, the corner strips included.
  const joints = model.joints.filter(j => j.owner === 'storey' && !Object.values(j.parts).some(id => id.startsWith('storey/floor/')));
  const count = type => joints.filter(j => j.type === type).length;
  // Gable lines: 3 + 2 lower plates (one lap each), long lines 2 + 2.
  assert.equal(count('top_plates'), 18);
  // Sheets: each line's own (one per panel and piece), the long walls' sheets
  // at a gable plate's end (4), and the four corner strips: 22.
  assert.equal(count('sheathing_to_framing'), 22);
  assert.ok(joints.some(j => j.type === 'top_plates'
    && j.parts.upper === 'storey/line_E1/upper_plate_1' && j.parts.lower === 'S3/top_plate_lower'), 'lap at the south-east corner');
  for (const sheet of model.parts.filter(p => p.layer && p.owner !== 'storey' && p.world.max[2] === 2400 && p.id.includes('/a1_'))) {
    assert.ok(joints.some(j => j.parts.sheet === sheet.id), `${sheet.id}'s top edge isn't nailed`);
  }
  assert.ok(joints.every(j => j.stage === 'site'));
  // A sheet's top edge on a plate: 150 along its edge (1200 contact: 9); the
  // plate over a lower plate at 600 c/c, 50 from the ends.
  const sheetE1 = joints.find(j => j.parts.sheet === 'E1/a1_bracing_1');
  assert.deepEqual(sheetE1.fasteners, { item: 'nail_25x60_ring', count: 9 });
  const nails = js => js.reduce((n, j) => n + j.fasteners.count, 0);
  assert.equal(nails(joints.filter(j => j.type === 'top_plates')), 42);
  assert.equal(nails(joints.filter(j => j.type === 'sheathing_to_framing')), 106);
  // Nothing collides.
  for (const p of own(model)) {
    for (const q of model.parts) {
      if (p === q) continue;
      const lap = [0, 1, 2].every(i => Math.min(p.world.max[i], q.world.max[i]) - Math.max(p.world.min[i], q.world.min[i]) > 0);
      assert.ok(!lap, `${p.id} collides with ${q.id}`);
    }
  }
}

// ---- the hut with a window and a door -------------------------------------
{
  const model = compileDesign(withStorey(read('hut_openings.json')), asset, { derived });
  assert.deepEqual(model.issues, [], JSON.stringify(model.issues, null, 1));
  // South: the window and door panels (1800 each); the joint at x 2400, the
  // door panel's first grid position, over its cripple above the header.
  assert.deepEqual(box(model, 'line_S1/upper_plate_1'), { min: [148, 12, 2352], max: [2400, 160, 2400] });
  assert.deepEqual(box(model, 'line_S1/upper_plate_2'), { min: [2400, 12, 2352], max: [3452, 160, 2400] });
}

// ---- the floor, derived from the walls -------------------------------------
const floorParts = model => model.parts.filter(p => p.id.startsWith('storey/floor/'));
const floorJoints = model => model.joints.filter(j => Object.values(j.parts).some(id => id.startsWith('storey/floor/')));
// Every member standing on a gable wall's bottom plate has blocking under its
// whole thickness beside the end joist, or stands on a rim joist; and every
// block has a member over it (no stray blocks).
function assertMembersOverBlocks(model, gableIds) {
  const blocks = floorParts(model).filter(p => p.role === 'blocking');
  const rims = floorParts(model).filter(p => p.role === 'rim');
  const standing = model.parts.filter(p => gableIds.some(id => p.id.startsWith(`${id}/`))
    && ['stud', 'king', 'jack', 'cripple'].includes(p.role) && p.world.min[2] === 48);
  assert.ok(standing.length > 0);
  const inPlan = (inner, outer) => [0, 1].every(i => outer.min[i] <= inner.min[i] && inner.max[i] <= outer.max[i]);
  const overlapsInPlan = (a, b) => [0, 1].every(i => a.min[i] < b.max[i] && b.min[i] < a.max[i]);
  for (const m of standing) {
    if (rims.some(r => inPlan(m.world, r.world))) continue;
    // Along the wall the member is one stud thick; across, the wall's depth.
    const size = i => m.world.max[i] - m.world.min[i];
    const [along, across] = size(0) < size(1) ? [0, 1] : [1, 0];
    const spans = blocks.filter(b => b.world.min[across] < m.world.max[across] && m.world.min[across] < b.world.max[across])
      .map(b => [b.world.min[along], b.world.max[along]]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of spans) {
      if (merged.length && merged[merged.length - 1][1] === a) merged[merged.length - 1][1] = b; else merged.push([a, b]);
    }
    assert.ok(merged.some(([a, b]) => a <= m.world.min[along] && m.world.max[along] <= b), `${m.id} has no block under it`);
  }
  for (const b of blocks) {
    assert.ok(standing.some(m => overlapsInPlan(m.world, b.world)), `${b.id} has no member over it`);
  }
}
// The storey's parts in the anchor wall's frame (S1): the same for any facing.
function inBuilding(model, anchorId = 'S1') {
  const back = invert(model.entities.find(e => e.id === anchorId).transform);
  return own(model).map(p => [p.id, applyBox(back, p.world)]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
{
  const model = compileDesign(withStorey(read('hut_openings.json')), asset, { derived });
  // Under the walls: from z -268 to 0 (sill 48, joists 198, subfloor 22), its
  // outline the walls' framing (x 0 to 3600, y 12 to 2708), the sheets outside.
  assert.deepEqual(model.summary.outline, { min: [-12, 0], max: [3612, 2720], size: [3624, 2720] });
  assert.deepEqual(box(model, 'floor/sill_start'), { min: [0, 12, -268], max: [3600, 160, -220] });
  assert.deepEqual(box(model, 'floor/rim_start'), { min: [0, 12, -220], max: [3600, 60, -22] });
  assert.deepEqual(box(model, 'floor/joist_end'), { min: [3552, 60, -220], max: [3600, 2660, -22] });
  // 35 parts and 130 joints, as the placed floor had: 4 sills, 2 rims, 7
  // joists, 12 blocks, 10 subfloor pieces; 4 sill corners, 14 joist ends,
  // 30 on the sill, 24 block ends, 2 doubled blocks, 56 sheet contacts.
  assert.equal(floorParts(model).length, 35);
  assert.equal(floorJoints(model).length, 130);
  assert.ok(floorParts(model).every(p => p.stage === 'site'));
  // Subfloor screws: 3 into each block (528 contact at 300, 10 from the ends).
  assert.equal(model.summary.fasteners_by_stage.site.screw_42x55, 236);
  assertMembersOverBlocks(model, ['E1', 'E2', 'W1', 'W2']);

  // The same hut turned: the storey turns with it (the same parts in the
  // anchor's frame); the floor isn't laid out along the world's axes.
  const base = inBuilding(model);
  for (const facing of [90, 180, 270]) {
    const turned = withStorey(read('hut_openings.json'));
    turned.anchor.facing = facing;
    const t = compileDesign(turned, asset, { derived });
    assert.deepEqual(t.issues, [], JSON.stringify(t.issues, null, 1));
    assert.deepEqual(inBuilding(t), base, `facing ${facing}`);
    assert.equal(t.joints.length, model.joints.length);
    assertMembersOverBlocks(t, ['E1', 'E2', 'W1', 'W2']);
  }

}
{
  // Joists c/c 400 under walls c/c 600, and 73 thick joists under 48 studs:
  // the blocks follow the walls' real members, side by side at a panel joint.
  for (const change of [a => { a.modules.floor.systems.seh_no.params.spacing = 400; },
    a => {
      a.systems.seh_no.catalog.lumber['73x198'] = { section: [73, 198], grade: 'C24' };
      a.modules.floor.systems.seh_no.params.joist = { id: '73x198', section: [73, 198], grade: 'C24' };
    }]) {
    const a = copy(asset);
    change(a);
    const model = compileDesign(withStorey(read('hut.json')), a, { derived });
    assert.deepEqual(model.issues, [], JSON.stringify(model.issues, null, 1));
    assertMembersOverBlocks(model, ['E1', 'E2', 'W1', 'W2']);
    assert.equal(floorJoints(model).filter(j => j.type === 'doubled_blocking').length, 2);
  }
  // Uneven gable walls (600 + 1200 + 600 on the east): the blocks are under
  // the members where they are, nothing assumed about panels.
  const variants = JSON.parse(readFileSync('tests/fixtures/engine/library_variants.json', 'utf8'));
  const layout = withStorey(read('hut.json'));
  layout.entities.find(e => e.id === 'E1').variant = '600';
  layout.entities.push({ id: 'E3', module: 'wall_panel', variant: '600' });
  layout.connections.find(c => c.id === 'c_ne').butt = 'E3.right';
  layout.connections.push({ id: 'c_e23', interface: 'wall_inline', a: 'E2.right', b: 'E3.left' });
  const model = compileDesign(layout, variants, { derived });
  assert.deepEqual(model.issues, [], JSON.stringify(model.issues, null, 1));
  assertMembersOverBlocks(model, ['E1', 'E2', 'E3', 'W1', 'W2']);
  // The subfloor's seams must land on joists: joists c/c 450 can't take the
  // seams at 1200 and 2400.
  const a = copy(asset);
  a.modules.floor.systems.seh_no.params.spacing = 450;
  const bad = compileDesign(withStorey(read('hut.json')), a, { derived });
  assert.match(bad.issues[0].message, /the subfloor seam at u 2400 doesn't land on a joist/);
}

{
  // Gable walls that run through at the corners, the long walls butting
  // between them: the gable walls' end studs stand on the rims, the rest
  // over blocking; the long walls' upper plates now run to the corners.
  const layout = withStorey(read('hut.json'));
  for (const c of layout.connections.filter(x => x.interface === 'wall_corner')) [c.through, c.butt] = [c.butt, c.through];
  const model = compileDesign(layout, asset, { derived });
  assert.deepEqual(model.issues, [], JSON.stringify(model.issues, null, 1));
  assertMembersOverBlocks(model, ['E1', 'E2', 'W1', 'W2']);
  assert.equal(model.joints.filter(j => j.type === 'plate_end').length, 4);
}
{
  // Open walls: the storey waits until they close.
  const layout = withStorey(read('hut.json'));
  layout.connections = layout.connections.filter(c => c.id !== 'c_ne');
  const model = compileDesign(layout, asset, { derived });
  assert.deepEqual(model.issues.map(i => i.rule), ['derive_failed', 'free_port', 'free_port']);
  assert.match(model.issues[0].message, /don't close into a rectangle \(free ends: E2.right, N1.left; 3 corners\)/);
  assert.equal(own(model).length, 0);
}
{
  // The floor's own errors, compiled directly.
  const params = asset.modules.floor.systems.seh_no.params;
  const sill = { id: '48x148', section: [48, 148], grade: 'C24' };
  const lap = (a, b, i) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]);
  const core = {
    faceToFace: (a, b, n) => [0, 1, 2].filter(i => i !== n).every(i => lap(a, b, i) > 1)
      && (a.max[n] === b.min[n] || a.min[n] === b.max[n]),
    nailable: (a, b, n) => core.faceToFace(a, b, n) && [0, 1, 2].filter(i => i !== n).every(i => lap(a, b, i) >= 20),
  };
  const run = (width, depth, start = []) => floor.derive(params, { width, depth, sill, gables: { start, end: [] }, toWorld: b => b }, core);
  assert.equal(run(3600, 2696).parts.filter(p => p.role === 'blocking').length, 0);
  assert.throws(() => run(200, 2696), /too small for its sills/);
  assert.throws(() => run(3600, 2450), /the last row of subfloor sheets would be 50 deep/);
  // The grid joist at 3576 is within 100 of the end joist and left out.
  assert.throws(() => run(3720, 2696), /the subfloor seam at u 3600 doesn't land on a joist/);
  assert.throws(() => run(3600, 2696, [[148, 196], [180, 228]]), /would overlap the blocks before them/);
  assert.throws(() => run(3600, 2696, [[30, 78]]), /run into a rim joist/);
  // Members over a rim need no block.
  assert.equal(run(3600, 2696, [[0, 48], [2648, 2696]]).parts.filter(p => p.role === 'blocking').length, 0);
}
{
  // checkAdded: a block resting on a sill with no joint is reported; plate
  // pieces butting end to end and sheets are not.
  const sill = { id: 's', box: { min: [0, 0, 0], max: [3600, 148, 48] } };
  const block = { id: 'b', box: { min: [48, 135, 48], max: [576, 208, 246] } };
  assert.deepEqual(checkAdded([block], [sill], []), ["part 'b' touches part 's' with no joint"]);
  assert.deepEqual(checkAdded([block], [sill], [{ parts: { sill: 's', member: 'b' } }]), []);
  const p1 = { id: 'p1', box: { min: [0, 0, 0], max: [1800, 148, 48] } };
  const p2 = { id: 'p2', box: { min: [1800, 0, 0], max: [3600, 148, 48] } };
  assert.deepEqual(checkAdded([p1, p2], [], []), []);
  const sheet = { id: 'sh', layer: 'bracing', box: { min: [0, -12, 0], max: [1200, 0, 2400] } };
  assert.deepEqual(checkAdded([p1], [sheet], []), []);
}
{
  // The engine checks what a derived module returns.
  const fake = result => compileDesign(withStorey(read('hut.json')), asset, { derived: { storey: { derive: () => result } } });
  const part = { id: 'x', role: 'top_plate', material: 'timber C24', catalog: '48x148', stage: 'site',
    box: { min: [0, 0, 5000], max: [100, 148, 5048] } };
  assert.deepEqual(fake({ parts: [{ ...part, stage: 'bogus' }], joints: [] }).issues.map(i => i.message),
    ["derived module 'storey': part 'storey/x': stage \"bogus\" is not workshop or site"]);
  assert.match(fake({ parts: [{ ...part, catalog: 'no_such' }], joints: [] }).issues[0].message, /catalog "no_such" is not lumber or a sheet/);
  assert.match(fake({ parts: [{ ...part, box: { min: [0, 0, 0], max: [0, 1, 1] } }], joints: [] }).issues[0].message, /min below max/);
  assert.deepEqual(fake({ parts: [part], joints: [{ type: 'top_plates', parts: { a: { own: 'x' }, b: { own: 'x' } } }] }).issues.map(i => i.message),
    ["derived module 'storey': a 'top_plates' joint has sides a, b, not lower, upper"]);
  assert.match(fake({ parts: [part], joints: [{ type: 'glued', parts: {} }] }).issues[0].message, /joint type 'glued' is not in the library/);
  assert.match(fake({ parts: [part, { ...part }], joints: [] }).issues[0].message, /the id is used twice/);
}

// ---- problems become issues -------------------------------------------------
{
  // No code for a derived module.
  let model = compileDesign(withStorey(read('hut.json')), asset, { derived: { storey, floor } });
  assert.deepEqual(model.issues.map(i => i.rule), ['derive_failed']);
  assert.match(model.issues[0].message, /no code given for derived module 'wall_line'/);
  assert.equal(own(model).length, 0);
  // Not a derived module.
  model = compileDesign({ ...read('hut.json'), derive: { module: 'wall_panel' } }, asset, { derived });
  assert.match(model.issues[0].message, /'wall_panel' is not a derived module/);
  // Pieces of at most 1000: no joint position (panel middles are 1200 apart).
  const short = copy(asset);
  short.modules.wall_line.systems.seh_no.params.max_piece = 1000;
  model = compileDesign(withStorey(read('hut.json')), short, { derived });
  assert.match(model.issues[0].message, /no place for a joint in the upper top plate/);
  // A malformed derive.
  model = compileDesign({ ...read('hut.json'), derive: 'storey' }, asset, { derived });
  assert.deepEqual(model.issues.map(i => i.rule), ['malformed']);
}
console.log('derived modules: storey and wall lines on the hut');
