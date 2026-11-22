// Sloped parts (web/js/library/solids.js; hut/design/ic_lib_roof.md, 4.1):
// solids agree with the box code on boxes; a rafter at 27° sits in its
// birdsmouth on a plate; the checks, fastening and the engine take sloped
// parts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contact, intersects } from '../web/js/library/geometry.js';
import * as solids from '../web/js/library/solids.js';
import { checkParts } from '../web/js/library/checks.js';
import { fastenJoints } from '../web/js/library/fastening.js';
import { compileDesign } from '../web/js/engine/compile_design.js';

const vectors = JSON.parse(readFileSync('tests/fixtures/library_core_vectors.json', 'utf8'));
const asset = JSON.parse(readFileSync('web/assets/library.json', 'utf8'));
const IDENTITY = { origin: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const faceBox = face => ({
  min: [0, 1, 2].map(i => Math.min(...face.map(p => p[i]))),
  max: [0, 1, 2].map(i => Math.max(...face.map(p => p[i]))),
});
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ---- boxes: solids with an identity frame agree with geometry.js --------------
let checked = 0;
for (const [a, b, axis, faceOrReason] of vectors.contact) {
  const got = solids.solidContact({ box: a, frame: IDENTITY }, { box: b });
  if (axis === null) {
    assert.equal(got.normal, null, JSON.stringify([a, b]));
    assert.equal(got.reason, faceOrReason, JSON.stringify([a, b]));
  } else {
    assert.ok(got.normal, `${JSON.stringify([a, b])}: ${got.reason}`);
    assert.ok(near(Math.abs(got.normal[axis]), 1), JSON.stringify([a, b]));
    const fb = faceBox(got.face);
    for (const i of [0, 1, 2]) {
      if (i === axis) continue; // the box code's face is the gap, flat or not
      assert.ok(near(fb.min[i], faceOrReason.min[i]) && near(fb.max[i], faceOrReason.max[i]), JSON.stringify([a, b, fb]));
    }
  }
  checked += 1;
}
// Overlap on a grid of boxes, against intersects().
let seed = 7;
const rnd = n => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
for (let k = 0; k < 300; k++) {
  const box = () => { const min = [rnd(200), rnd(200), rnd(200)]; return { min, max: min.map(v => v + 1 + rnd(150)) }; };
  const a = box(), b = box();
  assert.equal(solids.solidsIntersect({ box: a, frame: IDENTITY }, { box: b }), intersects(a, b), JSON.stringify([a, b]));
}
// A quarter turn about z by the frame is the same as the turned box.
{
  const turn = { origin: [100, 0, 0], axes: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]] };
  const local = { min: [0, 0, 0], max: [300, 48, 148] }; // x: 300 long
  const turned = { min: [52, 0, 0], max: [100, 300, 148] };
  assert.deepEqual(solids.boundingBox({ box: local, frame: turn }), turned);
  const other = { min: [100, 0, 0], max: [148, 300, 148] };
  const got = solids.solidContact({ box: local, frame: turn }, { box: other });
  const want = contact(turned, other);
  assert.ok(got.normal && want.axis === 0 && near(got.normal[0], 1));
  assert.ok(near(got.area, 300 * 148));
  assert.deepEqual(solids.longAxisVector({ box: local, frame: turn }), [0, 1, 0]);
}

// ---- shape problems -------------------------------------------------------------
assert.deepEqual(solids.shapeProblems({ box: { min: [0, 0, 0], max: [1, 1, 1] }, frame: IDENTITY }), []);
assert.deepEqual(solids.shapeProblems({ box: { min: [0, 0, 0], max: [1, 1, 1] }, frame: { origin: [0, 0, 0], axes: [[1, 0, 0], [1, 0, 0], [0, 0, 1]] } }),
  ['frame: the axes must be unit vectors at right angles']);
assert.deepEqual(solids.shapeProblems({ box: { min: [0, 0, 0], max: [1, 1, 1] }, frame: { origin: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, -1]] } }),
  ['frame: the axes must be right-handed']);
assert.deepEqual(solids.shapeProblems({ box: { min: [0, 0, 0], max: [1, 1, 1] }, notches: [{ planes: [] }] }),
  ['notches: expected {planes: [{normal, point}]}, the normals not zero']);

// ---- a rafter at 27° in its birdsmouth on a plate ------------------------------
// The plate: across the wall x 0 to 148 (outside at x = 0), its top at 2400.
// The rafter rises in +x; local x up the slope, y its thickness, z its depth
// (198). Its underside passes 40 below the plate's outer top corner, measured
// square to the rafter; the birdsmouth takes out what lies below the seat
// (z <= 2400) and inside the heel (x >= 0).
const A = 27 * Math.PI / 180, cos = Math.cos(A), sin = Math.sin(A);
const plate = { id: 'plate', role: 'top_plate', box: { min: [0, -24, 2352], max: [148, 24, 2400] } };
function rafter(depth = 40, notched = true) {
  const ex = [cos, 0, sin], ez = [-sin, 0, cos], ey = cross(ez, ex);
  const origin = [sin * depth, -24, 2400 - cos * depth];
  const toLocal = v => [ex, ey, ez].map(e => v[0] * e[0] + v[1] * e[1] + v[2] * e[2]);
  const at = toLocal([0 - origin[0], 0 - origin[1], 2400 - origin[2]]);
  const notch = { planes: [{ normal: toLocal([0, 0, 1]), point: at }, { normal: toLocal([-1, 0, 0]), point: at }] };
  return {
    id: 'rafter', role: 'rafter', box: { min: [-500, 0, 0], max: [2000, 48, 198] },
    frame: { origin, axes: [ex, ey, ez] }, ...(notched ? { notches: [notch] } : {}),
  };
}
{
  const r = rafter();
  assert.deepEqual(solids.shapeProblems(r), []);
  assert.equal(solids.pieces(r).length, 2); // the tail outside the heel, the rest above the seat
  assert.equal(solids.solidsIntersect(r, plate), false);
  assert.equal(solids.solidsIntersect(rafter(40, false), plate), true);
  // The seat: 40 / sin 27° long across the plate's top, the rafter's thickness wide.
  const c = solids.solidContact(r, plate);
  assert.ok(c.normal && near(c.normal[2], -1));
  const fb = faceBox(c.face);
  assert.ok(near(fb.max[2], 2400) && near(fb.min[2], 2400));
  assert.ok(near(fb.max[0] - fb.min[0], 40 / sin, 1e-6), JSON.stringify(fb));
  assert.ok(near(c.area, 48 * 40 / sin, 1e-6));
  // The long axis runs up the slope.
  const axis = solids.longAxisVector(r);
  assert.ok(near(axis[0], cos) && near(axis[2], sin));
}

// ---- checks and fastening on the sloped contact -------------------------------
{
  const r = rafter();
  assert.deepEqual(checkParts([r, plate], []), ["part 'rafter' touches part 'plate' with no joint"]);
  assert.deepEqual(checkParts([r, plate], [{ parts: { a: 'rafter', b: 'plate' } }]), []);
  assert.deepEqual(checkParts([rafter(40, false), plate], []), ["part 'rafter' overlaps part 'plate'"]);
  const parts = { rafter: r, plate };
  const info = id => ({ label: `'${id}'`, ...parts[id], stage: 'site', entity: 'roof', layer: null });
  const types = { rafter_to_plate: { sides: { rafter: 'rafter', plate: 'plate' } } };
  const system = { fastening: { rafter_to_plate: { fastener: 'nail', from: 'rafter', method: 'toe', count: 2 } } };
  let out = fastenJoints('test', [{ type: 'rafter_to_plate', parts: { rafter: 'rafter', plate: 'plate' } }], info, types, system);
  assert.deepEqual(out.errors, []);
  assert.equal(out.joints[0].fasteners.count, 2);
  // A row along the rafter: the seat is 40 / sin 27° long, which is
  // 40 / tan 27° along the slope; at 30 apart, 10 from each end.
  const spaced = { fastening: { rafter_to_plate: { fastener: 'nail', from: 'rafter', along: 'rafter', spacing: 30, end_distance: 10 } } };
  out = fastenJoints('test', [{ type: 'rafter_to_plate', parts: { rafter: 'rafter', plate: 'plate' } }], info, types, spaced);
  assert.deepEqual(out.errors, []);
  const length = (40 / sin) * cos;
  assert.equal(out.joints[0].fasteners.count, Math.ceil((length - 20 - 1e-6) / 30) + 1);
  // A row along the plate: across the seat, 48 wide.
  const acrossPlate = { fastening: { rafter_to_plate: { fastener: 'nail', from: 'rafter', along: 'plate', spacing: 20, end_distance: 4 } } };
  // The plate's long axis is y here? It is x (148) against y (48): along x, the seat's 40 / sin 27°.
  out = fastenJoints('test', [{ type: 'rafter_to_plate', parts: { rafter: 'rafter', plate: 'plate' } }], info, types, acrossPlate);
  assert.equal(out.joints[0].fasteners.count, Math.ceil((40 / sin - 8 - 1e-6) / 20) + 1);
  // No contact, no joint.
  const apart = { ...rafter(), frame: { ...rafter().frame, origin: [rafter().frame.origin[0], -24, 2600] } };
  out = fastenJoints('test', [{ type: 'rafter_to_plate', parts: { rafter: 'rafter', plate: 'plate' } }],
    id => ({ ...info(id), ...(id === 'rafter' ? apart : {}) }), types, system);
  assert.match(out.errors[0], /don't touch face to face/);
}

// ---- the engine: a derived module's sloped part --------------------------------
{
  // The derived module adds a plate of its own, clear of the hut (2 m above
  // it), and the rafter from above in its birdsmouth on it, joined.
  const layout = JSON.parse(readFileSync('tests/fixtures/engine/hut.json', 'utf8'));
  const lift = 2000;
  const own = r => ({ ...r, frame: { ...r.frame, origin: [r.frame.origin[0], r.frame.origin[1], r.frame.origin[2] + lift] } });
  const ownPlate = { id: 'plate', role: 'top_plate', catalog: '48x148', material: 'timber C24',
    box: { min: [0, -24, 2352 + lift], max: [148, 24, 2400 + lift] } };
  const lumber = r => ({ ...r, catalog: '48x198', material: 'timber C24' });
  const run = (part, joints = [{ type: 'stud_to_plate', parts: { stud: { own: 'rafter' }, plate: { own: 'plate' } } }]) =>
    compileDesign({ ...layout, derive: { module: 'roof_test' } }, {
      ...asset, modules: { ...asset.modules, roof_test: { derived: true, parameters: [], systems: { seh_no: { params: {} } } } },
    }, { derived: { roof_test: { derive: () => ({ parts: [ownPlate, part], joints }) } } });
  const errors = model => model.issues.filter(i => i.severity === 'error');
  let model = run(lumber(own(rafter())));
  assert.deepEqual(errors(model), [], JSON.stringify(model.issues, null, 1));
  const added = model.parts.find(p => p.id === 'roof_test/rafter');
  assert.ok(added.frame && added.notches);
  assert.ok(added.world.max[2] > 2400 + lift + 198 && added.world.min[0] < 0, JSON.stringify(added.world));
  assert.equal(model.joints.find(j => j.owner === 'roof_test').fasteners.count, 2);
  // Without the birdsmouth it overlaps the plate: the joint can't be fastened.
  model = run(lumber(own(rafter(40, false))));
  assert.ok(errors(model).some(i => /'roof_test\/rafter' and 'roof_test\/plate' overlap each other/.test(i.message)), JSON.stringify(model.issues));
  // Touching with no joint.
  model = run(lumber(own(rafter())), []);
  assert.ok(errors(model).some(i => /touches part .* with no joint/.test(i.message)), JSON.stringify(model.issues));
  // A frame whose axes aren't square is refused.
  const bad = lumber(own(rafter()));
  model = run({ ...bad, frame: { ...bad.frame, axes: [[1, 0, 0], [1, 0, 0], [0, 0, 1]] } });
  assert.ok(errors(model).some(i => /the axes must be unit vectors at right angles/.test(i.message)), JSON.stringify(model.issues));
}

console.log(`solids: ${checked} recorded contacts and 300 overlaps agree with the box code; a rafter in its birdsmouth checks, fastens and goes through the engine`);
