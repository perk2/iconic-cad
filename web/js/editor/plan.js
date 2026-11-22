// The plan view: the editor's editing surface (hut/design/ic_editor.md, 4.2
// and 8). Draws the model from above (north up), each placed block's parts
// and its outline, the free ports, and the ghost of the block about to be
// placed. Reports the pointer and clicks in plan coordinates (x east, y
// north, mm). Wheel zooms, dragging pans; fit() frames the model again.

import { apply } from '../engine/affine.js';

const NS = 'http://www.w3.org/2000/svg';
const FILL = {
  stud: '#e9d8b4', king: '#d9a95b', jack: '#c47f3a', cripple: '#a8c686', header: '#8a5a2b', sill: '#6e9fc9',
  bottom_plate: '#cbb48a', top_plate: '#cbb48a', bracing: '#d9c38c',
};

/**
 * @param {SVGSVGElement} svg
 * @param {{onPointer: (at: number[]|null) => void, onClick: (at: number[], entity: string|null) => void}} handlers
 */
export function createPlan(svg, handlers) {
  let view = null; // {x, y, w, h} in plan coordinates
  let userView = false; // the user zoomed or panned: keep it across redraws
  let lastBounds = null;

  const el = (name, attrs = {}, parent = null) => {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (parent) parent.appendChild(e);
    return e;
  };
  const setView = v => { view = v; svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); };
  const fitTo = b => {
    const r = svg.getBoundingClientRect();
    const aspect = r.width > 0 && r.height > 0 ? r.width / r.height : 1.5;
    const pad = Math.max(b.w, b.h) * 0.15 + 400;
    let w = b.w + 2 * pad, h = b.h + 2 * pad;
    if (w / h < aspect) w = h * aspect; else h = w / aspect;
    setView({ x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h });
  };

  // Zoom and pan.
  svg.addEventListener('wheel', e => {
    if (!view) return;
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const k = Math.exp(e.deltaY * 0.0015);
    const w = view.w * k, h = view.h * k;
    setView({ x: view.x + (view.w - w) * fx, y: view.y + (view.h - h) * fy, w, h });
    userView = true;
  }, { passive: false });
  // The pointer in plan coordinates (x east, y north).
  const toPlan = e => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return [p.x, -p.y];
  };
  let drag = null;
  svg.addEventListener('pointerdown', e => {
    if (!view || e.button !== 0) return;
    const entity = e.target.closest?.('[data-entity]')?.dataset.entity ?? null;
    drag = { x: e.clientX, y: e.clientY, view: { ...view }, moved: false, entity };
    try { svg.setPointerCapture(e.pointerId); } catch { /* not a capturable pointer */ }
  });
  svg.addEventListener('pointermove', e => {
    if (drag && view) {
      const r = svg.getBoundingClientRect();
      const dx = (e.clientX - drag.x) * view.w / r.width, dy = (e.clientY - drag.y) * view.h / r.height;
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
      if (drag.moved) { setView({ ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy }); userView = true; }
      return;
    }
    handlers.onPointer(toPlan(e));
  });
  svg.addEventListener('pointerleave', () => { if (!drag) handlers.onPointer(null); });
  svg.addEventListener('pointerup', e => {
    if (drag && !drag.moved) {
      const at = toPlan(e);
      if (at) handlers.onClick(at, drag.entity);
    }
    drag = null;
  });

  /**
   * Draw the model.
   * @param {object|null} model  the engine's model (null for an empty layout)
   * @param {object} layout
   * @param {object} asset
   * @param {{freePorts: Array<{entity: string, port: string}>, selectedEntity: string|null, highlight: Set<string>,
   *   ghost: {rects: Array<{min: number[], max: number[]}>, label: string}|null, hint: string}} state
   */
  function draw(model, layout, asset, state) {
    svg.replaceChildren();
    if (!model || !layout.entities.length) {
      if (!userView || !view) setView({ x: -4000, y: -3000, w: 8000, h: 6000 });
      lastBounds = null;
      el('rect', { class: 'plan-bg', x: view.x - view.w * 5, y: view.y - view.h * 5, width: view.w * 11, height: view.h * 11 }, svg);
      drawGrid(asset.systems[layout.system]?.grid ?? 600);
      if (state.ghost) drawGhost(state.ghost);
      else el('text', { x: view.x + view.w / 2, y: view.y + view.h / 2, 'text-anchor': 'middle', class: 'plan-hint' }, svg).textContent = state.hint;
      return;
    }
    const placed = model.entities.filter(e => e.transform);
    const plan = b => ({ x: b.min[0], y: -b.max[1], w: b.max[0] - b.min[0], h: b.max[1] - b.min[1] });
    const all = model.parts.map(p => p.world);
    const bounds = all.length ? {
      x: Math.min(...all.map(b => b.min[0])), y: Math.min(...all.map(b => -b.max[1])),
      w: Math.max(...all.map(b => b.max[0])) - Math.min(...all.map(b => b.min[0])),
      h: Math.max(...all.map(b => b.max[1])) - Math.min(...all.map(b => b.min[1])),
    } : { x: -1000, y: -1000, w: 2000, h: 2000 };
    if (!userView || !view) fitTo(bounds);
    lastBounds = bounds;
    el('rect', { class: 'plan-bg', x: view.x - view.w * 5, y: view.y - view.h * 5, width: view.w * 11, height: view.h * 11 }, svg);

    // Derived parts (floor, plates, roof) faintly, then each block's parts.
    const derived = el('g', { class: 'plan-derived' }, svg);
    for (const p of model.parts) {
      if (placed.some(e => e.id === p.owner) || p.host) continue; // a block's, or a connection's (on its host)
      if (p.role === 'rafter' || p.role === 'lookout' || p.role === 'ridge_board') continue;
      const r = plan(p.world);
      el('rect', { x: r.x, y: r.y, width: r.w, height: r.h }, derived);
    }
    for (const e of placed) {
      const own = model.parts.filter(p => p.owner === e.id || p.host === e.id);
      const g = el('g', { class: `plan-entity${state.selectedEntity === e.id ? ' selected' : ''}${state.highlight.has(e.id) ? ' flagged' : ''}` }, svg);
      for (const p of own.sort((a, b) => !!b.layer - !!a.layer)) {
        const r = plan(p.world);
        el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: FILL[p.role] ?? '#ccc' }, g);
      }
      const ob = own.map(p => p.world);
      const box = {
        min: [Math.min(...ob.map(b => b.min[0])), Math.min(...ob.map(b => b.min[1]))],
        max: [Math.max(...ob.map(b => b.max[0])), Math.max(...ob.map(b => b.max[1]))],
      };
      el('rect', { class: 'plan-outline', 'data-entity': e.id, x: box.min[0], y: -box.max[1], width: box.max[0] - box.min[0], height: box.max[1] - box.min[1] }, g);
      const label = el('text', { class: 'plan-label', x: (box.min[0] + box.max[0]) / 2, y: -(box.min[1] + box.max[1]) / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
      label.textContent = `${e.id}${layout.anchor?.entity === e.id ? ' ⚓' : ''}`;
    }

    // Free ports, at each port's origin (the framing's outer face at the end).
    const r = Math.max(view.w, view.h) / 90;
    for (const at of state.freePorts) {
      const e = placed.find(x => x.id === at.entity);
      const entity = layout.entities.find(x => x.id === at.entity);
      const variant = asset.modules[entity.module]?.systems?.[layout.system]?.variants.find(v => v.name === entity.variant);
      const frame = variant?.ports?.[at.port];
      if (!e || !frame) continue;
      const p = apply(e.transform, frame.origin);
      const n = apply({ m: e.transform.m, t: [0, 0, 0] }, frame.normal);
      const c = el('circle', { class: 'plan-port', cx: p[0] + n[0] * r * 1.2, cy: -(p[1] + n[1] * r * 1.2), r }, svg);
      el('title', {}, c).textContent = `${at.entity}.${at.port}`;
    }
    if (state.ghost) drawGhost(state.ghost);
  }

  function drawGhost(ghost) {
    const g = el('g', { class: 'plan-ghost' }, svg);
    for (const b of ghost.rects) el('rect', { x: b.min[0], y: -b.max[1], width: b.max[0] - b.min[0], height: b.max[1] - b.min[1] }, g);
    const xs = ghost.rects.flatMap(b => [b.min[0], b.max[0]]), ys = ghost.rects.flatMap(b => [b.min[1], b.max[1]]);
    const label = el('text', { class: 'plan-ghost-label', x: (Math.min(...xs) + Math.max(...xs)) / 2, y: -Math.max(...ys) - Math.max(view.w, view.h) / 60, 'text-anchor': 'middle' }, g);
    label.textContent = ghost.label;
  }

  function drawGrid(step) {
    const g = el('g', { class: 'plan-grid' }, svg);
    const x0 = Math.floor(view.x / step) * step, y0 = Math.floor(view.y / step) * step;
    for (let x = x0; x <= view.x + view.w; x += step) el('line', { x1: x, y1: view.y, x2: x, y2: view.y + view.h }, g);
    for (let y = y0; y <= view.y + view.h; y += step) el('line', { x1: view.x, y1: y, x2: view.x + view.w, y2: y }, g);
  }

  return {
    draw,
    fit() { userView = false; if (lastBounds) fitTo(lastBounds); },
  };
}
