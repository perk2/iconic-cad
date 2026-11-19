"""Tests for scripts/legacy_registry.py and the legacy generator's clean mode.

Folders with a schema.yaml are out of scope for the legacy tooling: libtools
must not see them, and gen_library_entries.py must neither delete them nor
report them as drift.

Run: python -m pytest tests/test_legacy_registry.py -v
"""

import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import gen_library_entries  # noqa: E402
import legacy_registry  # noqa: E402

LEGACY_ID = "wall_4x8_2x6_24oc"


def _root_with_both(tmp_path: Path) -> Path:
    """A repository root with one legacy entry and one schema.yaml folder."""
    modules = tmp_path / "library" / "modules"
    modules.mkdir(parents=True)
    shutil.copytree(ROOT / "library" / "modules" / LEGACY_ID, modules / LEGACY_ID)
    (modules / "wall").mkdir()
    (modules / "wall" / "schema.yaml").write_text("id: wall\n", encoding="utf-8")
    return tmp_path


def test_is_new_format(tmp_path):
    root = _root_with_both(tmp_path)
    assert legacy_registry.is_new_format(root / "library/modules/wall")
    assert not legacy_registry.is_new_format(root / f"library/modules/{LEGACY_ID}")


def test_discover_legacy_skips_schema_yaml_folders(tmp_path):
    from libtools import registry

    root = _root_with_both(tmp_path)
    with pytest.raises(Exception):
        registry.discover(root)  # plain libtools rejects the folder
    entries = legacy_registry.discover_legacy(root)
    assert [entry.id for entry in entries] == [LEGACY_ID]


def test_discover_legacy_on_the_repository():
    ids = {entry.id for entry in legacy_registry.discover_legacy(ROOT)}
    assert "wall_panel" not in ids
    assert LEGACY_ID in ids


def test_validate_code_through_the_wrapper(tmp_path):
    root = _root_with_both(tmp_path)
    assert legacy_registry.main(["validate-code", "--root", str(root), "--all"]) == 0


def test_clean_mode_keeps_schema_yaml_folders(tmp_path):
    root = _root_with_both(tmp_path)
    modules = root / "library" / "modules"
    (modules / "stale_legacy_entry").mkdir()
    (modules / "stale_legacy_entry" / "meta.yaml").write_text("id: stale\n", encoding="utf-8")

    instances = gen_library_entries.load_instances()
    gen_library_entries.write_entries(modules, instances, clean=True)

    assert (modules / "wall" / "schema.yaml").is_file()
    assert not (modules / "stale_legacy_entry").exists()
    assert {inst["id"] for inst in instances} <= {p.name for p in modules.iterdir()}


def test_drift_ignores_schema_yaml_folders(tmp_path):
    instances = gen_library_entries.load_instances()
    generated = tmp_path / "generated"
    gen_library_entries.write_entries(generated, instances, clean=False)
    committed = tmp_path / "committed"
    shutil.copytree(generated, committed)
    (committed / "wall").mkdir()
    (committed / "wall" / "schema.yaml").write_text("id: wall\n", encoding="utf-8")
    assert gen_library_entries.collect_diffs(generated, committed) == []
    shutil.rmtree(committed / LEGACY_ID)
    assert gen_library_entries.collect_diffs(generated, committed) != []
