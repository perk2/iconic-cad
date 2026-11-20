# Design note: ic_tables, design tables in the library

Status: deferred, 2026-11-16. The mechanism below is a draft, not reviewed
and not prototyped. It waits for tables we can publish, which means our own
calculation (section 5). Until then, variants name their lumber by hand and
are checked against the books (5.3).
Topics: T15 (code profiles and validation), T11 (systems), T17 (library
format), T18 (floors). Applies to [ic_lib_floor.md](ic_lib_floor.md) (joist
size by span) and [ic_lib_opening.md](ic_lib_opening.md) (header size, jack
and king counts by span), and later to rafters and studs.

## 1. Problem

Some framing members are sized from tables: a joist by its span, spacing and
load; a header by the opening's width and what the wall carries; the number of
jacks and kings by the header span and the wind. If a span is too long for
any lumber in the table, the construction changes (an intermediate beam and
foundation under a floor). The library has no tables. Every variant names its
lumber by hand, and nothing checks that a 48x198 joist can span 2720 or that a
two-ply 48x148 header can span an opening.

For a module to have more than a handful of variants (floors of several
depths, openings of several widths), the sizes have to follow from the tables
instead of being chosen per variant, and the choice has to be traceable: the
build book and a reviewer need to see which table row decided a member.

This note is about how tables enter the library and the toolchain. It does not
choose the values.

## 2. Current state

- **Upstream:** header sizes are written per aperture in `web/js/constants.js`
  (`header_nominal: '2x8'` for a 36" opening, `'2x12'` for 72"), with no table
  behind them and no span check. Upstream has no joist floor.
- **Prototype:** a variant's values are fixed in
  `library/modules/<m>/systems/<s>.yaml`. `resolve()` in
  The library builder replaces catalog ids with catalog entries
  (parameter types `lumber`, `buildup`, `opening_unit`) and passes the values
  to the compiler unchanged. Variants are finite and baked at library time;
  the engine never runs a compiler (PLAN, "Languages by phase").
- **The floor:** `floor` variant `3600x2720` fixes `joist: 48x198`
  (placeholder). **The opening:** `wall_panel_with_opening` fixes
  `header: 48x148` for every opening width, one jack and one king per side
  (`library/modules/wall_panel_with_opening/compile.js`).
- **The system's fastening schedule** (`fastening:` in
  `library/systems/seh_no/system.yaml`) is already a table in all but name:
  joint type to fastener, count and spacing, applied by the builder
  (`fasten_joints`). It is the model for what follows.
- **PLAN, T15:** the code profile (code, edition, national annex) is chosen
  per project, separately from the system. It supplies design loads and
  checks, and checks the system's build-ups and fastening schedule rather
  than supplying them. Site values (characteristic snow load, wind) belong to
  the project (T11).

## 3. Terms

| Term | Norwegian | Meaning here |
|---|---|---|
| Design table | dimensjoneringstabell | Rows of input values (lumber, spacing, load) and a result (maximum span, a count) |
| Span | spennvidde | The free length a member bridges between supports |
| Clear span | lysåpning | Span measured between the faces of the supports |
| Imposed load | nyttelast | Load from use (people, furniture), by use category |
| Snow load | snølast | Characteristic snow load on the ground for the site (sk) |
| Deflection | nedbøyning | How far a member sags under load; often what limits a floor joist |
| Load class | lastklasse | Here: a named set of design loads a variant is designed for (defined in 4.3) |
| Intermediate beam | drager | A beam under the joists that splits one span into two |

Norwegian terms are for comparing with the books; correct them where they
differ.

## 4. Proposal

### 4.1 A table is library data

A table is a YAML file with its inputs, its result, its units, its rows and
its source:

```yaml
# library/systems/seh_no/tables/floor_joists.yaml
id: floor_joists
title: Maximum span of floor joists
status: placeholder          # placeholder | checked
source: >-
  Placeholder values. To be replaced from <source>, table <n>.
inputs:
  lumber: {type: lumber}             # catalog id
  spacing: {type: length, safe: up}  # c/c, mm; between rows, use the larger
  load: {type: load_class}           # a load class of the system
result: {name: max_span, type: length, rule: at_least}   # the value must be >= what is needed
rows:
  - {lumber: 48x198, spacing: 600, load: residential, max_span: 3600}
  - {lumber: 48x223, spacing: 600, load: residential, max_span: 4100}
  - {lumber: 48x198, spacing: 400, load: residential, max_span: 4100}
```

Rules:

- Inputs are categorical (a catalog id, a load class) or numeric (a length).
  A lookup matches categorical inputs exactly. For a numeric input it uses
  the row at that value, or the next row on the safe side, which the input
  declares (`safe: up` for spacing: 500 is looked up as 600). No
  interpolation.
- The result has a rule: `at_least` (a span: the table value must be at
  least what is needed) or `exactly` (a count: the table gives the number).
- The builder validates tables like other library source: known inputs,
  units, every categorical value defined (catalog id, load class), no
  duplicate rows, and simple sanity (a deeper joist never spans less).

### 4.2 Two uses: select and check

A module's schema says, per parameter, how a table applies:

```yaml
# library/modules/floor/schema.yaml
parameters:
  joist:
    type: lumber
    select:
      table: floor_joists
      inputs: {spacing: spacing, load: load}   # table input: parameter
      need: {max_span: depth}                  # table result: what is needed
      from: [48x198, 48x223]                   # candidates, smallest first
```

- **Select:** the variant leaves the parameter out. The resolve pass tries
  the candidates in order and takes the first whose row meets the need. The
  compiler receives the chosen lumber as if the variant had named it.
- **Check:** the variant names the value (`joist: 48x223`). The resolve pass
  looks up its row and fails the variant if it doesn't meet the need. This
  keeps the author's choice (a larger joist for stiffness, one lumber size
  across the house) and still guards it.
- **No row:** if no candidate meets the need, or the named value fails, the
  variant is an error with the numbers: `floor 3600x4800: no lumber in
  floor_joists spans 4800 at c/c 600, residential (largest: 48x223, 4100)`.
  The builder does not change the construction. A longer floor is a variant
  with an intermediate beam (4.5).
- **Needs are parameters, rounded to the safe side.** `need` names a
  parameter, not a formula: the floor's `depth` (outside to outside) stands
  in for the clear span, which is shorter. That costs a little lumber now and
  then and keeps the schema free of an expression language. A compiler that
  knows the exact span can still check it (4.6).

### 4.3 Load classes

A system defines a few named load classes, each a set of design loads:

```yaml
# library/systems/seh_no/system.yaml
load_classes:
  residential:
    imposed: 2.0        # kN/m², use category A (floors)
    snow: 3.5           # kN/m², characteristic on the ground, at most
```

- A variant states its load class (`load: residential`) as an ordinary
  parameter of the new type `load_class`. Tables use it as an input.
- Load class is a dimension of the variants: a floor sized for two classes is
  two variants (`3600x2720` and `3600x2720_heavy_snow`, naming to be
  decided). Variants stay finite and baked.
- A system offers as few classes as its users need. Every class multiplies
  the variants of every module that uses a table.

### 4.4 Recorded in the library asset

A selected or checked parameter carries how it was decided:

```json
"joist": {"id": "48x198", "section": [48, 198], "grade": "C24",
          "table": {"id": "floor_joists", "status": "placeholder",
                    "row": {"lumber": "48x198", "spacing": 600, "load": "residential"},
                    "need": {"max_span": 2720}, "allows": {"max_span": 3600}}}
```

The editor can show it on a module card, the build book can cite it, and a
reviewer can find every member that rests on a placeholder table.

### 4.5 Spans that are too long

A floor deeper than the longest joist span needs an intermediate beam on its
own foundation. The proposal is a floor parameter `beams` (0, 1, 2) that
places the beams evenly, so the joists span `depth / (beams + 1)`. The need
in 4.2 is then not a plain parameter. Two ways out: the variant also states
the joist span as a parameter `span`, which the builder checks against
`depth` and `beams`; or `need` allows this one derived value. The first keeps
the schema free of formulas and is the proposal. The beam is sized from its
own table (span between foundation points, and the joist span as the width
of floor it carries). Where the beams and foundation points go is the floor's
output for the foundation (a `bottom` port or support lines; open in
[ic_lib_floor.md](ic_lib_floor.md)).

### 4.6 Tables inside a compiler (later, if needed)

Some lookups depend on values only the compiler knows: the header span
follows from the rough opening and the jacks; the number of jacks follows
from the header span; jack and king counts feed back into the panel width.
For these, the builder can hand the compiler a lookup object
(`tables.lookup("headers", span=..., load=...)`) that records every lookup it
answers, so the record in 4.4 still appears. Prefer 4.2 where it works: a
schema-level selection is visible in the variant file, checked before the
compiler runs, and keeps compilers free of system data.

### 4.7 Design time: site values against load classes

- The layout states the project's site values (PLAN, "Project"): for example
  `site: {snow: 2.5, use: residential}`, later from the code profile and the
  location.
- The engine compares each entity's load class with the site values and
  reports an issue for an entity designed for less (a constraint: a global
  check, not a placement rule). The engine does no table lookups; the tables
  were applied when the variants were baked.
- Choosing the right variant for a site (`realize` with site values) is the
  editor's job and comes later.

### 4.8 System or code profile

T15 puts design loads and checks in the code profile and keeps the system's
construction choices in the system. Tables sit across that line:

- **The system** holds the tables it builds from: its selection rules,
  written for its lumber and spacing, with the source they were taken from.
  Under the IRC a system may cite the code's own tables; under TEK17 the
  source is typically a Byggforsk sheet or a calculation to Eurocode 5.
- **The code profile** checks: given the project's site values, it confirms
  the system's tables (or the variants built from them) meet the code, by
  its own tables or by calculation. Until code profiles exist, the system's
  tables are the only check, marked by their `status`.

This keeps the system usable under several codes (T15) at the cost of the
same numbers possibly appearing in two places, once as the system's choice
and once as the code's limit.

## 5. Where the numbers come from

Not legal advice; to be confirmed with OSE before anything goes upstream.

### 5.1 What the rights cover

- **Copyright** protects a publication's expression (text, layout, the
  selection and arrangement of its tables), not facts. A single span limit
  is close to a fact.
- **The database right** (EU database directive; in Norway through the EEA,
  åndsverkloven § 24) protects the investment in obtaining, verifying and
  presenting a collection. It forbids extracting or re-utilising a
  substantial part of the contents, in any form, and repeated extraction of
  small parts that add up to a substantial part. It does not stop anyone from
  producing the same data independently.
- **Subscription terms** (Byggforsk) are a contract on top of both; they buy
  access to the publication, not a right to republish it.
- **By source:** Norwegian laws and regulations (TEK17) are not protected
  (åndsverkloven § 14) but have no span tables. Standards (NS-EN 1995,
  EN 338) are protected as documents; their methods, formulas and material
  values can be implemented. Byggforsk is a private publication. The ICC
  claims copyright in the IRC; US case law on codes incorporated into law is
  not settled.

### 5.2 Consequences for the library

- **Using a table to build** is not a restricted act: a builder who reads a
  table and picks a joist copies nothing and makes nothing available. The
  same holds for the owner choosing a variant.
- **Putting a table into the library** is: a published library file is
  extraction and re-utilisation of a substantial part. The form does not
  matter; rules, `if`/`else` code or a lookup function holding the table's
  values are treated the same as the table.
- **Tables we compute ourselves** are ours, even where a value matches the
  book. The proposed source is a script that implements the Eurocode 5 checks
  (bending, shear, deflection, floor vibration) with the Norwegian national
  annex and EN 338 material values, runs over the system's lumber and
  spacings, and writes the tables as a generated artifact. The script is the
  cited source and can be checked by anyone. Comparing a few of its values
  with Byggforsk is ordinary use and catches mistakes.

### 5.3 Until then: hand-chosen variants, checked against the books

- A variant names its lumber, as today. A handful of variants whose choices
  were made with Byggforsk at hand are design choices, like a builder's
  drawing, not the table.
- The variant file cites the source it was checked against
  (`# joist checked against Byggforsk 5xx.xxx, table n`), not the table's
  limit values.
- Variants checked this way stay few. Covering a table's range with variants
  would be the table again, and is the point to have our own calculation.

## 6. Consequences

- **The builder** gets a table loader and validator, two parameter keys
  (`select`, `check`), the `load_class` parameter type, and a record per
  decided parameter. `resolve()` stops being a straight catalog lookup.
- **Schemas** grow: the floor's `joist` and the opening's `header` gain
  `select` blocks.
- **Variants** shrink where values are selected, and grow in number by load
  class.
- **The engine** gets one constraint (load class against site values) and the
  layout gets `site`.
- **Upstream:** tables are a new concept in the library format and a change
  to the builder's resolve pass; upstream's hardcoded header sizes would move
  into a header table per system. This needs the argument in section 1 made
  to upstream, with T17.

## 7. Out of scope

- The numbers themselves, beyond where they may come from (section 5).
- Code profiles themselves (T15), and calculations in place of tables.
- Bracing (T4): it has tables too, but they apply to a whole wall line, not
  to one module's member, and belong to a constraint.
- Rafters, studs in tall walls, beams over large openings: they use the
  same mechanism when those modules exist.

## 8. Options considered

- **Keep choosing by hand (today).** Simple, but nothing checks the choice,
  and every new size is a hand-made decision. Rejected for modules with many
  variants; the `check` key keeps hand choices possible.
- **The compiler does all lookups (4.6 for everything).** Most flexible (exact
  spans), but the choice disappears into code, the variant file no longer
  says what lumber it uses, and compilers start reading system data.
  Kept for the cases that need it.
- **The engine looks up at design time.** Would allow sizing to the site, but
  variants are baked at library time and the engine is generic; a table
  lookup there means compiling at design time. Rejected; the engine checks
  load classes instead (4.7).
- **Tables only in the code profile.** Cleaner by T15, but then a system
  can't be built without choosing a code, and the variant files couldn't be
  resolved on their own. Rejected for now (4.8).
- **Interpolating between rows.** Codes often allow it; it complicates the
  record and the check. Left out; the next row on the safe side is used.

## 9. Open questions

- Is a load class the right granularity, or should variants carry the load
  values directly (`snow: 3.5`) with tables looked up at the next row up?
- How are load classes named and how many does seh_no need (one for the hut
  now)?
- The Eurocode 5 script (5.2): which checks, which national annex values,
  how its results are verified, and whether OSE has a policy or legal
  contact for this.
- Should the need for a floor be the clear span (exact, needs the rim
  thickness, which may itself be selected) or the outside depth (safe, simple)?
- Do tables belong in `library/systems/<s>/tables/` or next to the module
  that uses them (`library/modules/floor/systems/seh_no/`)? A header table is
  used by every module with an opening, which argues for the system.
- The intermediate beam (4.5): a `beams` parameter, a separate module, or a
  derived part of the floor?
- How does the code profile, once it exists, check a table: row by row, or
  per baked variant?

## 10. Steps

Deferred. Until step 1 is done, variants follow 5.3.

1. Our own tables: the Eurocode 5 script (its own note), spot-checked
   against Byggforsk.
2. Review this note with the owner and Fable.
3. Prototype on the floor: `load_classes` in seh_no, a placeholder
   `floor_joists` table, `select` on `joist`, the record in `library.json`,
   tests for select, check and no row.
4. Headers: a placeholder `headers` table (span, load, lumber, plies, jacks),
   with 4.6 if the schema-level selection can't express it.
5. Engine: `site` in the layout and the load-class constraint.
