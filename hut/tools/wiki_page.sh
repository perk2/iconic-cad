#!/usr/bin/env bash
# hut/wiki/iconic_cad_design.md -> MediaWiki source, for the OSE wiki.
#
#   bash hut/tools/wiki_page.sh                      # prefix ic_hut_v2611_
#   PREFIX=ic_hut_v2703_ bash hut/tools/wiki_page.sh # for a later page version
#
# Writes hut/wiki/iconic_cad_design.wiki (paste it into the wiki page
# Iconic_cad_hut_v26.11) and copies the figures to hut/figures/wiki_upload/
# under their wiki file names, ready for Special:Upload. Wiki file names are
# global, so the prefix carries the page's version: a later version gets new
# files and leaves this page's figures alone. Headings are shifted one level
# down (sections at ===), so the page can wrap them in its own == sections. The Markdown stays
# the source: edit it and rerun. Needs pandoc and python3.
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
src="$root/hut/wiki/iconic_cad_design.md"
out="$root/hut/wiki/iconic_cad_design.wiki"
figures="$root/hut/wiki/figures"
upload="$root/hut/figures/wiki_upload"
prefix=${PREFIX:-ic_hut_v2611_}

# Post-processing (the program goes in with -c: stdin carries pandoc's output).
post=$(cat <<'PY'
import re, sys, pathlib
figures, prefix = pathlib.Path(sys.argv[1]), sys.argv[2]
text = sys.stdin.read()
# The document's own title (# heading, == after the shift): drop it.
text = re.sub(r'\A(<span id="[^"]*"></span>\n)?== [^\n]* ==\n', '', text)
# Heading anchors: the wiki makes its own from the headings.
text = re.sub(r'^<span id="[^"]*"></span>\n', '', text, flags=re.M)
# Code blocks as <pre>, which works without the SyntaxHighlight extension.
text = re.sub(r'<syntaxhighlight[^>]*>', '<pre>', text).replace('</syntaxhighlight>', '</pre>')

def width(name):
    """The figure's own width, at most 720 px."""
    path = figures / name
    if path.suffix == '.svg':
        m = re.search(r'viewBox="0 0 ([\d.]+) ', path.read_text())
        return min(720, round(float(m.group(1)))) if m else 720
    return 720

def image(m):
    name, alt = m.group(1), m.group(2)
    return f'\n[[File:{prefix}{name}|none|frameless|{width(name)}px|alt={alt}|{alt}]]\n'

text = re.sub(r'\[\[File:figures/([^|\]]+)\|([^\]]*)\]\]', image, text)
text = re.sub(r'\n{3,}', '\n\n', text)
sys.stdout.write(text.lstrip('\n'))
PY
)
pandoc -f gfm -t mediawiki --wrap=none --shift-heading-level-by=1 "$src" \
  | python3 -c "$post" "$figures" "$prefix" > "$out"

rm -rf "$upload"; mkdir -p "$upload"
grep -o "File:${prefix}[^|]*" "$out" | sed "s/^File:${prefix}//" | sort -u | while read -r name; do
  cp "$figures/$name" "$upload/$prefix$name"
done
echo "wrote ${out#$root/}"
echo "files to upload (hut/figures/wiki_upload/):"; ls "$upload" | sed 's/^/  /'
