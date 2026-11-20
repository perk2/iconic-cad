#!/usr/bin/env bash
# The engine-building-the-model animation for hut/wiki/iconic_cad_design.md:
# renders the frames that hut/tools/figures.mjs writes to hut/figures/assembly/
# with headless Chromium, and joins them into hut/wiki/figures/assembly.gif.
#
#   bash hut/tools/assembly_gif.sh
#
# Needs: node; a headless Chromium (CHROME, default: Playwright's
# chrome-headless-shell); Python with Pillow (PYTHON, default: python3).
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
chrome=${CHROME:-$(ls -d "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | tail -1)}
python=${PYTHON:-python3}
width=${WIDTH:-720}

node "$root/hut/tools/figures.mjs" >/dev/null
frames="$root/hut/figures/assembly"
png=$(mktemp -d)
trap 'rm -rf "$png"' EXIT

# The frames share one view; the window takes the SVG's aspect ratio.
read -r vw vh < <(grep -o 'viewBox="0 0 [0-9]* [0-9]*"' "$frames/01.svg" | head -1 | tr -d '"' | awk '{print $3, $4}')
height=$(( width * vh / vw ))
for svg in "$frames"/*.svg; do
  "$chrome" --no-sandbox --disable-gpu --hide-scrollbars --window-size="$width,$height" \
    --screenshot="$png/$(basename "$svg" .svg).png" "file://$svg" >/dev/null 2>&1
done

"$python" - "$png" "$root/hut/wiki/figures/assembly.gif" <<'EOF'
import sys, pathlib
from PIL import Image
src, dst = pathlib.Path(sys.argv[1]), sys.argv[2]
frames = [Image.open(p).convert('RGB') for p in sorted(src.glob('*.png'))]
palette = frames[-1].quantize(colors=128, method=Image.Quantize.MEDIANCUT)  # the last frame has every colour
frames = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
durations = [1600] + [900] * (len(frames) - 3) + [1600, 3500]
frames[0].save(dst, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
print(f'wrote {dst}: {len(frames)} frames')
EOF
