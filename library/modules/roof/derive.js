// Roof (derived): a gable roof of rafters on a ridge board, tied by ceiling
// joists at the plates, with framed gables and a gable overhang
// (hut/design/ic_lib_roof.md, 3 and 4.2). Runs after a storey and reads its
// exports. Pure: no imports; the engine passes the library core.
//
// derive(params, input, core) -> {parts, joints}
//   params  rafter, ceiling_joist, ridge_board, gable_stud, lookout (lumber),
//           spacing (system file); pitch (degrees), ridge (east_west |
//           north_south), eaves, gables (the layout)
//   input   exports of the storey it comes after: outline (the walls'
//           framing in plan), outside (with the sheets), plate_top, lines
//           [{id, side, plates}]; parts: the model so far
//   result  parts in world coordinates (rafters and lookouts sloped: a box in
//           its own frame, with cuts and, for rafters on a wall, a birdsmouth
//           notch; gable studs cut to the slope) and joints
//
// Across the ridge (b), the rafters run from the eaves to the ridge board,
// whose centre is over the middle of the framing. A rafter's birdsmouth has
// its heel at the wall's outer face, sheets included (the seat bears on the
// sheet's top edge and the plate, the tail clears the sheet), and its seat
// on the plates' top, notched a quarter of the rafter's depth, square to it
// (the most the IRC allows at a member's end). A plumb cut meets the ridge
// board; a plumb cut ends the tail `eaves` beyond the outer face. Along the
// ridge (a), an end rafter is flush with each end of the framing, over the
// gable wall, and the others are at the spacing from the start, as the
// studs and the floor joists are.
//
// A ceiling joist lies beside each rafter between the gables, on the plates,
// from one eaves wall's outer framing face to the other's: with the rafters
// it ties their feet. At the gables the gable wall carries the end rafters
// instead: gable studs stand on its upper plate at the spacing across the
// building (not across the ridge line, none shorter than MIN_GABLE_STUD), cut
// at the top to the end rafter's underside.
//
// The gable overhang (gables > 0): the ridge board runs out to `gables`
// beyond the gable walls' outer faces, a fly rafter (no birdsmouth: no wall
// under it) hangs at the edge from it, and lookouts, laid flat with their
// tops flush with the rafters', run from the fly rafter to the end rafter at
// the spacing up the slope (a gable ladder).

const DEG = Math.PI / 180;
const MIN_GABLE_STUD = 150; // mm at its short side; placeholder

/** @typedef {[number, number, number]} V */

/**
 * @param {any} params
 * @param {any} input
 * @param {any} core
 * @returns {{parts: any[], joints: any[]}}
 */
export function derive(params, input, core) {
  const found = Object.entries(input.exports ?? {}).find(([, ex]) => ex && Array.isArray(ex.lines) && ex.outline);
  if (!found) throw new Error('the roof needs a storey before it: list it after one (after: [storey])');
  const [dep, storey] = /** @type {[string, any]} */ (found);
  const a = params.ridge === 'east_west' ? 0 : 1; // along the ridge
  const b = 1 - a; // across it
  const eavesSides = a === 0 ? ['south', 'north'] : ['west', 'east'];
  const gableSides = a === 0 ? ['west', 'east'] : ['south', 'north'];
  const lineOn = (/** @type {string} */ side) => {
    const line = storey.lines.find((/** @type {any} */ l) => l.side === side);
    if (!line) throw new Error(`no ${side} wall`);
    return line;
  };
  for (const side of eavesSides) lineOn(side);
  const [T, D] = params.rafter.section;
  const [tr, dr] = params.ridge_board.section;
  const [tj, dj] = params.ceiling_joist.section;
  const [ts] = params.gable_stud.section;
  const [tl, wl] = params.lookout.section; // laid flat: tl thick, wl wide
  const alpha = params.pitch * DEG, cos = Math.cos(alpha), sin = Math.sin(alpha), tan = Math.tan(alpha);
  const zp = storey.plate_top;
  const lo = storey.outline.min, hi = storey.outline.max, out = storey.outside;
  const ridgeAt = (lo[b] + hi[b]) / 2;
  const heel = D / 4 / cos; // the heel's height: the notch a quarter of the depth, square to the rafter
  if (dr < D / cos) throw new Error(`the ridge board (${dr} deep) is shallower than the rafters' plumb cut (${(D / cos).toFixed(1)})`);
  const overhang = params.gables > 0;

  // Rafter positions along the ridge (centres); fly rafters at the edges.
  const centres = [lo[a] + T / 2];
  for (let k = 1; lo[a] + k * params.spacing <= hi[a] - 1.5 * T; k++) centres.push(lo[a] + k * params.spacing);
  centres.push(hi[a] - T / 2);
  const ridgeEnds = overhang ? [out.min[a] - params.gables, out.max[a] + params.gables] : [lo[a], hi[a]];
  const fly = overhang ? [ridgeEnds[0] + T / 2, ridgeEnds[1] - T / 2] : [];

  const unitAxis = (/** @type {number} */ i, /** @type {number} */ sign = 1) => /** @type {V} */ ([0, 1, 2].map(k => (k === i ? sign : 0)));
  const at = (/** @type {number} */ along, /** @type {number} */ across, /** @type {number} */ z) => {
    /** @type {V} */
    const p = [0, 0, z];
    p[a] = along;
    p[b] = across;
    return p;
  };
  const lumber = (/** @type {any} */ l) => ({ material: `timber ${l.grade}`, catalog: l.id, stage: 'site' });
  /** @type {any[]} */
  const parts = [];
  let ridgeTop = 0;
  /** The underside of the rafters on each side, as a plane: {normal (up, out of the stud), point}. */
  /** @type {Object<string, {normal: V, point: V}>} */
  const undersides = {};
  for (const [side, dir] of /** @type {Array<[string, number]>} */ ([[eavesSides[0], 1], [eavesSides[1], -1]])) {
    const heelAt = dir > 0 ? out.min[b] : out.max[b]; // the wall's outer face, sheets included
    const face = ridgeAt - dir * tr / 2; // the ridge board's face on this side
    const run = (face - heelAt) * dir;
    // The rafters' frame: x their thickness, y up the slope, z square to it, upward.
    const h = unitAxis(b, dir);
    /** @type {V} */
    const ey = [h[0] * cos, h[1] * cos, sin];
    /** @type {V} */
    const ez = [-h[0] * sin, -h[1] * sin, cos];
    /** @type {V} */
    const ex = [ey[1] * ez[2] - ey[2] * ez[1], ey[2] * ez[0] - ey[0] * ez[2], ey[0] * ez[1] - ey[1] * ez[0]];
    ridgeTop = zp - heel + run * tan + D / cos;
    undersides[side] = { normal: ez, point: at(0, heelAt, zp - heel) };
    const frameAt = (/** @type {number} */ along) => {
      const origin = at(along, heelAt, zp - heel); // on the underside, at the heel
      const local = (/** @type {number[]} */ p) => {
        const d = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
        return [ex, ey, ez].map(e => d[0] * e[0] + d[1] * e[1] + d[2] * e[2]);
      };
      const turn = (/** @type {number[]} */ v) => [ex, ey, ez].map(e => v[0] * e[0] + v[1] * e[1] + v[2] * e[2]);
      return { origin, local, turn };
    };
    const rafter = (/** @type {string} */ id, /** @type {number} */ centre, /** @type {boolean} */ onWall) => {
      const { origin, local, turn } = frameAt(centre);
      const seatCorner = local(at(centre, heelAt, zp));
      parts.push({
        id, role: 'rafter', ...lumber(params.rafter),
        box: { min: [-T / 2, -params.eaves / cos, 0], max: [T / 2, (run + D * sin) / cos, D] },
        frame: { origin, axes: [ex, ey, ez] },
        cuts: [
          { normal: turn(h), point: local(at(centre, face, zp)) }, // the plumb cut at the ridge board
          { normal: turn([-h[0], -h[1], 0]), point: local(at(centre, heelAt - dir * params.eaves, zp)) }, // the tail
        ],
        ...(onWall ? { notches: [{ planes: [ // the birdsmouth: below the seat, inside the heel
          { normal: turn([0, 0, 1]), point: seatCorner },
          { normal: turn([-h[0], -h[1], 0]), point: seatCorner },
        ] }] } : {}),
      });
    };
    centres.forEach((centre, i) => rafter(`rafter_${side}_${i + 1}`, centre, true));
    fly.forEach((centre, i) => rafter(`fly_rafter_${side}_${gableSides[i]}`, centre, false));
    // Lookouts: from each fly rafter's inner face to the end rafter's outer
    // face, flat, tops flush with the rafters', up the slope from the heel,
    // clear of the ridge board.
    if (overhang) {
      const topAt = (run + (D - tl) * sin) / cos - 50; // the plumb cut at the lookout's underside, less 50
      const spans = [[ridgeEnds[0] + T, lo[a]], [hi[a], ridgeEnds[1] - T]];
      spans.forEach(([a0, a1], g) => {
        const { origin, turn } = frameAt(a0);
        const along = turn(unitAxis(a))[0]; // +1 or -1: the frame's x along the ridge
        const xs = along > 0 ? [0, a1 - a0] : [a0 - a1, 0];
        let k = 0;
        for (let s = 0; s + wl <= topAt; s += params.spacing) {
          k += 1;
          parts.push({
            id: `lookout_${side}_${gableSides[g]}_${k}`, role: 'lookout', ...lumber(params.lookout),
            box: { min: [xs[0], s, D - tl], max: [xs[1], s + wl, D] },
            frame: { origin, axes: [ex, ey, ez] },
          });
        }
      });
    }
  }

  const ridgeBoard = {
    id: 'ridge_board', role: 'ridge_board', ...lumber(params.ridge_board),
    box: boxOf(at(ridgeEnds[0], ridgeAt - tr / 2, ridgeTop - dr), at(ridgeEnds[1], ridgeAt + tr / 2, ridgeTop)),
  };
  parts.push(ridgeBoard);
  // Ceiling joists beside the rafters between the gables.
  centres.slice(1, -1).forEach((centre, i) => {
    const a0 = centre + T / 2;
    parts.push({ id: `ceiling_joist_${i + 1}`, role: 'ceiling_joist', ...lumber(params.ceiling_joist), box: boxOf(at(a0, lo[b], zp), at(a0 + tj, hi[b], zp + dj)) });
  });

  // Gable studs on each gable wall's upper plate, cut to the rafters' underside.
  const byId = new Map(input.parts.map((/** @type {any} */ p) => [p.id, p]));
  const plateOf = (/** @type {string} */ id) => {
    const plate = byId.get(`${dep}/${id}`);
    if (!plate) throw new Error(`the storey's plate '${dep}/${id}' is not in the model`);
    return plate;
  };
  for (const gable of gableSides) {
    const boxes = lineOn(gable).plates.map((/** @type {string} */ id) => plateOf(id).world);
    const a0 = Math.min(...boxes.map((/** @type {any} */ x) => x.min[a])), a1 = Math.max(...boxes.map((/** @type {any} */ x) => x.max[a]));
    let k = 0;
    for (let c = lo[b] + params.spacing; c + ts / 2 <= hi[b] - ts; c += params.spacing) {
      const b0 = c - ts / 2, b1 = c + ts / 2;
      if (b0 < ridgeAt && b1 > ridgeAt) continue; // across the ridge line
      const side = b1 <= ridgeAt ? eavesSides[0] : eavesSides[1];
      const plane = undersides[side];
      const height = (/** @type {number} */ across) => { // the underside's height above `across`
        const p = plane.point, n = plane.normal;
        return p[2] - (n[b] * (across - p[b])) / n[2];
      };
      const low = Math.min(height(b0), height(b1)), high = Math.max(height(b0), height(b1));
      if (low - zp < MIN_GABLE_STUD) continue;
      k += 1;
      parts.push({
        id: `gable_stud_${gable}_${k}`, role: 'stud', ...lumber(params.gable_stud),
        box: boxOf(at(a0, b0, zp), at(a1, b1, high)),
        cuts: [{ normal: plane.normal, point: plane.point }],
      });
    }
  }

  // Joints, where parts touch.
  const plates = storey.lines.flatMap((/** @type {any} */ l) => l.plates.map((/** @type {string} */ id) => `${dep}/${id}`));
  const solids = core.solids;
  const near = (/** @type {any} */ x, /** @type {any} */ y) => [0, 1, 2].every(k => x.min[k] <= y.max[k] + 1 && y.min[k] <= x.max[k] + 1);
  const bounds = new Map(parts.map(p => [p.id, solids.isSolid(p) ? solids.boundingBox(p) : p.box]));
  const touches = (/** @type {any} */ p, /** @type {any} */ q, /** @type {any} */ qBox) => near(bounds.get(p.id), qBox) && solids.solidContact(p, q).normal !== null;
  /** @type {any[]} */
  const joints = [];
  const onPlate = { rafter: ['rafter_to_plate', 'rafter'], ceiling_joist: ['joist_to_plate', 'joist'], stud: ['stud_to_plate', 'stud'] };
  for (const p of parts) {
    const kind = /** @type {any} */ (onPlate)[p.role];
    if (!kind) continue;
    for (const id of plates) {
      const plate = byId.get(id);
      if (!touches(p, { box: plate.world }, plate.world)) continue;
      joints.push({ type: kind[0], parts: { plate: { model: id }, [kind[1]]: { own: p.id } } });
    }
  }
  const rafters = parts.filter(p => p.role === 'rafter');
  const others = parts.filter(p => ['ceiling_joist', 'stud', 'lookout'].includes(p.role));
  const pairType = { ceiling_joist: ['rafter_to_joist', 'joist'], stud: ['stud_to_rafter', 'stud'], lookout: ['lookout_to_rafter', 'lookout'] };
  for (const r of rafters) {
    if (!touches(r, ridgeBoard, ridgeBoard.box)) throw new Error(`'${r.id}' doesn't meet the ridge board`);
    joints.push({ type: 'rafter_to_ridge', parts: { ridge: { own: ridgeBoard.id }, rafter: { own: r.id } } });
    for (const o of others) {
      if (!touches(r, o, bounds.get(o.id))) continue;
      const [type, sideName] = /** @type {any} */ (pairType)[o.role];
      joints.push({ type, parts: { rafter: { own: r.id }, [sideName]: { own: o.id } } });
    }
  }
  for (const o of others) {
    if (o.role === 'stud' && !joints.some(j => j.type === 'stud_to_rafter' && j.parts.stud.own === o.id)) throw new Error(`'${o.id}' doesn't reach a rafter`);
  }
  return { parts, joints };
}

/** The box between two corners. */
function boxOf(/** @type {number[]} */ p, /** @type {number[]} */ q) {
  return { min: [0, 1, 2].map(i => Math.min(p[i], q[i])), max: [0, 1, 2].map(i => Math.max(p[i], q[i])) };
}
