// The engine: layout + library asset -> model. Generic: no wall- or
// interface-specific code. Placement rules and interface checks were applied
// at library time; the library asset stores, per interface and possible port
// pair, a transform from the reference role's port to the other port, and
// lists the pairs that were excluded, with the reason. The engine composes
// those transforms, and runs the layout's derived module (library code it
// is given) to add what spans the placed modules.
//
// Passes: load, check, place, close loops, assemble, derived modules,
// summarise. The engine never
// refuses a layout: it returns a model with as much as it could work out, plus
// issues. It throws only for input that is not a layout at all.
//
// Layout:
//   system, git, anchor {entity, position [x, y, z], facing (degrees about z,
//   a multiple of 90)}, entities [{id, module, variant}],
//   connections [{id, interface, <role>: "entity.port", ...}],
//   derive (optional): the derived modules that add what spans the placed
//   modules (hut/design/ic_derived.md, ic_lib_roof.md 4.2): one entry or a
//   list, each {module, id, after: [ids], parameters}; their code comes from
//   the caller: compileDesign(layout, asset, {derived: {<module id>: {derive}}})
// Model:
//   git (the engine's), layout_git (the layout's), system, entities (with
//   world transforms), parts, connections, joints (id, owner, type, parts,
//   stage, fasteners), issues, summary
// Every issue has severity, rule, message, entities and connections (lists of
// ids, possibly empty).
//
// Placement stays on right angles: world boxes are exact only for rotations
// by multiples of 90 degrees. True north is a site value, applied on export.

import { applyBox, compose, det, difference, fromFrame, invert, placement } from './affine.js';
import { fastenJoints } from '../library/fastening.js';
import { checkAdded } from '../library/checks.js';
import * as solids from '../library/solids.js';
// What a derived module's code gets as its third argument: the library core.
import { CORE } from '../library/core.js';

export const GAP_TOLERANCE_MM = 1;
export const PORT_KINDS = new Set(['fixed']);
const CONNECTION_FIELDS = new Set(['id', 'interface']);
const ID_PATTERN = /^[^./\s]+$/;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);

function indexLibrary(asset, systemId) {
  const variants = new Map(); // "module/variant" -> variant, in this system
  for (const [moduleId, module] of Object.entries(asset.modules)) {
    for (const variant of module.systems[systemId]?.variants ?? []) {
      variants.set(`${moduleId}/${variant.name}`, variant);
    }
  }
  const pairs = new Map();
  const excluded = new Map();
  for (const [interfaceId, iface] of Object.entries(asset.interfaces)) {
    const system = iface.systems[systemId];
    if (!system) continue;
    for (const entry of system.pairs) pairs.set(pairKey(interfaceId, entry.participants), entry);
    for (const entry of system.excluded) excluded.set(pairKey(interfaceId, entry.participants), entry);
  }
  return { variants, pairs, excluded };
}

function pairKey(interfaceId, participants) {
  const roles = Object.keys(participants).sort();
  return [interfaceId, ...roles.map(role => {
    const p = participants[role];
    return `${role}=${p.module}/${p.variant}.${p.port}`;
  })].join('|');
}

export function compileDesign(layout, asset, { git = null, derived = {} } = {}) {
  if (!isObject(layout) || !Array.isArray(layout.entities)) {
    throw new Error('not a layout: expected an object with an entities list');
  }
  const issues = [];
  const issue = (severity, rule, message, { entities = [], connections = [], ...extra } = {}) => {
    issues.push({ severity, rule, message, entities, connections, ...extra });
  };
  const systemId = layout.system;
  const library = indexLibrary(asset, systemId);

  // ---- load: look up each entity's module and variant -------------------
  const entities = new Map();
  const ids = new Set();
  const claim = (id, kind, index) => {
    const refs = kind === 'entity' ? { entities: [] } : { connections: [] };
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      issue('error', id === undefined || id === '' ? 'missing_id' : 'bad_id',
        `${kind} ${index + 1}: id ${JSON.stringify(id)} must be text without '.', '/' or spaces`, refs);
      return false;
    }
    if (ids.has(id)) {
      issue('error', 'duplicate_id', `id '${id}' is used more than once`,
        kind === 'entity' ? { entities: [id] } : { connections: [id] });
      return false;
    }
    ids.add(id);
    return true;
  };
  layout.entities.forEach((e, index) => {
    if (!isObject(e)) {
      issue('error', 'malformed', `entity ${index + 1} is not an object`);
      return;
    }
    if (!claim(e.id, 'entity', index)) return;
    const variant = library.variants.get(`${e.module}/${e.variant}`);
    if (!variant) {
      issue('error', 'unknown_variant',
        `entity '${e.id}': no variant '${e.variant}' of module '${e.module}' in system '${systemId}'`,
        { entities: [e.id] });
    }
    entities.set(e.id, { id: e.id, module: e.module, variant: e.variant, compiled: variant ?? null, world: null });
  });

  // ---- check: connections ------------------------------------------------
  let layoutConnections = layout.connections ?? [];
  if (!Array.isArray(layoutConnections)) {
    issue('error', 'malformed', 'connections must be a list');
    layoutConnections = [];
  }
  const connections = []; // valid ones
  const modelConnections = []; // every connection with an id, valid or not
  const usedPorts = new Map(); // "entity.port" -> connection id
  layoutConnections.forEach((c, index) => {
    if (!isObject(c)) {
      issue('error', 'malformed', `connection ${index + 1} is not an object`);
      return;
    }
    if (!claim(c.id, 'connection', index)) return;
    const record = { id: c.id, interface: c.interface, implementation: null, roles: {} };
    modelConnections.push(record);
    const refs = { connections: [c.id] };
    const iface = asset.interfaces[c.interface];
    if (!iface) {
      issue('error', 'unknown_interface', `connection '${c.id}': no interface '${c.interface}'`, refs);
      return;
    }
    const roles = Object.keys(iface.roles);
    for (const key of Object.keys(c)) {
      if (!CONNECTION_FIELDS.has(key) && !roles.includes(key)) {
        issue('warning', 'unknown_field', `connection '${c.id}': '${key}' is not a role of '${c.interface}'; ignored`, refs);
      }
    }
    const missing = roles.filter(role => !(role in c));
    if (missing.length) {
      issue('error', 'roles', `connection '${c.id}': missing role(s) ${missing.join(', ')} of '${c.interface}'`, refs);
      return;
    }
    const ends = {};
    let ok = true;
    for (const role of roles) {
      const parts = typeof c[role] === 'string' ? c[role].split('.') : [];
      if (parts.length !== 2 || !ID_PATTERN.test(parts[0]) || !ID_PATTERN.test(parts[1])) {
        issue('error', 'bad_port_ref', `connection '${c.id}': ${role} must be written entity.port, got ${JSON.stringify(c[role])}`, refs);
        ok = false;
        continue;
      }
      const [entityId, port] = parts;
      record.roles[role] = `${entityId}.${port}`;
      const entity = entities.get(entityId);
      if (!entity) {
        issue('error', 'unknown_entity', `connection '${c.id}': no entity '${entityId}'`, refs);
        ok = false;
        continue;
      }
      if (!entity.compiled) { ok = false; continue; } // reported in load
      const schemaPort = asset.modules[entity.module].ports[port];
      if (!schemaPort) {
        issue('error', 'unknown_port', `connection '${c.id}': '${entityId}' has no port '${port}'`,
          { connections: [c.id], entities: [entityId] });
        ok = false;
        continue;
      }
      if (!PORT_KINDS.has(schemaPort.kind)) {
        issue('error', 'unknown_port_kind',
          `connection '${c.id}': port '${entityId}.${port}' has kind '${schemaPort.kind}', which this engine doesn't know`,
          { connections: [c.id], entities: [entityId] });
        ok = false;
        continue;
      }
      if (!schemaPort.roles.includes(`${c.interface}.${role}`)) {
        issue('error', 'role', `connection '${c.id}': port '${entityId}.${port}' can't fill '${c.interface}.${role}'`,
          { connections: [c.id], entities: [entityId] });
        ok = false;
        continue;
      }
      ends[role] = { entity, port };
    }
    if (!ok) return;
    const endIds = roles.map(r => ends[r].entity.id);
    if (endIds[0] === endIds[1]) {
      issue('error', 'same_entity', `connection '${c.id}': both roles are on '${endIds[0]}'`,
        { connections: [c.id], entities: [endIds[0]] });
      return;
    }
    const participants = Object.fromEntries(roles.map(r => [r, {
      module: ends[r].entity.module, variant: ends[r].entity.variant, port: ends[r].port,
    }]));
    const key = pairKey(c.interface, participants);
    const entry = library.pairs.get(key);
    if (!entry) {
      const why = library.excluded.get(key);
      issue('error', why ? why.reason : 'no_pair',
        `connection '${c.id}': ${roles.map(r => record.roles[r]).join(' and ')} can't meet in '${c.interface}': `
        + (why ? why.message : 'the library has no entry for this port pair and variant pair'),
        { connections: [c.id], entities: endIds });
      return;
    }
    for (const role of roles) {
      const used = usedPorts.get(record.roles[role]);
      if (used) {
        issue('error', 'port_in_use', `connection '${c.id}': port '${record.roles[role]}' is already used by '${used}'`,
          { connections: [c.id, used], entities: [ends[role].entity.id] });
        ok = false;
      }
    }
    if (!ok) return;
    for (const role of roles) usedPorts.set(record.roles[role], c.id);
    record.implementation = entry.implementation;
    const reference = iface.placement.reference;
    connections.push({
      id: c.id, interface: c.interface, ends, entry, reference, other: roles.find(r => r !== reference),
    });
  });

  // ---- place: walk connections from the anchor ---------------------------
  // A port's frame in its entity's coordinates.
  const portMap = (conn, role) => {
    const { entity, port } = conn.ends[role];
    return fromFrame(entity.compiled.ports[port]);
  };
  // World transform of the entity at the far end of conn, given the world
  // transform of the entity in role fromRole.
  const farEnd = (conn, fromRole, world) => {
    const T = fromFrame(conn.entry.transform);
    if (fromRole === conn.reference) {
      return compose(compose(compose(world, portMap(conn, conn.reference)), T), invert(portMap(conn, conn.other)));
    }
    return compose(compose(compose(world, portMap(conn, conn.other)), invert(T)), invert(portMap(conn, conn.reference)));
  };

  const anchor = isObject(layout.anchor) ? layout.anchor : {};
  const start = entities.get(anchor.entity);
  const position = anchor.position ?? [0, 0, 0];
  const facing = anchor.facing ?? 0;
  if (!start || !start.compiled) {
    issue('error', 'anchor', `anchor entity '${anchor.entity}' is missing or has no variant`,
      { entities: start ? [start.id] : [] });
  } else if (!Array.isArray(position) || position.length !== 3 || !position.every(isFiniteNumber)) {
    issue('error', 'anchor', `anchor position must be three numbers, got ${JSON.stringify(position)}`,
      { entities: [start.id] });
  } else if (!isFiniteNumber(facing) || facing % 90 !== 0) {
    issue('error', 'anchor', `anchor facing must be a multiple of 90 degrees, got ${JSON.stringify(facing)}`,
      { entities: [start.id] });
  } else {
    start.world = placement(position, facing);
    const placedBy = new Map(); // entity id -> the connection that placed it
    // Place target from entity through conn; false if it would be mirrored.
    const place = (conn, role, entity, target) => {
      const world = farEnd(conn, role, entity.world);
      if (det(world) < 0) {
        issue('error', 'mirrored', `connection '${conn.id}' would mirror '${target.id}'`,
          { connections: [conn.id], entities: [target.id] });
        return false;
      }
      target.world = world;
      placedBy.set(target.id, conn.id);
      return true;
    };
    // Walk connections breadth-first from every placed entity.
    const queue = [start];
    const tried = new Set(); // mirrored connections, not tried again
    while (queue.length) {
      const entity = queue.shift();
      for (const conn of connections) {
        if (tried.has(conn)) continue;
        const role = Object.keys(conn.ends).find(r => conn.ends[r].entity === entity);
        if (!role) continue;
        const target = conn.ends[role === conn.reference ? conn.other : conn.reference].entity;
        if (target.world) continue;
        if (place(conn, role, entity, target)) queue.push(target);
        else tried.add(conn);
      }
    }
    // ---- close loops: connections between entities placed another way ----
    for (const conn of connections) {
      const R = conn.ends[conn.reference].entity;
      const M = conn.ends[conn.other].entity;
      if (!R.world || !M.world) continue;
      if (placedBy.get(M.id) === conn.id || placedBy.get(R.id) === conn.id) continue;
      const { gap, turned } = difference(farEnd(conn, conn.reference, R.world), M.world);
      if (gap > GAP_TOLERANCE_MM || turned) {
        issue('error', 'loop_gap',
          `connection '${conn.id}': the loop doesn't close by ${Math.round(gap * 10) / 10} mm`
          + (turned ? ' and the ends face different ways' : ''),
          { connections: [conn.id], entities: [R.id, M.id], gap_mm: gap });
      }
    }
  }
  for (const entity of entities.values()) {
    if (entity.compiled && !entity.world) {
      issue('error', 'unplaced', `entity '${entity.id}' is not reachable from the anchor`, { entities: [entity.id] });
    }
  }

  // ---- assemble: parts and joints in world coordinates -------------------
  const parts = [];
  const joints = [];
  for (const entity of entities.values()) {
    if (!entity.world) continue;
    for (const part of entity.compiled.parts) {
      parts.push({
        id: `${entity.id}/${part.id}`, owner: entity.id, host: entity.id, stage: part.stage,
        role: part.role, catalog: part.catalog, material: part.material,
        ...(part.layer ? { layer: part.layer } : {}),
        box: part.box, world: applyBox(entity.world, part.box),
      });
    }
    for (const joint of entity.compiled.joints) {
      joints.push({
        id: `${entity.id}/${joint.id}`, owner: entity.id, type: joint.type,
        parts: Object.fromEntries(Object.entries(joint.parts).map(([side, id]) => [side, `${entity.id}/${id}`])),
        stage: joint.stage, fasteners: joint.fasteners,
      });
    }
  }
  for (const conn of connections) {
    const R = conn.ends[conn.reference];
    if (!R.entity.world || !conn.ends[conn.other].entity.world) continue;
    const frameToWorld = compose(R.entity.world, portMap(conn, conn.reference));
    for (const part of conn.entry.parts) {
      parts.push({
        id: `${conn.id}/${part.id}`, owner: conn.id, host: conn.ends[part.host].entity.id, stage: part.stage,
        role: part.role, catalog: part.catalog, material: part.material,
        ...(part.layer ? { layer: part.layer } : {}),
        box: part.box, world: applyBox(frameToWorld, part.box),
      });
    }
    for (const joint of conn.entry.joints) {
      joints.push({
        id: `${conn.id}/${joint.id}`, owner: conn.id, type: joint.type,
        parts: Object.fromEntries(Object.entries(joint.parts).map(([side, ref]) => [side,
          ref.of === 'implementation' ? `${conn.id}/${ref.part}` : `${conn.ends[ref.of].entity.id}/${ref.part}`])),
        stage: joint.stage, fasteners: joint.fasteners,
      });
    }
  }

  // ---- derived modules: what spans the placed modules ---------------------
  if (layout.derive !== undefined) {
    deriveModules(layout.derive, { asset, systemId, entities, connections, parts, joints, derived, issue, anchor: start });
  }

  // ---- summarise: free ports, outline, counts ----------------------------
  for (const entity of entities.values()) {
    if (!entity.world) continue;
    for (const [port, schemaPort] of Object.entries(asset.modules[entity.module].ports)) {
      if (schemaPort.roles.length && !schemaPort.optional && !usedPorts.has(`${entity.id}.${port}`)) {
        issue('warning', 'free_port', `port '${entity.id}.${port}' is not connected`, { entities: [entity.id] });
      }
    }
  }
  let outline = null;
  if (parts.length) {
    const min = [0, 1].map(i => Math.min(...parts.map(p => p.world.min[i])));
    const max = [0, 1].map(i => Math.max(...parts.map(p => p.world.max[i])));
    outline = { min, max, size: [0, 1].map(i => max[i] - min[i]) };
  }
  const byStage = {};
  for (const p of parts) byStage[p.stage] = (byStage[p.stage] ?? 0) + 1;
  // Fasteners of the joints the model has: framing, workshop sheets, the
  // floor and connection parts. The walls' site layers make no parts or
  // joints yet, and wall-to-floor joints are missing (ic_lib_floor.md, F9).
  const fastenersByStage = {};
  for (const j of joints) {
    const stage = (fastenersByStage[j.stage] ??= {});
    stage[j.fasteners.item] = (stage[j.fasteners.item] ?? 0) + j.fasteners.count;
  }
  const panels = {};
  for (const e of entities.values()) {
    if (e.world) panels[`${e.module}/${e.variant}`] = (panels[`${e.module}/${e.variant}`] ?? 0) + 1;
  }

  return {
    git,
    layout_git: layout.git ?? null,
    system: systemId,
    entities: [...entities.values()].map(e => ({
      id: e.id, module: e.module, variant: e.variant, transform: e.world,
    })),
    parts,
    connections: modelConnections,
    joints,
    issues,
    summary: { outline, parts_by_stage: byStage, fasteners_by_stage: fastenersByStage, panels },
  };
}

// The build-up layers of a compiled variant, by role (layers carry the
// fastening a sheet part takes).
function variantLayers(variant) {
  const out = {};
  for (const value of Object.values(variant.params ?? {})) {
    if (isObject(value) && Array.isArray(value.face_a) && Array.isArray(value.face_b)) {
      for (const group of ['face_a', 'cavity', 'face_b']) for (const layer of value[group] ?? []) out[layer.role] = layer;
    }
  }
  return out;
}

// The layout's derived modules: derive is one entry or a list of them, each
// {module, id (default: the module), after: [ids], parameters}. They run in
// order of `after` (then of the list); each sees the model so far (what was
// placed and what earlier derived modules added) and the exports of the
// modules it comes after. A module whose dependency failed is skipped. The
// parameters come from the system file (fixed) and the layout entry: every
// parameter from exactly one of them (hut/design/ic_lib_roof.md, 4.2).
function deriveModules(spec, ctx) {
  const { issue } = ctx;
  const list = Array.isArray(spec) ? spec : [spec];
  const entries = [];
  const ids = new Set();
  list.forEach((e, k) => {
    const where = Array.isArray(spec) ? `derive[${k}]` : 'derive';
    if (!isObject(e) || typeof e.module !== 'string') {
      issue('error', 'malformed', `${where}: expected {module, id, after, parameters}`);
      return;
    }
    const extra = Object.keys(e).filter(key => !['module', 'id', 'after', 'parameters'].includes(key));
    if (extra.length) { issue('error', 'malformed', `${where}: unknown key(s) ${extra.join(', ')}`); return; }
    const id = e.id ?? e.module;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id)) { issue('error', 'malformed', `${where}: id ${JSON.stringify(id)} must be a lower-case name`); return; }
    if (ids.has(id)) { issue('error', 'malformed', `${where}: the id '${id}' is used twice`); return; }
    const after = e.after ?? [];
    if (!Array.isArray(after) || !after.every(a => typeof a === 'string')) { issue('error', 'malformed', `${where}: after: expected a list of ids`); return; }
    if (e.parameters !== undefined && !isObject(e.parameters)) { issue('error', 'malformed', `${where}: parameters: expected a mapping`); return; }
    ids.add(id);
    entries.push({ id, module: e.module, after, parameters: e.parameters ?? {} });
  });
  const status = new Map(); // id -> 'done' | 'failed'
  const exported = new Map();
  for (const e of entries) {
    for (const a of e.after) {
      if (!ids.has(a)) issue('error', 'malformed', `derived module '${e.id}': after '${a}': no such derived module in the layout`);
      if (a === e.id) issue('error', 'malformed', `derived module '${e.id}': it comes after itself`);
    }
  }
  const pending = entries.filter(e => e.after.every(a => ids.has(a) && a !== e.id));
  for (const e of entries) if (!pending.includes(e)) status.set(e.id, 'failed');
  while (pending.length) {
    const at = pending.findIndex(e => e.after.every(a => status.has(a)));
    if (at < 0) {
      for (const e of pending) {
        issue('error', 'malformed', `derived module '${e.id}': its 'after' goes round in a circle`);
        status.set(e.id, 'failed');
      }
      break;
    }
    const [e] = pending.splice(at, 1);
    const failed = e.after.find(a => status.get(a) !== 'done');
    if (failed) {
      issue('error', 'derive_skipped', `derived module '${e.id}' is skipped: '${failed}' failed`);
      status.set(e.id, 'failed');
      continue;
    }
    const deps = Object.fromEntries(e.after.map(a => [a, exported.get(a) ?? {}]));
    const result = deriveOne(e, deps, ctx);
    status.set(e.id, result ? 'done' : 'failed');
    if (result) exported.set(e.id, result.exports);
  }
}

// A value the layout gives a derived module's parameter: problems (empty if
// fine). Lengths, angles and choices; catalog types come from the system file.
function layoutValueProblems(spec, value) {
  if (spec.type === 'length' || spec.type === 'angle') {
    if (!isFiniteNumber(value)) return [`expected a number, got ${JSON.stringify(value)}`];
    const out = [];
    if (value < 0 || (value === 0 && spec.min !== 0)) out.push(`${value} must be positive`);
    if (isFiniteNumber(spec.min) && value < spec.min) out.push(`${value} is below the minimum ${spec.min}`);
    if (isFiniteNumber(spec.max) && value > spec.max) out.push(`${value} is above the maximum ${spec.max}`);
    return out;
  }
  if (spec.type === 'choice') {
    return spec.values.includes(value) ? [] : [`${JSON.stringify(value)} is not one of ${spec.values.join(', ')}`];
  }
  return [`a ${spec.type} can't be given in the layout (the system file gives it)`];
}

// Run one derived module (and, through input.derive, its children), add its
// parts and fastened joints to the model, and check the new parts against
// the rest. Returns {exports} when its parts are in the model, null if it
// failed; problems become issues.
function deriveOne(entry, deps, { asset, systemId, entities, connections, parts, joints, derived, issue, anchor }) {
  const instance = entry.id;
  const where = `derived module '${instance}'`;
  const module = asset.modules[entry.module];
  if (!module?.derived) { issue('error', 'derive_failed', `${where}: '${entry.module}' is not a derived module in the library`); return null; }
  const fixed = module.systems[systemId]?.params;
  if (!fixed) { issue('error', 'derive_failed', `${where}: '${entry.module}' has no values for system '${systemId}'`); return null; }
  const specs = Object.fromEntries(module.parameters.map(p => [p.name, p]));
  let badParams = false;
  for (const [name, value] of Object.entries(entry.parameters)) {
    const fail = message => { issue('error', 'derive_parameter', `${where}: parameter '${name}': ${message}`); badParams = true; };
    if (!(name in specs)) fail(`not a parameter of '${entry.module}'`);
    else if (name in fixed) fail(`fixed by the system file; the layout can't change it`);
    else for (const message of layoutValueProblems(specs[name], value)) fail(message);
  }
  for (const name of Object.keys(specs)) {
    if (!(name in fixed) && !(name in entry.parameters)) {
      issue('error', 'derive_parameter', `${where}: parameter '${name}' has no value: give it in the layout`);
      badParams = true;
    }
  }
  if (badParams) return null;
  const run = (moduleId, params, input) => {
    const child = asset.modules[moduleId];
    if (!child?.derived) throw new Error(`'${moduleId}' is not a derived module in the library`);
    const childFixed = child.systems[systemId]?.params;
    if (!childFixed) throw new Error(`derived module '${moduleId}' has no values for system '${systemId}'`);
    const code = derived[moduleId];
    if (typeof code?.derive !== 'function') throw new Error(`no code given for derived module '${moduleId}'`);
    const values = { ...childFixed, ...params };
    const missing = child.parameters.map(p => p.name).filter(name => !(name in values));
    if (missing.length) throw new Error(`derived module '${moduleId}': no value for ${missing.map(m => `'${m}'`).join(', ')}`);
    return code.derive(values, input, CORE);
  };
  const placed = [...entities.values()].filter(e => e.world);
  const modelParts = parts.map(p => ({ ...p }));
  const byOwner = new Map();
  for (const p of modelParts) {
    if (!byOwner.has(p.owner)) byOwner.set(p.owner, []);
    byOwner.get(p.owner).push(p);
  }
  const input = {
    entities: placed.map(e => ({
      id: e.id, module: e.module, variant: e.variant, params: e.compiled.params, size: e.compiled.size,
      transform: e.world, parts: byOwner.get(e.id) ?? [],
    })),
    parts: modelParts,
    connections: connections
      .filter(c => Object.values(c.ends).every(end => end.entity.world))
      .map(c => ({
        id: c.id, interface: c.interface,
        ends: Object.fromEntries(Object.entries(c.ends).map(([role, end]) => [role, { entity: end.entity.id, port: end.port }])),
      })),
    // The anchor entity: its frame is the building's, so what a derived
    // module lays out turns with the building, not with the world's axes.
    anchor: anchor?.world ? anchor.id : null,
    // What the modules this one comes after exported, by their ids; part
    // ids in them are the module's own (the model's are '<id>/<own id>').
    exports: deps,
    derive: (moduleId, params, childInput) => run(moduleId, params ?? {}, childInput),
  };
  let result;
  try {
    result = run(entry.module, entry.parameters, input);
  } catch (error) {
    issue('error', 'derive_failed', `${where}: ${error.message}`);
    return null;
  }
  if (result.exports !== undefined && !isObject(result.exports)) {
    issue('error', 'derive_failed', `${where}: exports must be a mapping`);
    return null;
  }
  // A derived part cut from a layer carries the layer's definition
  // (layerDef), since its layer is the derived module's, not an entity's.
  const layerDefs = new Map();
  const added = result.parts.map(p => {
    const id = `${instance}/${p.id}`;
    if (p.layerDef) layerDefs.set(id, p.layerDef);
    // A sloped part (frame, cuts, notches): box is in its frame, which is in
    // world coordinates; world is its bounding box.
    const shape = {
      ...(p.frame ? { frame: p.frame } : {}), ...(p.cuts?.length ? { cuts: p.cuts } : {}),
      ...(p.notches?.length ? { notches: p.notches } : {}),
    };
    return {
      id, owner: instance, host: null, stage: p.stage ?? 'site',
      role: p.role, catalog: p.catalog, material: p.material, ...(p.layer ? { layer: p.layer } : {}),
      box: p.box, ...shape, world: p.box,
    };
  });
  const ids = new Set(parts.map(p => p.id));
  const catalog = asset.systems[systemId].catalog;
  let bad = false;
  for (const p of added) {
    const fail = message => { issue('error', 'derived_part', `${where}: part '${p.id}': ${message}`); bad = true; };
    if (ids.has(p.id)) fail('the id is used twice');
    ids.add(p.id);
    if (!['workshop', 'site'].includes(p.stage)) fail(`stage ${JSON.stringify(p.stage)} is not workshop or site`);
    if (typeof p.role !== 'string' || !p.role) fail('no role');
    if (!(p.catalog in (catalog.lumber ?? {})) && !(p.catalog in (catalog.sheets ?? {}))) {
      fail(`catalog ${JSON.stringify(p.catalog)} is not lumber or a sheet in the system's catalog`);
    }
    const b = p.box;
    if (!isObject(b) || ![0, 1, 2].every(i => isFiniteNumber(b.min?.[i]) && isFiniteNumber(b.max?.[i]) && b.min[i] < b.max[i])) {
      fail('the box must have min below max on every axis');
    } else if (solids.isSolid(p)) {
      const problems = solids.shapeProblems(p);
      for (const message of problems) fail(message);
      if (!problems.length) {
        if (!solids.pieces(p).length) fail('its cuts and notches leave nothing');
        else p.world = solids.boundingBox(p);
      }
    }
  }
  if (bad) return null;
  // Fasten the joints as the builder fastens a module's.
  const byId = new Map([...parts, ...added].map(p => [p.id, p]));
  const layersOf = new Map(placed.map(e => [e.id, variantLayers(e.compiled)]));
  const resolve = ref => (ref.own !== undefined ? `${instance}/${ref.own}` : ref.model);
  const refJoints = [];
  for (const j of result.joints) {
    const type = asset.joint_types[j.type];
    const sides = type ? Object.keys(type.sides).sort().join(', ') : null;
    const given = Object.keys(j.parts ?? {}).sort().join(', ');
    if (!type) bad = true, issue('error', 'derived_joint', `${where}: joint type '${j.type}' is not in the library`);
    else if (sides !== given) bad = true, issue('error', 'derived_joint', `${where}: a '${j.type}' joint has sides ${given}, not ${sides}`);
    else refJoints.push({ type: j.type, parts: Object.fromEntries(Object.entries(j.parts).map(([side, ref]) => [side, resolve(ref)])) });
  }
  if (bad) return null;
  const info = id => {
    const p = byId.get(id);
    if (!p) throw new Error(`derived module '${instance}': a joint refers to '${id}', which is not a part`);
    const sloped = solids.isSolid(p);
    return {
      label: `'${id}'`, box: sloped ? p.box : p.world, stage: p.stage, entity: p.owner === instance ? instance : p.host,
      ...(sloped ? { frame: p.frame, cuts: p.cuts, notches: p.notches } : {}),
      layer: p.layer ? (layerDefs.get(id) ?? layersOf.get(p.host)?.[p.layer] ?? null) : null,
    };
  };
  let fastened;
  try {
    fastened = fastenJoints(`derived module '${instance}'`, refJoints, info, asset.joint_types, asset.systems[systemId]);
  } catch (error) {
    issue('error', 'derive_failed', error.message);
    return null;
  }
  for (const message of fastened.errors) issue('error', 'derived_joint', message);
  if (!fastened.joints) return null;
  // World boxes, except a sloped part keeps its box in its (world) frame.
  const inWorld = p => (solids.isSolid(p) ? p : { ...p, box: p.world });
  const problems = checkAdded(
    added.map(inWorld),
    parts.map(inWorld),
    fastened.joints.map(j => ({ parts: j.parts })),
  );
  for (const message of problems) issue('error', 'derived_part', `derived module '${instance}': ${message}`);
  parts.push(...added);
  for (const j of fastened.joints) {
    joints.push({ ...j, id: `${instance}/${j.id}`, owner: instance });
  }
  return { exports: result.exports ?? {} };
}
