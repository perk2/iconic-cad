# Background and reference

Explainers, findings and sources gathered while reviewing Iconic CAD
(November 2026). Background for the design topics in [PLAN.md](PLAN.md)
(T1–T19). **Decisions live in PLAN.md** (vocabulary, topics, decision log) and
in design notes in `hut/design/`, not here.

---

## 1. The vision vs the implementation

The OSE wiki ([Iconic CAD Protocol]) describes a platform for "open-sourcing
the technosphere": drag-and-drop icons backed by open schemas, AI-assisted
authoring, and open compilers producing CAD, BOMs, build instructions and
fabrication files.

The repository is much further along than the wiki suggests for walls: a working,
well-tested static web app. Exterior and interior walls, windows and doors,
T-junction blocking, live 3D preview, BOM, in-browser FreeCAD export, a Python
FreeCAD compiler and an experimental IFC export. The JS test suite passed 39/39
at commit `63c3618` (2026-11-08).

Main concerns with the wiki vision, still relevant:

- The vision far outruns the evidence; credibility comes from one building
  built end to end from compiled output.
- The hard problem is composition and validation (load paths, bracing, code
  compliance), not icons.
- AI belongs in authoring, not in the trust path. Validation should be
  deterministic and reviewable. The repo already follows this ("geometry over
  heuristics").
- Liability: output should be a design package *for* review, not a replacement
  for a qualified review or permits.

## 2. How the current code flows

Two phases. JavaScript owns the *rules*; Python/FreeCAD owns *solids*.

```
LIBRARY BUILD (offline, contributors only)
  module definitions (library/modules/*, wall_instances.yaml)
      → enumerateMembers()  [web/js/members.js]   JS: framing rules
      → web/assets/lib/members.json               positions and sizes
      → seh_lib/wall_builder.py + FreeCAD          Python: makes solids
      → web/assets/lib/*.brp                        baked solids, committed

DESIGNING (in the browser, no backend)
  user's layout (doc.entities)
      → enumerateMembers() → 3D preview + BOM       live
      → fcstd.js packs the baked .brp files → .FCStd download
```

- "Python has no knowledge" means it holds no framing rules; it renders
  members.json into solids.
- "JS can't create geometry" means the browser has no geometry kernel
  (OpenCascade), so it can't produce BREP solids or do boolean cuts. It can only
  move/rotate pre-baked solids and stretch a box template (used for blocking).
- Consequence: users can only place modules a contributor has already baked.
  A browser kernel via WebAssembly (opencascade.js) would remove that limit at
  the cost of a much heavier page.
- Not fully single-sourced: blocking is implemented twice (`createBlocking` in
  `web/js/fcstd.js`, `create_blocking` in `compile_from_json.py`), kept equal by
  parity tests; OSB sheathing differs between JS and Python (CAD-AUD-005).
- A static app can't list folders, so it finds data files through manifests at
  known addresses (`web/data/builtin_library/index.json` today).

## 3. State management: MVC vs Elm (T2)

**Classic MVC:** mutable model; views subscribe and patch themselves per event.
Each view needs handlers for every kind of change; views can drift; the screen
is the accumulated result of mutations.

**Elm Architecture / "UI = f(state)":** Model (immutable data), `view(model)`
(pure, renders everything), `update(msg, model)` (the only place state changes,
returns a new model). Named after the Elm language, whose purity forced the
pattern; it inspired Redux and others.

Why it matters here: because `view` and `update` are pure, previewing a
hypothetical state is harmless:

```js
const preview = view(update({ type: 'AddWindow', window: candidate }, model));
```

That is exactly what declarative dragging needs. In MVC you'd have to mutate,
let views patch, then undo.

**Current repo:** a mix. MVC-like: global mutable `doc` (`web/js/state.js`),
event handlers in `web/js/ui.js` that both decide and mutate (`push`/`splice`),
undo via inverse commands. Elm-like: `markModelChanged()` (`web/js/app.js`)
re-derives 3D and BOM; `enumerateMembers()` is pure. No framework, no build
step, by design.

## 4. Frontend/backend split

Elm-style is a frontend pattern; the backend sits outside the loop and is
reached through effects (commands whose results return as messages).

- Client state: ephemeral UI state. Server state: durable, shared, authoritative.
- Variants: thin client (Phoenix LiveView, htmx), thick client, local-first
  (CRDTs: Automerge, Yjs).
- The repo is deliberately fully static (design decision 1: offline, air-gapped
  build sites, no ops). Anything server-side is an explicit decision to revisit.
- If rules ever run in two places, write them once in a language both can run
  (the repo did this by making JS the single source and baking its output).

## 5. Declarative dragging (T5)

[Declarative dragging] (Horowitz, Blinn & Heer, UIST 2026 best paper; library
[Dragology], SVG/web): the author says which future model states dragging an
element can lead to; the engine renders each candidate state, finds where the
dragged element ends up, and synthesizes drop zones and animation.

Mapping to Iconic CAD:

- Ports and interfaces generate candidate next states.
- `validate` prunes illegal ones (or shows them with a reason).
- A fast pure render shows consequences during the drag (framing reshuffling,
  header appearing, BOM changing). Mainstream CAD doesn't do this.

Caveats: 2D SVG only; rendering each candidate must be cheap (never a FreeCAD
compile per candidate); discretize continuous positions (stud bays); young
library.

Existing CAD snapping for comparison: mechanical CAD mate connectors
(SolidWorks, Inventor, Onshape, Fusion, FreeCAD Assembly); BIM hosting and typed
MEP connectors (Revit); kit-of-parts tools (LEGO Stud.io). All snap geometry to
geometry; none preview semantic consequences.

## 6. Global constraints (T4)

Today what may connect is decided by `if` branches in `web/js/snap.js` and the
click handler in `web/js/ui.js`: rule cost grows with pairs of module kinds,
only programmers can add module types, and rules can't validate a loaded file
or explain a rejection. Local rules move to interfaces (PLAN.md T3); rules about
the whole design become small named pure checks:

```js
function doorSwingsClear(doc) {
  const doors = doc.entities.filter(e => e.mod.aperture?.swing);
  const issues = [];
  for (const [a, b] of pairs(doors))
    if (sectorsOverlap(swingSector(a), swingSector(b)))
      issues.push({ rule: 'door-swing', ids: [a.id, b.id],
                    message: 'These two doors would hit each other.' });
  return issues;
}
```

Others: level-2 footprint inside level 1, interior wall spacing, later load
paths, stove clearances. `validate(doc)` runs them all.

## 7. Blocking details C1, C2, T (T7)

The repo's own labels (C = continuous, T = transverse) for backing where an
interior wall meets an exterior wall:

- C1: one full-height stud added flush beside the nearest existing stud.
- C2: two full-height studs flanking the contact (a channel/U-backing).
- T: four horizontal ladder blocks between the two studs bracketing the contact.

The user picks C or T; the tool picks C1 vs C2 by proximity to an existing stud
(`getBlockingTypeC` in `web/js/snap.js`). Stored in the connection's `blocking`
field. One connection produces many joints (a corner: stud-to-stud faces, top
plate lap, sheathing edge on the corner stud); most joints are inside a module
and involve no port.

## 8. Fasteners and schedules (T8)

Parts → joints → fasteners. Four pieces:

1. Fastener catalog (length, shank, head; "16d" is ambiguous: common vs box vs
   sinker; the repo's catalog has a 16d sinker at 3¼").
2. Schedule: data in the system, with code source and edition (e.g. IRC Table
   R602.3(1)). Patterns: count per joint, spacing along a contact, edge/field
   spacing for sheathing; `when` conditions (braced wall panels); first match
   wins.
3. Joints with a joint type, from module compilers and implementations.
4. Fastener instances with positions.

```json
{ "joint": "stud_end_to_plate",  "pattern": { "count": 2, "nail": "16d_box", "drive": "end" } },
{ "joint": "top_plate_to_plate", "pattern": { "spacing_in": 24, "nail": "10d_box", "drive": "face" } },
{ "joint": "panel_to_framing", "when": { "panel_thickness_in": [0.375, 0.5] },
  "pattern": { "edge_spacing_in": 6, "field_spacing_in": 12, "nail": "6d_common" } }
```

Unlocks: derived nail counts (replacing hand-typed `nails_edge`/`nails_center`
in `web/pricing.json`), nailing plans on fab cards, inspection checklists,
validation (no rule → issue), later shear-wall capacity checks. Cautions:
editions and jurisdictions vary; engineered connections override the table;
contact detection is easy for boxes, hard for sloped members. Example values
are illustrative and US; for Norway use Norwegian sources.

## 9. Assemblies (T9)

Composite pattern: modules and assemblies share one component interface; an
assembly has children, internal connections and promoted ports (like
hierarchical schematics in electronics CAD, or `IfcElementAssembly`).

Caveats: a house isn't a pure tree (roofs span assemblies, constraints are
global); several valid groupings exist (by room, by build stage), so groupings
should be views over entities. The repo flattens assemblies on placement
(`explodeAssembly()` in `web/js/assembly_translate.js`). The same machinery
scales up: a house with ports placed in a site.

## 10. Transforms: build order and more (T10)

The design model can be transformed into other outputs, like a compiler with
many back ends.

- Build order from the directed relations on connections (*bears on*,
  *fastens to*) and from implementations; topological sort into parallel stages
  (useful for swarm builds).
- Recursive: steps inside a module, children inside an assembly, assemblies in
  the house.
- Many valid orders; choosing is scheduling (crew, tables, weather-tightness,
  staging): start with simple rules plus human adjustment.
- Build hierarchy ≠ design hierarchy (fabrication units vs functional groups).
- Temporary works (bracing, shoring) are added by rules on interfaces.
- Payoff: LEGO-style step-by-step instructions with new parts highlighted.
  Also: cut lists against stock lengths, per-stage delivery lists, a scaled cut
  list for a physical model.

## 11. IFC (T13)

Industry Foundation Classes: open, vendor-neutral BIM schema (buildingSMART,
ISO 16739). Semantic, typed objects with relationships (`IfcWall`,
`IfcOpeningElement`, `IfcBuildingStorey`). Current widely used version IFC4;
IFC4.3 adds infrastructure. Often required on public projects (e.g. Statsbygg).

Role in Iconic CAD: **not** the authoring schema (verbose, describes results not
generative rules). Instead:

1. An output of the compiler (the contract with engineers, contractors,
   permit offices).
2. Vocabulary inside the schemas (declare IFC classes, reuse standard property
   sets and the buildingSMART data dictionary).
3. Where validation can run (IDS, clash detection).

Current `export_ifc.py`: one box `IfcWall` per module; the per-member data for a
better export already exists in members.json.

## 12. Build-ups, bracing and codes (T14, T15)

**Build-ups.** Ordered layers on faces A/B with roles (`bracing`,
`wind_barrier`, `vapour_control`), like Revit wall types or
`IfcMaterialLayerSet`. The hut's exterior build-up is in PLAN.md T14.

**Racking and bracing.** Racking is in-plane: force along the wall turns the
rectangle into a parallelogram; a stiff sheet nailed at all edges or a diagonal
brace prevents it. Wind on one wall is carried by the roof/floor diaphragm to
the perpendicular walls (shear walls), so bracing is needed in both directions;
openings reduce braced length. Out-of-plane loads are taken by studs bending.

- US (IRC R602.10): bracing methods incl. wood structural panels (OSB/plywood,
  most common), let-in diagonal bracing, gypsum, fiberboard; required braced
  length per wall line. OSB braces; a separate water-resistive barrier
  (housewrap) seals.
- Norway (Byggforsk 523.251, as quoted second-hand): permanent bracing on all
  exterior walls; one layer of stiff sheet on all walls is enough for ordinary
  timber houses, inside (interior boards) or outside (gypsum or porous
  wood-fibre wind barrier), nailed along all four edges; cladding/panelling
  don't count; otherwise let-in diagonal braces at every corner; steel straps
  not recommended (go slack). Wind barrier boards often both brace and seal
  (e.g. Hunton Vindtett: full sheets ≥1200×2400, fixed on all four sides).
- Only full-height sheathed segments count; Eurocode 5 method A counts
  segments down to about h/4, IRC uses minimum widths.
- Model the role, not the material: a layer with role `bracing`; constraint:
  every wall line has enough braced length in both directions.

**Sheet sizes.** 4×8 ft = 1219.2×2438.4 mm; 1200×2400 mm is ~1.6% smaller each
way. Imperial: 4 ft = 3×16" = 2×24". Metric: 1200 = 2×600 (c/c 600). Sheet,
spacing, lumber and panel width form one consistent set per system; converting
SEH to mm doesn't work.

**Code landscape.**

| | US | Norway |
|---|---|---|
| Regulation | IRC, free to read (codes.iccsafe.org) | TEK17 + DiBK guidance, free |
| Style | Prescriptive | Performance-based |
| Fastener schedule | IRC Table R602.3(1) | Byggforsk, product guides |
| Bracing | IRC R602.10 | Byggforsk 523.251, product guides, EC5 |
| Build-ups | IRC ch. 6–7, energy provisions | Byggforsk, textbooks, *Trehus* |
| Engineering | AWC (WFCM free view-only) | Eurocodes via Standard Norge (paid) |

Eurocode 5 (NS-EN 1995-1-1) is a calculation standard: materials, member
design, connections (fastener capacity, spacing, edge distances), wall racking
(9.2.4, simplified methods A and B). It doesn't prescribe build-ups; those come
from TEK17 chapters 11 (fire), 13 (moisture), 14 (energy) and Byggforsk's
accepted solutions. Second-generation Eurocodes: SN-EN 1995-1-1:2025 published
as a prestandard (Nov 2025), not yet replacing the current version.

Norwegian sources: Byggforsk catalogue (numbers and titles free to browse;
3xx planning, 5xx details, 7xx maintenance/repair); single sheets for sale;
free trial; some libraries. *Håndbok 5 Trehus* (4th printing 2018; wall
build-ups, roofs, building physics, load calculations incl. rafter/snow
example). Textbooks: *Tømrerboka* (Vg2/Vg3, 2023), *Praktisk tømrerarbeid*
(Frank Berg). Udir's Vg2 tømrer curriculum as a checklist of trade knowledge.

**Requirements with alternative ways to satisfy them,** mirroring both codes
(pre-accepted solutions vs analysis; prescriptive vs engineered design):

```js
requirement('wall_racking', {
  prescriptive: bracedLengthCheck,   // Byggforsk 523.251 / IRC R602.10
  calculated:   ec5RackingCheck,     // EN 1995-1-1, 9.2.4
});
```

Outcomes: pass (prescriptive), pass by calculation (needs review), fail or out
of scope, each with citations. Prescriptive rules carry scope limits. A
calculation is a design check, not an approval. `doc.project.climate` is
US-flavoured today; the code profile should define the site values it needs.
Write rules in own words with citations (ICC and Byggforsk text is
copyrighted).

## 13. Languages and WebAssembly

- React is the most-used front-end framework (Stack Overflow 2025: React 44.7%,
  Angular 18.2%, Vue 17.6%, Svelte 7.2%); competitors Vue, Angular, Svelte,
  Solid, plus Preact, Qwik, Lit, htmx. Not needed here: the repo's no-build,
  plain-JS approach fits its static/offline principle.
- WebAssembly is normal for compute-heavy or ported native code (Figma, AutoCAD
  web, opencascade.js, web-ifc, SQLite, Pyodide), not for typical web apps.
  Options if rules must be shared: TypeScript/JS everywhere (what the repo does),
  Python via Pyodide (heavy startup), Rust (fastest, smaller contributor pool).

## References

- [Iconic CAD Protocol] (OSE wiki)
- [Wall Module Schema](https://wiki.opensourceecology.org/wiki/Wall_Module_Schema) (OSE wiki)
- [Iconic CAD Schemas](https://wiki.opensourceecology.org/wiki/Iconic_CAD_Schemas),
  [Iconic CAD Interface Canon](https://wiki.opensourceecology.org/wiki/Iconic_CAD_Interface_Canon),
  [ICHL Interfaces and Design Rationales](https://wiki.opensourceecology.org/wiki/ICHL_Interfaces_and_Design_Rationales)
  (OSE wiki; interfaces as shared specifications, connection occurrences,
  microinterfaces)
- [ICHL-015](https://wiki.opensourceecology.org/wiki/ICHL-015) (wall module and
  its variants), [Registry for the 301 ICHL Icons](https://wiki.opensourceecology.org/wiki/Registry_for_the_301_ICHL_Icons)
- [Declarative dragging], [Dragology]
- [IRC Table R602.3(1) code change document](https://www.iccsafe.org/wp-content/uploads/bcac/IRC-TableR60231.pdf)
- In-repo: `docs/design_decisions.md`, `docs/layout_schema.md`, `README.md`

[Iconic CAD Protocol]: https://wiki.opensourceecology.org/wiki/Iconic_CAD_Protocol
[Declarative dragging]: https://declarative-dragging.github.io/
[Dragology]: https://github.com/declarative-dragging/dragology
