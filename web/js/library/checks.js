// Checks on an assembled set of parts and joints: what the builder checks
// on baked implementations (_check_clear) and the tests check on compiled
// modules, for derived modules at design time. Pure.

import { contact, intersects, longAxis } from './geometry.js';
import { MIN_NAILABLE } from './framing.js';
import { isSolid, longAxisVector, solidContact, solidsIntersect } from './solids.js';

/** @typedef {import('./types.js').Part} Part */

// The two parts' overlap and contact, for boxes (geometry.js) or, when
// either is sloped or cut, for solids (solids.js). contact: the face's
// least width, and whether both parts' long axes run across it (end grain
// to end grain); null if they don't touch face to face.
/** @returns {{overlap: true} | {overlap: false, contact: null | {width: number, endGrain: boolean}}} */
function meet(/** @type {Part} */ a, /** @type {Part} */ b) {
  if (!isSolid(a) && !isSolid(b)) {
    if (intersects(a.box, b.box)) return { overlap: true };
    const c = contact(a.box, b.box);
    if (c.axis === null) return { overlap: false, contact: null };
    const axis = c.axis;
    const sizes = [0, 1, 2].filter(k => k !== axis).map(k => c.face.max[k] - c.face.min[k]);
    return { overlap: false, contact: { width: Math.min(...sizes), endGrain: longAxis(a.box) === axis && longAxis(b.box) === axis } };
  }
  if (solidsIntersect(a, b)) return { overlap: true };
  const c = solidContact(a, b);
  if (c.normal === null) return { overlap: false, contact: null };
  const n = c.normal;
  const along = (/** @type {Part} */ part) => { const v = longAxisVector(part); return !!v && Math.abs(v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) > 1 - 1e-6; };
  // The face's least width, from its extent along its own edges' normals.
  let width = Infinity;
  const f = c.face;
  for (let i = 0; i < f.length; i++) {
    const e = [0, 1, 2].map(k => f[(i + 1) % f.length][k] - f[i][k]);
    const across = [n[1] * e[2] - n[2] * e[1], n[2] * e[0] - n[0] * e[2], n[0] * e[1] - n[1] * e[0]];
    const len = Math.hypot(...across);
    if (len < 1e-9) continue;
    const ps = f.map(q => (q[0] * across[0] + q[1] * across[1] + q[2] * across[2]) / len);
    width = Math.min(width, Math.max(...ps) - Math.min(...ps));
  }
  return { overlap: false, contact: { width, endGrain: along(a) && along(b) } };
}

/**
 * Problems with parts and joints: parts that overlap, and parts that touch
 * with no joint between them. Two parts cut from layers (sheets) may touch
 * unjoined; a part cut from a layer may touch framing unjoined only where
 * the contact is too narrow to nail (under MIN_NAILABLE across its face)
 * or when exemptLayerTouch is set (a connection's sheathing strip against
 * end grain, as the builder's implementation check allows).
 * @param {Part[]} parts
 * @param {Array<{parts: Object<string, string>}>} joints  refs are part ids
 * @param {{exemptLayerTouch?: boolean}} [options]
 * @returns {string[]}
 */
export function checkParts(parts, joints, { exemptLayerTouch = false } = {}) {
  /** @type {string[]} */
  const problems = [];
  const joined = new Set(joints.map(j => Object.values(j.parts).slice().sort().join('|')));
  for (let i = 0; i < parts.length; i++) {
    const a = parts[i];
    for (let j = i + 1; j < parts.length; j++) {
      const b = parts[j];
      const m = meet(a, b);
      if (m.overlap) {
        problems.push(`part '${a.id}' overlaps part '${b.id}'`);
        continue;
      }
      if (a.layer && b.layer) continue;
      if (!m.contact) continue;
      if (joined.has([a.id, b.id].sort().join('|'))) continue;
      if (a.layer || b.layer) {
        if (exemptLayerTouch) continue;
        if (m.contact.width < MIN_NAILABLE) continue;
      }
      problems.push(`part '${a.id}' touches part '${b.id}' with no joint`);
    }
  }
  return problems;
}


/**
 * Problems with parts added to a model (a derived module's): an added part
 * that overlaps any part, or touches another part with no joint between
 * them. Exempt: touches involving a sheet layer (sheets are joined where
 * they can be nailed), and two parts meeting end grain to end grain (pieces
 * of one member butting, as the upper plate's pieces over a stud).
 * @param {Part[]} added
 * @param {Part[]} existing
 * @param {Array<{parts: Object<string, string>}>} joints  refs are part ids
 * @returns {string[]}
 */
export function checkAdded(added, existing, joints) {
  /** @type {string[]} */
  const problems = [];
  const joined = new Set(joints.map(j => Object.values(j.parts).slice().sort().join('|')));
  const check = (/** @type {Part} */ a, /** @type {Part} */ b) => {
    const m = meet(a, b);
    if (m.overlap) {
      problems.push(`part '${a.id}' overlaps part '${b.id}'`);
      return;
    }
    if (a.layer || b.layer) return;
    if (!m.contact || m.contact.endGrain) return;
    if (!joined.has([a.id, b.id].sort().join('|'))) problems.push(`part '${a.id}' touches part '${b.id}' with no joint`);
  };
  for (let i = 0; i < added.length; i++) {
    for (const b of existing) check(added[i], b);
    for (const b of added.slice(i + 1)) check(added[i], b);
  }
  return problems;
}
