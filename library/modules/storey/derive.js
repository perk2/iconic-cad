// Storey (derived): the walls on one level. Finds the wall lines (chains of
// wall_inline connections between wall_corner connections), runs wall_line
// for each, joins the lines' parts to what they lie on or against, and
// derives the floor under the walls (hut/design/ic_derived.md, sections 10
// and 11). Pure: no imports; the engine passes the library core.
//
// derive(params, input, core) -> {parts, joints}
//   input   entities: placed entities {id, module, variant, params, size,
//           transform, parts}; parts: every model part (world boxes in
//           `world`, layer if cut from one); connections: {id, interface,
//           ends: {role: {entity, port}}}; anchor: the anchor entity's id
//           (its frame is the building's); derive(id, params, input) runs a
//           derived child
//   result  own parts (ids prefixed by the child: line_S1/upper_plate_1,
//           floor/joist_1) and joints whose sides are {own: id} or {model: id};
//           exports, for the derived modules that come after (the roof), in
//           world coordinates, model +x east and +y north: outline (the
//           walls' framing in plan, {min: [x, y], max: [x, y]}), outside (the
//           walls with their sheets), plate_top (the upper top plates' top),
//           lines [{id, side: south | north | east | west, panels, plates}]
//           (plates: the line's upper plate pieces, own ids)
//
// The storey is derived only when the walls close: every line ends at a
// corner, four corners (wall_corner joins convex corners, so the walls make
// a rectangle).

/**
 * @param {object} params
 * @param {any} input
 * @param {any} core
 * @returns {{parts: any[], joints: any[], exports: any}}
 */
export function derive(params, input, core) {
  const entities = new Map(input.entities.map((/** @type {any} */ e) => [e.id, e]));
  const next = new Map(), prev = new Map(), corner = new Map();
  const walls = new Set();
  let corners = 0;
  for (const c of input.connections) {
    if (c.interface === 'wall_inline') {
      next.set(c.ends.a.entity, c.ends.b.entity);
      prev.set(c.ends.b.entity, c.ends.a.entity);
      walls.add(c.ends.a.entity); walls.add(c.ends.b.entity);
    } else if (c.interface === 'wall_corner') {
      const { through, butt } = c.ends;
      corner.set(`${through.entity}.${through.port}`, { role: 'through', other: butt.entity });
      corner.set(`${butt.entity}.${butt.port}`, { role: 'butt', other: through.entity });
      walls.add(through.entity); walls.add(butt.entity);
      corners += 1;
    }
  }

  // The wall lines; every end at a corner.
  const lines = [];
  const seen = new Set();
  const free = [];
  for (const id of [...walls].sort()) {
    if (prev.has(id)) continue;
    const line = [];
    for (let at = id; at !== undefined && !seen.has(at); at = next.get(at)) {
      seen.add(at);
      line.push(entities.get(at));
    }
    const first = line[0].id, last = line[line.length - 1].id;
    for (const key of [`${first}.left`, `${last}.right`]) if (!corner.has(key)) free.push(key);
    lines.push(line);
  }
  const looped = [...walls].filter(id => !seen.has(id));
  if (looped.length) throw new Error(`walls in a closed run with no corner: ${looped.join(', ')}`);
  if (free.length || corners !== 4) {
    throw new Error(`the walls don't close into a rectangle (free ends: ${free.join(', ') || 'none'}; `
      + `${corners} corners); the storey is derived once they do`);
  }

  const end = (/** @type {string} */ key) => {
    const c = corner.get(key);
    return { role: c.role, depth: entities.get(c.other).size.framing };
  };
  /** @type {any[]} */
  const parts = [];
  /** @type {any[]} */
  const joints = [];
  const prefix = (/** @type {string} */ p, /** @type {any} */ result) => {
    for (const part of result.parts) parts.push({ ...part, id: `${p}/${part.id}` });
    for (const j of result.joints) {
      joints.push({
        type: j.type,
        parts: Object.fromEntries(Object.entries(j.parts).map(([side, ref]) => [side,
          /** @type {any} */ (ref).own !== undefined ? { own: `${p}/${/** @type {any} */ (ref).own}` } : ref])),
      });
    }
  };
  for (const line of lines) {
    const first = line[0].id, last = line[line.length - 1].id;
    prefix(`line_${first}`, input.derive('wall_line', {}, {
      panels: line, ends: { start: end(`${first}.left`), end: end(`${last}.right`) },
    }));
  }

  // Join each upper plate piece to the top plates it lies on, the sheets
  // nailed to it, and, at a corner, the end of the plate it laps.
  const plates = parts.filter(p => p.role === 'top_plate');
  for (const own of plates) {
    for (const m of input.parts) {
      const c = core.contact(m.world, own.box);
      if (c.axis === null) continue;
      if (m.role === 'top_plate' && c.axis === 2 && m.world.max[2] === own.box.min[2]) {
        joints.push({ type: 'top_plates', parts: { upper: { own: own.id }, lower: { model: m.id } } });
      } else if (m.layer && c.axis !== 2 && core.nailable(m.world, own.box, c.axis)) {
        joints.push({ type: 'sheathing_to_framing', parts: { sheet: { model: m.id }, framing: { own: own.id } } });
      }
    }
  }
  const lineOf = (/** @type {string} */ id) => id.split('/')[0];
  for (let i = 0; i < plates.length; i++) {
    for (const other of plates.slice(i + 1)) {
      const a = plates[i];
      if (lineOf(a.id) === lineOf(other.id)) continue;
      const c = core.contact(a.box, other.box);
      if (c.axis === null) continue;
      // The plate whose end meets the other's side.
      const long = (/** @type {any} */ b) => (b.max[0] - b.min[0] > b.max[1] - b.min[1] ? 0 : 1);
      const [endPart, sidePart] = long(a.box) === c.axis ? [a, other] : [other, a];
      joints.push({ type: 'plate_end', parts: { end: { own: endPart.id }, side: { own: sidePart.id } } });
    }
  }

  const exports = summary(lines, plates, walls, entities);
  deriveFloor(input, core, walls, entities, parts, joints, prefix);
  return { parts, joints, exports };
}

/**
 * What the storey tells the derived modules after it: the outline, the
 * outside with the sheets, the upper top plates' top, and each wall line's
 * side (the way it faces) and upper plate pieces.
 * @param {any[][]} lines
 * @param {any[]} plates  the upper plate pieces (own ids, world boxes)
 * @param {Set<string>} walls
 * @param {Map<string, any>} entities
 */
function summary(lines, plates, walls, entities) {
  const wallParts = [...walls].flatMap(id => entities.get(id).parts);
  const extent = (/** @type {any[]} */ boxes) => ({
    min: [0, 1].map(i => Math.min(...boxes.map(b => b.min[i]))),
    max: [0, 1].map(i => Math.max(...boxes.map(b => b.max[i]))),
  });
  const outline = extent(wallParts.filter((/** @type {any} */ p) => p.role === 'bottom_plate').map((/** @type {any} */ p) => p.world));
  const outside = extent(wallParts.map((/** @type {any} */ p) => p.world));
  const mid = [0, 1].map(i => (outline.min[i] + outline.max[i]) / 2);
  return {
    outline,
    outside,
    plate_top: Math.max(...plates.map(p => p.box.max[2])),
    lines: lines.map(line => {
      const id = `line_${line[0].id}`;
      const own = plates.filter(p => p.id.startsWith(`${id}/`));
      const b = extent(own.map(p => p.box));
      const alongX = b.max[0] - b.min[0] >= b.max[1] - b.min[1];
      const centre = [0, 1].map(i => (b.min[i] + b.max[i]) / 2);
      const side = alongX ? (centre[1] < mid[1] ? 'south' : 'north') : (centre[0] < mid[0] ? 'west' : 'east');
      return { id, side, panels: line.map(e => e.id), plates: own.map(p => p.id) };
    }),
  };
}

const STANDING = new Set(['stud', 'king', 'jack', 'cripple']);

/**
 * The floor under the walls, laid out in the building's frame (the anchor
 * entity's), so it turns with the building: its outline is the extent of
 * the walls' bottom plates (their framing), its top their underside; the
 * joists span the short side, and the walls along the joists give the
 * members the blocking stands under (those over a rim stand on the rim).
 * @param {any} input
 * @param {any} core
 * @param {Set<string>} walls
 * @param {Map<string, any>} entities
 * @param {any[]} parts
 * @param {any[]} joints
 * @param {(p: string, r: any) => void} prefix
 */
function deriveFloor(input, core, walls, entities, parts, joints, prefix) {
  const placed = [...walls].map(id => entities.get(id));
  const frame = entities.get(input.anchor)?.transform;
  if (!frame) throw new Error('the floor needs the anchor entity placed');
  const back = core.invert(frame);
  const local = (/** @type {any} */ b) => core.applyBox(back, b);
  const plates = placed.flatMap(e => e.parts.filter((/** @type {any} */ p) => p.role === 'bottom_plate'));
  if (!plates.length) throw new Error('no bottom plates: the walls give the floor its outline');
  const boxes = plates.map((/** @type {any} */ p) => local(p.world));
  const lo = [0, 1, 2].map(i => Math.min(...boxes.map((/** @type {any} */ b) => b.min[i])));
  const hi = [0, 1].map(i => Math.max(...boxes.map((/** @type {any} */ b) => b.max[i])));
  // u along the rims, v along the joists: the joists span the short side.
  const [ua, va] = hi[1] - lo[1] <= hi[0] - lo[0] ? [0, 1] : [1, 0];
  const width = hi[ua] - lo[ua], depth = hi[va] - lo[va];
  const top = lo[2];
  const studs = new Set(placed.map(e => e.params.stud.id));
  if (studs.size !== 1) throw new Error(`the walls' stud lumber differs (${[...studs].join(', ')}); the sill needs one`);
  const sill = placed[0].params.stud;

  // The members standing on the bottom plates of the walls over each edge
  // along the joists (u = 0 and u = width), as [v0, v1].
  /** @type {{start: number[][], end: number[][]}} */
  const gables = { start: [], end: [] };
  for (const e of placed) {
    const own = e.parts.filter((/** @type {any} */ p) => p.role === 'bottom_plate').map((/** @type {any} */ p) => local(p.world));
    const runsAlongV = own.every((/** @type {any} */ b) => b.max[va] - b.min[va] >= b.max[ua] - b.min[ua]);
    if (!runsAlongV) continue;
    const u = (own[0].min[ua] + own[0].max[ua]) / 2 - lo[ua];
    const side = u < width / 2 ? 'start' : 'end';
    const base = Math.max(...own.map((/** @type {any} */ b) => b.max[2]));
    for (const p of e.parts) {
      const b = local(p.world);
      if (STANDING.has(p.role) && b.min[2] === base) gables[side].push([b.min[va] - lo[va], b.max[va] - lo[va]]);
    }
  }
  const toWorld = (/** @type {{min: number[], max: number[]}} */ b, /** @type {number} */ height) => {
    const map = (/** @type {number[]} */ c) => {
      const w = [0, 0, top - height + c[2]];
      w[ua] = lo[ua] + c[0];
      w[va] = lo[va] + c[1];
      return w;
    };
    return core.applyBox(frame, { min: map(b.min), max: map(b.max) });
  };
  prefix('floor', input.derive('floor', {}, { width, depth, sill, gables, toWorld }));
}
