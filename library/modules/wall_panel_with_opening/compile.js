// Wall-with-opening compiler: a framed wall panel
// with one window or door, centred. compile(params, core) as for wall_panel.
//
// The header sits on the jacks; its underside is the top of the rough
// opening. Above it cripples up to the lower top plate when the space is at
// least MIN_TOP_CRIPPLE; with no space the header is nailed to the plate.
// Cripples (under a window's rough sill, above the header) only at grid
// positions between the jacks. A door's bottom plate runs through the
// opening and stays, under the threshold: its rough opening starts on the plate.

const MIN_CRIPPLE = 200; // mm; cripples under a rough sill; placeholder
const MIN_TOP_CRIPPLE = 100; // mm; cripples above a header (US framers stop at about 4"); placeholder

/**
 * @param {any} params
 * @param {any} core
 */
export function compile(params, core) {
  const { WallPanel, checkPositive } = core.walls;
  checkPositive(params, ['width', 'height', 'spacing']);
  const panel = new WallPanel(params);
  const t = panel.thick, width = panel.width, height = panel.height;
  const { unit, header } = params;
  const door = unit.kind === 'door';
  const [roW, roH] = unit.rough_opening;
  const x0 = core.framing.half(width - roW);
  const x1 = x0 + roW;
  const z0 = params.sill_height;
  const z1 = z0 + roH;
  const [ply, plyDepth] = header.section; // each ply: thickness into the wall, depth up
  const studTop = height - 2 * t;

  if (door && z0 !== t) throw new Error(`a door stands on the bottom plate: its sill_height must be ${t}, got ${z0}`);
  if (!door && z0 - 2 * t < MIN_CRIPPLE) {
    throw new Error(`sill_height ${z0}: the cripples under the rough sill would be shorter than ${MIN_CRIPPLE}`);
  }
  if (x0 - 2 * t < 2 * t) {
    throw new Error(`the rough opening (${roW}) with jack and king studs doesn't fit: each king must clear the end stud by at least ${t}`);
  }
  if (2 * ply > panel.deep) throw new Error('the two header plies are thicker than the framing');
  if (roW < 3 * t) throw new Error(`the rough opening (${roW}) is narrower than three stud thicknesses`);

  // The header on the rough opening; above it cripples up to the plate.
  const zh0 = z1, zh1 = zh0 + plyDepth;
  const space = studTop - zh1;
  if (space < 0) {
    throw new Error(`the header (top at ${zh1}) doesn't fit under the lower top plate (${studTop}): `
      + `the rough opening's top (${z1}) must be at ${studTop - plyDepth} or below`);
  }
  if (space > 0 && space < MIN_TOP_CRIPPLE) {
    throw new Error(`the space above the header (${space}) is too short for cripples (${MIN_TOP_CRIPPLE}): use a deeper header or move the opening`);
  }
  const topCripples = space > 0;

  // Plates, whole (a door's too).
  const { bottom, lower } = panel.plates();
  const stud = (/** @type {string} */ id, /** @type {string} */ role, /** @type {number} */ xa,
    /** @type {number} */ za, /** @type {number} */ zb, top = true) => {
    panel.lumberPart(id, role, xa, za, xa + t, zb);
    panel.joint('stud_to_plate', { plate: bottom.id, stud: id });
    if (top) panel.joint('stud_to_plate', { plate: lower.id, stud: id });
  };

  // End studs, king and jack studs.
  stud('stud_left', 'stud', 0, t, studTop);
  stud('stud_right', 'stud', width - t, t, studTop);
  for (const [side, kingX, jackX] of /** @type {Array<[string, number, number]>} */ ([['left', x0 - 2 * t, x0 - t], ['right', x1 + t, x1]])) {
    stud(`king_${side}`, 'king', kingX, t, studTop);
    stud(`jack_${side}`, 'jack', jackX, t, zh0, false);
    panel.joint('jack_to_king', { jack: `jack_${side}`, king: `king_${side}` });
  }

  // Header: two plies on the jacks, from king to king.
  const plies = [
    panel.lumberPart('header_outer', 'header', x0 - t, zh0, x1 + t, zh1, { lumber: header, y0: panel.y0, y1: panel.y0 + ply }),
    panel.lumberPart('header_inner', 'header', x0 - t, zh0, x1 + t, zh1, { lumber: header, y0: panel.y1 - ply, y1: panel.y1 }),
  ];
  for (const p of plies) {
    for (const side of ['left', 'right']) {
      panel.joint('header_to_king', { header: p.id, king: `king_${side}` });
      panel.joint('header_on_jack', { header: p.id, jack: `jack_${side}` });
    }
    if (!topCripples) panel.joint('header_to_plate', { header: p.id, plate: lower.id });
  }

  // A window's rough sill, flat between the jacks.
  if (!door) {
    panel.lumberPart('sill', 'sill', x0, z0 - t, x1, z0);
    for (const side of ['left', 'right']) panel.joint('sill_to_jack', { sill: 'sill', jack: `jack_${side}` });
  }

  // Grid studs: studs outside the opening, cripples between the jacks; a
  // grid position closer than one stud thickness to an end, king or jack
  // stud is left out.
  const taken = [[0, t], [width - t, width], [x0 - 2 * t, x0], [x1, x1 + 2 * t]];
  const near = (/** @type {number} */ x) => taken.some(([a, b]) => x < b + t && x + t > a - t);
  /** @type {Array<[number, number]>} */
  const inside = [];
  for (const [k, x] of panel.grid()) {
    if (near(x)) continue;
    if (x0 <= x && x + t <= x1) inside.push([k, x]);
    else stud(`stud_${k}`, 'stud', x, t, studTop);
  }
  if (!inside.length && (topCripples || !door)) {
    throw new Error(`no stud grid position between the jacks (${x0} to ${x1}) for cripples: only one standard window and door are supported`);
  }
  for (const [k, x] of inside) {
    if (topCripples) {
      const id = `cripple_top_${k}`;
      panel.lumberPart(id, 'cripple', x, zh1, x + t, studTop);
      panel.joint('stud_to_plate', { plate: lower.id, stud: id });
      for (const p of plies) panel.joint('cripple_to_header', { cripple: id, header: p.id });
    }
    if (!door) {
      const id = `cripple_bottom_${k}`;
      panel.lumberPart(id, 'cripple', x, t, x + t, z0 - t);
      panel.joint('stud_to_plate', { plate: bottom.id, stud: id });
      panel.joint('cripple_to_sill', { cripple: id, sill: 'sill' });
    }
  }

  panel.sheets([...panel.parts], [x0, z0, x1, z1]);

  const top = { top_plate: lower.id };
  return panel.result(panel.ports(
    panel.endExposes('left', { bottom_plate: bottom.id, ...top }),
    panel.endExposes('right', { bottom_plate: bottom.id, ...top }),
  ));
}
