"""Draw the hut's south-west wall corner in plan (north up, mm), as an SVG.

    python3 hut/tools/corner.py today -o hut/figures/corner_sw.svg
    python3 hut/tools/corner.py proposed -o hut/figures/corner_sw_proposed.svg

Hand-drawn sketches for the book review (review_vs_books.md, C1 to C3), not
read from the model:

- today: the corner as the model built it before the California corner
  (feee928; hut.json, plan at z = 1000): the through wall's framing runs out
  to the butt wall's OSB face, and the backer closes a box behind the butt
  wall's end stud;
- proposed: the framing flush at the outer corner, with the two inner-corner
  variants from the book side by side (an extra stud, and the turned stud,
  the California corner), and the OSB strip fitted on site.
"""

import argparse
from pathlib import Path

OSB, STUD, NEW, STRIP, RED = "#D9C38C", "#E9D8B4", "#C47F3A", "#9FC3E6", "#E24B4A"


def today():
    s, m, r = 2.6, 50, 260  # px per mm, margin, mm shown

    def x_(x):
        return m + x * s

    def y_(y):
        return m + (r - y) * s

    parts = [
        (0, 0, 260, 12, OSB),      # S1 OSB (through wall)
        (0, 12, 48, 160, STUD),    # S1 end stud
        (112, 12, 160, 160, NEW),  # backer (c_sw)
        (0, 160, 12, 260, OSB),    # W2 OSB (butt wall)
        (12, 160, 160, 208, STUD),  # W2 end stud
    ]
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {2 * m + r * s + 260} {2 * m + r * s + 30}" '
        'font-family="system-ui,sans-serif" font-size="13">',
        '<rect width="100%" height="100%" fill="#fff"/>',
        f'<text x="{m}" y="22" font-size="15" font-weight="600">South-west corner, plan at z = 1000 '
        "(model today, hut.json). North up, mm.</text>",
    ]
    for x0, y0, x1, y1, c in parts:
        out.append(f'<rect x="{x_(x0)}" y="{y_(y1)}" width="{(x1 - x0) * s}" height="{(y1 - y0) * s}" '
                   f'fill="{c}" stroke="#444" stroke-width="1"/>')
    out.append(f'<rect x="{x_(48)}" y="{y_(160)}" width="{64 * s}" height="{148 * s}" fill="none" '
               f'stroke="{RED}" stroke-dasharray="5 4" stroke-width="1.5"/>')
    out.append(f'<text x="{x_(54)}" y="{y_(90)}" fill="{RED}">closed box</text>')
    out.append(f'<text x="{x_(54)}" y="{y_(90) + 16}" fill="{RED}">48–112</text>')
    for t, x, y in [("S1 OSB 12 (through wall, south)", 120, 4), ("S1 end stud 0–48", 4, 100),
                    ("backer 112–160", 113, 40), ("W2 end stud (butt wall, west)", 30, 186), ("W2 OSB", 1, 240)]:
        out.append(f'<text x="{x_(x)}" y="{y_(y)}">{t}</text>')
    out.append(f'<text x="{x_(r) + 10}" y="{y_(250)}" font-weight="600">Outer corner:</text>')
    notes = ["The through wall's framing runs to x = 0,", "the outer face of the butt wall's OSB.",
             "The butt wall's framing starts at x = 12.", "On the west face, from y 12 to 160,",
             "the S1 end stud's end shows (no OSB).", "", "Inner corner:", "a backer in the through wall,",
             "64 from the end stud, which closes", "a box (dashed)."]
    for i, t in enumerate(notes):
        out.append(f'<text x="{x_(r) + 10}" y="{y_(250) + 20 + i * 17}">{t}</text>')
    for v in (0, 12, 48, 112, 160, 208):
        out.append(f'<text x="{x_(v) - 6}" y="{y_(0) + 18}" font-size="11" fill="#555">{v}</text>')
    for v in (0, 12, 160, 208):
        out.append(f'<text x="{x_(0) - 30}" y="{y_(v) + 4}" font-size="11" fill="#555">{v}</text>')
    out.append(f'<text x="{x_(130)}" y="{y_(0) + 32}" fill="#555">x →</text>'
               f'<text x="8" y="{y_(130)}" fill="#555">y ↑</text>')
    out.append("</svg>")
    return "\n".join(out)


def proposed():
    s, r, m, gap = 2.2, 260, 44, 90
    w = r * s
    common = [
        (12, 12, 60, 160, STUD, "S1 end stud 12–60"),
        (12, 160, 160, 208, STUD, "W2 end stud"),
        (0, 0, 260, 12, OSB, None),
        (0, 160, 12, 260, OSB, None),
        (0, 12, 12, 160, STRIP, None),
    ]
    variants = {1: [(160, 12, 208, 160, NEW, "extra stud 160–208")],
                2: [(60, 112, 208, 160, NEW, "turned stud 60–208")]}
    title = {1: "Variant 1: extra stud in the through wall",
             2: "Variant 2: California corner (turned stud)"}
    foot = {1: ["S1 lining: nailing on the extra stud (y 160, x 160–208)",
                "W2 lining: nailing on W2's end stud (x 160)",
                "W2's end stud nails into S1's end stud (48 face)",
                "Closed box x 60–160"],
            2: ["S1 lining: nailing on the turned stud (x 160–208)",
                "W2 lining: nailing on W2's end stud (x 160)",
                "Turned stud nailed to both end studs",
                "Open to S1's cavity"]}
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {2 * w + gap + 2 * m} {w + 2 * m + 150}" '
        'font-family="system-ui,sans-serif" font-size="12">',
        '<rect width="100%" height="100%" fill="#fff"/>',
        f'<text x="{m}" y="20" font-size="15" font-weight="600">South-west corner, proposed: framing flush '
        "at the outer corner (plan, north up, mm)</text>",
    ]
    for k, ox in ((1, m), (2, m + w + gap)):
        def x_(x, ox=ox):
            return ox + x * s

        def y_(y):
            return m + 20 + (r - y) * s

        out.append(f'<text x="{ox}" y="{m + 12}" font-weight="600">{title[k]}</text>')
        for x0, y0, x1, y1, c, label in common + variants[k]:
            out.append(f'<rect x="{x_(x0)}" y="{y_(y1)}" width="{(x1 - x0) * s}" height="{(y1 - y0) * s}" '
                       f'fill="{c}" stroke="#444"/>')
            if label:
                out.append(f'<text x="{x_(x0) + 4}" y="{y_((y0 + y1) / 2) + 4}">{label}</text>')
        out.append(f'<text x="{x_(150)}" y="{y_(4)}">S1 OSB</text><text x="{x_(16)}" y="{y_(240)}">W2 OSB</text>')
        out.append(f'<line x1="{x_(160)}" y1="{y_(160)}" x2="{x_(260)}" y2="{y_(160)}" stroke="#888" '
                   f'stroke-dasharray="4 3"/><line x1="{x_(160)}" y1="{y_(160)}" x2="{x_(160)}" '
                   f'y2="{y_(260)}" stroke="#888" stroke-dasharray="4 3"/>')
        out.append(f'<text x="{x_(190)}" y="{y_(220)}" fill="#666">room</text>')
        for i, t in enumerate(foot[k]):
            out.append(f'<text x="{ox}" y="{y_(0) + 22 + i * 16}">{t}</text>')
    y = m + 20 + r * s + 22 + 4 * 16 + 14
    out.append(f'<rect x="{m}" y="{y - 11}" width="14" height="14" fill="{STRIP}" stroke="#444"/>'
               f'<text x="{m + 20}" y="{y}">Corner OSB strip, x 0–12, y 12–160, fitted on site: covers '
               "S1's end stud on the west face (review C3, to revisit).</text>")
    out.append("</svg>")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("which", choices=["today", "proposed"])
    ap.add_argument("-o", "--out", help="write to this file instead of stdout")
    args = ap.parse_args()
    svg = today() if args.which == "today" else proposed()
    if args.out:
        Path(args.out).write_text(svg)
    else:
        print(svg, end="")


if __name__ == "__main__":
    main()
