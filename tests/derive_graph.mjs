// The layout's derived modules as a list (hut/design/ic_lib_roof.md, 4.2):
// run in order of `after`, each with the model so far and its
// dependencies' exports; a failure keeps what came before and skips what
// depends on it; parameters from the system file and the layout entry.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileDesign } from '../web/js/engine/compile_design.js';
import * as storey from '../library/modules/storey/derive.js';
import * as wallLine from '../library/modules/wall_line/derive.js';
import * as floor from '../library/modules/floor/derive.js';

const asset = JSON.parse(readFileSync('web/assets/library.json', 'utf8'));
const hut = JSON.parse(readFileSync('tests/fixtures/engine/hut.json', 'utf8'));
const errors = model => model.issues.filter(i => i.severity === 'error');

// Test modules: `probe` records what it was given and adds one part of its
// own, clear of the hut; `boom` throws; `sized` has parameters of each kind.
let seen = [];
const probe = { derive: (params, input) => {
  seen.push({ params, exports: input.exports, owners: new Set(input.parts.map(p => p.owner)) });
  const x = 200 * input.parts.filter(p => p.role === 'blocking' && p.world.min[2] === 9000).length; // beside earlier probes' blocks
  return {
    parts: [{ id: 'block', role: 'blocking', catalog: '48x148', material: 'timber C24', box: { min: [x, 0, 9000], max: [x + 100, 48, 9148] } }],
    joints: [], exports: { made: 'block' },
  };
} };
const boom = { derive: () => { throw new Error('no roof today'); } };
const derived = { storey, wall_line: wallLine, floor, probe, boom, sized: probe };
const lib = {
  ...asset,
  modules: {
    ...asset.modules,
    probe: { derived: true, parameters: [], systems: { seh_no: { params: {} } } },
    boom: { derived: true, parameters: [], systems: { seh_no: { params: {} } } },
    sized: {
      derived: true,
      parameters: [
        { name: 'joist', type: 'lumber', description: 'fixed' },
        { name: 'pitch', type: 'angle', min: 5, max: 45, description: 'from the layout' },
        { name: 'ridge', type: 'choice', values: ['east_west', 'north_south'], description: 'from the layout' },
        { name: 'eaves', type: 'length', min: 0, max: 800, description: 'from the layout' },
      ],
      systems: { seh_no: { params: { joist: { id: '48x198', section: [48, 198] } } } },
    },
  },
};
const run = derive => { seen = []; return compileDesign({ ...hut, derive }, lib, { derived }); };

// ---- one entry, as before ----------------------------------------------------
{
  const model = run({ module: 'storey' });
  assert.deepEqual(errors(model), []);
  assert.ok(model.parts.some(p => p.id.startsWith('storey/line_S1/upper_plate')));
}

// ---- a list: the second sees the first's parts and exports --------------------
{
  const model = run([{ module: 'storey' }, { module: 'probe', after: ['storey'] }]);
  assert.deepEqual(errors(model), [], JSON.stringify(model.issues));
  assert.equal(seen.length, 1);
  assert.ok(seen[0].owners.has('storey'), 'the probe sees the storey\'s parts');
  const ex = seen[0].exports.storey;
  // The framing (3600 x 2696, behind the south wall's 12 OSB) and the walls with their sheets.
  assert.deepEqual(ex.outline, { min: [0, 12], max: [3600, 2708] });
  assert.deepEqual(ex.outside, { min: [-12, 0], max: [3612, 2720] });
  assert.equal(ex.plate_top, 2400);
  assert.deepEqual(ex.lines.map(l => l.side).sort(), ['east', 'north', 'south', 'west']);
  assert.ok(ex.lines.every(l => l.plates.length && l.plates.every(id => model.parts.some(p => p.id === `storey/${id}`))));
  assert.ok(model.parts.some(p => p.id === 'probe/block' && p.owner === 'probe'));
  // The order follows `after`, not the list.
  run([{ module: 'probe', after: ['storey'] }, { module: 'storey' }]);
  assert.ok(seen[0].owners.has('storey'));
  // An id of its own prefixes its parts.
  const twice = run([{ module: 'probe' }, { id: 'probe_2', module: 'probe', after: ['probe'] }]);
  assert.deepEqual(errors(twice), [], JSON.stringify(twice.issues));
  assert.ok(twice.parts.some(p => p.id === 'probe_2/block'));
  assert.deepEqual(seen[1].exports, { probe: { made: 'block' } });
}

// ---- a failure keeps what came before and skips what depends on it ------------
{
  const model = run([{ module: 'storey' }, { module: 'boom', after: ['storey'] }, { module: 'probe', after: ['boom'] }]);
  const issues = errors(model);
  assert.ok(issues.some(i => i.rule === 'derive_failed' && /derived module 'boom': no roof today/.test(i.message)), JSON.stringify(issues));
  assert.ok(issues.some(i => i.rule === 'derive_skipped' && /'probe' is skipped: 'boom' failed/.test(i.message)), JSON.stringify(issues));
  assert.ok(model.parts.some(p => p.owner === 'storey'), 'the storey\'s parts stay');
  assert.equal(seen.length, 0);
}

// ---- parameters: the system file fixes some, the layout gives the rest --------
{
  let model = run({ module: 'sized', parameters: { pitch: 27, ridge: 'east_west', eaves: 400 } });
  assert.deepEqual(errors(model), [], JSON.stringify(model.issues));
  assert.deepEqual(seen[0].params, { joist: { id: '48x198', section: [48, 198] }, pitch: 27, ridge: 'east_west', eaves: 400 });
  const problems = parameters => errors(run({ module: 'sized', parameters })).map(i => i.message);
  assert.deepEqual(problems({ pitch: 27, ridge: 'east_west' }), ["derived module 'sized': parameter 'eaves' has no value: give it in the layout"]);
  assert.deepEqual(problems({ pitch: 60, ridge: 'east_west', eaves: 400 }), ["derived module 'sized': parameter 'pitch': 60 is above the maximum 45"]);
  assert.deepEqual(problems({ pitch: 27, ridge: 'up', eaves: 400 }), [`derived module 'sized': parameter 'ridge': "up" is not one of east_west, north_south`]);
  assert.deepEqual(problems({ pitch: 27, ridge: 'east_west', eaves: 400, joist: '48x148' }),
    ["derived module 'sized': parameter 'joist': fixed by the system file; the layout can't change it"]);
  assert.deepEqual(problems({ pitch: 27, ridge: 'east_west', eaves: 400, colour: 'red' }), ["derived module 'sized': parameter 'colour': not a parameter of 'sized'"]);
  assert.deepEqual(problems({ pitch: '27', ridge: 'east_west', eaves: 400 }), [`derived module 'sized': parameter 'pitch': expected a number, got "27"`]);
  // A catalog type comes from the system file only.
  model = compileDesign({ ...hut, derive: { module: 'sized', parameters: { pitch: 27, ridge: 'east_west', eaves: 400 } } }, {
    ...lib, modules: { ...lib.modules, sized: { ...lib.modules.sized, systems: { seh_no: { params: {} } } } },
  }, { derived });
  assert.ok(errors(model).some(i => /parameter 'joist' has no value/.test(i.message)), JSON.stringify(model.issues));
  model = compileDesign({ ...hut, derive: { module: 'sized', parameters: { joist: '48x198', pitch: 27, ridge: 'east_west', eaves: 400 } } }, {
    ...lib, modules: { ...lib.modules, sized: { ...lib.modules.sized, systems: { seh_no: { params: {} } } } },
  }, { derived });
  assert.ok(errors(model).some(i => /parameter 'joist': a lumber can't be given in the layout/.test(i.message)), JSON.stringify(model.issues));
}

// ---- malformed lists ----------------------------------------------------------
{
  const messages = derive => errors(run(derive)).map(i => i.message);
  assert.ok(messages([{ module: 'probe' }, { module: 'probe' }]).some(m => /the id 'probe' is used twice/.test(m)));
  assert.ok(messages([{ module: 'probe', after: ['roof'] }]).some(m => /after 'roof': no such derived module/.test(m)));
  assert.ok(messages([{ id: 'a', module: 'probe', after: ['b'] }, { id: 'b', module: 'probe', after: ['a'] }]).some(m => /goes round in a circle/.test(m)));
  assert.ok(messages([{ module: 'probe', colour: 'red' }]).some(m => /unknown key\(s\) colour/.test(m)));
  assert.ok(messages([{ module: 'probe', id: 'Roof 1' }]).some(m => /must be a lower-case name/.test(m)));
  assert.ok(messages([{ module: 'wall_panel' }]).some(m => /'wall_panel' is not a derived module/.test(m)));
}

console.log('derive graph: lists in order of after, exports, partial models, skipped dependants, parameters from the system and the layout');
