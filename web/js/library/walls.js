// Shared code of the wall compilers:
// stud positions, unbacked sheet edges and the WallPanel being compiled.

import { MIN_OVERLAP, box, half, lumberPart, minus, nailable, sheetRects } from './framing.js';
import { fmtG } from './geometry.js';

/** @typedef {import('./types.js').Rect} Rect */

/**
 * x0 of a plain panel's studs, left to right: an end stud at each end and
 * studs at the spacing from the left end, centred on it, left out where
 * they would overlap an end stud. k is null for the end studs.
 * @param {number} width
 * @param {number} spacing
 * @param {number} thick
 * @returns {Array<[number | null, number]>}
 */
export function studPositions(width, spacing, thick) {
  /** @type {Array<[number | null, number]>} */
  const out = [[null, 0]];
  for (let k = 1; k * spacing < width; k++) {
    const x0 = k * spacing - half(thick);
    if (x0 >= thick && x0 + thick <= width - thick) out.push([k, x0]);
  }
  out.push([null, width - thick]);
  return out;
}

/**
 * The sheet edges with no framing behind them: [edge, a, b], edge "x 1200"
 * or "z 790" and a to b the stretch along it. Cuts between pieces of one
 * sheet (same key) and seams between rows of sheets are not checked.
 * @param {Array<[Rect, *]>} pieces  [rect, key of the whole sheet]
 * @param {Rect[]} members  framing, in the sheets' plane
 * @param {number} rowHeight
 * @param {number} height
 * @returns {Array<[string, number, number]>}
 */
export function unbackedEdges(pieces, members, rowHeight, height) {
  /** @type {Array<[string, number, number]>} */
  const out = [];
  const eps = 1e-6;
  for (const [rect, key] of pieces) {
    const [u0, v0, u1, v1] = rect;
    const others = pieces.filter(([r, k]) => k === key && !(r[0] === u0 && r[1] === v0 && r[2] === u1 && r[3] === v1))
      .map(([r]) => r);
    /** @type {Array<[string, number, number, number]>} */
    const edges = [['x', u0, v0, v1], ['x', u1, v0, v1], ['z', v0, u0, u1], ['z', v1, u0, u1]];
    for (const [axis, coord, a, b] of edges) {
      if (axis === 'z' && eps < coord && coord < height - eps
          && Math.abs(coord / rowHeight - Math.round(coord / rowHeight)) < eps) continue;
      /** @type {Array<[number, number]>} */
      const backed = [];
      for (const [r0, s0, r1, s1] of others) {
        if (axis === 'x' && (Math.abs(r1 - coord) < eps || Math.abs(r0 - coord) < eps)) backed.push([s0, s1]);
        else if (axis === 'z' && (Math.abs(s1 - coord) < eps || Math.abs(s0 - coord) < eps)) backed.push([r0, r1]);
      }
      for (const [m0, n0, m1, n1] of members) {
        const [lo, hi, c0, c1] = axis === 'x' ? [n0, n1, m0, m1] : [m0, m1, n0, n1];
        if (c0 - eps <= coord && coord <= c1 + eps) backed.push([lo, hi]);
      }
      backed.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      let at = a;
      for (const [lo, hi] of backed) {
        if (lo > at + MIN_OVERLAP && at < b) out.push([`${axis} ${fmtG(coord)}`, at, Math.min(lo, b)]);
        at = Math.max(at, hi);
      }
      if (at < b - MIN_OVERLAP) out.push([`${axis} ${fmtG(coord)}`, at, b]);
    }
  }
  return out;
}

/**
 * The build-up's workshop layers on faces A and B; each must be a catalog
 * sheet. Face A layers are listed outward from the framing.
 * @param {any} buildup
 * @returns {[any[], any[]]}
 */
export function workshopLayers(buildup) {
  const faceA = buildup.face_a.filter((/** @type {any} */ l) => l.stage === 'workshop');
  const faceB = buildup.face_b.filter((/** @type {any} */ l) => l.stage === 'workshop');
  for (const layer of [...faceA, ...faceB]) {
    if (!layer.sheet) throw new Error(`workshop layer '${layer.role}' must be a catalog sheet`);
  }
  return [faceA, faceB];
}

/**
 * @param {any} params
 * @param {string[]} names
 */
export function checkPositive(params, names) {
  for (const name of names) if (params[name] <= 0) throw new Error(`${name} must be positive`);
}

/**
 * A wall panel being compiled: its sizes, parts and joints. Wall coordinates, in mm: origin at the
 * exterior face, bottom-left seen from outside; x along the run, y into the
 * wall, z up. Ports sit on the framing's outer face (y = the face A
 * workshop layers' thickness).
 */
export class WallPanel {
  /** @param {any} params */
  constructor(params) {
    this.width = params.width;
    this.height = params.height;
    this.spacing = params.spacing;
    this.lumber = params.stud;
    /** @type {number} */
    this.thick = this.lumber.section[0]; // 48: along the run
    /** @type {number} */
    this.deep = this.lumber.section[1]; // 148: into the wall
    const [faceA, faceB] = workshopLayers(params.buildup);
    /** @type {any[]} */
    this.faceA = faceA;
    /** @type {any[]} */
    this.faceB = faceB;
    const sum = (/** @type {any[]} */ layers) => layers.reduce((n, l) => n + l.thickness, 0);
    this.y0 = sum(faceA);
    this.y1 = this.y0 + this.deep;
    this.depth = this.y1 + sum(faceB);
    /** @type {any[]} */
    this.parts = [];
    /** @type {Array<{type: string, parts: Object<string, string>}>} */
    this.joints = [];
  }

  /**
   * A workshop lumber part over the framing depth (or y0 to y1).
   * @param {string} id
   * @param {string} role
   * @param {number} x0
   * @param {number} z0
   * @param {number} x1
   * @param {number} z1
   * @param {{lumber?: any, y0?: number, y1?: number}} [opts]
   */
  lumberPart(id, role, x0, z0, x1, z1, { lumber, y0, y1 } = {}) {
    const part = lumberPart(lumber ?? this.lumber, id, role,
      box(x0, y0 ?? this.y0, z0, x1, y1 ?? this.y1, z1), 'workshop');
    this.parts.push(part);
    return part;
  }

  /**
   * @param {string} type
   * @param {Object<string, string>} parts
   */
  joint(type, parts) {
    this.joints.push({ type, parts });
  }

  /**
   * The bottom plate (unless bottom is false) and the lower top plate over
   * the full width, lying flat. The upper top plate is fitted on site along
   * the wall line, so the panel's framing stops one plate below its height.
   * @param {{bottom?: boolean}} [opts]
   * @returns {{bottom?: any, lower: any}}
   */
  plates({ bottom = true } = {}) {
    const t = this.thick, w = this.width, h = this.height;
    /** @type {{bottom?: any, lower: any}} */
    const made = { lower: null };
    if (bottom) made.bottom = this.lumberPart('bottom_plate', 'bottom_plate', 0, 0, w, t);
    made.lower = this.lumberPart('top_plate_lower', 'top_plate', 0, h - 2 * t, w, h - t);
    return made;
  }

  /** Intermediate stud positions: [k, x0] for k * spacing below the width. */
  grid() {
    /** @type {Array<[number, number]>} */
    const out = [];
    for (let k = 1; k * this.spacing < this.width; k++) out.push([k, k * this.spacing - half(this.thick)]);
    return out;
  }

  /**
   * Lay the workshop sheets on both faces and join each piece to the framing
   * it lies against; a cut sheet is described as rectangles, each carrying
   * the whole sheet's id. Every sheet edge must have framing behind it.
   * @param {any[]} framingParts
   * @param {import('./types.js').Rect | null} [hole]
   */
  sheets(framingParts, hole = null) {
    /** @type {Array<[any[], boolean, number, string]>} */
    const faces = [[this.faceA, true, this.y0, 'a'], [this.faceB, false, this.y1, 'b']];
    for (const [layers, outward, start, prefix] of faces) {
      let y = start;
      layers.forEach((layer, i) => {
        const index = i + 1;
        const sheet = layer.sheet;
        const t = layer.thickness;
        const [y0, y1] = outward ? [y - t, y] : [y, y + t];
        y = outward ? y0 : y1;
        let n = 0;
        /** @type {Array<[import('./types.js').Rect, number]>} */
        const laid = [];
        sheetRects(this.width, this.height, sheet.size[0], sheet.size[1]).forEach((rect, j) => {
          const m = j + 1;
          const pieces = hole ? minus(rect, hole) : [rect];
          const cut = !(pieces.length === 1 && pieces[0].every((v, k) => v === rect[k]));
          for (const [x0, z0, x1, z1] of pieces) {
            n += 1;
            /** @type {any} */
            const part = {
              id: `${prefix}${index}_${layer.role}_${n}`, role: layer.role, layer: layer.role,
              material: sheet.material, catalog: sheet.id, box: box(x0, y0, z0, x1, y1, z1), stage: 'workshop',
            };
            if (cut) part.sheet = `${prefix}${index}_${layer.role}_sheet_${m}`;
            this.parts.push(part);
            laid.push([[x0, z0, x1, z1], m]);
            for (const member of framingParts) {
              if (nailable(part.box, member.box, 1)) this.joint('sheathing_to_framing', { sheet: part.id, framing: member.id });
            }
          }
        });
        /** @type {import('./types.js').Rect[]} */
        const members = framingParts.map(member => /** @type {import('./types.js').Rect} */ (
          [member.box.min[0], member.box.min[2], member.box.max[0], member.box.max[2]]));
        members.push([0, this.height - this.thick, this.width, this.height]);
        const missing = unbackedEdges(laid, members, Math.min(sheet.size[1], this.height), this.height);
        if (missing.length) {
          const [edge, a, b] = missing[0];
          const along = edge.startsWith('x') ? 'z' : 'x';
          throw new Error(`the ${layer.role} sheet edge at ${edge} has no framing behind it from ${along} ${fmtG(a)} to ${fmtG(b)}`);
        }
      });
    }
  }

  /**
   * The id of the outermost face A sheet piece at the left or right end, at
   * the bottom, or null when face A has no workshop layers.
   * @param {'left' | 'right'} side
   */
  endSheet(side) {
    if (!this.faceA.length) return null;
    const prefix = `a${this.faceA.length}_`;
    const x = side === 'left' ? 0 : this.width;
    for (const part of this.parts) {
      const b = part.layer && part.box;
      if (b && part.id.startsWith(prefix) && b.min[2] === 0 && (side === 'left' ? b.min[0] : b.max[0]) === x) return part.id;
    }
    throw new Error(`no face A sheet at the ${side} end`);
  }

  /**
   * A side port's exposes: the end stud, the end sheet when there is one,
   * and parts.
   * @param {'left' | 'right'} side
   * @param {Object<string, string>} parts
   */
  endExposes(side, parts) {
    const sheet = this.endSheet(side);
    return { end_stud: `stud_${side}`, ...(sheet ? { end_sheet: sheet } : {}), ...parts };
  }

  /**
   * Port frames; across points into the depth at both ends, so the left
   * frame mirrors the right one. Origins on the framing's outer face.
   * @param {Object<string, string>} left
   * @param {Object<string, string>} right
   */
  ports(left, right) {
    const y0 = this.y0;
    return {
      left: { origin: [0, y0, 0], normal: [-1, 0, 0], along: [0, 0, 1], across: [0, 1, 0], exposes: left },
      right: { origin: [this.width, y0, 0], normal: [1, 0, 0], along: [0, 0, 1], across: [0, 1, 0], exposes: right },
    };
  }

  /** @param {any} ports */
  result(ports) {
    return {
      size: { width: this.width, height: this.height, depth: this.depth, framing: this.deep },
      parts: this.parts, joints: this.joints, ports,
    };
  }
}
