# Design note: ic_lib_floor, the joist floor and walls on it

Status: implemented in the prototype, 2026-11-15; section 11 revises it
from the book review (2026-11-17, implemented). **Superseded in part
(2026-11-19):** the floor is now a derived module of the storey
([ic_derived.md](ic_derived.md), section 11): its outline, sill and
blocking come from the walls, and the placed floor, `wall_on_floor` and
the sliding ports (F12) are gone. The floor's own rules (sill, rims,
joists, blocking, subfloor; section 11) are unchanged; the note and the
implementation were each reviewed by Fable and revised (section 10).
Written without discussion while the user was away; every decision is an
assumption in section 3 and comes up in the next joint review. Topics: T3
(sliding ports), T14 (the floor build-up), T18 (floors). T7's open question
(implementations that depend on the position) is not answered here; a
T-junction will. Builds on
[ic_lib_wall.md](ic_lib_wall.md), [ic_joints.md](ic_joints.md) and
[ic_lib_opening.md](ic_lib_opening.md).

## 1. Problem

The hut stands on a joist floor over a ventilated crawl space (T14, T18). The
model has walls only: no joists, rim, subfloor or insulation underneath, and
nothing the walls stand on. The bill of materials and the build book need the
floor, and the walls need something to bear on before a foundation can be
designed under it.

T18 sets the direction: walls stay on the grid; the floor is a derived
assembly whose outline follows the outside of the wall loop (platform
framing: walls stand on the subfloor, flush with the rim); wall-on-floor
connections are derived, not stored, but use a full `wall_on_floor`
interface. T3 lists walls on a floor as a case for **sliding ports**: a wall
can land anywhere along a floor edge.

## 2. Current state

- **v1:** no floor model; the foundation is a derived 3D-only slab.
- **Prototype:** two wall modules; every port is `fixed` (`PORT_KINDS` in
  the library builder and `web/js/engine/compile_design.js`); a port
  is used by one connection at most (the engine's `port_in_use` check); the
  wall's `bottom` port is declared and fills no role. The builder bakes each
  implementation per port pair and variant pair; the engine composes stored
  transforms. Compilers make parts only for workshop build-up layers
  (`web/js/library/walls.js`). Design time never calls compilers.
- **The tension:** a floor whose size follows the wall loop is not known at
  library time, so it can't be baked; computing it at design time would mean
  running a compiler in the engine, which the prototype rules out.

## 3. Decisions (assumptions, to review)

| | Decision |
|---|---|
| F1 | For the prototype the floor is a module, `floor`, with variants like the walls (`3600x2720` for the hut). T18's derived floor stays the direction; this prototype builds the pieces it would use: the floor compiler, sliding ports and the `wall_on_floor` interface. Choosing the variant from the wall loop, or deriving the connections, comes later |
| F2 | Joists span the floor's `depth` (y); the variant orients the floor by its width and depth. Rim joists run along the width at both ends of the joists; the end joists at the floor's sides are doubled (`joist_west`, `joist_west_2`, and the same east), because the walls above them run parallel to the joists and their bottom plates need timber under them. Joists sit at the spacing measured from the west end, like studs |
| F3 | The floor build-up uses the same three groups, with face A the exterior side as everywhere else: `face_a` is down (the wind barrier board towards the crawl space), `cavity` between the joists (insulation), `face_b` up (the subfloor). The floor compiler makes parts for the sheet layers on `face_b`, whatever their stage; material layers make no parts. A floor is one module, so its site layers are not split across panels, which is why walls make parts only for workshop layers (changed after review: the draft made face A the top) |
| F4 | Everything in the floor is built on site: joists, rims and subfloor parts have stage `site`, so every floor joint is a site joint (J2) |
| F5 | Subfloor sheets are laid from the south-west corner with their long side (the larger size) across the joists, cut at the edges. Rows are staggered by half a sheet: every other row starts with a half sheet. A seam across the joists must land on a joist with at least 20 mm bearing on each side, or the compiler raises an error |
| F6 | The floor's outline is the walls' outline: the rim's outer face and the subfloor's edge are flush with the walls' exterior faces (the bracing sheet's outer face). The bracing sheet stands on the subfloor's outer edge. This is the only layout `flush` with no offset allows; more common practice puts the framing flush with the rim and laps the sheathing or wind barrier down over it, which needs an offset the floor can't know. Open for the owner |
| F7 | A new port kind, `sliding`. The compiler gives a sliding port a `slide` (`{axis, length, step}`), and the connection stores `at`, the position along that axis from the port's origin, a multiple of `step` (1 mm for the floor). The engine moves the sliding port's frame by `at` along its slide axis wherever it uses that frame (walk, loop closure, assemble); the stored transform is unchanged. The builder bakes at position 0 |
| F8 | A port may accept several connections: `many: true` in the schema. The floor's edge ports have it; the engine's `port_in_use` check skips such ports. A port may be `optional: true`: no `free_port` warning when it is unconnected. The walls' `bottom` ports are optional, so walls-only layouts stay without issues, and so T18's derived wall-on-floor connections can leave them unstored later |
| F9 | `wall_on_floor`: roles `floor` (a floor edge port) and `wall` (a wall's `bottom` port), relation `wall bears_on floor`, placement `flush` with reference `floor`, no checks. Its implementation `bearing` adds no parts and no joints for now: the bottom plate is fastened through the subfloor into the rim or a joist, which the touch check (J3) doesn't allow, and joints to the subfloor sheets would depend on the position, which an implementation on a sliding port must not (F7). The wall-to-floor fasteners are missing from the totals until this is solved |
| F10 | The builder stores each sliding pair's range: from minus the other participant's lowest point along the slide (0 for a wall) to the slide's length minus its highest point, from its compiled parts placed at position 0; a pair whose range is empty is excluded (reason `fits`). Steps count from 0. The engine checks `at` against the pair's range and step. Overlap between walls on one edge is not checked; loop closure catches positions that disagree with the walls |
| F12 | Implementations on sliding ports must not depend on the position. The builder enforces what it can: the role filled by a sliding port exposes nothing, and no implementation part is hosted on it. Only the reference role may be filled by a sliding port, so the connection frame is the sliding port's frame and the range is simple to compute; this also rules out two sliding ports in one connection (one `at` couldn't say which slides) |
| F13 | The walk places entities through fixed-port connections first, and takes a sliding-port connection only when no fixed one is left; then it returns to fixed ones. Walls place walls, one floor connection places the floor, and the others check positions with a 0.5 mm tolerance (the step is 1 mm). A wrong `at` is reported on its own connection, and each gap also names the connection that placed the floor, in case that one is wrong |
| F11 | Catalog additions, placeholders: lumber `48x198`, sheet `chipboard_22` (600 × 2400, 22 mm), fastener `screw_42x55`; build-up `floor`; joint types `joist_to_rim` and `doubled_joist` |

## 4. Proposal

### 4.1 Library source

**System** (`library/systems/seh_no/system.yaml`), placeholders:

```yaml
catalog:
  lumber:
    "48x198": {section: [48, 198], grade: C24}
  sheets:
    chipboard_22: {material: chipboard P5, thickness: 22, size: [600, 2400]}
  fasteners:
    screw_42x55: {kind: screw, diameter: 4.2, length: 55}
buildups:
  floor:
    description: Floor over a ventilated crawl space, designed as heated.
    face_a:                   # down from the joists (exterior, the crawl space)
      - {role: wind_barrier, material: wind barrier board, thickness: 12, stage: site}
    cavity:
      - {role: insulation, material: mineral wool, stage: site}
    face_b:                   # up from the joists
      - role: subfloor
        sheet: chipboard_22
        stage: site
        fastening: {fastener: screw_42x55, from: sheet, along: framing,
                    spacing: 300, edge_spacing: 150, end_distance: 10}
fastening:
  joist_to_rim: {fastener: nail_28x95, from: rim, count: 3}
  doubled_joist: {fastener: nail_28x95, from: a, along: b, spacing: 300, end_distance: 50}
```

**Joint types** `joist_to_rim`: sides `rim` (the rim joist) and `joist` (a
joist, its end against the rim); `doubled_joist`: sides `a` (the end joist)
and `b` (the joist beside it).

**Module** `library/modules/floor/`:

- `schema.yaml`: parameters `width` (x, along the rims), `depth` (y, the
  joists' direction), `spacing`, `joist` (lumber), `buildup`; ports `south`,
  `east`, `north`, `west`, each `kind: sliding`, `many: true`, roles
  `[wall_on_floor.floor]`.
- `systems/seh_no.yaml`: `fixed: {joist: "48x198", spacing: 600, buildup:
  floor}`, variant `"3600x2720"` (width 3600, depth 2720).
- `compile.js`, section 4.2.

**Wall modules**: the `bottom` port of `wall` and `wall_with_opening` fills
`wall_on_floor.wall`.

**Interface** `library/interfaces/wall_on_floor/`: `interface.yaml` (roles
`floor` and `wall`, each exposing nothing yet; relation; placement `flush`,
reference `floor`; `checks: []`), `implementations/bearing.js` (no parts, no
joints), `systems/seh_no.yaml` (`implementations: [bearing]`, stage `site`).

### 4.2 Floor compiler

Floor coordinates, in mm: origin at the south-west corner of the floor's
outline, at the underside of the joists; x along the width (east), y along
the depth (north), z up. With `t` × `d` the joist section (48 × 198):

- **Rims:** `rim_south` (y 0 to `t`) and `rim_north` (y `depth - t` to
  `depth`), the full width, z 0 to `d`.
- **Joists:** between the rims (y `t` to `depth - t`): `joist_west` at x 0
  and `joist_west_2` beside it, `joist_<k>` at `k * spacing - t/2`, left out
  where they would overlap an end pair, and `joist_east_2`, `joist_east` at
  the east side. Each joist end gets a `joist_to_rim` joint; each end pair a
  `doubled_joist` joint.
- **Subfloor:** each sheet layer on `face_b`, stacked up from the joist tops,
  laid as in F5; each piece joined to the joists and rims it lies on
  (`sheathing_to_framing`). A material layer on `face_b` is an error for now
  (a finished floor on top comes later).
- **Size:** width, depth, and height = joist depth plus the `face_b` sheet
  thicknesses (220). `face_a` and the cavity make no parts and don't count.
- **Ports**, on the top face (z = height), the slide along each edge:

| Port | origin | normal | along | across | slide length |
|---|---|---|---|---|---|
| `south` | (0, 0, h) | +z | +x | +y | width |
| `east` | (width, 0, h) | +z | +y | −x | depth |
| `north` | (width, depth, h) | +z | −x | −y | width |
| `west` | (0, depth, h) | +z | −y | +x | depth |

Going round the floor this way, `along` follows each wall's run seen from
outside, left to right, so a wall's `bottom` port (origin at its exterior
face, left end; `along` the run; `across` into the wall) lands with `flush`:
`normal` opposite, `along` and `across` the same. The ports have the
opposite hand to the walls' `bottom` ports, which is what `flush` needs.

### 4.3 Builder

- `PORT_KINDS` gains `sliding`. A schema port may have `many` and
  `optional` (true or false).
- A compiled port of kind `sliding` must have `slide: {axis, length, step}`,
  with `axis` `along` or `across`, `length` and `step` positive, and the far
  end of the slide (origin + length × axis) on the panel's faces; a fixed
  port must not have `slide`.
- Implementations are baked at position 0 (F12): only the reference role may
  be filled by a sliding port; that role must expose nothing; no
  implementation part may be hosted on it or reach into its module's box.
- Each pair with a sliding port gets `range: [0, max]`, with max the slide
  length minus the other participant's extent along the slide (from its
  parts in the connection frame); a pair with max below 0 is excluded with
  reason `fits`.
- Compiled variants of the floor go through the same checks as walls
  (parts inside the panel, joints touching, fastening).

### 4.4 Engine

- `PORT_KINDS` gains `sliding`; `at` is a known connection field.
- **Check:** when a role's port is sliding, the connection must have `at`, a
  number within the pair's `range` and a multiple of the slide's `step`
  (rule `position`); `at` on a connection with no sliding port is ignored
  with a warning. A port with `many` may be used by several connections; an
  `optional` port gets no `free_port` warning.
- **Place:** the sliding port's frame is moved by `at` along its slide axis
  inside the port-to-world mapping, so the walk, loop closure and assemble
  all use it. The walk takes fixed-port connections first (F13).
- **Model:** connections carry `at` when it is valid.
- Nothing floor-specific; the floor's parts and joints arrive like the
  walls'.

### 4.5 Hut fixture

`tests/fixtures/engine/hut_floor.json`: the hut with the window and door
(`hut_openings.json`) plus a floor `F` (`floor/3600x2720`) and one
`wall_on_floor` connection per wall panel:

| Edge | Walls and `at` |
|---|---|
| `south` | S1 0, S2 1800 |
| `east` | E1 160, E2 1360 (the east run butts, so it starts one wall depth in) |
| `north` | N1 0, N2 1200, N3 2400 |
| `west` | W1 160, W2 1360 |

Expect no issues: the walls place each other from the anchor S1, one floor
connection places the floor, and the other eight close loops with a gap of
0. The outline stays
3600 × 2720; the floor's top is at the walls' bottom (the floor lies from
z = −220 to 0).

### 4.6 Tests

- Builder: the floor compiles (parts and roles, joist positions, staggered
  sheet pieces and their seams on joists, joint counts by hand for a few);
  every touching pair has a joint; `wall_on_floor` is baked for 4 floor
  ports × 3 wall variants with their ranges; sliding-port validation
  (missing `slide`, a fixed port with `slide`, a slide running off the
  panel, an unknown axis, `many` not a boolean); a seam off the joists; a
  material layer on the floor's `face_b`; a role on a sliding port that
  exposes parts; a wall too long for a floor edge (excluded, `fits`). The
  unknown-port-kind tests use another made-up kind, since `sliding` now
  exists.
- Engine: the hut on its floor (no issues, the floor's world box, the walls
  standing on it, no collisions, parts and fasteners per stage); the anchor
  on the floor; broken: `at` missing, out of range, not on the step, `at`
  that disagrees with the walls (a loop gap on that connection), `at` on a
  connection without a sliding port (warning), a wall's `bottom` used twice.

## 5. Steps

1. This note; Fable review; apply.
2. Builder: sliding ports, `many`, `slide` validation; tests.
3. Floor module, catalog, build-up, joint type; tests.
4. `wall_on_floor` interface and the walls' `bottom` ports; tests.
5. Engine: sliding ports, `at`, `many`; hut fixture and broken cases.
6. Fable review of the implementation; apply. Done.

## 6. Out of scope

- The foundation (piers or point foundations, beams under the joists) and
  anchoring the floor to it: a separate note.
- Wall-to-floor fastening (F9).
- A derived floor (F1), floor openings (a trap door, a stair), cantilevers,
  blocking or bridging between joists, joist hangers.
- Span checks (the code profile, T15).
- A finished floor on top.

## 7. Options considered

- **The floor derived at design time** (T18 as written): the engine would
  run a floor compiler, against "design time never calls compilers"; or the
  library would bake every floor size the walls could make, which is finite
  on a grid but large. Deferred, not rejected (F1).
- **Floor variants chosen by the engine from the wall outline**: a step
  towards T18 with baked variants; it needs a rule for matching and an issue
  when nothing matches. A natural next step once a floor and walls exist.
- **Fixed corner ports on the floor** instead of sliding ports: works with
  the existing engine for one wall per corner, but leaves the other walls
  unconnected (free `bottom` ports and no support check).
- **Baking sliding-port implementations per position** on a grid (T7's open
  question): needed when an implementation depends on the position
  (T-junction blocking, joints to the sheet under a plate); the east and west
  runs start 160 in, so the grid would have to be fine. Not needed while
  `bearing` has no parts or joints.
- **Joints through an intermediate part** (bottom plate to rim through the
  subfloor): would solve F9 position-independently, but needs a rule for
  what may lie between, which belongs in the joints design (ic_joints open
  questions).
- **Walls standing on the rim, the subfloor laid between them**: also lets
  the bottom plate touch the rim, but T18 chose platform framing, and the
  subfloor is the working platform for raising the panels.

## 8. Consequences

- Sliding ports exist in the builder and engine, with `at` in the layout:
  the first port kind besides `fixed`.
- A port can carry several connections.
- The floor is the first module whose parts are all site-built, and the
  first whose compiler makes parts from site layers.
- Every wall now has a connection to the floor, so the layout is one
  connected structure with more loops; loop closure checks the floor against
  the walls.
- The variant name `3600x2720` includes the wall depth (2400 + 2 × 160), so
  another build-up or system needs another floor variant; the stored floor
  entity, its nine connections and the hand-computed `at` values are what a
  derived floor would replace.
- The model's fastener totals leave out the wall-to-floor nails, which are
  the anchoring joints (F9).

## 9. Open questions

- Wall-to-floor joints (F9): joints through an intermediate part, or baking
  per position.
- The derived floor (F1): bake floor variants per outline and let the engine
  pick, or something else?
- Should the rim run along the width (as here) or the depth? Norwegian
  practice for joist floors on beams over a crawl space; the end joists
  carry the wall above on two sides and the rims on the other two.
- The subfloor: chipboard or plywood, sheet size, glued as well as screwed,
  staggered seams.
- Where the wind barrier board under the joists is fastened, and whether the
  crawl space side needs battens.
- Range and overlap checks for walls on a sliding port (F10).
- How the floor sits on the foundation: a `bottom` port, beams as their own
  module or part of the floor.
- Build order: with the subfloor laid first, the insulation and the wind
  barrier board are fitted from the crawl space; this affects where the
  board is fastened (T10).
- The rim's outer face is left bare under F6 and needs the walls' wind
  barrier lapped over it.

## 10. Review (Fable, 2026-11-15)

Fable ran the hut variant's boxes and port frames through the builder's
`contact`, `fastener_count`, `_check_frame` and `port_hand`: all joints
touch, the seam lands on a joist, the port frames pass, and the `at` values
put every wall where the walls-only hut has it. Changes made:

- Walls-only layouts would get a `free_port` warning per wall: `optional`
  ports (F8).
- The walk placed walls from the floor: fixed-port connections first (F13).
- How `at` moves the frame, including the assemble pass (F7, 4.4).
- Two sliding ports in one connection: rejected (F12).
- Position independence enforced instead of documented (F12).
- The range check: per pair, from the other participant's extent, with a
  step; pairs that can't fit are excluded (F10).
- The east and west bottom plates had 36 mm over timber: doubled end joists
  (F2).
- Staggered subfloor seams and a seam check (F5).
- Face A kept as the exterior side, so the subfloor is on `face_b` (F3).

Kept, with Fable's notes recorded: F1 (acceptable for the prototype; the
compiler, interface and port frames carry over), F6 (asked of the owner),
F9 (a joint through the subfloor to the edge member is the likely fix; not
small).

### Implementation review (Fable, 2026-11-15)

Fable tried the engine with malformed and wrong positions, anchors on the
floor and walls at all four facings, and the compiler across the schema's
sizes. Changes made:

- A wrong `at` on the connection that placed the floor showed up as gaps on
  every other floor connection: each gap now names the placing connection
  too (F13). Choosing the position most connections agree on is left open.
- The clearance check at position 0 didn't stand for other positions:
  implementation parts may not reach into the sliding module's box (4.3).
- Subfloor rows or pieces under 100 mm, which left strips with no joints or
  touching rims and joist ends without joints: an error (`MIN_SHEET`).
- A grid joist against the east pair (a triple joist with no joint): left
  out when closer than 100 mm (`MIN_BAY`). With staggered seams this can
  make a seam miss its joist, which the compiler then reports, naming the
  nearest joist.
- `at` 1 mm off passed: loops through a sliding port use 0.5 mm.
- A bad `at` left the floor port counted as free; the "no possible pair"
  message now includes fit; the seam error names the nearest joist.
- Tests for these, and doc fixes in the wall note and PLAN.md.

Open, from the review: whether the floor's edge ports should be `optional`
(a floor with walls on three edges gets a `free_port` warning); whether a
spacing the sheets can't seam on (450, 500) should cut sheets back instead
of failing; the range counts the other module's compiled parts only, not
implementation parts or site layers; overlap between walls on one edge is
not checked.

## 11. Revision: sill, end joists and blocking (2026-11-17)

Status: implemented 2026-11-17 (11.7). From the book review
([review_vs_books.md](review_vs_books.md), F-a to F-d, F-f), discussed with
the owner. Goes with the corner revision
([ic_lib_wall.md](ic_lib_wall.md), section 11), which puts the walls' port
origins on the framing face.

### 11.1 Problem

The floor the prototype builds can't stand: the joists hang off the rims on
three end nails with nothing under them (F-a). The end joists are doubled
where the book has a single end joist with blocking (*kubbing*) between it
and the next joist (F-c). The floor's edge is flush with the walls' OSB,
while it should be flush with the framing (F-f).

### 11.2 Current state

`library/modules/floor/compile.js`: rims along the width, joists along the
depth, doubled end joists (`joist_west`, `joist_west_2`, ...) with a
`doubled_joist` joint, grid joists at `k * spacing` from the west edge;
everything from z = 0 at the joists' underside. `systems/seh_no.yaml`:
variant `3600x2720`. Joint types `joist_to_rim`, `doubled_joist`.
`tests/fixtures/engine/hut_floor.json`: `at` 160 and 1360 on the east and
west edges.

### 11.3 Decisions

| | Decision | From |
|---|---|---|
| G1 | **Sill all round** (*grunnmurssvill* in the book's example; role `sill_plate`, since `sill` is the opening's rough sill): the wall stud lumber (48x148) lying flat under the perimeter. The south and north sills run the full width; the west and east sills run between them. The rims, the end joists and the joist ends bear on it (100 of bearing at each joist end) | F-a |
| G2 | **Anchoring to the foundation** (expansion bolts or similar) is not modelled until there is a foundation, like the wall-to-floor fastening (F9). **TODO:** review the sill on a pier foundation, the hut's more likely foundation | F-a |
| G3 | **Single end joists**, `doubled_joist` goes. Rims stay the joists' size | F-c, F-a |
| G4 | **Joists span the short side**, parallel to the gable walls (as now). Assumes a gable roof with gables east and west (**REVISIT** with the roof) | F-b |
| G5 | **Blocking** (*kubbing*, role `blocking`, the joist lumber on edge) between each end joist and the next joist, one block under each stud of the wall above (c/c 600, lined up with the studs). It is for bearing, and so that the gable walls and the long walls get the same attachment pattern below their bottom plates (owner, 2026-11-17) | F-c |
| G6 | **Walls parallel to the joists butt; walls across the joists run through** (owner: the gable wall always butts). Then the gable studs are known when the floor is compiled: the gable run starts one wall-framing depth (148) in from the floor's edge, and its studs follow the wall panels' layout (end studs, and c/c 600 from each panel's left end). The floor gets the walls' framing lumber and panel width as parameters | owner |
| G7 | **The floor's edge is flush with the walls' framing** (rim, sill and end joist faces with the bottom plates' outer faces); the OSB is outside. With the corner revision this is the `flush` rule with no offset | F-f |
| G8 | **Joists c/c 600 from the floor's edge**, so the subfloor's seams at 1200 and 2400 land centred on a joist. The first bay (end joist centre to first joist centre) must be under the spacing, so the subfloor's tongue and groove is cut off at the edge; the owner's figure is at most 575, and the hut's is 576 (open question 2) | F-c |
| G9 | 48x198 C24 c/c 600 is the checked baseline (a SINTEF Byggforsk table, as reproduced in Tømrerboka); the hut's clear span between the sills is about 2400 | F-d |

### 11.4 Proposal

**Floor coordinates:** origin at the south-west corner of the framing outline,
at the underside of the sill; x east (width), y north (depth), z up. With
48x148 sills and 48x198 joists the hut's floor (variant `3600x2696`) is:

| Part | Role | x | y | z |
|---|---|---|---|---|
| `sill_south`, `sill_north` | `sill_plate` | 0–3600 | 0–148, 2548–2696 | 0–48 |
| `sill_west`, `sill_east` | `sill_plate` | 0–148, 3452–3600 | 148–2548 | 0–48 |
| `rim_south`, `rim_north` | `rim` | 0–3600 | 0–48, 2648–2696 | 48–246 |
| `joist_west`, `joist_east` | `joist` | 0–48, 3552–3600 | 48–2648 | 48–246 |
| `joist_1` … `joist_5` | `joist` | centred on 600 … 3000 | 48–2648 | 48–246 |
| `blocking_west_<n>`, `blocking_east_<n>` | `blocking` | 48–576, 3024–3552 | centred on 172, 748, 1324, 1372, 1948, 2524 | 48–246 |
| subfloor | `subfloor` | as now | as now | 246–268 |

The gable runs are 2696 − 2 × 148 = 2400, two 1200 panels, so the blocks lie
under the end studs of each panel (172 and 1324, 1372 and 2524) and the grid
studs (748, 1948). At the panel joint the two end studs stand side by side,
so two blocks touch (1300–1348 and 1348–1396), nailed together (owner, 2026-11-17). The blocks
over the sill (x 48 to 148) bear on it.

**Parameters** (schema and `systems/seh_no.yaml`): `wall_framing` (lumber,
fixed `"48x148"`: its depth is where the gable runs start, its section the
sill's) and `wall_panel` (length, fixed 1200: the gable panels' width). The
compiler raises an error when the gable run (depth − 2 × wall framing depth)
is not a whole number of panels. Height becomes sill + joist + sheets (268).

**Joints** (new joint types, fastening placeholders in `system.yaml`):
`on_sill` (sides `sill`, `member`: rims, joists and blocks toe-nailed to the
sill), `sill_corner` (the west and east sills against the south and north
ones), `blocking_to_joist` (sides `joist`, `block`: nailed through the joist
into the block's end), and `doubled_blocking` for the two touching blocks
at a panel joint. `joist_to_rim` stays (no longer
carrying the joists, which bear on the sill). The subfloor gets
`sheathing_to_framing` joints to the blocks it lies on, as to joists and rims.

**Ports and the fixture.** The ports stay on the top face at the outline
(now the framing's). `hut_floor.json`: floor `F` (`floor/3600x2696`), `at`
0, 1200, 2400 on the south and north edges as now, and 148, 1348 on the
east and west edges (was 160, 1360).

**Builder and engine.** No change beyond the corner revision's.

**Tests.** The floor's parts and roles, sill and block positions, joint
counts by type, the first bay under the spacing, the gable run not a whole number of
panels (error); the hut on its floor with no issues and no collisions, every
gable stud over a block in world coordinates, fastener totals.

### 11.5 Consequences

- The floor is tied to the walls through two parameters and the rule in G6:
  a layout that breaks the rule (a gable wall running through, a gable panel
  that isn't 1200, an opening in a gable wall with its king and jack studs
  off the grid) gets blocks in the wrong places and no issue. A load-path
  check is skipped for now (owner, 2026-11-17): "every stud stands on
  framing" would not enforce the blocking, since the end joist is under
  every gable stud anyway.
- The floor variant's name is the framing outline (`3600x2696`), not the
  OSB's.
- The sill is part of the floor module for now; with a foundation it may
  move to its own module or interface (G2).
- PLAN T18 ("floors are derived from the wall loop") gets a second reason:
  the framing positions, not only the outline, follow from the walls.

### 11.6 Open questions

1. Sill joints along a long side (stock lengths). The sills are butted at
   the corners (owner, 2026-11-17).
2. ~~The first bay~~: 576 is fine (owner, 2026-11-17).
3. ~~At a wall panel joint~~: two blocks, nailed together (owner,
   2026-11-17).
4. ~~A load-path check~~: skipped for now (11.5).
5. Does the OSB lap down over the rim and sill (F-f)? Nailed to the rim it
   would also tie the wall to the floor (F9).

### 11.7 Implementation (2026-11-17)

As proposed (the table in 11.4 is what the compiler builds). The hut's floor: 35 parts and 130 joints, 236
subfloor screws (3 into each block); in the engine test every stud of the
east and west walls stands over a block. The corner change moved the walls'
ports to the framing face first, which made the floor `3600x2696` and the
east and west walls' `at` 148 and 1348.

Review fixes (2026-11-17):

- The walls' stud spacing is its own parameter, `wall_spacing`, next to
  `wall_framing` and `wall_panel`; it was the joist spacing. Nothing in the
  builder checks the three against the wall system; a test compares the
  `seh_no` files, and the engine test checks the hut's studs over blocks.
- A block is centred under its stud, and the two blocks at a panel joint
  under the pair, so joists thicker than the studs no longer give
  overlapping blocks. Blocks that would overlap, or run into a rim, are an
  error.
- The floor lays the gable studs with the wall compiler's own function
  (`studPositions` in the core's `walls.js`).
