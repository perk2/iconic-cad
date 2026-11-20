/** The engine (web/js/engine/): the hut layout and broken variants of it. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { compileDesign } from '../web/js/engine/compile_design.js';
import { det } from '../web/js/engine/affine.js';

const asset = JSON.parse(readFileSync('web/assets/library.json', 'utf8'));
// Same library with wall variants "1200", "600" and "1200_tall" (height 2700);
// kept up to date by tests/library_builder.mjs (--write-fixtures).
const variantsAsset = JSON.parse(readFileSync('tests/fixtures/engine/library_variants.json', 'utf8'));
const hut = JSON.parse(readFileSync('tests/fixtures/engine/hut.json', 'utf8'));
const copy = value => JSON.parse(JSON.stringify(value));
const errors = model => model.issues.filter(i => i.severity === 'error');
const rules = model => model.issues.map(i => i.rule);
const part = (model, id) => model.parts.find(p => p.id === id);

const overlap = (a, b, i) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]);
const intersects = (a, b) => [0, 1, 2].every(i => overlap(a, b, i) > 0);

function assertNoCollisions(model) {
  for (let i = 0; i < model.parts.length; i++) {
    for (let j = i + 1; j < model.parts.length; j++) {
      const [a, b] = [model.parts[i], model.parts[j]];
      assert.ok(!intersects(a.world, b.world), `${a.id} collides with ${b.id}`);
    }
  }
}

// ---- the hut --------------------------------------------------------------
const hutModel = compileDesign(hut, asset, { git: 'test' });
{
  const model = hutModel;
  assert.deepEqual(model.issues, [], JSON.stringify(model.issues, null, 1));
  assert.equal(model.git, 'test');
  // The framing is 3600 x 2696, flush at the corners; the OSB adds 12 outside
  // it on every side (the south wall's sheet is the anchor's y = 0).
  assert.deepEqual(model.summary.outline, { min: [-12, 0], max: [3612, 2720], size: [3624, 2720] });
  assert.deepEqual(model.summary.panels, { 'wall_panel/1200': 10 }); // ten identical panels
  // Each panel: bottom plate, lower top plate, three studs, one sheet (the
  // upper top plate comes from the storey, tests/derived.mjs); each corner a
  // turned stud and a strip of sheathing, fitted on site.
  assert.deepEqual(model.summary.parts_by_stage, { workshop: 60, site: 8 });

  for (const e of model.entities) assert.equal(det(e.transform), 1, `${e.id} is not mirrored`);
  // E1 turned 90 degrees, its end on the south wall's inside framing face
  // (y 160), its framing's outer face on x 3600 and its sheet outside that.
  assert.deepEqual(model.entities.find(e => e.id === 'E1').transform,
    { m: [[0, -1, 0], [1, 0, 0], [0, 0, 1]], t: [3612, 160, 0] });
  assert.deepEqual(part(model, 'E1/stud_left').world, { min: [3452, 160, 48], max: [3600, 208, 2304] });

  // Each turned stud lies flat in a through wall's framing, against its inside
  // face, from the end stud to 48 past the butt wall's inside face; each strip
  // covers the through wall's end on the butt wall's face.
  const corners = {
    c_se: ['S3', { min: [3404, 112, 48], max: [3552, 160, 2304] }, { min: [3600, 0, 0], max: [3612, 160, 2400] }],
    c_ne: ['N1', { min: [3404, 2560, 48], max: [3552, 2608, 2304] }, { min: [3600, 2560, 0], max: [3612, 2720, 2400] }],
    c_nw: ['N3', { min: [48, 2560, 48], max: [196, 2608, 2304] }, { min: [-12, 2560, 0], max: [0, 2720, 2400] }],
    c_sw: ['S1', { min: [48, 112, 48], max: [196, 160, 2304] }, { min: [-12, 0, 0], max: [0, 160, 2400] }],
  };
  for (const [id, [host, turned, strip]] of Object.entries(corners)) {
    for (const [name, world] of [['turned_stud', turned], ['sheathing_strip', strip]]) {
      const p = part(model, `${id}/${name}`);
      assert.equal(p.host, host, id);
      assert.equal(p.stage, 'site');
      assert.deepEqual(p.world, world, `${id}/${name}`);
    }
  }
  assert.equal(model.parts.filter(p => p.id.endsWith('/turned_stud')).length, 4);
  assertNoCollisions(model);

  // Joints: 11 per panel, one seam per inline connection, six per corner.
  assert.equal(model.joints.length, 10 * 11 + 6 * 1 + 4 * 6);
  const ids = new Set(model.parts.map(p => p.id));
  for (const j of model.joints) {
    for (const id of Object.values(j.parts)) assert.ok(ids.has(id), `joint refers to unknown part ${id}`);
  }
  const backerJoint = model.joints.find(j => j.type === 'corner_studs' && j.parts.backing === 'c_se/turned_stud');
  assert.deepEqual(backerJoint, {
    id: 'c_se/j2', owner: 'c_se', type: 'corner_studs',
    parts: { stud: 'E1/stud_left', backing: 'c_se/turned_stud' },
    stage: 'site', fasteners: { item: 'nail_28x95', count: 5 },
  });
  assert.equal(new Set(model.joints.map(j => j.id)).size, model.joints.length, 'joint ids are unique');
  assert.equal(model.joints.find(j => j.id === 'S3/j3').parts.stud, 'S3/stud_1');
  // Per panel: 55 sheathing nails, 2 toenails per stud end.
  // Site: 5 per seam; per corner 5 + 5 into the butt wall's end stud, 8 through
  // the end stud into the turned stud's end (300 c/c, 100 from the ends), 2 + 2
  // toenails into the plates, and 16 ring nails in the strip (150 at its edges).
  assert.deepEqual(model.summary.fasteners_by_stage, {
    workshop: { nail_25x60_ring: 550, nail_28x95: 120 },
    site: { nail_28x95: 6 * 5 + 4 * (5 + 5 + 8 + 2 + 2), nail_25x60_ring: 4 * 16 },
  });
  assert.deepEqual(model.connections.find(c => c.id === 'c_se'),
    { id: 'c_se', interface: 'wall_corner', implementation: 'california', roles: { through: 'S3.right', butt: 'E1.left' } });
}

// ---- the same hut from other anchors ---------------------------------------
// Anchoring N2 where the first walk put it must give identical parts; this
// walk reaches the reference role second at inline and corner connections.
{
  const layout = copy(hut);
  layout.anchor = { entity: 'N2', position: [2400, 2720, 0], facing: 180 };
  const model = compileDesign(layout, asset);
  assert.deepEqual(model.issues, []);
  const before = new Map(hutModel.parts.map(p => [p.id, p.world]));
  for (const p of model.parts) assert.deepEqual(p.world, before.get(p.id), p.id);
}
// Facings 90 and 270 with a position away from the origin: same size, moved.
for (const [facing, min] of [[90, [1000 - 2720, 500 - 12]], [270, [1000, 500 - 3612]]]) {
  const layout = copy(hut);
  layout.anchor = { entity: 'S1', position: [1000, 500, 0], facing };
  const model = compileDesign(layout, asset);
  assert.deepEqual(model.issues, [], `facing ${facing}`);
  assert.deepEqual(model.summary.outline.size, [2720, 3624], `facing ${facing}`);
  assert.deepEqual(model.summary.outline.min, min, `facing ${facing}`);
  assertNoCollisions(model);
}

// ---- the hut with a window and a door -------------------------------------
{
  const layout = JSON.parse(readFileSync('tests/fixtures/engine/hut_openings.json', 'utf8'));
  const model = compileDesign(layout, asset, { git: 'test' });
  assert.deepEqual(model.issues, [], JSON.stringify(model.issues, null, 1));
  assert.deepEqual(model.summary.outline, { min: [-12, 0], max: [3612, 2720], size: [3624, 2720] });
  assert.deepEqual(model.summary.panels, {
    'wall_panel_with_opening/window_10x12': 1, 'wall_panel_with_opening/door_10x20': 1, 'wall_panel/1200': 7,
  });
  assertNoCollisions(model);
  // The turned studs sit where they do with three plain panels in the south run.
  assert.deepEqual(part(model, 'c_se/turned_stud').world, { min: [3404, 112, 48], max: [3552, 160, 2304] });
  assert.deepEqual(part(model, 'c_sw/turned_stud').world, { min: [48, 112, 48], max: [196, 160, 2304] });
  // The door's rough opening: 1010 wide, centred in S2 (x 1800 to 3600), from the
  // top of the whole bottom plate (48) to 2048; the jack runs up to the
  // header, which sits on it, with cripples above up to the lower top plate.
  assert.deepEqual(part(model, 'S2/jack_left').world, { min: [2147, 12, 48], max: [2195, 160, 2048] });
  assert.deepEqual(part(model, 'S2/header_outer').world, { min: [2147, 12, 2048], max: [3253, 60, 2196] });
  assert.deepEqual(part(model, 'S2/cripple_top_1').world, { min: [2376, 12, 2196], max: [2424, 160, 2304] });
  assert.deepEqual(part(model, 'S2/bottom_plate').world, { min: [1800, 12, 0], max: [3600, 160, 48] });
  // The corner at the door panel joins its end stud and its bottom plate.
  const backerPlate = model.joints.find(j => j.owner === 'c_se' && j.type === 'backer_to_plate'
    && j.parts.plate.startsWith('S2/bottom'));
  assert.equal(backerPlate.parts.plate, 'S2/bottom_plate');
  // 11 joints per plain panel, 62 for the window panel, 45 for the door panel;
  // five seams and four corners of six.
  assert.equal(model.joints.length, 7 * 11 + 62 + 45 + 5 + 4 * 6);
}

// ---- several variants -----------------------------------------------------
// South and north walls of 1200 + 600 + 600 + 1200: the same outline, and
// the pair lookup and offsets must use the right variant at each end.
{
  const layout = {
    system: 'seh_no',
    anchor: { entity: 'S1', position: [0, 0, 0], facing: 0 },
    entities: [
      ...['S1', 'S4', 'N1', 'N4', 'E1', 'E2', 'W1', 'W2'].map(id => ({ id, module: 'wall_panel', variant: '1200' })),
      ...['S2', 'S3', 'N2', 'N3'].map(id => ({ id, module: 'wall_panel', variant: '600' })),
    ],
    connections: [
      { id: 'c_s12', interface: 'wall_inline', a: 'S1.right', b: 'S2.left' },
      { id: 'c_s23', interface: 'wall_inline', a: 'S2.right', b: 'S3.left' },
      { id: 'c_s34', interface: 'wall_inline', a: 'S3.right', b: 'S4.left' },
      { id: 'c_se', interface: 'wall_corner', through: 'S4.right', butt: 'E1.left' },
      { id: 'c_e12', interface: 'wall_inline', a: 'E1.right', b: 'E2.left' },
      { id: 'c_ne', interface: 'wall_corner', through: 'N1.left', butt: 'E2.right' },
      { id: 'c_n12', interface: 'wall_inline', a: 'N1.right', b: 'N2.left' },
      { id: 'c_n23', interface: 'wall_inline', a: 'N2.right', b: 'N3.left' },
      { id: 'c_n34', interface: 'wall_inline', a: 'N3.right', b: 'N4.left' },
      { id: 'c_nw', interface: 'wall_corner', through: 'N4.right', butt: 'W1.left' },
      { id: 'c_w12', interface: 'wall_inline', a: 'W1.right', b: 'W2.left' },
      { id: 'c_sw', interface: 'wall_corner', through: 'S1.left', butt: 'W2.right' },
    ],
  };
  const model = compileDesign(layout, variantsAsset);
  assert.deepEqual(model.issues, [], JSON.stringify(model.issues, null, 1));
  assert.deepEqual(model.summary.outline.size, [3624, 2720]);
  assert.deepEqual(model.summary.panels, { 'wall_panel/1200': 8, 'wall_panel/600': 4 });
  assert.deepEqual(model.entities.find(e => e.id === 'S3').transform.t, [1800, 0, 0]);
  assert.deepEqual(part(model, 'c_se/turned_stud').world, { min: [3404, 112, 48], max: [3552, 160, 2304] });
  assertNoCollisions(model);

  // A tall wall can't meet a 2400 wall at a corner: the asset says why.
  const tall = copy(layout);
  tall.entities.find(e => e.id === 'E1').variant = '1200_tall';
  tall.entities.find(e => e.id === 'E2').variant = '1200_tall';
  const issues = compileDesign(tall, variantsAsset).issues;
  const sameHeight = issues.filter(i => i.rule === 'same_height');
  assert.deepEqual(sameHeight.map(i => i.connections), [['c_se'], ['c_ne']]);
  assert.match(sameHeight[0].message, /same_height fails for variants '1200' and '1200_tall'/);
}

// ---- broken layouts: each still gives a model, with the expected issue ----
const broken = (name, change, check, library = asset) => {
  const layout = copy(hut);
  change(layout);
  const model = compileDesign(layout, library);
  try {
    check(model);
    for (const i of model.issues) {
      assert.ok(Array.isArray(i.entities) && Array.isArray(i.connections), `issue ${i.rule} names its subjects`);
    }
  } catch (err) {
    err.message = `${name}: ${err.message}\n${JSON.stringify(model.issues, null, 1)}`;
    throw err;
  }
};
const dropConnection = (layout, id) => {
  layout.connections = layout.connections.filter(c => c.id !== id);
};
const connection = (layout, id) => layout.connections.find(c => c.id === id);
const only = (model, rule) => assert.deepEqual(errors(model).map(i => i.rule), [rule]);

broken('missing corner', l => dropConnection(l, 'c_se'), model => {
  assert.deepEqual(errors(model), []);
  assert.deepEqual(model.issues.filter(i => i.rule === 'free_port').map(i => i.message).sort(),
    ["port 'E1.left' is not connected", "port 'S3.right' is not connected"]);
  assert.equal(model.parts.filter(p => p.id.endsWith('/turned_stud')).length, 3);
});

broken('east run of three panels', l => {
  l.entities.push({ id: 'E3', module: 'wall_panel', variant: '1200' });
  l.connections.push({ id: 'c_e23', interface: 'wall_inline', a: 'E2.right', b: 'E3.left' });
  connection(l, 'c_ne').butt = 'E3.right';
}, model => {
  only(model, 'loop_gap');
  assert.equal(Math.round(model.issues.find(i => i.rule === 'loop_gap').gap_mm), 1200);
  assert.ok(model.parts.length > 0, 'the model is still assembled');
});

broken('corner roles swapped', l => {
  Object.assign(connection(l, 'c_se'), { through: 'E1.left', butt: 'S3.right' });
}, model => only(model, 'loop_gap')); // allowed, but the east wall now runs through

broken('two right ends at a corner', l => {
  dropConnection(l, 'c_e12');
  connection(l, 'c_se').butt = 'E1.right';
}, model => {
  const i = model.issues.find(x => x.rule === 'hands');
  assert.ok(i, 'reported with the reason from the library');
  assert.match(i.message, /a right end and a right end can't meet in rule 'corner'/);
  assert.deepEqual(i.connections, ['c_se']);
});

broken('unknown variant', l => { l.entities.find(e => e.id === 'S2').variant = '2400'; }, model => {
  assert.ok(rules(model).includes('unknown_variant'));
  assert.ok(model.entities.find(e => e.id === 'S3').transform, 'S3 is still placed the long way round');
  assert.equal(model.connections.find(c => c.id === 'c_s12').implementation, null, 'rejected connections stay');
});

broken('wall not connected', l => { l.entities.push({ id: 'X', module: 'wall_panel', variant: '1200' }); }, model => {
  assert.deepEqual(errors(model).map(i => [i.rule, i.entities]), [['unplaced', ['X']]]);
  // The unplaced wall's joints are left out of the model and its counts.
  assert.ok(!model.joints.some(j => j.owner === 'X'));
  assert.deepEqual(model.summary.fasteners_by_stage, {
    workshop: { nail_25x60_ring: 550, nail_28x95: 120 },
    site: { nail_28x95: 6 * 5 + 4 * (5 + 5 + 8 + 2 + 2), nail_25x60_ring: 4 * 16 },
  });
});

broken('missing connection id', l => { delete connection(l, 'c_s23').id; }, model => {
  assert.ok(rules(model).includes('missing_id'));
});
broken('duplicate connection id', l => { connection(l, 'c_s23').id = 'c_s12'; }, model => {
  const i = model.issues.find(x => x.rule === 'duplicate_id');
  assert.deepEqual(i.connections, ['c_s12']);
});
broken('id with a dot', l => { l.entities.find(e => e.id === 'S2').id = 'S.2'; }, model => {
  assert.ok(rules(model).includes('bad_id'));
});

broken('wrong role names', l => {
  const c = connection(l, 'c_s12');
  c.left = c.a;
  delete c.a;
}, model => {
  assert.ok(rules(model).includes('roles'));
  assert.ok(rules(model).includes('unknown_field'));
});
broken('extra field is only a warning', l => { connection(l, 'c_s12').note = 'check this one'; }, model => {
  assert.deepEqual(errors(model), []);
  assert.ok(rules(model).includes('unknown_field'));
});

broken('port used twice', l => {
  l.connections.push({ id: 'c_extra', interface: 'wall_inline', a: 'S1.right', b: 'N2.left' });
}, model => {
  assert.ok(rules(model).includes('port_in_use'));
});
broken('port used twice through a longer reference', l => {
  l.connections.push({ id: 'c_extra', interface: 'wall_inline', a: 'S1.right.x', b: 'N2.left' });
}, model => {
  assert.ok(rules(model).includes('bad_port_ref'));
});

broken('unknown port', l => { connection(l, 'c_s12').a = 'S1.top'; }, model => {
  assert.ok(rules(model).includes('unknown_port'));
});
broken('port that cannot fill the role', l => { connection(l, 'c_s12').a = 'S1.left'; }, model => {
  assert.ok(rules(model).includes('role'));
});
broken('both roles on one entity', l => { connection(l, 'c_s12').b = 'S1.left'; }, model => {
  assert.ok(rules(model).includes('same_entity'));
});
broken('unknown interface', l => { connection(l, 'c_s12').interface = 'wall_t'; }, model => {
  assert.ok(rules(model).includes('unknown_interface'));
});
broken('unknown port kind', () => {}, model => {
  assert.ok(rules(model).includes('unknown_port_kind'));
}, (() => {
  const a = copy(asset);
  a.modules.wall_panel.ports.right.kind = 'hinged';
  return a;
})());

broken('anchor facing not a right angle', l => { l.anchor.facing = 30; }, model => {
  assert.ok(rules(model).includes('anchor'));
  assert.equal(model.parts.length, 0);
});
broken('anchor position not three numbers', l => { l.anchor.position = [0, 0]; }, model => {
  assert.ok(rules(model).includes('anchor'));
});
broken('anchor facing not a number', l => { l.anchor.facing = 'north'; }, model => {
  assert.ok(rules(model).includes('anchor'));
});
broken('null entity and connection', l => { l.entities.push(null); l.connections.push(null); }, model => {
  assert.equal(rules(model).filter(r => r === 'malformed').length, 2);
});
broken('connections not a list', l => { l.connections = {}; }, model => {
  assert.ok(rules(model).includes('malformed'));
});
broken('a transform that would mirror', () => {}, model => {
  assert.ok(rules(model).includes('mirrored'));
}, (() => {
  const a = copy(asset);
  const t = a.interfaces.wall_inline.systems.seh_no.pairs[0].transform;
  t.across = [0, 0, -1]; // corrupt: flips one axis
  return a;
})());

assert.throws(() => compileDesign({ nope: true }, asset), /not a layout/);

// ---- the command line -----------------------------------------------------
{
  const run = args => spawnSync(process.execPath, ['scripts/compile_design.mjs', ...args], { encoding: 'utf8' });
  const ok = run(['tests/fixtures/engine/hut.json']);
  assert.equal(ok.status, 0, ok.stderr);
  const model = JSON.parse(ok.stdout);
  assert.match(model.git, /^[0-9a-f]{40}(-modified)?$/);
  assert.deepEqual(model.summary.outline.size, [3624, 2720]);
  const withErrors = run(['tests/fixtures/engine/hut.json', '--library', 'tests/fixtures/engine/library_variants.json']);
  assert.equal(withErrors.status, 0, 'the variants library also has the 1200 variant');
  assert.equal(run(['no/such/layout.json']).status, 2);
}
{
  // Exit status 1 when the model has errors.
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    import { spawnSync } from 'node:child_process';
    const layout = JSON.parse(readFileSync('tests/fixtures/engine/hut.json', 'utf8'));
    layout.entities.push({ id: 'X', module: 'wall_panel', variant: '1200' });
    const file = join(mkdtempSync(join(tmpdir(), 'engine-')), 'layout.json');
    writeFileSync(file, JSON.stringify(layout));
    const r = spawnSync(process.execPath, ['scripts/compile_design.mjs', file], { encoding: 'utf8' });
    process.exit(r.status);
  `], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stderr);
}

console.log('engine: ok');
