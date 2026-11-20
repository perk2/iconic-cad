# Design note: ic_lib_wall, first library prototype (walls)

Status: implemented in the prototype and reviewed, 2026-11-15 (drafted 2026-11-12; revised 2026-11-13 after review). The review is section 10. Section 11 corrects the corner (2026-11-17, implemented). Topics: T3 (interfaces), T6 (parts), T7 (implementations),
T16 (topology), T17 (library layout), plus the toolchain vocabulary in
[PLAN.md](../PLAN.md). Work happens on the `hut` branch; a clean upstream
branch is extracted later.

## 1. Problem

The plan has settled a new architecture on paper:

- parametric modules with fixed variants per system;
- interfaces with roles, ports that fill roles, implementations that build them;
- layouts that store topology only, and positions derived from it;
- library time and design time in JavaScript, a model between the engine
  and every consumer.

None of it has been tried. The prototype checks that these pieces fit together
end to end on the smallest real case, the hut's wall loop, before anything is
built on top of them or proposed upstream.

## 2. Current state

- **Library source:** one folder per fixed-size module in `library/modules/<id>/`
  (`schema.py`, `compiler.py`, `meta.yaml`, `expect.yaml`); sizes in the ids
  (`wall_4x8_2x6_16oc`); every `compiler.py` is the same three lines calling
  `seh_lib`.
- **Compiler:** `enumerateMembers()` in `web/js/members.js`, the compiler of two
  modules behind one `if` (`mod.aperture`). At library time `build_lib.py` runs
  it through `scripts/export_members.mjs` to bake `web/assets/lib/members.json`,
  which `seh_lib/wall_builder.py` reads to make solids. At design time six
  consumers call it again per entity (`render3d.js`, `bom.js`, `render_fab.js`,
  `render_summary.js`, `fcstd.js`, `designs.js`), because there is no model.
- **Ports:** four untyped bounding-box corners per module
  (`getPortPositions()` in `web/js/geometry.js`); what may connect is decided by
  `if` branches in `web/js/snap.js` and `web/js/ui.js`.
- **Layout:** absolute `x_mm`, `y_mm` per entity (`docs/layout_schema.md`);
  corner connections are not stored, only interior T-junctions
  (`connections: [{target_id, blocking, contact_x_mm, contact_y_mm}]`).
- **Systems:** `web/data/systems/{seh,vcs12}.json`, of which only wall depth and
  module grid are read.
- **Units:** imperial assumptions in `web/js/constants.js`.
- **Tests:** `node tests/run_js.mjs` discovers every `tests/*.mjs`; pytest files
  are listed by name in `.github/workflows/ci.yml`.

## 3. Proposal (as decided in PLAN.md)

- **Phases.** Library time (Node): the library builder validates the library
  source, resolves variants, runs compilers and implementations, and bakes everything
  into one library asset. Design time (JavaScript): the editor produces a
  layout; the engine turns layout + library asset into a model; consumers read
  the model.
- **Modules** are parametric and system-independent; **variants** are fixed
  parameter sets per module and system, with a status; no per-entity
  overrides.
- **Interfaces** are system-independent agreements between two roles, with a
  placement rule, directed relations (*bears on*, *fastens to*) and named
  checks. **Ports** on modules declare which roles they can fill.
  **Implementations** build an interface (parts and joints, never placement); a system file per
  interface says which implementations that system allows.
- **Layouts** store entities (module + variant), connections and one anchor; no
  coordinates. The engine walks connections from the anchor to place entities;
  extra connections are loop-closure checks.
- **Module compilers do not depend on connections**: a variant always produces
  the same panel. Implementation parts are owned by the connection, with a host panel
  and a stage (site by default, or workshop).
- **Design time never calls compilers.** The engine assembles baked output into
  the model, even when there are issues.

## 4. What the prototype builds

Walls only, one system, two interfaces, one implementation each.

### 4.1 Library source

Location: `library/` itself, beside the v1 entries (one library, two formats
during migration; v1 entries are replaced in place as they migrate). New-format
folders are recognised by `schema.yaml`, v1 entries by `meta.yaml` and
`schema.py`; new-format folders are out of scope for the legacy tools and
tests. vcs-library's `libtools.registry.discover()` scans
`library/{parts,modules,assemblies,structures}/` and raises on any folder
without the four legacy files, so `scripts/legacy_registry.py` provides a
discover that skips `schema.yaml` folders and a wrapper that installs it before
running libtools (`python scripts/legacy_registry.py validate-code --root .
--all`). `build_lib.py`, both CI workflows, `scripts/entry_instances.py`,
`scripts/gen_library_entries.py` (whose clean mode used to delete the whole
folder) and `tests/test_members_boxes.py` go through it. The v1 entries and the
app are otherwise untouched.

Format: authored library source is **YAML**, so contributors can comment the
reasoning; everything machine-written or browser-read (library asset, layout,
model) is **JSON**. YAML rules: quote anything that could be misread (`"48x148"`,
variant names like `"1200"`, and never a bare `no`: YAML 1.1 reads it as false);
the library builder's validation rejects values of the wrong type, which
catches these. Reasoning goes in YAML comments; no separate rationale files
in the prototype. JSON Schemas per file type can validate YAML too (editors with a
YAML language server give autocomplete), but they are not part of this
prototype.

```
library/
  joint_types.yaml
  systems/seh_no/system.yaml
  modules/wall_panel/
    schema.yaml
    compile.js
    systems/seh_no.yaml
  interfaces/wall_inline/
    interface.yaml
    implementations/plain.js
    systems/seh_no.yaml
  interfaces/wall_corner/
    interface.yaml
    implementations/backer.js
    systems/seh_no.yaml
```

**System** (`system.yaml`): id `seh_no` (a subset of the Seed Eco-Home
modules, adapted to Norway), title and description, status `draft`, units
(mm), grid 600. A header comment marks the values as placeholders from common
Norwegian practice, not yet checked against Byggforsk or TEK17.

Catalog: the stock items the system builds from, referred to by id from
variants (`stud: "48x148"`), build-up layers (`sheet: osb_12`) and, through
the resolved parameters, compilers and implementations. Lumber entries have a
section and a strength class (`grade: C24`, unused until the code profile);
sheet entries have material, thickness and size. The prototype has lumber
`48x98` and `48x148` and one sheet, `osb_12` (1200 × 2400); a 2700 sheet waits
for walls taller than 2400. Stock lengths and prices are not included.

Build-up `exterior`: ordered layers in three groups, `face_a` (outward from the
framing), `cavity` (between the studs, taking the stud depth) and `face_b`
(inward), each layer with role, a catalog sheet or plain material text,
thickness and stage. For open panels only the bracing sheet is `workshop`; the prototype bakes only
workshop layers into the panel and lists site layers without parts. A fastening
schedule stub maps each joint type the compilers and implementations emit to a
placeholder pattern; fasteners themselves are out of scope. (Superseded by
[ic_joints.md](ic_joints.md): fastener catalog, schedule entries, layer
fastening, and joint ids, stages and fastener counts.)

**Joint types** (`library/joint_types.yaml`, system-independent): a short list,
each with a description and its two **sides**. A joint type names what is
joined and why, never how; the system's schedule says how, and refers to the
sides ("through `stud` into `backing`"). Side names are chosen per joint type
and never reuse interface role names. Directed joints have distinct sides
(`plate`/`stud`, or `plug`/`socket` for an electrical joint); symmetric joints
have `a`/`b`. A joint joins exactly two parts; a joint of three or more members
is modelled as a connector part with a two-sided joint to each member. For
this prototype:

| Joint type | Sides |
|---|---|
| `stud_to_plate` | `plate`, `stud` |
| `top_plates` | `upper`, `lower` |
| `sheathing_to_framing` | `sheet`, `framing` |
| `panel_seam` | `a`, `b` (end studs of two panels in a run) |
| `corner_studs` | `stud` (the butt wall's end stud), `backing` (the through wall's end stud or a backer) |
| `backer_to_plate` | `plate`, `backer` |

**Module schema** (`modules/wall_panel/schema.yaml`): parameters with types and
ranges (`width`, `height`: length; `spacing`: length; `stud`: lumber;
`buildup`: buildup) and ports:

| Port | Kind | Roles it can fill |
|---|---|---|
| `left` | fixed | `wall_inline.b`, `wall_corner.through`, `wall_corner.butt` |
| `right` | fixed | `wall_inline.a`, `wall_corner.through`, `wall_corner.butt` |
| `bottom` | fixed | (declared, unused until the floor) |

The schema declares each port's kind and the roles it can fill; the compiler
computes its frame from the parameters and maps the names it exposes to its
parts (`end_stud`, `bottom_plate`, `top_plate` for the end ports, where
`top_plate` is the lower top plate, the one the studs and a backer bear on;
`bottom_plate` for `bottom`). The port name is the link between the two and is
checked. Which names a port must expose is not in the module schema: each
interface role lists the parts it needs (`exposes`), since implementations are
written against the interface, not against one module. A port that can fill a
role must expose at least those names, and an implementation sees and may
refer to only those. Parameter names carry no unit suffix: the type (`length`)
and the system's units say what they are.

**Coordinates.** `x`, `y`, `z` are used only for module and world coordinates,
with `z` up in both (as in IFC, FreeCAD and the existing 3D views). A module
that isn't upright, such as a pitched roof panel, is described lying flat, and
its connection's transform tilts it.

**Port frames.** A port is a face (or an edge or a point) of the module. Its
frame is an origin and three axes, all stored, written in module coordinates:

- `normal`: out of the module through the port;
- `along`: the axis the two connected ports share; every placement rule keeps
  it (`M.along = R.along`);
- `across`: the remaining axis in the port's face.

For line joints `along` is the line where the two modules meet; for joints over
an area or at a point there is no shared line, and the port's description says
what `along` is. Each port's description also says where its origin sits; for
line joints it is the start of the shared line on the datum face. For now port
axes must be plus or minus module axes, so checks are exact and the stored
transforms stay whole numbers; this is relaxed when a pitched port appears.

| Port | origin | normal | along | across |
|---|---|---|---|---|
| `left` | (0, 0, 0) | −x | +z (up) | +y (into the depth) |
| `right` | (width, 0, 0) | +x | +z (up) | +y (into the depth) |
| `bottom` | (0, 0, 0) | −z | +x (the run) | +y (into the depth) |

`across` points into the depth at both ends, so the left frame is the mirror
image of the right one. The builder derives each port's **hand** (`right` when
`normal`, `across`, `along` form a right-handed frame, else `left`) and exports
it; nobody authors it. Frames are not required to be right-handed: that would
make `across` flip at left ends and every rule need a variant per hand. Later
ports, for reference: a T-junction's sliding port on the inside face has
`normal` out of that face, `along` up and `across` along the run (the slide);
a wall top has `normal` up, `along` the run; a floor panel edge has `along` the
edge and `across` the thickness.

A port's **kind** says how a connection is positioned on it, and so what the
connection must store. This prototype first used only `fixed` (one position; the
connection stores nothing extra); `sliding` came with the floor. A sliding port
names the axis it slides along, never a free vector (`slide: {axis: across,
length: ..., step: ...}`; a face that slides two ways lists two entries), and
the connection stores a position measured from the port origin along that
axis. The list is meant to grow (e.g. a port that allows an angle); the
builder and the engine reject a kind they don't know, and a new kind is a code
change. Whether a port accepts several connections is a separate property,
not a kind. (`sliding`, `many` and `optional` were added with the floor, see
[ic_lib_floor.md](ic_lib_floor.md); the slide is `{axis, length, step}` in
the compiled port, and the connection stores `at`.)

Wall datum: exterior face (A), bottom-left seen from outside; x along the run,
y into the wall, z up. The exterior face is the outer face of the workshop
panel, here the bracing sheet. The wall's depth (used by placement, e.g.
`through.depth`) is the workshop panel's: framing plus workshop layers, 12 +
148 = 160 in `seh_no`. Site layers are listed but take no part in placement;
the panels are joined before they exist.

**Variants** (`modules/wall_panel/systems/seh_no.yaml`):

```yaml
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
    status: draft
```

**Interfaces.**

- `wall_inline`: roles `a` (the run's earlier panel, its right end) and `b`
  (the next panel, its left end), each exposing `end_stud`; placement `flush`
  with reference `a`; checks `same_height`, `same_depth`.
- `wall_corner`: roles `through` (exposing `end_stud`, `bottom_plate`,
  `top_plate`) and `butt` (exposing `end_stud`); relation `butt fastens_to
  through`; placement `corner` with reference `through` and offset
  `through.depth`; check `same_height`. Both end ports can fill either role;
  the connection says which wall runs through.

**Placement rules.** A placement rule says where one port is relative to the
other. It is data in `interface.yaml`:

```yaml
placement:
  rule: corner
  reference: through
  offset: through.depth
```

`reference` names the role whose port frame the rule is written in. The same
frame is the **connection frame**: implementations give their parts and joints
in it, and the engine moves them from it to the world. Without it, baked
coordinates would have no defined origin, and the engine would need
interface-specific knowledge of which role is special.

With R the reference port's frame and M the other port's frame, each rule kind
is a fixed turn plus an offset written in R's axes:

| Rule | M.origin | M.normal | M.across | M.along | Hands |
|---|---|---|---|---|---|
| `flush` | R.origin | −R.normal | R.across | R.along | opposite |
| `corner` | R.origin + offset · R.across | −R.across | −R.normal | R.along | opposite |

- `flush`: the ends meet at one point and face each other, exteriors on the
  same side, both upright.
- `corner`: from the through wall's end on its exterior face, move `offset`
  (the through wall's depth) into the wall, to its inside face, where the butt
  wall's end lands. The butt wall's end faces back toward the through wall,
  and its depth runs back along the through wall, so its exterior face is
  flush with the through wall's end.

Check, the hut's south-east corner: the south wall's right end has R.origin =
(3600, 0, 0), R.normal = +x, R.across = +y; the rule gives M.origin =
(3600, 160, 0), M.normal = −y (the east wall's end faces south), M.across = −x
(its exterior face at x = 3600).

Each rule kind declares the **hands** it accepts: `opposite` or `same`. Both
rules here turn a frame into its mirror image, so a right end can only meet a
left end; two right ends would need a mirrored wall. The builder uses the
declaration to decide which port pairs are possible. (A T-junction must accept
either end of a partition against the same face; how a rule expresses that is
settled with T-junctions.) A new rule kind is a new row, implemented in the
builder and tested there.

**Interface checks** (`same_height`, `same_depth`) depend only on the variant
pair, so the builder applies them at library time, together with the hands. A
pair that fails is not baked; the library asset lists it under `excluded`
with the reason (`hands`, `same_height`, ...) and a message, so the engine can
say why two ports can't meet without knowing any check itself.

At library time the builder applies each rule once per possible port pair and
variant pair and stores the result as a **transform**: where the M port sits
and how it faces, relative to the R port. Impossible pairs get no transform.
At design time the engine applies no rules; it composes transforms (section
4.3). Rules read named participant sizes (`through.depth`); a general
expression language waits until a case needs it.

**Implementations.**

- `wall_inline/plain.js`: no extra parts; one `panel_seam` joint between the
  two end studs.
- `wall_corner/backer.js`: one extra stud (`backer`) in the through wall's
  framing, flush with where the butt wall's inside face lands, host `through`;
  `corner_studs` joints from the butt wall's end stud to the through wall's end
  stud and to the backer; `backer_to_plate` joints to the through wall's bottom
  plate and lower top plate. The geometry is a placeholder.

The builder bakes each implementation for every possible port pair and variant
pair. Before calling it, the builder places the participants with the stored
transform, so the implementation receives every participant's exposed parts
already in the connection frame and never repeats the placement rule.
Returning nothing marks a pair the implementation can't build; with exactly
one implementation per interface that is an error. The engine
never mirrors; a mirrored corner comes from the mirrored port frame.

Joints refer to parts as `{of, part}`: `of` is a role (with an exposed name)
or `implementation` (with the implementation's own part id); joint keys are
the joint type's sides. The builder resolves exposed names to part ids when
baking.

Each interface's `systems/seh_no.yaml` lists the implementations, the stage of
implementation parts (`site` in `seh_no`, open panels) and a status. In the
prototype the list has exactly one entry and there is no `default` field; the
builder requires that entry to cover every possible port pair and variant pair,
so every connection the editor can make has a way to be built. Connections
don't choose an implementation. Future improvement: the list becomes an order
of preference (the first that covers a pair is used), and a connection may pin
one for a reason of its own (a non-combustible corner behind a stove).

### 4.2 Library builder

`scripts/build_library.mjs`, the command line for the builder in
`web/js/library/builder.js` (file access passed in, so the builder does no
I/O itself). No FreeCAD in the prototype (parts are boxes; solids come
later). Passes:

| Pass | Input | Output |
|---|---|---|
| load | library source under `library/` | library model (YAML mappings as `Map`s, so key order and key types are kept) |
| validate | library model | list of errors; stop if any |
| resolve | library model | resolved variants: module, system, variant, full parameter dict with catalog references replaced by values |
| compile | one resolved variant's parameters | compiled variant: parts (id, role, material, catalog id, box in module mm, stage, and layer for a part made from a build-up layer), port frames with hand, exposed parts per port, internal joints, size |
| compile implementations | interface + the compiled variants that can fill its roles | per possible port pair and variant pair: the transform from the reference port to the other port, and the baked implementation (parts and joints in the connection frame) |
| export | everything above | `web/assets/library.json` |

Validation rules: every module has at least one system file with at least one
variant; every variant passes the schema's types and ranges; every catalog
reference resolves; every port names an existing interface and role; every
implementation named in a system file exists; every role of an interface used by a
port has an implementations file in the system, whose single implementation
covers every possible port pair and variant pair; every joint a compiler or
implementation emits has a type from `joint_types.yaml`; every emitted joint
type has a schedule entry in the system (now: every joint finds a schedule
entry, see [ic_joints.md](ic_joints.md)).

Step 3 implements load, validate and resolve. Validation also checks each
file's keys and value types (an unquoted `no` or `1200` is reported with a
hint to quote it), build-up layers (a sheet layer takes its thickness from
the catalog, a cavity layer has none), placement rules (known kind, offset
names a role and a compiled size: `width`, `height` or `depth`), relations and
checks. All problems are collected before the build stops, each with its file.
Step 4 adds compile, compile implementations and export. A listed
implementation without its `.js` file is an error. The builder imports each
`compile.js` and implementation by path and checks what it returns: keys,
unique part ids, boxes (min below max), stages, port frames, exposed names
naming real parts and covering what each role the port can fill needs, joint types from
`joint_types.yaml` with exactly their sides and a fastening entry in the
system, and joint references that resolve. An exception in library code is
reported as an error on that file and variant. Each pass stops the build if it
reports errors; nothing is written then.

After the review (2026-11-13) the builder also checks: duplicate YAML keys;
build-up stage order (workshop layers form a run starting next to the
framing; none in the cavity yet); positive, finite lengths; port frames (unit,
perpendicular axes plus or minus module axes, `normal` out of and `across`
into the panel, origin on the panel's faces); parts inside the panel; that
each placement rule keeps `along`; and that the single listed implementation
covers every possible port pair and variant pair.

`node scripts/build_library.mjs` writes the asset; `--verify` only compares
it with a fresh build (`tests/library_builder.mjs` does the same).

The compiler signature is `compile(params, core) -> object`; the
implementation signature is `build(participants, core) -> object | null`,
where participants map each role to the module, variant and port that fill
it, the compiled size and the exposed parts in the connection frame, and
`core` is the library core (`web/js/library/`), so library code imports
nothing. Neither sees file paths or the system.
A narrow argument (for example the fastening schedule) is added when an
implementation needs one.

**Library asset** (`web/assets/library.json`, generated, committed, never
hand-edited): joint types; systems as authored; modules with title,
parameters, ports and, per system, the default variant and each variant's
status, resolved parameters and compiled variant; interfaces with roles, relations, placement rule (for display) and
checks and, per system, the implementations file plus one entry per possible
port pair and variant pair (participants as module, variant and port per role,
the transform, the implementation's parts and joints). Where order matters it
is a list: variants and parameters are lists of objects with a `name`, in the
authored order, because JavaScript reorders object keys that look like numbers
(`"600"` before `"1200"`). Everything else is a mapping with sorted keys, so
diffs stay small.

### 4.3 Engine

Generic JavaScript in `web/js/engine/` (no wall-specific code), plus a command
line `scripts/compile_design.mjs layout.json > layout.model.json` (exit status
1 if the model has errors, 2 for unusable input). Not wired into the editor in
this prototype.

`compileDesign(layout, libraryAsset) -> model`. Passes:

| Pass | Does |
|---|---|
| load | look up each entity's module and variant; unknown names become issues |
| check | ids are unique and contain no `.`, `/` or spaces; each role is written `entity.port`; ports exist, have a kind the engine knows (`fixed`) and can fill the given roles; the two roles are on different entities; the port pair and variant pair has an entry (otherwise the reason recorded under `excluded`); no port is used twice |
| place | walk connections from the anchor; place each newly reached entity by composing the known entity's world transform with the stored transform (or its inverse, when the walk reaches the reference role second) |
| close loops | for connections between already placed entities, compose the transforms and measure the gap; above 1 mm, an issue |
| assemble | baked parts to world coordinates; implementation parts via the connection frame; joints resolved to concrete part ids |
| derive | free end ports (issue), outline, counts per stage |

**Layout** (input): `system`, `git` (the git hash it was saved with), `anchor`
(entity, position, facing in degrees about z, a multiple of 90), `entities` (id, module, variant), `connections`
(id, interface, and one `entity.port` per role). Ids are required and unique
across entities and connections; the editor generates them, fixtures use
readable ones (`c_se` for the south-east corner):

```json
{"id": "c_se", "interface": "wall_corner", "through": "S3.right", "butt": "E1.left"}
```

**Model** (output): `git` (the git hash it was produced with), `layout_git`
(the layout's) and system;
entities (id, module, variant, transform); parts (id, owner, host, stage,
role, catalog id, material, local and world box); connections with the
implementation used; joints (since [ic_joints.md](ic_joints.md) also with id,
owner, stage and fasteners); issues; summary (outline, counts). Part ids are
`<entity>/<part>` for module parts (`S3/stud_left`) and `<connection>/<part>`
for implementation parts (`c_se/backer`); joints refer to parts by these ids
(`{"type": "corner_studs", "parts": {"stud": "E1/stud_left", "backing":
"c_se/backer"}}`).

The library asset carries no version stamp. Whatever saves a layout or
produces a model records the git hash it ran with: the command line reads it
with `git rev-parse HEAD` (marked as modified when the working tree has
uncommitted changes); the editor, once wired in, gets it from the publish step.

**Issues.** The engine never refuses a layout: whatever it gets, it returns a
model with as much as it could work out, plus issues saying what is wrong and
where. A layout is invalid most of the time while it is being edited (an
unclosed loop, free ends), and consumers decide what they accept: a plan shows
everything, an export can refuse errors (as `web/js/export_gate.js` already
does for an unenclosed shell). Each issue has a rule, a message, a severity
and the `entities` and `connections` involved (lists, possibly empty).
Rejected connections stay in the model with `implementation: null`, so a plan
can still show them. Severity: *error* (the model is wrong or
incomplete), *warning* (allowed but suspicious or unfinished, such as free ends
while drafting), *info*. Each pass degrades instead of stopping:

| Pass | Problem | Instead of stopping |
|---|---|---|
| load | unknown module or variant | keep the entity without parts; error |
| load | an entity or connection that isn't an object; connections not a list | skip it; error |
| check | duplicate, missing or malformed id or port reference; unknown port kind; a port can't fill the role; an excluded pair (two right ends at a corner, different heights); a port used twice | keep the connection in the model without an implementation, skip it for placement; error |
| check | a connection field that isn't a role | ignore it; warning |
| place | anchor missing, position not three numbers, or facing not a multiple of 90 | place nothing; error |
| place | entities not reachable from the anchor | leave them unplaced; error |
| close loops | gap above 1 mm | keep positions from the walk; error with the gap and where |
| check | (since the floor) a sliding port's `at` missing, out of the pair's range or off the step | keep the connection without an implementation; error `position` |
| check | (since the floor) `at` on a connection with no sliding port | ignore it; warning |
| derive | free end ports (not `optional` ones) | report them; warning |

The engine fails outright only on input that is not a layout at all (invalid
JSON, missing `entities`).

**Right angles.** Placement stays on right angles: anchor facings are
multiples of 90 degrees, so every transform is whole numbers and part world
boxes are exact. True north is a site value, applied when exporting (for
example a site plan), not in the model.

**Derived wall properties** (`exterior`, `load_bearing`, `braced`; PLAN.md
T14) are not in the prototype: variants don't state them yet and the engine
doesn't derive them.

### 4.4 Tests and fixtures

- `tests/library_builder.mjs` (picked up by `run_js.mjs`): the library source
  validates; deliberately broken copies fail with the expected messages; the
  committed library asset matches a fresh build.
- `tests/engine.mjs` (picked up by `run_js.mjs`), with the hut layout in
  `tests/fixtures/engine/hut.json`; the broken layouts are small changes to it
  made in the test. A second library asset,
  `tests/fixtures/engine/library_variants.json` (wall variants `1200`, `600`
  and `1200_tall`), is built from a copy of the library by
  `tests/library_builder.mjs`, which also checks that it is up to date; it
  covers mixed-width walls and pairs excluded by `same_height`:
  - **hut**: 3 × 2 panels of `wall_panel/1200`; S and N runs of three panels run
    through at both ends; E and W runs of two panels butt. Expect: no issues;
    the loop closes (gap 0); outline 3600 × (2400 + 2 × 160) = 3600 × 2720; four
    `backer` parts, each hosted in an S or N panel, stage `site`; workshop
    part counts equal ten identical panels.
  - **broken layouts**, each still producing a model with the expected
    issue: a missing corner (free ends), an E run of three panels (loop
    doesn't close by 1200 mm), through and through at one corner (roles), two
    right ends at a corner (no transform), an unknown variant, a wall not
    connected to anything (unplaced), a missing and a duplicate connection id.
- Existing tests stay green: `node tests/run_js.mjs` and the pytest list in
  ci.yml (upstream's).

## 5. Steps

1. This note.
2. Make the v1 tools skip new-format folders (tests stay green). Library
   source for `seh_no`, `wall_panel`, `wall_inline`, `wall_corner`.
3. Library builder: load, validate, resolve; tests for validation.
4. Wall compiler and the two implementations; export the library asset; freshness test.
5. Apply the review decisions (2026-11-13) to the library source, builder and
   tests: reference roles, port frames with `normal`/`along`/`across` and hand,
   rule hands, stored transforms, participants in the connection frame, joint
   sides, one implementation per list, ordered lists in the asset.
6. Engine: load, check, place, close loops; hut and broken fixtures.
7. Engine: assemble, derive; model assertions; the command line.
8. Review against this note; update PLAN.md (T3, T6, T7, T16, T17) with what
   held up and what didn't. Done 2026-11-15, section 10; T8 was updated too.

Later steps, not in this prototype: `wall_panel_with_opening` (window 10×12, door
10×21), an SEH system to test the convertibility check, T-junctions with
sliding ports, a read-only 2D plan page, solids via FreeCAD, wiring into the
editor.

## 6. Out of scope

Editor integration and palette; BREP/FreeCAD solids; floor, roof, T-junctions;
the build book; migrating v1 modules; revisions beyond the git hash; the code
profile.

## 7. Options considered

- **Library under `web/library/`** so the browser can import implementation code:
  rejected; the web app must stay decoupled from the library and read only
  build output.
- **A separate root folder** (`library_v2/`, `ic_lib/`): rejected; a temporary
  name spreads to the asset, the builder and the tests, and moves later anyway.
- **Moving the v1 library aside** (`library/legacy/`): rejected; about 20 files
  reference the path, which means churn and merge conflicts with upstream.
- **JSON library source**, with `description`/`note` fields carried into the
  library asset and JSON Schemas for editor autocomplete: the alternative to
  YAML; this prototype tries YAML first.
- **Compilers and implementations run live at design time**: rejected for
  catalog modules; fixed variants make all their output finite, so baking it
  loses nothing, and design time stays generic. (Derived modules, which
  depend on the layout, are compiled at design time:
  [ic_derived.md](ic_derived.md).)
- **Library code in Python**: rejected; JavaScript serves library time
  (Node) and design time (the browser) in one language, and runs this kind
  of code far faster in the browser ([ic_derived.md](ic_derived.md),
  section 8).
- **A separate manifest for the app to discover files**: unnecessary; the
  library builder writes one library asset at a known path.
- **Prototype on a branch from `main`**: deferred; work stays on `hut` and a
  clean branch is extracted later.

## 8. Consequences

- Moves upstream's single enumerator out of the app into the library for
  new-format modules; it remains one source (decision 6). The v1 path is
  untouched.
- Placement rules live once, in the builder, next to the implementations
  that depend on them; the engine only composes stored transforms and is the
  same for every interface. A later consumer (FreeCAD export of a whole
  design) reads the model instead of placing walls itself.
- A new placement rule or interface check is a builder change; ordinary new
  interfaces are data plus implementations. A new port kind (sliding,
  angled) is a builder and engine change; sliding adds one parameter (position
  along a named axis) to a stored transform.
- Design time can only connect what was baked; this matches "design time never
  calls compilers".
- The library asset grows with variant pairs per interface; fine for the hut,
  revisit (key by the parameters an implementation reads) if a catalog grows
  large.

## 9. Open questions

- Sliding-port implementations (T-junctions): bake per grid position, or key by what
  the implementation reads; confirm in a later prototype.
- Parts that span several panels (a lapping upper top plate) belong to no
  single connection; does the model need parts owned by a run?
- An inside corner (an L-shaped building) is a right end meeting a left end
  with the butt wall on the through wall's exterior face: a second interface,
  or a parameter on `wall_corner`?

## 10. Review (2026-11-15)

Steps 1–7 are built, and [ic_joints.md](ic_joints.md) on top of them. Sizes:
the library builder, the engine (`compile_design.js` and `affine.js`), the
wall compiler and the two implementations, with their tests. The hut
builds without issues: 10 panels, 6 seams, 4 corners, 152 joints, the loop
closes with a gap of 0 and the outline is 3600 × 2720.

### 10.1 What held up

- **Phases.** Everything is baked at library time; the engine has
  no wall- or interface-specific code and only composes transforms. Adding
  joint ids, stages and fastener counts changed the engine by copying three
  fields and summing them.
- **Interface, role, port.** No compatibility table was needed. Excluded pairs
  carry their reason, so the engine says "a right end and a right end can't
  meet in rule 'corner'" without knowing any rule.
- **Port frames.** Stored axes with a derived hand work. Both corner hands
  are baked from one implementation, and the engine never mirrors.
- **Connection frame.** With participants placed before the implementation is
  called, `backer.js` is about 30 lines of geometry and contains no placement
  maths.
- **Exposes per role.** Implementations refer only to names their role
  declares, and the builder checks it.
- **Layouts.** Topology only, a walk from the anchor and loop-closure checks.
  The engine returns a model with issues instead of refusing, and each broken
  fixture gives the expected issue.
- **YAML source.** Type validation catches unquoted values (`no`, `1200`), and
  all problems are reported with their file before the build stops. YAML
  comments carried the reasoning; no rationale files were needed yet.
- **Location.** The new format sits in `library/` beside the v1 entries; the
  legacy tools skip it through `scripts/legacy_registry.py`, and the existing
  tests stay green. The app reads only the library asset and is untouched.
- **Right angles.** Whole-number transforms and exact world boxes; true north
  is left to export.

### 10.2 What changed or was learned

- **Status values.** The builder accepts `draft`, `active` and `deprecated`
  for systems, variants and interface system files. PLAN.md T17 lists
  Planned → Draft → Compiled → Validated → Reviewed, as on the wiki. Not
  decided yet; nothing reads status at design time.
- **Stage of exposed parts.** Exposed parts carry no stage, so the builder
  reads a participant part's stage from its compiled variant (needed for
  joint stages, J2 in ic_joints.md).
- **Parts from layers.** A part made from a build-up layer needed a `layer`
  field, so the builder can find the layer's fastening without relying on
  role names.
- **The touch rule lives in two places.** The wall compiler decides which
  sheet joints to emit by testing contact, and the builder checks contact
  again. They must agree (both use 1 mm now). Compilers can't import the
  builder, so a second compiler would repeat the rule; a small helper module
  for compilers may be needed.
- **Parts are boxes.** Axis-aligned boxes with a catalog id, and no section
  or rotation field. Enough for walls. The roof needs either rotated parts
  or modules described lying flat and tilted by their connection (section
  4.1, Coordinates).
- **Asset size.** 25 KB for one wall variant. The fixture with three variants
  is 82 KB, with 10 corner pairs and 26 excluded corner pairs. Growth is in
  variant pairs, as expected, and excluded entries outnumber baked ones.
  Fine for the hut.
- **Builder size.** One 1700-line file. Split it by pass (validate, compile,
  joints, export) before anything goes upstream.
- **Command line.** `process.exit` cut off large models written to a pipe;
  it now sets the exit code instead.
- **Ports.** `bottom` was declared and unused at the time of this review;
  `free_port` warnings skip ports that can fill no role. (Since the floor,
  `bottom` fills `wall_on_floor.wall` and is optional.)

### 10.3 Still open

- The status values (10.2).
- Parts that span panels (section 9). Each panel has its own upper top
  plate, so the top of a run is tied across seams only by the `panel_seam`
  nails. This matters for building, not only for the model.
- The corner detail: the backer geometry is a placeholder, and the butt
  wall's end stud touches the through wall's end stud on a 36 mm strip only.
- Inside corners (section 9).
- Not tried: sliding ports and T-junctions, a second system and the
  convertibility check, openings, the floor and roof, solids, the editor.

## 11. Revision: the corner (2026-11-17)

Status: implemented 2026-11-17 (11.7). From the book review
([review_vs_books.md](review_vs_books.md), C1 to C3), discussed with the
owner. Figures: `python3 hut/tools/corner.py today` and `... proposed`.

### 11.1 Problem

The corner the prototype builds is wrong in two ways:

- **Outer corner (C1).** The corner rule puts the butt wall's exterior face
  (its OSB) flush with the through wall's end, so the through wall's framing
  runs out to the butt wall's OSB face, 12 past the butt wall's framing. The
  framing outline is not a rectangle, so no floor can be flush with every
  bottom plate, and the side of the through wall's end stud is bare on the
  butt wall's face.
- **Inner corner (C2).** The backer stands behind the butt wall's end stud,
  so the through wall's lining has nothing to nail into at the inside corner,
  and with the end studs as they are the butt wall's end stud touches the
  through wall's end stud on 36 mm only (10.3).

### 11.2 Current state

- `library/interfaces/wall_corner/interface.yaml`: rule `corner`, reference
  `through`, offset `through.depth` (160: framing plus OSB).
- `library/interfaces/wall_corner/implementations/backer.js`: one backer stud
  in the through wall at the butt wall's inside face, joints `corner_studs`
  (twice) and `backer_to_plate` (twice).
- `web/js/library/walls.js`, `WallPanel.ports`: the `left`, `right` and `bottom`
  port origins are on the exterior face (y = 0), the wall datum (section 4).
- Compiled sizes are `width`, `height`, `depth` (`COMPILED_SIZES` in
  the builder).

### 11.3 Decisions

| | Decision |
|---|---|
| K1 | **Port origins on the framing's outer face.** A wall's `left`, `right` and `bottom` ports have their origin at y = the face A workshop layers' thickness (12 in `seh_no`), not y = 0. The wall's own coordinates keep the exterior face as their datum. Ports describe where framing meets framing (or a floor), and the OSB is not part of that: it isn't on when the floor is built, and it isn't flush with the plate or the sill |
| K2 | **A fourth compiled size, `framing`:** the framing depth across the module (walls: the stud depth, 148). The corner offset becomes `through.framing`. With K1 the corner rule then puts the butt wall's framing flush with the through wall's end and the butt wall's end against the through wall's inside framing face. `wall_inline` and `wall_on_floor` are `flush` and need no change |
| K3 | **The California corner is the default** (owner, 2026-11-17): implementation `california` replaces `backer`. A turned stud (the wall's stud lumber lying flat) inside the through wall's cavity, against the inside framing face, reaching from the through wall's end stud past the butt wall's inside face by one stud thickness (100 behind the butt wall's end stud plus 48: 148 long here, the stud depth). Hosted by the through wall, stage `site` |
| K4 | **Joints:** the butt wall's end stud to the through wall's end stud (`corner_studs`, 48 face, as today); the butt wall's end stud to the turned stud (`corner_studs`, 100 face); the turned stud's end to the through wall's end stud (new joint type `backer_to_stud`, nailed through the stud into the turned stud's narrow edge); the turned stud to the through wall's bottom and top plates (`backer_to_plate`) |
| K5 | **Corner OSB strip (C3, REVISIT):** a strip of the bracing sheet fitted on site on the butt wall's face, covering the through wall's end stud and the end of the through wall's sheet: 160 wide (the through wall's panel depth), the wall's height. Hosted by the through wall, nailed to its end stud (`sheathing_to_framing`) with the same nailing as the other bracing sheets: 150 along the sheet's edges, 300 in the field (owner, 2026-11-17). Tape or a wind barrier strip over the joints is a site wind barrier matter and not modelled |
| K6 | The outline changes: in the hut the framing is 3600 × 2696 and the outside of the OSB 3624 × 2720 (the through runs keep 3 × 1200 of framing) |

### 11.4 Proposal

**Library source.**

- `walls.js`, `WallPanel.ports`: origins at y = `y0`; `WallPanel.result`:
  size gains `framing`.
- `interface.yaml` for `wall_corner`: `offset: through.framing`; the comment
  explains K1 and K2.
- `implementations/california.js`, in the connection frame ([normal, along,
  across], the through wall's end port): the through wall's end stud is at
  normal −48 to 0, across 0 to 148; the butt wall's end stud at normal −148
  to 0, across 148 to 196. The turned stud: normal −196 to −48, across 100
  to 148, along from the bottom plate's top to the lower top plate's bottom.
  The strip: normal 0 to 12, across −12 to 148, along 0 to the height. Both
  computed from the exposed parts and the face A thickness, not typed
  numbers.
- `systems/seh_no.yaml` for `wall_corner`: `implementations: [california]`.
- `joint_types.yaml`: `backer_to_stud` (sides `stud`, `backer`). The strip
  takes the bracing layer's fastening (same nails, edge and field spacing):
  it carries `layer: bracing` if the builder's layer handling allows that
  for an implementation part, otherwise a schedule entry in `system.yaml`
  with the same values.
- `backer.js` is deleted (one implementation per system for now; a
  `three_stud` implementation, variant 1 from the book, can come back when
  the system file can list more than one).

**Builder.** `COMPILED_SIZES` gains `framing`, optional (a module without
it can't be referred to by `<role>.framing`; referring to it is an error
naming the module). The rest is unchanged: the builder already bakes
implementation parts per pair and checks touch, overlap and fastening.

**Engine.** No change.

**Tests and fixtures.** Builder: the corner pair's transform (framing flush),
the turned stud and strip boxes, their joints and fasteners, the 100 and 48
contact faces; `framing` missing from a module that a rule refers to. Engine:
the hut fixtures' outline (3624 × 2720 outside the OSB, min x −12 with the
anchor unchanged), backer positions replaced by the turned stud, joint
counts, no collisions. `library.json` and `library_variants.json`
regenerated. The floor fixture changes with the floor revision
([ic_lib_floor.md](ic_lib_floor.md), section 11).

### 11.5 Consequences

- **Changes a PLAN decision:** "Wall datum on the exterior face … exterior
  faces stay flush when converting between systems" (2026-11-11). The datum
  of a wall's own coordinates stays, but placement is now by framing faces.
  Converting between systems with different sheathing thicknesses keeps the
  framing lines and moves the exterior faces by the difference (millimetres);
  converting between different stud depths moves the inside faces, as
  before. The decision log gets a new row when this is implemented.
- Every panel stays identical: the corner's extra parts (turned stud, strip)
  are site parts of the connection.
- The outline numbers in the fixtures, the notes and PLAN change (K6).
- The build-order rule from PLAN §9 ("insulate the pocket before the butt
  wall goes in") goes away: the corner is open to the through wall's cavity.

### 11.6 Open questions

1. ~~The strip's fastening~~: the same nailing as the bracing sheets
   (owner, 2026-11-17); how the builder gets it is an implementation detail
   (11.4).
2. ~~Turned stud on site or in the workshop~~: on site (owner,
   2026-11-17).
5. **Lapped upper top plate** (owner, 2026-11-17): with a double top plate,
   the upper top plate laps over the corners and over the joints between
   panels, and so ties the panels together. Today every panel has its own
   upper top plate, flush with its ends (10.3). Decided (owner,
   2026-11-17): the upper plate is left off the panels and fitted on site
   after erection, in stock lengths, its joints set off from the panel
   joints. Still to design, in its own note: which wall's plate laps over
   which at a corner, how the stock-length joints are placed, and how the
   model holds a part that runs along a whole wall line (a derived run,
   T18, or parts of `wall_corner` and `wall_inline`).
3. C3 is to revisit: tape or wind barrier strip over joints and corners.
   Inside a panel a sheet edge lands on the middle of a stud; at a panel's
   end the sheet ends flush with the outside of the end stud, as the
   compiler already does (owner, 2026-11-17).
4. Inside (re-entrant) corners, still open (section 9).

### 11.7 Implementation (2026-11-17)

As proposed, with these differences and findings:

- Wall ends expose `end_sheet`, the outermost face A sheet piece at that
  end, so the strip takes its thickness, catalog and layer from it. A wall
  with no workshop sheet on face A (framing only) still compiles, but
  exposes none and can't be in a corner; the builder reports it. Kept
  simple on purpose (owner): a framing-only view is a viewer filter on the
  parts' `layer`, not a separate build. With more than one workshop layer
  on face A the corner is an error, since a strip covers one layer.
- `same_framing` excludes corner pairs whose framing depths differ, so the
  turned stud always fits.
- An implementation part may name a `layer` of its host's build-up and
  takes that layer's fastening (the strip: 150 at its edges, 16 ring nails).
  Such a part is joined only where it can be nailed, as a panel's sheets
  are: the strip touches the plates' end grain without a joint, and the
  builder's "touches with no joint" check skips parts made from a layer.
  Every implementation part must still have at least one joint.
- An offset that reads a size a variant doesn't have (`framing` on a module
  without framing) is an error naming the variant.
- **The California corner needs room:** the turned stud reaches 196 from the
  through wall's end. At c/c 600 the nearest stud is 576 from a panel's end,
  but at c/c 400 an 1800 panel has a stud centred 200 from its right end
  (176 clear), and the builder reports the overlap (a test keeps this).
- The hut: framing 3600 x 2696, outside of the OSB 3624 x 2720 (x −12 to
  3612 with the anchor unchanged); per corner six joints (5 + 5 into the
  butt wall's end stud, 8 into the turned stud's edge, 2 + 2 toenails, 16
  ring nails in the strip).

