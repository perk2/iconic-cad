// Plain inline seam: the two end studs fastened
// together, no extra parts. build(participants, core) -> {parts, joints};
// see wall_corner/implementations/california.js for the shapes.

/** @returns {{parts: any[], joints: any[]}} */
export function build() {
  return {
    parts: [],
    joints: [{ type: 'panel_seam', parts: { a: { of: 'a', part: 'end_stud' }, b: { of: 'b', part: 'end_stud' } } }],
  };
}
