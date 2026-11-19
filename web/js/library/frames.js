// Port frames: into and out of a frame, and its hand. A frame is {origin, normal, along, across}; coordinates in it
// are [normal, along, across].

/** @typedef {import('./types.js').Box} Box */
/** @typedef {{origin: number[], normal: number[], along: number[], across: number[]}} Frame */

const AXES = /** @type {const} */ (['normal', 'along', 'across']);
const corners = (/** @type {Box} */ b) => {
  /** @type {number[][]} */
  const out = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
};
const bounds = (/** @type {number[][]} */ points) => ({
  min: [0, 1, 2].map(i => Math.min(...points.map(p => p[i]))),
  max: [0, 1, 2].map(i => Math.max(...points.map(p => p[i]))),
});
const dot = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a.reduce((n, v, i) => n + v * b[i], 0);

/**
 * A box in module coordinates, in a port frame.
 * @param {Box} b
 * @param {Frame} frame
 * @returns {Box}
 */
export function toFrame(b, frame) {
  return bounds(corners(b).map(c => AXES.map(key => dot(c.map((v, i) => v - frame.origin[i]), frame[key]))));
}

/**
 * A box given in a frame's coordinates, in the coordinates the frame is written in.
 * @param {Box} b
 * @param {Frame} frame
 * @returns {Box}
 */
export function fromFrame(b, frame) {
  return bounds(corners(b).map(c => frame.origin.map((o, i) => o + AXES.reduce((n, key, k) => n + c[k] * frame[key][i], 0))));
}

/**
 * right when normal, across, along form a right-handed frame, else left.
 * @param {Frame} frame
 */
export function portHand(frame) {
  const [a, b, c] = [frame.normal, frame.across, frame.along];
  const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  return det > 0 ? 'right' : 'left';
}
