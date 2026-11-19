// Floor (derived): a joist floor built on site, on a sill all round, derived
// from the walls standing on it (hut/design/ic_derived.md section 11; the
// floor's rules in hut/design/ic_lib_floor.md section 11). Pure: no imports; the engine passes the library core.
//
// derive(params, input, core) -> {parts, joints}
//   params  joist (lumber), spacing, buildup (system file)
//   input   width, depth: the outline (the walls' framing), u along the rims,
//           v along the joists (the short side); sill: the walls' stud lumber
//           (laid flat); gables: {start, end}, for the edges at u = 0 and u =
//           width, the walls' members standing over them as [v0, v1]
//           intervals; toWorld(box): floor coordinates to the world's
//   result  parts in world coordinates, joints between own parts
//
// Floor coordinates: origin at the outline's corner, at the underside of the
// sill; u along the rims, v along the joists, z up. Sills: the start and end
// rows (v) the full width, the gable rows between. Rims along u at both ends
// of the joists; joists along v: an end joist at each gable edge and joists
// at the spacing from the u = 0 edge, left out within MIN_BAY of an end
// joist. Blocking between each end joist and the next joist, one block under
// each member over the gable edge; members side by side (a panel joint, a
// king and jack) get blocks side by side, centred under them. Members over a
// rim joist (the end studs of a gable wall that runs through at a corner)
// stand on the rim and need no block. Sheet layers on
// face B on top, laid in rows across the joists, every other row starting with
// a half sheet; a seam across the joists must land on a joist.

const MIN_BEARING = 20; // mm of joist under each sheet at a seam
const MIN_SHEET = 100; // mm; a narrower last row or end piece is an error
const MIN_BAY = 100; // mm; a grid joist closer than this to an end joist is left out

/** @typedef {{min: number[], max: number[]}} Box */

/**
 * Blocks under members: members side by side are grouped, and a group of
 * n gets n blocks side by side, t thick, centred under it.
 * @param {number[][]} members  [v0, v1], sorted
 * @param {number} t
 */
function blockSpans(members, t) {
  /** @type {number[][]} */
  const groups = [];
  for (const [v0, v1] of members) {
    const last = groups[groups.length - 1];
    if (last && last[1] === v0) { last[1] = v1; last[2] += 1; } else groups.push([v0, v1, 1]);
  }
  /** @type {number[][]} */
  const spans = [];
  for (const [v0, v1, n] of groups) {
    const lo = (v0 + v1) / 2 - (n * t) / 2;
    if (spans.length && lo < spans[spans.length - 1][1]) {
      throw new Error(`the blocks under the members at v ${v0} would overlap the blocks before them`);
    }
    for (let i = 0; i < n; i++) spans.push([lo + i * t, lo + (i + 1) * t]);
  }
  return spans;
}

/**
 * @param {any} params
 * @param {any} input
 * @param {any} core
 */
export function derive(params, input, core) {
  const { width, depth, sill: wall, gables, toWorld } = input;
  const { spacing, buildup } = params;
  const [t, d] = params.joist.section; // 48 x 198: thickness along u, depth up
  const [st, sw] = wall.section; // the sill: the walls' stud lumber lying flat
  for (const layer of buildup.face_b) {
    if (!layer.sheet) throw new Error(`floor layer '${layer.role}' on face_b must be a catalog sheet`);
  }
  if (width < 2 * sw || depth < 2 * sw) {
    throw new Error(`the floor (${width} x ${depth}) is too small for its sills (${sw} wide)`);
  }
  if (t < 2 * MIN_BEARING) throw new Error(`joists ${t} thick leave less than ${MIN_BEARING} for each sheet at a seam`);

  /** @type {any[]} */
  const parts = [];
  /** @type {any[]} */
  const joints = [];
  const box = (/** @type {number[]} */ ...c) => ({ min: [c[0], c[1], c[2]], max: [c[3], c[4], c[5]] });
  const member = (/** @type {string} */ id, /** @type {string} */ role, /** @type {Box} */ b, lumber = params.joist) => {
    const part = { id, role, material: `timber ${lumber.grade}`, catalog: lumber.id, stage: 'site', box: b };
    parts.push(part);
    return part;
  };
  const joint = (/** @type {string} */ type, /** @type {Object<string, string>} */ sides) => joints.push({
    type, parts: Object.fromEntries(Object.entries(sides).map(([side, id]) => [side, { own: id }])),
  });

  let z0 = st, z1 = st + d; // the framing on the sill
  const sills = [
    member('sill_start', 'sill_plate', box(0, 0, 0, width, sw, st), wall),
    member('sill_end', 'sill_plate', box(0, depth - sw, 0, width, depth, st), wall),
    member('sill_gable_start', 'sill_plate', box(0, sw, 0, sw, depth - sw, st), wall),
    member('sill_gable_end', 'sill_plate', box(width - sw, sw, 0, width, depth - sw, st), wall),
  ];
  for (const a of sills.slice(0, 2)) for (const b of sills.slice(2)) joint('sill_corner', { a: a.id, b: b.id });

  const rims = [
    member('rim_start', 'rim', box(0, 0, z0, width, t, z1)),
    member('rim_end', 'rim', box(0, depth - t, z0, width, depth, z1)),
  ];
  /** @type {Array<[string, number]>} */
  const positions = [['joist_start', 0]];
  for (let k = 1; k * spacing < width; k++) {
    const u0 = k * spacing - t / 2;
    if (u0 >= t + MIN_BAY && u0 + t <= width - t - MIN_BAY) positions.push([`joist_${k}`, u0]);
  }
  positions.push(['joist_end', width - t]);
  if (positions.length < 3) throw new Error(`width ${width}: no joist between the end joists for the blocking`);
  const joists = positions.map(([id, u0]) => {
    const j = member(id, 'joist', box(u0, t, z0, u0 + t, depth - t, z1));
    for (const rim of rims) joint('joist_to_rim', { rim: rim.id, joist: id });
    return j;
  });

  /** @type {any[]} */
  const blocks = [];
  const sides = [['gable_start', joists[0], joists[1], gables.start], ['gable_end', joists[joists.length - 2], joists[joists.length - 1], gables.end]];
  for (const [side, a, b, members] of sides) {
    const u0 = a.box.max[0], u1 = b.box.min[0];
    const between = members.filter((/** @type {number[]} */ [v0, v1]) => v1 > t && v0 < depth - t);
    const spans = between.length ? blockSpans([...between].sort((p, q) => p[0] - q[0]), t) : [];
    if (spans.length && (spans[0][0] < t || spans[spans.length - 1][1] > depth - t)) {
      throw new Error(`the ${side} blocking would run into a rim joist`);
    }
    /** @type {any} */
    let previous = null;
    spans.forEach(([v0, v1], i) => {
      const block = member(`blocking_${side}_${i + 1}`, 'blocking', box(u0, v0, z0, u1, v1, z1));
      blocks.push(block);
      for (const j of [a, b]) joint('blocking_to_joist', { joist: j.id, block: block.id });
      if (previous && previous.box.max[1] === v0) joint('doubled_blocking', { a: previous.id, b: block.id });
      previous = block;
    });
  }

  // Everything resting on the sill is toenailed to it (a count, so however
  // little it rests there).
  const members = [...rims, ...joists, ...blocks];
  for (const m of members) {
    for (const s of sills) if (core.faceToFace(m.box, s.box, 2)) joint('on_sill', { sill: s.id, member: m.id });
  }

  let z = z1;
  buildup.face_b.forEach((/** @type {any} */ layer, /** @type {number} */ index) => {
    const sheet = layer.sheet;
    z0 = z; z1 = z + layer.thickness; z = z1;
    const longSide = Math.max(...sheet.size), shortSide = Math.min(...sheet.size);
    let n = 0;
    for (let row = 0, v0 = 0; v0 < depth; row++, v0 += shortSide) {
      const v1 = Math.min(v0 + shortSide, depth);
      if (v1 - v0 < MIN_SHEET) {
        throw new Error(`depth ${depth}: the last row of ${layer.role} sheets would be ${v1 - v0} deep (less than ${MIN_SHEET})`);
      }
      const cuts = [0];
      for (let u = row % 2 ? longSide / 2 : longSide; u < width; u += longSide) cuts.push(u);
      cuts.forEach((u0, i) => {
        const u1 = i + 1 < cuts.length ? cuts[i + 1] : width;
        if (u1 - u0 < MIN_SHEET) {
          throw new Error(`width ${width}: a ${layer.role} piece would be ${u1 - u0} wide (less than ${MIN_SHEET})`);
        }
        if (u0 > 0 && !joists.some(j => j.box.min[0] + MIN_BEARING <= u0 && u0 <= j.box.max[0] - MIN_BEARING)) {
          throw new Error(`the ${layer.role} seam at u ${u0} doesn't land on a joist with ${MIN_BEARING} bearing each side`);
        }
        n += 1;
        const part = {
          id: `b${index + 1}_${layer.role}_${n}`, role: layer.role, layer: layer.role, layerDef: layer,
          material: sheet.material, catalog: sheet.id, stage: 'site', box: box(u0, v0, z0, u1, v1, z1),
        };
        parts.push(part);
        for (const m of members) {
          if (core.nailable(part.box, m.box, 2)) joint('sheathing_to_framing', { sheet: part.id, framing: m.id });
        }
      });
    }
  });
  const height = z;
  return {
    parts: parts.map(p => ({ ...p, box: toWorld(p.box, height) })),
    joints,
    height,
  };
}
