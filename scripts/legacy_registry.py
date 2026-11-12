#!/usr/bin/env python3
"""Run libtools on legacy library entries only.

The library holds two formats during migration:

- legacy entries (schema.py, compiler.py, meta.yaml, expect.yaml), which
  vcs-library's libtools discovers, validates and compiles;
- new-format folders, marked by a schema.yaml, which libtools does not
  understand and which are out of scope for the legacy tools and tests.

libtools' discover() raises on any folder under library/<layer>/ that lacks the
legacy files, so this module provides a discover that skips new-format folders,
and a command-line wrapper that installs it before running libtools. is_new_format()
needs no libtools, so other legacy scripts and tests can use it too:

    python scripts/legacy_registry.py validate-code --root . --all
"""

from __future__ import annotations

import sys
from pathlib import Path

NEW_FORMAT_MARKER = "schema.yaml"


def is_new_format(path: Path) -> bool:
    """True for a new-format library folder (out of scope for libtools)."""
    return (Path(path) / NEW_FORMAT_MARKER).is_file()


def discover_legacy(root: Path) -> list:
    """libtools' discover(), skipping new-format folders.

    Mirrors registry.discover() and uses its private _load_entry and
    _LAYER_NAMES, as of the vcs-library commit pinned in
    requirements-build.txt; check this when bumping the pin.
    """
    from libtools import registry

    library = Path(root) / "library"
    entries = []
    for layer_dir_name in registry.LAYERS:
        layer_dir = library / layer_dir_name
        if not layer_dir.is_dir():
            continue
        for entry_path in layer_dir.iterdir():
            if entry_path.name.startswith(".") or not entry_path.is_dir():
                continue
            if is_new_format(entry_path):
                continue
            entries.append(
                registry._load_entry(entry_path, registry._LAYER_NAMES[layer_dir_name])
            )
    return sorted(entries, key=lambda entry: (entry.layer, entry.id))


def install() -> None:
    """Make libtools use discover_legacy() wherever it discovers entries."""
    import libtools.cli
    import libtools.compile_entry
    from libtools import registry

    for module in (registry, libtools.cli, libtools.compile_entry):
        module.discover = discover_legacy


def main(argv: list[str] | None = None) -> int:
    install()
    from libtools.cli import main as libtools_main

    return libtools_main(argv)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
