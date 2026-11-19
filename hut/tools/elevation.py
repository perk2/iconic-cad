"""Draw every variant of a module from the compiled parts in
web/assets/library.json, as an SVG: an elevation (inside view) for a wall-type
module, a plan (from above, north up) for a floor-type module (one with joists).

    python3 hut/tools/elevation.py                       # wall_with_opening, seh_no
    python3 hut/tools/elevation.py wall -o wall.svg
    python3 hut/tools/elevation.py floor                 # plan
    python3 hut/tools/elevation.py --widget              # no <style>, for the chat widget

Parts are drawn by role from their boxes (x along the wall, z up). Bracing
sheets are drawn dashed behind the framing; one header ply is drawn (the two
plies coincide in elevation). A dimension chain above each panel shows the
stud grid (spacing c/c, measured from the left end), with faint grid lines
through the panel.
"""

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT / "web" / "assets" / "library.json"

FILL = {
    "stud": "#E9D8B4", "king": "#D9A95B", "jack": "#C47F3A", "cripple": "#A8C686",
    "header": "#8A5A2B", "head": "#C9A27A", "sill": "#6E9FC9",
    "bottom_plate": "#CBB48A", "top_plate": "#CBB48A",
}
ORDER = ["stud", "king", "jack", "cripple", "sill", "bottom_plate", "top_plate", "header", "head"]
LEGEND = [("stud", "Stud"), ("king", "King"), ("jack", "Jack"), ("cripple", "Cripple"),
          ("header", "Header"), ("head", "Head piece"), ("sill", "Sill"), ("bottom_plate", "Plates")]
LINE, SHEET, RO, DIM = "#444441", "#888780", "#E24B4A", "#5F5E5A"
VIEW_W, MARGIN, GAP, TOP = 680, 60, 50, 56
STYLE = ("<style>.t,.th,.ts{font-family:system-ui,sans-serif;fill:#2C2C2A}"
         ".th{font-size:14px;font-weight:500}.ts{font-size:12px}"
         "@media (prefers-color-scheme: dark){.t,.th,.ts{fill:#F1EFE8}}</style>")


def elevation(module, system, widget=False):
    library = json.loads(LIBRARY.read_text())
    variants = library["modules"][module]["systems"][system]["variants"]
    widths = [v["size"]["width"] for v in variants]
    height = max(v["size"]["height"] for v in variants)
    scale = min(0.125, (VIEW_W - 2 * MARGIN - GAP * (len(variants) - 1)) / sum(widths))
    drawn_w = sum(widths) * scale + GAP * (len(variants) - 1)
    ox = (VIEW_W - drawn_w) / 2
    base = TOP + height * scale
    out = []

    for var, width in zip(variants, widths):
        def rect(x0, z0, x1, z1, attrs, _ox=ox):
            return (f'<rect x="{_ox + x0 * scale:.1f}" y="{base - z1 * scale:.1f}" '
                    f'width="{(x1 - x0) * scale:.1f}" height="{(z1 - z0) * scale:.1f}" {attrs}/>')

        parts = var["parts"]
        params = var["params"]
        for p in parts:
            if p["role"] == "bracing":
                b = p["box"]
                out.append(rect(b["min"][0], b["min"][2], b["max"][0], b["max"][2],
                                f'fill="{SHEET}" fill-opacity="0.10" stroke="{SHEET}" '
                                f'stroke-width="0.5" stroke-dasharray="3 2"'))
        for role in ORDER:
            for p in parts:
                if p["role"] != role or p["id"] == "header_inner":
                    continue
                b = p["box"]
                out.append(rect(b["min"][0], b["min"][2], b["max"][0], b["max"][2],
                                f'fill="{FILL[role]}" stroke="{LINE}" stroke-width="0.5"'))

        # Stud grid: faint lines through the panel and a dimension chain above it.
        spacing = params["spacing"]
        ticks = [k * spacing for k in range(int(width // spacing) + 1)]
        if ticks[-1] != width:
            ticks.append(width)
        dim_y = TOP - 18
        for x in ticks[1:-1]:
            X = ox + x * scale
            out.append(f'<line x1="{X:.1f}" y1="{TOP:.1f}" x2="{X:.1f}" y2="{base:.1f}" '
                       f'stroke="{DIM}" stroke-width="0.5" stroke-dasharray="1 3" opacity="0.8"/>')
        out.append(f'<line x1="{ox:.1f}" y1="{dim_y}" x2="{ox + width * scale:.1f}" y2="{dim_y}" '
                   f'stroke="{DIM}" stroke-width="0.5"/>')
        for x in ticks:
            X = ox + x * scale
            out.append(f'<line x1="{X:.1f}" y1="{dim_y - 4}" x2="{X:.1f}" y2="{dim_y + 4}" '
                       f'stroke="{DIM}" stroke-width="0.5"/>')
        for a, b in zip(ticks, ticks[1:]):
            out.append(f'<text class="ts" x="{ox + (a + b) / 2 * scale:.1f}" y="{dim_y - 8}" '
                       f'text-anchor="middle">{b - a:g}</text>')

        unit = params.get("unit")
        caption = f"{width} × {var['size']['height']}, {spacing} c/c"
        if unit:
            ro_w, ro_h = unit["rough_opening"]
            x0, z0 = (width - ro_w) / 2, params["sill_height"]
            out.append(rect(x0, z0, x0 + ro_w, z0 + ro_h,
                            f'fill="none" stroke="{RO}" stroke-width="1" stroke-dasharray="5 3"'))
            out.append(f'<text class="ts" x="{ox + (x0 + ro_w / 2) * scale:.1f}" '
                       f'y="{base - (z0 + ro_h / 2) * scale:.1f}" text-anchor="middle" '
                       f'dominant-baseline="central">RO {ro_w}×{ro_h}</text>')
            caption += f", sill {z0}"
        cx = ox + width * scale / 2
        out.append(f'<text class="th" x="{cx:.1f}" y="{base + 20:.1f}" text-anchor="middle">{var["name"]}</text>')
        out.append(f'<text class="ts" x="{cx:.1f}" y="{base + 38:.1f}" text-anchor="middle">{caption}</text>')
        ox += width * scale + GAP

    y = base + 62
    for i, (role, name) in enumerate(LEGEND):
        x = MARGIN + i * 76
        out.append(f'<rect x="{x}" y="{y:.1f}" width="12" height="12" fill="{FILL[role]}" '
                   f'stroke="{LINE}" stroke-width="0.5"/>'
                   f'<text class="ts" x="{x + 17}" y="{y + 6:.1f}" dominant-baseline="central">{name}</text>')
    y += 24
    out.append(f'<rect x="{MARGIN}" y="{y:.1f}" width="12" height="12" fill="{SHEET}" fill-opacity="0.15" '
               f'stroke="{SHEET}" stroke-width="0.5" stroke-dasharray="3 2"/>'
               f'<text class="ts" x="{MARGIN + 17}" y="{y + 6:.1f}" dominant-baseline="central">Bracing sheet, face A</text>')
    out.append(f'<line x1="{MARGIN + 190}" y1="{y + 6:.1f}" x2="{MARGIN + 214}" y2="{y + 6:.1f}" '
               f'stroke="{RO}" stroke-width="1" stroke-dasharray="5 3"/>'
               f'<text class="ts" x="{MARGIN + 220}" y="{y + 6:.1f}" dominant-baseline="central">Rough opening</text>')
    out.append(f'<line x1="{MARGIN + 340}" y1="{y + 6:.1f}" x2="{MARGIN + 364}" y2="{y + 6:.1f}" '
               f'stroke="{DIM}" stroke-width="0.5" stroke-dasharray="1 3"/>'
               f'<text class="ts" x="{MARGIN + 370}" y="{y + 6:.1f}" dominant-baseline="central">Stud grid</text>')

    view_h = int(y + 32)
    head = (f'<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 {VIEW_W} {view_h}" role="img">'
            f'<title>{module}, {system} variants</title>'
            f'<desc>Inside elevations drawn from the compiled parts in library.json</desc>')
    return head + ("" if widget else STYLE) + "".join(out) + "</svg>\n"


PLAN_FILL = {"sill_plate": "#A8A291", "rim": "#CBB48A", "joist": "#E9D8B4", "blocking": "#C47F3A"}
PLAN_LEGEND = [("sill_plate", "Sill"), ("rim", "Rim"), ("joist", "Joist"), ("blocking", "Blocking")]


def plan(module, system, widget=False):
    """Plan (seen from above, north up) of each variant of a floor-type module:
    rims and joists solid, subfloor sheets dashed over them, the joist grid
    dimensioned along the top and the depth along the left."""
    library = json.loads(LIBRARY.read_text())
    variants = library["modules"][module]["systems"][system]["variants"]
    out = []
    y_top = TOP
    for var in variants:
        width, depth = var["size"]["width"], var["size"]["depth"]
        scale = min(0.15, (VIEW_W - 2 * MARGIN - 40) / width)
        ox = (VIEW_W - width * scale) / 2 + 10
        north = y_top + 20  # room for the N label above the dimension chain

        def rect(x0, y0, x1, y1, attrs):
            return (f'<rect x="{ox + x0 * scale:.1f}" y="{north + (depth - y1) * scale:.1f}" '
                    f'width="{(x1 - x0) * scale:.1f}" height="{(y1 - y0) * scale:.1f}" {attrs}/>')

        parts = var["parts"]
        for role in ("sill_plate", "rim", "joist", "blocking"):
            for p in parts:
                if p["role"] == role:
                    b = p["box"]
                    out.append(rect(b["min"][0], b["min"][1], b["max"][0], b["max"][1],
                                    f'fill="{PLAN_FILL[role]}" stroke="{LINE}" stroke-width="0.5"'))
        for p in parts:
            if p["role"] == "subfloor":
                b = p["box"]
                out.append(rect(b["min"][0], b["min"][1], b["max"][0], b["max"][1],
                                f'fill="{SHEET}" fill-opacity="0.12" stroke="{RO}" '
                                f'stroke-width="0.8" stroke-dasharray="4 3"'))
                w, d = b["max"][0] - b["min"][0], b["max"][1] - b["min"][1]
                cx = ox + (b["min"][0] + w / 2) * scale
                cy = north + (depth - b["min"][1] - d / 2) * scale
                if d * scale >= 30:
                    out.append(f'<text class="ts" x="{cx:.1f}" y="{cy:.1f}" text-anchor="middle" '
                               f'dominant-baseline="central">{w}×{d}</text>')

        # Joist grid along the top, measured from the west end.
        spacing = var["params"]["spacing"]
        ticks = [k * spacing for k in range(int(width // spacing) + 1)]
        if ticks[-1] != width:
            ticks.append(width)
        dim_y = north - 12
        out.append(f'<line x1="{ox:.1f}" y1="{dim_y}" x2="{ox + width * scale:.1f}" y2="{dim_y}" '
                   f'stroke="{DIM}" stroke-width="0.5"/>')
        for x in ticks:
            X = ox + x * scale
            out.append(f'<line x1="{X:.1f}" y1="{dim_y - 4}" x2="{X:.1f}" y2="{dim_y + 4}" '
                       f'stroke="{DIM}" stroke-width="0.5"/>')
        for a, b in zip(ticks, ticks[1:]):
            out.append(f'<text class="ts" x="{ox + (a + b) / 2 * scale:.1f}" y="{dim_y - 8}" '
                       f'text-anchor="middle">{b - a:g}</text>')
        # Depth along the left.
        dim_x = ox - 14
        out.append(f'<line x1="{dim_x:.1f}" y1="{north:.1f}" x2="{dim_x:.1f}" y2="{north + depth * scale:.1f}" '
                   f'stroke="{DIM}" stroke-width="0.5"/>')
        for y in (north, north + depth * scale):
            out.append(f'<line x1="{dim_x - 4:.1f}" y1="{y:.1f}" x2="{dim_x + 4:.1f}" y2="{y:.1f}" '
                       f'stroke="{DIM}" stroke-width="0.5"/>')
        out.append(f'<text class="ts" x="{dim_x - 6:.1f}" y="{north + depth * scale / 2:.1f}" '
                   f'text-anchor="end" dominant-baseline="central">{depth}</text>')
        # Compass labels.
        mid_x = ox + width * scale / 2
        out.append(f'<text class="th" x="{mid_x:.1f}" y="{dim_y - 26}" text-anchor="middle">N</text>')
        out.append(f'<text class="ts" x="{ox + width * scale + 8:.1f}" y="{north + depth * scale / 2:.1f}" '
                   f'dominant-baseline="central">E</text>')

        base = north + depth * scale
        out.append(f'<text class="th" x="{mid_x:.1f}" y="{base + 22:.1f}" text-anchor="middle">{var["name"]}</text>')
        out.append(f'<text class="ts" x="{mid_x:.1f}" y="{base + 40:.1f}" text-anchor="middle">'
                   f'{width} × {depth}, joists {spacing} c/c, seen from above</text>')
        y_top = base + 70

    y = y_top
    for i, (role, name) in enumerate(PLAN_LEGEND):
        x = MARGIN + i * 76
        out.append(f'<rect x="{x}" y="{y:.1f}" width="12" height="12" fill="{PLAN_FILL[role]}" '
                   f'stroke="{LINE}" stroke-width="0.5"/>'
                   f'<text class="ts" x="{x + 17}" y="{y + 6:.1f}" dominant-baseline="central">{name}</text>')
    x = MARGIN + 4 * 76
    out.append(f'<rect x="{x}" y="{y:.1f}" width="12" height="12" fill="{SHEET}" fill-opacity="0.15" '
               f'stroke="{RO}" stroke-width="0.8" stroke-dasharray="4 3"/>'
               f'<text class="ts" x="{x + 17}" y="{y + 6:.1f}" dominant-baseline="central">Subfloor sheet, top (size)</text>')
    view_h = int(y + 32)
    head = (f'<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 {VIEW_W} {view_h}" role="img">'
            f'<title>{module}, {system} variants</title>'
            f'<desc>Plans drawn from the compiled parts in library.json</desc>')
    return head + ("" if widget else STYLE) + "".join(out) + "</svg>\n"


# Callouts for --terms: the review's word numbers (review_vs_books.md, 6.2),
# the model's name and the Norwegian word (proposed, "?" where unsure, until
# checked). Each
# points at one part (by id) or at the rough opening ("RO").
TERMS = [
    ("top_plate_upper", "V22", "Top plate, upper", "toppsvill"),
    ("top_plate_lower", "V22", "Top plate, lower", "toppsvill"),
    ("header_outer", "V27", "Header (two plies)", "overdekning"),
    ("head", "V32", "Head piece", "losholt"),
    ("king_right", "V28", "King stud", "stender"),
    ("jack_right", "V29", "Jack stud", "stender"),
    ("RO", "V25", "Rough opening", "utsparing (size: hullmål)"),
    ("sill", "V31", "Rough sill", "losholt"),
    ("cripple_bottom_2", "V30", "Cripple", "stender"),
    ("stud_right", "V20", "Stud", "stender"),
    ("a1_bracing_4", "V24", "Bracing sheet (OSB, face A)", "avstivende plate? vindavstivning?"),
    ("bottom_plate", "V21", "Bottom plate", "bunnsvill"),
]


def terms(module, system, variant_name, widget=False):
    """One variant, larger, with each kind of part called out by its review
    word number, the model's name and the proposed Norwegian word."""
    library = json.loads(LIBRARY.read_text())
    variants = library["modules"][module]["systems"][system]["variants"]
    var = next(v for v in variants if v["name"] == variant_name)
    width, height = var["size"]["width"], var["size"]["height"]
    view_w, scale, ox, top = 900, 0.22, 60, 50
    base = top + height * scale
    label_x = ox + width * scale + 60

    def X(x):
        return ox + x * scale

    def Z(z):
        return base - z * scale

    out = []
    parts = {p["id"]: p for p in var["parts"]}
    for p in var["parts"]:
        if p["role"] == "bracing":
            b = p["box"]
            out.append(f'<rect x="{X(b["min"][0]):.1f}" y="{Z(b["max"][2]):.1f}" '
                       f'width="{(b["max"][0] - b["min"][0]) * scale:.1f}" '
                       f'height="{(b["max"][2] - b["min"][2]) * scale:.1f}" fill="{SHEET}" fill-opacity="0.10" '
                       f'stroke="{SHEET}" stroke-width="0.5" stroke-dasharray="3 2"/>')
    for role in ORDER:
        for p in var["parts"]:
            if p["role"] != role or p["id"] == "header_inner":
                continue
            b = p["box"]
            out.append(f'<rect x="{X(b["min"][0]):.1f}" y="{Z(b["max"][2]):.1f}" '
                       f'width="{(b["max"][0] - b["min"][0]) * scale:.1f}" '
                       f'height="{(b["max"][2] - b["min"][2]) * scale:.1f}" fill="{FILL[role]}" '
                       f'stroke="{LINE}" stroke-width="0.5"/>')
    params = var["params"]
    ro = None
    if params.get("unit"):
        ro_w, ro_h = params["unit"]["rough_opening"]
        x0, z0 = (width - ro_w) / 2, params["sill_height"]
        ro = (x0, z0, x0 + ro_w, z0 + ro_h)
        out.append(f'<rect x="{X(x0):.1f}" y="{Z(z0 + ro_h):.1f}" width="{ro_w * scale:.1f}" '
                   f'height="{ro_h * scale:.1f}" fill="none" stroke="{RO}" stroke-width="1" '
                   f'stroke-dasharray="5 3"/>')

    rows = []
    for pid, num, name, word in TERMS:
        if pid == "RO":
            if ro is None:
                continue
            ax, az = X(ro[2] - 60), Z((ro[1] + ro[3]) / 2)
        elif pid in parts:
            b = parts[pid]["box"]
            ax, az = X((b["min"][0] + b["max"][0]) / 2), Z((b["min"][2] + b["max"][2]) / 2)
        else:
            continue
        rows.append((az, ax, num, name, word))
    rows.sort()
    step = (base - top) / max(len(rows) - 1, 1)
    for i, (az, ax, num, name, word) in enumerate(rows):
        ly = top + i * step
        out.append(f'<circle cx="{ax:.1f}" cy="{az:.1f}" r="2.5" fill="{LINE}"/>'
                   f'<polyline points="{ax:.1f},{az:.1f} {label_x - 20:.1f},{ly:.1f} {label_x - 6:.1f},{ly:.1f}" '
                   f'fill="none" stroke="{LINE}" stroke-width="0.6"/>')
        out.append(f'<text class="ts" x="{label_x:.1f}" y="{ly:.1f}" dominant-baseline="central">'
                   f'<tspan font-weight="600">{num}</tspan> {name}: <tspan font-style="italic">{word}</tspan></text>')
    caption = f"{variant_name}: {width} × {height}, seen from inside. Words to check against the books (review 6.2)."
    out.append(f'<text class="th" x="{ox}" y="{top - 24}">{caption}</text>')
    view_h = int(base + 30)
    head = (f'<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 {view_w} {view_h}" role="img">'
            f'<title>{module} {variant_name}: parts and words</title>'
            f'<rect width="100%" height="100%" fill="#fff"/>')
    style = "" if widget else STYLE.replace("@media (prefers-color-scheme: dark){.t,.th,.ts{fill:#F1EFE8}}", "")
    return head + style + "".join(out) + "</svg>\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("module", nargs="?", default="wall_with_opening")
    ap.add_argument("--system", default="seh_no")
    ap.add_argument("--terms", metavar="VARIANT", help="draw this variant with its parts named (review words)")
    ap.add_argument("--widget", action="store_true", help="leave out the <style> block")
    ap.add_argument("-o", "--out", help="write to this file instead of stdout")
    args = ap.parse_args()
    library = json.loads(LIBRARY.read_text())
    parts = library["modules"][args.module]["systems"][args.system]["variants"][0]["parts"]
    if args.terms:
        svg = terms(args.module, args.system, args.terms, args.widget)
    else:
        view = plan if any(p["role"] == "joist" for p in parts) else elevation
        svg = view(args.module, args.system, args.widget)
    if args.out:
        Path(args.out).write_text(svg)
    else:
        print(svg, end="")


if __name__ == "__main__":
    main()
