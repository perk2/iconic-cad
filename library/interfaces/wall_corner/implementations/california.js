// California corner: a turned stud in the
// through wall, and a strip of sheathing over the corner. build(participants,
// core) -> {parts, joints}.
//
// participants maps each role to {module, variant, port, size, exposed};
// exposed: the parts the role exposes by name ({id, role, material, catalog,
// box, layer?}), boxes in the connection frame: the through wall's end port
// frame, [normal, along, across] (normal out of the through wall's end,
// along up, across into its depth from the framing's outer face). The
// result is in the connection frame: parts {id, role, host, material,
// catalog, box, layer?}; joints {type, parts: side -> {of: role or
// "implementation", part: exposed name or own part id}}.
//
// The turned stud: the stud lumber lying flat in the through wall's cavity,
// against its inside framing face, from its end stud to one stud thickness
// past the butt wall's inside face. The strip: a piece of the through
// wall's end sheet's layer on the butt wall's face, covering the through
// wall's end, so the sheets meet at the corner; one layer only.

/**
 * @param {any} participants
 * @returns {{parts: any[], joints: any[]}}
 */
export function build(participants) {
  const { through, butt } = participants;
  const exposed = through.exposed;
  const stud = exposed.end_stud;
  const s = stud.box, bottom = exposed.bottom_plate.box, top = exposed.top_plate.box;
  const buttStud = butt.exposed.end_stud.box;

  const thick = s.max[0] - s.min[0]; // the stud's thickness, along normal
  const deep = s.max[2] - s.min[2]; // the stud's depth, across
  const inside = buttStud.min[0]; // the butt wall's inside face, along normal

  // The turned stud lies flat: its depth runs along normal, its thickness across.
  const turnedBox = { min: [inside - thick, bottom.max[1], s.max[2] - thick], max: [s.min[0], top.min[1], s.max[2]] };
  const length = turnedBox.max[0] - turnedBox.min[0];
  if (Math.abs(length - deep) > 1e-6) {
    throw new Error(`the turned stud would be ${length} long, not the stud's depth ${deep}: the butt wall's framing depth differs from the through wall's`);
  }
  const turned = { id: 'turned_stud', role: 'stud', host: 'through', material: stud.material, catalog: stud.catalog, box: turnedBox };

  const sheet = exposed.end_sheet;
  const t = sheet.box.max[2] - sheet.box.min[2];
  if (Math.abs(sheet.box.min[2] + t) > 1e-6) {
    throw new Error(`the through wall's exterior face has more than one workshop layer (its outermost sheet starts ${-sheet.box.min[2]} out from the framing, not ${t}); the corner strip covers only one`);
  }
  const strip = {
    id: 'sheathing_strip', role: sheet.role, host: 'through', layer: sheet.role, material: sheet.material, catalog: sheet.catalog,
    box: { min: [0, 0, sheet.box.min[2]], max: [t, through.size.height, buttStud.min[2]] },
  };

  const ref = (/** @type {string} */ of, /** @type {string} */ part) => ({ of, part });
  /** @type {Array<{type: string, parts: Object<string, {of: string, part: string}>}>} */
  const joints = [
    { type: 'corner_studs', parts: { stud: ref('butt', 'end_stud'), backing: ref('through', 'end_stud') } },
    { type: 'corner_studs', parts: { stud: ref('butt', 'end_stud'), backing: ref('implementation', 'turned_stud') } },
    { type: 'backer_to_stud', parts: { stud: ref('through', 'end_stud'), backer: ref('implementation', 'turned_stud') } },
  ];
  for (const plate of ['bottom_plate', 'top_plate']) {
    joints.push({ type: 'backer_to_plate', parts: { plate: ref('through', plate), backer: ref('implementation', 'turned_stud') } });
  }
  // The strip is nailed to the end stud's side; it only touches the plates' end grain.
  joints.push({ type: 'sheathing_to_framing', parts: { sheet: ref('implementation', 'sheathing_strip'), framing: ref('through', 'end_stud') } });
  return { parts: [turned, strip], joints };
}
