// Wall line (derived): the upper top plate along a straight run of wall
// panels, fitted on site (hut/design/ic_lib_top_plate.md). Pure: no imports;
// the engine passes the library core.
//
// derive(params, input, core) -> {parts, joints}
//   params  max_piece, min_from_joint (system file)
//   input   panels: the run's panels in order (left to right seen from
//           outside), each {id, size, params, transform, parts}, parts the
//           model's (world boxes in `world`); ends: {start, end}, each
//           {role: 'through' | 'butt', depth} at a corner (depth: the other
//           wall's framing depth) or null at a free end
//   result  parts in world coordinates; no joints (the storey joins the
//           plate to whatever it lies on or against)
//
// Along the run, s is the distance from the first panel's left end. The
// plate runs from the line's start to its end, extended by the through
// wall's framing at a butt end (to the outer corner) and stopped short by
// the butt wall's framing at a through end (at its inside face), so the
// plates lap at the corners. Its joints are at stud-grid positions (a
// panel's left end plus k times its spacing) at least min_from_joint from
// every panel joint and line end, over a stud or cripple that reaches the
// lower top plate; pieces at most
// max_piece, joints chosen greedily from the start.

const VERTICAL = new Set(['stud', 'cripple', 'king', 'jack']);

/**
 * @param {{max_piece: number, min_from_joint: number}} params
 * @param {{panels: any[], ends: {start: any, end: any}}} input
 * @returns {{parts: any[], joints: any[]}}
 */
export function derive(params, input) {
  const { panels, ends } = input;
  if (!panels.length) throw new Error('a wall line needs at least one panel');
  const first = panels[0];
  const dir = [0, 1, 2].map(i => first.transform.m[i][0]); // the run, left to right
  const axis = dir.findIndex(v => Math.abs(v) === 1);
  if (axis < 0 || axis === 2) throw new Error(`wall line at '${first.id}' doesn't run along x or y`);
  const origin = first.transform.t;
  const sOf = (/** @type {number[]} */ p) => (p[axis] - origin[axis]) * dir[axis];
  const span = (/** @type {{min: number[], max: number[]}} */ box) => {
    const a = sOf(box.min), b = sOf(box.max);
    return [Math.min(a, b), Math.max(a, b)];
  };

  // The panels' place along the run; they must be in line and face the same way.
  const runs = panels.map(panel => {
    const d = [0, 1, 2].map(i => panel.transform.m[i][0]);
    if (d.some((v, i) => v !== dir[i])) throw new Error(`panel '${panel.id}' doesn't run the same way as '${first.id}'`);
    const s0 = sOf(panel.transform.t);
    return { panel, s0, s1: s0 + panel.size.width };
  });
  const length = runs[runs.length - 1].s1;
  const boundaries = [...new Set(runs.flatMap(r => [r.s0, r.s1]))];

  // The lower top plate: the plate's section and lumber.
  const lower = first.parts.find((/** @type {any} */ p) => p.role === 'top_plate');
  if (!lower) throw new Error(`panel '${first.id}' has no top plate`);
  const thick = lower.world.max[2] - lower.world.min[2];

  const offset = (/** @type {any} */ end) => (end ? (end.role === 'butt' ? -end.depth : end.depth) : 0);
  const a = 0 + offset(ends.start);
  const b = length - offset(ends.end);

  // Joint positions.
  const candidates = [];
  for (const { panel, s0, s1 } of runs) {
    const spacing = panel.params.spacing;
    // Members that reach the lower top plate (not jacks or cripples under a
    // header or sill).
    /** @type {number[][]} */
    const members = panel.parts
      .filter((/** @type {any} */ p) => VERTICAL.has(p.role) && p.world.max[2] === lower.world.min[2])
      .map((/** @type {any} */ p) => span(p.world));
    for (let k = 1; s0 + k * spacing < s1; k++) {
      const c = s0 + k * spacing;
      if (boundaries.some(x => Math.abs(c - x) < params.min_from_joint)) continue;
      if (!members.some(([lo, hi]) => lo < c && c < hi)) continue;
      candidates.push(c);
    }
  }
  candidates.sort((p, q) => p - q);
  const pieces = [];
  let at = a;
  while (b - at > params.max_piece) {
    const next = candidates.filter(c => c > at && c <= at + params.max_piece && c < b).pop();
    if (next === undefined) {
      throw new Error(`no place for a joint in the upper top plate of the line from '${first.id}' `
        + `between ${at} and ${at + params.max_piece} along it (pieces at most ${params.max_piece}, `
        + `joints at least ${params.min_from_joint} from a panel joint, over a stud)`);
    }
    pieces.push([at, next]);
    at = next;
  }
  pieces.push([at, b]);

  const across = 1 - axis; // the other horizontal axis
  const parts = pieces.map(([s, e], index) => {
    const w0 = origin[axis] + dir[axis] * s, w1 = origin[axis] + dir[axis] * e;
    const min = [0, 0, 0], max = [0, 0, 0];
    min[axis] = Math.min(w0, w1); max[axis] = Math.max(w0, w1);
    min[across] = lower.world.min[across]; max[across] = lower.world.max[across];
    min[2] = lower.world.max[2]; max[2] = lower.world.max[2] + thick;
    return {
      id: `upper_plate_${index + 1}`, role: 'top_plate', material: lower.material, catalog: lower.catalog,
      stage: 'site', box: { min, max },
    };
  });
  return { parts, joints: [] };
}
