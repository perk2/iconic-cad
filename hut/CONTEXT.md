# Context for this branch

This is the `hut` branch of a personal fork of Iconic CAD
(upstream: OpenSourceEcology/iconic-cad). I'm using a small single-room hut as a
concrete project to drive Iconic CAD architecture and development.

Read first:

- `hut/PLAN.md`: goals, streams (hut design and build; Iconic CAD architecture),
  design topics T1–T19, principles, git workflow. Its "Where we are" section
  at the top says what's done and what's next.
- `hut/NOTES.md`: background and sources (explainers, bracing and codes,
  Norwegian references); no decisions.
- `docs/design_decisions.md`: upstream's design decisions; respect them, or
  argue explicitly for changing one.

Rules for working here:

- Never include `hut/` or the root `CLAUDE.md` in anything meant for upstream.
  Upstream-bound work goes on feature branches from `upstream/main`.
- Design before code: for a design topic, write a note in `hut/design/`
  (problem, current state with file references, options, proposal,
  consequences, open questions) before prototyping.
- Keep the existing tests green: `node tests/run_js.mjs` (JS) and the pytest
  suite listed in `.github/workflows/ci.yml`; `bash hut/tools/ci.sh` runs all
  the CI steps locally (needs `.venv`).
- Derived artifacts are generated, never hand-edited: `web/assets/lib/*`,
  `specs.json`, `members.json` and thumbnails by `python build_lib.py`;
  `web/assets/library.json` (the new-format library) by
  `node scripts/build_library.mjs`.
- The app is fully static: `python3 -m http.server 8080 --directory web`.
