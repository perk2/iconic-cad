# Hut project: plan

Personal planning document for my fork of Iconic CAD. **Not for upstream.**
It lives on the `hut` branch only (see [Git workflow](#6-git-workflow)).

## Where we are (2026-11-19)

Prototyped and tested: walls, the wall with an opening, and derived modules
(`storey`, `wall_line` with the upper top plate, and the floor derived from
the walls; [design/ic_derived.md](design/ic_derived.md)); the placed floor,
`wall_on_floor` and sliding ports came and went (notes in `hut/design/`). The
book review (with the owner, 2026-11-17) corrected the corner and the floor,
both now implemented: walls are placed by their framing, with a California
corner (turned stud) and an OSB strip fitted on site; the floor stands on a
sill all round, with single end joists and blocking under the gable walls'
studs ([ic_lib_wall.md](design/ic_lib_wall.md) and
[ic_lib_floor.md](design/ic_lib_floor.md), section 11). The wall with an
opening: no edge cripples, the header on the opening (no *losholt*, as in
US practice) with cripples above it, sheets with the opening cut out; the hut's door is an exterior 10x20 and the
window's head is level with it at 2000
([ic_lib_opening.md](design/ic_lib_opening.md), section 11). The hut's
framing is 3600 x 2696, its outside 3624 x 2720. `bash hut/tools/ci.sh`
runs the CI steps locally.

Next:

1. **Catalog and derived modules** ([ic_derived.md](design/ic_derived.md)):
   done: the `storey` and `wall_line` derived modules with the upper top
   plate, run by the engine ([ic_lib_top_plate.md](design/ic_lib_top_plate.md));
   the floor derived from the walls, with the placed floor, `wall_on_floor`
   and the sliding ports removed. Open: the design questions in section 12
   (placing against derived parts, several storeys, stable ids, what a
   derived module reads).
2. **Book review, continued:** W1, W2 (the header's size), W6 to W12 (W9:
   the gap between a unit's frame and its rough opening), N1 to N8, the rest of the
   floor (F-e to F-h, S1 to S7, B1, B2) and the words still open (V5, V8 to
   V10, V17, V26, V40 to V56).

Open from the book review (2026-11-17):

- **TODO:** review the floor sill on a pier foundation (the book's example
  is a sill on a foundation wall; the hut will more likely stand on piers).
- **REVISIT** with the roof: the floor assumes a gable roof with gables east
  and west (joists run parallel to the gable walls).
- The wall layout decides the floor's (and later the roof's) framing: joists
  and blocking line up with the studs above (F-c).
- **REVISIT** the corner sheathing (C3): for now a thin OSB strip fitted on
  site, with tape or a wind barrier strip over seams and corners.
- **Confirm** that the sheet seam's position at an opening is not a rule
  (ic_lib_opening.md A4, assumed).
- **TODO: check Byggforsk** (523.251, 523.701) for the opening: the header
  on the opening without a *losholt* (ic_lib_opening.md A7, from US
  practice), the 10 mm gap the Norwegian forums cite from *Trehus*.

Deferred:

- Design tables ([ic_tables.md](design/ic_tables.md)): they wait for our own
  Eurocode 5 calculation (section 5 there); until then variants name their
  lumber by hand, checked against the books.
- Deriving the floor from the wall loop (T18, F1).
- Fastening walls to the floor (F9).

---

## 1. Why

- Design and build a small single-room hut, replacing an existing one that has
  fallen into disrepair.
- Use the hut as a concrete, real-world driver for Iconic CAD development.
- A hut has most of a house's structural systems (foundation, floor, walls,
  openings, roof), just fewer of each. Whatever the hut needs is also useful to
  the wider OSE project.

## 2. Outcomes

1. **A finished, usable hut.**
2. **A scale model (1:10)**, built from the tool's own cut list and build-order
   output before the full-size build.
3. **Iconic CAD improvements in my fork:** a metric/Norwegian construction
   system, a floor platform, a pier foundation, a roof, and derived outputs
   (cut list, fasteners, build order).
4. **Written architecture designs** (section 5), later turned into proposals
   with working examples for upstream.

**Non-goals:** electrical, plumbing and other trades; multi-story; interior
finishes; making the tool design *everything*.


## 3. Streams

| Stream | What | Output |
|---|---|---|
| **A. Hut design and build** | Survey, requirements, rules, design, scale model, materials, build | A hut |
| **B. Iconic CAD architecture and design** | Understand the code, identify good architecture, write design notes, prototype in the fork | Design notes, prototypes, the tool features the hut needs |
| **C. Upstream** (later) | Turn proven designs into proposals with examples | PRs and discussion with OSE |

Stream C only starts once a design is understood and has been tried on the hut.

## 4. Stream A: hut design and build

### Steps

1. Survey the existing hut and site.
2. Clean up the existing hut, carefully (see [Clean-up and
   contaminants](#side-quest-clean-up-and-contaminants)).
3. Write down requirements and check the rules.
4. Decide: repair or rebuild, and where the new hut goes relative to the old.
5. Design the hut, as far as possible in Iconic CAD.
6. Build the 1:10 scale model from the tool's output, and fix what it reveals.
7. Order materials; plan tools and helpers.
8. Build, using the old hut as site storage if possible. Note every place the
   output was wrong or missing.
9. Demolish the old hut (if rebuilding) and sort the waste.

### Survey: existing hut and site

- [ ] Photos from all sides, inside, roof, underside, foundation
- [ ] Footprint and heights measured (sketch with dimensions)
- [ ] What it's standing on (blocks, piers, skids, ground contact?)
- [ ] Condition: rot (check sill, bottom plates, floor joists first), roof,
      cladding, windows, door
- [ ] What's salvageable: materials, windows, door, foundation
- [ ] Ground: slope, drainage, rock or soil, roots, frost conditions
- [ ] Access: how materials get there (road, path, distance to carry)
- [ ] Sun, trees that overhang or could fall, prevailing wind and snow drift
- [ ] Distance to property boundaries and other buildings

### Requirements

- [ ] Intended use (storage, day hut, sleeping, workspace)
- [ ] Will anyone sleep in it? (affects rules and insulation)
- [ ] Size, and the reason for it
- [ ] Insulated or not; heating (wood stove?)
- [ ] Windows and light; door direction
- [ ] Look and materials (traditional, modern, salvaged)
- [ ] Budget

### Rules (check with the kommune, don't assume)

- [ ] Zoning of the plot (forest land is often LNF, which can be stricter)
- [ ] Whether a small outbuilding (often up to 15 m²) is exempt from applying
      here, and under which conditions (use, distance to boundary, etc.)
- [ ] Whether *replacing* an existing building is treated differently from
      building new
- [ ] Characteristic snow load for the location (needed for the roof)

### Using the existing hut during the build

Even if nothing in it is salvageable, the old hut can be useful until the new
one is closed in:

- Dry storage for lumber, sheet material, fasteners and tools
- Shelter from rain; a place for a workbench and for breaks

This affects siting and sequencing. If the new hut can go beside the old one,
the old hut stays up until the new one is weather-tight and is demolished last.
If the new hut has to go on the same footprint, plan other storage (tarps,
pallets, a temporary lean-to) or demolish in stages. The old hut only works as
storage if its roof still keeps water out, and only after it has been cleaned.

### Side quest: clean-up and contaminants

Old, unmaintained huts often have mice or voles, and may contain hazardous
materials. Treat the clean-up as its own job, done before the hut is used for
storage or taken apart.

**Rodents**

- Voles can carry *musepest* (nephropathia epidemica). FHI describes it as
  widespread across Norway, with most reported cases from Innlandet. It spreads
  mainly by breathing in dust from droppings, urine and nests.
- Air the hut out well before starting.
- Clean with a wet cloth. Don't sweep or vacuum dry droppings or nests, since
  that stirs up dust.
- Wear rubber gloves and a face mask (FHI's advice); a well-fitting FFP2/FFP3
  mask is the safer choice for dusty work like removing insulation or nests.
- Wash hands and clothes afterwards; bag waste before carrying it out.
- Old insulation with nests in it is best removed whole and bagged, not broken
  up.

**Materials to identify before cutting, breaking or burning**

- [ ] **Asbestos:** possible in older buildings (it was banned in Norway in
      1985), for example in fibre-cement sheets on roofs or walls. If in doubt,
      don't break or cut it; get it checked.
- [ ] **Treated wood:** older pressure-treated wood (CCA) and creosote-treated
      wood are hazardous waste. Never burn them.
- [ ] **Old paint:** may contain lead; avoid sanding or burning it.
- [ ] **Mould:** wear a mask; don't store new materials where it's damp.
- [ ] Wasp nests, broken glass, rusty nails.

**Waste**

- Sort demolition waste: clean wood, treated wood (hazardous), metal, glass,
  insulation, any asbestos (hazardous, special handling).
- Check what the local recycling station (gjenvinningsstasjon) accepts and how.

### Open design questions

- Site: beside the old hut, or on the same footprint?
- Roof shape: a shed (mono-pitch) roof is simplest to model and build; a gable
  is more traditional.
- Foundation type: piers, blocks or skids.
- Floor: joist platform, insulated or not.

## 5. Stream B: Iconic CAD architecture and design

### Steps

1. Fork, clone, run locally, run the tests, read the code.
2. Model the hut in the tool **as-is**, with no code changes; list every gap.
3. Write design notes for the topics the hut needs first.
4. Prototype designs on branches, applied to the hut.
5. Build the features the hut needs: metric system, floor platform, pier
   foundation, roof, derived outputs.

### Approach to design

1. For each topic, write a short design note in `hut/design/` using this shape:
   **problem, current state (with file references), options, proposal,
   consequences, open questions.**
2. Try the proposal as a small prototype on a branch, applied to the hut.
3. Only once a design holds up on the hut does it become an upstream proposal.

Work on the topics in the order the hut needs them, not all at once.

### Vocabulary

Types live in the library; instances live in a design; derived things are
computed and never edited.

| Layer | Concept | Meaning |
|---|---|---|
| Library | **System** | A group of compatible building blocks (modules): grid, lumber and sheet catalog, build-ups, fastening schedule, plus the modules that have variants for it and the interfaces that have implementations for it. Decides what is available in the GUI. Today's `web/data/systems/seh.json` / `vcs12.json` are partial systems |
| | **Code profile** | Code + pinned edition + national annexes (TEK17 with Eurocodes, IRC 2021). Checks the design, including the system's build-ups and fastening schedule; supplies loads and bracing methods. Chosen separately from the system; reused across systems |
| | **Module** | A parametric, system-independent building block (load-bearing wall, load-bearing wall with opening, partition): owns its schema (parameters, ranges, constraints), compiler (part enumerator), ports, icon and build-book template. Upstream calls this a *family* (`framed_wall_panel`); the wiki calls it a module (ICHL-015) |
| | **Variant** | A named, standardized set of parameter values for one module in one system ("1200", "10x12"), fixed (no per-entity overrides), with a status. Values only: a different construction is a different module. Lives in `modules/<m>/systems/<s>.yaml` (T17). Upstream calls this a *module* (`wall_4x8_2x6_16oc`); the wiki also calls it a variant (ICHL-015-OC16). Was *preset* |
| | **Interface** | A system-independent agreement between two **roles**: how they meet (the placement rule, written in the port frame of one role, the *reference*), directed relations (*bears on*, *fastens to*), named checks. Always two distinct roles. Places the modules. Lives in `interfaces/<i>/` (T17). The wiki calls it an *interface specification* (ICHL-IF-NNNN). Was *port type* |
| | **Role** | One side of an interface (*through*/*butt*, *bearing*/*support*, *a*/*b*). Relations go between roles |
| | **Port** | A connection point on a module, with a frame: origin, `normal` (out of the module), `along` (the axis the two connected ports share), `across` (the third axis, in the port's face), and a derived *hand*; a sliding port also names the axis it slides along and a length. Declares which roles of which interfaces it can play, and exposes named parts (`end_stud`, `bottom_plate`); each interface role says which names a port filling it must expose |
| | **Implementation** | One way to build an interface (`backer`, `three_stud`), split by construction. Sees only the parts the interface's roles expose, in the connection frame (the reference role's port frame); adds parts (each with a host panel and a stage: site or workshop) and joints; never moves modules. Generic code in `interfaces/<i>/implementations/`; a system file lists the implementations the system allows (one, for now). The wiki's interface record calls it *implementation* too. Corresponds to a **construction detail**, the trade term; a build book should perhaps use that word. Was *detail* |
| | **Assembly** | A reusable group of modules and assemblies, with promoted ports |
| Design | **Project** | One building or site, with intent (stories, system, code profile) and site values (characteristic snow load, wind, climate, true north) |
| | **Entity** | A placed module or assembly; refers to a module and one of its variants in the project's system. No per-entity overrides of variant values (for now); a different size means a different variant |
| | **Connection** | One use of an interface: which entity's port fills each role (corner: which wall runs through), a position for a sliding port, and a required id (pinning an implementation is a later improvement). **Stored** connections are the user's choices and the truth of the layout; positions are derived from them and one anchor. **Derived** connections are generated (walls on a derived floor, lapping top plates) and are checked and built the same way. The wiki calls it a *connection occurrence* |
| Derived | **Model** | Everything that follows from a layout and the library asset: entity positions, all parts, joints and issues. Made by the engine; never edited. The *building model* of BIM. Layout = what was decided; model = what follows |
| | **Part** | A physical piece inside a module (stud, header, sheet). Internal to the module; not a building block the user places |
| | **Joint** | One occurrence of a **joint type**: two parts held together, one on each of the joint type's two *sides*. From the module's compiler (inside a module) or from a connection's implementation (between modules). Derived, never stored or chosen; places nothing |
| | **Fastener** | A nail, screw or other fastener, from the system's catalog. A joint's schedule entry says which and how many; the prototype stores a count per joint, and positions come later. Counted in the bill of materials |
| | **Issue** | Output of a constraint check: rule, entities, reason |
| | **Operation** | A build step, ordered by dependencies |

Joints repeat the interface pattern one level
down, between parts instead of between modules:

| | Module level | Part level |
|---|---|---|
| Type (the contract) | **interface** (`wall_corner`) | **joint type** (`stud_to_plate`) |
| Two ends | roles (*through*, *butt*) | sides (*plate*, *stud*; named per joint type, never reusing role names) |
| How, per system | **implementation** (`backer`) | **schedule entry** in the system's fastening schedule, or on a build-up layer |
| Instance (one occurrence) | **connection**: stored, chosen by the user, places modules | **joint**: derived, never chosen, places nothing |
| Produces | implementation parts and joints | fasteners |

A joint type names *what* is joined (`stud_to_plate`, `stud_to_stud`,
`sheathing_to_framing`), never *how*; the schedule says how (nails or screws,
count or spacing, drive direction). Joint types are a small, fixed,
system-independent list, so the same joint gets nails in one system and screws
in another, and conversion between systems maps them. Every joint a compiler
or implementation emits must find a schedule entry in that system: on the
build-up layer one of its parts came from, or in the system's fastening
schedule for its type.
Joint types are lighter than interfaces: a name in a list and a row in a
schedule, with no folder, ports or choice. The wiki's words: our *interface* is
its *external interface*; our *joint type* is its *internal interface* or
*microinterface*.

"Role" means a side of an interface, and also, on a part or a build-up layer,
its job (a stud, a bracing layer); the contexts don't meet. A placed wall has
no role: its derived properties are `exterior`, `load_bearing` and `braced`
(T14).

Rules come in three kinds: **construction rules** (inside a module),
**connection rules** (interfaces and implementations) and **constraints**
(global checks over a whole design).

**Toolchain.** Components connected by artifacts; each component is made of
passes; library content (compilers, implementations) is plugged into the library
builder.

| Concept | Meaning |
|---|---|
| **Phase** | When something is decided or computed. *Library time*: contributors and CI build the library. *Design time*: a design is edited and resolved. (Later perhaps *build time*: on site, using the build book.) Not "stage" (taken by workshop/site) or "step" (taken by build order) |
| **Component** | A separately runnable unit with defined input and output artifacts, replaceable without touching the others: the **library builder** (`build_lib.py`), the **engine** (layout + library asset → model), the **editor** (the app's UI), and the consumers of a model (plan, bill of materials, FreeCAD export, build book) |
| **Pass** | A step inside a component, handing objects to the next in memory, no files. Library builder: load, validate, resolve, compile, compile implementations (placement transforms and baked implementations), export. Engine: load, check, place, close loops, assemble, derive |
| **Artifact** | A file passed between components (below). Generated artifacts are never hand-edited |

| Artifact | Made by | Read by |
|---|---|---|
| **Library source** (`library/`, YAML) | contributors | library builder |
| **Library asset** (`web/assets/library.json`) | library builder | editor, engine |
| **Layout** (e.g. `hut.json`): topology, one anchor, no coordinates | editor, a script, or by hand | engine |
| **Model** (e.g. `hut.model.json`): positions, parts, joints, issues | engine | plan, bill of materials, FreeCAD export, build book |
| **Outputs** (SVG, CSV, `.FCStd`, PDF) | consumers | people |

A module's **compiler** (and an implementation's code) is library content, not a
component: it turns a variant's parameters (or an implementation's participants) into
parts, and the library builder runs it in its compile pass. The editor reads
only the library asset, never the library source; that is what keeps the web
app decoupled from the library.

**Languages.** Library code is JavaScript at library time and at design time
(why: [design/ic_derived.md](design/ic_derived.md) section 8). At library
time Node runs the library builder and the library content (module
compilers, implementations); because variants are fixed, their output is
finite and baked into the library asset. At design time the browser runs
the editor and the engine, which is generic (no module-specific code), the
single source of placement, checks on layouts and assembly, and runs the
derived modules' code it is given. Node runs the same engine for tests, CI
and a command line. Consumers read the model; solids (FreeCAD) stay with
upstream's existing tooling.

Compilers are not called at design time. The engine assembles baked parts once
into the model, and every consumer reads the model. The engine produces a model
even when there are issues, so a broken or half-finished layout can still be
shown with its problems marked. Minimum contents of the model:

| Contents | Needed by |
|---|---|
| Entities with module, variant and transform | 3D view, fab cards (identical panels grouped), labels |
| Parts in panel-local and world coordinates, with section, material, stage, host, and a reference to the baked solid in the library asset | 3D view, FreeCAD export, bill of materials, cut lists, fab cards |
| Connections and derived runs | build summary, build order |
| Joints | fasteners, build book |
| Issues | editor, build book |

Authored content (fab card text, prices) stays in the library asset; consumers
look it up by module, variant and system.

Placement rules are data in the library (`rule: corner`, `reference: through`,
`offset: through.depth`) that the library builder applies once per possible
port pair and variant pair, storing the result as a transform in the library
asset. The engine knows no rules; it composes transforms. A new rule kind is a
builder change. Named interface checks (`checks: [same_height]`) depend only
on the variant pair, so the builder applies them too; a pair that fails is not
baked, and the asset records why. The engine knows no checks.

The model stays on right angles: anchor facings are multiples of 90 degrees.
True north is a site value, applied on export.

Checks split by phase: anything about one module, variant or implementation runs at
library time (schemas, catalog references, ports and roles, per-variant code
checks, baked); anything about a layout or model runs in the engine at design
time (loop closure, free ends, ports used twice, and the code profile's design
checks such as braced length, spans and stove clearance, for live feedback).

### Topics

**T1. Domain model and vocabulary**
Write the vocabulary above down properly and map each concept to where it lives
in the code today (or doesn't). Keep the type/instance line clean: a module
never stores where it's placed; an entity never stores how it's built.

**T2. State management (Elm-style)**
Current: global mutable `doc` (`web/js/state.js`), mutated in event handlers
(`web/js/ui.js`), undo by inverse commands; `markModelChanged()`
(`web/js/app.js`) already re-derives views.
Direction: one `dispatch(msg)` calling a pure `update(doc, msg)` that returns a
new document; undo as a stack of previous documents; keep three.js and canvas
pan/zoom imperative. No framework, no build step.

**T3. Ports and interfaces**
Current: four untyped corner ports for every module (`web/js/geometry.js`);
what may connect is decided by `if` branches in `web/js/snap.js` and the canvas
click handler in `web/js/ui.js`.
History: a port-based placement compiler was tried and dropped because it
couldn't resolve corners (`docs/design_decisions.md`, rejected alternatives).
The difference now: the user's chosen connection (including which wall runs
through) is stored, not inferred.
Direction (one design iteration with Fable, then discussed, 2026-11-11;
prototype in [design/ic_lib_wall.md](design/ic_lib_wall.md)):
- **Interface, role, port.** Interfaces are system-independent agreements
  between two distinct roles; ports on modules declare which roles they can
  play. Two ports may connect if they fill the two roles of one interface, so
  there is no separate compatibility table. Always asymmetric: even an inline
  seam has a left and a right end. Every module has an A side; for a wall whose
  build-up is the same on both sides it is arbitrary (if the UI ever wants to
  flip such walls, derive symmetry from the build-up, don't declare it).
- **The interface places; the implementation fills in.** A small set of
  placement rule kinds (`flush`, `corner`), each a fixed turn plus an offset
  written in the reference role's port frame, with the hands it accepts; the
  builder stores the result per port pair as a transform (definitions in
  [design/ic_lib_wall.md](design/ic_lib_wall.md)).
  Changing the implementation or converting system never moves walls. Geometry that is
  truly different is a different interface.
- **No "option" level.** The implementation is the only choice. Cases an implementation can
  work out from geometry stay inside it (C1/C2 blocking, as
  `getBlockingTypeC` in `web/js/snap.js` does today).
- **Module compilers don't depend on connections.** A variant always produces
  the same panel (validation; identical panels in the workshop). What a
  connection needs is added by its implementation, as parts owned by the connection
  with a host panel and a stage (T10). Ports expose named parts that always
  exist; each interface role lists the ones it needs, and implementations
  never reach into a module by part name otherwise.
- **Ports.** Frame: origin, `normal`, `along`, `across` (all stored, since
  left and right frames are mirror images), and a hand derived by the builder.
  `x`, `y`, `z` mean module or world coordinates only, with `z` up. Wall datum: exterior face (A),
  bottom-left seen from outside. Wall ports sit on the framing's outer face,
  so walls are placed by their framing, against each other and on floors
  (2026-11-17, ic_lib_wall.md 11). Wall ports: `left`, `right`
  (fixed ends); the `bottom` port went with the placed floor (2026-11-19);
  an `inside` face (T-junctions) and `top` are not built.
- **Corners end to end.** `wall_corner` joins two end ports; both ends can play
  either role, and the connection records which wall runs through at that
  corner (a topology choice: it moves walls by one wall depth).
- **Sliding ports** (2026-11-11 to 2026-11-19, removed): a connection that
  could land anywhere along an edge or face (walls on a floor). Removed with
  the placed floor; how T-junctions and a roof get their positions is open
  (ic_derived.md section 12).
- **Directed relations** on roles: **bears on** (a wall's bottom bears on the
  floor) and **fastens to** (a butt wall fastens to the through wall). Build
  order (T10) and load paths need them.
- **Two participants only** for now. Agreements without contact (clearances,
  service routing) become constraints (T4).
Prototype (reviewed 2026-11-15, [design/ic_lib_wall.md](design/ic_lib_wall.md)
section 10): `wall_inline` and `wall_corner` with one implementation each,
placed by a walk with loop checks, build the hut's wall loop. Roles, ports
with stored frames and derived hands, placement rules baked as transforms,
excluded pairs with reasons and exposes per role all held up. The static app
finds everything in one library asset (`web/assets/library.json`). The
`inside` port (T-junctions) and `top` are not built.
Sliding ports came with the floor (2026-11-15,
[design/ic_lib_floor.md](design/ic_lib_floor.md)) and went with it
(2026-11-19): the floor is derived from the walls by the storey.
Open: inner (re-entrant) corners; `at` across systems with different grids.

**T4. Constraints and validation**
Current: rules run only at placement time, inside the click handler; a rejection
shows a red flash with no reason.
Direction: `validate(doc) -> issues[]`, built from small named pure checks
(door swings, spacing, level-2 footprint, later load paths). Run on every
change, on load and on undo; show reasons.
Finding: the keep-out distances in `README.md` (48", 24", "16" minimum")
don't match `web/js/constants.js` (12", 6", 12").

**T5. Candidates and declarative dragging**
Direction: `candidates(doc, module, dir)` returns legal placements (from ports,
filtered by `validate`). While dragging, render each candidate's consequences
(framing, blocking, cost) using the pure enumerators. Look at Dragology's
model-driven approach; the existing canvas renderer may be enough.

**T6. Parts: generalizing `enumerateMembers()`**
Current: `web/js/members.js` has two branches (wall, aperture); parts are flat
panel elevations (x, z only); stud size is hardcoded
(`isInt ? '2x4' : '2x6'`) despite `stud_lumber_nominal` in the module data;
foundations (`web/js/foundation_geom.js`) and machines have separate code.
`enumerateMembers()` plays two roles today: it is the compiler of two modules
behind one `if` (library time: `build_lib.py` runs it through
`scripts/export_members.mjs` to bake `web/assets/lib/members.json`, which
`seh_lib/wall_builder.py` reads for solids), and consumers call it again per
entity at design time (`render3d.js`, `bom.js`, `render_fab.js`,
`render_summary.js`, `fcstd.js`, `designs.js`), because there is no model.
Direction: one compiler per module (`library/modules/<m>/compile.js`),
input the variant's resolved parameters, output parts in full 3D (role,
material, section, position, later rotation), port frames, exposed parts and
internal joints, baked by the library builder. This moves upstream's single
enumerator out of the app into the library for new-format modules; it stays one source (decision 6),
and the v1 path keeps working until v1 modules are migrated or retired.
Trigger: the hut's floor and roof.
Prototype (reviewed 2026-11-15): the wall compiler outputs axis-aligned boxes
with role, material, catalog id, stage and, for a part made from a build-up
layer, `layer`; there is no section or rotation field. Enough for walls; the
roof needs rotated parts or modules described lying flat and tilted by their
connection. Compilers import nothing: they get the library core
(`web/js/library/`, the code the builder itself uses) as an argument, so a
rule both need (the 1 mm touch rule) is written once; the wall compilers
share `WallPanel` there ([design/ic_lib_opening.md](design/ic_lib_opening.md)).

**T7. Connections, implementations and joints**
Current: blocking is computed twice, in `web/js/fcstd.js` (`createBlocking`)
and `compile_from_json.py` (`create_blocking`), held equal by parity tests.
The C1/C2/T choice is stored on the connection today; C1 vs C2 is derived from geometry.
Direction: every interface has one or more implementations per system; the implementation
generates the connection's parts and joints, never its placement (T3).
Implementations are library content, run only by the library builder: baked per
pair of variants that can fill the roles, in the connection's frame (left- and
right-end corners are mirror images: bake both or mirror). The engine places
the baked output and never runs an implementation. If a catalog grows large, key the
bake by the parameters an implementation reads, so equal outputs are shared.
Open: implementations on sliding ports depend on the position (T-junction blocking C1
vs C2). Positions are on a grid, so bake per grid position or key by what the
implementation reads; confirm with a T-junction prototype before relying on it.
Prototype (reviewed 2026-11-15): implementations are baked per port pair and
variant pair, both hands, with the participants already placed in the
connection frame; the engine never mirrors and never runs an implementation.
Keying by parameters isn't needed yet: three wall variants give 10 corner
pairs and 26 excluded pairs in 82 KB.
Implementations on sliding ports (`wall_on_floor`) are baked once, at
position 0, and must not depend on the position; the builder enforces that
the sliding role exposes nothing. Position-dependent implementations
(T-junction blocking) remain open.

**T8. Fasteners and schedules**
Current: nail counts per module are hand-typed in `web/pricing.json`.
Prototype decisions (joint ids, stage, schedule entries, fastener counts) in
[design/ic_joints.md](design/ic_joints.md).
Direction: fastener catalog + schedule (data in the system, with code source
and edition; the code profile checks it, the same rule as build-ups) + joints
with a joint type, from compilers and implementations + fastener counts per
joint (positions later). Count and spacing patterns, edge/field spacing for
sheathing. Engineered connections as explicit overrides.
Joint types name what is joined and why (`corner_studs`, `header_plies`,
`stud_to_plate`, `sheathing_to_framing`), from a system-independent list in the
library; compilers and implementations emit them as they create parts.
The prototype handles edge and field spacing with `edge_spacing` instead of
`when` conditions, and keeps one `sources` list per system instead of a code
source and edition per entry. `when` conditions on module properties
(load-bearing, braced) wait until modules have those properties (T14).
Suggestion for later, not needed for the prototype: site loads (wind class,
exposure) need different fastening for the same panel; the schedule could have
tiers, fasteners baked per tier, and the code profile picks the tier from the
project's site values at design time.

**T9. Assemblies**
Current: placing an assembly flattens it into loose walls
(`explodeAssembly()` in `web/js/assembly_translate.js`).
Direction: modules and assemblies are placed and connected the same way. Both
have ports, so an interface can join a module to an assembly, or two
assemblies, through the assembly's promoted ports (child ports it exposes as its
own). From the outside an assembly looks like a module, so placement, checks
and the bill of materials need no special cases (the composite pattern).
Assemblies keep references to their children instead of being flattened.
An assembly is a layout fragment: the chosen entities, the connections among
them, and the promoted ports. It contains no new geometry or code, so it needs
no baking and the engine expands it at design time. It can be saved in the
project (a hut-local "south wall with window") or contributed to the library
(`library/assemblies/<a>.yaml`), where the library builder only validates it
(modules, variants and interfaces exist in that system) and copies it into the
library asset. Saving one is an editor operation on the layout, with the model
supplying defaults (free, outward ports as promoted ports) and checks (no
issues in the selection). Today's "Save as Module" (`custom_save.js`, which
calls `composeAssembly()`) is already this, under the wrong name: rename it
*Save as assembly*. New modules and variants are made at library time only.
Open: per-instance overrides; multiple groupings of the same entities (by room,
by build stage).

**T10. Transforms: build order, cut lists, scale model**
Direction: build order from the connection dependency graph (topological sort
into parallel stages), recursive through the hierarchy. The graph's direction
comes from the port contracts (T3: *bears on*, *fastens to*) and from implementations
(T7) that add work to an earlier step on another part (T-junction blocking goes
into the exterior panel before it is sheathed). Three steps: fabricate panels
(from the variant alone, so panels are identical and interchangeable), fit
implementation parts marked *workshop* to their host panels (optional; ties a panel to
its position), and erect on site (from the connection graph, fitting implementation
parts marked *site*, the default). The interface's system file says which
stage each implementation part uses, and build-up layers carry a stage the same way
(T14). Open: the default stage of implementation parts in the Norwegian system. A
closed loop of tied walls marks when temporary bracing can come off. Cut lists
against stock
lengths; a scaled cut list for the 1:10 model; step-by-step instructions with
new parts highlighted. Temporary bracing added by rules on connection types.

**T11. Systems and units**
Current: imperial assumptions in code (`web/js/constants.js`: inch
conversions, 2x lumber table, header defaults); the system manifests hold only
grid, stud spacing, wall depth and a palette of plain exterior walls; interior
and aperture modules are hard-coded; `family` is a label in the library data
that no runtime code reads (`enumerateMembers()` branches on `mod.aperture`);
VCS-12 bypasses `enumerateMembers()` entirely.
Direction: a Norwegian system (48×98, 48×148, c/c 600 mm, metric sheet sizes,
Norwegian window sizes, its build-ups) added **without code changes** to the
system logic, used with a TEK17 code profile. Site values (snow load) belong
to the project, not the system. Whatever needs code
to make this work is a list of hardcoded assumptions to fix.

**T12. Geometry generation and the "no backend" decision**
Current: the browser can't create solids; it packs pre-baked BREPs and stretches
a box template (`web/js/fcstd.js`), per `docs/design_decisions.md` decision 1.
Problem: a roof with arbitrary span and pitch needs angled cuts that can't be
pre-baked for every variant.
Options: pre-bake a fixed set of roof variants; approximate with boxes; a
geometry kernel in the browser via WebAssembly (opencascade.js); generate roof
geometry only in the Python/FreeCAD path. Must respect decision 1 or argue
explicitly for revisiting it.

**T13. IFC**
Current: `export_ifc.py` writes one box `IfcWall` per module.
Direction: IFC as an output (members as `IfcMember` etc.) and as vocabulary
inside the schemas; IDS for validation later. Lower priority for the hut.

**T14. Build-ups (layers)**
Current: `enumerateMembers()` ignores the `osb_thickness_in` parameter and
decides OSB by `isInt`; the `interior` flag bundles framing, layers, thickness,
placement rules and display.
Direction: framing (the module) separate from the build-up (ordered layers on
faces A/B, each with material, thickness and roles such as `bracing`,
`wind_barrier`, `vapour_control`). Build-ups are data in the system (a small
catalog: exterior, interior, later wet room, unheated). The build-up is part of
the variant: an exterior and an interior load-bearing wall are the same module
with different variants ("1200 exterior", "1200 interior"). No per-entity
overrides (see decision log).
A wall's **derived properties** are derived and **checked, not chosen**:
`exterior` (on the boundary of the enclosed region, `web/js/region.js`),
`load_bearing` (something bears on its top port, T3), `braced` (counts toward
its wall line's bracing). The variant states the same properties; a mismatch
is an issue (T4) that names the property: an exterior variant inside the
building, a partition under a joist. A later distinction (a separating wall
between dwellings) is another property, not a new value. A partition's top port does not accept
load, so it cannot sit in a load path. The code profile checks build-ups
against its rules.
Terms: exterior/interior (*yttervegg/innervegg*), load-bearing/non-load-bearing
(*bærende/ikke-bærende*), partition (*skillevegg*, *lettvegg*; usually
non-load-bearing), braced wall (*avstivende vegg*), separating wall between
dwellings (*leilighetsskillevegg*). These are independent axes, not one list.
Stages: each build-up layer has a stage (workshop or site), like implementation parts
(T10). Layers that must be continuous across panel joints (wind barrier,
vapour barrier, in practice cladding) can't be finished panel by panel.
**Open panels** for the hut and the Norwegian system: the workshop panel is
framing plus the bracing sheet; insulation, wind barrier, battens, cladding,
vapour barrier, service cavity and lining are fitted on site. Panels stay light
enough to carry by hand and the airtight layers stay continuous. Closed panels
would be a different system choice.
Hut build-ups (designed as if heated; wood stove today): exterior wall, from
outside in: cladding 19–22 mm, battens 23 or 36 × 48 (ventilated gap), wind
barrier, bracing sheet (OSB or plywood, unless the wind barrier board braces),
48×148 c/c 600 with 150 mm mineral wool, vapour barrier 0.15 mm PE, service
cavity 48×48 with 50 mm insulation, lining 12–15 mm. Also needed from the
start: floor over a ventilated crawl space, and roof. The wall behind the
stove may need its own build-up (non-combustible lining or stove plate);
clearances are a constraint (T4). Check with the kommune whether TEK17's
energy chapter applies to a hut this small.

**T15. Code profiles and validation**
Direction: the project selects a code profile (code + edition + national
annexes, e.g. TEK17 with Eurocodes, or IRC 2021) separately from the system.
It takes site values from the project and supplies bracing methods, design
loads and checks; it checks the system's build-ups and fastening schedule
rather than supplying them. Separate because codes change on their own
schedule, one code serves many systems and one system is used under several
codes. Requirements can be met prescriptively
or by calculation (e.g. Eurocode 5 racking); outcomes: pass, pass by
calculation (needs review), fail or out of scope, each with citations. Pin the
code edition and rule-pack version per project. Rules written in my own words
with citations.
Design tables (spans, header sizes, jack and king counts): deferred, draft in
[ic_tables.md](design/ic_tables.md). Tables are system data that the builder
applies when it resolves a variant (select or check), each decision recorded
in the library asset. Load classes are a variant dimension, and the engine
checks them against the project's site values. The code profile checks the
system's tables rather than supplying them. Published tables can't carry
values taken from Byggforsk or code tables (database right), so tables wait
for our own Eurocode 5 calculation. Until then variants name their lumber by
hand, checked against the books and citing them, and stay few.

**T16. Topology and system-independent designs**
Current: a layout stores concrete module ids at absolute x/y
(`docs/layout_schema.md`); the corner port chosen when snapping is thrown away
(only T-junction connections are stored); module ids encode US sizes
(`window_4x8_2x6_36x48`).
Direction: the layout stores entities (module + variant) and connections, plus
one anchor (an entity, a position and a facing in multiples of 90 degrees;
true north is a site value applied on export); positions are derived by walking the
connections. Some connections locate (a walk from the anchor), the rest only
check: in a closed loop of walls the last corner checks that the loop closes.
Connections on a sliding port carry a position in host terms. Absolute
coordinates are an export output only. The layout records the git hash of the
library it was saved with; revisions are otherwise deferred until a hut works. Switching system is `realize(design, system)`: keep the
topology, let dimensions float, report a diff (footprint, changed openings,
no equivalent). Acceptance test: the hut switched from the Norwegian system to
USA SEH and back.
Prototype (reviewed 2026-11-15): layouts with entities, connections and an
anchor, placed by a walk with loop-closure checks, held up for the hut's wall
loop; the engine returns a model with issues instead of refusing a layout.
`realize` and the convertibility check are not tried (one system so far).
Compatibility is per module, not per system: converting a design (the hut is an
assembly) needs a match in the target system for each module and interface the design
actually uses (variants for the module, a system file for the interface), found recursively through sub-assemblies (T9).
Systems need not implement each other's full catalogs. A convertibility check
can run before converting ("3 of 4 match; garage door panel has no
equivalent"); partial conversion converts what maps and reports the rest as
issues. Open, for later: how matches are defined (implicit by module and nearest
variant; explicit mapping tables; or both).

**T17. Library layout and contributor workflow**
Current: one folder per fixed-size module in `library/modules/<id>/`
(`schema.py`, `compiler.py`, `meta.yaml`, `expect.yaml`); every compiler is the
same three lines calling `seh_lib`; sizes are in the ids; the wiki's ICHL-015
lists variants (`ICHL-015-OC16`, `-OC24`) on the module page.
Direction: a module is parametric and system-independent; its variants for a
system live in a small file inside the module folder, one file per system. The
new format lives in `library/` itself, beside the v1 entries (one library, two
formats during migration; v1 entries are replaced in place as they migrate).
The v1 tools must skip new-format folders. The library is decoupled from the
web app, which reads only the library asset. Authored library source is YAML
(comments carry the reasoning); everything machine-written or browser-read is
JSON. Longer reasoning goes in a `rationale.md` per module and interface.

```
library/
  modules/wall/
    schema.yaml            # what the module can build, independent of any system
    compile.js             # the module's compiler (library content)
    rationale.md
    icon.svg
    systems/
      seh_no.yaml          # this module's variants in that system, with status
      seh.yaml
  modules/wall_4x8_2x6_16oc/  # v1 entries, unchanged until migrated
  interfaces/wall_corner/
    interface.yaml         # roles with exposes, placement rule with reference, relations,
                           # checks (system-independent)
    rationale.md           # why (the wiki's rationale records; not in the first prototype)
    implementations/
      california.js        # one way to build it, generic code
      three_stud.js
    systems/
      seh_no.yaml          # implementations (one, for now), stage, status in that system
      seh.yaml
  systems/seh_no/
    system.yaml            # grid, units, catalog (lumber, sheets, windows), build-ups,
                           # fastening schedule
```

Interfaces mirror modules: the contract is shared, and each system adds a small
file saying which implementations it accepts. A system supports an interface if and
only if that file exists. Modules reference interfaces by id and role only.

```yaml
# modules/wall/systems/seh_no.yaml
# Load-bearing wall in seh_no (SEH modules adapted to Norway): open panels, c/c 600.
fixed:
  stud: "48x148"
  spacing: 600            # two bays per 1200 sheet
  height: 2400
  buildup: exterior
default: "1200"
variants:
  "1200":
    width: 1200
    status: validated
  "600":
    width: 600
    status: planned       # needed at window and door edges
```

Why: contributors mostly add one module for the system they work in, which is
then one folder and one PR; adding an existing module to another system, or
building a new system module by module, only adds a file; nobody edits another
contributor's file. A system maintainer can own `modules/*/systems/<id>.yaml`
by path. Variants are a closed, standardized set (matching industry sizes and
what can be verified in a build), not free mixing of parameters; shared values
go in `fixed`, variants state only what differs.
Schema side: the module schema states what is physically possible (types,
canonical mm ranges, cross-parameter constraints, ports); the system narrows to
what is standardized; a variant picks one combination; the code profile checks
the design that uses it. Types such as `lumber_section` and `buildup_ref`
resolve against the system's catalog. The compiler gets resolved parameters and
never sees the system name.
Checks: a module has at least one system file; a system file has at least one
variant; every variant passes the module schema; every catalog reference resolves
in that system; each variant has a status (Planned → Draft → Compiled →
Validated → Reviewed, as on the wiki). A module is in a system if and only if
its system file exists, so the system's palette is derived, not listed.
Splitting rule: modules are split where the **construction** differs, not where
the use differs. One module spanning several construction methods becomes a
catch-all compiler full of branches (as `isInt` in `web/js/members.js` today),
and mixing load-bearing and non-load-bearing code is riskier. Roughly:
load-bearing wall; load-bearing wall with opening (header, king/jack studs,
cripples; window and door as variants, as `aperture_wall_panel` does today);
partition (single top plate, lighter studs, no load path; the wiki's ICHL-023).
Hut test of the flow: two modules in one Norwegian system, *load-bearing wall*
(variant "1200 exterior") and *load-bearing wall with opening* (variants "10x12
window", "10x21 door"), each with its own schema, compiler and system file.
Open: a scaffolding
command (`new_module wall --system seh_no`); how this maps onto
upstream's `library/` and vcs-library's Schema Canon; whether door and window
stay one module or split if their construction diverges.
Prototype (reviewed 2026-11-15): the layout above held up, with the v1 tools
skipping new-format folders through `scripts/legacy_registry.py`. YAML
comments carried the reasoning; no `rationale.md` was needed yet. The
builder accepts the status values `draft`, `active` and `deprecated`, not the
wiki's Planned → Draft → Compiled → Validated → Reviewed; which set to use is
open. The library builder is one file of about 1800 lines, to be split by pass
before anything goes upstream.
Second module (2026-11-15, [design/ic_lib_opening.md](design/ic_lib_opening.md)):
`wall_with_opening`, one module for windows and doors as T17 suggests, with
variants `window_10x12` and `door_10x21` (1800 wide). Windows and doors are
catalog sections in the system (`windows`, `doors`), each entry with its size
and rough opening, read through a parameter of type `opening_unit`. The
interfaces bake pairs across `wall` and `wall_with_opening` unchanged.

**T18. Floors and other derived assemblies**
Current: no floor model; the foundation is a derived 3D-only slab
(`kind: 'foundation'`); the audits flag that second-storey floors (joists,
rim, subfloor) are missing. The wiki has registry placeholders (ICHL-240 Floor
Joists, ICHL-245 First Floor Platform, ICHL-263 Rim Joist, ICHL-267 Subfloor)
and draft SH7 floor modules measured outside to outside of the rim.
Direction: a site-built joist floor is easy to fit (joists and rim cut to
length, edge sheets ripped), while wall panel widths are set by sheet sizes. So
walls stay on the grid and the floor is a **derived assembly**: its outline
follows the outside of the wall loop (platform framing: walls stand on the
subfloor, flush with the rim), joists and sheets come from the system's
spacing and sheet rules, and the code profile checks spans. Nobody chooses its
size, so "no per-entity overrides" still holds. Wall-on-floor connections are
derived, not stored, but use the full `wall_on_floor` interface: bears on,
fastens to, joints and anchors, and checks that every bottom plate is
supported and the load path reaches the foundation. Top plates that lap at
corners are probably derived the same way. Prefab floor cassettes would be a
separate system choice later.
Hut: piers or point foundations with a joist floor built on site.
Prototype (2026-11-15, [design/ic_lib_floor.md](design/ic_lib_floor.md)): for
now the floor is a module with variants (`floor/3600x2720`), not derived;
walls stand on it through `wall_on_floor` connections on sliding edge ports,
and loop closure checks it against the walls. Wall-to-floor joints are
missing until joints through an intermediate part (the subfloor) exist.
Choosing or deriving the floor from the wall loop is the next step.

**T19. Build book**
Current: a build book already exists for walls, in US units. Per-panel
fabrication cards (`web/js/render_fab.js`) combine a derived half (elevation,
dimensions, cut list from `enumerateMembers()`) with an authored half
(materials, tools, procedure, QC) from per-archetype templates in
`web/data/card_templates/` (`standard`, `window`, `door`, derived from whether
the module has an aperture; to be keyed by module instead). Only the standard wall card has content; the door
and window cards are empty stubs. The build summary (`web/js/render_summary.js`)
adds modules by run, a map of where each goes, and a cut and pick list. The
foundation trade is slab with grade beam only. `docs/layers_seed.md` maps the
wiki's 30 layers; most are not modelled.
Gaps for the hut:

| Section | Needed | Today | Topic |
|---|---|---|---|
| Drawings | Plan with dimensions, elevations, section, detail drawings (corner, wall on floor, eaves, window) | 2D placement map | T19 |
| Checks | Spans, bracing, snow load, stove clearance, code profile results | Placement rules | T4, T15 |
| Materials | Full bill of materials, cut lists against stock lengths, sheet layouts, Norwegian catalog | US catalog, walls only | T8, T11 |
| Foundation | Pier layout, heights, frost depth, anchoring | Slab with grade beam | T18 |
| Floor | Joists, rim, insulation, wind barrier underneath, subfloor | None | T18 |
| Panel fabrication | Metric cards for wall, window wall, door wall | Standard wall card in inches | T11, T17 |
| Corners and joins | Corner details, lapping top plates, T-junctions | Corners not stored; T-junction blocking | T3, T7, T16 |
| Erection | Step-by-step order, which panel where, temporary bracing | Run order on the summary page | T10 |
| Roof | Rafters or trusses, ridge, sheathing, underlay, roofing, overhangs, gutters | None (largest gap) | T12 |
| Envelope (site layers) | Wind barrier, battens, cladding, vapour barrier, service cavity, lining, insulation | OSB sheathing only | T14 |
| Windows and doors | Products, fitting, flashing, sealing | Rough openings | T14 |
| Stove | Clearance, wall protection, chimney through the roof | None | T4 |
| Fasteners | Derived from joints | Hand-typed counts | T8 |

Direction: the build book is a transform over everything else, ordered by build
order (T10). Open panels put most of it on site, organised by build-up layer
(T14), so the site part matters more than the workshop cards. Extend the card
pattern (derived half plus authored template) beyond modules: implementations and
build-up layers get authored templates too (tools, procedure, QC), merged with
derived quantities. Open: the sections and their order; the language
(Norwegian for the hut?); print format.
Order for the hut: walls with corners, then floor and foundation, then the
envelope, then the roof. Start thinking about the roof early.

### Suggested order for the hut

T1 → T11 + T17 → T15 (profile skeleton) → T14 → T6 → T3 → T16 → T18 → T7 → T12 → T10 → T8 → T19,
with T2, T4 and T5 as the refactor that makes T3 and T16 practical. T9 and T13
can wait.

### Design principles

- Respect the existing design decisions (`docs/design_decisions.md`): fully
  static, geometry over heuristics, text formats, generated artifacts kept
  honest by tests. Changing one is an explicit argument, not a side effect.
- Data over code: a new module, system or schedule should be data a
  contributor can add without touching rule code.
- Rules as pure functions over the document.
- Interfaces carry contracts, not just geometry.
- Evolve incrementally, with the existing tests green; no rewrite.
- Generalize when the second real case arrives, not before. The hut provides
  the second cases.

## 6. Git workflow

- `origin` = my fork; `upstream` = `OpenSourceEcology/iconic-cad`.
- **`hut` branch:** this plan, `hut/design/`, hut models and notes. Never open a
  PR from it.
- **Feature branches** for anything meant to go upstream: branch from
  `upstream/main`, keep them free of `hut/` files, and merge or cherry-pick them
  into `hut` to use them.
- Sync regularly: `git fetch upstream` and rebase or merge feature branches.
- Keep photos and large files out of git (or keep them small).

```bash
git clone https://github.com/<me>/iconic-cad.git
cd iconic-cad
git remote add upstream https://github.com/OpenSourceEcology/iconic-cad.git
git switch -c hut
mkdir -p hut/design && git add hut && git commit -m "Hut project plan"
```

## 7. Risks

| Risk | Mitigation |
|---|---|
| Tool work never finishes; hut doesn't get built | Guiding rule (section 2); hand-design fallback |
| Architecture rabbit holes | Topics driven by hut needs; design notes before code; timebox prototypes |
| Repairing turns out better than rebuilding | Decide after the survey; the tool work still applies on a smaller scope |
| Rules or permits block the build | Ask the kommune early |
| Health risk during clean-up and demolition (droppings, asbestos, treated wood) | Clean-up as a planned job; wet cleaning, gloves, mask; identify materials before cutting or burning |
| No dry storage on site | Keep the old hut standing as storage until the new one is weather-tight, if siting allows |
| Snow load and structure are undersized | Get the characteristic snow load; use tables or ask someone qualified for the roof |
| Fork drifts far from upstream | Feature branches off `upstream/main`; sync regularly; talk to OSE early |
| Upstream doesn't want the changes | Proposals with working hut examples; changes that respect their design decisions; my fork works regardless |

## 8. Decision log

| Decision | Why |
|---|---|
| Use a hut as the driver for Iconic CAD work | Concrete outcome; covers most house structure |
| Separate streams for hut design and Iconic CAD | Hut doesn't wait for the tool; tool work stays focused on real needs |
| Keep this plan on a personal `hut` branch, not upstream | Personal project; upstream gets proposals later |
| Identify the architecture first; proposals and examples later | Proposals land better when proven on a real case |
| A system is a group of compatible building blocks (a kit); it decides what the GUI offers. Keep the repo's word "system" | "System" is already used in the repo for this; no new term needed |
| The code profile is chosen separately from the system (2026-11-11; replaces an earlier "locale" bundle of both) | Codes change independently of systems; one code serves many systems; one system is used under several codes |
| Build-ups belong to the system; the code profile only checks them | "The system supplies, the code checks" is one simple rule |
| Site values (snow load) belong to the project | They depend on the plot, not on the system or the code text |
| Module = the parametric building block (upstream's *family*); variant = a standardized parameter set per module and system (upstream's *module*; same word as the wiki); ids carry no parameters (2026-11-11) | Matches how users and the wiki think of a wall module; parameters are data; the module owns the logic and compiler |
| Layouts store connections, not coordinates; positions are derived | Survives system switches and size changes; keeps the user's chosen connections |
| Conversion between systems needs a match per used module and interface, not whole-system compatibility | Systems don't have to implement each other's full catalogs; partial conversion is possible |
| Entities cannot override variant values, for now (2026-11-11) | Every placed module is then a validated variant; free overrides would open too many combinations to validate. A new size is added as a variant |
| Modules split by construction, not by use; build-up is part of the variant; a wall's derived properties are checked, not chosen (2026-11-11) | Keeps each compiler focused; load-bearing and non-load-bearing code don't mix; no overrides needed; wrong placements become issues |
| Library layout: parametric module folder with one variant file per system (`modules/<m>/systems/<s>.yaml`); system folder holds what is shared (grid, catalog, build-ups) | Matches how contributors work (one module, one system, one PR); adding a module to a system only adds a file; the palette is derived |
| Interface, role, port replace *port type*; an interface is an agreement between two distinct roles, always asymmetric; ports declare the roles they can play (2026-11-11) | Aligns with the wiki's interface specification and participants; compatibility is matching roles, no separate table |
| The interface places modules; the implementation only adds parts and joints; no "option" level below the implementation (2026-11-11) | Changing an implementation or converting system never moves walls; one level of choice |
| Module compilers don't depend on connections; implementation parts are owned by the connection, with a host panel and a stage (site by default, or workshop) (2026-11-11) | A variant is one validated thing and panels are identical in the workshop |
| Interfaces live in their own folders, mirroring modules: shared contract, generic implementations, one small file per system (2026-11-11) | No interface repeated per system; same contributor workflow as modules; a shared id makes conversion checks real |
| Corners join end port to end port; the connection records which wall runs through; sliding ports only where a connection can land anywhere along an edge or face (2026-11-11; sliding ports removed 2026-11-19) | Free ends are simply unconnected ports; the through/butt choice is a stored topology choice |
| Wall datum on the exterior face, bottom-left seen from outside (2026-11-11) | Footprints are dimensioned on the outside; exterior faces stay flush across systems |
| The system holds the fastening schedule; the code profile checks it (2026-11-11) | Same rule as build-ups: the system supplies, the code checks |
| Floors are derived assemblies fitted to the wall loop; walls stay on the grid; wall-on-floor connections are derived but fully checked (2026-11-11) | Site-built floors are easy to fit, wall panels are set by sheet sizes; no override needed |
| Layouts record the library's git hash; other revisioning deferred (2026-11-11) | Nothing is released yet; detailed revisions before a working hut is overhead |
| Open panels for the hut and the Norwegian system: framing plus bracing sheet in the workshop, all other layers on site; build-up layers carry a stage (2026-11-12) | Light panels that can be carried by hand; wind and vapour barriers stay continuous across panel joints |
| The hut is designed as if heated (insulated, airtight shell) (2026-11-12) | It has a wood stove today; heating may come later |
| The build book gets its own topic (T19), extending the card pattern to implementations and build-up layers (2026-11-12) | It is a transform over everything else; with open panels most of it is site work |
| No archetype on modules; entities are module + variant; build-book templates are keyed by module (2026-11-12) | Window and door are variants of one module, so archetype no longer lines up with modules; matching across systems no longer needs it |
| *Preset* renamed to *variant* (2026-11-12) | Same word as the wiki (ICHL-015-OC16); suggests a fixed, validated thing, while a preset suggests a starting point to tweak |
| Toolchain vocabulary: phase (library time, design time), component, pass, artifact; the engine's output is the *model* (2026-11-12) | Clear names for the parts of the flow; "model" is the industry word (the building model of BIM) |
| Library code is JavaScript at library time and design time: Node runs the library builder and library content (compilers, implementations) and bakes it; the browser runs the editor and a generic engine, which also runs derived modules' code (2026-11-12; derived modules 2026-11-19) | Fixed variants make catalog output finite, so it is baked; one language for both phases; JS runs 30 to 70 times faster than Python in the browser on this kind of code and needs no runtime (design/ic_derived.md section 8); moves upstream's in-app enumerator into the library for new-format modules, still one source (decision 6) |
| Design time never calls catalog compilers (derived modules are compiled at design time, 2026-11-19); consumers read the model, which is produced even when there are issues (2026-11-12) | Consumers stop recomputing members six times; library content can be in any language; broken layouts can still be shown |
| The library is decoupled from the web app: source in `library/`, the editor reads only the library asset (2026-11-12) | The app consumes build output, as it already does for baked artifacts |
| Assemblies are layout fragments, need no baking, can be saved per project or contributed to the library; "Save as Module" becomes *Save as assembly* (2026-11-12) | An assembly composes baked modules through known interfaces, so it is legitimately design time; new modules and variants stay library time |
| The Norwegian system is `seh_no` (a subset of the Seed Eco-Home modules, adapted to Norway); the code profile is named separately (`no_tek17`) (2026-11-12) | A system is named for how it builds, not for the code; reads naturally beside `seh` for conversion |
| New-format library source lives in `library/` beside the v1 entries; v1 tools skip new-format folders; entries migrate in place (2026-11-12) | No temporary name or later rename; one library during migration |
| Library source is YAML (comments), with `rationale.md` per module and interface; generated artifacts, layouts and models are JSON (2026-11-12, trial in the first prototype) | Comments carry the reasoning for contributors; JSON is native to the browser and has no type-guessing traps. JSON source with schemas and note fields remains the alternative |
| *Detail* renamed to *implementation* (interface and implementation) (2026-11-12) | Matches the software intuition and the wiki's interface record. It corresponds to a construction detail, the trade term, which a build book should perhaps use |
| A placement rule names its `reference` role; that role's port frame is the connection frame (2026-11-13) | Baked coordinates need a defined origin, and the engine must not need interface-specific knowledge |
| Placement rules are defined as a fixed turn plus an offset in the reference port's frame (`flush`, `corner`) (2026-11-13) | Exact enough to implement; the same formula works at left and right ends |
| Port frames: origin, `normal`, `along` (shared by the two ports, kept by every rule), `across`; the builder derives a hand; frames need not be right-handed; each rule kind declares the hands it accepts; a sliding port names its axis (2026-11-13) | Works for line joints in general, not only walls; the hand makes impossible pairs (two right ends at a corner) detectable |
| `x`, `y`, `z` only for module and world coordinates, `z` up (2026-11-13) | The convention of IFC, FreeCAD and the existing 3D views |
| The builder applies placement rules and stores port-to-port transforms; the engine only composes them; impossible pairs get no transform (2026-11-13) | Rule maths in one place, next to the implementations; a generic engine; finishes "everything is baked at library time" |
| One implementation per interface and system in the prototype, no default, no pinning; it must cover every possible pair (2026-11-13) | Simple; preference order and pinning are a later improvement |
| Connections have required ids (2026-11-13) | Parts, joints and issues refer to them; survives editing; doesn't depend on how many connections a port allows |
| In the library asset, anything whose order matters is a list (variants, parameters) (2026-11-13) | JavaScript reorders object keys that look like numbers |
| Joint types have two named *sides*, not roles; parts and layers keep *role* for their job; a wall's derived properties are `exterior`, `load_bearing`, `braced` (2026-11-13) | One word, one meaning per context; the side names are what a fastening schedule refers to |
| Interface checks run in the builder per variant pair; failing and impossible pairs are listed with their reason; the engine knows no checks (2026-11-13) | They depend only on the variant pair; the engine stays generic and can still say why two ports can't meet |
| The model stays on right angles (facings in multiples of 90 degrees); true north is a site value applied on export (2026-11-13) | Exact world boxes and whole-number transforms; a site's orientation doesn't belong in the building model |
| Walls are placed by their framing: wall ports sit on the framing's outer face, the wall corner's offset is the framing depth; the wall's own datum stays on the exterior face (2026-11-17; changes the 2026-11-11 row on the wall datum) | The framing is flush at the corners and with the floor; the OSB isn't on when the floor is built and isn't flush with the plate or sill. Converting between systems keeps framing lines and moves exterior faces by the sheathing difference |
| The California corner (a turned stud in the through wall) is the default corner; a strip of OSB fitted on site covers the corner, to revisit (2026-11-17) | Gives both linings nailing and leaves the corner open for insulation after erection; every panel stays identical |
| The floor stands on a sill all round, with single end joists and blocking under the gable walls' studs; walls along the joists butt (2026-11-17) | The book's floor; blocking for bearing and the same attachment pattern under gable and long walls; with butting gable walls their studs are known when the floor is compiled |
| The upper top plate is fitted on site and laps corners and panel joints (2026-11-17, not implemented) | Ties the panels together |
| The header sits on the jacks and is the top of the opening, with cripples above it (no *losholt*); no edge cripples; a sheet keeps the opening cut out of it (2026-11-17; to check with Byggforsk) | US practice; little deflection over a 1 m span, taken by the unit's clearance; the books for the cripples and sheets (W5, W11) |
| Catalog modules (baked, placed by the user) and derived modules (compiled at design time from their children and options) (2026-11-19) | Modules made of modules hold what spans panels (the upper top plate) and what follows the walls (the floor); derived modules recompile interactively in the browser |
| The floor is derived from the walls by the storey (outline, sill, blocking under the real members); the placed floor, `wall_on_floor` and the sliding ports are removed (2026-11-19) | No more guessed wall parameters or panel assumptions; less code to port; positions along a wall can come from the storey later |
| The hut's door is an exterior 10x20 (frame 988 x 1980, rough opening 1010 x 2000) and the window's head is level with it at 2000, sill 790 (2026-11-17) | Chosen when a *losholt* and gap under a header at the plate limited the opening to 2098; kept with the header on the opening |

## 9. Open questions

- Repair or rebuild?
- Can the new hut go beside the old one, so the old one serves as storage?
- Roof geometry in a static tool (T12)?
- Wall corner detail (T8, T14): the prototype's `backer` corner is a
  placeholder, and wrong (review C1 to C3, 2026-11-17: flush framing at the
  outer corner; two inner-corner variants from the book, an extra stud or a
  turned stud; the turned stud, the California corner, is the default). Decide together with the interior build-up and the fastening
  schedule:
  - Does the interior lining get its corner nailing from the service cavity
    battens or from the framing?
  - What does the butt wall's end stud fasten into: a backer, the through
    wall's end stud, or both?
  - How do the vapour barrier and wind barrier turn the corner, and does
    anything need to clamp them?
  - Can the corner be insulated after both walls stand? (With the current
    backer, the pocket behind it must be insulated before the butt wall goes
    in, which becomes a build-order rule.)

  Investigate Byggforsk's detail sheets for timber-frame corners, what the US
  code (IRC) and common US practice say (three-stud, turned-stud and two-stud
  corners), and what OSE's plans and build logs (Seed Eco-Home) do.
- Who at OSE to talk to first, and when?

## 10. References

- Fork source: <https://github.com/OpenSourceEcology/iconic-cad>
- Upstream original: <https://gitlab.com/collindesantis/iconic-cad>
- OSE wiki: <https://wiki.opensourceecology.org/wiki/Iconic_CAD_Protocol>
- Wall module schema (wiki): <https://wiki.opensourceecology.org/wiki/Wall_Module_Schema>
- Declarative dragging (UIST 2026): <https://declarative-dragging.github.io/>
- In-repo: `README.md`, `docs/design_decisions.md`, `docs/layout_schema.md`,
  `docs/adding_modules.md`
