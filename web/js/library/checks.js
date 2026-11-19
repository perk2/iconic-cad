// Checks on an assembled set of parts and joints: what the builder checks
// on baked implementations (_check_clear) and the tests check on compiled
// modules, for derived modules at design time. Pure.

import { contact, intersects, longAxis } from './geometry.js';
import { MIN_NAILABLE } from './framing.js';

/** @typedef {import('./types.js').Part} Part */

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
      if (intersects(a.box, b.box)) {
        problems.push(`part '${a.id}' overlaps part '${b.id}'`);
        continue;
      }
      if (a.layer && b.layer) continue;
      const c = contact(a.box, b.box);
      if (c.axis === null) continue;
      if (joined.has([a.id, b.id].sort().join('|'))) continue;
      if (a.layer || b.layer) {
        if (exemptLayerTouch) continue;
        const sizes = [0, 1, 2].filter(k => k !== c.axis).map(k => c.face.max[k] - c.face.min[k]);
        if (Math.min(...sizes) < MIN_NAILABLE) continue;
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
    if (intersects(a.box, b.box)) {
      problems.push(`part '${a.id}' overlaps part '${b.id}'`);
      return;
    }
    if (a.layer || b.layer) return;
    const c = contact(a.box, b.box);
    if (c.axis === null) return;
    if (longAxis(a.box) === c.axis && longAxis(b.box) === c.axis) return;
    if (!joined.has([a.id, b.id].sort().join('|'))) problems.push(`part '${a.id}' touches part '${b.id}' with no joint`);
  };
  for (let i = 0; i < added.length; i++) {
    for (const b of existing) check(added[i], b);
    for (const b of added.slice(i + 1)) check(added[i], b);
  }
  return problems;
}
