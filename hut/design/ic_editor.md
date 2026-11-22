# The editor on the new library and engine

Status: proposal (2026-11-22). Design topics T2 (state), T3 (ports and
interfaces), T4 (checks), T5 (dragging), T19 (outputs, later).

## 1. Problem

Everything built for the hut (the seh_no library in `web/assets/library.json`,
layouts of entities and connections, the engine, derived modules, sloped
parts) is reachable only through layout files and scripts: the figures, the
tests and `scripts/compile_design.mjs`. The browser editor is upstream's v1
editor and uses none of it. The owner wants to design the hut in the
browser.

## 2. Current state

- **The v1 editor** (`web/index.html`, `web/js/main.js`): one page. `main.js`
  starts everything at load: the three.js preview (`render3d.js`, boxes from
  `enumerateMembers()` in `members.js`), the UI (`ui.js`, 896 lines of event
  handlers), project options, foundation, trades, home, the 2D plan
  (`render2d.js`), the bill of materials.
- **Start-up flow**: the home screen (`home.js`) has DESIGN and LOAD.
  DESIGN resets the document (`resetDoc`), shows the design view and opens
  the project options modal (`options.js`); its GO writes `doc.project`
  (name, system, stories, climate) and calls `setActiveSystem()`. LOAD opens
  a file picker; `io.js` (`loadLayout`) parses a v1 file, applies it and
  fires `iconic:loaded`, which shows the design view. The system dropdown is
  hard-coded in `index.html` (`#opt-system`: seh, vcs12).
- **Systems** (`systems.js`): a map of v1 manifests (seh, vcs12; loaded from
  `web/data/systems/`), each with a grid, a stud spacing, a wall depth (in
  inches) and a palette; `setActiveSystem()` throws for an id it doesn't
  know.
- **The system already configures the editor**, by name: `isVcs12Active()`
  turns features off in `bom.js`, `trades.js`, `fcstd.js` and `ui.js`
  (interior modules), with a note in the modal ("VCS-12 enables exterior
  wall placement only").
- **Its document** (`state.js`): a global `doc` that nearly every module
  imports and reads; entities are `{kind: 'wall'|'iwall', mod, dir, x_mm,
  y_mm, level, layer, connections, props}`, placed by coordinates; what may
  connect is decided in `snap.js` and the click handler (PLAN T3); undo by
  inverse commands.
- **The new pieces** are plain ES modules under `web/js/`: the engine
  (`web/js/engine/compile_design.js`, `affine.js`) and the library core
  (`web/js/library/`, solids included). They import nothing outside `web/`
  and run in a browser as they are. three.js is vendored (`web/vendor/three`,
  importmap in `index.html`).
- **The derived modules' code** (`library/modules/*/derive.js`) is outside
  `web/`, which the static server (`python3 -m http.server --directory web`)
  doesn't serve. Today the caller passes it to the engine
  (`compileDesign(layout, asset, {derived})`).
- **Speed**: the engine compiles the hut with the storey and the roof in
  about 0.3 s in Node, fine for recompiling on each edit.

## 3. Options

**Where the new editor lives**

1. **Retrofit the v1 editor**: replace its document, placement and preview
   with the new model. Every v1 module reads the global `doc` and its
   coordinates; nearly every file changes, and upstream's editor stops
   working with the v1 library during the change.
2. **A new page beside it**: clean, but a second app with its own home,
   options and styles, and nothing on the way to one app.
3. **One page, the editor chosen by the system**: the shell (home screen,
   project options, page layout, styles) is shared; when the project's
   system is a new-format one (in `library.json`), the page starts the new
   editor, otherwise v1 runs as today. The two editors never run at the same
   time and don't share a document.

The difficulty with 3 is that v1 isn't one piece: its modules all start at
load and read `doc` directly. So the switch has to come early, at project
start, and keep the two apart, rather than each v1 module asking which mode
it is in.

**How the browser gets the derived modules' code**

1. Serve the repository root instead of `web/`. Breaks "the app is
   `web/`" (static hosting of one folder).
2. The builder copies each `derive.js` to `web/assets/derived/<id>.js`, a
   generated artifact.
3. **The builder puts each derived module's source in the library asset**
   (`modules.<id>.code`), and the editor imports it from a Blob URL. The
   editor still reads only the library asset, as decided (PLAN, decision
   log); derived code imports nothing, so it runs from a Blob.

## 4. Proposal

**One page, the editor chosen by the system (option 3), and the derived code
in the library asset (option 3).**

### 4.1 The switch

- **The system dropdown** lists the v1 systems and the new-format systems
  from `library.json` (seh_no: "SEH Norway"), each marked by its format.
- **The project options' fields are per system** (owner, 2026-11-22): a v1
  system shows today's (stories, climate zone); a new-format system shows
  only the name and the system until its system file asks for more (site
  values, PLAN T15). seh_no asks for none for now.
- **GO** in the project options: for a v1 system, as today. For a
  new-format system, `doc.project` still gets the name and the system (the
  shell's project data), but `setActiveSystem()` isn't called (it knows only
  v1 manifests), and the page switches to the new editor: v1's design panes
  are hidden and the new editor's root is shown and started.
- **The new editor is loaded only then** (`import('./editor/main.js')`), so a
  v1 session doesn't load it. v1's modules have already started at load;
  hidden, they do nothing (its preview renders only while shown).
- **LOAD** looks at the file: a layout of the new format (`entities` with
  `module` and `variant`, `connections`, `anchor`) goes to the new editor,
  anything else to `io.js` as today.
- **HOME** returns to the home screen; DESIGN or LOAD picks the editor again.
- **No branching on system names** in the new editor: what a system offers
  comes from its data in the library asset (catalog modules and variants,
  interfaces and baked pairs, derived modules and their parameters). If a
  system wants defaults (its derived modules, a starter layout), they become
  data in its system file. Modules that differ a lot between systems need
  library content, not editor code.

### 4.2 The new editor, in steps

Code under `web/js/editor/`; each step usable on its own.

1. **Place building blocks** (owner, 2026-11-22: start blank, place the
   system's blocks; loading too). The editor opens on an empty layout.
   - **A palette** from the library asset: the system's catalog modules and
     their variants (for seh_no: `wall_panel` 1200 and 600,
     `wall_panel_with_opening` window_10x12 and door_10x20), with their
     sizes.
   - **The first block** becomes the anchor, at the origin, facing 0.
   - **The next blocks attach to a free port**: pick a free port (the ends
     of the placed walls), then a block; the editor offers the connections
     the asset's baked pairs allow (which interface, which role and port;
     for a corner, which wall runs through), and the engine places it.
   - **Remove** a block (and its connections); **undo** and **redo**. The
     document is the layout itself; edits go through one `update(layout,
     action)` returning a new layout (T2), undo is a stack of layouts, and
     the engine recompiles after each.
   - **The model in 3D**: boxes and sloped parts (their convex pieces from
     `solids.js`), coloured by role; free ports marked; sheets and framing
     switchable.
   - **Issues** listed (severity, rule, message), the entities and
     connections they name highlighted; **a summary** (blocks by variant,
     parts by role and stage, fasteners).
   - **Load** a layout file (the hut's), and **save** it (download; the
     current one kept in local storage, so a reload doesn't lose it).
2. **Derived modules.** Add the system's derived modules to the layout (the
   storey; the roof after it) and edit their parameters in a form built from
   the module's parameters in the asset (lengths and angles with their
   ranges, choices as lists; the system's fixed values shown, not editable);
   each change recompiles. The hut's roof pitch, ridge and overhangs become
   sliders and selects.
3. **More editing**: a plan view of the entities, joining two free ports
   that meet (closing a loop), changing a connection's roles (which wall runs
   through), moving the anchor.
4. Later: dragging with candidates (T5), the outputs read from the model
   (bill of materials, cut lists, build book; T19), several storeys.

Technical choices:

- **No framework, no build step**, as the v1 app: ES modules, the vendored
  three.js through the same importmap.
- **Its own 3D view**: v1's `render3d.js` reads `doc` and `enumerateMembers()`;
  the new view draws a model (parts with `world`, sloped parts with `frame`,
  `cuts`, `notches`), and the outputs can share it later. The orbit and
  styles are reused where they fit.
- **The engine runs in the page** first; a Web Worker later if recompiling
  gets slow.

## 5. Consequences

- One app: upstream's editor keeps working with the v1 library, and the new
  editor is reached the same way, by choosing a system. v1 systems can move
  to the new format one at a time, as the library's v1 entries do.
- The v1 modules stay as they are; the changes to shared code are small: the
  dropdown, GO, LOAD and HOME in `options.js`, `home.js` and `index.html`.
- The library asset grows by the derived modules' source (a few kB).
- v1's outputs (summary, fab cards, bill of materials, FreeCAD export) are
  not available in the new editor until they're rewritten to read the model.
- The model gets its first interactive consumer; what the editor needs
  (part labels, owners, issues that name parts) shows what the model lacks.

## 6. Open questions

1. *(Decided: in the plan view, which is the editing surface; 7.)*
2. *(Decided, owner 2026-11-22: the plan view is the editor, at least for
   now; the 3D view is a preview.)*
3. Whether the editor needs more from the model: part labels for issues,
   which entity a derived part relates to, stable ids across recompiles
   (ic_derived.md section 12, question 3).
4. *(Decided: the project options' fields are per system; seh_no asks for
   none for now, 4.1.)*

## 7. Step 1 and the switch (2026-11-22)

Done:

- **The switch** (`web/js/editor_switch.js`): the project options list the
  new library's systems after the v1 ones ("SEH Norway (new library)"); for
  one of them the stories and climate fields are hidden, and GO starts the
  new editor (`body.mode-editor` hides v1's sidebar, main area and right
  sidebar; `#editor` shows). LOAD hands a layout of the new format to the
  new editor (`io.js`, `isLibraryLayout`), anything else to v1 as before.
  HOME returns to the home screen; DESIGN leaves the new editor. Checked in
  a browser: v1 with seh is as before.
- **The derived modules' code** is in the library asset (`modules.<id>.code`,
  about 38 kB for the four), imported from Blob URLs
  (`web/js/editor/library.js`).
- **The editor** (`web/js/editor/`): `layout.js` (the document and
  `update`: place, attach, join, remove, replace; free ports; the
  connections the baked pairs allow), `plan.js` (the plan view: each block's
  parts and outline, the derived parts faintly, free ports as circles; zoom
  and pan), `view3d.js` (three.js, boxes and sloped parts' pieces, edges;
  framed on each change until the user turns the view), `main.js` (palette,
  selection, issues, summary, undo and redo, new, load, save, local
  storage).
- **Joining two free ports** (closing a loop) came forward from step 3:
  without it the hut's walls never close, and the storey and roof never
  appear. A selected port offers joins to the other free ports the baked
  pairs allow; each is compiled (without the derived modules) and offered
  only if no loop gap appears and no error is added (the engine may blame
  another connection of the loop than the new one).
- **Removing the anchor** moves it to a neighbour, at the place the model
  gave it, so the rest stays put.
- Checked in a browser (headless Chromium driven over the DevTools protocol):
  the hut's loop built by clicking (10 panels, the closing join the only one
  offered) has no issues and the hut's outline; the hut's layout file loaded
  from the home screen shows with its storey and roof.
- Tests: `tests/editor_layout.mjs` (place, attach options, the hut's loop
  by attaching and one join, no issues; removing the anchor keeps the rest
  in place; the two file formats told apart).
- Next: step 1b (8), then step 2, the derived modules (adding the storey
  and the roof, the parameters form).

## 8. Step 1b: placing as in v1

The owner found v1's placement more intuitive: pick a block, then keep
placing blocks, rather than picking a port and choosing an inline or corner
connection each time; and the blocks at the bottom, in v1's library style.
The model doesn't change (the layout still stores connections); only how
clicks become layout actions does (T5, candidates).

- **Sticky block**: a block picked in the palette stays picked; each click in
  the plan places one, until Esc or another block.
- **Candidates and a ghost**: for every free port and every connection the
  baked pairs allow there, the editor knows where the block would land (a
  trial compile of the walls, without the derived modules). Moving the
  pointer shows the candidate nearest it as a ghost: at the nearest free
  end, straight on (inline) or round a corner, whichever lies nearer the
  pointer. A click attaches it.
- **Corners**: the two corner candidates at a port lie within a wall's
  thickness of each other, so the pointer can't choose; the existing wall
  runs through by default, and F flips it (shown in the ghost's label).
- **Closing a loop**: after a block is attached, if one of its free ends can
  join another free port with the loop closing (as in 7), the join is made in
  the same step (one undo).
- **The first block** is placed where the pointer is, snapped to the
  system's grid, its outside facing the direction picked with S, E, N, W
  buttons (shown while the layout is empty).
- **Selecting and removing**: with no block picked, a click selects a block;
  Delete or Remove removes it. Esc drops the picked block and the selection.
- **The palette at the bottom**, in v1's style: a tab per catalog module, a
  card per variant with a small elevation drawn from the variant's parts, its
  name and size.
- The port-and-option list goes; the free ports stay marked in the plan.

Done (2026-11-22): `web/js/editor/main.js` (candidates from trial
compiles of the walls, the nearest within 2500 mm of the pointer as the
ghost, F to flip a corner, the closing join in the same step), `plan.js`
(pointer and clicks in plan coordinates, the ghost, a grid while the layout
is empty), `layout.js` (`place` takes a position and a facing; `updateAll`
for several actions as one undo step), `web/css/editor.css` (the library at
the bottom). The first block's length is centred on the pointer, its datum
snapped to the grid. Checked in a browser: the hut built by pointing at
where each panel goes (twelve clicks and one F) closes on the last click,
with no issues and the hut's outline.

## 9. Step 2: derived modules in the editor

What the editor needs that the library doesn't say yet:

- **Which derived modules a layout can list.** `wall_line` and `floor` run
  only inside the storey (it gives them their input); the storey and the
  roof are listed in the layout. A derived module's schema says so with
  `child_of: <module>` (wall_line, floor: `child_of: storey`); the editor
  offers the others.
- **What a module needs before it.** The roof reads the storey's exports.
  Its schema says `needs: [storey]`; the editor offers the roof once the
  layout lists a storey, and sets the entry's `after` to it.
- **Starting values.** A parameter the layout gives may have a `default` in
  the schema; a new entry starts with the defaults (the roof: 27°, ridge
  east–west, eaves 400, gables 300). A parameter without a default must be
  filled in before the module runs (the engine reports it).

The editor:

- **A derived panel** (left, below the status): the layout's entries in
  order, each with its title and a remove button, and a form for the
  parameters the layout gives: lengths and angles as a number with a
  slider over the schema's range, choices as a list; the system's fixed
  values listed, not editable. Each change is one undo step and recompiles
  (sliders on release).
- **Add buttons** for the modules the system has that aren't listed and
  aren't children, enabled once what they need is listed.
- **Removing** an entry also removes the entries that come after it (the
  roof with the storey), after asking.
- **The storey before the walls close**: the engine reports that it waits
  for the loop to close; the walls stay, and the issue goes when the loop
  closes.
- Layout actions: `add_derived` {module, id, after, parameters},
  `remove_derived` {id} (and its dependants), `set_parameter` {id, name,
  value}; `derive` is always written as a list.

Done (2026-11-22): the builder takes `child_of` and `needs` on a derived
module's schema and `default` on lengths, angles and choices, checks them
and exports them; wall_line and floor are `child_of: storey`, the roof
`needs: [storey]` with defaults 27°, east_west, 400, 300. `layout.js`:
`add_derived` (after what it needs, with the defaults), `remove_derived`
(with its dependants), `set_parameter`, `deriveList`, `derivedChoices`,
`dependants`. The editor's derived panel (entries, a form per entry, the
system's values listed, Add buttons). Checked in a browser: the hut built by
clicking, then Add storey and Add roof give the hut with its roof and no
issues; a pitch of 35° shows the ridge board too shallow (the walls and
floor stay), and Undo brings 27° back. Tests: `tests/editor_layout.mjs`
(choices, adding, defaults, a parameter, removing with dependants),
builder cases for the new keys.

Found on the way: with the 48x223 ridge board the roof goes up to about
27.4°; steeper needs a deeper ridge board (the module refuses it, as
designed). A pitch range that follows the system's ridge board, or a ridge
board chosen from the pitch, is for the roof note.

