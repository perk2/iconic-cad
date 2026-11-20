# Design note: ic_joints, joints and fastening in the prototype

Status: implemented in the prototype, 2026-11-15, and revised after a review of the implementation the same day (drafted and revised after review 2026-11-14). Topics: T8 (fasteners and schedules), with links to
T10 (build order) and T19 (build book). Builds on the wall prototype in
[ic_lib_wall.md](ic_lib_wall.md). Decisions J1–J7 were taken one at a time in
discussion; this note records them before any code.

## 1. Problem

The prototype's model has 152 joints for the hut, each `{type, parts}`. They
say which parts are joined and why, but not:

- how a joint is referred to (issues, build steps, a person on site);
- whether it is made in the workshop or on site;
- how it is fastened, and with what;
- how many fasteners the hut needs, per stage.

The fastening schedule in `library/systems/seh_no/system.yaml` is a list of
`{pattern: placeholder}` entries, and the system catalog has no fasteners.

## 2. Current state

- **Joint types:** `library/joint_types.yaml`, each with a description and two
  named sides (`stud_to_plate` {plate, stud}, `sheathing_to_framing` {sheet,
  framing}, `corner_studs` {stud, backing}, and so on).
- **Compiler joints:** `library/modules/wall_panel/compile.js` emits `top_plates`,
  `stud_to_plate` (each stud to the bottom plate and the lower top plate) and
  `sheathing_to_framing` (where a sheet touches a framing member, by
  `_touches`). Sheet parts get the layer's role as their `role` and an id
  `<face><index>_<role>_<n>`.
- **Implementation joints:** `wall_inline/implementations/plain.js` (one
  `panel_seam`), `wall_corner/implementations/backer.js` (two `corner_studs`,
  two `backer_to_plate`).
- **Builder:** the library builder checks that each joint's type exists
  and has a fastening entry in the system (`_check_joints`). Joints have no id,
  stage or fasteners.
- **Engine:** `web/js/engine/compile_design.js` copies joints into the model
  with part ids prefixed by owner (`<entity>/<part>`, `<connection>/<part>`).
- **Stages:** parts carry `stage`; each interface system file declares
  `stage: site`.

## 3. Decisions

| | Decision |
|---|---|
| J1 | A joint id is `j<n>`, numbered by the builder in the order the compiler or implementation emits joints; in the model it becomes `<owner>/j<n>` (`S3/j12`, `c_se/j2`). Ids may change between library versions. The builder rejects two joints with the same type and parts under one owner |
| J2 | A joint's stage is derived: workshop only if every part is a workshop part and all parts belong to the same entity, where a connection part belongs to its host; otherwise site. The builder stores it. The interface system file's `stage` stays the default stage of the implementation's parts and is not checked against joints |
| J3 | The contact face is not stored. The builder checks that a joint's parts touch face to face, within 1 mm (section 4.3) |
| J4 | A schedule entry is flat: `fastener`, `from` (a side), `method` (`straight` or `toe`), `count`, or `spacing` with `along` (a side), optional `edge_spacing` and `end_distance`. Counts round up. No `rows` for now |
| J5 | The builder stores `fasteners: {item, count}` on each joint. Positions come later, when a consumer needs them |
| J6 | Fasteners are entries in the system catalog. Sheet fastening is written on the build-up layer, not in the system's `fastening` section; a joint uses its layer's entry when one of its parts came from a layer with `fastening` |
| J7 | Joints carry no build order; order belongs to build steps (T10) |
| Sources | The system has a `sources` list (what the values are based on), passed through to the asset; entries carry no source of their own |

J2, J4 and J6 were refined after a review on 2026-11-14 (implementation
parts and stage, `along`, the layer lookup, `end_distance`, `sources`).

Rules for choosing fasteners (nail length against the thickness fastened,
penetration for thin materials) are not part of Iconic CAD for now. They are
collected in a separate note, with the dimensions from the books, and compared
with IRC Table R602.3(1).

## 4. Proposal

### 4.1 Library source

**Catalog.** Fasteners beside lumber and sheets. 2.8/95 is the framing nail,
from Tømrerboka; the sheathing nail is still open.

```yaml
catalog:
  fasteners:
    nail_28x95:
      kind: nail             # nail or screw
      diameter: 2.8
      length: 95
      shank: <smooth or ring, from the books>   # optional
      coating: <from the books>                 # optional, text
    <sheathing nail>: {...}
```

**Sources.** What the system's values are based on, as plain text. The list
is required and may be empty. Entries
don't say which source they came from; an optional reference into this list
can be added if that is needed later. The list is filled in when values are
checked.

```yaml
sources:
  - <source>
```

**Schedule.** The system's `fastening` section has one entry per joint type
whose parts don't come from a fastened layer. Every entry names its
fastener; there is no default fastener.

```yaml
fastening:
  stud_to_plate:
    fastener: nail_28x95
    from: stud
    method: toe
    count: <n>
  top_plates:
    fastener: nail_28x95
    from: upper
    along: lower
    spacing: <mm>
    end_distance: <mm>
  panel_seam: {...}
  corner_studs: {...}
  backer_to_plate: {...}
```

**Layer fastening.** A layer can say how its parts are fastened. A joint
uses its layer's entry when one of its parts came from a layer with
`fastening`; the entry's `from` must name the side that part is on.
Otherwise the joint uses the system's `fastening` entry for its type, and a
joint with neither is an error. A joint whose parts both come from layers
with `fastening` is also an error, so a sheet-to-sheet joint within one
fastened layer can't be fastened yet. The joint type is unchanged
(`sheathing_to_framing`), and the builder knows no joint type by name.

A part made from a layer says so: the compiler gives it a `layer` field with
the layer's role, which is also the part's `role`. The builder finds layer
fastening by that field, not by `role`, so a layer named like a framing role
(`stud`) doesn't lend its fastening to the studs. The builder checks that
`layer` names a layer of the variant's build-up and equals the part's role.
Layer roles must be unique across `face_a`, `cavity` and `face_b`; the
builder checks this too. `fastening` is
allowed on site layers too, where battens and lining will need it, although
site layers make no parts yet.

```yaml
buildups:
  exterior:
    face_a:
      - role: bracing
        sheet: osb_12
        stage: workshop
        fastening:
          fastener: <sheathing nail>
          from: sheet
          along: framing
          spacing: 300          # along studs in the middle of the sheet
          edge_spacing: 150     # along the sheet's edges, including seams
          end_distance: <mm>
```

The values in the examples are from the books where stated; the rest are
placeholders.

### 4.2 Schedule entry

| Field | Meaning |
|---|---|
| `fastener` | A catalog fastener id |
| `from` | The side the fastener is driven from, one of the joint type's sides |
| `method` | `straight` (default): driven from the `from` part across the contact face. `toe`: driven at an angle through the side faces of the `from` part into the other part |
| `count` | Fasteners per joint. Used for small contacts, crossings (a batten over a stud) and `toe` |
| `spacing` | Largest distance between fasteners in a row |
| `along` | The side whose part's long axis the row follows (`along: framing` for sheathing). Required with `spacing` |
| `edge_spacing` | Used instead of `spacing` when the contact runs along an edge of the `from` part (sheet borders and seams) |
| `end_distance` | Distance from each end of the row to the first and last fastener (the end distance of Eurocode 5) |

An entry has `count` or `spacing`, not both. `along`, `edge_spacing` and
`end_distance` only go with `spacing`. `toe` requires `count`.

With spacing, the row runs in the direction of the `along` part's long axis,
and its length is the contact's size in that direction. The contact is on an
edge when it reaches an edge of the `from` part that runs in that direction,
within 1 mm; then `edge_spacing` applies, otherwise `spacing`. The count is:

    count = ceil((length - 2 * end_distance) / spacing) + 1

so the fasteners are never further apart than the stated spacing. A length
within 0.000001 mm of a whole number of spacings gets no extra fastener, to
absorb rounding in transformed boxes. A contact shorter than
`2 * end_distance` is an error, so the count is at least one.

The long axis of a part is the longest side of its box, not the member's
length as cut. A block shorter than its section (48 × 148 × 100) has its long
axis across the section, and a sheet wider than tall has it horizontal. When
the `along` part's long axis is across the contact face, or two of its sides
are equally long, the builder reports that it has no long axis in the
contact face. (While building [ic_lib_opening.md](ic_lib_opening.md) the
rule was briefly changed to the longest side within the contact face, for a
46 mm cripple; the cripple went away, and the change hid schedule mistakes,
so the rule is back as it was.) Since the opening revision (ic_lib_opening.md
11.2) a sheet layer's fastening, nailed through the sheet's face, counts
along the part's longest side within the contact face, so a sheet is nailed
to a cripple shorter than its section; every other fastening keeps the
strict rule, so a stud end on a plate with a row schedule is still an
error.

Limits of these rules, for now:

- `edge_spacing` is meant for a `from` part wider than the contact, such as a
  sheet. When the contact covers the whole width of the `from` part, every
  row is on an edge: `edge_spacing: 100` on `top_plates` would give 12 nails
  instead of 3.
- A sheet edge that overhangs its framing by more than 1 mm gets `spacing`,
  since the contact doesn't reach the edge.
- The builder doesn't check that `along` makes sense. `from: sheet, along:
  sheet` on the bracing layer builds: the plate rows then run across the
  48 mm contact and count as on an edge.

Every entry is one row. Fasteners would sit on the contact's centre line
across its width; that matters only once positions are produced. Two rows, as
on a 148 mm wide contact, can be matched in count by a closer spacing until
rows or patterns are modelled. The IRC fastening table works at the same
level: a count or a spacing plus a method, with rows and staggering given in
words for a few built-up members.

### 4.3 Library builder

- **Validate:** the `sources` list; catalog fasteners (kind, diameter,
  length, shank smooth or ring); schedule entries and layer fastening (fields
  above, `fastener` exists in the catalog, `count` or `spacing`); `from` and
  `along` are sides of the joint type. For the system's schedule the joint
  type is known, so this is checked at once. A layer's entry gets its joint
  type from the joints that use it, so its `from` and `along` are checked
  only then, and an entry no joint uses (on a site layer, for now) is never
  checked against a joint type. Layer roles are unique within each build-up,
  and a part's `layer` names a layer of the build-up.
- **Compile and compile implementations**, for every joint:
  - number it (`j1`, `j2`, ...) per variant and per pair, and reject
    duplicates (same type and the same parts, in any side order). For an
    implementation, exposed names are resolved to part ids first, so two names
    for one part are the same part;
  - check that its parts touch face to face (J3), using the part boxes in the
    owner's coordinates (the connection frame for implementations). With the
    tolerance of 1 mm: on exactly one axis the boxes meet (the gap is between
    -1 and 1 mm); on the other two axes they overlap by more than 1 mm. Parts
    that only meet at an edge or a corner fail, and so do parts that overlap
    each other on all three axes. The wall compiler joins a sheet to framing
    only where they overlap by more than the same 1 mm, so a sliver of sheet
    cut at the panel edge gets no joint instead of failing the check. A part
    thinner than 1 mm lying inside another part passes the check; that
    matters only if membranes or steel ever get boxes;
  - derive its stage (J2), reading part stages from the compiled variant
    (exposed parts carry no stage) and treating a connection part as
    belonging to its host;
  - find its schedule entry (the layer's, or the system's for its type),
    check that `from` names the layered part's side and `along` is a side,
    and compute the fastener count (J5). An error about the entry names
    `system.yaml`, although it is reported under the compiler or
    implementation whose joint found it.
- **Export:** joints in the library asset gain `id`, `stage` and `fasteners`.
  A panel joint refers to parts by id; an implementation joint refers to them
  as `{of, part}`, where `of` is a role or `implementation`.

```json
{"id": "j4", "type": "stud_to_plate", "parts": {"plate": "bottom_plate", "stud": "stud_1"},
 "stage": "workshop", "fasteners": {"item": "nail_28x95", "count": 3}}

{"id": "j2", "type": "corner_studs",
 "parts": {"stud": {"of": "butt", "part": "stud_right"},
           "backing": {"of": "implementation", "part": "backer"}},
 "stage": "site", "fasteners": {"item": "nail_28x95", "count": 12}}
```

(Counts are illustrative.)

### 4.4 Engine

- **Assemble:** joint ids become `<owner>/<id>`, with `owner` the entity or
  connection; stage and fasteners are copied unchanged.
- **Derive:** `fasteners_by_stage` in the summary, `{stage: {item: count}}`,
  summed over joints.

The engine computes nothing about fastening; everything above is baked.

These totals cover framing, workshop sheets and connection parts only. Site
layers (battens, cladding, lining, service cavity) make no parts and no
joints, so their fasteners are not counted. The bill of materials can take
fastener counts from the model for what it covers, and needs another source
for the rest until site layers produce parts.

### 4.5 Tests

- Builder: ids numbered and unique; duplicate joints rejected, also with
  sides swapped; parts that don't touch, meet only at an edge or corner, or
  overlap rejected; stage derived for workshop, cross-entity and site-part
  joints, and for a workshop connection part joined to its host; counts with
  `count`, with `spacing` and `along`, with `edge_spacing` at a sheet edge and
  in the middle of a sheet, and with a spacing that doesn't divide the length;
  a contact shorter than twice the end distance, and one exactly twice it
  (count 1); rounding noise; a long-axis tie; a two-sheet panel; sliver
  sheets at the panel edge; the touch check at its 1 mm limits; `toe` with
  `spacing`;
  `spacing` without `along`; unknown fastener, unknown side, `count` with
  `spacing`; a layered joint whose `from` is not the layered part's side; a
  joint with no entry in the layer or the system, and one with both parts
  from fastened layers; a layer role equal to a framing role; a part's
  `layer` that is unknown or differs from its role; duplicate layer roles in
  a build-up; the remaining field checks (neither count nor spacing, zero or
  negative values, count not a whole number, `edge_spacing` or
  `end_distance` with count, bad catalog fastener values, missing `sources`).
- Engine: joint ids in the model, fastener totals per stage for the hut, and
  no joints or fasteners from an unplaced entity.

### 4.6 Code and docs that change with this

- The builder: `validateSystem` and `checkJoints` require a
  `fastening` entry with exactly `pattern` for every joint type; they change
  to the entry format above.
- `tests/library_builder.mjs`: the tests on the `{pattern}` entries.
- `library/joint_types.yaml`: the `stud_to_plate` side descriptions
  ("fastened through", "fastened into its end") describe end nailing, which
  is how, not what; reword them to say only what each side is.
- `library/systems/seh_no/system.yaml`: `sources`, catalog fasteners, the
  schedule, and fastening on the bracing layer; the `{pattern: placeholder}`
  entry for `sheathing_to_framing` goes away.
- `hut/PLAN.md`: the vocabulary defines a fastener as a part at a position,
  and T8 says every joint type needs a schedule entry; both change with J5
  and J6.
- `hut/design/ic_lib_wall.md`, section 4.2: the builder's joint checks.
- `library/modules/wall_panel/compile.js` (after the implementation review): sheet
  parts get a `layer` field, and a sheet is joined to framing only where they
  overlap by more than 1 mm.

## 5. Steps

1. Add fasteners to the catalog and fill in the schedule and layer fastening
   with the values known so far.
2. Builder: validation, joint ids, touch check, stage, counts; update tests
   and fixtures.
3. Engine: joint ids, `fasteners_by_stage`; update tests.
4. Review against this note.

## 6. Out of scope

- Fastener positions, and fasteners as parts.
- Rules for choosing fasteners (separate note).
- Drive angles, staggered rows, per-interface overrides of the schedule.
- Hardware (brackets, straps, hold-downs): connector parts with a two-sided
  joint to each member, later.
- Site-load tiers (wind class, exposure) from the T8 direction in PLAN.md.
- Build order (T10) and readable joint labels for the build book (T19).

## 7. Options considered

- **J1:** ids built from the type and parts (`S3/stud_to_plate:bottom_plate+stud_1`),
  stable between versions but repeating what the joint already holds; ids
  named by authors, readable but tedious in a compiler with many studs.
- **J2:** stage declared per joint type (wrong when one type occurs in both
  stages) or per joint (can contradict its parts).
- **J3:** contact face stored on the joint (derivable from boxes already in
  the model) or stated by authors.
- **J4:** split joint types for edge and field nailing (the compiler would
  take a fastening decision; types multiply); a list of rules with
  conditions (a rule language before we know we need one).
- **J5:** every fastener a model part (about a thousand parts for the hut);
  nothing stored (every consumer reimplements counting).
- **J6:** fastener descriptions inline in each entry (can drift apart); a
  library-wide catalog (only one system so far). For sheets: one joint type
  per layer kind, or fastening on the sheet catalog entry (can't tell bracing
  OSB from lining OSB).
- **After review:** implementation joints always site, or a stage check
  narrowed to joints within one host (J2); the row direction from the longer
  side of the contact or from the long axis of the part fastened into, which
  fail for crossings and for battens (J4); the layer lookup by joint type name
  in the builder, or a marker in `joint_types.yaml` (J6); a `source` on each
  entry, or one for the whole schedule (sources); a `rows` field now (J4).
- **J7:** order on joints (`after:`; can't express operations such as
  insulating); local sequences from implementations, the likely form within
  T10.

## 8. Consequences

- The schedule gets a real shape, and missing or wrong entries are caught
  at library time.
- Fastener counts are derived for the bill of materials and split by stage.
- Implementation parts can later be fitted in the workshop without changing
  the stage rule.
- The touch check catches compiler and implementation geometry bugs that
  nothing catches today.
- The `when` conditions in the T8 direction in PLAN.md are replaced by
  `edge_spacing` for now; update T8 in the prototype review.

## 9. Open questions

- `stud_to_plate` covers both the bottom plate and the lower top plate. If
  the stud is toenailed to the bottom plate but nailed through the top plate
  into its end (assembled flat in the workshop), one entry can't say both.
  Split the joint type, or check the books first?
- J2 treats a connection part as belonging to its host. Revisit when build
  plans (T10) are designed, together with what the interface system file's
  `stage` should mean.
- Top plates: the sheet's top edge lies on the upper top plate, so only that
  plate gets `edge_spacing` and the lower one gets `spacing`. With 150/300
  that is 64 nails per panel. Check in the books and the code whether both
  top plates want edge nailing. If the bracing load passes from the upper
  plate through the `top_plates` nails and the studs, the `top_plates`
  spacing is part of the bracing. If both plates need edge nailing, a band
  width on the edge test (`edge_band: <mm>`) is the likely fix.
- Rows and patterns: every entry is one row. Two rows on wide contacts
  (`panel_seam`, `top_plates`) and the nails within a crossing (horizontal
  battens over studs) need `rows` or a pattern once positions are produced.
  Decide with the battens.
- `panel_seam` and `corner_studs` need a `from` side and a method; which
  stud is nailed through, and with what, follows from the corner detail open
  question in PLAN.md.
- Which nail is used for 12 mm OSB bracing, and is it ring-shanked and
  galvanised?
- Order knowledge that is local to an implementation (insulate the corner
  pocket before the butt wall goes in) needs a way into build steps; for T10.
- A second workshop layer on the same face would get no joints: the compiler
  only joins a sheet to framing it touches, and nothing reports a sheet with
  no joints. Fastening through an intermediate layer also conflicts with the
  touch check. Neither matters for the hut today.
- Should the builder warn when a straight fastener is longer than the joined
  parts along the drive direction? A 95 mm nail through 48 + 48 mm leaves
  1 mm.
- OSB is normally laid with a gap of 2–3 mm between sheets. Two sheets on one
  stud then still touch it, but the gap must be kept in mind if sheet-to-sheet
  contacts are ever checked.
- A sliver of sheet cut at the panel edge (`width: 1201` leaves a 1 mm
  strip) gets no joints and so no fasteners, and nothing reports it. The
  compiler could leave out slivers below some width, or the builder could
  warn about a workshop part with no joints.
- Should the builder warn when a spacing entry's row is shorter than its
  spacing? That would catch most nonsense `along` choices.
- The through wall's sheet is not joined to the site-fitted backer. This is
  probably right, but it is a choice.
