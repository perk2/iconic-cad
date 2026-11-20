# Design note: catalog modules and derived modules

Status: implemented 2026-11-19 (sections 9 to 11), revised after a review
(section 12). Library code is JavaScript (owner, 2026-11-19; why in section
8). Sections 2 to 5 are the proposal as written; where they differ from what
was built, sections 9 to 12 hold. From the discussion of the upper top plate
([ic_lib_top_plate.md](ic_lib_top_plate.md)) and the floor
([ic_lib_floor.md](ic_lib_floor.md)). Topics: T18 (derived assemblies), T17
(library layout), T6 (parts). Touches upstream's engine design, so it needs
a decision in `docs/design_decisions.md` before anything goes upstream.

## 1. Problem

Some parts of a building depend on how the user combined the panels, so
they can't be baked into the library:

- **The upper top plate** runs along a whole wall line, laps at the corners
  and has its joints at least 600 from the panel joints (P1 to P4 in
  ic_lib_top_plate.md). It belongs to no panel and no single connection.
- **The floor** has to follow the walls: its outline is the walls' framing
  loop, its blocking stands under the gable walls' studs, and the walls'
  bottom plates are nailed into it. Today it guesses the walls instead
  (below).
- Later the roof (from the top walls) and the foundation (from the floor).

A specific "derived top plate" felt wrong (owner). Instead: modules made of
modules, compiled when the design is.

## 2. Current state

- **Modules** (`library/modules/<id>/`: schema, compiler, system variants)
  are compiled at library time by the library builder into
  `web/assets/library.json`, with all checks (parts, joints, fastening).
- **Interfaces** bake, per variant pair, a placement transform and an
  implementation's parts and joints.
- **The engine** (`web/js/engine/compile_design.js`) takes a layout
  (entities: module and variant; connections) and composes the baked
  transforms; loop closure checks consistency. It has no wall-specific code
  (upstream rule), and runs no library code.
- **The floor** (`library/modules/floor/`) is a module with a size variant
  (`3600x2696`). It copies the walls' framing, panel width and stud spacing
  as parameters (`wall_framing`, `wall_panel`, `wall_spacing`), assumes the
  gable walls butt and are whole plain panels, and can't make the joints
  between the walls' bottom plates and itself (F9). Walls stand on it
  through `wall_on_floor` on sliding ports.
- **The upper top plate** is still on every panel, flush with its ends.

## 3. Concepts

- **Catalog module**: compiled at library time, as modules are now, and the
  only kind the user places in the UI (the building blocks): wall panels,
  wall panels with an opening. Its variants are fixed.
- **Derived module**: compiled at design time, from catalog modules the user
  placed (or other derived modules) and the options the user picked. Nobody
  places it. Examples: the wall line, the storey, later the roof and the
  foundation.
- **Children**: a derived module's compiler places child modules (catalog
  variants, or derived modules with parameters) by the interfaces'
  placement rules, and carries their parts and joints with their identity:
  a panel stays a workshop unit with its own id (`S/S1/stud_left`).
- **Own parts**: the compiler may add parts and joints of its own, which
  can span children (the wall line's upper plate).
- **Derived parameters**: a child's parameters may be computed from other
  children's compiled output (the floor's outline and stud positions from
  the walls). A child that is a derived module with only derived parameters
  (the floor) is compiled after the children it reads, in dependency order;
  a cycle is an error.
- **Options**: a derived module's parameters the user picks (roof type,
  foundation type), like a system choosing an interface's implementation.
- A derived module's compiler sees only its children's compiled output
  (sizes, parts, ports, exposed parts), never their compilers.

## 4. Proposal

**Library.** A derived module lives with the modules
(`library/modules/<id>/`), with `derived: true` in its schema. Its
parameters can be of a new type, `children` (a list of module instances),
and options; it has no system variants. Its compiler:

    derive(params, children, place) -> {children, parts, joints, ports}

where `children` are the compiled children and `place` applies an
interface's baked placement (the same transforms the engine uses). The
output's children carry their transforms; parts and joints are the
module's own, in the format compilers return now; ports pass on children's
ports (a wall line's ends are its end panels' ends).

**Layout.** The catalog modules the user placed, their connections, and the
top derived module with its options:

    derive: {module: storey, options: {...}}

The storey's compiler finds the wall lines (chains of `wall_inline`
connections between corners), compiles a wall line for each (with its
upper plate), places them by the corners, and compiles the floor from
them. The layout never holds derived results.

**Engine.** Runs at design time: it checks the layout, runs the derived
modules' compilers in dependency order, and flattens the result into the
model (parts, joints, issues) as now. It stays generic: it runs library code
it doesn't understand, and checks the output as the builder checks compiled
parts (no overlaps, touching parts joined, joint types and fastening known).

**Runtime: JavaScript** (owner, 2026-11-19; why in section 8). Derived
compilers run in the browser, in a fully static app, offline too, and fast
enough to recompile while the user drags a panel. All library code is JS,
so one language serves library time (Node, from the terminal and CI) and
design time (the browser): pure modules that take and return data, with
thin entry points that read files (Node) or fetch them (browser), as the
engine is. Plain ES modules with JSDoc types, checked by `tsc --checkJs` in
CI, so the app needs no build step.

## 5. Worked examples

**Wall line** (ic_lib_top_plate.md): children are the panels, placed by
`wall_inline`; own parts are the upper plate pieces (at most 2400, joints
at least 600 from the panel joints), extended to the outer corner at a
`butt` end and stopped at the butt wall's inside face at a `through` end;
own joints are `top_plates` between each piece and the panels' lower
plates, and the sheets' top edges nailed into it. The end conditions come
from the storey (which knows the corners' roles) as derived parameters.

**Floor** (ic_lib_floor.md): a child of the storey with derived parameters:
the outline from the walls' framing loop, the sill lumber from the walls'
framing, and the positions of the studs, kings and jacks over each edge for
the blocking. Its compiler stays much as it is; `wall_framing`,
`wall_panel`, `wall_spacing`, the size variant and the gable-wall
assumptions go. A door in a gable wall gives different stud positions. The
storey adds the joints between the walls' bottom plates and the floor (F9).

## 6. Consequences

- The engine runs library code at design time; upstream's "the engine only
  composes transforms" changes (a new design decision).
- Catalog modules are checked fully at library time; derived modules only
  at design time, plus tests on fixture designs (the hut).
- `wall_on_floor` and sliding ports may go: the storey places the walls on
  the floor.
- The hut's layout becomes its panels, their connections and `derive:
  storey`.

## 7. Open questions

1. **Names**: catalog module and derived module (proposed)?
2. ~~Runtime~~: JavaScript (sections 4 and 8).
3. **Finding wall lines**: the storey finds chains of `wall_inline`; or the
   user groups panels into walls. A T-junction splits a line.
4. **Ids**: derived parts need stable ids across edits (for build books and
   diffs): by wall line and position, or by the panels they lie on.
5. **Caching**: compiling a derived module on every edit, or caching by its
   inputs.
6. **Where the joints between siblings go** (bottom plate to floor): the
   parent's own joints (proposed).

## 8. Why JavaScript, not Python (2026-11-19)

Library code (compilers, implementations, the builder's checks) has to run
at library time and, for derived modules, at design time in the browser,
in a static app that also works offline. The alternatives considered:

- **Python in the browser through Pyodide** (CPython compiled to
  WebAssembly). It is the interpreter that is compiled, so Python code is
  still interpreted: about 2 times slower than native CPython. The runtime
  is 7 MB to download (15 MB unpacked with PyYAML; it can be fetched once
  and served locally, so offline works) and takes 1.5 s to start per visit.
- **Python compiled to WebAssembly directly** (py2wasm, or Cython/mypyc for
  typed code): young or a C toolchain, and still far from JS speed, since
  dynamic Python needs types or a JIT to compile to fast code.
- **JavaScript**: browsers and Node compile it to machine code as it runs
  (JIT), it needs no runtime, and the engine is already JS.

A measurement (Node 22): pairwise box overlap over 1500 boxes, the kind of
work the checks do. V8 (JS) 10 ms; native CPython 299 ms; Pyodide 679 ms.
JS is 30 to 70 times faster on this code, which is what makes recompiling
derived modules while the user drags a panel possible; Pyodide would be
fast enough for a recompile per edit but not for anything live, and costs
its startup on every visit.

So all library code is JS: one language for library time (Node) and
design time (the browser). The price: JS numbers don't tell 24 from 24.0
(no library value needs it), and type checking comes from JSDoc and `tsc
--checkJs` rather than the language.

## 9. Implementation (2026-11-19)

- **The library core** (`web/js/library/`, pure ES modules with JSDoc
  types, strict `tsc --checkJs` through `jsconfig.json`): `geometry.js`
  (contact, long axis), `framing.js` (boxes, sheets, cutting a sheet round
  an opening), `walls.js` (stud positions, unbacked sheet edges and the
  `WallPanel` being compiled), `fastening.js` (fastener counts, schedule
  entries, fastening joints), `frames.js` (port frames), `checks.js`
  (overlapping parts, touching parts with no joint), `types.js`, and
  `core.js`: the one `CORE` object every kind of library code gets as an
  argument, so library code imports nothing and runs wherever it is loaded
  from.
- **Library code**: catalog compilers `compile(params, core)`
  (`library/modules/wall_panel/compile.js`, `wall_panel_with_opening/compile.js`),
  implementations `build(participants, core)` (`library/interfaces/
  wall_corner/implementations/california.js`, `wall_inline/
  implementations/plain.js`), derived modules `derive(params, input,
  core)` (sections 10 and 11).
- **The builder**: `web/js/library/builder.js` (load, validate, resolve,
  compile, compile implementations, export; file access passed in, so it
  does no I/O itself) and `scripts/build_library.mjs`, the command line
  (`node scripts/build_library.mjs [--root .] [--verify]`; CI checks
  `library.json` with `--verify`). YAML through the `yaml` package
  (`web/vendor/yaml.mjs`, ISC), in YAML 1.1 mode with mappings as `Map`s,
  so key order and key types (`600` against `"1200"`) are kept and
  unquoted yes/no read as booleans, which the messages warn about; it names
  a duplicate key itself. Type-checked without strict mode
  (`jsconfig.builder.json`), since it checks untyped YAML.
- **Tests**: `tests/library_builder.mjs` (the library, 91 broken-library
  cases in `tests/library_broken_cases.mjs`, openings, corners, derived
  modules, layers, the command line; edits to the core's `walls.js` build
  against an edited copy of the core, `build(source, {core})`; the
  variants fixture with `--write-fixtures`), `tests/library_core.mjs` and
  `tests/compilers.mjs` (the core and the compilers against recorded
  results, `tests/fixtures/library_core_vectors.json`), `tests/derived.mjs`
  and `tests/engine.mjs`.

## 10. The storey and the wall line (2026-11-19)

The first derived modules: `storey` (finds the wall lines, joins its parts)
and `wall_line` (lays the upper top plate). The floor follows in section
11.

**Library.** A derived module is `library/modules/<id>/` with a schema
marked `derived: true`, a `derive.js` instead of a catalog compiler, and a
system file with `fixed:` values only (no variants). The builder
validates it and writes `{derived: true, parameters, systems: {sid:
{params}}}` into `library.json`; it never runs the code.

**Code.** `derive.js` exports `derive(params, input, core)`: pure, no
imports. `core` is the JS library core plus the engine's affine helpers,
passed in, so the file runs wherever it is loaded from. The engine's
caller supplies the derived modules' code (`compileDesign(layout, asset,
{derived: {storey, wall_line}})`): the tests import it, the app will load
it. Copying the code into `web/` for the browser waits for the app.

**Layout.** An optional `derive: {module: "storey"}`. Without it the model
has the placed modules only.

**Input and output.** The engine runs the derived module after assembly,
with `input = {entities, connections, derive}`: each placed entity's
module, variant, params, size, world transform and parts (model ids,
world boxes, layer), the connections with their roles, and `derive(id,
params, input)` to run a child derived module (its system params merged
in). The result is `{parts, joints}`: parts in world coordinates with ids
of their own; joint sides refer to `{own: id}` or `{model: id}`. A parent
prefixes its children's own ids (`line_S1/upper_plate_1`); the engine
prefixes the top module's (`storey/...`), fastens the joints
(`fastenJoints`, all site joints) and checks the new parts: no overlaps
with anything, no touching a model part without a joint (contacts with a
sheet layer exempt; section 12 tightens this).

**storey.** Finds the wall lines: chains of `wall_inline` connections (a's
right end to b's left end), each ending at a `wall_corner` (or free). For
each end it passes the corner role (`through` or `butt`) and the other
wall's framing depth. It joins every upper plate piece to each lower top
plate it lies on (`top_plates`, including the lap over the through wall)
and to each sheet it can be nailed to (`sheathing_to_framing`: the sheets'
top edges, now above the panels' framing).

**wall_line.** In the first panel's coordinates along the run: the plate
runs from the line's start to its end, extended by the through wall's
framing at a `butt` end and stopped short by the butt wall's framing at a
`through` end. Joints are at stud-grid positions (a panel's left end plus
k times its spacing) that are at least `min_from_joint` (600) from every
panel joint and line end and have a stud or cripple under them; pieces
at most `max_piece` (2400), the joints chosen greedily from the start.
The plate is the panels' top plate lumber, lying on the lower plate.

**Panels.** The compilers drop `top_plate_upper` and its `top_plates`
joint; the wall's height stays 2400 and the sheets still run to it, 48
above the panel's framing (owner, ic_lib_top_plate.md 7.2). The sheet-edge
check counts the upper plate's place as backed.

**Implemented (2026-11-19).** As designed above. The engine
(`compile_design.js`) runs the layout's derived module after assembly
(`deriveModules`), fastens its joints with the JS core and checks its parts
(`checkAdded`); model parts now carry `layer`. `library/modules/storey/` and
`wall_line/` hold the schemas, the `seh_no` values (pieces at most 2400,
joints 600 from panel joints) and `derive.js`, type-checked with the core.
The builder validates derived modules (schema, `derive.js` present,
every parameter fixed in the system file) and exports them. The panels lost
their upper plate. The hut (`tests/derived.mjs`): eight plate pieces, one
joint per line at a panel's middle stud; the gable plates lap over the long
walls' lower plates; 18 `top_plates` joints and 22 sheet joints (the long
walls' sheets at a gable plate's end, the corner strips); all site; no
collisions.

## 11. The floor derived from the walls (2026-11-19)

**The floor becomes a derived module.** `library/modules/floor/` keeps its
schema (marked `derived`, parameters `joist`, `spacing`, `buildup`), its
`seh_no` values become `fixed:` only, and its compiler becomes
`derive.js`. The size variant and `wall_framing`,
`wall_panel`, `wall_spacing` go.

**What the storey gives it** (derived parameters): the outline (the walls'
framing loop: the extent of their bottom plates), the height it stands
under (the walls' underside, z 0), the sill lumber (the walls' stud lumber,
from the catalog), and, for each edge along the joists, the walls' vertical
members over it (studs, kings, jacks) as intervals along the edge. The
joists span the short side (G4); the edges along them are the gable edges.

**The floor's compiler then** lays the sill, rims, joists and subfloor as
now, and one block under each member group over a gable edge (members side
by side, at a panel joint or a king and jack, get blocks side by side,
centred under them). It no longer assumes whole plain panels, butting gable
walls or a stud spacing; a door in a gable wall just gives other members.

**What goes** (owner, 2026-11-19): with no placed floor, `wall_on_floor`,
its `bearing` implementation, the walls' `bottom` port and the sliding
ports (builder, engine, tests) have no user and are removed. Positions along
a wall (T-junctions) can come from the storey later, which sees the whole
layout. The walls stand at z 0; the floor lies under them (its top at 0).

**Still deferred:** the joints between the walls' bottom plates and the
floor (F9): the subfloor is a sheet layer, so the touch check doesn't ask
for them yet.

**Implemented (2026-11-19).** As designed. `library/modules/floor/` is a
derived module (`derive.js`, from its former compiler); the
storey derives it from the walls' bottom plates (outline, height), their
stud lumber (sill) and the members standing on the bottom plates of the
walls along the joists (blocking). `wall_on_floor`, the walls' `bottom`
port, the placed floor and the sliding ports are gone from the library,
the builder and the engine (about 250 lines and their tests). The hut's
floor is the same as before, part for part (35 parts, 130 joints, 236
screws); `tests/derived.mjs` also checks it a quarter turn round, with
joists c/c 400, with 73 thick joists, and with uneven gable walls (600 +
1200 + 600), every member over blocking. `scripts/compile_design.mjs` loads
the derived modules' code for a layout with `derive`. `hut/tools/
figures.mjs` draws the derived floor in plan.

## 12. Review and fixes (2026-11-19)

An Opus review of the derived modules confirmed the floor's parity with the old
compiler (the hut at every facing, and 825 synthetic cases), the wall lines'
ends in every direction, rotation and other anchors, panel mixes and
openings at ends and in gable walls. Fixed from its findings:

- **Gable walls that run through at the corners** broke the floor (the
  blocking assumed butting gable walls, G6). Now members over a rim joist
  stand on the rim and need no block, so both work; the joists still span
  the short side.
- **The storey is derived only when the walls close** (every line ends at a
  corner, four corners); otherwise one issue says so and nothing is derived
  (owner: no upper plates are needed while placing walls).
- **The floor is laid out in the building's frame** (the anchor entity's),
  not the world's axes, so it turns with the building: the storey's parts
  are the same in the anchor's frame at every facing.
- **Stronger design-time checks:** derived parts' stage, role, catalog and
  box; joint types and side names; touches between added parts (only two
  ends of one member butting, or a sheet, may touch unjoined). The floor
  now toenails a block to a sill however little it rests there (`on_sill`
  by contact, not nailable width). At a corner, the end of one upper plate
  meets the side of the lapping one: a new joint type, `plate_end`.
- **Smaller:** the storey keeps its children's joints; plate joints only
  over a member that reaches the lower top plate; the sill lumber must be
  the same in every wall.
- **Tests:** four facings and another anchor (same parts in the building's
  frame), through gable walls, open walls, the floor's errors (too small, a
  sliver row, a seam off a joist, overlapping blocks, blocks into a rim),
  no stray blocks, `checkAdded`, the engine's checks on a derived module's
  output; `faceToFace` and `nailable` in the core's recorded results.

**Open design questions** (owner: leave for now):

1. **Placing against derived parts.** Derived modules run after placement
   and have no ports, so nothing can be placed against them: T-junctions
   and interior walls, an upper storey on a floor, a roof on the top plates.
   With sliding ports gone, a position along an edge has no mechanism.
2. **Levels and several storeys:** one `derive` per layout, and the storey
   takes every entity.
3. **Stable ids:** derived joints are numbered across the storey, so an edit
   renumbers them; line ids come from the first panel's id.
4. **What a derived module reads:** the storey knows interface ids, ports
   and part roles (`top_plate`, `bottom_plate`, `stud`), bypassing the ports'
   exposes; the schema could declare what it reads and the builder check it.
   A layout without the storey leaves the sheets' top edges unbacked.
5. **Versioning:** nothing ties `derive.js` to the `library.json` it goes
   with; the app can't load it from `web/` yet.
6. Lost with the placed floor: a floor that differs from the walls' outline
   (an overhang, a deck).
