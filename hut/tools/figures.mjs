// Figures of the hut's modules and storey, as SVG, drawn from the library and
// the engine's model of the hut (derived modules included):
//
//   module_<variant>.svg   each wall variant, seen from outside (elevation)
//   module_floor.svg       the derived floor, in plan (framing; subfloor seams dashed)
//   module_wall_lines.svg  the four wall lines from outside, with the upper top plate
//   storey.svg             the whole storey, isometric, from the south-west
//   storey_framing.svg     the same without the sheets (framing only)
//
//     node hut/tools/figures.mjs            # writes hut/figures/ (not committed)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'hut', 'figures');
const { compileDesign } = await import(pathToFileURL(join(root, 'web/js/engine/compile_design.js')).href);
const asset = JSON.parse(readFileSync(join(root, 'web/assets/library.json'), 'utf8'));
const derived = {};
for (const [id, m] of Object.entries(asset.modules)) {
  if (m.derived) derived[id] = await import(pathToFileURL(join(root, 'library/modules', id, 'derive.js')).href);
}
const layout = { ...JSON.parse(readFileSync(join(root, 'tests/fixtures/engine/hut_openings.json'), 'utf8')), derive: { module: 'storey' } };
const model = compileDesign(layout, asset, { derived });
if (model.issues.length) throw new Error(JSON.stringify(model.issues, null, 1));

const FILL = {
  stud: '#E9D8B4', king: '#D9A95B', jack: '#C47F3A', cripple: '#A8C686', header: '#8A5A2B', sill: '#6E9FC9',
  bottom_plate: '#CBB48A', top_plate: '#CBB48A', sill_plate: '#A8A291', rim: '#CBB48A', joist: '#E9D8B4',
  blocking: '#C47F3A', bracing: '#D9C38C', subfloor: '#BFB6A0',
};
const UPPER = '#B5651D'; // the upper top plate (derived)
const LINE = '#444441', DIM = '#5F5E5A';
const fill = p => (p.owner === 'storey' && p.role === 'top_plate' ? UPPER : FILL[p.role] ?? '#ddd');
const STYLE = '<style>text{font-family:system-ui,sans-serif;fill:#2C2C2A}.h{font-size:15px;font-weight:600}.s{font-size:11px}</style>';
const svg = (w, h, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" style="background:#fff" role="img"><title>${title}</title>${STYLE}${body}</svg>\n`;
const legend = (x, y, items) => items.map(([color, label, dashed], i) => {
  const lx = x + (i % 4) * 150, ly = y + Math.floor(i / 4) * 20;
  return `<rect x="${lx}" y="${ly}" width="12" height="12" fill="${color}" ${dashed ? 'fill-opacity="0.25" stroke-dasharray="3 2"' : ''} stroke="${LINE}" stroke-width="0.5"/><text class="s" x="${lx + 17}" y="${ly + 10}">${label}</text>`;
}).join('');
mkdirSync(out, { recursive: true });
const write = (name, text) => { writeFileSync(join(out, name), text); console.log(`wrote hut/figures/${name}`); };

// ---- elevations: x along, z up; parts drawn far to near ------------------
// boxes: [{box, fill, dashed}], u: index of the horizontal axis, depth: a
// function giving the drawing order (smaller first).
function elevation(items, u, { scale, x0, z0, ox, oy }) {
  const H = items.reduce((m, it) => Math.max(m, it.box.max[2]), 0);
  return items.map(it => {
    const b = it.box;
    const x = ox + (b.min[u] - x0) * scale, w = (b.max[u] - b.min[u]) * scale;
    const y = oy + (H - b.max[2] + z0) * scale, h = (b.max[2] - b.min[2]) * scale;
    const style = it.dashed ? `fill="${it.fill}" fill-opacity="0.18" stroke="${DIM}" stroke-dasharray="3 2"` : `fill="${it.fill}" stroke="${LINE}"`;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" ${style} stroke-width="0.5"/>`;
  }).join('');
}

// Each wall variant seen from outside, with its OSB as a dashed outline: its
// own parts (no upper top plate: it belongs to the wall line).
for (const [moduleId, m] of Object.entries(asset.modules)) {
  if (m.derived) continue;
  for (const v of m.systems.seh_no.variants) {
    const scale = 0.22, pad = 40;
    const W = v.size.width * scale + 2 * pad, H = v.size.height * scale + 2 * pad + 60;
    const items = [...v.parts].sort((a, b) => a.box.min[1] - b.box.min[1])
      .map(p => ({ box: p.box, fill: FILL[p.role] ?? '#ddd', dashed: !!p.layer }));
    const body = elevation(items, 0, { scale, x0: 0, z0: 0, ox: pad, oy: pad })
      + `<text class="h" x="${pad}" y="22">${moduleId} / ${v.name}</text>`
      + `<text class="s" x="${pad}" y="${H - 38}">${v.size.width} × ${v.size.height}, seen from outside, OSB dashed;</text>`
      + `<text class="s" x="${pad}" y="${H - 22}">the upper top plate comes with the wall line</text>`;
    write(`module_${v.name}.svg`, svg(W, H, body, `${moduleId} ${v.name}`));
  }
}

// ---- the floor, in plan ---------------------------------------------------
{
  const parts = model.parts.filter(p => p.id.startsWith('storey/floor/'));
  const lo = [0, 1].map(i => Math.min(...parts.map(p => p.world.min[i])));
  const hi = [0, 1].map(i => Math.max(...parts.map(p => p.world.max[i])));
  const scale = 0.2, pad = 40;
  const W = (hi[0] - lo[0]) * scale + 2 * pad, H = (hi[1] - lo[1]) * scale + 2 * pad + 70;
  const X = x => pad + (x - lo[0]) * scale, Y = y => pad + 30 + (hi[1] - y) * scale; // north up
  const rect = (b, attrs) => `<rect x="${X(b.min[0]).toFixed(1)}" y="${Y(b.max[1]).toFixed(1)}" width="${((b.max[0] - b.min[0]) * scale).toFixed(1)}" height="${((b.max[1] - b.min[1]) * scale).toFixed(1)}" ${attrs}/>`;
  const framing = parts.filter(p => !p.layer).sort((a, b) => a.world.min[2] - b.world.min[2]);
  // The studs of the walls standing on the floor, for the blocking under them.
  const studs = model.parts.filter(p => ['stud', 'king', 'jack'].includes(p.role) && p.world.min[2] === 48 && !p.id.startsWith('storey/'));
  let body = framing.map(p => rect(p.world, `fill="${fill(p)}" stroke="${LINE}" stroke-width="0.5"`)).join('')
    + parts.filter(p => p.layer).map(p => rect(p.world, `fill="none" stroke="${DIM}" stroke-width="0.8" stroke-dasharray="5 3"`)).join('')
    + studs.map(p => rect(p.world, `fill="${LINE}" fill-opacity="0.35" stroke="none"`)).join('');
  body += `<text class="h" x="${pad}" y="22">floor (derived from the walls), in plan, north up</text>`
    + legend(pad, H - 40, [[FILL.sill_plate, 'Sill'], [FILL.rim, 'Rim'], [FILL.joist, 'Joist'], [FILL.blocking, 'Blocking'],
      [DIM, 'Subfloor (seams)', true], [LINE, 'Wall studs above']]);
  write('module_floor.svg', svg(W, H, body, 'floor, derived'));
}

// ---- the wall lines, seen from outside ------------------------------------
// Each line drawn left to right as seen from outside (the panels' own
// convention): s along the run from the first panel's left end.
{
  const lines = [['line_S1', ['S1', 'S2'], 'south'], ['line_E1', ['E1', 'E2'], 'east'],
    ['line_N1', ['N1', 'N2', 'N3'], 'north'], ['line_W1', ['W1', 'W2'], 'west']];
  const scale = 0.16, pad = 40, rowH = 2400 * scale + 70;
  let body = `<text class="h" x="${pad}" y="22">wall lines from outside (OSB dashed), with the derived upper top plate</text>`;
  let W = 0;
  lines.forEach(([line, panels, name], i) => {
    const first = model.entities.find(e => e.id === panels[0]).transform;
    const dir = [0, 1, 2].map(k => first.m[k][0]);
    const sOf = q => [0, 1, 2].reduce((n, k) => n + (q[k] - first.t[k]) * dir[k], 0);
    const toLine = b => {
      const a = sOf(b.min), c = sOf(b.max);
      return { min: [Math.min(a, c), 0, b.min[2]], max: [Math.max(a, c), 0, b.max[2]] };
    };
    const parts = model.parts.filter(p => panels.some(id => p.owner === id) || p.id.startsWith(`storey/${line}/`));
    const items = parts.map(p => ({ box: toLine(p.world), fill: fill(p), dashed: !!p.layer, layer: !!p.layer }))
      .sort((a, b) => b.layer - a.layer);
    const lo = Math.min(...items.map(it => it.box.min[0])), hi = Math.max(...items.map(it => it.box.max[0]));
    const oy = 40 + i * rowH;
    body += elevation(items, 0, { scale, x0: lo, z0: 0, ox: pad, oy: oy + 18 });
    const pieces = model.parts.filter(p => p.id.startsWith(`storey/${line}/`)).map(p => toLine(p.world))
      .sort((a, b) => a.min[0] - b.min[0]).map(b => b.max[0] - b.min[0]);
    body += `<text class="s" x="${pad}" y="${oy + 10}">${name}: ${panels.join(' + ')}; upper top plate ${pieces.join(' + ')}</text>`;
    W = Math.max(W, (hi - lo) * scale + 2 * pad);
  });
  body += legend(pad, 40 + lines.length * rowH, [[UPPER, 'Upper top plate'], [FILL.top_plate, 'Plates'], [FILL.stud, 'Stud'], [FILL.bracing, 'OSB', true]]);
  write('module_wall_lines.svg', svg(Math.max(W, 760), 40 + lines.length * rowH + 40, body, 'wall lines'));
}

// ---- the storey, isometric --------------------------------------------------
// Painter's order for boxes seen from (-x, -y, +z): a box is drawn after
// every box it hides. A hides B when they're separated along an axis with A
// on the viewer's side (smaller x, smaller y, or above) and their outlines
// on screen overlap. Topological order; ties (and any cycle) by depth.
function drawOrder(parts) {
  const n = parts.length;
  const b = parts.map(p => p.world);
  const depth = i => b[i].min[0] + b[i].max[0] + b[i].min[1] + b[i].max[1] - b[i].min[2] - b[i].max[2];
  const sep = (i, j) => b[i].max[0] <= b[j].min[0] || b[i].max[1] <= b[j].min[1] || b[i].min[2] >= b[j].max[2];
  // Screen outlines: x - y and x + y + z ranges (iso screen coordinates).
  const u = i => [b[i].min[0] - b[i].max[1], b[i].max[0] - b[i].min[1]];
  const v = i => [b[i].min[0] + b[i].min[1] + b[i].min[2], b[i].max[0] + b[i].max[1] + b[i].max[2]];
  const w = i => [b[i].min[0] - b[i].max[2], b[i].max[0] - b[i].min[2]];
  const lap = (p, q) => p[0] < q[1] && q[0] < p[1];
  const after = Array.from({ length: n }, () => []); // j drawn after i
  const indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j || !lap(u(i), u(j)) || !lap(v(i), v(j)) || !lap(w(i), w(j))) continue;
      if (sep(i, j) && !sep(j, i)) { after[j].push(i); indeg[i] += 1; } // i in front of j: draw j first
    }
  }
  const order = [];
  const ready = [...Array(n).keys()].filter(i => indeg[i] === 0);
  const done = new Set();
  while (order.length < n) {
    if (!ready.length) { // a cycle: take the farthest left
      const k = [...Array(n).keys()].filter(i => !done.has(i)).sort((p, q) => depth(q) - depth(p))[0];
      ready.push(k); indeg[k] = 0;
    }
    ready.sort((p, q) => depth(q) - depth(p));
    const i = ready.shift();
    if (done.has(i)) continue;
    done.add(i); order.push(parts[i]);
    for (const k of after[i]) if (!done.has(k) && --indeg[k] === 0) ready.push(k);
  }
  return order;
}

function isometric(parts, title) {
  const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  const P = ([x, y, z]) => [(x - y) * c, -(z + (x + y) * s)]; // from the south-west, above
  const faces = b => {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    return [
      [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 1.0], // top
      [[[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0.82], // south face
      [[[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], 0.68], // west face
    ];
  };
  const shade = (hex, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
  const sorted = drawOrder(parts);
  const pts = sorted.flatMap(p => faces(p.world).flatMap(([f]) => f.map(P)));
  const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]));
  const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
  const scale = 900 / (maxX - minX), pad = 30;
  const T = ([x, y]) => `${(pad + (x - minX) * scale).toFixed(1)},${(pad + 30 + (y - minY) * scale).toFixed(1)}`;
  const body = sorted.map(p => faces(p.world).map(([f, k]) =>
    `<polygon points="${f.map(P).map(T).join(' ')}" fill="${shade(fill(p), k)}" stroke="${LINE}" stroke-width="0.3"/>`).join('')).join('');
  const W = 900 + 2 * pad, H = (maxY - minY) * scale + 2 * pad + 60;
  return svg(W, H, body + `<text class="h" x="${pad}" y="22">${title}</text>`
    + legend(pad, H - 26, [[UPPER, 'Upper top plate'], [FILL.joist, 'Floor framing'], [FILL.stud, 'Wall framing'], [FILL.bracing, 'OSB']]), title);
}
write('storey.svg', isometric(model.parts, 'the hut\'s storey: walls, upper top plate and floor, from the south-west'));
write('storey_framing.svg', isometric(model.parts.filter(p => !p.layer), 'the hut\'s storey, framing only (sheets hidden), from the south-west'));
