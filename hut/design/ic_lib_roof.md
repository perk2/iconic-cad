# Roof: a rafter roof derived from the walls

Status: proposal (2026-11-22). Design topics T6 (parts), T12 (geometry), T18
(derived modules). Hut decisions with the owner: a gable roof (*saltak*),
ridge east–west, pitch 27°, rafters (*sperretak*) on a ridge board, tied in
the lower third.

## 1. Problem

The hut has walls and a floor but no roof, and the roof is the largest gap
in the build book (PLAN T19). Two things are missing:

- **The hut's roof**: shape, structure, sizes, overhangs, and how it rests on
  the walls.
- **What Iconic CAD needs to model it**: every part is an axis-aligned box
  today, and a rafter is sloped with angled cuts (T12). And the roof follows
  from the walls (span, plate height, stud grid), like the floor, so it is a
  derived module, which raises the open question of where design-time
  choices such as the pitch live (ic_derived.md section 12, question 4).

## 2. Current state

- **Parts** are axis-aligned boxes `{min, max}` in the module's frame, placed
  by an affine transform restricted to right angles (`web/js/engine/affine.js`,
  `placement`: facings in multiples of 90°). PLAN T6: "the roof needs
  rotated parts".
- **Geometry checks** work on such boxes: `overlaps3`, `intersects`,
  `contact` (`web/js/library/geometry.js`), `faceToFace`, `nailable`
  (`web/js/library/framing.js`), and the part checks `checkParts`,
  `checkAdded` (`web/js/library/checks.js`). Fastener counts use contact
  lengths along box faces (`web/js/library/fastening.js`).
- **Derived modules**: `storey` (`library/modules/storey/derive.js`) finds the
  wall lines, runs `wall_line` (the upper top plate) and `floor`, and passes
  each child the input it needs. The upper top plates are the storey's own
  parts, so it knows where the roof sits.
- **The floor assumes the gables are east and west** (PLAN, REVISIT with the
  roof): its joists run north–south, parallel to the gable walls. This note
  confirms that.
- **Figures** draw boxes (`hut/tools/figures.mjs`, `isometric`).
- **Wall table** (Norwegian book): 48x148 studs at c/c 600 carry a roof that
  "spans freely across the whole width" up to 9.2 m at 7.0 kN/m² snow; the
  hut is 2.7 m wide. That table assumes the roof's load goes to the eaves
  walls, as with tied rafters.

## 3. The hut's roof

### 3.1 Decisions (owner, 2026-11-22)

| | Decision | Why |
|---|---|---|
| R1 | **Gable roof (*saltak*), ridge east–west**: eaves walls north and south, gable walls east and west | The floor already assumes it; the door in the west gable wall stays out from under the eaves; the rafters span the short way |
| R2 | **Pitch 27°** | Typical for Norwegian cabins (the sod-roof range, 22–27°) and within common cabin-area plans; at 30° or less the snow load is μ₁ = 0.8 times the ground load (NS-EN 1991-1-3), with no slope reduction to argue for; snow stays on the roof |
| R3 | **Rafters (*sperretak*), not trusses** | Site-built like the rest of the hut; trusses are a factory product to order and deliver |
| R4 | **Rafters on a ridge board, tied in the lower third** (version B in the discussion), not on a load-bearing ridge beam | No outward push on the walls once tied, and the roof's load goes to the eaves walls, as the wall table assumes; with a ridge beam the post in the west gable wall would land in the door opening (the ridge is at 1200 along the west wall line, the opening at 995 to 2005). The IRC rule: a ridge board only with rafter ties or ceiling joists across; a tie must be in the lower third of the roof's height (a collar tie in the upper third doesn't count) |

### 3.2 Geometry

With the framing 3600 x 2696 and the upper top plates' top at 2400 above
the floor's top:

| Quantity | Value |
|---|---|
| Run, outer framing face to ridge line | 2696 / 2 = 1348 |
| Rise at the ridge line, from the plate's outer top edge | 1348 x tan 27° ≈ 687 |
| Rafter, plate's outer edge to ridge, along the slope | 1348 / cos 27° ≈ 1513 |
| Rafter with an eaves overhang of 400 (horizontal) | ≈ 1513 + 449 ≈ 1962, so a 48x198 from 2.1 m stock |
| Plumb cut of a 48x198 rafter at 27° | 198 / cos 27° ≈ 222, so the ridge board ≥ 223 deep (48x223) |
| Birdsmouth seat depth, at most 1/4 of the depth | ≤ 49 for a 198 rafter |
| Rafters | c/c 600 from the west gable, x = 600 k (k = 1 to 5), plus a rafter over each gable wall: 7 pairs |

The rafter grid is the stud grid of the north and south walls (both 3600,
both on the 600 grid from either end) and the floor's joist grid, so
rafters, studs and joists line up where the panels allow. The doubled top
plate carries a rafter that misses a stud (the window panel's opening), so
lining up is a preference, not a rule.

### 3.3 Proposal for the rest

| | Proposal | Status |
|---|---|---|
| P1 | **Ties: ceiling joists at plate level**, one beside each rafter, nailed to it at the heel (the rafter–joist connection is the tie), resting on the upper top plates of the eaves walls; a flat ceiling at 2400 and a cold, ventilated loft above | **Owner, 2026-11-22: flat ceiling at the plates.** (The alternative was raised ties, up to a third of the rise, for a partly open ceiling) |
| P2 | **Rafters 48x198, ceiling joists 48x148, ridge board 48x223**, C24 | Placeholders, as the floor joists were: checked against Byggforsk's tables or a Eurocode 5 calculation once the snow load is known (the IRC tables stop at 70 psf, about 3.35 kN/m², below many Norwegian sites). At 1.35 m run the rafters are lightly loaded; the depth is set by the plumb cut and later insulation as much as by the load |
| P3 | **Overhangs: eaves 400, gables 300** (horizontal) | Placeholders. The gable overhang is a gable ladder (fly rafter and lookouts; 5.4) |
| P4 | **Gable framing**: gable studs on the gable walls' upper top plates, c/c 600 across the building, cut to the end rafter's underside; built on site | Done (5.4) |
| P5 | **Connections**: rafter to the upper top plate at the birdsmouth (nails or an angle bracket against uplift), rafter to ridge board, rafter to ceiling joist at the heel (count by pitch, span and snow load, as in the IRC's heel table), ceiling joist to plate, gable stud to plate and to the end rafter | Joint types new; schedule entries placeholders until the books are checked |
| P6 | **Roof build-up** (site layers on the rafters): roofing, battens, counter battens, underlay (*undertak*); ceiling insulation, vapour barrier and lining under the ceiling joists | Later, with T14; the roofing material is still open |
| P7 | **Chimney** for the stove: an opening between two rafters, with headers and trimmers | Later; position open |

Stage: everything here is site work.

## 4. What Iconic CAD needs

### 4.1 Sloped parts

Options:

1. **Boxes only**, rafters approximated by axis-aligned boxes. Wrong
   contacts, wrong lengths, useless cut list. No.
2. **Oriented boxes with cuts as data**: a part is a box in its own frame
   (as now) plus a **rotation** to its module's frame; cuts (the plumb cut at
   the ridge, the birdsmouth seat and heel, the tail cut) are recorded as
   planes or notches in the part's frame. Geometry checks and the figures
   use the box and the planar cuts; the cut list reads the length and the
   cut angles.
3. **True solids** from a geometry kernel in the browser (opencascade.js, a
   large WebAssembly download) or only in the FreeCAD export. Exact, but
   heavy, and against the static app's size (T12, decision 1).

**Proposal: option 2.**

- A part gets an optional `frame`: an orthonormal rotation, any angle, plus
  the part's `box` in that frame. Parts without it are unchanged (identity),
  so every wall and floor stays as it is, byte for byte.
- `cuts`: a list of half-spaces (plane cuts that keep the part convex: plumb,
  seat, tail) and of **notches** (a box removed from the part, for the
  birdsmouth). A notch is the one non-convex cut a rafter needs.
- **Checks** move from axis-aligned boxes to convex polyhedra (box ∩
  half-spaces): overlap by the separating-axis test, contact as coplanar
  faces with opposite normals and a shared area of at least the touch rule.
  An overlap inside a declared notch of one of the two parts is allowed (the
  plate in the birdsmouth); the notch must have a joint between the two.
- **Fastening**: contact lengths along the shared face, as now, in the face's
  own frame.
- **The engine** keeps right-angle placements of entities; the rotation
  lives on the part. World boxes become world polyhedra for sloped parts.
- **Figures** draw polyhedra faces; the isometric figure already draws
  polygons.

### 4.2 The roof as a derived module

`roof` is a derived module of its own (`library/modules/roof/derive.js`),
like `floor` and `wall_line`. It needs the storey's results (the upper top
plates, the outline, which walls face which way), so it runs after the
storey. Options considered: the storey runs the roof as it runs the floor
(but a roof isn't part of a storey); a `building` module on top runs the
storey and then the roof, the storey handing its results up (one big call,
all or nothing). **Decided (owner, 2026-11-22): the layout lists its derived
modules, and the engine runs them in dependency order**; no `building`
module is needed (the list is the building; a named group can come later,
for several storeys).

```json
"derive": [
  {"module": "storey"},
  {"module": "roof", "after": ["storey"], "parameters": {"pitch": 27, "ridge": "east_west", "eaves": 400, "gables": 300}}
]
```

- **The list lives in the layout**: which derived modules this design uses,
  in what order, with which parameters, is a design decision; the library
  holds the modules (schema, `derive.js`, the system's fixed values).
- **Entries**: `module`; `id` (default: the module; it prefixes the
  module's parts, `roof/rafter_3`, and other entries name it in `after`;
  two storeys would be `storey_1` and `storey_2`); `after` (ids);
  `parameters`. A single entry, as before, is still accepted.
- **Order and partial models**: the engine runs the entries in order of
  `after` (then of the list), adding each one's parts and joints to the
  model before the next. Each sees the model so far, so the roof's joints to
  the plates are `{model: 'storey/line_S1/upper_plate_1'}`. A failure is an
  issue and keeps what came before; an entry whose dependency failed is
  skipped, with an issue. An unknown `after`, a repeated id or a circle is
  an issue.
- **Parameters**, one list in the schema, as for catalog modules: the system
  file fixes some (`fixed`), and the layout entry gives the rest, the way a
  variant does for a catalog module. Every parameter gets its value from
  exactly one of them; the layout can't change a fixed one; a missing one is
  an issue. The layout gives lengths, angles and choices; catalog types
  (lumber, build-ups) come from the system file. New parameter types:
  `angle` (degrees, with min and max up to 90) and `choice` (with `values`).
- **Exports**: a derived module may return `exports` with its parts and
  joints, a summary for the modules that come after; they get it as
  `input.exports[<id>]` (part ids in it are the module's own; the model's
  are `<id>/<own id>`). This answers what a derived module reads (ic_derived.md
  section 12, question 4): the model so far, plus its dependencies' exports.
- **The storey's exports**, in world coordinates (model +x east, +y north):
  `outline` (the walls' framing in plan), `outside` (with the sheets),
  `plate_top` (the upper top plates' top), and `lines` with each wall line's
  `side` (south, north, east, west), panels and upper plate pieces.
- **The roof**: the system file fixes the rafter, ceiling joist and ridge
  board lumber and the spacing; the layout gives the pitch, the ridge
  direction and the overhangs. Output: rafters, ridge board, ceiling joists,
  gable studs, outriggers for the gable overhang; joints to the upper top
  plates and among its own parts.
- **The floor's gable assumption**: the floor still spans the short side;
  with the ridge along the long side, as in the hut, the two agree.

### 4.3 New joint types

`rafter_to_plate`, `rafter_to_ridge`, `rafter_to_joist` (the heel),
`joist_to_plate`, `gable_stud_to_plate`, `gable_stud_to_rafter`; later
`header_to_trimmer` for the chimney. The schedule entries in seh_no are
placeholders until checked (P5).

## 5. Steps

1. **Sloped parts in the library core** (4.1): the part frame, cuts and
   notches, the polyhedron checks, fastening on sloped contacts, the figures;
   tests with recorded results, including a rafter on a plate in its
   birdsmouth. Walls and floor unchanged.
2. **Derived modules as a list in the layout** (4.2): order, partial models,
   parameters from the system file and the layout, exports.
3. **The roof module**: rafters, ridge board, ceiling joists, with the new
   joints; the hut's layout lists the storey and the roof.
4. **Gable framing and the gable overhang.**
5. **Figures**: the storey with the roof, the roof framing alone, a gable.
6. Later: the roof build-up (P6), the chimney opening (P7), sizing checks
   with the snow load (code profile, T15).

### 5.1 Step 1, sloped parts (2026-11-22)

Done in `web/js/library/solids.js`, in the library core as `core.solids`:

- A part may have `frame` (origin and three unit axes, right-handed), `cuts`
  (half-spaces) and `notches` (convex regions bounded by planes, or a box).
  A real birdsmouth is not a box in the rafter's frame: its seat is level
  and its heel plumb, so a notch is given by planes.
- A solid is a list of convex pieces: the box clipped by the cuts, minus each
  notch (split into convex pieces around it). Overlap is the separating-axis
  test between pieces, deeper than the touch rule; contact is two opposite
  faces within the touch rule of each other sharing a polygon at least the
  touch rule wide (the largest, if pieces touch in several places).
- `checkParts`, `checkAdded` and `fastenJoints` use solids when a part is
  sloped or cut, and the box code otherwise, so walls and the floor are
  unchanged. Fastener rows run along the 'along' part's long axis as a
  vector, measured on the contact polygon.
- The engine takes `frame`, `cuts` and `notches` on a derived module's parts,
  checks them, and gives the part a bounding box as `world`.
- Tests (`tests/solids.mjs`): the 361 recorded box contacts and 300 random
  overlaps agree with the box code; a rafter at 27° in a 40 deep birdsmouth
  sits on a plate with no overlap and an 88.1 x 48 seat (40 / sin 27°);
  without the notch it overlaps; checks, fastening and the engine with a
  derived module's sloped part.
- Learned: the heel must be at the wall's outer face including the sheathing
  (the OSB runs up to the plate's top at 2400), so the seat bears on the
  plate and the sheet's top edge; a heel at the framing's face would put the
  rafter's tail through the OSB.
- Not done yet: the figures for sloped parts (step 5).

### 5.2 Step 2, derived modules as a list (2026-11-22)

Done:

- The engine (`web/js/engine/compile_design.js`, `deriveModules`,
  `deriveOne`) runs the layout's `derive` as one entry or a list, as in 4.2:
  order by `after`, the model so far and the dependencies' exports as input,
  failures kept to the failing entry and its dependants, parameters checked
  (unknown, fixed by the system, missing, out of range, not a choice, a
  catalog type from the layout). Children run through `input.derive` get
  the same check for missing values.
- The builder takes `angle` and `choice` parameters, and a derived module's
  system file may fix only some parameters; the asset holds the fixed ones.
- The storey exports `outline`, `outside`, `plate_top` and `lines`; for the
  hut: framing 0 to 3600 by 12 to 2708, outside -12 to 3612 by 0 to 2720,
  plates' top at 2400, lines south, east, north and west.
- Tests: `tests/derive_graph.mjs` (lists, order, exports, partial models,
  skipping, parameters, malformed lists) and builder cases in
  `tests/library_builder.mjs`.

### 5.3 Step 3, the roof module (2026-11-22)

Done: `library/modules/roof/` (schema, `derive.js`, seh_no system file), new
joint types `rafter_to_plate`, `rafter_to_ridge`, `rafter_to_joist`,
`joist_to_plate` with placeholder schedule entries, and 48x223 in the
catalog; the hut's layout lists the storey and the roof (27°, ridge
east–west, eaves 400).

- **Rafters**: sloped parts, a box in a frame tilted to the pitch, with a
  plumb cut at the ridge board, a plumb tail cut `eaves` out from the wall's
  outer face, and a birdsmouth notch whose heel is at that face (sheets
  included) and whose seat is on the plates' top, a quarter of the depth deep
  square to the rafter (≈ 109 long at 27°). Along the ridge: an end rafter
  flush with each end of the framing, the rest at the spacing from the start
  (24, 600, ... 3000, 3576 for the hut: 7 pairs).
- **Ridge board** over the middle of the framing (1336 to 1384), the full
  length of the framing, its top level with the rafters' tops (3247 above
  the floor's top); the module refuses a ridge board shallower than the
  rafters' plumb cut (at 35° a 48x198's plumb cut is 242, deeper than 223).
- **Ceiling joists** on the plates beside each rafter (on the inner side at
  the east end), from one eaves wall's outer framing face to the other's.
- **Joints by contact**: the gable walls' upper plates lap the corners, so the
  end rafters and end joists bear on them; two rafters sit over a joint
  between upper plate pieces and bear on both. For the hut: 16
  `rafter_to_plate`, 14 `rafter_to_ridge`, 14 `rafter_to_joist`, 14
  `joist_to_plate`.
- **Figures**: `figures.mjs` draws sloped parts (their faces toward the
  viewer); new `roof_framing.svg`; the storey figures and the animation
  include the roof. The drawing order sorts by bounding boxes, which is
  rough where sloped parts cross; good enough for now.
- Tests: `tests/roof.mjs` (the hut's roof: counts, positions, ridge, tails,
  seat, joists, joints; the ridge north–south, no overhang, no storey, a
  shallow ridge board, the storey kept when the roof fails).
- Open: the gable framing and the gable overhang (step 4); the joist ends
  are square (no slope cut needed: their tops stay under the rafters' tops
  at the plate).

### 5.4 Step 4, the gables (2026-11-22)

Done, in the roof module (new parameters `gables` from the layout,
`gable_stud` and `lookout` from the system file, 48x148 and 48x98; joint
types `stud_to_rafter` and `lookout_to_rafter`; gable studs on the plate use
`stud_to_plate`):

- **Gable studs** stand on each gable wall's upper plate, its full depth
  (x 0 to 148 in the west), at the spacing across the building from the
  framing's edge (612, 1212, 1812 for the hut), cut at the top to the end
  rafter's underside (a plane cut), nailed to it. None across the ridge line,
  none shorter than 150 at its short side (2412 would be 89).
- **No ceiling joist at the gables**: the end joists lay on the gable plates,
  where the studs stand. The gable wall carries the end rafters along their
  length, so they need no tie there; the joists are beside the rafters
  between the gables (5 for the hut).
- **The gable ladder** (`gables` > 0): the ridge board runs out to 300 beyond
  the gable walls' outer faces (-312 to 3912); a fly rafter hangs at each
  edge from it (the rafter without a birdsmouth); lookouts, 48x98 laid flat
  with their tops flush with the rafters', run from the fly rafter to the end
  rafter, c/c 600 up the slope from the heel and clear of the ridge board (3
  per side and gable), nailed through each rafter into their ends.
- For the hut: 18 rafters (4 of them fly rafters), 12 lookouts, 6 gable
  studs, 5 ceiling joists; joints 16 `rafter_to_plate`, 18
  `rafter_to_ridge`, 10 `rafter_to_joist`, 10 `joist_to_plate`, 6
  `stud_to_plate`, 6 `stud_to_rafter`, 24 `lookout_to_rafter`.
- With `gables: 0` there is no ladder and the ridge board is the framing's
  length.
- Figures: the drawing order now uses separating planes between convex
  pieces, compared only where their outlines overlap on screen (the bounding
  box order drew joists over rafters and hid a plumb cut wrongly).
- **Source and status of the ladder: open.** The detail is North American
  practice, not checked. The common ways to carry a gable overhang: (1)
  the roof's sheathing, battens and a bargeboard (*vindski*) extended past
  the gable, for small overhangs; (2) a gable ladder, a fly rafter joined to
  the end rafter by short lookouts, hung on nails (modelled here); (3)
  outlookers running over the gable, notched into the end rafter, back to
  the first full rafter as cantilevers, for larger overhangs. Tømrerboka
  lists the same options without sizes; to check in Byggforsk (*takutstikk
  ved gavl*, *vindski*). No IRC limit is remembered with confidence; US wind
  guidance (FEMA, IBHS) favours short rake overhangs and outlookers back to
  the second rafter over ladders. If option 1 fits a hut-sized overhang, the
  ladder goes and the roof's build-up carries the overhang.
- Open: the ladder's lookouts near the eaves leave the fly rafter's tail
  cantilevered (a fascia or subfascia ties the tails, later with the roof's
  build-up); the gable triangle has no sheathing yet (T14, P6).

## 6. Consequences

- Parts can be sloped; the rest of the library pays nothing for it.
- The checks get more general (and slower) for sloped parts only.
- Design-time options exist for derived modules; a layout can say "pitch
  27°" without a new variant.
- The roof module depends on the storey's plates and grid, as the floor
  does on the walls.
- The build book and the bill of materials get the roof's parts, joints and
  cut angles once the consumers exist.

## 7. Open questions

1. *(Decided: flat ceiling at the plates, P1.)*
2. **Roofing material**: it sets the battens and the underlay, and must allow
   27°.
3. **Snow load**: the characteristic ground load for the site (kommune and
   altitude); then the rafter and ceiling joist sizes (P2) from Byggforsk or
   Eurocode 5.
4. **Overhangs (P3)** and how the gable overhang is carried.
5. **The kommune's plan** for the site: does it allow a 27° gable roof, and
   does it say anything about the ridge direction or roofing?
6. **Cuts**: are half-spaces plus box notches enough, or will other parts
   (a hip, a valley, a chimney saddle) need more? Not for the hut.
7. *(Decided: the layout lists the derived modules, 4.2.)*
8. **Uplift**: whether the rafter-to-plate connection needs a metal
   connector at the site's wind load. Part of checking *vindforankring*
   (wind anchorage, the continuous load path for uplift) from the roof down
   to the foundation (PLAN, TODO).
