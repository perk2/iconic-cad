// The editor for systems of the new library format (hut/design/ic_editor.md):
// a library of the system's building blocks at the bottom, a plan view to
// place them in, a 3D preview, the model's issues and a summary. Placing
// works as in v1 (8): pick a block, then each click places one where the
// ghost shows it, attached to the nearest free end, straight on or round a
// corner. The document is the layout; every edit goes through update()
// (layout.js), the engine recompiles after each, and undo is a stack of
// layouts. The current layout is kept in local storage.

import { compileDesign } from '../engine/compile_design.js';
import { applyBox, placement } from '../engine/affine.js';
import { attachOptions, dependants, deriveList, derivedChoices, emptyLayout, freePorts, isLayout, joinCandidates, update, updateAll } from './layout.js';
import { derivedModules, loadAsset } from './library.js';
import { createPlan } from './plan.js';
import { createView3d } from './view3d.js';

const STORAGE = 'iconic.editor.current';
const REACH = 2500; // mm: the ghost shows only within this of the pointer
const FACINGS = [['S', 0], ['E', 90], ['N', 180], ['W', 270]]; // the first block's outside

let current = null; // the running editor, if any

/**
 * Start the editor in root.
 * @param {HTMLElement} root
 * @param {{project: {name: string, system: string}, layout?: object|null, onHome: () => void}} options
 */
export async function startEditor(root, { project, layout = null, onHome }) {
  current?.stop();
  const asset = await loadAsset();
  const derived = await derivedModules(asset);
  const system = layout?.system ?? project.system;
  if (!asset.systems[system]) throw new Error(`system '${system}' is not in the library`);
  const grid = asset.systems[system].grid ?? 600;

  const state = {
    project: { ...project, system },
    history: [layout ? structuredClone(layout) : emptyLayout(system)],
    at: 0,
    model: null,
    error: null,
    block: null, // {module, variant} picked in the library: each click places one
    facing: 0, // the first block's
    throughExisting: true, // at a corner, the wall already there runs through (F flips)
    pointer: null,
    candidates: null, // where the picked block can go: [{at, option, rects, centre}]
    selectedEntity: null,
    highlight: new Set(),
    sheets: true,
    tab: null,
  };
  const layoutNow = () => state.history[state.at];

  root.replaceChildren();
  root.innerHTML = `
    <div class="ed-left">
      <div class="ed-head">
        <div class="ed-title"></div>
        <div class="ed-system"></div>
      </div>
      <div class="ed-buttons">
        <button data-act="home" title="Back to the home screen">Home</button>
        <button data-act="new" title="Start an empty layout">New</button>
        <button data-act="load" title="Load a layout file">Load</button>
        <button data-act="save" title="Download the layout">Save</button>
        <button data-act="undo" title="Undo (Ctrl+Z)">Undo</button>
        <button data-act="redo" title="Redo (Ctrl+Y)">Redo</button>
      </div>
      <input type="file" class="ed-file" accept=".json" hidden>
      <div class="ed-section">Now</div>
      <div class="ed-status"></div>
      <div class="ed-section">Derived</div>
      <div class="ed-derived"></div>
      <div class="ed-section">Issues</div>
      <div class="ed-issues"></div>
      <div class="ed-section">Summary</div>
      <div class="ed-summary"></div>
    </div>
    <div class="ed-center">
      <div class="ed-plan-wrap">
        <svg class="ed-plan" preserveAspectRatio="xMidYMid meet"></svg>
        <div class="ed-plan-tools">
          <span class="ed-facing"></span>
          <button data-act="fit">Fit</button>
        </div>
      </div>
      <div class="ed-library">
        <div class="ed-tabs"></div>
        <div class="ed-cards"></div>
      </div>
    </div>
    <div class="ed-right">
      <div class="ed-3d"></div>
      <label class="ed-toggle"><input type="checkbox" data-act="sheets" checked> Sheets</label>
    </div>`;
  const $ = sel => root.querySelector(sel);
  $('.ed-title').textContent = state.project.name || 'Untitled';
  $('.ed-system').textContent = asset.systems[system].title ?? system;

  const plan = createPlan($('.ed-plan'), {
    onPointer: at => { state.pointer = at; drawPlan(); },
    onClick: (at, entity) => click(at, entity),
  });
  const view3d = createView3d($('.ed-3d'));

  // ---- the document --------------------------------------------------------
  function commit(actions) {
    let next;
    try {
      next = updateAll(layoutNow(), actions, asset);
    } catch (e) {
      alert(e.message);
      return;
    }
    state.history = [...state.history.slice(0, state.at + 1), next];
    state.at = state.history.length - 1;
    recompile();
  }
  function recompile() {
    const layout = layoutNow();
    state.error = null;
    state.model = null;
    state.candidates = null;
    if (layout.entities.length) {
      try {
        state.model = compileDesign(layout, asset, { derived });
      } catch (e) {
        state.error = e.message;
      }
    }
    if (state.selectedEntity && !layout.entities.some(e => e.id === state.selectedEntity)) state.selectedEntity = null;
    try { localStorage.setItem(STORAGE, JSON.stringify({ project: state.project, layout })); } catch { /* storage unavailable */ }
    render();
    view3d.setModel(state.model, { sheets: state.sheets, highlight: state.highlight });
  }

  // ---- placing ---------------------------------------------------------------
  const wallsOnly = l => { const { derive, ...walls } = l; return walls; };
  const errorCount = l => compileDesign(wallsOnly(l), asset).issues.filter(i => i.severity === 'error').length;

  /** Where the picked block can go: every free port and every connection there. */
  function candidates() {
    if (state.candidates) return state.candidates;
    const layout = layoutNow();
    state.candidates = [];
    if (!state.block || !layout.entities.length) return state.candidates;
    const before = errorCount(layout);
    for (const at of freePorts(asset, layout)) {
      for (const option of attachOptions(asset, layout, at, state.block.module, state.block.variant)) {
        const trial = update(wallsOnly(layout), { type: 'attach', at, ...state.block, option }, asset);
        const id = trial.entities[trial.entities.length - 1].id;
        let model;
        try { model = compileDesign(trial, asset); } catch { continue; }
        const rects = model.parts.filter(p => p.owner === id || p.host === id).map(p => p.world);
        if (!rects.length || model.issues.filter(i => i.severity === 'error').length > before) continue;
        const xs = rects.flatMap(b => [b.min[0], b.max[0]]), ys = rects.flatMap(b => [b.min[1], b.max[1]]);
        state.candidates.push({ at, option, rects, centre: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] });
      }
    }
    return state.candidates;
  }

  /** The candidate the pointer points at, with the corner preference applied. */
  function chosen(pointer) {
    if (!pointer) return null;
    let best = null, distance = Infinity;
    for (const c of candidates()) {
      const d = Math.hypot(c.centre[0] - pointer[0], c.centre[1] - pointer[1]);
      if (d < distance) { best = c; distance = d; }
    }
    if (!best || distance > REACH) return null;
    if (best.option.interface === 'wall_corner') {
      const wanted = state.throughExisting ? 'through' : 'butt';
      best = candidates().find(c => c.at.entity === best.at.entity && c.at.port === best.at.port
        && c.option.interface === 'wall_corner' && c.option.role === wanted) ?? best;
    }
    return best;
  }

  /** The first block, its length centred on the pointer, its datum snapped to the grid, facing state.facing. */
  function firstBlock(pointer) {
    const v = asset.modules[state.block.module].systems[system].variants.find(x => x.name === state.block.variant);
    const half = (v.size?.width ?? 0) / 2, r = (state.facing * Math.PI) / 180;
    const datum = [pointer[0] - half * Math.cos(r), pointer[1] - half * Math.sin(r)];
    const position = [Math.round(datum[0] / grid) * grid, Math.round(datum[1] / grid) * grid, 0];
    const t = placement(position, state.facing);
    return { position, rects: v.parts.map(p => applyBox(t, p.box)) };
  }

  function ghost() {
    if (!state.block || !state.pointer) return null;
    const name = `${blockTitle(state.block)} · ${state.block.variant}`;
    if (!layoutNow().entities.length) return { rects: firstBlock(state.pointer).rects, label: name };
    const c = chosen(state.pointer);
    if (!c) return null;
    const how = c.option.interface === 'wall_corner'
      ? `corner, ${c.option.role === 'through' ? c.at.entity : 'new'} runs through`
      : 'straight on';
    return { rects: c.rects, label: `${state.block.variant}: ${how}` };
  }

  /** A join closing a loop from the new block's free ends, if one fits. */
  function closingJoin(layout, id) {
    const before = errorCount(layout);
    for (const at of freePorts(asset, layout).filter(p => p.entity === id)) {
      for (const option of joinCandidates(asset, layout, at)) {
        const action = { type: 'join', at, other: option.other, option };
        try {
          const trial = update(layout, action, asset);
          const issues = compileDesign(wallsOnly(trial), asset).issues.filter(i => i.severity === 'error');
          if (!issues.some(i => i.rule === 'loop_gap') && issues.length <= before) return action;
        } catch { /* not this one */ }
      }
    }
    return null;
  }

  function click(at, entity) {
    const layout = layoutNow();
    if (state.block) {
      if (!layout.entities.length) {
        commit([{ type: 'place', ...state.block, position: firstBlock(at).position, facing: state.facing }]);
        return;
      }
      const c = chosen(at);
      if (!c) return;
      const attach = { type: 'attach', at: c.at, ...state.block, option: c.option };
      const after = update(layout, attach, asset);
      const join = closingJoin(after, after.entities[after.entities.length - 1].id);
      commit(join ? [attach, join] : [attach]);
      return;
    }
    state.selectedEntity = entity;
    render();
  }

  // ---- rendering -------------------------------------------------------------
  const blockTitle = b => asset.modules[b.module]?.title ?? b.module;
  function drawPlan() {
    const layout = layoutNow();
    const hint = state.block ? 'Click to place the first block' : 'Pick a building block below';
    plan.draw(state.model, layout, asset, {
      freePorts: freePorts(asset, layout), selectedEntity: state.selectedEntity, highlight: state.highlight, ghost: ghost(), hint,
    });
  }
  function render() {
    drawPlan();
    renderLibrary();
    renderFacing();
    renderStatus();
    renderDerived();
    renderIssues();
    renderSummary();
    $('[data-act="undo"]').disabled = state.at === 0;
    $('[data-act="redo"]').disabled = state.at === state.history.length - 1;
  }

  /** The catalog modules and their variants in the system, by module. */
  function library() {
    const out = [];
    for (const [id, m] of Object.entries(asset.modules)) {
      const variants = m.derived ? [] : m.systems?.[system]?.variants ?? [];
      if (variants.length) out.push({ module: id, title: m.title ?? id, variants });
    }
    return out;
  }

  function renderLibrary() {
    const modules = library();
    state.tab ??= modules[0]?.module ?? null;
    const tabs = $('.ed-tabs');
    tabs.replaceChildren();
    for (const m of modules) {
      const b = document.createElement('button');
      b.className = 'ed-tab' + (m.module === state.tab ? ' active' : '');
      b.textContent = m.title;
      b.addEventListener('click', () => { state.tab = m.module; renderLibrary(); });
      tabs.appendChild(b);
    }
    const cards = $('.ed-cards');
    cards.replaceChildren();
    const m = modules.find(x => x.module === state.tab);
    for (const v of m?.variants ?? []) {
      const active = state.block?.module === m.module && state.block?.variant === v.name;
      const card = document.createElement('button');
      card.className = 'ed-card' + (active ? ' active' : '');
      card.innerHTML = `${thumbnail(v)}<span class="ed-card-text"><span class="ed-card-name"></span><span class="ed-card-size"></span></span>`;
      card.querySelector('.ed-card-name').textContent = v.name;
      card.querySelector('.ed-card-size').textContent = v.size ? `${v.size.width} × ${v.size.height}` : '';
      card.addEventListener('click', () => {
        state.block = active ? null : { module: m.module, variant: v.name };
        state.candidates = null;
        state.selectedEntity = null;
        render();
      });
      cards.appendChild(card);
    }
  }

  /** A small elevation of a variant from its parts (x along, z up). */
  function thumbnail(v) {
    const parts = v.parts ?? [];
    const w = v.size?.width ?? 1200, h = v.size?.height ?? 2400;
    const rects = parts.map(p => {
      const b = p.box;
      const cls = p.layer ? 'sheet' : p.role;
      return `<rect class="th-${cls}" x="${b.min[0]}" y="${h - b.max[2]}" width="${b.max[0] - b.min[0]}" height="${b.max[2] - b.min[2]}"/>`;
    }).sort((a, b) => (a.includes('th-sheet') ? 1 : 0) - (b.includes('th-sheet') ? 1 : 0)).join('');
    return `<svg class="ed-thumb" viewBox="-40 -40 ${w + 80} ${h + 80}" preserveAspectRatio="xMidYMid meet">${rects}</svg>`;
  }

  function renderFacing() {
    const box = $('.ed-facing');
    box.replaceChildren();
    if (layoutNow().entities.length) return;
    const label = document.createElement('span');
    label.textContent = 'Outside faces ';
    box.appendChild(label);
    for (const [name, deg] of FACINGS) {
      const b = document.createElement('button');
      b.textContent = name;
      b.className = state.facing === deg ? 'active' : '';
      b.addEventListener('click', () => { state.facing = deg; render(); });
      box.appendChild(b);
    }
  }

  function renderStatus() {
    const box = $('.ed-status');
    box.replaceChildren();
    const note = text => { const e = document.createElement('div'); e.className = 'ed-note'; e.textContent = text; box.appendChild(e); return e; };
    const layout = layoutNow();
    if (state.block) {
      note(`Placing ${blockTitle(state.block)} · ${state.block.variant}.`);
      note(layout.entities.length
        ? 'Point at a free wall end: the ghost shows where it goes. Click to place; F flips which wall runs through at a corner; Esc stops.'
        : 'Click in the plan to place the first one; S, E, N, W set which way its outside faces.');
      if (layout.entities.length && !candidates().length) note('It fits no free end.');
      return;
    }
    if (state.selectedEntity) {
      const e = layout.entities.find(x => x.id === state.selectedEntity);
      note(`${e.id}: ${blockTitle(e)} · ${e.variant}${layout.anchor?.entity === e.id ? ' (anchor)' : ''}`);
      const remove = document.createElement('button');
      remove.textContent = `Remove ${e.id} (Delete)`;
      remove.addEventListener('click', removeSelected);
      box.appendChild(remove);
      return;
    }
    note(layout.entities.length ? 'Pick a building block below to place more, or click a block to select it.' : 'Pick a building block below to start.');
  }

  // The layout's derived modules: their entries, parameters, and what can be added.
  function renderDerived() {
    const box = $('.ed-derived');
    box.replaceChildren();
    const layout = layoutNow();
    const fixedText = v => (v && typeof v === 'object' ? v.id ?? JSON.stringify(v) : String(v));
    for (const entry of deriveList(layout)) {
      const id = entry.id ?? entry.module;
      const module = asset.modules[entry.module];
      const card = document.createElement('div');
      card.className = 'ed-derived-entry';
      const head = document.createElement('div');
      head.className = 'ed-derived-head';
      head.innerHTML = '<span class="ed-derived-title"></span>';
      head.querySelector('.ed-derived-title').textContent = `${module?.title ?? entry.module}${id !== entry.module ? ` (${id})` : ''}`;
      const remove = document.createElement('button');
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        const after = [...dependants(layout, id)];
        if (after.length && !confirm(`Remove ${id} and what comes after it (${after.join(', ')})?`)) return;
        commit([{ type: 'remove_derived', id }]);
      });
      head.appendChild(remove);
      card.appendChild(head);
      const fixed = module?.systems?.[system]?.params ?? {};
      const given = [], fixedLines = [];
      for (const p of module?.parameters ?? []) (p.name in fixed ? fixedLines : given).push(p);
      for (const p of given) card.appendChild(parameterField(id, p, entry.parameters?.[p.name]));
      if (fixedLines.length) {
        const f = document.createElement('div');
        f.className = 'ed-derived-fixed';
        f.textContent = 'System: ' + fixedLines.map(p => `${p.name} ${fixedText(fixed[p.name])}`).join(', ');
        card.appendChild(f);
      }
      box.appendChild(card);
    }
    const adds = derivedChoices(asset, layout);
    if (adds.length) {
      const row = document.createElement('div');
      row.className = 'ed-buttons';
      for (const c of adds) {
        const b = document.createElement('button');
        b.textContent = `Add ${c.title.toLowerCase()}`;
        b.disabled = !c.ready;
        if (!c.ready) b.title = `Needs ${c.missing.join(', ')} first`;
        b.addEventListener('click', () => commit([{ type: 'add_derived', module: c.module }]));
        row.appendChild(b);
      }
      box.appendChild(row);
    }
    if (!deriveList(layout).length && !adds.length) {
      const e = document.createElement('div'); e.className = 'ed-note'; e.textContent = 'The system has no derived modules.'; box.appendChild(e);
    }
  }

  /** One parameter of a derived entry: a number and slider, or a list of choices. */
  function parameterField(id, p, value) {
    const row = document.createElement('label');
    row.className = 'ed-param' + (value === undefined ? ' missing' : '');
    const name = document.createElement('span');
    name.className = 'ed-param-name';
    name.textContent = p.name;
    name.title = p.description ?? '';
    row.appendChild(name);
    const set = v => commit([{ type: 'set_parameter', id, name: p.name, value: v }]);
    if (p.type === 'choice') {
      const sel = document.createElement('select');
      for (const v of p.values) { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); }
      if (value === undefined) { const o = document.createElement('option'); o.value = ''; o.textContent = '…'; sel.prepend(o); }
      sel.value = value ?? '';
      sel.addEventListener('change', () => { if (sel.value) set(sel.value); });
      row.appendChild(sel);
    } else if (p.type === 'length' || p.type === 'angle') {
      const unit = p.type === 'angle' ? '°' : 'mm';
      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(p.min ?? 0);
      range.max = String(p.max ?? (p.type === 'angle' ? 90 : 3000));
      range.step = p.type === 'angle' ? '1' : '10';
      range.value = String(value ?? p.default ?? p.min ?? 0);
      const num = document.createElement('input');
      num.type = 'number';
      num.min = range.min; num.max = range.max; num.step = range.step;
      num.value = value === undefined ? '' : String(value);
      range.addEventListener('input', () => { num.value = range.value; });
      range.addEventListener('change', () => set(Number(range.value)));
      num.addEventListener('change', () => { if (num.value !== '') set(Number(num.value)); });
      const u = document.createElement('span'); u.className = 'ed-param-unit'; u.textContent = unit;
      row.append(range, num, u);
    } else {
      const v = document.createElement('span'); v.textContent = value === undefined ? '(given by the system)' : String(value); row.appendChild(v);
    }
    return row;
  }

  function removeSelected() {
    if (!state.selectedEntity) return;
    commit([{ type: 'remove', entity: state.selectedEntity, model: state.model }]);
  }

  function renderIssues() {
    const box = $('.ed-issues');
    box.replaceChildren();
    if (state.error) { const e = document.createElement('div'); e.className = 'ed-issue error'; e.textContent = state.error; box.appendChild(e); return; }
    const issues = state.model?.issues ?? [];
    if (!issues.length) { const e = document.createElement('div'); e.className = 'ed-note'; e.textContent = layoutNow().entities.length ? 'None.' : ''; box.appendChild(e); return; }
    for (const issue of issues) {
      const e = document.createElement('div');
      e.className = `ed-issue ${issue.severity}`;
      e.textContent = issue.message;
      e.addEventListener('click', () => {
        state.highlight = new Set(issue.entities ?? []);
        render();
        view3d.setModel(state.model, { sheets: state.sheets, highlight: state.highlight });
      });
      box.appendChild(e);
    }
  }

  function renderSummary() {
    const box = $('.ed-summary');
    box.replaceChildren();
    const m = state.model;
    if (!m) return;
    const lines = [];
    for (const [k, n] of Object.entries(m.summary.panels ?? {})) lines.push(`${n} × ${k}`);
    lines.push(`${m.parts.length} parts, ${m.joints.length} joints`);
    for (const [stage, items] of Object.entries(m.summary.fasteners_by_stage ?? {})) {
      for (const [item, n] of Object.entries(items)) lines.push(`${stage}: ${n} × ${item}`);
    }
    if (m.summary.outline) lines.push(`outline ${Math.round(m.summary.outline.size[0])} × ${Math.round(m.summary.outline.size[1])} mm`);
    for (const l of lines) { const e = document.createElement('div'); e.className = 'ed-note'; e.textContent = l; box.appendChild(e); }
  }

  // ---- buttons and keys ----------------------------------------------------
  const undo = () => { if (state.at > 0) { state.at -= 1; recompile(); } };
  const redo = () => { if (state.at < state.history.length - 1) { state.at += 1; recompile(); } };
  root.addEventListener('click', e => {
    const act = e.target.closest?.('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'home') onHome();
    else if (act === 'new') { if (confirm('Start an empty layout? The current one can be undone.')) commit([{ type: 'replace', layout: emptyLayout(system) }]); }
    else if (act === 'load') $('.ed-file').click();
    else if (act === 'save') save();
    else if (act === 'undo') undo();
    else if (act === 'redo') redo();
    else if (act === 'fit') { plan.fit(); view3d.fit(state.model); }
  });
  const onKey = e => {
    if (e.target.closest?.('input, select, textarea')) return;
    if (e.key === 'Escape') { state.block = null; state.selectedEntity = null; state.candidates = null; render(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedEntity) { e.preventDefault(); removeSelected(); }
    else if (e.key === 'f' || e.key === 'F') { state.throughExisting = !state.throughExisting; drawPlan(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  };
  window.addEventListener('keydown', onKey);
  $('[data-act="sheets"]').addEventListener('change', e => {
    state.sheets = e.target.checked;
    view3d.setModel(state.model, { sheets: state.sheets, highlight: state.highlight });
  });
  $('.ed-file').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then(text => {
      const data = JSON.parse(text);
      if (!isLayout(data)) throw new Error('not a layout of the new format');
      if (!asset.systems[data.system]) throw new Error(`system '${data.system}' is not in the library`);
      commit([{ type: 'replace', layout: data }]);
    }).catch(err => alert(`Could not load the layout: ${err.message}`));
  });
  function save() {
    const name = (state.project.name || 'layout').replace(/[^\w.-]+/g, '_');
    const blob = new Blob([JSON.stringify(layoutNow(), null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.layout.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  current = {
    stop() { window.removeEventListener('keydown', onKey); view3d.dispose(); root.replaceChildren(); current = null; },
  };
  recompile();
  return current;
}

/** The layout kept from the last session, if any: {project, layout}. */
export function savedSession() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE) ?? 'null');
    return data && isLayout(data.layout) ? data : null;
  } catch {
    return null;
  }
}

/** Stop the running editor, if any. */
export function stopEditor() {
  current?.stop();
}
