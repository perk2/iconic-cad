# Design note: ic_lib_opening, walls with a window or door

Status: implemented in the prototype, 2026-11-15; revised from the book
review and implemented 2026-11-17 (section 11, which supersedes earlier
sections where they differ; A7: the header on the opening, to check with
Byggforsk). Written without discussion
while the user was away; the note and the implementation were each reviewed
by Fable and revised (section 10). Every decision is an assumption in
section 3 and comes up in the next joint review. Topics: T6 (parts), T11 (systems and units), T17
(library layout; the splitting rule). Builds on
[ic_lib_wall.md](ic_lib_wall.md) and [ic_joints.md](ic_joints.md).

## 1. Problem

The hut needs a door and at least one window. The prototype has one module,
`wall_panel`, a panel of studs, plates and the bracing sheet. A wall with an opening
is built differently (header, king and jack studs, cripples, a rough sill for
a window, a cut bottom plate for a door), so by T17's splitting rule it is
its own module: *load-bearing wall with opening*, with window and door as
variants.

Terms, in plain construction English (the word "aperture" in the v1 code is
not used in the new format):

| Term | Norwegian (checked against the books where marked, 2026-11-17) | Meaning |
|---|---|---|
| Rough opening | *utsparing* (its size: *hullmål*) | The framed hole the window or door unit goes into |
| Unit | *vindu*, *dør* (frame: *karm*) | The window or door itself, as bought (frame and sash or leaf) |
| Header | *overdekning* (checked) | The beam over the rough opening, carrying the load above it to the jack studs |
| King stud | *stender* (checked: no word of its own) | A full-height stud at each side of the opening, bottom plate to top plate |
| Jack stud | *stender*, *oppleggstender* (checked) | A shorter stud inside the king stud that the header bears on (also called trimmer) |
| Cripple | *stender* (checked) | A short stud kept at the stud spacing: above the header (top cripple), or under the rough sill (bottom cripple) |
| Rough sill | *losholt* (checked) | The flat member across the bottom of a window's rough opening |
| Head piece | *losholt* (checked) | A flat piece, ripped to fit, between a header raised to the top plate and the rough opening |

## 2. Current state

- **v1:** `enumerateAperture()` in `web/js/members.js` frames window and door
  modules (`window_4x8_2x6_36x48`, `door_4x8_2x6_38x83`, ...). The opening is
  centred; the king studs are the panel's end studs, so the panel width is
  the rough opening plus four studs; the header is one member with `plies`
  as metadata; a window gets a rough sill, bottom cripples, and below a tall
  wall a subheader and sill blocks; the bottom plate is cut across a door; the
  OSB is split into up to four rectangles around the opening. Sizes are in
  inches in the module ids and `meta.yaml`.
- **Prototype:** `library/modules/wall_panel/` (schema, compiler, `systems/seh_no.yaml`);
  the builder's parameter types are `length`, `lumber` and `buildup`
  (`PARAMETER_TYPES` in the builder); the system catalog has
  `lumber`, `sheets` and `fasteners`. Compilers are loaded by path and can't
  share code: the wall compiler holds its own box, overlap and sheet-layout
  helpers (`library/modules/wall_panel/compile.js`). The interfaces `wall_inline`
  and `wall_corner` accept any port that declares their roles, from any
  module.

## 3. Decisions (assumptions, to review)

| | Decision |
|---|---|
| O1 | One module, `wall_panel_with_opening`, for windows and doors; the unit's kind decides the framing below the opening |
| O2 | Windows and doors are catalog items in the system, in two sections, `windows` and `doors`. Each entry states the unit's `size` and its `rough_opening` (width, height), both from the product or the books; no gap rule in Iconic CAD |
| O3 | The module has a parameter `unit` whose type is a new one, `opening_unit`, the way `stud` has type `lumber`. A variant names a catalog id (`unit: window_10x12`); the builder looks the id up in `windows` and `doors` and gives the compiler the entry itself, with `kind: window` or `kind: door` added from the section it was found in. The compiler reads the rough opening from it and frames a door or a window by `kind` |
| O4 | The opening is centred in the panel. The variant states `sill_height`, the height of the rough opening's bottom above the bottom of the wall; it must be 0 for a door |
| O5 | The king studs are separate from the end studs and clear them by at least one stud thickness, so a panel with an opening can have the same widths as a plain wall: multiples of the system's grid (600 in `seh_no`). Panels on the grid keep runs adding up to whole grid lengths, stud positions (c/c 600 from each panel's left end) continuing across panels, and sheet seams (1200 sheets) on studs. A 10×12 window needs at least 1010 (rough opening) + 2 × 96 (jack and king) + 2 × 48 (clearance) + 2 × 48 (end studs) = 1394, so the smallest panel on the grid is 1800 (3 × 600). In v1 the king studs are the end studs and the panel width follows the opening (1010 + 4 × 48 = 1202), which is off the grid |
| O6 | The header is two plies of the `header` lumber stood on edge, one flush with each face of the framing, with the gap between left for insulation on site. One part per ply. It sits on the rough opening when the space above it takes cripples of at least 200 mm; otherwise it sits tight under the lower top plate and a head piece, ripped to the gap, fills down to the rough opening. A gap of more than one stud thickness is an error (a deeper header, or the opening moved) |
| O7 | Jack studs run from the bottom plate (a door: the bottom plate piece) to the header. A window's rough sill fits between the jack studs, on a cripple at each end against the jack. A cripple stands at each edge of the opening, above the header (when it sits on the opening) and under the sill, so the sheet cuts have framing behind them. Grid studs that fall between the jacks become cripples; grid positions closer than one stud thickness to an end, king or jack stud or an edge cripple are left out; with no grid position between the jacks, one cripple is centred if it fits. Cripples are at least 200 mm long |
| O8 | A door's bottom plate is two parts, cut at the rough opening. Whether the plate stays whole until the panel is set is a build-order question (T10) |
| O9 | The bracing sheet is split around the rough opening into up to four pieces per sheet, as in v1. The pieces' edges at the opening then get `edge_spacing` with no new rule |
| O10 | The unit is not a part yet; the model has the rough opening only through the framing around it. Added when the bill of materials or the build book needs it |
| O11 | Compilers share code through the library core (`web/js/library/`), which every compiler gets as an argument (`core`). The wall compiler moves its helpers there; its output must stay byte-identical |
| O12 | New joint types: `jack_to_king`, `header_to_king`, `header_on_jack`, `header_to_plate`, `head_to_header`, `head_to_jack`, `sill_to_jack`, `cripple_to_header`, `cripple_to_sill`, `cripple_to_jack`. King, jack and cripple ends on the bottom and top plates use `stud_to_plate` |
| O14 | The builder checks, in the connection frame, that an implementation's parts don't overlap any part of the participants, that an implementation part touching a participant's lumber part has a joint with it, and that the participants' parts don't overlap each other (added after review: a corner backer could land inside or against a king stud) |
| O16 | Sheet pieces narrower than 20 mm are left out, and a sheet gets no joint where its contact with a member is narrower than 20 mm in either direction: such strips are cut with the neighbouring sheet, and such contacts can't be nailed (added after the implementation review) |
| O15 | Library code imports nothing: the builder passes the core in, so a test's edited copy of the core can be used for a build (changed after review) |
| O13 | All fastening values for the new joint types, and all window and door sizes, are placeholders |

## 4. Proposal

### 4.1 Library source

**Catalog** (`library/systems/seh_no/system.yaml`). Norwegian windows and
doors are named by size in decimetres (10×12 is 1000 × 1200 as a module
size). Placeholder values:

```yaml
catalog:
  windows:
    window_10x12: {size: [990, 1190], rough_opening: [1010, 1210]}
  doors:
    door_10x21: {size: [990, 2090], rough_opening: [1010, 2110]}
```

The builder checks that ids are unique across `windows` and `doors`, that
both pairs are positive, and that the rough opening is at least the size.
The placeholder rough openings make the window and door heads 2110, which
leaves 46 mm between a header on the opening (48×148 plies) and the top
plate; that is what makes the raised header with a head piece the normal
case in `seh_no`.

**Module** (`library/modules/wall_panel_with_opening/`):

- `schema.yaml`: the wall's parameters (`width`, `height`, `spacing`, `stud`,
  `buildup`) plus `header` (lumber), `unit` (opening_unit) and `sill_height`
  (length, minimum 0). A length may be 0 only when the schema says `min: 0`;
  a schema `min` or `max` must not be negative. Ports as on `wall_panel`: `left`,
  `right` (filling the same roles) and `bottom`.
- `compile.js`: section 4.2.
- `systems/seh_no.yaml`:

```yaml
fixed:
  stud: "48x148"
  header: "48x148"        # placeholder: two plies on edge
  spacing: 600
  height: 2400
  buildup: exterior
default: window_10x12
variants:
  window_10x12:
    width: 1800
    unit: window_10x12
    sill_height: 900      # head at 2110, level with the door's
    status: draft
  door_10x21:
    width: 1800
    unit: door_10x21
    sill_height: 0
    status: draft
```

**Joint types** (`library/joint_types.yaml`), what is joined and why:

| Joint type | Sides | What |
|---|---|---|
| `jack_to_king` | `jack`, `king` | A jack stud against its king stud |
| `header_to_king` | `header`, `king` | A header ply's end against a king stud |
| `header_on_jack` | `header`, `jack` | A header ply bearing on a jack stud |
| `sill_to_jack` | `sill`, `jack` | A rough sill's end against a jack stud |
| `cripple_to_header` | `cripple`, `header` | A top cripple bearing on a header ply |
| `cripple_to_sill` | `cripple`, `sill` | A bottom cripple carrying the rough sill |
| `cripple_to_jack` | `cripple`, `jack` | A cripple under a sill end, against the jack |
| `header_to_plate` | `header`, `plate` | A raised header ply tight under the lower top plate |
| `head_to_header` | `head`, `header` | The head piece under a raised header ply |
| `head_to_jack` | `head`, `jack` | The head piece's end against a jack |

`sheathing_to_framing` now also joins sheets to headers, sills, heads and
cripples; its side description says "framing member".

**Fastening** (system schedule, placeholders, all `nail_28x95`):
`jack_to_king`, `cripple_to_jack`, `head_to_header` and `header_to_plate` by
spacing; `header_to_king` a count from the king; `header_on_jack`,
`head_to_jack`, `sill_to_jack` and `cripple_to_header` toe-nailed counts
(the sill is toe-nailed from the sill, since a jack already nailed to its
king leaves no room to nail through it); `cripple_to_sill` a count from the
sill.

### 4.2 Compiler

Coordinates and datum as for `wall_panel`. With `W` the width, `t` the stud
thickness (48), the rough opening `ro = [ro_w, ro_h]` from the unit and
`x0 = (W - ro_w) / 2`, `x1 = x0 + ro_w`, `z0 = sill_height`, `z1 = z0 + ro_h`:

- **Plates:** as on `wall_panel`; for a door the bottom plate is two parts,
  `bottom_plate_left` (0 to `x0`) and `bottom_plate_right` (`x1` to `W`).
- **End studs:** `stud_left`, `stud_right`, as on `wall_panel`.
- **Jack studs:** `jack_left` (`x0 - t` to `x0`), `jack_right` (`x1` to
  `x1 + t`), from the top of the bottom plate to `z1`.
- **King studs:** `king_left`, `king_right`, outside the jacks, from the
  bottom plate to the lower top plate.
- **Header:** `header_outer` and `header_inner`, from `x0 - t` to `x1 + t`,
  the outer ply flush with the framing's face A side, the inner with face B.
  On the rough opening (from `z1`) when the space above it is at least
  `MIN_CRIPPLE` (200 mm); otherwise tight under the lower top plate, with
  `head` lying flat from `x0` to `x1` between `z1` and the header.
- **Grid studs:** the wall's positions (`k * spacing - t/2`). A position
  between the jacks becomes a top cripple (when the header is on the
  opening) and, for a window, a bottom cripple; with no position there, one
  cripple is centred. A position that would overlap an end, king or jack
  stud is left out.
- **Rough sill:** for a window, `sill`, from `x0` to `x1`, its top at `z0`,
  on `cripple_bottom_left` and `cripple_bottom_right` against the jacks.
- **Sheets:** laid as on `wall_panel`, then each sheet minus the rough opening, as
  up to four pieces (left and right of the opening at full sheet height,
  above and below it between); pieces 1 mm wide or less are left out. Each
  piece is joined to the framing it touches. This is a simplification: on
  site the sheet is usually cut around the opening's corner, and a narrow
  strip beside an opening adds little bracing.
- **Ports:** as on `wall_panel`; for a door the end ports expose the bottom plate
  piece at that end as `bottom_plate`, and `bottom` exposes both pieces
  (`bottom_plate_left`, `bottom_plate_right`).
- **Errors** (raised, reported by the builder): a king closer than one stud
  thickness to an end stud (`x0 - 2t < 2t`); the header doesn't fit under
  the lower top plate; two plies thicker than the framing; a door with
  `sill_height` other than 0; a window whose bottom cripples would be
  shorter than 200 mm.

Part ids and roles:

| Role | Ids | Window | Door |
|---|---|---|---|
| `bottom_plate` | `bottom_plate`, or `bottom_plate_left`/`_right` | 1 | 2 |
| `top_plate` | `top_plate_lower`, `top_plate_upper` | 2 | 2 |
| `stud` | `stud_left`, `stud_right`, `stud_<k>` | 2 | 2 |
| `king`, `jack` | `king_left`/`_right`, `jack_left`/`_right` | 2 + 2 | 2 + 2 |
| `header` | `header_outer`, `header_inner` | 2 | 2 |
| `head` | `head` | 1 | 1 |
| `sill` | `sill` | 1 | 0 |
| `cripple` | `cripple_top_<k>`, `cripple_bottom_<k>`, `cripple_bottom_left`/`_right`, `..._centre` | 4 | 0 |
| `bracing` | `a1_bracing_<n>` | 6 | 4 |

The window has 70 joints and the door 49.

Joints, emitted as the parts are made: plates and studs as on `wall_panel`; kings,
jacks and cripples to the plates (`stud_to_plate`); `jack_to_king`; each
header ply to each king (`header_to_king`) and onto each jack
(`header_on_jack`); top cripples to the lower top plate (`stud_to_plate`) and
to each header ply (`cripple_to_header`); bottom cripples to the bottom plate
(`stud_to_plate`) and the sill (`cripple_to_sill`); `sill_to_jack`; sheet
pieces to framing (`sheathing_to_framing`).

### 4.3 Shared compiler code

`web/js/library/framing.js` holds generic helpers: `box`, `half`, the
overlap test with the 1 mm minimum (`MIN_OVERLAP`, the same as the
builder's `TOUCH_MM`), the sheet layout (whole sheets from the bottom-left,
cut at the edges), a rectangle minus a rectangle, and a lumber part.
`web/js/library/walls.js` holds a wall panel being compiled (`WallPanel`):
sizes from the parameters, plates, grid positions, workshop sheets (with an
optional hole) and the port frames. They are part of the library core the
builder passes to every compiler (`core`), so compilers import nothing and
a test can build with an edited copy of the core.

### 4.4 Builder

- `opening_unit` parameter type: validation (an id in `windows` or `doors`)
  and resolve (the entry with `id` and `kind`).
- Catalog `windows` and `doors`, optional sections.
- `length` parameters may be 0 with `min: 0`; schema bounds not negative.
- Shared code (4.3).
- The clearance check (O14).
- The long-axis rule is unchanged (it was changed and changed back, see
  [ic_joints.md](ic_joints.md), 4.2).

### 4.5 Engine

No change. Parts and joints of the new module arrive like the wall's.

### 4.6 Tests and fixtures

- Builder: both variants compile; part roles and counts per variant
  (window: 2 jacks, 2 kings, 2 header plies, cripples above and below, a sill;
  door: two bottom plate pieces, no sill, no bottom cripples); sheet pieces
  around the opening and their edge nailing; hand-checked joint counts for
  one variant; the corner and inline pairs now include the new module; the
  wall compiler's output is unchanged after the move to shared code (the
  library asset's wall entries are identical).
- Broken cases: unknown unit, a window in a panel too narrow, a door with a
  sill height, a header too deep for the wall, ids repeated across `windows`
  and `doors`, a rough opening smaller than the unit.
- Engine: a hut fixture with the south run as a window panel and a door
  panel (1800 each), the rest as today; the loop closes, outline unchanged,
  and the model has the new parts and joints.

## 5. Steps

1. This note; Fable review; apply.
2. Shared compiler code; the wall compiler moved onto it with an unchanged
   asset.
3. Catalog, `unit` type, `length` minimum; validation tests.
4. Module, compiler, joint types and fastening; tests.
5. Engine fixture; tests.
6. Fable review of the implementation; apply.

## 6. Out of scope

- The unit as a part, its fixing in the opening, flashing and sealing.
- Openings placed off centre, several openings in one panel, openings that
  span panel seams.
- Headers sized by a span table (the code profile, T15); a subheader and sill
  blocks as in v1.
- Non-load-bearing walls with openings (a partition with a door).

## 7. Options considered

- **Door and window as separate modules** (O1): the construction above the
  opening is the same; one compiler with one branch below the opening is
  smaller than two copies. Split if they diverge (T17's open question).
- **The variant states the rough opening directly** (O2): simpler, but the
  unit disappears from the model, and the clearance is repeated per variant.
- **A gap rule in the system** instead of `rough_opening` per entry (O2):
  products differ, and the books give rough openings per product.
- **One `units` section with a `kind` field** (O2): `units` reads like the
  system's `units: mm`; two sections need no `kind` field.
- **Kings as end studs, as in v1** (O5): panels off the grid, and the corner
  and inline joints would join a king stud.
- **One header part with `plies` as metadata, as in v1** (O6): the joints
  and the cut list need each ply.
- **Sheets with a cutout field** instead of pieces (O9): one part per sheet
  bought, but every consumer and the edge test would need to know about
  cutouts. Sheets are already cut at panel edges, so a piece is not a stock
  sheet anyway; the cut list matches pieces to stock later.

## 8. Consequences

- A second module tests that interfaces really are module-independent: the
  corner and inline joints bake pairs across `wall_panel` and `wall_panel_with_opening`.
- Shared compiler code is part of the library core, the code the builder
  and the engine use too.
- The library asset grows with the pairs: three variants filling both
  roles at a corner give nine variant pairs per port pair.

## 9. Open questions

- Header size: a span table in the code profile, or per variant? Norwegian
  practice for headers over small openings in a hut's walls; whether the
  header can fill the space up to the top plate (no top cripples).
- Rough opening sizes and the gap for shims and sealing in Norwegian
  practice; check in the books.
- A door's bottom plate: cut in the workshop, or left whole until the panel
  is set (O8)?
- The sill height for windows in the hut, and the door's threshold height
  above the subfloor (a door's rough opening starts at the bottom of the
  wall).
- Should the unit be a site part, with a joint to the framing, once fixing
  and sealing are modelled?
- Should a narrow panel let the end stud serve as the king (v1)? A 10×21
  door in a 1200 panel needs it (1010 + 6 × 48 = 1298).
- Variant names: `window_10x12` carries no panel width; a second width
  needs a naming rule (T17 writes "10x12 window").
- A panel with an opening counts less towards bracing (T14), once variants
  state derived properties.
- Several sheet pieces come from one stock sheet; a field naming the stock
  sheet would let the cut list and a bracing check put them back together.

## 10. Review (Fable, 2026-11-15)

Fable checked the geometry by simulating both variants against the
builder's `contact()` and `fastener_count()`. Changes made:

- 46 mm top cripples failed the long-axis rule and can't be nailed: the
  header goes up under the top plate when the space above it is under
  200 mm, with a head piece (O6). The long-axis rule now looks within the
  contact face (4.4).
- The sheet pieces below a window had vertical edges with nothing behind
  them: cripples under the sill ends, against the jacks (O7).
- A door's `bottom` port exposed nothing defined: both pieces (4.2).
- The king-to-end-stud rule allowed touching parts with no joint and
  ignored the corner backer: one stud thickness clear, and the clearance
  check in the builder (O5, O14).
- Roles and ids listed (4.2); `half` for the opening position; slivers
  dropped; no grid position in the opening gives a centred cripple; schema
  bounds not negative.
- `sill_to_jack` toe-nailed from the sill (4.1); `sheathing_to_framing`
  description widened.
- The type renamed `opening_unit`; library code gets the core as an argument
  (O3, O15).

Kept as they were, with Fable's suggestions recorded: the framing branches
on the unit's kind rather than on `sill_height` (the consistency check
covers both); one `cripple` role, with ids saying where; pieces rather than
cutouts. Recorded as open: end stud as king, variant names, bracing, the
stock sheet field, and the rough opening as data for site layers and plans
(4.5 holds only until those need it).

### Implementation review (Fable, 2026-11-15)

Fable drove the compiler through about 12,000 parameter sets the schema
allows and confirmed the wall refactor is output-identical (3000 random
parameter sets). Changes made:

- Sheet slivers and narrow contacts failed in the builder with "the contact
  (5 mm) is shorter than twice the end distance": the 20 mm minimum (O16).
  This also affected the plain wall at some heights.
- A head piece up to 199 mm thick of stud lumber: limited to one stud
  thickness (O6).
- With the header on the opening, the sheet cuts above it had nothing
  behind them: edge cripples above the header too (O7).
- Grid studs exactly against a king or an edge cripple touched with no joint,
  and a dropped grid cripple could leave a seam unbacked: the one-thickness
  clearance (O7).
- The long-axis change hid schedule mistakes and no part needed it any more:
  reverted.
- The clearance check ignored touching: now reported for lumber parts
  (O14).
- `windows: []` passed silently; a rough opening narrower than three stud
  thicknesses is an error; the schema comment on the door's `bottom` port.
- Tests for the header on the opening, the centred cripple, eight other
  sizes with the touching check, and the new errors.

Still open: a check that every sheet seam has a member behind it (the
clearance rule covers the cases found, but nothing checks it in general),
and whether participants touching each other at a connection (a butt wall's
plate against the through wall's plate) should need a joint.

## 11. Revision from the book review (2026-11-17)

Status: implemented 2026-11-17 (11.1 answers, 11.2 implementation). From the owner's
reading of the books ([review_vs_books.md](review_vs_books.md), W3 to W5 and
section 6.2).

| | Decision |
|---|---|
| R1 | **No edge cripples** (W5). The sides of an opening are a king and a jack only; cripples stand only at the grid positions (c/c 600 from the panel's left end) between the jacks, under the rough sill and, where the header sits lower, above it. This replaces O7's "a cripple stands at each edge of the opening". The rough sill's ends are nailed to the jacks (`sill_to_jack`, as now); `cripple_to_jack` goes. In `window_10x12`, `cripple_bottom_left` and `cripple_bottom_right` go; `cripple_bottom_1` and `_2` (at 600 and 1200) stay |
| R2 | The edge cripples were also there so the sheet pieces' edges at the opening have framing behind them (O7, O9). The model splits a sheet into up to four rectangles around the opening, so the rectangle under a window gets a vertical edge at the jack's inside face, from the bottom plate to the sill, which a real sheet doesn't have: a real sheet is one piece with the opening cut out, and its edges are the opening's edges (on the jack, the sill and the head piece) and the sheet's own edges. Without edge cripples that made-up edge has nothing behind it; the edge spacing (O9) then applies to edges that aren't edges. Open question 3 |
| R3 | **The header always goes under the top plate** in a load-bearing wall (W4, owner). This replaces O6's two cases. The head piece (*losholt*) is a piece of the stud lumber lying flat at the top of the rough opening, not a piece ripped to fill the gap. Between it and the header there is either a gap of at least 10 mm, or, where the space allows, studs at c/c 600. Proposed: studs when the space is at least the minimum cripple length (200, W6), otherwise an empty gap; under 10 mm is an error. `head_to_header` goes when there is a gap (the head piece is nailed to the jacks only); `cripple_to_header` and a new `cripple_to_head` when there are studs |
| R4 | Words (section 2): rough opening *åpning* (*vindusåpning*, *døråpning*); header *overdekning*; king, jack and cripple are all *stender* (the jack also *oppleggstender*); rough sill and head piece are both *losholt* |
| R5 | **Sheets with the opening cut out** (W11, owner: the book shows two 1200 sheets meeting in the middle of a window). A sheet stays one sheet with its part of the opening cut out. The compiler may still describe it as rectangles, but they carry the sheet they belong to, the edge spacing applies only along the opening's edges and the sheet's own edges, and the bill of materials counts whole sheets |
| R6 | **One standard window and one door** (owner): narrow windows with no grid position between the jacks are out of scope; the compiler raises an error instead of centring a cripple |

Consequences: the compiler's cripple placement gets simpler (grid positions
only, no edge cripples, no centred fallback), `cripple_to_jack` leaves the joint
types and the schedule, and the window variant loses two parts and their
joints. Tests and `library.json` change.

Open questions (answered 2026-11-17, see 11.1):

1. **The hut's openings didn't fit R3.** The header (48x148 on edge) under
   two top plates has its underside at 2400 − 96 − 148 = 2156. The head
   piece (48) and the 10 mm gap put the top of the rough opening at 2098 at
   most; the window and the door reached 2110.
2. **The seam in the middle of the window** (R5): in the 1800 panel the
   opening is centred at 900 and the sheet seam is at 1200.

### 11.1 Answers (owner, 2026-11-17)

| | Decision |
|---|---|
| A1 | **The hut's door is an exterior 10x20** (Swedoor's exterior table: frame 988 x 1980; 10x21 is 988 x 2080). Its rough opening is 1010 x 2000, the frame plus the placeholder 20 (W9; Swedoor's interior table leaves 21 to 24). Catalog `door_10x20` replaces `door_10x21` (whose numbers were the interior 10x21's) |
| A2 | **The window's head is level with the door's, at 2000**: sill height 790 (2000 − 1210). Not a rule (windows above the door are fine too), but simpler |
| A3 | *(Replaced by A7.)* **R3 stands**: the 48x148 header under the top plates (underside 2156), a full 48 head piece on the rough opening, and above it a gap of at least 10 or studs. The hut's openings get 108 between the head piece (2048) and the header (2156): short cripples, see A6. Skipping the head piece, as is common in Norway and the US where the height is short, is not needed; to revisit if an opening needs the height |
| A4 | **The seam's position is not a rule** (open question 2, assumed, owner to confirm): sheets are laid from the panel's left end as on a plain wall. Seams fall at multiples of the sheet width, on the stud grid; where a king, jack or opening pushes the grid stud at a seam out, the seam has nothing behind it, and the wall compiler reports it (every sheet edge must have framing behind it; seams between rows of sheets are not checked, blocking is not modelled). The hut's panels pass |
| A5 | The compiler reports an opening whose top is above the header's underside less the head piece and the 10 gap |
| A6 | *(Replaced by A7.)* **Short cripples on the head piece, stopping 10 below the header** (owner, after the first implementation left the hut an empty 108 gap): at the grid positions, nailed up through the head piece, their tops free. They give the sheets and the lining nailing, and the header still deflects 10 before touching them, so its deflection doesn't reach the head piece or the window. Neither Eurocode 5 nor the IRC says anything about this; it is practice (Byggforsk 523.251, 523.701 or *Trehus*: to check). Placeholder minimum length 50; shorter leaves an empty gap. The outer sheet, nailed to both the header and the cripples, could still pass a little load; assumed small |

| A7 | **No head piece: the header sits on the jacks and its underside is the top of the rough opening** (owner, 2026-11-17, after looking at US practice; replaces R3, A3 and A6, and changes the owner's W4 answer that the header always goes under the top plate). Above the header, cripples at the grid positions up to the lower top plate when the space is at least 100 (US framers stop at about 4"; placeholder); with no space the header is nailed to the plate (`header_to_plate`); a space in between is an error (deeper header or move the opening). The header's deflection over a 1 m span is small, and the unit's own clearance in the rough opening takes it, as in US practice (window makers ask for 6 to 19 mm at the head). The hut: header 2000 to 2148, cripples 2148 to 2304 (156) at 576 and 1176; the seam at 1200 above the opening is backed by the header and a cripple. **TODO: check Byggforsk** (523.251 timber framing, 523.701 fitting windows) for the head piece, the gap and the header's position, before building |
| A8 | **A door's bottom plate is whole and stays** (owner, 2026-11-20; replaces O8): the plate runs through the door opening and the door's threshold sits on it, so the rough opening starts on the plate: a door's `sill_height` is the plate's thickness (48), and the compiler requires it. The door's head goes to 2048 (48 + 2000), so the window's sill moves to 838 to keep the heads level (A2). Above the 2048 heads, the 48x148 header to 2196 and cripples of 108 up to the lower top plate (2304), over the 100 minimum. The sheet keeps a 48 strip over the plate under the door. A 48 step at the threshold |

Sources: [Swedoor, interior doors](https://www.swedoor.no/tips-og-rad/maaltabeller-innerdorer),
[Swedoor, exterior doors](https://www.swedoor.no/tips-og-rad/maaltabeller-ytterdorer).

### 11.2 Implementation

- **Framing** (R1, A7, R6): the header sits on the jacks, its underside the
  top of the rough opening; no head piece (the `head` role, `head_to_jack`
  and `head_to_header` go). Above it, cripples at the grid positions up to
  the lower top plate when the space is at least `MIN_TOP_CRIPPLE` (100;
  `stud_to_plate` at the top, `cripple_to_header` at the bottom); no space:
  `header_to_plate`; a space between: an error. Cripples under a window's
  rough sill stand only at grid positions. No grid position between the
  jacks, where cripples are needed, is an error. `cripple_to_jack` goes.
- **Builder**: a cripple above a header can be shorter than its section
  (100 to 148 long), so its long axis is into the wall, across the sheet,
  and the sheet's nailing had no row to count along. A sheet layer's fastening, nailed
  through the sheet's face, now counts along the part's longest side within
  the contact face; other fastening keeps the strict rule
  ([ic_joints.md](ic_joints.md), long axis).
- **Sheets** (R2, R5): a sheet with the opening in it is described as
  rectangles: a band below the opening and a band above it, each the
  sheet's full width, and between them the pieces left and right of the
  opening. So the pieces' vertical edges are the sheet's own edges or the
  opening's, and only the horizontal cuts between bands are made up; the
  framing behind a band's made-up edge runs across it (studs, jacks), and
  the sill and head piece lie along the opening's edges. The edge spacing
  then falls only on real edges. Each piece
  of a cut sheet carries `sheet`, the id of the whole sheet, for a bill of
  materials that counts whole sheets.
- **Library**: catalog `door_10x20`, variants `window_10x12` (sill 790) and
  `door_10x20`.
- **Sheet edges** (from the review of the implementation): the wall compiler
  checks that every sheet edge has framing behind it (`walls.unbacked_edges`),
  except the cuts between pieces of one sheet and the seams between rows of
  sheets. It reports, for example, a 1210 opening in a 3600 panel (the
  seams at 1200 and 2400 under the sill miss the grid cripples the jacks
  push out) and studs c/c 450 under 1200 sheets.
