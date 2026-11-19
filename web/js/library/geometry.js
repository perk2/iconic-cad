// Boxes and contacts: contact, long axis.
// Pure: no files, no page.

/** @typedef {import('./types.js').Box} Box */

// Two parts touch when their boxes meet within this distance (mm) on one
// axis and overlap by more than it on the other two.
export const TOUCH_MM = 1;
export const TOLERANCE = 1e-9;
// Rounding noise in transformed boxes (mm), absorbed when counting fasteners.
export const ROUND_MM = 1e-6;

/**
 * How far two boxes overlap on each axis (negative for a gap).
 * @param {Box} a
 * @param {Box} b
 * @returns {number[]}
 */
export function overlaps3(a, b) {
  return [0, 1, 2].map(i => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]));
}

/**
 * The boxes overlap by more than TOUCH_MM on all three axes.
 * @param {Box} a
 * @param {Box} b
 */
export function intersects(a, b) {
  return overlaps3(a, b).every(o => o > TOUCH_MM);
}

/**
 * Where two boxes touch face to face: {axis, face}, face the overlap box
 * (flat or nearly flat on axis); or {axis: null, reason}.
 * @param {Box} a
 * @param {Box} b
 * @returns {{axis: number, face: Box} | {axis: null, reason: string}}
 */
export function contact(a, b) {
  const overlap = overlaps3(a, b);
  if (overlap.every(o => o > TOUCH_MM)) return { axis: null, reason: 'overlap each other' };
  const meets = [0, 1, 2].filter(i => Math.abs(overlap[i]) <= TOUCH_MM);
  const others = [0, 1, 2].filter(i => !meets.includes(i));
  if (meets.length !== 1 || others.some(i => overlap[i] <= TOUCH_MM)) {
    return { axis: null, reason: "don't touch face to face" };
  }
  const face = {
    min: [0, 1, 2].map(i => Math.max(a.min[i], b.min[i])),
    max: [0, 1, 2].map(i => Math.min(a.max[i], b.max[i])),
  };
  return { axis: meets[0], face };
}

/**
 * The axis along which a box is longest, or null if two axes tie; with
 * exclude, the longest of the other two.
 * @param {Box} box
 * @param {number | null} [exclude]
 * @returns {number | null}
 */
export function longAxis(box, exclude = null) {
  const sizes = [0, 1, 2].map(i => box.max[i] - box.min[i]);
  const axes = [0, 1, 2].filter(i => i !== exclude);
  const longest = Math.max(...axes.map(i => sizes[i]));
  if (axes.filter(i => Math.abs(sizes[i] - longest) <= TOLERANCE).length > 1) return null;
  return /** @type {number} */ (axes.find(i => sizes[i] === longest));
}

/**
 * A number in 6 significant digits with no trailing zeros (as printf's %g),
 * for messages.
 * @param {number} x
 */
export function fmtG(x) {
  if (x === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(x)));
  if (exp < -4 || exp >= 6) {
    const [m, e] = x.toExponential(5).split('e');
    const mant = m.includes('.') ? m.replace(/\.?0+$/, '') : m;
    const n = Number(e);
    return `${mant}e${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`;
  }
  return String(Number(x.toPrecision(6)));
}
