// Shared code for framed-module compilers.
// Pure: nothing here knows a module, a system or a file. Boxes are
// {min: [x, y, z], max: [x, y, z]} in the module's coordinates.

/** @typedef {import('./types.js').Box} Box */
/** @typedef {import('./types.js').Rect} Rect */
/** @typedef {import('./types.js').Part} Part */

// A sheet is joined to a framing member when they overlap by more than this
// (mm) in the sheet's plane; the touch check uses the same.
export const MIN_OVERLAP = 1;
// A sheet piece narrower than this (mm), or a contact narrower than this in
// either direction, can't be fastened.
export const MIN_NAILABLE = 20;

/** @returns {Box} */
export function box(/** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ z0,
  /** @type {number} */ x1, /** @type {number} */ y1, /** @type {number} */ z1) {
  return { min: [x0, y0, z0], max: [x1, y1, z1] };
}

/** value / 2 (JS numbers don't tell whole numbers from others). */
export function half(/** @type {number} */ value) {
  return value / 2;
}

/**
 * How far two boxes overlap on one axis (negative for a gap).
 * @param {Box} a
 * @param {Box} b
 * @param {number} axis
 */
export function overlap(a, b, axis) {
  return Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]);
}

/**
 * The boxes overlap by more than MIN_OVERLAP on each of the axes.
 * @param {Box} a
 * @param {Box} b
 * @param {number[]} axes
 */
export function overlaps(a, b, axes) {
  return axes.every(i => overlap(a, b, i) > MIN_OVERLAP);
}

/**
 * a lies against b across the normal axis.
 * @param {Box} a
 * @param {Box} b
 * @param {number} normal
 */
export function faceToFace(a, b, normal) {
  const others = [0, 1, 2].filter(i => i !== normal);
  return overlaps(a, b, others) && (a.max[normal] === b.min[normal] || a.min[normal] === b.max[normal]);
}

/**
 * a lies against b across the normal axis, with a contact at least
 * MIN_NAILABLE wide in both directions of the face.
 * @param {Box} a
 * @param {Box} b
 * @param {number} normal
 */
export function nailable(a, b, normal) {
  const others = [0, 1, 2].filter(i => i !== normal);
  return faceToFace(a, b, normal) && others.every(i => overlap(a, b, i) >= MIN_NAILABLE);
}

/**
 * start, start + step, ... below stop.
 * @param {number} start
 * @param {number} stop
 * @param {number} step
 */
export function steps(start, stop, step) {
  const out = [];
  for (let value = start; value < stop; value += step) out.push(value);
  return out;
}

/**
 * @param {{id: string, grade: string}} lumber
 * @param {string} partId
 * @param {string} role
 * @param {Box} box_
 * @param {string} stage
 * @returns {Part}
 */
export function lumberPart(lumber, partId, role, box_, stage) {
  return { id: partId, role, material: `timber ${lumber.grade}`, catalog: lumber.id, box: box_, stage };
}

/**
 * Whole sheets laid from the bottom-left, cut at the edges, column by column.
 * @param {number} width
 * @param {number} height
 * @param {number} sheetW
 * @param {number} sheetH
 * @returns {Rect[]}
 */
export function sheetRects(width, height, sheetW, sheetH) {
  /** @type {Rect[]} */
  const out = [];
  for (const u0 of steps(0, width, sheetW)) {
    for (const v0 of steps(0, height, sheetH)) {
      out.push([u0, v0, Math.min(u0 + sheetW, width), Math.min(v0 + sheetH, height)]);
    }
  }
  return out;
}

/**
 * A rectangle minus a hole: up to four rectangles, the bands below and
 * above the hole at full width, then left and right of it between them;
 * strips too narrow to fasten are left out.
 * @param {Rect} rect
 * @param {Rect} hole
 * @returns {Rect[]}
 */
export function minus(rect, hole) {
  const [u0, v0, u1, v1] = rect;
  const [h0, k0, h1, k1] = hole;
  if (h0 >= u1 || h1 <= u0 || k0 >= v1 || k1 <= v0) return [rect];
  /** @type {Rect[]} */
  const out = [];
  if (k0 > v0) out.push([u0, v0, u1, k0]);
  if (k1 < v1) out.push([u0, k1, u1, v1]);
  const a = Math.max(v0, k0), b = Math.min(v1, k1);
  if (h0 > u0) out.push([u0, a, h0, b]);
  if (h1 < u1) out.push([h1, a, u1, b]);
  return out.filter(r => r[2] - r[0] >= MIN_NAILABLE && r[3] - r[1] >= MIN_NAILABLE);
}
