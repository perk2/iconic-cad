// The library core (web/js/library/) against recorded results:
// tests/fixtures/library_core_vectors.json holds the expected results for a
// set of inputs; and every
// compiled variant's joints and fasteners in web/assets/library.json,
// recomputed. If the core changes on purpose, update the fixture to match.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { contact, fmtG, longAxis } from '../web/js/library/geometry.js';
import { faceToFace, minus, nailable, sheetRects } from '../web/js/library/framing.js';
import { studPositions, unbackedEdges } from '../web/js/library/walls.js';
import { fastenJoints, fastenerCount } from '../web/js/library/fastening.js';
import { checkParts } from '../web/js/library/checks.js';

const vectors = JSON.parse(readFileSync('tests/fixtures/library_core_vectors.json', 'utf8'));
const asset = JSON.parse(readFileSync('web/assets/library.json', 'utf8'));

// ---- the recorded vectors ---------------------------------------------------
for (const [box, exclude, expected] of vectors.long_axis) {
  assert.equal(longAxis(box, exclude), expected, `longAxis(${JSON.stringify(box)}, ${exclude})`);
}
for (const [a, b, axis, faceOrReason] of vectors.contact) {
  const c = contact(a, b);
  if (axis === null) assert.deepEqual(c, { axis: null, reason: faceOrReason });
  else assert.deepEqual(c, { axis, face: faceOrReason });
}
for (const [entry, axis, face, boxes, through, [count, reason]] of vectors.fastener_count) {
  const got = fastenerCount(entry, axis, face, boxes, through);
  assert.deepEqual(got, count === null ? { count: null, reason } : { count }, JSON.stringify(entry));
}
for (const [a, b, n, face, nail] of vectors.face_to_face) {
  assert.equal(faceToFace(a, b, n), face, `faceToFace(${JSON.stringify(a)}, ${JSON.stringify(b)}, ${n})`);
  assert.equal(nailable(a, b, n), nail, `nailable(${JSON.stringify(a)}, ${JSON.stringify(b)}, ${n})`);
}
for (const [x, text] of vectors.fmt_g) assert.equal(fmtG(x), text, `fmtG(${x})`);
for (const [rect, hole, expected] of vectors.minus) assert.deepEqual(minus(rect, hole), expected);
for (const [args, expected] of vectors.sheet_rects) assert.deepEqual(sheetRects(...args), expected);
for (const [w, s, t, expected] of vectors.stud_positions) {
  assert.deepEqual(studPositions(w, s, t), expected, `studPositions(${w}, ${s}, ${t})`);
}
for (const [pieces, members, rowHeight, height, expected] of vectors.unbacked_edges) {
  assert.deepEqual(unbackedEdges(pieces, members, rowHeight, height), expected);
}

// ---- every compiled variant, recomputed -----------------------------------
const isBuildup = v => v && typeof v === 'object' && Array.isArray(v.face_a) && Array.isArray(v.face_b);
let variants = 0, joints = 0;
for (const [moduleId, module] of Object.entries(asset.modules)) {
  if (module.derived) continue;
  for (const [systemId, sys] of Object.entries(module.systems)) {
    const system = asset.systems[systemId];
    for (const variant of sys.variants) {
      const where = `${moduleId}/${systemId}/${variant.name}`;
      const layers = {};
      for (const value of Object.values(variant.params)) {
        if (isBuildup(value)) for (const group of ['face_a', 'cavity', 'face_b']) {
          for (const layer of value[group]) layers[layer.role] = layer;
        }
      }
      const parts = Object.fromEntries(variant.parts.map(p => [p.id, p]));
      const info = id => ({
        label: `part '${id}'`, box: parts[id].box, stage: parts[id].stage, entity: 'panel',
        layer: layers[parts[id].layer] ?? null,
      });
      const input = variant.joints.map(j => ({ type: j.type, parts: j.parts }));
      const { joints: got, errors } = fastenJoints(where, input, info, asset.joint_types, system);
      assert.deepEqual(errors, [], where);
      assert.deepEqual(got, variant.joints, where);
      assert.deepEqual(checkParts(variant.parts, variant.joints), [], where);
      variants += 1;
      joints += variant.joints.length;
    }
  }
}
assert.ok(variants >= 3 && joints > 100, `checked ${variants} variants, ${joints} joints`);
console.log(`library core: ${variants} variants, ${joints} joints match`);
