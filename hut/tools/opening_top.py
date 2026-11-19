"""Draw the top of a rough opening in three ways, as an SVG (elevation from
inside, mm, z from the underside of the wall's bottom plate):

- before: the model's head piece before the revision, ripped to 46 to fill
  from the opening (2110) to the header (2156);
- R3: a full 48 head piece (losholt) under a 10 mm gap: the opening must stop
  at 2098, 12 below the hut's 2110;
- no head piece: the header's underside (2156) is the top of the opening, 46
  above the hut's 2110.

    python3 hut/tools/opening_top.py -o hut/figures/opening_top.svg

Hand-drawn from the numbers in the note (ic_lib_opening.md, 11, open
question 1), not read from the model. The answer (11.1): the door became a
10x20 and both openings' tops 2000; later the head piece went, and the
header sits on the opening (A7).
"""

import argparse
from pathlib import Path

WOOD, HEADER, HEAD, OPEN, RED, OK, LINE, DIM = (
    "#E9D8B4", "#8A5A2B", "#C9A27A", "#EAF2FA", "#E24B4A", "#3B8A3B", "#444441", "#5F5E5A")
Z0, Z1 = 2020, 2420         # z range shown
X0, X1 = -110, 330          # x range shown per panel (opening edge at 0)
S = 1.25                    # px per mm
PW, GAP, TOP, LEFT = (X1 - X0) * S, 40, 70, 20
NEED = 2110                 # the hut's window and door reach this
TOP_PLATES, HEADER_UNDER = 2304, 2156


def svg(panels):
    out = []
    width = LEFT * 2 + len(panels) * PW + (len(panels) - 1) * GAP
    height = TOP + (Z1 - Z0) * S + 70

    for i, (title, sub, head, opening_top) in enumerate(panels):
        ox = LEFT + i * (PW + GAP)

        def X(x):
            return ox + (x - X0) * S

        def Y(z):
            return TOP + (Z1 - z) * S

        def rect(x0, z0, x1, z1, fill, extra=""):
            out.append(f'<rect x="{X(x0):.1f}" y="{Y(z1):.1f}" width="{(x1 - x0) * S:.1f}" '
                       f'height="{(z1 - z0) * S:.1f}" fill="{fill}" stroke="{LINE}" stroke-width="0.7" {extra}/>')

        def label(z, text, color=DIM, x=X1, anchor="end", dy=-3):
            out.append(f'<text class="ts" x="{X(x) - 3:.1f}" y="{Y(z) + dy:.1f}" text-anchor="{anchor}" '
                       f'fill="{color}">{text}</text>')

        out.append(f'<text class="th" x="{ox + PW / 2:.1f}" y="22" text-anchor="middle">{title}</text>')
        out.append(f'<text class="ts" x="{ox + PW / 2:.1f}" y="40" text-anchor="middle">{sub}</text>')
        # The opening, up to its top.
        rect(0, Z0, X1, opening_top, OPEN, 'stroke-dasharray="4 3"')
        out.append(f'<text class="ts" x="{X(X1 / 2):.1f}" y="{Y(Z0) - 14:.1f}" text-anchor="middle">rough opening</text>')
        # Framing: top plates, king, jack, header, head piece.
        rect(X0, 2352, X1, 2400, WOOD)
        rect(X0, TOP_PLATES, X1, 2352, WOOD)
        label(2352 + 14, "two top plates, 2304–2400")
        rect(X0, Z0, X0 + 48, TOP_PLATES, WOOD)
        rect(X0 + 48, Z0, 0, HEADER_UNDER, WOOD)
        out.append(f'<text class="ts" x="{X(X0 + 24):.1f}" y="{Y(Z0 + 60):.1f}" text-anchor="middle" '
                   f'transform="rotate(-90 {X(X0 + 24):.1f} {Y(Z0 + 60):.1f})">king</text>')
        out.append(f'<text class="ts" x="{X(X0 + 72):.1f}" y="{Y(Z0 + 60):.1f}" text-anchor="middle" '
                   f'transform="rotate(-90 {X(X0 + 72):.1f} {Y(Z0 + 60):.1f})">jack</text>')
        rect(X0 + 48, HEADER_UNDER, X1, TOP_PLATES, HEADER)
        out.append(f'<text class="ts" x="{X(X1 / 2):.1f}" y="{Y((HEADER_UNDER + TOP_PLATES) / 2) + 4:.1f}" '
                   f'text-anchor="middle" fill="#fff">header 48x148, 2156–2304</text>')
        if head:
            z0, z1 = head
            rect(0, z0, X1, z1, HEAD)
            label((z0 + z1) / 2 - 5, f"losholt {z1 - z0:g}, {z0:g}–{z1:g}", LINE)
            if z1 < HEADER_UNDER:
                label(HEADER_UNDER - 1, f"gap {HEADER_UNDER - z1:g}", DIM, x=X1, dy=-1)

        # The hut's need: the window's and the door's rough opening reach 2110.
        ok = opening_top == NEED
        color = OK if ok else RED
        out.append(f'<line x1="{X(X0):.1f}" y1="{Y(NEED):.1f}" x2="{X(X1):.1f}" y2="{Y(NEED):.1f}" '
                   f'stroke="{color}" stroke-width="1.6" stroke-dasharray="6 3"/>')
        out.append(f'<text class="ts" x="{X(X0 + 100):.1f}" y="{Y(NEED) + 14:.1f}" fill="{color}">'
                   f'hut needs 2110</text>')
        if not ok:
            lo, hi = sorted((opening_top, NEED))
            out.append(f'<rect x="{X(0):.1f}" y="{Y(hi):.1f}" width="{X1 * S:.1f}" height="{(hi - lo) * S:.1f}" '
                       f'fill="{RED}" fill-opacity="0.35"/>')
            what = "12 too high" if opening_top < NEED else "46 empty above the window"
            out.append(f'<text class="ts" x="{X(X1 / 2):.1f}" y="{Y(lo) + 14:.1f}" text-anchor="middle" '
                       f'fill="{RED}" font-weight="600">{what}</text>')
        label(opening_top, f"top of opening {opening_top:g}", color, x=X1, dy=14)

    style = ("<style>.th,.ts{font-family:system-ui,sans-serif;fill:#2C2C2A}.th{font-size:14px;font-weight:600}"
             ".ts{font-size:11px}@media (prefers-color-scheme: dark){.th{fill:#F1EFE8}}</style>")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {height:.0f}" '
            f'style="background:#fff">{style}{"".join(out)}</svg>\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("-o", "--out")
    args = ap.parse_args()
    text = svg([
        ("Before (the old model)", "losholt ripped to fill, no gap", (2110, 2156), 2110),
        ("R3: losholt + 10 gap", "full 48 losholt, gap ≥ 10", (2098, 2146), 2098),
        ("No losholt", "the header is the top", None, 2156),
    ])
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(text)
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
