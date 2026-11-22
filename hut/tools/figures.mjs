// Figures of the hut's modules and storey, as SVG, drawn from the library and
// the engine's model of the hut (derived modules included):
//
//   module_<variant>.svg   each wall variant, seen from outside (elevation)
//   module_floor.svg       the derived floor, in plan (framing; subfloor seams dashed)
//   module_wall_lines.svg  the four wall lines from outside, with the upper top plate
//   storey.svg             the whole storey, isometric, from the south-west
//   storey_framing.svg     the same without the sheets (framing only)
//   layout_graph.svg       the layout as entities and connections, beside the placed plan
//   corner_plan.svg        the south-east corner in plan: the two walls and the
//                          implementation's parts
//   assembly/NN.svg        frames: the engine building the model step by step
//                          (hut/tools/assembly_gif.sh makes the GIF)
//
//     node hut/tools/figures.mjs            # writes hut/figures/ (not committed)
//
// The figures used by hut/wiki/iconic_cad_design.md are also written to
// hut/wiki/figures/ (committed; regenerate, don't edit).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'hut', 'figures');
const { compileDesign } = await import(pathToFileURL(join(root, 'web/js/engine/compile_design.js')).href);
const solids = await import(pathToFileURL(join(root, 'web/js/library/solids.js')).href);
const asset = JSON.parse(readFileSync(join(root, 'web/assets/library.json'), 'utf8'));
const derived = {};
for (const [id, m] of Object.entries(asset.modules)) {
  if (m.derived) derived[id] = await import(pathToFileURL(join(root, 'library/modules', id, 'derive.js')).href);
}
const layout = JSON.parse(readFileSync(join(root, 'hut/hut.layout.json'), 'utf8'));
const model = compileDesign(layout, asset, { derived });
if (model.issues.length) throw new Error(JSON.stringify(model.issues, null, 1));

const FILL = {
  stud: '#E9D8B4', king: '#D9A95B', jack: '#C47F3A', cripple: '#A8C686', header: '#8A5A2B', sill: '#6E9FC9',
  bottom_plate: '#CBB48A', top_plate: '#CBB48A', sill_plate: '#A8A291', rim: '#CBB48A', joist: '#E9D8B4',
  blocking: '#C47F3A', bracing: '#D9C38C', subfloor: '#BFB6A0', rafter: '#C9A66B', ridge_board: '#8A5A2B', ceiling_joist: '#DCC9A0', lookout: '#B89A62',
};
const UPPER = '#B5651D'; // the upper top plate (derived)
const LINE = '#444441', DIM = '#5F5E5A';
const fill = p => (p.owner === 'storey' && p.role === 'top_plate' ? UPPER : FILL[p.role] ?? '#ddd');
const STYLE = '<style>text{font-family:system-ui,sans-serif;fill:#2C2C2A}.h{font-size:15px;font-weight:600}.s{font-size:11px}</style>';
const svg = (w, h, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" style="background:#fff" role="img"><title>${title}</title>${STYLE}${body}</svg>\n`;
const legend = (x, y, items, step = 150) => items.map(([color, label, dashed], i) => {
  const lx = x + (i % 4) * step, ly = y + Math.floor(i / 4) * 20;
  return `<rect x="${lx}" y="${ly}" width="12" height="12" fill="${color}" ${dashed ? 'fill-opacity="0.25" stroke-dasharray="3 2"' : ''} stroke="${LINE}" stroke-width="0.5"/><text class="s" x="${lx + 17}" y="${ly + 10}">${label}</text>`;
}).join('');
mkdirSync(out, { recursive: true });
const wikiOut = join(root, 'hut', 'wiki', 'figures');
mkdirSync(wikiOut, { recursive: true });
const WIKI = new Set(['module_1200.svg', 'module_window_10x12.svg', 'layout_graph.svg', 'corner_plan.svg',
  'storey_framing.svg', 'module_wall_lines.svg', 'module_floor.svg', 'roof_framing.svg']);
const write = (name, text) => {
  writeFileSync(join(out, name), text); console.log(`wrote hut/figures/${name}`);
  if (WIKI.has(name)) writeFileSync(join(wikiOut, name), text);
};

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
  const lines = [['line_S1', ['S1', 'S2', 'S3'], 'south'], ['line_E1', ['E1', 'E2'], 'east'],
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
// Seen from (-x, -y, +z). Each part is split into convex pieces (a box is
// one; a rafter is two or three: solids.js), and the pieces are drawn far to
// near: for two pieces that overlap on screen, a plane separates them (they
// don't overlap in space), and the one on the viewer's side of it is drawn
// later. Topological order; ties (and any cycle) by depth.
const VIEW = [-1, -1, 1];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const ISO_C = Math.cos(Math.PI / 6), ISO_S = Math.sin(Math.PI / 6);
const project = ([x, y, z]) => [(x - y) * ISO_C, -(z + (x + y) * ISO_S)]; // from the south-west, above

function drawables(parts) {
  return parts.flatMap(p => solids.pieces(solids.isSolid(p) ? p : { box: p.world }).map(faces => {
    const verts = [];
    for (const f of faces) for (const v of f.verts) if (!verts.some(w => Math.abs(w[0] - v[0]) + Math.abs(w[1] - v[1]) + Math.abs(w[2] - v[2]) < 1e-6)) verts.push(v);
    const dirs = [];
    const addDir = d => { const n = Math.hypot(...d); if (n < 1e-9) return; const u = d.map(x => x / n); if (!dirs.some(w => Math.abs(dot3(w, u)) > 1 - 1e-9)) dirs.push(u); };
    for (const f of faces) f.verts.forEach((v, i) => addDir(f.verts[(i + 1) % f.verts.length].map((x, k) => x - v[k])));
    const normals = [];
    for (const f of faces) if (!normals.some(w => Math.abs(dot3(w, f.normal)) > 1 - 1e-9)) normals.push(f.normal);
    const screen = verts.map(project);
    const box2 = [0, 1].map(k => [Math.min(...screen.map(q => q[k])), Math.max(...screen.map(q => q[k]))]);
    return { part: p, faces, verts, dirs, normals, box2, hull: hull2(screen), depth: verts.reduce((d, q) => d + dot3(q, VIEW), 0) / verts.length };
  }));
}

// -1 if a is behind b (draw a first), 1 if in front, 0 if no plane says.
// Only asked for pieces whose outlines overlap on screen; then every plane
// that separates them puts the same one on the viewer's side.
function compareDepth(a, b) {
  const axes = [...a.normals, ...b.normals];
  for (const u of a.dirs) for (const w of b.dirs) { const c = cross3(u, w); const n = Math.hypot(...c); if (n > 1e-9) axes.push(c.map(x => x / n)); }
  for (const n of axes) {
    const toward = dot3(n, VIEW);
    if (Math.abs(toward) < 1e-9) continue;
    const pa = a.verts.map(v => dot3(n, v)), pb = b.verts.map(v => dot3(n, v));
    if (Math.max(...pa) <= Math.min(...pb) + 1e-6) return toward > 0 ? -1 : 1; // a below b along n
    if (Math.max(...pb) <= Math.min(...pa) + 1e-6) return toward > 0 ? 1 : -1;
  }
  return 0;
}

// The convex hull of points in the plane (counter-clockwise).
function hull2(points) {
  const p = [...points].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  const turn = (o, u, v) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
  const half = list => { const h = []; for (const q of list) { while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); } h.pop(); return h; };
  return [...half(p), ...half(p.reverse())];
}

// The two outlines overlap by more than a hair (2D separating-axis test).
function outlinesOverlap(a, b) {
  for (const h of [a.hull, b.hull]) {
    for (let i = 0; i < h.length; i++) {
      const e = [h[(i + 1) % h.length][0] - h[i][0], h[(i + 1) % h.length][1] - h[i][1]];
      const n = [-e[1], e[0]];
      const len = Math.hypot(...n);
      if (len < 1e-9) continue;
      const pa = a.hull.map(q => (q[0] * n[0] + q[1] * n[1]) / len), pb = b.hull.map(q => (q[0] * n[0] + q[1] * n[1]) / len);
      if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= 1e-3) return false;
    }
  }
  return true;
}

function drawOrder(items) {
  const n = items.length;
  const lap = (p, q) => p[0] < q[1] - 1e-6 && q[0] < p[1] - 1e-6;
  const after = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!lap(items[i].box2[0], items[j].box2[0]) || !lap(items[i].box2[1], items[j].box2[1])) continue;
      if (!outlinesOverlap(items[i], items[j])) continue;
      const c = compareDepth(items[i], items[j]);
      if (c < 0) { after[i].push(j); indeg[j] += 1; } // i behind j: j drawn after i
      else if (c > 0) { after[j].push(i); indeg[i] += 1; }
    }
  }
  const order = [];
  const done = new Set();
  const ready = [...Array(n).keys()].filter(i => indeg[i] === 0);
  while (order.length < n) {
    if (!ready.length) { // a cycle: take the farthest
      const k = [...Array(n).keys()].filter(i => !done.has(i)).sort((p, q) => items[p].depth - items[q].depth)[0];
      ready.push(k); indeg[k] = 0;
    }
    ready.sort((p, q) => items[p].depth - items[q].depth);
    const i = ready.shift();
    if (done.has(i)) continue;
    done.add(i); order.push(items[i]);
    for (const k of after[i]) if (!done.has(k) && --indeg[k] === 0) ready.push(k);
  }
  return order;
}

function isometric(parts, title, all = parts, note = '') {
  const shade = (hex, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
  // A face toward the viewer, shaded as before: top 1.0, south 0.82, west 0.68.
  const tone = nrm => Math.min(1, 0.68 + 0.32 * Math.max(0, nrm[2]) + 0.14 * Math.max(0, -nrm[1]));
  const sorted = drawOrder(drawables(parts));
  const pts = drawables(all).flatMap(d => d.verts.map(project)); // the view: fixed by all
  const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]));
  const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
  const scale = 900 / (maxX - minX), pad = 30;
  const T = ([x, y]) => `${(pad + (x - minX) * scale).toFixed(1)},${(pad + 30 + (y - minY) * scale).toFixed(1)}`;
  const body = sorted.map(d => d.faces.filter(f => dot3(f.normal, VIEW) > 1e-9).map(f =>
    `<polygon points="${f.verts.map(project).map(T).join(' ')}" fill="${shade(fill(d.part), tone(f.normal))}" stroke="${LINE}" stroke-width="0.3"/>`).join('')).join('');
  const W = 900 + 2 * pad, H = (maxY - minY) * scale + 2 * pad + 80;
  return svg(W, H, body + `<text class="h" x="${pad}" y="22">${title}</text>` + (note ? `<text class="s" x="${pad}" y="40">${note}</text>` : '')
    + legend(pad, H - 46, [[UPPER, 'Upper top plate'], [FILL.joist, 'Joists'], [FILL.stud, 'Wall framing'], [FILL.rafter, 'Rafters'], [FILL.bracing, 'OSB']], 175), title);
}
write('storey.svg', isometric(model.parts, 'the hut: walls, upper top plate, floor and roof framing, from the south-west'));
write('storey_framing.svg', isometric(model.parts.filter(p => !p.layer), 'the hut\'s framing (sheets hidden), from the south-west'));
write('roof_framing.svg', isometric(model.parts.filter(p => p.owner === 'roof' || (p.owner === 'storey' && p.role === 'top_plate')),
  'the roof framing on the upper top plates: rafters, ridge board, ceiling joists, gable studs and ladders'));

// ---- the layout as a graph, beside the placed plan ---------------------------
// Left: what the layout stores (entities and connections, no coordinates),
// drawn on a circle in loop order. Right: where the engine placed them.
{
  const end = ref => ref.split('.')[0];
  const conns = layout.connections.map(c => c.interface === 'wall_corner'
    ? { id: c.id, kind: 'corner', a: end(c.through), b: end(c.butt), through: end(c.through) }
    : { id: c.id, kind: 'inline', a: end(c.a), b: end(c.b) });
  // Loop order from the anchor.
  const order = [layout.anchor.entity];
  while (order.length < layout.entities.length) {
    const last = order[order.length - 1];
    const c = conns.find(k => (k.a === last && !order.includes(k.b)) || (k.b === last && !order.includes(k.a)));
    if (!c) break;
    order.push(c.a === last ? c.b : c.a);
  }
  const cx = 290, cy = 290, R = 175;
  const at = Object.fromEntries(order.map((id, i) => {
    const a = Math.PI / 2 + (2 * Math.PI * i) / order.length; // anchor at the bottom
    return [id, [cx - R * Math.cos(a), cy + R * Math.sin(a)]];
  }));
  const moduleOf = Object.fromEntries(layout.entities.map(e => [e.id, e]));
  const PANEL = '#E9D8B4', OPENING = '#A8C686', CORNER = '#B5651D';
  let body = `<text class="h" x="20" y="24">What the layout stores</text>`
    + `<text class="s" x="20" y="42">entities and connections, no coordinates</text>`;
  for (const c of conns) {
    const [x1, y1] = at[c.a], [x2, y2] = at[c.b];
    const corner = c.kind === 'corner';
    body += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${corner ? CORNER : LINE}" stroke-width="${corner ? 2.5 : 1.2}"/>`;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const r = Math.hypot(mx - cx, my - cy), out = (r + 30) / r;
    const lx = cx + (mx - cx) * out, ly = cy + (my - cy) * out;
    const anchor = lx < cx - 40 ? 'end' : lx > cx + 40 ? 'start' : 'middle';
    const lines = corner ? ['corner', `${c.through} through`] : ['inline'];
    body += lines.map((t, k) => `<text class="s" x="${lx.toFixed(1)}" y="${(ly + 4 + (k - (lines.length - 1) / 2) * 13).toFixed(1)}" text-anchor="${anchor}" fill="${corner ? CORNER : DIM}">${t}</text>`).join('');
  }
  for (const id of order) {
    const [x, y] = at[id], e = moduleOf[id];
    const opening = e.module !== 'wall_panel';
    body += `<rect x="${(x - 46).toFixed(1)}" y="${(y - 20).toFixed(1)}" width="92" height="40" rx="6" fill="${opening ? OPENING : PANEL}" stroke="${LINE}" stroke-width="${id === layout.anchor.entity ? 2.5 : 0.8}"/>`
      + `<text class="h" x="${x.toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="middle">${id}</text>`
      + `<text class="s" x="${x.toFixed(1)}" y="${(y + 13).toFixed(1)}" text-anchor="middle">${e.variant}</text>`;
  }
  const [ax, ay] = at[layout.anchor.entity];
  body += `<text class="s" x="${ax.toFixed(1)}" y="${(ay + 36).toFixed(1)}" text-anchor="middle">anchor</text>`;

  // The placed plan: each entity's footprint from its parts, north up.
  const ox = 590, scale = 0.095, top = 80;
  const foot = id => {
    const ps = model.parts.filter(p => p.owner === id);
    return { min: [0, 1].map(i => Math.min(...ps.map(p => p.world.min[i]))), max: [0, 1].map(i => Math.max(...ps.map(p => p.world.max[i]))) };
  };
  const fs = Object.fromEntries(order.map(id => [id, foot(id)]));
  const lo = [0, 1].map(i => Math.min(...Object.values(fs).map(f => f.min[i])));
  const hi = [0, 1].map(i => Math.max(...Object.values(fs).map(f => f.max[i])));
  const X = x => ox + (x - lo[0]) * scale, Y = y => top + 40 + (hi[1] - y) * scale;
  body += `<text class="h" x="${ox}" y="24">What the engine works out</text>`
    + `<text class="s" x="${ox}" y="42">positions, by walking the connections from the anchor</text>`;
  for (const id of order) {
    const f = fs[id], e = moduleOf[id];
    const w = (f.max[0] - f.min[0]) * scale, h = (f.max[1] - f.min[1]) * scale;
    body += `<rect x="${X(f.min[0]).toFixed(1)}" y="${Y(f.max[1]).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${e.module !== 'wall_panel' ? OPENING : PANEL}" stroke="${LINE}" stroke-width="${id === layout.anchor.entity ? 2 : 0.8}"/>`;
    const tx = X((f.min[0] + f.max[0]) / 2), ty = Y((f.min[1] + f.max[1]) / 2);
    const horizontal = w > h;
    const dx = horizontal ? 0 : (f.min[0] < (lo[0] + hi[0]) / 2 ? -24 : 24), dy = horizontal ? (f.min[1] < (lo[1] + hi[1]) / 2 ? 26 : -14) : 4;
    body += `<text class="s" x="${(tx + dx).toFixed(1)}" y="${(ty + dy).toFixed(1)}" text-anchor="middle">${id}</text>`;
  }
  body += `<text class="s" x="${ox}" y="${(Y(lo[1]) + 50).toFixed(1)}">${hi[0] - lo[0]} × ${hi[1] - lo[1]} mm outside, north up</text>`;
  body += legend(20, 540, [[PANEL, 'wall_panel'], [OPENING, 'wall_panel_with_opening'], [CORNER, 'wall_corner'], [LINE, 'wall_inline']], 210);
  write('layout_graph.svg', svg(ox + (hi[0] - lo[0]) * scale + 50, 570, body, 'the layout and the placed plan'));
}

// ---- the south-east corner, in plan -------------------------------------------
// A horizontal section at mid height through the corner where S3 (the south
// wall) runs through and E1 (the east wall) butts: the parts cut there, over
// the bottom plates (faint) that show where each wall runs, and the parts the
// corner's implementation (california) adds, fitted on site.
{
  const c = layout.connections.find(k => k.id === 'c_se');
  const through = c.through.split('.')[0], butt = c.butt.split('.')[0];
  const ends = model.parts.filter(p => [through, butt].includes(p.owner));
  const east = Math.max(...ends.filter(p => !p.layer).map(p => p.world.max[0])); // the framing's outer corner
  const z = 1000, lo = [east - 560, -20], hi = [east + 20, 560];
  const inView = p => p.world.max[0] > lo[0] && p.world.min[0] < hi[0] && p.world.max[1] > lo[1] && p.world.min[1] < hi[1]
    && [through, butt, c.id].includes(p.owner);
  const cut = model.parts.filter(p => inView(p) && p.world.min[2] <= z && p.world.max[2] >= z);
  const plates = model.parts.filter(p => inView(p) && p.role === 'bottom_plate');
  const scale = 0.8, padL = 40, padR = 150, top = 80;
  const X = x => padL + (x - lo[0]) * scale, Y = y => top + (hi[1] - y) * scale;
  const clip = b => ({ min: [Math.max(b.min[0], lo[0]), Math.max(b.min[1], lo[1])], max: [Math.min(b.max[0], hi[0]), Math.min(b.max[1], hi[1])] });
  const rect = (b, attrs) => { b = clip(b); return `<rect x="${X(b.min[0]).toFixed(1)}" y="${Y(b.max[1]).toFixed(1)}" width="${((b.max[0] - b.min[0]) * scale).toFixed(1)}" height="${((b.max[1] - b.min[1]) * scale).toFixed(1)}" ${attrs}/>`; };
  const IMPL = '#B5651D', THROUGH = '#E9D8B4', BUTT = '#C9D9E8';
  const colour = p => (p.owner === c.id ? IMPL : p.layer ? FILL.bracing : p.owner === through ? THROUGH : BUTT);
  let body = plates.map(p => rect(p.world, `fill="${p.owner === through ? THROUGH : BUTT}" fill-opacity="0.45" stroke="${DIM}" stroke-width="0.5" stroke-dasharray="4 3"`)).join('')
    + [...cut].sort((a, b) => (a.owner === c.id) - (b.owner === c.id))
      .map(p => rect(p.world, `fill="${colour(p)}" stroke="${LINE}" stroke-width="${p.owner === c.id ? 1.5 : 0.6}"`)).join('');
  const W = (hi[0] - lo[0]) * scale + padL + padR, H = (hi[1] - lo[1]) * scale + top + 80;
  const impl = Object.fromEntries(cut.filter(p => p.owner === c.id).map(p => [p.id.split('/')[1], p]));
  const leader = (x1, y1, x2, y2, text, anchor) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${IMPL}" stroke-width="0.8"/>`
    + `<text class="s" x="${(x2 + (anchor === 'start' ? 4 : 0)).toFixed(1)}" y="${(y2 + (anchor === 'middle' ? -4 : 4)).toFixed(1)}" fill="${IMPL}" text-anchor="${anchor}">${text}</text>`;
  if (impl.turned_stud) { // label up into the room
    const b = clip(impl.turned_stud.world), x = X((b.min[0] + b.max[0]) / 2);
    body += leader(x, Y(b.max[1]), x, Y(b.max[1]) - 50, 'turned stud', 'middle');
  }
  if (impl.sheathing_strip) { // label out to the east
    const b = clip(impl.sheathing_strip.world), y = Y((b.min[1] + b.max[1]) / 2);
    body += leader(X(b.max[0]), y, X(hi[0]) + 30, y, 'OSB strip', 'start');
  }
  body += `<text class="h" x="20" y="24">The corner ${c.id} in plan, cut at ${z} mm</text>`
    + `<text class="s" x="20" y="42">${through} runs through (the south wall, along the bottom); ${butt} butts against it (the east wall, going up)</text>`
    + `<text class="s" x="${X(east - 280)}" y="${Y(lo[1]) + 18}" text-anchor="middle">outside (south)</text>`
    + `<text class="s" x="${X(hi[0]) + 10}" y="${Y(420)}">outside (east)</text>`
    + legend(20, H - 30, [[THROUGH, `${through}: through wall`], [BUTT, `${butt}: butt wall`], [FILL.bracing, 'OSB, workshop'], [IMPL, 'california: site parts']], 165);
  write('corner_plan.svg', svg(Math.max(W, 680), H, body, 'wall corner in plan'));
}

// ---- frames: the engine building the model ----------------------------------
// One frame per step, all in the same view: the anchor, then each entity as
// the walk reaches it through a connection (with the connection's
// implementation parts once both ends are placed), then the derived modules.
{
  const dir = join(out, 'assembly');
  mkdirSync(dir, { recursive: true });
  const ends = c => (c.interface === 'wall_corner' ? [c.through, c.butt] : [c.a, c.b]).map(r => r.split('.')[0]);
  const placed = [layout.anchor.entity];
  const steps = [{ title: `1. The anchor: ${layout.anchor.entity}`, note: 'placed at the origin, facing south' }];
  const used = new Set();
  while (placed.length < layout.entities.length) {
    const c = layout.connections.find(k => !used.has(k.id) && ends(k).some(e => placed.includes(e)) && ends(k).some(e => !placed.includes(e)));
    if (!c) break;
    used.add(c.id);
    const next = ends(c).find(e => !placed.includes(e));
    placed.push(next);
    const kind = c.interface === 'wall_corner' ? `corner, ${ends(c)[0]} through` : 'inline';
    steps.push({ title: `${steps.length + 1}. ${next}, placed by ${c.id} (${kind})`, note: 'the interface\'s rule gives its position; corner parts come with both walls' });
  }
  const frames = [];
  const partsAt = entities => model.parts.filter(p => {
    if (entities.includes(p.owner)) return true;
    const c = layout.connections.find(k => k.id === p.owner);
    return c ? ends(c).every(e => entities.includes(e)) : false;
  });
  steps.forEach((s, i) => frames.push([s.title, s.note, partsAt(placed.slice(0, i + 1))]));
  const walls = partsAt(placed);
  const plate = model.parts.filter(p => p.owner === 'storey' && !p.id.startsWith('storey/floor/'));
  frames.push([`${frames.length + 1}. Derived: wall lines`, 'the upper top plate, from the panels along each line', [...walls, ...plate]]);
  frames.push([`${frames.length + 1}. Derived: the floor`, 'from the walls\' framing loop', model.parts.filter(p => p.owner !== 'roof')]);
  frames.push([`${frames.length + 1}. Derived: the roof`, 'rafters, ridge board and ceiling joists on the plates; the model is complete', model.parts]);
  frames.forEach(([title, note, parts], i) => {
    const name = `${String(i + 1).padStart(2, '0')}.svg`;
    writeFileSync(join(dir, name), isometric(parts, title, model.parts, note));
  });
  console.log(`wrote hut/figures/assembly/: ${frames.length} frames`);
}


