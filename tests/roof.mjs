// The roof (library/modules/roof/derive.js; hut/design/ic_lib_roof.md):
// rafters in birdsmouths on the storey's upper plates, a ridge board, ceiling
// joists beside the rafters, gable studs, the gable ladder (fly rafters and
// lookouts), the joints between them; checked by the engine.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileDesign } from '../web/js/engine/compile_design.js';
import * as solids from '../web/js/library/solids.js';
import * as storey from '../library/modules/storey/derive.js';
import * as wallLine from '../library/modules/wall_line/derive.js';
import * as floor from '../library/modules/floor/derive.js';
import * as roof from '../library/modules/roof/derive.js';

const asset = JSON.parse(readFileSync('web/assets/library.json', 'utf8'));
const layout = JSON.parse(readFileSync('tests/fixtures/engine/hut_openings.json', 'utf8'));
const derived = { storey, wall_line: wallLine, floor, roof };
const withRoof = (parameters, extra = {}) => ({
  ...layout, derive: [{ module: 'storey' }, { module: 'roof', after: ['storey'], parameters, ...extra }],
});
const errors = model => model.issues.filter(i => i.severity === 'error');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const A = 27 * Math.PI / 180;

// ---- the hut's roof: 27°, ridge east-west, eaves 400, gables 300 --------------
{
  const model = compileDesign(withRoof({ pitch: 27, ridge: 'east_west', eaves: 400, gables: 300 }), asset, { derived });
  assert.deepEqual(errors(model), [], JSON.stringify(model.issues, null, 1));
  const parts = model.parts.filter(p => p.owner === 'roof');
  const byRole = role => parts.filter(p => p.role === role);
  // 7 pairs (an end rafter at each gable, five at c/c 600) and 2 pairs of fly rafters.
  assert.equal(byRole('rafter').length, 18);
  assert.equal(byRole('ceiling_joist').length, 5); // between the gables
  assert.equal(byRole('ridge_board').length, 1);
  assert.equal(byRole('stud').length, 6); // 3 per gable
  assert.equal(byRole('lookout').length, 12); // 3 per side and gable
  // Along the ridge: the rafters' centres.
  const centres = byRole('rafter').filter(p => p.id.startsWith('roof/rafter_south'))
    .map(p => (p.world.min[0] + p.world.max[0]) / 2).sort((x, y) => x - y);
  assert.deepEqual(centres.map(c => Math.round(c)), [24, 600, 1200, 1800, 2400, 3000, 3576]);
  // Across it: the ridge board over the middle of the framing (12 to 2708),
  // its top level with the rafters' tops; along it, out to the gable
  // overhang (300 beyond the walls' outer faces, -12 and 3612).
  const ridge = byRole('ridge_board')[0].world;
  assert.deepEqual([ridge.min[1], ridge.max[1]], [1336, 1384]);
  assert.deepEqual([ridge.min[0], ridge.max[0]], [-312, 3912]);
  const top = 2400 - 198 / 4 / Math.cos(A) + (1336 - 0) * Math.tan(A) + 198 / Math.cos(A);
  assert.ok(near(ridge.max[2], top) && near(ridge.max[2] - ridge.min[2], 223));
  for (const r of byRole('rafter')) assert.ok(near(r.world.max[2], top, 1e-6), r.id);
  // The tail: 400 out from the wall's outer face (y = 0 south, 2720 north).
  const south = parts.find(p => p.id === 'roof/rafter_south_2').world;
  const north = parts.find(p => p.id === 'roof/rafter_north_2').world;
  assert.ok(near(south.min[1], -400) && near(north.max[1], 2720 + 400));
  // The seat: on the plate's top, a quarter of the depth deep (square to
  // the rafter), from the outer face inward.
  const plate = model.parts.find(p => p.id === 'storey/line_S1/upper_plate_1');
  const rafter = parts.find(p => p.id === 'roof/rafter_south_2');
  const seat = solids.solidContact(rafter, { box: plate.world });
  assert.ok(seat.normal && near(seat.normal[2], -1));
  const ys = seat.face.map(p => p[1]);
  assert.ok(near(Math.max(...ys), (198 / 4 / Math.cos(A)) / Math.tan(A), 1e-6), JSON.stringify(ys)); // seat length ≈ 109
  assert.ok(near(Math.min(...ys), 12)); // the plate starts behind the 12 OSB
  // Ceiling joists on the plates, beside the rafters between the gables, across the framing.
  const j1 = parts.find(p => p.id === 'roof/ceiling_joist_1').world;
  assert.deepEqual(j1, { min: [624, 12, 2400], max: [672, 2708, 2548] });
  // Gable studs on the gable walls' plates (x 0 to 148 in the west), c/c 600
  // from the framing's edge, none across the ridge line or under 150; their
  // tops on the end rafter's underside.
  const studs = byRole('stud').filter(p => p.id.includes('west')).map(p => p.world).sort((x, y) => x.min[1] - y.min[1]);
  assert.deepEqual(studs.map(w => [w.min[0], w.max[0], w.min[1], w.max[1], w.min[2]]),
    [[0, 148, 588, 636, 2400], [0, 148, 1188, 1236, 2400], [0, 148, 1788, 1836, 2400]]);
  const underside = y => 2400 - 198 / 4 / Math.cos(A) + (y <= 1360 ? y : 2720 - y) * Math.tan(A);
  assert.ok(near(studs[0].max[2], underside(636)) && near(studs[2].max[2], underside(1788)));
  // The gable ladder: fly rafters at the overhang's edge, lookouts flat
  // between them and the end rafters, tops flush with the rafters'.
  const flyWest = parts.find(p => p.id === 'roof/fly_rafter_south_west');
  assert.deepEqual([flyWest.world.min[0], flyWest.world.max[0]], [-312, -264]);
  assert.ok(!flyWest.notches, 'no birdsmouth: no wall under it');
  const look = parts.find(p => p.id === 'roof/lookout_south_west_1').world;
  assert.ok(near(look.min[0], -264) && near(look.max[0], 0) && look.min[2] > 2400, JSON.stringify(look));
  // Joints: every rafter on a plate (two over a plate joint), against the
  // ridge (the fly rafters too), beside its joist; every joist on two
  // plates; studs on the plates and under the end rafters; each lookout at
  // both ends.
  const joints = model.joints.filter(j => j.owner === 'roof');
  const count = type => joints.filter(j => j.type === type).length;
  assert.equal(count('rafter_to_plate'), 16);
  assert.equal(count('rafter_to_ridge'), 18);
  assert.equal(count('rafter_to_joist'), 10);
  assert.equal(count('joist_to_plate'), 10);
  assert.equal(count('stud_to_plate'), 6);
  assert.equal(count('stud_to_rafter'), 6);
  assert.equal(count('lookout_to_rafter'), 24);
  assert.ok(joints.every(j => j.stage === 'site'));
  // The end rafters bear on the gable walls' plates, which lap the corners.
  assert.ok(joints.some(j => j.type === 'rafter_to_plate' && j.parts.rafter === 'roof/rafter_south_1' && j.parts.plate === 'storey/line_W1/upper_plate_2'));
}

// ---- other parameters ------------------------------------------------------------
{
  // Ridge north-south: the east and west walls are the eaves.
  let model = compileDesign(withRoof({ pitch: 25, ridge: 'north_south', eaves: 300, gables: 200 }), asset, { derived });
  assert.deepEqual(errors(model), [], JSON.stringify(model.issues, null, 1));
  const rafters = model.parts.filter(p => p.owner === 'roof' && p.role === 'rafter' && !p.id.startsWith('roof/fly'));
  assert.ok(rafters.some(p => p.id.startsWith('roof/rafter_west')) && rafters.some(p => p.id.startsWith('roof/rafter_east')));
  assert.equal(rafters.length, 2 * 6); // along 2696: ends and c/c 600 from 12 (612 to 2412; 2412 + 72 < 2708)
  assert.ok(model.parts.some(p => p.id.startsWith('roof/gable_stud_south')));
  // No overhangs: no ladder, the ridge board the framing's length.
  model = compileDesign(withRoof({ pitch: 27, ridge: 'east_west', eaves: 0, gables: 0 }), asset, { derived });
  assert.deepEqual(errors(model), [], JSON.stringify(model.issues, null, 1));
  assert.ok(!model.parts.some(p => p.owner === 'roof' && (p.role === 'lookout' || p.id.startsWith('roof/fly'))));
  const bare = model.parts.find(p => p.id === 'roof/ridge_board').world;
  assert.deepEqual([bare.min[0], bare.max[0]], [0, 3600]);
  // A roof with no storey before it.
  model = compileDesign({ ...layout, derive: [{ module: 'roof', parameters: { pitch: 27, ridge: 'east_west', eaves: 400, gables: 300 } }] }, asset, { derived });
  assert.ok(errors(model).some(i => /the roof needs a storey before it/.test(i.message)), JSON.stringify(model.issues));
  // A ridge board shallower than the plumb cut.
  const shallow = { ...asset, modules: { ...asset.modules, roof: { ...asset.modules.roof, systems: { seh_no: { params: {
    ...asset.modules.roof.systems.seh_no.params, ridge_board: { id: '48x198', section: [48, 198], grade: 'C24' } } } } } } };
  model = compileDesign(withRoof({ pitch: 27, ridge: 'east_west', eaves: 400, gables: 300 }), shallow, { derived });
  assert.ok(errors(model).some(i => /shallower than the rafters' plumb cut/.test(i.message)), JSON.stringify(model.issues));
  // The storey's parts stay when the roof fails.
  assert.ok(model.parts.some(p => p.owner === 'storey'));
}

console.log('roof: rafters in birdsmouths, a ridge board, ceiling joists, gable studs and gable ladders on the hut, joined and checked; ridge either way, no overhangs, failures kept to the roof');
