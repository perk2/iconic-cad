# Review: wall with opening and floor against the books

Status: open, 2026-11-16. A checklist for comparing what the prototype builds
with the books (Byggforsk, Tømrerboka). Each row says what the model does now,
with file references, and what to look up. Fill in the last column; rows that
change the design go back into [ic_lib_opening.md](ic_lib_opening.md) and
[ic_lib_floor.md](ic_lib_floor.md). Figures: `python3 hut/tools/elevation.py`
(wall with opening) and `python3 hut/tools/elevation.py floor` (floor plan).

Already known from discussion (2026-11-16), marked ★:

- the floor's end joists should probably be an end joist and an inner joist
  with blocking between them, not a doubled joist;
- the subfloor's tongue-and-groove edges must not end at the perimeter;
- joists end-nailed to the rims can't carry the floor's load.

## 1. Wall with opening: framing

Compiler: `library/modules/wall_with_opening/compile.js`. Variants:
`library/modules/wall_with_opening/systems/seh_no.yaml`.

| # | Model now | Look up | Books say |
|---|---|---|---|
| W1 | Header: two plies of 48x148 on edge, one flush with each face, the gap between them left for insulation (O6). Same for every opening width | Header build-up for a 148 wall: two plies, a single deeper member, a glulam or LVL beam? Insulation in or next to the header? | |
| W2 | Header size does not depend on the opening width or what the wall carries (placeholder `header: 48x148`) | Header size by opening width and load (roof span, snow). Which openings in the hut need what | |
| W3 | One jack and one king each side, always (O7) | Number of jacks and kings by header span. Is a jack needed at all for small openings (header hung on the kings with screws or hangers)? | Owner: the book's layout is the same as the model's (one jack and one king each side) for these openings |
| W4 | Header raised tight under the top plate when the space above would leave cripples under 200 mm; a head piece ripped to the gap (at most 48) fills down to the rough opening (O6). Both hut variants do this: head piece 46 mm | Is a raised header with a head piece usual? Or the header on the opening and a deeper header filling up to the plate? What's the usual detail for openings near the top plate? | Owner: in a load-bearing wall the header always goes under the top plate. The *losholt* is at the top of the opening, at least 10 mm below the header when there are no studs between them; depending on the window's height there may be studs between them (2026-11-17) |
| W5 | Rough sill: one flat 48x148 between the jacks, on cripples at each end and at the grid positions between (O7) | Single or double sill? Sill flat or on edge? Cripples under the sill at every stud position, at the ends only? | Owner: no cripple next to the jack under the sill (the model's edge cripple, a third stud at the side of the opening, is not in the book): only king and jack, and cripples at the regular c/c 600 |
| W6 | Cripples at least 200 mm long; shorter is an error (MIN_CRIPPLE) | Minimum cripple length, or what's used instead (a solid block) | |
| W7 | Kings clear the end studs by at least 48 mm, so the smallest panel for a 10×12 window is 1800 (O5) | Is a king allowed to be the panel's end stud, with the neighbour panel's end stud next to it? | |
| W8 | Door: the bottom plate is cut at the rough opening; jacks stand on the plate pieces (O8) | Is the plate cut before or after the panel is set? Threshold detail at the floor | |
| W9 | Rough opening is the unit size plus 20 mm in each direction (catalog placeholders `window_10x12`, `door_10x21`) | Gap between unit and rough opening for windows and doors (sides, top, bottom). Norwegian standard window and door sizes | |
| W10 | Opening centred in the panel; window head at 2110, the same as the door (variants) | Usual head height; sill height for the hut's window | |
| W11 | Bracing sheet cut around the rough opening, up to four pieces per sheet; strips under 20 mm left out (O9, O16). The seam at 1200 leaves a 205 mm strip next to the window | Does a sheet edge at the opening need framing behind it all round? Minimum piece width? Can a sheet piece be that narrow beside an opening, or should the seam move? | Owner: the book's figure has two 1200 sheets meeting in the middle of a 1200 wide window: each sheet is one piece with its part of the opening cut out |
| W12 | Does a panel with an opening count towards the wall's bracing? (not modelled) | Bracing contribution of a sheeted panel with an opening, minimum sheet width beside an opening | |

## 2. Wall with opening: fastening

Schedule: `fastening:` in `library/systems/seh_no/system.yaml`. All values
for these joint types are placeholders (O13).

| # | Joint type | Model now | Look up | Books say |
|---|---|---|---|---|
| N1 | `jack_to_king` | Nailed along, spacing per schedule | Nails, spacing, from which side | |
| N2 | `header_to_king` | Through the king into the header end | Count, nail size | |
| N3 | `header_on_jack` | Header nailed down into the jack | Count, or none (bearing only) | |
| N4 | `sill_to_jack` | Toe-nailed from the sill | Count, method | |
| N5 | `cripple_to_header`, `cripple_to_sill`, `cripple_to_jack` | Per schedule | Count, method | |
| N6 | `head_to_header`, `head_to_jack` | Per schedule | Count, method | |
| N7 | `header_to_plate` | Raised header nailed to the top plate | Count, method | |
| N8 | Sheathing at the opening | Edge spacing 150 along the opening's edges (as at seams) | Nail spacing along the edges of an opening | |

## 3. Floor: structure

Compiler: `library/modules/floor/` (now `derive.js`). Variant:
`library/modules/floor/systems/seh_no.yaml` (`3600x2720`).

| # | Model now | Look up | Books say |
|---|---|---|---|
| F-a ★ | Joists end-nailed to the rims (`joist_to_rim`, 3 nails); nothing under them | How the joists are supported: on beams (drager) on the foundation, on a sill beam, in joist hangers on the rim? What carries the rims? | Owner: the joists and the rims bear on a *grunnmurssvill* (sill) on the foundation wall (*grunnmur*). A common sill is 48x148, firmly anchored to the foundation (expansion bolts or similar). The rim is usually the same size as the joists. The *grunnmur* is the book's example only: the hut's foundation is not decided, piers are more likely, with a sill carried by the piers instead of a wall. **TODO:** review the sill on a pier foundation |
| F-b | Joists span the depth (north–south, 2720 outside); rims along the width | Which way should joists span in the hut? On what do the rims and end joists bear? | Owner: the joists span the shortest side, parallel to the gable walls (*gavlvegg*). For the hut that is north–south, as now. Assumes a gable roof with gables east and west (**REVISIT** with the roof) |
| F-c ★ | End joists doubled (two 48x198 tight together); the wall above has 84 of its 148 plate over timber | End joist and inner joist with blocking (kubbing): distance between them, block spacing (c/c or under studs), block size | Owner: the end joists are not doubled. *Kubbing* goes between the outermost joist and the next one, on both sides, c/c 600, lined up with the studs of the wall above (joists north–south, blocks east–west). Lining up is a must, as is roof framing over studs later: the load path runs straight down. Joists c/c 600 everywhere, but the first joist may be closer to the edge: at most 575 from the edge, so the subfloor's tongue and groove doesn't end at the edge (measured centre to centre, from the edge joist to the first inner joist; the point is that the first bay is under 600, so the subfloor's tongue and groove is cut off at the edge) |
| F-d | Joists 48x198 C24 at c/c 600 (placeholder) | Joist size and spacing for a 2.7 m span, category A floor | Owner: keep 48x198 C24 at c/c 600 as the baseline; it is good for a 3.1 m span with *nyttelast* up to 3.0 kN/m² and *egenvekt* up to 0.7 kN/m². Source: a SINTEF Byggforsk table (as reproduced in Tømrerboka) |
| F-e | No blocking or bridging between joists at mid-span | Is mid-span blocking or bridging needed at this span and depth? | |
| F-f | Floor outline flush with the walls' outer face (the bracing sheet's face); the bracing sheet stands on the subfloor's edge (F6) | Where the rim sits relative to the wall: flush with the framing, with the sheathing lapped down over the rim? | Owner: measure the floor from the wall framing, not the bracing sheet: the floor's edge (rim, sill) is flush with the bottom plate's outer face, and the OSB is outside it (it isn't on when the floor is built). Whether the OSB laps down over the rim: still to check |
| F-g | Wind barrier board 12 mm under the joists, insulation between (build-up `floor`) | Floor build-up over a ventilated crawl space: board type, how it's fixed, insulation thickness, any battens | |
| F-h | Not modelled | Anchoring the floor to the foundation; ventilation openings | |
| F-i | Two end studs side by side at a gable wall's panel joint (ic_lib_floor.md, 11.6) | Blocking under them: two blocks, one wider block, or one block centred under the pair? What is the blocking for (bearing under the plate's full depth, holding the end joist, nailing for the bottom plate)? | Owner: for bearing, and so that the gable and long walls get the same attachment pattern. Two blocks, one under each end stud, nailed together (2026-11-17) |

## 4. Floor: subfloor

| # | Model now | Look up | Books say |
|---|---|---|---|
| S1 | Chipboard P5 22 mm, 600 × 2400 (coverage) | Product: board type and thickness for c/c 600; full size and coverage (620 × 2400?) | |
| S2 ★ | Rows from the south: four rows of 600, the north row ripped to 320. Factory edges at the perimeter | Which edges are cut at the perimeter; balanced edge rows (460 + 3 × 600 + 460)? Minimum ripped width | |
| S3 | Long side across the joists; rows staggered by half a sheet (2400 + 1200, then 1200 + 2400) | Laying direction and stagger | |
| S4 | Short ends must land on a joist with at least 20 mm bearing each side (F5) | Must short tongue-and-groove ends land on a joist, or may they fall between joists when glued? | |
| S5 | Long tongue-and-groove seams between joists, no blocking | Confirm no backing is needed under the long seams | |
| S6 | Screws 4.2×55, spacing 300, edges 150 (placeholders) | Fastener, spacing in the field and at edges, glue | |
| S7 | Subfloor laid before the walls (platform framing); walls stand on it | Usual order; is the subfloor laid before the walls, or after the roof is on (moisture)? | |

## 5. Wall on floor

| # | Model now | Look up | Books say |
|---|---|---|---|
| B1 | No joints and no fasteners between the bottom plate and the floor (F9) | How the bottom plate is fixed: nails or screws through the subfloor into rim or joist, spacing; a sill gasket? | |
| B2 | Walls at any position along a floor edge | Any rule on where wall panel joints may fall over the floor (over a joist?) | |

## 5a. Wall corner

Model: `library/interfaces/wall_corner/` (implementation `backer`). Figures:
`python3 hut/tools/corner.py today` and `... proposed` (hand-drawn sketches,
not read from the model).

| # | Model now | Look up | Books say |
|---|---|---|---|
| C1 | The through wall's framing runs out to the outer face of the butt wall's OSB, so the framing outline is not a rectangle and the side of the through wall's end stud is bare on the butt wall's face | Where the framing ends at the outer corner | Owner: wrong. The framing is flush at the outer corner (the through wall's framing ends flush with the butt wall's framing) and the sheets meet at the corner |
| C2 | Backer in the through wall at 112–160 from the corner (64 from the end stud), behind the butt wall's end stud: no nailing for the through wall's lining at the inner corner | Inner corner stud | Owner: two variants in the book. 1: an extra stud in the through wall, offset by the wall depth (at 160–208 with flush framing), which closes a box that must be insulated first. 2: that stud turned, face to face with the butt wall's end stud and fastened to both end studs (60–208), easier to insulate. The backer as placed now is wrong. Decided (2026-11-17): variant 2, the California corner, is the default |
| C3 | The OSB ends at each panel's edge; nothing covers the bare strip at the corner | Corner sheathing and seams | Owner: inside a panel a sheet edge lands on the middle of a stud, but at a panel's end the sheet ends flush with the outside of the end stud (as the model does); and seams are covered with tape or a strip of soft wind barrier (*vindsperre*) from a roll; the same at the corner. Assumed for now: a thin strip of OSB fitted on site covers the rest of the corner, nailed like the other sheets (150 at edges, 300 in the field). **REVISIT** |

## 6. Words

Every Norwegian word in the hut notes, plus the model's part and layer roles
that have none yet. Proposed words are unchecked, mine or from the notes;
correct them from the books and fill in where the book uses them; answers
checked by the owner so far give the word only, without the source. The build
book (T19) will probably be in Norwegian, so these become its words.
Existing tables to update afterwards: [ic_lib_opening.md](ic_lib_opening.md)
section 2, [ic_tables.md](ic_tables.md) section 3, PLAN.md T14 (terms).

### 6.1 Floor and foundation (review together with F-a to F-h)

| # | Model (English, role) | Proposed Norwegian | Books say (word, where) |
|---|---|---|---|
| V1 | Joist (`joist`); the joist floor as a whole | *bjelke*; *bjelkelag*, *golvbjelkelag* | *golvbjelke* (in a floor), otherwise *bjelke*; *bjelkelag* for the joist floor as a whole; *etasjeskiller* when it separates two storeys |
| V2 | Rim joist (`rim`), across the joist ends | *kantbjelke*, *randbjelke*, *endebjelke* (unsure which) | *kantbjelke* |
| V3 | End joist, the outermost joist along the side | *kantbjelke* (unsure; may clash with V2) | No term of its own. The model needs a role name for it (open: keep `joist`, or a model-only name) |
| V4 | Blocking between joists | *kubbing*, *kubb* | *kubbing*, plural *kubbinger* |
| V5 | Beam under the joists | *drager* | Not confirmed yet |
| V6 | Sill beam on a foundation wall | *svill*, *grunnmurssvill* | *grunnmurssvill* for the sill on a foundation wall; *svill* in general |
| V7 | Joist hanger | *bjelkesko* | *bjelkesko* |
| V8 | Pier, point foundation | *pilar*, *punktfundament*, *søylefundament* | |
| V9 | Ventilated crawl space | *(ventilert) kryperom* | |
| V10 | Subfloor (`subfloor`); chipboard | *undergolv*, *golvplate*; *sponplate* | *undergolv*. The board names (*golvplate*, *sponplate*) are not confirmed yet |
| V11 | Tongue and groove | *not og fjær* | *not og fjær* |
| V12 | Spacing c/c | *senteravstand*, *c/c* | *senteravstand*, *c/c* |
| V13 | Span; clear span | *spennvidde*; *lysåpning* (ic_tables) | *spennvidde*; *lysåpning* |
| V14 | Foundation wall | *grunnmur* | *grunnmur* (owner, F-a) |
| V15 | Gable wall; eaves wall | *gavlvegg*; *langvegg* (unsure) | *gavlvegg* (owner, F-b) |
| V16 | Imposed load; self-weight (dead load) | *nyttelast*; *egenvekt* | *nyttelast*, *egenvekt* (owner, F-d) |
| V17 | Expansion bolt (anchoring the sill) | *ekspansjonsbolt* | |

### 6.2 Walls and openings (review together with W1 to W12)

Figure: `python3 hut/tools/elevation.py --terms window_10x12` (each part
called out with its number and proposed word).

| # | Model (English, role) | Proposed Norwegian | Books say (word, where) |
|---|---|---|---|
| V20 | Stud (`stud`) | *stender* | *stender* |
| V21 | Bottom plate (`bottom_plate`) | *bunnsvill* | *bunnsvill* |
| V22 | Top plate, lower and upper (`top_plate`) | *toppsvill* (doubled: unsure) | *toppsvill*; the doubled plate: *dobbel toppsvill* |
| V23 | Corner backer (`backer`) | *spikerslag* (unsure) | No name. A corner (*hjørneløsning*) needs an extra stud to give *spikerslag* (something to nail into) for the interior battens or lining; *spikerslag* is what the stud gives, not the stud's name |
| V24 | Bracing sheet (layer role `bracing`) | *avstivende plate*, *vindavstivning* (unsure) | *vindavstivende plater*: the generic term for sheets that both block wind and brace. Soft wind protection with other bracing is also possible, but the wall panels use sheets |
| V25 | Rough opening; its size | *utsparing*; *hullmål* | *åpning*, or *vindusåpning*, *døråpning* |
| V26 | Window, door; their frame | *vindu*, *dør*; *karm* | |
| V27 | Header (`header`) | *overligger* | *overdekning* (not *overligger*) |
| V28 | King stud (`king`) | *gjennomgående stender* (unsure) | *stender*: no word of its own; the layout is the same as the model's |
| V29 | Jack stud (`jack`) | *bærestender*, *opplegg for overligger* (unsure) | *stender*: no word of its own; the layout is the same as the model's. Also *oppleggstender* |
| V30 | Cripple (`cripple`) | *kortstender* (unsure) | *stender* |
| V31 | Rough sill (`sill`) | *losholt* | *losholt* |
| V32 | Head piece (`head`) | *losholt*, *utforing* (unsure) | *losholt* (the same word as the rough sill: the horizontal pieces at an opening) |

### 6.3 Build-up layers

| # | Model (layer role) | Proposed Norwegian | Books say (word, where) |
|---|---|---|---|
| V40 | `cladding` | *kledning* (*utvendig kledning*) | |
| V41 | `ventilated_cavity` (battens) | *luftespalte*, *lekter*, *sløyfer* | |
| V42 | `wind_barrier` | *vindsperre* | |
| V43 | `insulation` | *isolasjon* | |
| V44 | `vapour_control` | *dampsperre* | |
| V45 | `service_cavity` | *installasjonssjikt* | |
| V46 | `lining` | *innvendig kledning* | |

### 6.4 Fastening and wall types

| # | Model (English) | Proposed Norwegian | Books say (word, where) |
|---|---|---|---|
| V50 | Toe-nailing (`method: toe`) | *skråspikring* | |
| V51 | End-nailing through one member into the other's end | *endespikring* (unsure) | |
| V52 | Fastening schedule | *spikerplan*, *innfestingsplan* (unsure) | |
| V53 | Exterior, interior wall | *yttervegg*, *innervegg* (PLAN T14) | |
| V54 | Load-bearing, non-load-bearing | *bærende*, *ikke-bærende* (PLAN T14) | |
| V55 | Partition | *skillevegg*, *lettvegg* (PLAN T14) | |
| V56 | Braced wall | *avstivende vegg* (PLAN T14) | |

## 7. After the review

- Update the decisions in the two notes (O and F rows) and mark which values
  are checked, citing the book and section, not its table values
  ([ic_tables.md](ic_tables.md), 5.3).
- Update the Norwegian words in the notes listed in section 6; decide
  whether they move into one glossary (in PLAN.md's vocabulary, or a
  `terms.md`).
- Change the compilers and the seh_no data; regenerate `library.json`.
- Redraw the figures and compare once more.
