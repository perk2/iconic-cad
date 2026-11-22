// Joints and their fasteners: fastener counts, schedule entries, fastening a
// list of joints. Pure.

import { ROUND_MM, TOUCH_MM, contact, fmtG, longAxis } from './geometry.js';
import { faceSpan, isSolid, longAxisVector, solidContact } from './solids.js';

/** @typedef {import('./types.js').Box} Box */
/** @typedef {import('./types.js').FasteningEntry} FasteningEntry */
/** @typedef {import('./types.js').PartInfo} PartInfo */
/** @typedef {import('./types.js').JointIn} JointIn */
/** @typedef {import('./types.js').Joint} Joint */

/**
 * Fasteners for one joint: {count} or {count: null, reason}. boxes: the
 * parts' boxes by side; axis and face: their contact. throughSheet: the
 * entry is a sheet layer's fastening, nailed through the sheet's face, so
 * the row runs along the 'along' part's longest side within the face.
 * @param {FasteningEntry} entry
 * @param {number} axis
 * @param {Box} face
 * @param {Object<string, Box>} boxes
 * @param {boolean} [throughSheet]
 * @returns {{count: number} | {count: null, reason: string}}
 */
export function fastenerCount(entry, axis, face, boxes, throughSheet = false) {
  if (entry.count !== undefined) return { count: entry.count };
  const alongName = /** @type {string} */ (entry.along);
  const along = longAxis(boxes[alongName], throughSheet ? axis : null);
  if (along === null || along === axis) {
    return { count: null, reason: `the '${alongName}' part has no long axis in the contact face` };
  }
  const across = 3 - axis - along;
  const length = face.max[along] - face.min[along];
  const end = entry.end_distance ?? 0;
  if (length < 2 * end) {
    return {
      count: null,
      reason: `the contact (${fmtG(length)} mm) is shorter than twice the end distance (${fmtG(end)} mm)`,
    };
  }
  let spacing = /** @type {number} */ (entry.spacing);
  if (entry.edge_spacing !== undefined) {
    const fromBox = boxes[entry.from];
    const onEdge = Math.abs(face.min[across] - fromBox.min[across]) <= TOUCH_MM
      || Math.abs(face.max[across] - fromBox.max[across]) <= TOUCH_MM;
    if (onEdge) spacing = entry.edge_spacing;
  }
  return { count: Math.ceil((length - 2 * end - ROUND_MM) / spacing) + 1 };
}

/**
 * Fasteners for one joint when a part is sloped or cut (solids.js): as
 * fastenerCount, with the contact as a polygon and the row along the
 * 'along' part's long axis as a vector.
 * @param {FasteningEntry} entry
 * @param {{normal: import('./solids.js').V, face: import('./solids.js').V[]}} c
 * @param {Object<string, PartInfo>} parts  by side
 * @param {boolean} [throughSheet]
 * @returns {{count: number} | {count: null, reason: string}}
 */
export function fastenerCountSolid(entry, c, parts, throughSheet = false) {
  if (entry.count !== undefined) return { count: entry.count };
  const alongName = /** @type {string} */ (entry.along);
  const along = longAxisVector(parts[alongName], throughSheet ? c.normal : null);
  if (along === null || Math.abs(along[0] * c.normal[0] + along[1] * c.normal[1] + along[2] * c.normal[2]) > 1 - 1e-6) {
    return { count: null, reason: `the '${alongName}' part has no long axis in the contact face` };
  }
  const { length, onEdge } = faceSpan(c.face, along, c.normal, parts[entry.from]);
  const end = entry.end_distance ?? 0;
  if (length < 2 * end) {
    return {
      count: null,
      reason: `the contact (${fmtG(length)} mm) is shorter than twice the end distance (${fmtG(end)} mm)`,
    };
  }
  const spacing = entry.edge_spacing !== undefined && onEdge ? entry.edge_spacing : /** @type {number} */ (entry.spacing);
  return { count: Math.ceil((length - 2 * end - ROUND_MM) / spacing) + 1 };
}

/**
 * The schedule entry for a joint. A part from a layer with fastening gives
 * the entry; otherwise the system's fastening schedule does.
 * @param {string} jtype
 * @param {Object<string, PartInfo>} parts  by side
 * @param {Object<string, {sides: Object<string, string>}>} jointTypes
 * @param {{fastening: Object<string, FasteningEntry>}} system
 * @returns {{entry: FasteningEntry, source: string} | {entry: null, message: string}}
 */
export function scheduleEntry(jtype, parts, jointTypes, system) {
  const layered = Object.entries(parts).filter(([, p]) => p.layer && p.layer.fastening);
  const labels = Object.values(parts).map(p => p.label).join(' and ');
  if (layered.length > 1) return { entry: null, message: `${labels} both come from layers with fastening` };
  if (layered.length === 0) {
    const entry = system.fastening[jtype];
    if (!entry) return { entry: null, message: `no fastening entry for '${jtype}' in system.yaml or a layer` };
    return { entry, source: `system.yaml fastening '${jtype}'` };
  }
  const [side, part] = layered[0];
  const layer = /** @type {import('./types.js').Layer} */ (part.layer);
  const entry = /** @type {FasteningEntry} */ (layer.fastening);
  const source = `system.yaml layer '${layer.role}' fastening`;
  const sides = Object.keys(jointTypes[jtype].sides);
  if (entry.from !== side) {
    return { entry: null, message: `${source}: from '${entry.from}' must be '${side}', the side of ${part.label}` };
  }
  if (entry.along !== undefined && !sides.includes(entry.along)) {
    return { entry: null, message: `${source}: along '${entry.along}' is not a side (${sides.join(', ')})` };
  }
  return { entry, source };
}

/**
 * Give joints their id, stage and fasteners. info(ref) describes a side's
 * part. Returns {joints, errors}; joints is null when there are errors.
 * @param {string} where  prefix for messages
 * @param {JointIn[]} joints
 * @param {(ref: *) => PartInfo} info
 * @param {Object<string, {sides: Object<string, string>}>} jointTypes
 * @param {{fastening: Object<string, FasteningEntry>}} system
 * @returns {{joints: Joint[] | null, errors: string[]}}
 */
export function fastenJoints(where, joints, info, jointTypes, system) {
  /** @type {string[]} */
  const errors = [];
  /** @type {Joint[]} */
  const out = [];
  /** @type {Map<string, string>} */
  const seen = new Map();
  joints.forEach((joint, index) => {
    const jid = `j${index + 1}`;
    const jtype = joint.type;
    const refs = joint.parts;
    const jwhere = `${where}: joint ${jid} (${jtype})`;
    const key = jtype + '|' + Object.values(refs).map(r => JSON.stringify(r)).sort().join('|');
    if (seen.has(key)) {
      errors.push(`${jwhere}: the same joint as ${seen.get(key)}`);
      return;
    }
    seen.set(key, jid);
    /** @type {Object<string, PartInfo>} */
    const parts = Object.fromEntries(Object.entries(refs).map(([side, ref]) => [side, info(ref)]));
    const labels = Object.values(parts).map(p => p.label).join(' and ');
    const solid = Object.values(parts).some(isSolid);
    const [pa, pb] = Object.values(parts);
    const c = solid ? solidContact(pa, pb) : contact(pa.box, pb.box);
    if ('axis' in c ? c.axis === null : c.normal === null) {
      errors.push(`${jwhere}: ${labels} ${/** @type {{reason: string}} */ (c).reason}`);
      return;
    }
    const workshop = Object.values(parts).every(p => p.stage === 'workshop')
      && new Set(Object.values(parts).map(p => p.entity)).size === 1;
    const sched = scheduleEntry(jtype, parts, jointTypes, system);
    if (sched.entry === null) {
      errors.push(`${jwhere}: ${sched.message}`);
      return;
    }
    const throughSheet = Object.values(parts).some(p => p.layer && p.layer.sheet && p.layer.fastening);
    let n;
    if ('axis' in c) {
      const boxes = Object.fromEntries(Object.entries(parts).map(([side, p]) => [side, p.box]));
      const touch = /** @type {{axis: number, face: import('./types.js').Box}} */ (c);
      n = fastenerCount(sched.entry, touch.axis, touch.face, boxes, throughSheet);
    } else {
      n = fastenerCountSolid(sched.entry, /** @type {{normal: import('./solids.js').V, face: import('./solids.js').V[]}} */ (c), parts, throughSheet);
    }
    if (n.count === null) {
      errors.push(`${jwhere}: ${sched.source}: ${n.reason}`);
      return;
    }
    out.push({
      id: jid,
      type: jtype,
      parts: refs,
      stage: workshop ? 'workshop' : 'site',
      fasteners: { item: sched.entry.fastener, count: n.count },
    });
  });
  return { joints: errors.length ? null : out, errors };
}
