// Wall compiler: a framed wall panel and its
// workshop layers. compile(params, core) -> {size, parts, joints, ports};
// params resolved (catalog references replaced by their entries); core the
// library core (web/js/library/core.js). Pure: no imports.
//
// Framing: a bottom plate and the lower top plate over the full width (the
// upper top plate is fitted on site along the wall line); an end stud at
// each end; intermediate studs at the spacing from the left end, left out
// where they would overlap an end stud. Workshop sheets laid from the
// bottom-left in whole sheets, cut at the edges.

/**
 * @param {any} params
 * @param {any} core
 */
export function compile(params, core) {
  const { WallPanel, checkPositive, studPositions } = core.walls;
  checkPositive(params, ['width', 'height', 'spacing']);
  const panel = new WallPanel(params);
  const t = panel.thick, width = panel.width, height = panel.height;
  const { bottom, lower } = panel.plates();

  // Studs between the bottom plate and the lower top plate.
  const xs = studPositions(width, panel.spacing, t);
  /** @type {Array<[string, number]>} */
  const positions = [['stud_left', 0], ...xs.slice(1, -1).map((/** @type {[number, number]} */ [k, x0]) => /** @type {[string, number]} */ ([`stud_${k}`, x0])), ['stud_right', width - t]];
  for (const [id, x0] of positions) {
    panel.lumberPart(id, 'stud', x0, t, x0 + t, height - 2 * t);
    for (const plate of [bottom, lower]) panel.joint('stud_to_plate', { plate: plate.id, stud: id });
  }
  panel.sheets([...panel.parts]);

  const ends = { bottom_plate: bottom.id, top_plate: lower.id };
  return panel.result(panel.ports(panel.endExposes('left', ends), panel.endExposes('right', ends)));
}
