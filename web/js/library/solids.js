// Sloped parts: a part's box in its own frame, turned to any angle, with
// plane cuts and notches (hut/design/ic_lib_roof.md, 4.1). Pure.
//
// A part with none of frame, cuts or notches is an axis-aligned box and
// keeps using geometry.js; this file is for the others (rafters). A solid
// is a list of convex pieces: the box clipped by the cuts, minus each notch
// (a box, split into convex pieces around it). Overlap is the separating-
// axis test between pieces; contact is two coplanar, opposite faces that
// share an area.
//
//   frame   {origin: [x, y, z], axes: [ex, ey, ez]}: where the part's local
//           x, y, z axes point in its parent's coordinates (unit vectors,
//           right-handed); a local point p is origin + p0 ex + p1 ey + p2 ez
//   cuts    [{normal, point}] in the local frame: the side the normal points
//           to is cut away (a plumb cut, a seat cut, a tail cut)
//   notches in the local frame: convex regions cut out (a birdsmouth: below
//           the seat and inside the heel), each {planes: [{normal, point}]}
//           with the normals pointing out of the region, or a box {min, max}

import { TOUCH_MM } from './geometry.js';

/** @typedef {import('./types.js').Box} Box */
/** @typedef {[number, number, number]} V */
/** @typedef {{origin: number[], axes: number[][]}} Frame */
/** @typedef {{normal: number[], point: number[]}} Cut */
/** @typedef {Box | {planes: Cut[]}} Notch */
/** @typedef {{box: Box, frame?: Frame, cuts?: Cut[], notches?: Notch[]}} Shape */
/** @typedef {{normal: V, d: number, verts: V[]}} Face  a convex polygon, verts counter-clockwise seen from outside */
/** @typedef {Face[]} Piece */

const EPS = 1e-9;
// Two faces are opposite when their normals' dot product is below this.
const OPPOSITE = -1 + 1e-9;

/** @returns {V} */
const add = (/** @type {number[]} */ a, /** @type {number[]} */ b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** @returns {V} */
const sub = (/** @type {number[]} */ a, /** @type {number[]} */ b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** @returns {V} */
const scale = (/** @type {number} */ k, /** @type {number[]} */ a) => [k * a[0], k * a[1], k * a[2]];
const dot = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** @returns {V} */
const cross = (/** @type {number[]} */ a, /** @type {number[]} */ b) => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (/** @type {number[]} */ a) => Math.sqrt(dot(a, a));
/** @returns {V} */
const unit = (/** @type {number[]} */ a) => scale(1 / norm(a), a);

/** The part is sloped or cut: it needs this file, not geometry.js. */
export function isSolid(/** @type {Partial<Shape>} */ part) {
  return !!(part.frame || part.cuts?.length || part.notches?.length);
}

/**
 * Problems with a shape's frame, cuts and notches (empty if fine).
 * @param {Shape} shape
 * @returns {string[]}
 */
export function shapeProblems(shape) {
  /** @type {string[]} */
  const out = [];
  const vec = (/** @type {unknown} */ v) => Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x));
  if (shape.frame) {
    const { origin, axes } = shape.frame;
    if (!vec(origin) || !Array.isArray(axes) || axes.length !== 3 || !axes.every(vec)) {
      out.push('frame: expected {origin: [x, y, z], axes: [three vectors]}');
    } else {
      const unitLength = axes.every(a => Math.abs(norm(a) - 1) < 1e-6);
      const square = Math.abs(dot(axes[0], axes[1])) < 1e-6 && Math.abs(dot(axes[1], axes[2])) < 1e-6 && Math.abs(dot(axes[0], axes[2])) < 1e-6;
      if (!unitLength || !square) out.push('frame: the axes must be unit vectors at right angles');
      else if (dot(cross(axes[0], axes[1]), axes[2]) < 0) out.push('frame: the axes must be right-handed');
    }
  }
  for (const c of shape.cuts ?? []) {
    if (!vec(c.normal) || !vec(c.point) || norm(c.normal) < EPS) out.push('cuts: expected {normal, point}, the normal not zero');
  }
  for (const n of shape.notches ?? []) {
    if ('planes' in n) {
      if (!Array.isArray(n.planes) || n.planes.length < 1 || !n.planes.every(c => vec(c.normal) && vec(c.point) && norm(c.normal) >= EPS)) {
        out.push('notches: expected {planes: [{normal, point}]}, the normals not zero');
      }
    } else if (!vec(n.min) || !vec(n.max) || ![0, 1, 2].every(i => n.min[i] < n.max[i])) {
      out.push('notches: expected {planes} or a box with min below max');
    }
  }
  return out;
}

// ---- convex pieces ------------------------------------------------------------

/** The box as a convex piece (faces outward, counter-clockwise). */
function boxPiece(/** @type {Box} */ b) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  /** @type {Array<[V, V[]]>} */
  const faces = [
    [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
    [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
    [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
    [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
    [[0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]],
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
  ];
  return faces.map(([normal, verts]) => ({ normal, d: dot(normal, verts[0]), verts }));
}

/**
 * The piece's part on the side dot(n, p) <= d of the plane (n a unit
 * vector), or null if nothing is left with any volume.
 * @param {Piece} piece
 * @param {V} n
 * @param {number} d
 * @returns {Piece | null}
 */
function clip(piece, n, d) {
  /** @type {Piece} */
  const out = [];
  /** @type {V[]} */
  const onPlane = [];
  for (const face of piece) {
    /** @type {V[]} */
    const verts = [];
    const k = face.verts.length;
    for (let i = 0; i < k; i++) {
      const p = face.verts[i], q = face.verts[(i + 1) % k];
      const dp = dot(n, p) - d, dq = dot(n, q) - d;
      if (dp <= EPS) verts.push(p);
      if (dp <= EPS && Math.abs(dp) <= EPS) onPlane.push(p);
      if ((dp < -EPS && dq > EPS) || (dp > EPS && dq < -EPS)) {
        const x = add(p, scale(dp / (dp - dq), sub(q, p)));
        verts.push(x);
        onPlane.push(x);
      }
    }
    if (verts.length >= 3) out.push({ normal: face.normal, d: face.d, verts });
  }
  const cap = polygonOnPlane(onPlane, n);
  if (cap.length >= 3) out.push({ normal: n, d, verts: cap });
  if (out.length < 4) return null;
  return volume(out) > EPS ? out : null;
}

/** Distinct points on a plane with normal n, counter-clockwise about n. */
function polygonOnPlane(/** @type {V[]} */ points, /** @type {V} */ n) {
  /** @type {V[]} */
  const uniq = [];
  for (const p of points) if (!uniq.some(q => norm(sub(p, q)) <= 1e-7)) uniq.push(p);
  if (uniq.length < 3) return [];
  const c = scale(1 / uniq.length, uniq.reduce((s, p) => add(s, p), [0, 0, 0]));
  const u = unit(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]));
  const v = cross(n, u);
  return uniq.map(p => ({ p, a: Math.atan2(dot(sub(p, c), v), dot(sub(p, c), u)) }))
    .sort((x, y) => x.a - y.a).map(x => x.p);
}

/** The piece's volume (divergence theorem over its faces). */
function volume(/** @type {Piece} */ piece) {
  let v = 0;
  for (const f of piece) {
    const p0 = f.verts[0];
    for (let i = 1; i + 1 < f.verts.length; i++) v += dot(p0, cross(f.verts[i], f.verts[i + 1])) / 6;
  }
  return v;
}

/** Every vertex of a piece, once. */
function vertices(/** @type {Piece} */ piece) {
  /** @type {V[]} */
  const out = [];
  for (const f of piece) for (const p of f.verts) if (!out.some(q => norm(sub(p, q)) <= 1e-7)) out.push(p);
  return out;
}

/** A notch's bounding planes as dot(n, p) <= d, n outward (unit). */
function notchPlanes(/** @type {Notch} */ hole) {
  if ('planes' in hole) return hole.planes.map(c => { const n = unit(c.normal); return /** @type {[V, number]} */ ([n, dot(n, c.point)]); });
  return /** @type {Array<[V, number]>} */ ([
    [[-1, 0, 0], -hole.min[0]], [[1, 0, 0], hole.max[0]],
    [[0, -1, 0], -hole.min[1]], [[0, 1, 0], hole.max[1]],
    [[0, 0, -1], -hole.min[2]], [[0, 0, 1], hole.max[2]],
  ]);
}

/** The convex piece minus a convex notch: convex pieces around it, one per plane at most. */
function minusNotch(/** @type {Piece} */ piece, /** @type {Notch} */ hole) {
  const planes = notchPlanes(hole);
  /** @type {Piece[]} */
  const out = [];
  /** @type {Piece | null} */
  let inside = piece;
  for (const [n, d] of planes) {
    if (!inside) break;
    const outside = clip(inside, scale(-1, n), -d);
    if (outside) out.push(outside);
    inside = clip(inside, n, d);
  }
  return out;
}

/**
 * The shape's convex pieces in its parent's coordinates.
 * @param {Shape} shape
 * @returns {Piece[]}
 */
export function pieces(shape) {
  /** @type {Piece | null} */
  let base = boxPiece(shape.box);
  for (const c of shape.cuts ?? []) {
    if (!base) break;
    const n = unit(c.normal);
    base = clip(base, n, dot(n, c.point));
  }
  /** @type {Piece[]} */
  let parts = base ? [base] : [];
  for (const hole of shape.notches ?? []) parts = parts.flatMap(p => minusNotch(p, hole));
  const f = shape.frame;
  if (!f) return parts;
  const to = (/** @type {number[]} */ p) => add(f.origin, add(scale(p[0], f.axes[0]), add(scale(p[1], f.axes[1]), scale(p[2], f.axes[2]))));
  const turn = (/** @type {number[]} */ v) => add(scale(v[0], f.axes[0]), add(scale(v[1], f.axes[1]), scale(v[2], f.axes[2])));
  return parts.map(piece => piece.map(face => {
    const verts = face.verts.map(to);
    const normal = turn(face.normal);
    return { normal, d: dot(normal, verts[0]), verts };
  }));
}

/**
 * The shape's bounding box in its parent's coordinates.
 * @param {Shape} shape
 * @returns {Box}
 */
export function boundingBox(shape) {
  const all = pieces(shape).flatMap(vertices);
  return {
    min: [0, 1, 2].map(i => Math.min(...all.map(p => p[i]))),
    max: [0, 1, 2].map(i => Math.max(...all.map(p => p[i]))),
  };
}

/**
 * The part's long axis as a unit vector in its parent's coordinates (its
 * box's longest side, turned by its frame), or null if two sides tie; with
 * exclude (a unit vector), the longest side not parallel to it.
 * @param {Shape} shape
 * @param {number[] | null} [exclude]
 * @returns {V | null}
 */
export function longAxisVector(shape, exclude = null) {
  const sizes = [0, 1, 2].map(i => shape.box.max[i] - shape.box.min[i]);
  /** @type {V[]} */
  const dirs = shape.frame ? shape.frame.axes.map(a => /** @type {V} */ ([a[0], a[1], a[2]])) : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const axes = [0, 1, 2].filter(i => !exclude || Math.abs(dot(dirs[i], exclude)) < 1 - 1e-6);
  const longest = Math.max(...axes.map(i => sizes[i]));
  const at = axes.filter(i => Math.abs(sizes[i] - longest) <= 1e-9);
  return at.length === 1 ? dirs[at[0]] : null;
}

// ---- overlap and contact ------------------------------------------------------

/** How deep two convex pieces overlap (the least over separating axes; <= 0 apart). */
function penetration(/** @type {Piece} */ a, /** @type {Piece} */ b) {
  const va = vertices(a), vb = vertices(b);
  /** @type {V[]} */
  const axes = [];
  const addAxis = (/** @type {V} */ v) => {
    const len = norm(v);
    if (len < 1e-9) return;
    const u = scale(1 / len, v);
    if (!axes.some(w => Math.abs(dot(w, u)) > 1 - 1e-9)) axes.push(u);
  };
  for (const f of [...a, ...b]) addAxis(f.normal);
  const edges = (/** @type {Piece} */ piece) => piece.flatMap(f => f.verts.map((p, i) => sub(f.verts[(i + 1) % f.verts.length], p)));
  const ea = edges(a), eb = edges(b);
  for (const e of ea) for (const g of eb) addAxis(cross(e, g));
  let least = Infinity;
  for (const axis of axes) {
    const pa = va.map(p => dot(axis, p)), pb = vb.map(p => dot(axis, p));
    const lap = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
    least = Math.min(least, lap);
    if (least <= 0) return least;
  }
  return least;
}

/**
 * The shapes overlap by more than TOUCH_MM (some pair of pieces does).
 * @param {Shape} a
 * @param {Shape} b
 */
export function solidsIntersect(a, b) {
  const pa = pieces(a), pb = pieces(b);
  return pa.some(p => pb.some(q => penetration(p, q) > TOUCH_MM));
}

/** A convex polygon (verts in a plane with normal n) clipped by another's half-planes. */
function clipPolygon(/** @type {V[]} */ subject, /** @type {V[]} */ by, /** @type {V} */ n) {
  let out = subject;
  const k = by.length;
  for (let i = 0; i < k && out.length; i++) {
    const a = by[i], b = by[(i + 1) % k];
    const inward = cross(n, sub(b, a)); // points into a counter-clockwise polygon
    const side = (/** @type {V} */ p) => dot(inward, sub(p, a));
    /** @type {V[]} */
    const next = [];
    for (let j = 0; j < out.length; j++) {
      const p = out[j], q = out[(j + 1) % out.length];
      const sp = side(p), sq = side(q);
      if (sp >= -EPS) next.push(p);
      if ((sp < -EPS && sq > EPS) || (sp > EPS && sq < -EPS)) next.push(add(p, scale(sp / (sp - sq), sub(q, p))));
    }
    out = next;
  }
  return out;
}

/** A polygon's area (verts counter-clockwise about n). */
function area(/** @type {V[]} */ verts, /** @type {V} */ n) {
  let s = /** @type {V} */ ([0, 0, 0]);
  for (let i = 0; i < verts.length; i++) s = add(s, cross(verts[i], verts[(i + 1) % verts.length]));
  return dot(s, n) / 2;
}

/** The polygon's least width: its smallest extent across any of its edges. */
function width(/** @type {V[]} */ verts, /** @type {V} */ n) {
  let least = Infinity;
  for (let i = 0; i < verts.length; i++) {
    const e = sub(verts[(i + 1) % verts.length], verts[i]);
    if (norm(e) < 1e-9) continue;
    const across = unit(cross(n, e));
    const ps = verts.map(p => dot(across, p));
    least = Math.min(least, Math.max(...ps) - Math.min(...ps));
  }
  return least;
}

/**
 * Where two shapes touch face to face: {normal, face, area}, normal the unit
 * vector out of a toward b, face the shared polygon (the largest, when
 * pieces touch in several places); or {normal: null, reason}. As contact()
 * for boxes: the shared face is at least TOUCH_MM wide, its planes within
 * TOUCH_MM of each other, and the shapes don't overlap.
 * @param {Shape} a
 * @param {Shape} b
 * @returns {{normal: V, face: V[], area: number} | {normal: null, reason: string}}
 */
export function solidContact(a, b) {
  if (solidsIntersect(a, b)) return { normal: null, reason: 'overlap each other' };
  /** @type {{normal: V, face: V[], area: number} | null} */
  let best = null;
  for (const p of pieces(a)) {
    for (const q of pieces(b)) {
      for (const f of p) {
        for (const g of q) {
          if (dot(f.normal, g.normal) > OPPOSITE) continue;
          if (Math.abs(f.d + g.d) > TOUCH_MM) continue;
          // g's polygon, pressed into f's plane and turned to f's winding.
          const flat = g.verts.map(v => sub(v, scale(dot(f.normal, v) - f.d, f.normal))).reverse();
          const shared = clipPolygon(flat, f.verts, f.normal);
          if (shared.length < 3) continue;
          const s = area(shared, f.normal);
          if (s <= 0 || width(shared, f.normal) <= TOUCH_MM) continue;
          if (!best || s > best.area) best = { normal: f.normal, face: shared, area: s };
        }
      }
    }
  }
  return best ?? { normal: null, reason: "don't touch face to face" };
}

/**
 * How long the contact face is along a direction, and where it sits across
 * it relative to a part: {length, onEdge}, onEdge if the face reaches the
 * part's extent across (within TOUCH_MM).
 * @param {V[]} face
 * @param {V} along
 * @param {V} normal
 * @param {Shape} part
 */
export function faceSpan(face, along, normal, part) {
  const ps = face.map(p => dot(along, p));
  const length = Math.max(...ps) - Math.min(...ps);
  const across = unit(cross(normal, along));
  const fa = face.map(p => dot(across, p));
  const ka = pieces(part).flatMap(vertices).map(p => dot(across, p));
  const onEdge = Math.abs(Math.min(...fa) - Math.min(...ka)) <= TOUCH_MM || Math.abs(Math.max(...fa) - Math.max(...ka)) <= TOUCH_MM;
  return { length, onEdge };
}
