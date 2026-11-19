# Design note: the upper top plate, fitted on site

Status: implemented 2026-11-19 as an own part of the derived `wall_line`
module, run by the `storey` ([ic_derived.md](ic_derived.md), section 10).
Rules decided 2026-11-19 (section 7). From the book review
(ic_lib_wall.md 11.6, question 5) and the owner's rules (2026-11-19).
Topics: T18 (derived assemblies), T6 (parts).

## 1. Problem

With a double top plate the upper plate ties the wall together: it laps over
the corners and over the joints between panels. The owner's rules:

- **At a corner the upper plates overlap** (lap), so the two walls are tied.
- **Any joint in the upper plate is at least 600 from a joint between
  panels.**
- (Decided 2026-11-17) The upper plate is left off the panels and fitted on
  site after erection, in stock lengths.

The model can't hold this today: every panel carries its own upper plate,
flush with its ends, and nothing in the model belongs to a whole wall line.

## 2. Current state

- `web/js/library/walls.js`, `WallPanel.plates()`: every panel gets a bottom
  plate, `top_plate_lower` and `top_plate_upper` over its full width, and a
  `top_plates` joint between the two top plates. Both wall compilers use it.
- The bracing sheet runs to the panel's top (2400), so its top edge lies on
  the upper plate, which gets the edge spacing (ic_joints.md, open points).
- `wall_inline` (`implementations/plain.js`) joins the two end studs
  (`panel_seam`); `wall_corner` (`california.js`) joins the end studs and
  the turned stud to the through wall's lower top plate (exposed as
  `top_plate`). Neither knows about the runs they belong to.
- The engine (`web/js/engine/compile_design.js`) composes stored transforms
  and has no wall-specific code (upstream rule). It knows connections but
  no "runs" or wall lines.
- The hut: the long walls (south 1800 + 1800, north 3 x 1200) run through
  at the corners; the gable walls (east and west, 2 x 1200) butt.

## 3. Rules (proposed from the owner's)

| | Rule |
|---|---|
| P1 | The upper plate is the stud lumber lying flat on the lower top plate, fitted on site, joined to it by `top_plates` |
| P2 | **At a corner the upper plates lap the other way from the lower plates**: the butt wall's upper plate runs on to the outer corner over the through wall's lower plate, and the through wall's upper plate stops at the butt wall's inside face. So each wall's upper plate ties into the other wall |
| P3 | **A joint in the upper plate is at least 600 from any joint between panels**, and on a stud: with studs c/c 600 from each panel's left end, a joint at a multiple of 600 from a panel joint is centred on a stud |
| P4 | **Pieces at most 2400** (owner): with 1200 panels a joint can only be at a panel's middle (600 from both ends), so pieces run between panel middles in multiples of 1200; 2400 gives a joint at every other panel and cuts two pieces from a 4800 stock length |

For the hut: the gable walls' upper plates are 2696 (over the full depth,
onto the long walls), the long walls' 3304 (3600 less two framing depths),
so every plate has one joint, at a panel's middle: the long walls' at x
1800 (or 2400 with the opening panels, over a cripple above the header),
the gable walls' at 1800 from their start (pieces 1948 and 748).

## 4. Options for the model

**A. A plate module on sliding ports.** The upper plate is a layout entity
(`top_plate`, variants by length), placed on the walls through a new
interface with a sliding port, as walls stand on the floor (`wall_on_floor`).
Loop closure checks it against the walls. The 600 rule becomes an allowed
range of positions per plate and panel pair, baked at library time. But the
role on a sliding port exposes nothing, so the joint between the plate and
each panel's lower plate (whose length depends on the position) can't be
baked; the layout also has to list the plates.

**B. A derived assembly in the engine.** The system file describes a laid
member generically: lumber, which exposed part it lies on (`top_plate`),
along which chains of connections (`wall_inline`), how it laps at another
interface (`wall_corner`, P2), the joint rule (P3) and the stock length.
The engine finds the chains, lays the pieces and their joints, and counts
fasteners from a per-length schedule baked by the builder. This is the
first derived assembly (T18; the floor is meant to follow), and it needs a
generic description that doesn't name walls in the engine.

**C. Pieces owned by the connections.** `wall_inline` adds a 1200 splice
piece centred on each panel joint, and the panels carry the rest of the
upper plate between the splices; `wall_corner` adds the lap. Everything is
baked today, and the joints fall exactly 600 from the panel joints, but the
plate is in short pieces with a joint every panel, not in stock lengths.

## 5. Proposal

**B**, in two steps:

1. Library: the panels lose `top_plate_upper` (and the `top_plates` joint);
   their height stays the wall's height less one plate, and the ports and
   the floor are unchanged. The bracing sheet still runs to the wall's
   height, 48 above the panel's framing, and is nailed to the upper plate on
   site (open question 2).
2. Engine: a generic "laid member" pass after assembly, driven by a
   description in the system file (P1 to P4). It finds each wall line (a
   chain of `wall_inline` connections between two `wall_corner`
   connections, or a loop), sets the ends by the lap rule, splits it into
   stock lengths with joints on studs at least 600 from the panel joints,
   and adds the pieces as site parts with `top_plates` joints to each
   panel's lower plate, and the sheets' nailing into them.

The engine stays free of wall-specific code: it reads which interface
chains, which interface laps and which exposed part to lie on from the
system file.

## 6. Consequences

- The panels' parts, joints and nail counts change (one plate and its
  joint fewer, the sheet's top edge nailing moves to the site plate), and
  so do `library.json`, the fixtures and the tests.
- The engine gets its first derived pass; the floor (T18) can follow the
  same path later.
- Stud lengths and the wall's height don't change.

## 7. Answers (owner, 2026-11-19)

1. P2: the butt wall's upper plate runs to the outer corner.
2. The workshop sheet runs to 2400, overhanging the panel's framing by 48,
   and is nailed to the upper plate on site.
3. Pieces at most 2400 (P4).
4. Model: B, a derived assembly; how it is described in the library and
   run is discussed next.

## 8. Open questions (as asked)

1. **P2's direction**: the butt wall's upper plate to the outer corner
   (proposed), or the through wall's?
2. **The sheet's top edge**: the workshop sheet runs to 2400 and overhangs
   the panel's framing by 48 until the upper plate is on (then nailed to
   it); or the sheet stops on the lower plate (2352) and a strip covers the
   upper plate on site.
3. **Stock length** for 48x148: the longest length to use (4800, 5400)?
4. **Model**: B (derived in the engine), or A or C for now?
