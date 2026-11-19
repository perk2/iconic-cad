#!/bin/bash
# Run the CI steps from .github/workflows/ci.yml locally (all but the
# Playwright browser workflow), plus a check that web/assets/library.json is
# up to date. Needs .venv (python3 -m venv .venv; .venv/bin/pip install -r
# requirements.txt -r requirements-dev.txt) and node.
#
#     bash hut/tools/ci.sh
cd "$(dirname "$0")/../.." || exit 2
source .venv/bin/activate
fail=0
run() {
    out=$("$@" 2>&1)
    rc=$?
    if [ $rc -ne 0 ]; then echo "FAIL: $*"; echo "$out" | tail -15; fail=1; else echo "ok: $*"; fi
}
run python scripts/gen_wall_instances.py --verify
run python scripts/gen_specs.py
run git diff --exit-code web/assets/lib/specs.json
run node scripts/export_members.mjs --verify
run node scripts/gen_landing_hero.mjs --verify
run python -m pytest tests/test_aperture_envelope.py tests/test_blocking_math.py tests/test_library_drift.py \
    tests/test_generated_entry.py tests/test_members_boxes.py tests/test_export_ifc.py \
    tests/test_legacy_registry.py -q
run python scripts/legacy_registry.py validate-code --root . --all
run node tests/run_js.mjs
run npx --yes -p typescript@5.9.3 tsc -p web/js/library/jsconfig.json
run npx --yes -p typescript@5.9.3 tsc -p web/js/library/jsconfig.builder.json
run python scripts/check_links.py
run node scripts/build_library.mjs --verify
exit $fail
