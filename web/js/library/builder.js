// The library builder. Reads the library source under
// library/ and writes web/assets/library.json:
//
//   library/joint_types.yaml
//   library/systems/<system>/system.yaml
//   library/modules/<module>/schema.yaml, systems/<system>.yaml, compile.js
//     (a derived module: derive.js, run by the engine at design time)
//   library/interfaces/<interface>/interface.yaml, systems/<system>.yaml,
//     implementations/<implementation>.js
//
// Passes: load, validate, resolve, compile (compile(params, core)), compile
// implementations (build(participants, core)), export. File access comes
// from the caller (a `source`, see build()), so the builder itself does no
// I/O: scripts/build_library.mjs gives it the file system.
//
// YAML mappings arrive as Maps (written order and key types kept);
// compiled output is plain objects; the helpers read both.

import { parse as parseYaml } from '../../vendor/yaml.mjs';
import { CORE } from './core.js';
import { contact } from './geometry.js';
import { fastenJoints } from './fastening.js';
import { fromFrame, portHand, toFrame } from './frames.js';

// What the engine and builder know about. A new entry here is a code change.
export const PARAMETER_TYPES = new Set(['length', 'lumber', 'buildup', 'opening_unit']);
// Catalog sections an `opening_unit` parameter resolves against, and the kind each gives.
const UNIT_SECTIONS = { windows: 'window', doors: 'door' };
// Port kinds: only fixed ports (sliding ports went with the placed floor).
const PORT_KINDS = new Set(['fixed']);
// Placement rule kinds: a fixed turn plus an offset, giving the other port's
// frame (M) in the reference port's frame (R), in [normal, along, across].
export const PLACEMENT_RULES = {
  flush: {
    params: [], hands: 'opposite', shift: null,
    turn: { normal: [-1, 0, 0], along: [0, 1, 0], across: [0, 0, 1] },
  },
  corner: {
    params: ['offset'], hands: 'opposite', shift: 'across',
    turn: { normal: [0, 0, -1], along: [0, 1, 0], across: [-1, 0, 0] },
  },
};
const FRAME_AXES = ['normal', 'along', 'across'];
// Interface checks, per variant pair; a pair that fails one is not baked.
const INTERFACE_CHECKS = {
  same_height: (a, b) => a.height === b.height,
  same_depth: (a, b) => a.depth === b.depth,
  same_framing: (a, b) => a.framing === b.framing,
};
const RELATIONS = new Set(['bears_on', 'fastens_to']);
const STAGES = new Set(['workshop', 'site']);
const FASTENER_KINDS = new Set(['nail', 'screw']);
const FASTENING_METHODS = new Set(['straight', 'toe']);
const FASTENER_SHANKS = new Set(['smooth', 'ring']);
const TOUCH_MM = 1;
const TOLERANCE = 1e-9;
const STATUSES = new Set(['draft', 'active', 'deprecated']);
const BUILDUP_GROUPS = ['face_a', 'cavity', 'face_b'];
const RESERVED_PARAMETERS = new Set(['status']);
const COMPILED_SIZES = ['width', 'height', 'depth'];
const OPTIONAL_SIZES = ['framing'];
export const ASSET = 'web/assets/library.json';

// ---- problems --------------------------------------------------------------
export class Problems {
  constructor() { /** @type {Array<{severity: string, file: string, message: string}>} */ this.items = []; }
  error(file, message) { this.items.push({ severity: 'error', file: String(file), message }); }
  warning(file, message) { this.items.push({ severity: 'warning', file: String(file), message }); }
  get errors() { return this.items.filter(p => p.severity === 'error'); }
  get warnings() { return this.items.filter(p => p.severity === 'warning'); }
}
export const problemText = p => `${p.severity}: ${p.file}: ${p.message}`;

// ---- values: Maps (YAML) and plain objects (compiled output) alike -------
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Map) && !(v instanceof Set);
const isMapping = v => v instanceof Map || isPlain(v);
const keysOf = v => (v instanceof Map ? [...v.keys()] : isPlain(v) ? Object.keys(v) : []);
const entriesOf = v => (v instanceof Map ? [...v.entries()] : isPlain(v) ? Object.entries(v) : []);
const get = (v, k) => (v instanceof Map ? v.get(k) : isPlain(v) && Object.hasOwn(v, k) ? v[k] : undefined);
const has = (v, k) => (v instanceof Map ? v.has(k) : isPlain(v) ? Object.hasOwn(v, k) : false);
const sizeOf = v => keysOf(v).length;
/** Whether a container (Map, Set, list, object) holds value. */
function inside(value, container) {
  if (container instanceof Map || container instanceof Set) return container.has(value);
  if (Array.isArray(container)) return container.includes(value);
  if (isPlain(container)) return typeof value === 'string' && Object.hasOwn(container, value);
  return false;
}
const isStr = v => typeof v === 'string' && v !== '';
const isNumber = v => typeof v === 'number' && Number.isFinite(v);
const isVector = v => Array.isArray(v) && v.length === 3 && v.every(isNumber);
/** A mapping as a plain object, deeply (Maps from YAML become objects). */
export function toPlain(v) {
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [String(k), toPlain(x)]));
  if (Array.isArray(v)) return v.map(toPlain);
  if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]));
  return v;
}
const sortedJoin = choices => [...choices].sort().join(', ');

// A value's text in messages: text quoted, lists and mappings written out,
// numbers in short form (nan, inf; exponents with two digits).
const numText = n => (Number.isNaN(n) ? 'nan' : n === Infinity ? 'inf' : n === -Infinity ? '-inf' : String(n).replace(/e([+-])(\d)$/, 'e$10$2'));
function quoted(v) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return numText(v);
  if (typeof v === 'string') {
    const quote = v.includes("'") && !v.includes('"') ? '"' : "'";
    const body = v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
    return quote + (quote === "'" ? body.replace(/'/g, "\\'") : body) + quote;
  }
  if (Array.isArray(v)) return `[${v.map(quoted).join(', ')}]`;
  if (isMapping(v)) return `{${entriesOf(v).map(([k, x]) => `${quoted(k)}: ${quoted(x)}`).join(', ')}}`;
  return String(v);
}
const textOf = v => (typeof v === 'string' ? v : quoted(v));
function describe(value) {
  if (typeof value === 'boolean') {
    return `${value} (a boolean) (YAML reads unquoted yes/no/true/false/on/off as booleans; quote it)`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return `${numText(value)} (not a finite number)`;
  if (typeof value === 'number') return `${numText(value)} (a number; quote it if it is a name)`;
  if (value === null || value === undefined) return 'nothing';
  return quoted(value);
}

function checkKeys(problems, file, where, data, required, optional = []) {
  if (!isMapping(data)) {
    problems.error(file, `${where}: expected a mapping, got ${describe(data)}`);
    return false;
  }
  for (const key of required) if (!has(data, key)) problems.error(file, `${where}: missing '${key}'`);
  const allowed = new Set([...required, ...optional]);
  for (const key of keysOf(data)) if (!allowed.has(key)) problems.error(file, `${where}: unknown key '${textOf(key)}'`);
  return true;
}
function checkStr(problems, file, where, value) {
  if (!isStr(value)) { problems.error(file, `${where}: expected text, got ${describe(value)}`); return false; }
  return true;
}
function checkNumber(problems, file, where, value) {
  if (!isNumber(value)) { problems.error(file, `${where}: expected a number, got ${describe(value)}`); return false; }
  return true;
}
function checkPair(problems, file, where, value) {
  if (!(Array.isArray(value) && value.length === 2 && value.every(v => isNumber(v) && v > 0))) {
    problems.error(file, `${where}: expected two positive numbers, got ${describe(value)}`);
    return false;
  }
  return true;
}
function checkChoice(problems, file, where, value, choices) {
  if (!inside(value, choices)) {
    problems.error(file, `${where}: ${describe(value)} is not one of ${sortedJoin(choices instanceof Set ? choices : keysOf(choices))}`);
    return false;
  }
  return true;
}

// ---- load -------------------------------------------------------------------
// A source: {read(rel) -> text | null, files(rel, suffix) -> sorted names,
// dirs(rel) -> sorted names, isFile(rel), importCode(rel) -> module}.
function readYaml(source, rel, problems) {
  const text = source.read(rel);
  let data;
  try {
    data = parseYaml(text, { version: '1.1', mapAsMap: true, uniqueKeys: true, prettyErrors: false });
  } catch (error) {
    let message = error.message;
    if (error.code === 'DUPLICATE_KEY' && error.pos) {
      // Name the key, as the message doesn't.
      const lineNo = text.slice(0, error.pos[0]).split('\n').length;
      const line = text.split('\n')[lineNo - 1] ?? '';
      const key = line.trim().replace(/^-\s*/, '').split(':')[0].replace(/^["']|["']$/g, '');
      message = `duplicate key '${key}' (line ${lineNo})`;
    }
    problems.error(rel, `not valid YAML: ${message}`);
    return null;
  }
  if (!(data instanceof Map)) {
    problems.error(rel, 'expected a mapping at the top level');
    return null;
  }
  return { path: rel, data };
}
function systemFiles(source, folder, problems) {
  const out = new Map();
  for (const name of source.files(`${folder}/systems`, '.yaml')) {
    const s = readYaml(source, `${folder}/systems/${name}`, problems);
    if (s) out.set(name.slice(0, -'.yaml'.length), s);
  }
  return out;
}

export function load(source, problems) {
  /** @type {any} */
  const lib = { jointTypes: null, systems: new Map(), modules: new Map(), interfaces: new Map() };
  if (source.isFile('library/joint_types.yaml')) lib.jointTypes = readYaml(source, 'library/joint_types.yaml', problems);
  else problems.error('library/joint_types.yaml', 'missing');
  for (const name of source.dirs('library/systems')) {
    const rel = `library/systems/${name}/system.yaml`;
    if (!source.isFile(rel)) continue;
    const s = readYaml(source, rel, problems);
    if (s) lib.systems.set(name, s);
  }
  for (const name of source.dirs('library/modules')) {
    const rel = `library/modules/${name}/schema.yaml`;
    if (!source.isFile(rel)) continue;
    const s = readYaml(source, rel, problems);
    if (s) {
      lib.modules.set(name, {
        id: name, schema: s, systems: systemFiles(source, `library/modules/${name}`, problems),
        get derived() { return get(this.schema.data, 'derived') === true; },
      });
    }
  }
  for (const name of source.dirs('library/interfaces')) {
    const rel = `library/interfaces/${name}/interface.yaml`;
    if (!source.isFile(rel)) continue;
    const s = readYaml(source, rel, problems);
    if (s) {
      const implementations = new Set(source.files(`library/interfaces/${name}/implementations`, '.js')
        .filter(f => !f.startsWith('_')).map(f => f.slice(0, -3)));
      lib.interfaces.set(name, { id: name, interface: s, systems: systemFiles(source, `library/interfaces/${name}`, problems), implementations });
    }
  }
  return lib;
}

// ---- validate ---------------------------------------------------------------
function validateJointTypes(src, problems) {
  const names = new Map();
  for (const [name, jt] of entriesOf(src.data)) {
    const where = `joint type '${textOf(name)}'`;
    if (!isStr(name)) { problems.error(src.path, `joint type name ${describe(name)} must be text`); continue; }
    names.set(name, null);
    if (!checkKeys(problems, src.path, where, jt, ['description', 'sides'])) continue;
    checkStr(problems, src.path, `${where}: description`, get(jt, 'description'));
    const sides = get(jt, 'sides');
    if (!(isMapping(sides) && sizeOf(sides) === 2)) { problems.error(src.path, `${where}: sides: expected exactly two sides`); continue; }
    for (const [side, text] of entriesOf(sides)) {
      checkStr(problems, src.path, `${where}: side ${describe(side)}`, side);
      checkStr(problems, src.path, `${where}: side '${textOf(side)}'`, text);
    }
    names.set(name, keysOf(sides));
  }
  return names;
}

/** @param {any} [sides] the joint type's sides, when known */
function validateFasteningEntry(problems, f, where, entry, fasteners, sides = null) {
  if (!checkKeys(problems, f, where, entry, ['fastener', 'from'], ['method', 'count', 'spacing', 'along', 'edge_spacing', 'end_distance'])) return;
  if (!inside(get(entry, 'fastener'), fasteners)) problems.error(f, `${where}: fastener ${describe(get(entry, 'fastener'))} is not in the catalog`);
  for (const key of ['from', 'along']) {
    if (has(entry, key) && checkStr(problems, f, `${where}: ${key}`, get(entry, key))) {
      if (sides !== null && !inside(get(entry, key), sides)) problems.error(f, `${where}: ${key} '${get(entry, key)}' is not a side (${sides.join(', ')})`);
    }
  }
  const method = has(entry, 'method') ? get(entry, 'method') : 'straight';
  checkChoice(problems, f, `${where}: method`, method, FASTENING_METHODS);
  const hasCount = has(entry, 'count'), hasSpacing = has(entry, 'spacing');
  if (hasCount === hasSpacing) { problems.error(f, `${where}: give either 'count' or 'spacing'`); return; }
  if (hasCount) {
    const count = get(entry, 'count');
    if (!(Number.isInteger(count) && count > 0)) problems.error(f, `${where}: count: expected a positive whole number, got ${describe(count)}`);
    for (const key of ['along', 'edge_spacing', 'end_distance']) if (has(entry, key)) problems.error(f, `${where}: '${key}' only goes with 'spacing'`);
    return;
  }
  if (method === 'toe') problems.error(f, `${where}: method 'toe' needs 'count', not 'spacing'`);
  if (!has(entry, 'along')) problems.error(f, `${where}: 'spacing' needs 'along' (the side whose long axis the row follows)`);
  for (const key of ['spacing', 'edge_spacing']) {
    if (has(entry, key) && checkNumber(problems, f, `${where}: ${key}`, get(entry, key)) && get(entry, key) <= 0) problems.error(f, `${where}: ${key} must be positive`);
  }
  if (has(entry, 'end_distance') && checkNumber(problems, f, `${where}: end_distance`, get(entry, 'end_distance')) && get(entry, 'end_distance') < 0) {
    problems.error(f, `${where}: end_distance must not be negative`);
  }
}

function validateUnits(problems, f, catalog) {
  const seen = new Map();
  for (const section of Object.keys(UNIT_SECTIONS)) {
    const entries = has(catalog, section) ? get(catalog, section) : new Map();
    if (!isMapping(entries)) { problems.error(f, `catalog ${section}: expected a mapping of ids to entries`); continue; }
    for (const [name, entry] of entriesOf(entries)) {
      const where = `catalog ${section.slice(0, -1)} ${!isStr(name) ? describe(name) : quoted(name)}`;
      if (!checkStr(problems, f, where, name)) continue;
      if (seen.has(name)) problems.error(f, `${where}: the id is also used in ${seen.get(name)}`);
      seen.set(name, section);
      if (!checkKeys(problems, f, where, entry, ['size', 'rough_opening'])) continue;
      let ok = checkPair(problems, f, `${where}: size`, get(entry, 'size'));
      ok = checkPair(problems, f, `${where}: rough_opening`, get(entry, 'rough_opening')) && ok;
      if (ok && get(entry, 'rough_opening').some((r, i) => r < get(entry, 'size')[i])) problems.error(f, `${where}: rough_opening is smaller than the size`);
    }
  }
}

function checkStageOrder(problems, f, where, group, layers) {
  const stages = layers.filter(isMapping).map(l => get(l, 'stage'));
  if (group === 'cavity') {
    if (stages.includes('workshop')) problems.error(f, `${where}: workshop layers in the cavity are not supported`);
    return;
  }
  const site = stages.indexOf('site');
  if (site >= 0 && stages.slice(site).includes('workshop')) {
    problems.error(f, `${where}: a workshop layer lies outside a site layer; workshop layers must come first, starting next to the framing`);
  }
}

function validateLayer(problems, f, where, group, layer, sheets, fasteners) {
  const optional = ['sheet', 'material', 'fastening'];
  if (group !== 'cavity' && !(isMapping(layer) && has(layer, 'sheet'))) optional.push('thickness');
  if (!checkKeys(problems, f, where, layer, ['role', 'stage'], optional)) return;
  checkStr(problems, f, `${where}: role`, get(layer, 'role'));
  checkChoice(problems, f, `${where}: stage`, get(layer, 'stage'), STAGES);
  const hasSheet = has(layer, 'sheet'), hasMaterial = has(layer, 'material');
  if (hasSheet === hasMaterial) problems.error(f, `${where}: give either 'sheet' (catalog id) or 'material' (text)`);
  if (hasSheet && !inside(get(layer, 'sheet'), sheets)) problems.error(f, `${where}: sheet ${describe(get(layer, 'sheet'))} is not in the catalog`);
  if (has(layer, 'fastening')) validateFasteningEntry(problems, f, `${where}: fastening`, get(layer, 'fastening'), fasteners);
  if (hasMaterial) {
    checkStr(problems, f, `${where}: material`, get(layer, 'material'));
    if (group !== 'cavity') {
      if (!has(layer, 'thickness')) problems.error(f, `${where}: missing 'thickness'`);
      else if (checkNumber(problems, f, `${where}: thickness`, get(layer, 'thickness')) && get(layer, 'thickness') < 0) {
        problems.error(f, `${where}: thickness must not be negative`);
      }
    }
  }
}

function validateSystem(sid, src, jointTypes, problems) {
  const f = src.path, d = src.data;
  if (!checkKeys(problems, f, 'system', d, ['id', 'title', 'description', 'status', 'units', 'grid', 'sources', 'catalog', 'buildups', 'fastening'])) return;
  const sources = get(d, 'sources');
  if (!Array.isArray(sources)) problems.error(f, 'sources: expected a list of text');
  else sources.forEach((text, i) => checkStr(problems, f, `sources ${i + 1}`, text));
  if (get(d, 'id') !== sid) problems.error(f, `id ${describe(get(d, 'id'))} does not match folder '${sid}'`);
  checkStr(problems, f, 'title', get(d, 'title'));
  checkStr(problems, f, 'description', get(d, 'description'));
  checkChoice(problems, f, 'status', get(d, 'status'), STATUSES);
  checkChoice(problems, f, 'units', get(d, 'units'), new Set(['mm']));
  if (checkNumber(problems, f, 'grid', get(d, 'grid')) && get(d, 'grid') <= 0) problems.error(f, 'grid: must be positive');

  const catalog = get(d, 'catalog');
  let lumber = new Map(), sheets = new Map(), fasteners = new Map();
  if (checkKeys(problems, f, 'catalog', catalog, ['lumber', 'sheets'], ['fasteners', ...Object.keys(UNIT_SECTIONS)])) {
    validateUnits(problems, f, catalog);
    lumber = get(catalog, 'lumber') || new Map();
    sheets = get(catalog, 'sheets') || new Map();
    fasteners = get(catalog, 'fasteners') || new Map();
    for (const [section, value] of [['lumber', lumber], ['sheets', sheets], ['fasteners', fasteners]]) {
      if (!isMapping(value)) problems.error(f, `catalog ${section}: expected a mapping of ids to entries`);
    }
    if (!isMapping(lumber)) lumber = new Map();
    if (!isMapping(sheets)) sheets = new Map();
    if (!isMapping(fasteners)) fasteners = new Map();
    for (const [name, entry] of entriesOf(fasteners)) {
      const where = `catalog fastener ${!isStr(name) ? describe(name) : quoted(name)}`;
      checkStr(problems, f, where, name);
      if (checkKeys(problems, f, where, entry, ['kind', 'diameter', 'length'], ['shank', 'coating'])) {
        checkChoice(problems, f, `${where}: kind`, get(entry, 'kind'), FASTENER_KINDS);
        for (const key of ['diameter', 'length']) {
          if (checkNumber(problems, f, `${where}: ${key}`, get(entry, key)) && get(entry, key) <= 0) problems.error(f, `${where}: ${key} must be positive`);
        }
        if (has(entry, 'shank')) checkChoice(problems, f, `${where}: shank`, get(entry, 'shank'), FASTENER_SHANKS);
        if (has(entry, 'coating')) checkStr(problems, f, `${where}: coating`, get(entry, 'coating'));
      }
    }
    for (const [name, entry] of entriesOf(lumber)) {
      const where = `catalog lumber ${!isStr(name) ? describe(name) : quoted(name)}`;
      checkStr(problems, f, where, name);
      if (checkKeys(problems, f, where, entry, ['section', 'grade'])) {
        checkPair(problems, f, `${where}: section`, get(entry, 'section'));
        checkStr(problems, f, `${where}: grade`, get(entry, 'grade'));
      }
    }
    for (const [name, entry] of entriesOf(sheets)) {
      const where = `catalog sheet ${!isStr(name) ? describe(name) : quoted(name)}`;
      checkStr(problems, f, where, name);
      if (checkKeys(problems, f, where, entry, ['material', 'thickness', 'size'])) {
        checkStr(problems, f, `${where}: material`, get(entry, 'material'));
        if (checkNumber(problems, f, `${where}: thickness`, get(entry, 'thickness')) && get(entry, 'thickness') <= 0) {
          problems.error(f, `${where}: thickness must be positive`);
        }
        checkPair(problems, f, `${where}: size`, get(entry, 'size'));
      }
    }
  }

  const buildups = get(d, 'buildups');
  if (isMapping(buildups)) {
    for (const [name, buildup] of entriesOf(buildups)) {
      const where = `build-up '${textOf(name)}'`;
      if (!checkKeys(problems, f, where, buildup, ['description', ...BUILDUP_GROUPS])) continue;
      checkStr(problems, f, `${where}: description`, get(buildup, 'description'));
      const roles = new Set();
      for (const group of BUILDUP_GROUPS) {
        const layers = get(buildup, group);
        if (!Array.isArray(layers)) { problems.error(f, `${where}: ${group}: expected a list of layers`); continue; }
        layers.forEach((layer, i) => {
          const lwhere = `${where}: ${group} layer ${i + 1}`;
          validateLayer(problems, f, lwhere, group, layer, sheets, fasteners);
          const role = isMapping(layer) ? get(layer, 'role') : undefined;
          if (isStr(role)) {
            if (roles.has(role)) problems.error(f, `${lwhere}: role '${role}' is used by another layer`);
            roles.add(role);
          }
        });
        checkStageOrder(problems, f, `${where}: ${group}`, group, layers);
      }
    }
  } else problems.error(f, 'buildups: expected a mapping');

  const fastening = get(d, 'fastening');
  if (isMapping(fastening)) {
    for (const [name, entry] of entriesOf(fastening)) {
      const where = `fastening '${textOf(name)}'`;
      if (!inside(name, jointTypes)) { problems.error(f, `${where}: not a joint type in library/joint_types.yaml`); continue; }
      validateFasteningEntry(problems, f, where, entry, fasteners, jointTypes.get(name));
    }
  } else problems.error(f, 'fastening: expected a mapping');
}

function validateSchema(module, lib, problems, source) {
  const f = module.schema.path, d = module.schema.data;
  if (get(d, 'derived') === true) {
    if (!checkKeys(problems, f, 'schema', d, ['id', 'title', 'derived', 'parameters'])) return;
    const code = `library/modules/${module.id}/derive.js`;
    if (!source.isFile(code)) problems.error(f, `derived module '${module.id}' has no ${code}`);
  } else if (!checkKeys(problems, f, 'schema', d, ['id', 'title', 'parameters', 'ports'], ['derived'])) return;
  if (has(d, 'derived') && get(d, 'derived') !== true) problems.error(f, `derived: expected true, got ${describe(get(d, 'derived'))}`);
  if (get(d, 'id') !== module.id) problems.error(f, `id ${describe(get(d, 'id'))} does not match folder '${module.id}'`);
  checkStr(problems, f, 'title', get(d, 'title'));

  const parameters = get(d, 'parameters');
  if (isMapping(parameters)) {
    for (const [name, spec] of entriesOf(parameters)) {
      const where = `parameter '${textOf(name)}'`;
      if (RESERVED_PARAMETERS.has(name)) problems.error(f, `${where}: the name is reserved in variant files`);
      const ptype = isMapping(spec) ? get(spec, 'type') : undefined;
      const optional = ptype === 'length' ? ['min', 'max'] : [];
      if (!checkKeys(problems, f, where, spec, ['type', 'description'], optional)) continue;
      checkChoice(problems, f, `${where}: type`, ptype, PARAMETER_TYPES);
      checkStr(problems, f, `${where}: description`, get(spec, 'description'));
      for (const bound of ['min', 'max']) {
        if (has(spec, bound) && checkNumber(problems, f, `${where}: ${bound}`, get(spec, bound)) && get(spec, bound) < 0) {
          problems.error(f, `${where}: ${bound} must not be negative`);
        }
      }
      if (isNumber(get(spec, 'min')) && isNumber(get(spec, 'max')) && get(spec, 'min') > get(spec, 'max')) {
        problems.error(f, `${where}: min is greater than max`);
      }
    }
  } else problems.error(f, 'parameters: expected a mapping');

  if (module.derived) return;
  const ports = get(d, 'ports');
  if (isMapping(ports)) {
    for (const [name, port] of entriesOf(ports)) {
      const where = `port '${textOf(name)}'`;
      if (!checkKeys(problems, f, where, port, ['description', 'kind', 'roles'], ['optional'])) continue;
      checkStr(problems, f, `${where}: description`, get(port, 'description'));
      checkChoice(problems, f, `${where}: kind`, get(port, 'kind'), PORT_KINDS);
      if (has(port, 'optional') && typeof get(port, 'optional') !== 'boolean') {
        problems.error(f, `${where}: optional: expected true or false, got ${describe(get(port, 'optional'))}`);
      }
      const roles = get(port, 'roles');
      if (!Array.isArray(roles)) problems.error(f, `${where}: roles: expected a list`);
      else for (const ref of roles) checkRoleRef(problems, f, where, ref, lib.interfaces);
    }
  } else problems.error(f, 'ports: expected a mapping');
}

function checkRoleRef(problems, f, where, ref, interfaces) {
  if (!(isStr(ref) && ref.split('.').length === 2)) { problems.error(f, `${where}: role ${describe(ref)} must be written interface.role`); return; }
  const [ifaceId, role] = ref.split('.');
  const iface = interfaces.get(ifaceId);
  if (!iface) { problems.error(f, `${where}: role '${ref}': no interface '${ifaceId}'`); return; }
  const roles = get(iface.interface.data, 'roles');
  if (!(isMapping(roles) && has(roles, role))) problems.error(f, `${where}: role '${ref}': interface '${ifaceId}' has no role '${role}'`);
}

function checkValue(problems, f, where, spec, value, system) {
  const ptype = get(spec, 'type');
  const catalog = isMapping(get(system, 'catalog')) ? get(system, 'catalog') : new Map();
  const mapping = v => (isMapping(v) ? v : new Map());
  if (ptype === 'length') {
    if (!checkNumber(problems, f, where, value)) return;
    if (value < 0 || (value === 0 && get(spec, 'min') !== 0)) problems.error(f, `${where}: ${numText(value)} must be positive`);
    if (isNumber(get(spec, 'min')) && value < get(spec, 'min')) problems.error(f, `${where}: ${numText(value)} is below the minimum ${numText(get(spec, 'min'))}`);
    if (isNumber(get(spec, 'max')) && value > get(spec, 'max')) problems.error(f, `${where}: ${numText(value)} is above the maximum ${numText(get(spec, 'max'))}`);
  } else if (ptype === 'lumber') {
    if (checkStr(problems, f, where, value) && !inside(value, mapping(get(catalog, 'lumber')))) problems.error(f, `${where}: lumber '${value}' is not in the system catalog`);
  } else if (ptype === 'buildup') {
    if (checkStr(problems, f, where, value) && !inside(value, mapping(get(system, 'buildups')))) problems.error(f, `${where}: build-up '${value}' is not in the system`);
  } else if (ptype === 'opening_unit') {
    if (checkStr(problems, f, where, value) && !Object.keys(UNIT_SECTIONS).some(s => inside(value, mapping(get(catalog, s))))) {
      problems.error(f, `${where}: unit '${value}' is not a window or door in the system catalog`);
    }
  }
}

function validateVariants(module, sid, lib, problems) {
  const src = module.systems.get(sid);
  const f = src.path, d = src.data;
  if (!lib.systems.has(sid)) { problems.error(f, `no system '${sid}' (expected library/systems/${sid}/system.yaml)`); return; }
  const parameters = get(module.schema.data, 'parameters');
  const system = lib.systems.get(sid).data;
  if (module.derived) {
    if (!checkKeys(problems, f, 'system file', d, ['fixed'])) return;
    const fixed = get(d, 'fixed');
    if (!isMapping(fixed) || !isMapping(parameters)) {
      if (!isMapping(fixed)) problems.error(f, 'fixed: expected a mapping');
      return;
    }
    for (const key of keysOf(fixed)) if (!has(parameters, key)) problems.error(f, `fixed: '${textOf(key)}' is not a parameter of module '${module.id}'`);
    for (const [name, spec] of entriesOf(parameters)) {
      if (!has(fixed, name)) problems.error(f, `fixed: missing '${textOf(name)}'`);
      else if (isMapping(spec)) checkValue(problems, f, `fixed: ${textOf(name)}`, spec, get(fixed, name), system);
    }
    return;
  }
  if (!checkKeys(problems, f, 'variant file', d, ['default', 'variants'], ['fixed'])) return;
  if (!isMapping(parameters)) return;
  let fixed = get(d, 'fixed') || new Map();
  const variants = get(d, 'variants');
  if (!isMapping(fixed)) { problems.error(f, 'fixed: expected a mapping'); fixed = new Map(); }
  for (const key of keysOf(fixed)) if (!has(parameters, key)) problems.error(f, `fixed: '${textOf(key)}' is not a parameter of module '${module.id}'`);
  if (!(isMapping(variants) && sizeOf(variants))) { problems.error(f, 'variants: expected at least one variant'); return; }
  if (!inside(get(d, 'default'), variants)) problems.error(f, `default ${describe(get(d, 'default'))} is not one of the variants`);
  for (const [name, variant] of entriesOf(variants)) {
    if (!isStr(name)) { problems.error(f, `variant name ${describe(name)} must be text`); continue; }
    const where = `variant '${name}'`;
    if (!isMapping(variant)) { problems.error(f, `${where}: expected a mapping`); continue; }
    if (!has(variant, 'status')) problems.error(f, `${where}: missing 'status'`);
    else checkChoice(problems, f, `${where}: status`, get(variant, 'status'), STATUSES);
    const values = entriesOf(variant).filter(([k]) => k !== 'status');
    for (const [key] of values) {
      if (!has(parameters, key)) problems.error(f, `${where}: '${textOf(key)}' is not a parameter of module '${module.id}'`);
      else if (has(fixed, key)) problems.error(f, `${where}: '${textOf(key)}' is also set in fixed`);
    }
    const merged = new Map([...entriesOf(fixed), ...values]);
    for (const [pname, spec] of entriesOf(parameters)) {
      if (!merged.has(pname)) problems.error(f, `${where}: parameter '${textOf(pname)}' is not set`);
      else if (isMapping(spec)) checkValue(problems, f, `${where}: ${textOf(pname)}`, spec, merged.get(pname), system);
    }
  }
}

function checkSizeRef(problems, f, where, ref, roles) {
  if (!(isStr(ref) && ref.split('.').length === 2)) { problems.error(f, `${where}: ${describe(ref)} must be written role.size`); return; }
  const [role, size] = ref.split('.');
  if (!inside(role, roles)) problems.error(f, `${where}: '${role}' is not a role`);
  if (![...COMPILED_SIZES, ...OPTIONAL_SIZES].includes(size)) problems.error(f, `${where}: '${size}' is not one of ${sortedJoin([...COMPILED_SIZES, ...OPTIONAL_SIZES])}`);
}

function validateInterface(iface, lib, problems) {
  const f = iface.interface.path, d = iface.interface.data;
  if (!checkKeys(problems, f, 'interface', d, ['id', 'title', 'description', 'roles', 'relations', 'placement', 'checks'])) return;
  if (get(d, 'id') !== iface.id) problems.error(f, `id ${describe(get(d, 'id'))} does not match folder '${iface.id}'`);
  checkStr(problems, f, 'title', get(d, 'title'));
  checkStr(problems, f, 'description', get(d, 'description'));

  let roles = get(d, 'roles');
  if (!(isMapping(roles) && sizeOf(roles) === 2)) {
    problems.error(f, 'roles: an interface has exactly two roles');
    if (!isMapping(roles)) roles = new Map();
  }
  for (const [role, spec] of entriesOf(roles)) {
    checkStr(problems, f, `role ${describe(role)}`, role);
    if (checkKeys(problems, f, `role '${textOf(role)}'`, spec, ['description', 'exposes'])) {
      checkStr(problems, f, `role '${textOf(role)}': description`, get(spec, 'description'));
      const exposes = get(spec, 'exposes');
      if (!(Array.isArray(exposes) && exposes.every(isStr))) problems.error(f, `role '${textOf(role)}': exposes: expected a list of part names`);
    }
  }
  const relations = get(d, 'relations');
  if (!Array.isArray(relations)) problems.error(f, 'relations: expected a list');
  else {
    relations.forEach((rel, i) => {
      const where = `relation ${i + 1}`;
      if (!checkKeys(problems, f, where, rel, ['from', 'relation', 'to'])) return;
      checkChoice(problems, f, `${where}: relation`, get(rel, 'relation'), RELATIONS);
      for (const end of ['from', 'to']) if (!inside(get(rel, end), roles)) problems.error(f, `${where}: ${end} ${describe(get(rel, end))} is not a role`);
      if (get(rel, 'from') === get(rel, 'to')) problems.error(f, `${where}: from and to must be different roles`);
    });
  }
  const placement = get(d, 'placement');
  if (isMapping(placement) && inside(get(placement, 'rule'), new Set(Object.keys(PLACEMENT_RULES)))) {
    const rule = get(placement, 'rule');
    const keys = ['rule', 'reference', ...[...PLACEMENT_RULES[rule].params].sort()];
    if (checkKeys(problems, f, `placement '${rule}'`, placement, keys)) {
      if (has(placement, 'reference') && !inside(get(placement, 'reference'), roles)) {
        problems.error(f, `placement reference ${describe(get(placement, 'reference'))} is not a role`);
      }
      if (has(placement, 'offset')) checkSizeRef(problems, f, 'placement offset', get(placement, 'offset'), roles);
    }
  } else {
    const rule = isMapping(placement) ? get(placement, 'rule') : placement;
    problems.error(f, `placement: rule ${describe(rule)} is not one of ${sortedJoin(Object.keys(PLACEMENT_RULES))}`);
  }
  const checks = get(d, 'checks');
  if (!Array.isArray(checks)) problems.error(f, 'checks: expected a list');
  else for (const check of checks) checkChoice(problems, f, 'checks', check, new Set(Object.keys(INTERFACE_CHECKS)));
  for (const [sid, src] of iface.systems) validateInterfaceSystem(iface, sid, src, lib, problems);
}

function validateInterfaceSystem(iface, sid, src, lib, problems) {
  const f = src.path, d = src.data;
  if (!lib.systems.has(sid)) { problems.error(f, `no system '${sid}' (expected library/systems/${sid}/system.yaml)`); return; }
  if (!checkKeys(problems, f, 'implementations file', d, ['implementations', 'stage', 'status'])) return;
  let names = get(d, 'implementations');
  if (!(Array.isArray(names) && names.every(isStr))) {
    problems.error(f, 'implementations: expected a list of implementation names');
    names = [];
  } else if (names.length !== 1) problems.error(f, `implementations: exactly one for now, got ${names.length}`);
  checkChoice(problems, f, 'stage', get(d, 'stage'), STAGES);
  checkChoice(problems, f, 'status', get(d, 'status'), STATUSES);
  for (const name of names) if (!iface.implementations.has(name)) problems.error(f, `implementation '${name}': no file implementations/${name}.js`);
}

function validateCoverage(lib, problems) {
  for (const module of lib.modules.values()) {
    const ports = get(module.schema.data, 'ports');
    if (!isMapping(ports)) continue;
    for (const sid of module.systems.keys()) {
      if (!lib.systems.has(sid)) continue;
      for (const [portName, port] of entriesOf(ports)) {
        for (const ref of (isMapping(port) ? get(port, 'roles') || [] : [])) {
          if (!(isStr(ref) && ref.split('.').length === 2)) continue;
          const iface = lib.interfaces.get(ref.split('.')[0]);
          if (iface && !iface.systems.has(sid)) {
            problems.error(module.systems.get(sid).path,
              `port '${textOf(portName)}' can fill '${ref}', but interface '${iface.id}' has no implementations for system '${sid}' `
              + `(expected library/interfaces/${iface.id}/systems/${sid}.yaml)`);
          }
        }
      }
    }
  }
}

function det3(a, b, c) {
  return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
}
export function checkRuleTable() {
  const messages = [];
  for (const [name, spec] of Object.entries(PLACEMENT_RULES)) {
    const turn = spec.turn;
    if (turn.along.join() !== '0,1,0') messages.push(`rule '${name}' must keep along`);
    const mirror = det3(turn.normal, turn.along, turn.across) < 0;
    if (spec.hands !== (mirror ? 'opposite' : 'same')) messages.push(`rule '${name}': hands '${spec.hands}' doesn't match its turn`);
  }
  return messages;
}

export function validate(lib, problems, source) {
  for (const message of checkRuleTable()) problems.error('web/js/library/builder.js', message);
  let jointTypes = new Map();
  if (lib.jointTypes) jointTypes = validateJointTypes(lib.jointTypes, problems);
  for (const [sid, src] of lib.systems) validateSystem(sid, src, jointTypes, problems);
  for (const module of lib.modules.values()) {
    validateSchema(module, lib, problems, source);
    if (!module.systems.size) problems.error(module.schema.path, `module '${module.id}' has no system files`);
    for (const sid of module.systems.keys()) validateVariants(module, sid, lib, problems);
  }
  for (const iface of lib.interfaces.values()) validateInterface(iface, lib, problems);
  validateCoverage(lib, problems);
}

// ---- resolve ----------------------------------------------------------------
function resolveBuildup(buildup, sheets) {
  const out = { description: get(buildup, 'description') };
  for (const group of BUILDUP_GROUPS) {
    out[group] = get(buildup, group).map(l => {
      const layer = toPlain(l);
      if ('sheet' in layer) {
        const id = layer.sheet;
        delete layer.sheet;
        layer.sheet = { id, ...toPlain(get(sheets, id)) };
        layer.thickness = get(get(sheets, id), 'thickness');
      }
      return layer;
    });
  }
  return out;
}

function resolveParams(parameters, values, system) {
  const catalog = get(system, 'catalog');
  const params = {};
  for (const [pname, spec] of entriesOf(parameters)) {
    let value = values.get(pname);
    const type = get(spec, 'type');
    if (type === 'lumber') value = { id: value, ...toPlain(get(get(catalog, 'lumber'), value)) };
    else if (type === 'buildup') value = { id: value, ...resolveBuildup(get(get(system, 'buildups'), value), get(catalog, 'sheets')) };
    else if (type === 'opening_unit') {
      const section = Object.keys(UNIT_SECTIONS).find(s => inside(value, get(catalog, s) || new Map()));
      value = { id: value, kind: UNIT_SECTIONS[section], ...toPlain(get(get(catalog, section), value)) };
    } else value = toPlain(value);
    params[pname] = value;
  }
  return params;
}

export function resolve(lib) {
  const resolved = [];
  for (const module of lib.modules.values()) {
    if (module.derived) continue;
    const parameters = get(module.schema.data, 'parameters');
    for (const [sid, src] of module.systems) {
      const system = lib.systems.get(sid).data;
      const fixed = get(src.data, 'fixed') || new Map();
      for (const [name, variant] of entriesOf(get(src.data, 'variants'))) {
        const values = new Map([...entriesOf(fixed), ...entriesOf(variant).filter(([k]) => k !== 'status')]);
        resolved.push({
          module: module.id, system: sid, variant: name, status: get(variant, 'status'),
          default: name === get(src.data, 'default'), params: resolveParams(parameters, values, system),
        });
      }
    }
  }
  return resolved;
}

// ---- compile: helpers --------------------------------------------------------
async function loadCode(source, rel, problems) {
  if (!source.isFile(rel)) { problems.error(rel, 'missing'); return null; }
  try {
    return await source.importCode(rel);
  } catch (error) {
    problems.error(rel, `failed to import: ${error.name}: ${error.message}`);
    return null;
  }
}
let activeCore = CORE;
function call(problems, file, where, fn, ...args) {
  try {
    return { ok: true, out: fn(...structuredClone(args), activeCore) };
  } catch (error) {
    problems.error(file, `${where}: ${error?.name ?? 'Error'}: ${error?.message ?? error}`);
    return { ok: false, out: null };
  }
}
const boxOk = b => isMapping(b) && isVector(get(b, 'min')) && isVector(get(b, 'max')) && [0, 1, 2].every(i => get(b, 'min')[i] < get(b, 'max')[i]);
const boxInside = (b, outer) => [0, 1, 2].every(i => outer.min[i] - TOLERANCE <= b.min[i] && b.max[i] <= outer.max[i] + TOLERANCE);
function checkBox(problems, f, where, b) {
  if (!boxOk(b)) { problems.error(f, `${where}: box must have min and max, three numbers each, min < max`); return false; }
  return true;
}
function checkParts(problems, f, where, parts, required, optional = []) {
  const byId = new Map();
  if (!Array.isArray(parts)) { problems.error(f, `${where}: parts: expected a list`); return byId; }
  for (const part of parts) {
    const pid = isMapping(part) ? get(part, 'id') : undefined;
    const pwhere = `${where}: part ${describe(pid)}`;
    if (!checkKeys(problems, f, pwhere, part, required, optional)) continue;
    if (!isStr(pid)) { problems.error(f, `${pwhere}: id must be text`); continue; }
    if (byId.has(pid)) problems.error(f, `${pwhere}: duplicate id`);
    byId.set(pid, part);
    checkStr(problems, f, `${pwhere}: role`, get(part, 'role'));
    checkBox(problems, f, pwhere, get(part, 'box'));
    if (has(part, 'stage')) checkChoice(problems, f, `${pwhere}: stage`, get(part, 'stage'), STAGES);
  }
  return byId;
}
function checkJoints(problems, f, where, joints, jointTypes, checkRef) {
  if (!Array.isArray(joints)) { problems.error(f, `${where}: joints: expected a list`); return; }
  joints.forEach((joint, i) => {
    const jwhere = `${where}: joint ${i + 1}`;
    if (!checkKeys(problems, f, jwhere, joint, ['type', 'parts'])) return;
    const jtype = get(joint, 'type');
    if (!inside(jtype, jointTypes)) { problems.error(f, `${jwhere}: type ${describe(jtype)} is not in library/joint_types.yaml`); return; }
    const sides = new Set(keysOf(get(get(jointTypes, jtype), 'sides')));
    const refs = get(joint, 'parts');
    const refKeys = keysOf(refs);
    if (!(isMapping(refs) && refKeys.length === sides.size && refKeys.every(k => sides.has(k)))) {
      problems.error(f, `${jwhere}: parts must name the sides ${sortedJoin(sides)}`);
      return;
    }
    for (const [side, ref] of entriesOf(refs)) {
      const message = checkRef(ref);
      if (message) problems.error(f, `${jwhere} (${jtype}): ${side}: ${message}`);
    }
  });
}
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
function checkFrame(problems, f, where, frame, panel) {
  const axes = Object.fromEntries(FRAME_AXES.map(k => [k, frame[k]]));
  for (const [key, axis] of Object.entries(axes)) {
    if (axis.map(Math.abs).sort((a, b) => a - b).join() !== '0,0,1') problems.error(f, `${where}: ${key} must be a module axis (plus or minus), got ${textOf(axis)}`);
  }
  for (const [a, b] of [['normal', 'along'], ['normal', 'across'], ['along', 'across']]) {
    if (Math.abs(dot(axes[a], axes[b])) > TOLERANCE) problems.error(f, `${where}: ${a} and ${b} must be perpendicular`);
  }
  if (panel) {
    const origin = frame.origin, step = 1e-3;
    /** @type {Array<[string, number, string]>} */
    const probes = [['normal', -1, 'out of'], ['along', 1, 'into'], ['across', 1, 'into']];
    for (const [key, sign, text] of probes) {
      const probe = origin.map((o, i) => o + sign * step * frame[key][i]);
      if (!boxInside({ min: probe, max: probe }, panel)) problems.error(f, `${where}: ${key} must point ${text} the panel`);
    }
    const onFace = [0, 1, 2].some(i => ['min', 'max'].some(side => Math.abs(origin[i] - panel[side][i]) <= TOLERANCE));
    if (!(boxInside({ min: origin, max: origin }, panel) && onFace)) problems.error(f, `${where}: origin ${textOf(origin)} is not on the panel's faces`);
  }
}
function requiredExposes(lib, port) {
  const out = new Map();
  for (const ref of get(port, 'roles')) {
    const [ifaceId, role] = ref.split('.');
    out.set(ref, get(get(get(lib.interfaces.get(ifaceId).interface.data, 'roles'), role), 'exposes'));
  }
  return out;
}
function layersOf(params, schema) {
  const out = new Map();
  for (const [name, spec] of entriesOf(get(schema, 'parameters'))) {
    if (get(spec, 'type') === 'buildup') for (const group of BUILDUP_GROUPS) for (const layer of params[name][group]) out.set(layer.role, layer);
  }
  return out;
}

function checkCompiled(problems, f, where, out, lib, schema, jointTypes, layers) {
  const before = problems.errors.length;
  if (!checkKeys(problems, f, where, out, ['size', 'parts', 'joints', 'ports'])) return false;
  const size = get(out, 'size');
  if (checkKeys(problems, f, `${where}: size`, size, [...COMPILED_SIZES].sort(), [...OPTIONAL_SIZES].sort())) {
    for (const key of [...COMPILED_SIZES, ...OPTIONAL_SIZES]) {
      if (has(size, key) && checkNumber(problems, f, `${where}: size ${key}`, get(size, key)) && get(size, key) <= 0) problems.error(f, `${where}: size ${key} must be positive`);
    }
  }
  const parts = checkParts(problems, f, where, get(out, 'parts'), ['id', 'role', 'material', 'catalog', 'box', 'stage'], ['layer', 'sheet']);
  for (const part of parts.values()) {
    if (has(part, 'sheet')) {
      if (!isStr(part.sheet)) problems.error(f, `${where}: part '${part.id}': sheet: expected text`);
      else if (!has(part, 'layer')) problems.error(f, `${where}: part '${part.id}': only a part made from a layer is a sheet piece`);
    }
    if (has(part, 'layer')) {
      if (!inside(part.layer, layers)) problems.error(f, `${where}: part '${part.id}': layer ${describe(part.layer)} is not a layer of the variant's build-up`);
      else if (part.role !== part.layer) problems.error(f, `${where}: part '${part.id}': role ${describe(part.role)} must be its layer's role '${part.layer}'`);
    }
  }
  let panel = null;
  if (isMapping(size) && COMPILED_SIZES.every(k => isNumber(get(size, k)))) {
    panel = { min: [0, 0, 0], max: [size.width, size.depth, size.height] };
    for (const part of parts.values()) {
      if (boxOk(part.box) && !boxInside(part.box, panel)) problems.error(f, `${where}: part '${part.id}' lies outside the panel ${textOf(panel.max)}`);
    }
  }
  let ports = get(out, 'ports');
  const declared = get(schema, 'ports');
  const declaredNames = keysOf(declared);
  if (!(isMapping(ports) && keysOf(ports).length === declaredNames.length && keysOf(ports).every(k => has(declared, k)))) {
    problems.error(f, `${where}: ports must be exactly ${sortedJoin(declaredNames)}`);
    if (!isMapping(ports)) ports = {};
  }
  for (const [name, frame] of entriesOf(ports)) {
    const pwhere = `${where}: port '${name}'`;
    if (!has(declared, name) || !checkKeys(problems, f, pwhere, frame, ['origin', ...FRAME_AXES, 'exposes'])) continue;
    let vectorsOk = true;
    for (const key of ['origin', ...FRAME_AXES]) {
      if (!isVector(get(frame, key))) { problems.error(f, `${pwhere}: ${key} must be three numbers`); vectorsOk = false; }
    }
    if (vectorsOk) checkFrame(problems, f, pwhere, frame, panel);
    const exposes = get(frame, 'exposes');
    if (!isMapping(exposes)) { problems.error(f, `${pwhere}: exposes: expected a mapping of names to part ids`); continue; }
    for (const [exposed, pid] of entriesOf(exposes)) {
      if (!inside(pid, parts)) problems.error(f, `${pwhere}: exposes '${exposed}' as ${describe(pid)}, which is not a part`);
    }
    for (const [ref, needed] of requiredExposes(lib, get(declared, name))) {
      const missing = needed.filter(n => !has(exposes, n));
      if (missing.length) problems.error(f, `${pwhere}: can fill '${ref}', which needs ${missing.join(', ')} exposed`);
    }
  }
  checkJoints(problems, f, where, get(out, 'joints'), jointTypes, ref => (inside(ref, parts) ? null : `${describe(ref)} is not a part`));
  return problems.errors.length === before;
}

export async function compileVariants(lib, resolved, problems, source) {
  const jointTypes = toPlain(lib.jointTypes.data);
  const jointTypesMap = lib.jointTypes.data;
  const compilers = new Map();
  const compiled = new Map();
  for (const r of resolved) {
    const module = lib.modules.get(r.module);
    const f = `library/modules/${module.id}/compile.js`;
    if (!compilers.has(module.id)) compilers.set(module.id, await loadCode(source, f, problems));
    const code = compilers.get(module.id);
    if (!code) continue;
    const where = `variant ${r.system}/${r.variant}`;
    if (typeof code.compile !== 'function') {
      problems.error(f, 'has no compile(params, core) function');
      compilers.set(module.id, null);
      continue;
    }
    const layers = layersOf(r.params, module.schema.data);
    const { ok, out } = call(problems, f, where, code.compile, r.params);
    if (!(ok && checkCompiled(problems, f, where, out, lib, module.schema.data, jointTypesMap, layers))) continue;
    const parts = new Map(out.parts.map(p => [p.id, p]));
    const info = ref => {
      const part = parts.get(ref);
      return { label: `'${ref}'`, box: part.box, stage: part.stage, entity: 'panel', layer: layers.get(part.layer) ?? null };
    };
    const fastened = fastenJoints(where, out.joints, info, jointTypes, toPlain(lib.systems.get(r.system).data));
    for (const message of fastened.errors) problems.error(f, message);
    if (!fastened.joints) continue;
    out.joints = fastened.joints;
    for (const frame of Object.values(out.ports)) frame.hand = portHand(frame);
    compiled.set(`${r.module}|${r.system}|${r.variant}`, out);
  }
  return compiled;
}

// ---- compile implementations --------------------------------------------------
/** @returns {import('./frames.js').Frame} */
export function ruleTransform(rule, offset = 0) {
  const spec = PLACEMENT_RULES[rule];
  const origin = [0, 0, 0];
  if (spec.shift !== null) origin[FRAME_AXES.indexOf(spec.shift)] = offset;
  return { origin, normal: [...spec.turn.normal], along: [...spec.turn.along], across: [...spec.turn.across] };
}
const handsFit = (rule, hr, hm) => (hr !== hm) === (PLACEMENT_RULES[rule].hands === 'opposite');

function candidatesFor(lib, ifaceId, role, sid, compiled) {
  const out = [];
  for (const module of lib.modules.values()) {
    if (module.derived) continue;
    for (const [portName, port] of entriesOf(get(module.schema.data, 'ports'))) {
      if (!get(port, 'roles').includes(`${ifaceId}.${role}`)) continue;
      for (const key of compiled.keys()) {
        const [mid, msid, vname] = key.split('|');
        if (mid === module.id && msid === sid) out.push([mid, vname, portName]);
      }
    }
  }
  return out;
}
function participant(compiled, sid, mid, vname, portName, names, place) {
  const out = compiled.get(`${mid}|${sid}|${vname}`);
  const frame = out.ports[portName];
  const parts = new Map(out.parts.map(p => [p.id, p]));
  const exposed = {};
  for (const name of names) {
    const { stage, ...part } = structuredClone(parts.get(frame.exposes[name]));
    part.box = place(toFrame(part.box, frame));
    exposed[name] = part;
  }
  return { module: mid, variant: vname, port: portName, size: out.size, exposed };
}

function checkClear(problems, f, where, entry, placed) {
  const overlapping = (a, b) => [0, 1, 2].every(i => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]) > TOUCH_MM);
  const pairKey = refs => refs.map(r => `${r.of}\u0000${r.part}`).sort().join('\u0001');
  const joined = new Set(entry.joints.map(j => pairKey(Object.values(j.parts))));
  const inPair = (of, part) => [...joined].some(k => k.split('\u0001').includes(`${of}\u0000${part}`));
  let ok = true;
  for (const part of entry.parts) {
    if (!inPair('implementation', part.id)) { problems.error(f, `${where}: part '${part.id}' has no joint`); ok = false; }
    for (const [role, boxes] of placed) {
      for (const [other, b] of boxes) {
        if (overlapping(part.box, b)) {
          problems.error(f, `${where}: part '${part.id}' overlaps ${role} part '${other.id}'`);
          ok = false;
        } else if (!('layer' in other) && !('layer' in part) && contact(part.box, b).axis !== null
          && !joined.has(pairKey([{ of: 'implementation', part: part.id }, { of: role, part: other.id }]))) {
          problems.error(f, `${where}: part '${part.id}' touches ${role} part '${other.id}' with no joint`);
          ok = false;
        }
      }
    }
  }
  const [[ra, aBoxes], [rb, bBoxes]] = [...placed];
  for (const [aPart, a] of aBoxes) {
    for (const [bPart, b] of bBoxes) {
      if (overlapping(a, b)) { problems.error(f, `${where}: ${ra} part '${aPart.id}' overlaps ${rb} part '${bPart.id}'`); ok = false; }
    }
  }
  return ok;
}

function checkBaked(problems, f, where, out, participants, jointTypes, system, stage, compiled, layers, sid) {
  const before = problems.errors.length;
  if (!checkKeys(problems, f, where, out, ['parts', 'joints'])) return null;
  const parts = checkParts(problems, f, where, get(out, 'parts'), ['id', 'role', 'host', 'material', 'catalog', 'box'], ['stage', 'layer']);
  for (const part of parts.values()) {
    if (!inside(part.host, new Set(Object.keys(participants)))) problems.error(f, `${where}: part '${part.id}': host ${describe(part.host)} is not a role`);
    else if ('layer' in part) {
      const host = participants[part.host];
      if (!inside(part.layer, layers.get(`${host.module}|${sid}|${host.variant}`))) {
        problems.error(f, `${where}: part '${part.id}': layer ${describe(part.layer)} is not a layer of '${part.host}' (${host.module} ${host.variant})`);
      }
    }
  }
  const checkRef = ref => {
    if (!(isMapping(ref) && keysOf(ref).length === 2 && has(ref, 'of') && has(ref, 'part'))) return 'expected {of, part}';
    const of = ref.of, name = ref.part;
    if (of === 'implementation') return parts.has(name) ? null : `'${name}' is not one of this implementation's parts`;
    if (!Object.hasOwn(participants, of)) return `${describe(of)} is neither a role nor 'implementation'`;
    if (!Object.hasOwn(participants[of].exposed, name)) return `'${name}' is not in the exposes of role '${of}'`;
    return null;
  };
  checkJoints(problems, f, where, get(out, 'joints'), jointTypes, checkRef);
  if (problems.errors.length !== before) return null;
  const bakedParts = out.parts.map(part => ({ stage, ...part }));
  const own = new Map(bakedParts.map(p => [p.id, p]));
  const resolveRef = ref => (ref.of === 'implementation' ? ref : { of: ref.of, part: participants[ref.of].exposed[ref.part].id });
  const resolved = out.joints.map(j => ({ ...j, parts: Object.fromEntries(Object.entries(j.parts).map(([s, r]) => [s, resolveRef(r)])) }));
  const exposed = Object.fromEntries(Object.entries(participants).map(([role, p]) => [role, new Map(Object.values(p.exposed).map(x => [x.id, x]))]));
  const sourceParts = Object.fromEntries(Object.entries(participants).map(([role, p]) =>
    [role, new Map(compiled.get(`${p.module}|${sid}|${p.variant}`).parts.map(x => [x.id, x]))]));
  const info = ref => {
    const { of: role, part: pid } = ref;
    if (role === 'implementation') {
      const part = own.get(pid);
      const host = participants[part.host];
      const layer = 'layer' in part ? layers.get(`${host.module}|${sid}|${host.variant}`).get(part.layer) ?? null : null;
      return { label: `'${pid}'`, box: part.box, stage: part.stage, entity: part.host, layer };
    }
    const p = participants[role];
    const part = sourceParts[role].get(pid);
    return {
      label: `${role}.${pid}`, box: exposed[role].get(pid).box, stage: part.stage, entity: role,
      layer: layers.get(`${p.module}|${sid}|${p.variant}`).get(part.layer) ?? null,
    };
  };
  const fastened = fastenJoints(where, resolved, info, toPlain(jointTypes), toPlain(system));
  for (const message of fastened.errors) problems.error(f, message);
  if (!fastened.joints) return null;
  return { parts: bakedParts, joints: fastened.joints };
}

export async function bakeImplementations(lib, resolved, compiled, problems, source) {
  const jointTypes = lib.jointTypes.data;
  const layers = new Map(resolved.map(r => [`${r.module}|${r.system}|${r.variant}`, layersOf(r.params, lib.modules.get(r.module).schema.data)]));
  const pairs = new Map(), excluded = new Map();
  for (const iface of lib.interfaces.values()) {
    const data = iface.interface.data;
    const placement = get(data, 'placement');
    const rule = get(placement, 'rule');
    const reference = get(placement, 'reference');
    const roles = get(data, 'roles');
    const other = keysOf(roles).find(r => r !== reference);
    pairs.set(iface.id, new Map());
    excluded.set(iface.id, new Map());
    for (const [sid, src] of iface.systems) {
      const stage = get(src.data, 'stage');
      const entries = [];
      pairs.get(iface.id).set(sid, entries);
      const candidates = new Map([reference, other].map(role => [role, candidatesFor(lib, iface.id, role, sid, compiled)]));
      const unfilled = [...candidates].filter(([, found]) => !found.length).map(([role]) => role);
      if (unfilled.length) { problems.error(src.path, `no module in system '${sid}' can fill role(s) ${unfilled.join(', ')}`); continue; }
      const [impl] = get(src.data, 'implementations');
      const f = `library/interfaces/${iface.id}/implementations/${impl}.js`;
      const code = await loadCode(source, f, problems);
      if (!code) continue;
      if (typeof code.build !== 'function') { problems.error(f, 'has no build(participants, core) function'); continue; }
      let possible = 0;
      const skipped = [];
      excluded.get(iface.id).set(sid, skipped);
      for (const rT of candidates.get(reference) ?? []) {
        for (const mT of candidates.get(other) ?? []) {
          const rOut = compiled.get(`${rT[0]}|${sid}|${rT[1]}`), mOut = compiled.get(`${mT[0]}|${sid}|${mT[1]}`);
          const rFrame = rOut.ports[rT[2]], mFrame = mOut.ports[mT[2]];
          const named = {
            [reference]: { module: rT[0], variant: rT[1], port: rT[2] },
            [other]: { module: mT[0], variant: mT[1], port: mT[2] },
          };
          if (!handsFit(rule, rFrame.hand, mFrame.hand)) {
            skipped.push({ participants: named, reason: 'hands',
              message: `a ${rFrame.hand} end and a ${mFrame.hand} end can't meet in rule '${rule}', which needs ${PLACEMENT_RULES[rule].hands} hands` });
            continue;
          }
          const failed = get(data, 'checks').filter(c => !INTERFACE_CHECKS[c](rOut.size, mOut.size));
          if (failed.length) {
            skipped.push({ participants: named, reason: failed[0], message: `${failed.join(', ')} fails for variants '${rT[1]}' and '${mT[1]}'` });
            continue;
          }
          const sizes = { [reference]: rOut.size, [other]: mOut.size };
          let offset = 0;
          if (has(placement, 'offset')) {
            const [oRole, oSize] = get(placement, 'offset').split('.');
            if (!(oSize in sizes[oRole])) {
              const oT = oRole === reference ? rT : mT;
              problems.error(iface.interface.path, `the offset ${get(placement, 'offset')} needs size '${oSize}', which variant '${oT[1]}' of module '${oT[0]}' doesn't have`);
              continue;
            }
            offset = sizes[oRole][oSize];
          }
          const transform = ruleTransform(rule, offset);
          possible += 1;
          const participants = {
            [reference]: participant(compiled, sid, ...rT, get(get(roles, reference), 'exposes'), b => b),
            [other]: participant(compiled, sid, ...mT, get(get(roles, other), 'exposes'), b => fromFrame(b, transform)),
          };
          const where = Object.entries(participants).map(([role, p]) => `${role}=${p.module}/${p.variant}.${p.port}`).join(', ');
          const { ok, out } = call(problems, f, where, code.build, participants);
          if (!ok) continue;
          if (out === null || out === undefined) {
            problems.error(f, `${where}: returned nothing; the single implementation must cover every possible port pair and variant pair`);
            continue;
          }
          const entry = checkBaked(problems, f, where, out, participants, jointTypes, lib.systems.get(sid).data, stage, compiled, layers, sid);
          if (entry) {
            const placed = new Map([
              [reference, rOut.parts.map(p => [p, toFrame(p.box, rFrame)])],
              [other, mOut.parts.map(p => [p, fromFrame(toFrame(p.box, mFrame), transform)])],
            ]);
            if (!checkClear(problems, f, where, entry, placed)) continue;
            entries.push({ participants: named, transform, implementation: impl, ...entry });
          }
        }
      }
      if (possible === 0) problems.error(src.path, `no possible port pair in system '${sid}' (hands, checks or fit never work)`);
    }
  }
  return { pairs, excluded };
}

// ---- export -------------------------------------------------------------------
export function exportAsset(lib, resolved, compiled, baked, excluded) {
  const modules = {};
  for (const module of lib.modules.values()) {
    const schema = module.schema.data;
    const parameters = entriesOf(get(schema, 'parameters')).map(([name, spec]) => ({ name, ...toPlain(spec) }));
    if (module.derived) {
      modules[module.id] = {
        title: get(schema, 'title'), derived: true, parameters,
        systems: Object.fromEntries([...module.systems].map(([sid, src]) =>
          [sid, { params: resolveParams(get(schema, 'parameters'), get(src.data, 'fixed'), lib.systems.get(sid).data) }])),
      };
      continue;
    }
    const systems = {};
    for (const [sid, src] of module.systems) {
      const variants = resolved.filter(r => r.module === module.id && r.system === sid)
        .map(r => ({ name: r.variant, status: r.status, params: r.params, ...compiled.get(`${r.module}|${r.system}|${r.variant}`) }));
      systems[sid] = { default: get(src.data, 'default'), variants };
    }
    modules[module.id] = { title: get(schema, 'title'), parameters, ports: toPlain(get(schema, 'ports')), systems };
  }
  const interfaces = {};
  for (const iface of lib.interfaces.values()) {
    const data = iface.interface.data;
    interfaces[iface.id] = {
      ...Object.fromEntries(['title', 'description', 'roles', 'relations', 'placement', 'checks'].map(k => [k, toPlain(get(data, k))])),
      systems: Object.fromEntries([...iface.systems].map(([sid, src]) => [sid, {
        ...toPlain(src.data), pairs: baked.get(iface.id).get(sid), excluded: excluded.get(iface.id).get(sid),
      }])),
    };
  }
  return {
    generated_by: 'scripts/build_library.mjs from library/; do not edit',
    joint_types: toPlain(lib.jointTypes.data),
    systems: Object.fromEntries([...lib.systems].map(([sid, src]) => [sid, toPlain(src.data)])),
    modules,
    interfaces,
  };
}

/** JSON with keys sorted, one space of indent per level, Unicode kept, and a final newline. */
export function dumps(asset) {
  const write = (v, indent) => {
    const pad = ' '.repeat(indent + 1), end = ' '.repeat(indent);
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return Number.isFinite(v) ? numText(v) : (Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity');
    if (typeof v === 'string') return JSON.stringify(v);
    if (Array.isArray(v)) return v.length ? `[\n${v.map(x => pad + write(x, indent + 1)).join(',\n')}\n${end}]` : '[]';
    const entries = entriesOf(v).map(([k, x]) => [String(k), x]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return entries.length ? `{\n${entries.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${write(x, indent + 1)}`).join(',\n')}\n${end}}` : '{}';
  };
  return `${write(asset, 0)}\n`;
}

// ---- build --------------------------------------------------------------------
/**
 * Run all passes; stop after the first pass that reports errors. core: the
 * library core given to library code (tests give an edited copy).
 */
export async function build(source, { core = CORE } = {}) {
  activeCore = core;
  const problems = new Problems();
  /** @type {any} */
  const result = { lib: load(source, problems), problems, resolved: [], compiled: new Map(), baked: new Map(), excluded: new Map(), asset: null };
  validate(result.lib, problems, source);
  if (problems.errors.length) return result;
  result.resolved = resolve(result.lib);
  result.compiled = await compileVariants(result.lib, result.resolved, problems, source);
  if (problems.errors.length) return result;
  ({ pairs: result.baked, excluded: result.excluded } = await bakeImplementations(result.lib, result.resolved, result.compiled, problems, source));
  if (problems.errors.length) return result;
  result.asset = exportAsset(result.lib, result.resolved, result.compiled, result.baked, result.excluded);
  return result;
}
