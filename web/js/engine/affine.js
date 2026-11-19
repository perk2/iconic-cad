// Rigid placements as affine maps: p -> m * p + t, with m a 3x3 matrix (rows)
// and t a translation. Used by the engine to place entities and parts.
//
// A port frame (origin, normal, along, across) is the map from port
// coordinates [normal, along, across] to module coordinates: its matrix has
// normal, along and across as columns. A frame may be mirrored (a left end),
// so these maps are not always rotations; an entity's world transform is
// always a rotation, which the engine checks.

/** @typedef {{m: number[][], t: number[]}} Affine */
/** @typedef {{min: number[], max: number[]}} Box */

export const FRAME_AXES = /** @type {const} */ (['normal', 'along', 'across']);

export const IDENTITY = Object.freeze({
  m: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  t: [0, 0, 0],
});

const clean = (/** @type {number} */ v) => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) + 0 : v);

/**
 * @param {{origin: number[], normal: number[], along: number[], across: number[]}} frame
 * @returns {Affine}
 */
export function fromFrame(frame) {
  const cols = FRAME_AXES.map(key => frame[key]);
  return {
    m: [0, 1, 2].map(i => cols.map(col => col[i])),
    t: [...frame.origin],
  };
}

/**
 * @param {Affine} a
 * @param {number[]} p
 */
export function apply(a, p) {
  return a.m.map((row, i) => clean(row[0] * p[0] + row[1] * p[1] + row[2] * p[2] + a.t[i]));
}

/**
 * @param {{m: number[][]}} a
 * @param {number[]} v
 */
function applyLinear(a, v) {
  return a.m.map(row => clean(row[0] * v[0] + row[1] * v[1] + row[2] * v[2]));
}

/**
 * compose(a, b) is the map p -> a(b(p)).
 * @param {Affine} a
 * @param {Affine} b
 * @returns {Affine}
 */
export function compose(a, b) {
  const m = [0, 1, 2].map(i => [0, 1, 2].map(j =>
    clean(a.m[i][0] * b.m[0][j] + a.m[i][1] * b.m[1][j] + a.m[i][2] * b.m[2][j])));
  return { m, t: apply(a, b.t) };
}

/**
 * Inverse of a map whose matrix is orthogonal (rotations and mirrors).
 * @param {Affine} a
 * @returns {Affine}
 */
export function invert(a) {
  const m = [0, 1, 2].map(i => [0, 1, 2].map(j => a.m[j][i]));
  const t = applyLinear({ m }, a.t).map(v => clean(-v));
  return { m, t };
}

/** @param {Affine} a */
export function det(a) {
  const [r0, r1, r2] = a.m;
  return r0[0] * (r1[1] * r2[2] - r1[2] * r2[1])
    - r0[1] * (r1[0] * r2[2] - r1[2] * r2[0])
    + r0[2] * (r1[0] * r2[1] - r1[1] * r2[0]);
}

/**
 * A box {min, max} mapped by a, as an axis-aligned box again.
 * @param {Affine} a
 * @param {Box} box
 * @returns {Box}
 */
export function applyBox(a, box) {
  /** @type {number[][]} */
  const points = [];
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) points.push(apply(a, [x, y, z]));
    }
  }
  return {
    min: [0, 1, 2].map(i => Math.min(...points.map(p => p[i]))),
    max: [0, 1, 2].map(i => Math.max(...points.map(p => p[i]))),
  };
}

/**
 * Rotation about z, then a shift. The engine only allows multiples of 90
 * degrees, so applyBox stays exact.
 * @param {number[]} position
 * @param {number} facingDegrees
 * @returns {Affine}
 */
export function placement(position, facingDegrees) {
  const r = (facingDegrees * Math.PI) / 180;
  const c = clean(Math.cos(r));
  const s = clean(Math.sin(r));
  return { m: [[c, -s, 0], [s, c, 0], [0, 0, 1]], t: [...position] };
}

/**
 * Largest difference between two maps: translation distance, and whether the matrices agree.
 * @param {Affine} a
 * @param {Affine} b
 */
export function difference(a, b) {
  const gap = Math.hypot(...a.t.map((v, i) => v - b.t[i]));
  const turned = a.m.some((row, i) => row.some((v, j) => Math.abs(v - b.m[i][j]) > 1e-9));
  return { gap, turned };
}
