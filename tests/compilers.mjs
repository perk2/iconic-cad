// The catalog compilers and interface implementations (library/modules/*/
// compile.js, library/interfaces/*/implementations/*.js): every compiled
// variant and baked pair in library.json recomputed, and recorded results
// for parameters outside the library (tests/fixtures/library_core_vectors.json:
// compile).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CORE } from '../web/js/library/core.js';
import { fastenJoints } from '../web/js/library/fastening.js';
import { fromFrame, toFrame } from '../web/js/library/frames.js';

const asset = JSON.parse(readFileSync('web/assets/library.json', 'utf8'));
const vectors = JSON.parse(readFileSync('tests/fixtures/library_core_vectors.json', 'utf8'));
const compilers = {
  wall_panel: await import('../library/modules/wall_panel/compile.js'),
  wall_panel_with_opening: await import('../library/modules/wall_panel_with_opening/compile.js'),
};
const implementations = {
  california: await import('../library/interfaces/wall_corner/implementations/california.js'),
  plain: await import('../library/interfaces/wall_inline/implementations/plain.js'),
};
const withoutHand = ports => Object.fromEntries(Object.entries(ports).map(([k, { hand, ...frame }]) => [k, frame]));
const layersOf = params => {
  const out = {};
  for (const value of Object.values(params)) {
    if (value && Array.isArray(value.face_a)) for (const g of ['face_a', 'cavity', 'face_b']) for (const l of value[g]) out[l.role] = l;
  }
  return out;
};

// ---- every compiled variant: the same parts, ports and fastened joints ----
let variants = 0;
for (const [moduleId, module] of Object.entries(asset.modules)) {
  if (module.derived) continue;
  for (const [systemId, sys] of Object.entries(module.systems)) {
    for (const v of sys.variants) {
      const where = `${moduleId}/${v.name}`;
      const out = compilers[moduleId].compile(v.params, CORE);
      assert.deepEqual(out.size, v.size, where);
      assert.deepEqual(out.parts, v.parts, where);
      assert.deepEqual(out.ports, withoutHand(v.ports), where);
      const parts = Object.fromEntries(out.parts.map(p => [p.id, p]));
      const layers = layersOf(v.params);
      const info = id => ({ label: `'${id}'`, box: parts[id].box, stage: parts[id].stage, entity: 'panel', layer: layers[parts[id].layer] ?? null });
      const { joints, errors } = fastenJoints(where, out.joints, info, asset.joint_types, asset.systems[systemId]);
      assert.deepEqual(errors, [], where);
      assert.deepEqual(joints, v.joints, where);
      variants += 1;
    }
  }
}

// ---- parameters outside the library: the recorded result or error ------------
for (const [moduleId, params, expected, error] of vectors.compile) {
  const where = `${moduleId} ${JSON.stringify({ width: params.width, height: params.height, spacing: params.spacing })}`;
  if (error) {
    assert.throws(() => compilers[moduleId].compile(params, CORE), e => e.message === error, where);
  } else {
    assert.deepEqual(compilers[moduleId].compile(params, CORE), expected, where);
  }
}

// ---- every baked pair: the same parts and joints ----------------------------
let pairs = 0;
for (const [ifaceId, iface] of Object.entries(asset.interfaces)) {
  const reference = iface.placement.reference;
  for (const [systemId, sys] of Object.entries(iface.systems)) {
    for (const entry of sys.pairs) {
      const participants = {};
      for (const [role, { module, variant, port }] of Object.entries(entry.participants)) {
        const v = asset.modules[module].systems[systemId].variants.find(x => x.name === variant);
        const frame = v.ports[port];
        const byId = Object.fromEntries(v.parts.map(p => [p.id, p]));
        const place = box => (role === reference ? box : fromFrame(box, entry.transform));
        const exposed = {};
        for (const name of iface.roles[role].exposes) {
          const { stage, ...part } = byId[frame.exposes[name]];
          exposed[name] = { ...part, box: place(toFrame(part.box, frame)) };
        }
        participants[role] = { module, variant, port, size: v.size, exposed };
      }
      const out = implementations[entry.implementation].build(participants, CORE);
      const where = `${ifaceId} ${JSON.stringify(entry.participants)}`;
      assert.deepEqual(out.parts.map(p => ({ stage: sys.stage, ...p })), entry.parts, where);
      const resolve = ref => (ref.of === 'implementation' ? ref
        : { of: ref.of, part: participants[ref.of].exposed[ref.part].id });
      assert.deepEqual(out.joints.map(j => ({ type: j.type, parts: Object.fromEntries(Object.entries(j.parts).map(([s, r]) => [s, resolve(r)])) })),
        entry.joints.map(j => ({ type: j.type, parts: j.parts })), where);
      pairs += 1;
    }
  }
}
assert.ok(variants >= 3 && pairs >= 20, `checked ${variants} variants, ${pairs} pairs`);
console.log(`compilers: ${variants} variants, ${vectors.compile.length} other cases and ${pairs} baked pairs match`);
