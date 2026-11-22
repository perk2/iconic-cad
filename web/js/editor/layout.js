// The editor's document is a layout (entities, connections, anchor, derive;
// web/js/engine/compile_design.js), changed only through update(layout,
// action), which returns a new layout (hut/design/ic_editor.md, 4.2). Pure:
// no DOM.
//
// Actions:
//   {type: 'place', module, variant, position, facing}
//                                               the first block, the anchor
//                                               (default: the origin, facing 0)
//   {type: 'attach', at: {entity, port}, option} a block joined to a free port;
//                                               option from attachOptions()
//   {type: 'join', at, other, option}          two free ports of placed blocks
//                                               joined (closing a loop); option
//                                               from joinCandidates()
//   {type: 'remove', entity, model}             a block and its connections;
//                                               the model gives the new
//                                               anchor's place if it was the anchor
//   {type: 'replace', layout}                   a loaded layout
//   {type: 'add_derived', module, parameters}   a derived module listed, after
//                                               the entries of the modules it
//                                               needs (schema `needs`)
//   {type: 'remove_derived', id}                an entry and those after it
//   {type: 'set_parameter', id, name, value}    a parameter the layout gives

/** An empty layout for a system. */
export function emptyLayout(system) {
  return { system, git: null, anchor: null, entities: [], connections: [] };
}

/** A layout of the new format (as opposed to a v1 design file). */
export function isLayout(data) {
  return !!data && typeof data === 'object' && !('version' in data)
    && typeof data.system === 'string' && Array.isArray(data.entities) && Array.isArray(data.connections) && 'anchor' in data;
}

/** The next free id with a prefix: P1, P2, ... or c1, c2, ... */
function nextId(prefix, taken) {
  for (let k = 1; ; k++) if (!taken.has(`${prefix}${k}`)) return `${prefix}${k}`;
}

/** The connection's ends: [{role, entity, port}]. */
export function connectionEnds(asset, c) {
  const roles = Object.keys(asset.interfaces[c.interface]?.roles ?? {});
  return roles.filter(role => typeof c[role] === 'string').map(role => {
    const [entity, port] = c[role].split('.');
    return { role, entity, port };
  });
}

/** Ports in use, as "entity.port". */
export function usedPorts(asset, layout) {
  return new Set(layout.connections.flatMap(c => connectionEnds(asset, c).map(e => `${e.entity}.${e.port}`)));
}

/** The free ports that some interface can use: [{entity, port}]. */
export function freePorts(asset, layout) {
  const used = usedPorts(asset, layout);
  const out = [];
  for (const e of layout.entities) {
    const ports = asset.modules[e.module]?.ports ?? {};
    for (const [port, spec] of Object.entries(ports)) {
      if (spec.roles?.length && !used.has(`${e.id}.${port}`)) out.push({ entity: e.id, port });
    }
  }
  return out;
}

/**
 * How a block (module, variant) can join the free port `at` of a placed
 * entity: the baked pairs that have the entity's module, variant and port in
 * one role and the block in the other. [{interface, role, otherRole,
 * otherPort, label}], one per interface, roles and port.
 */
export function attachOptions(asset, layout, at, module, variant) {
  const entity = layout.entities.find(e => e.id === at.entity);
  if (!entity) return [];
  const out = [];
  const seen = new Set();
  for (const [ifaceId, iface] of Object.entries(asset.interfaces)) {
    const pairs = iface.systems?.[layout.system]?.pairs ?? [];
    for (const pair of pairs) {
      const roles = Object.entries(pair.participants);
      for (const [role, p] of roles) {
        if (p.module !== entity.module || p.variant !== entity.variant || p.port !== at.port) continue;
        for (const [otherRole, q] of roles) {
          if (otherRole === role || q.module !== module || q.variant !== variant) continue;
          const key = `${ifaceId}|${role}|${otherRole}|${q.port}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ interface: ifaceId, role, otherRole, otherPort: q.port, label: optionLabel(iface, ifaceId, role, otherRole) });
        }
      }
    }
  }
  return out;
}

/**
 * The ways the free port `at` could join another free port of a placed
 * block: [{interface, role, otherRole, other: {entity, port}, label}], from
 * the baked pairs. Whether the blocks meet there is for the engine to say
 * (the editor compiles each candidate and keeps those with no loop gap).
 */
export function joinCandidates(asset, layout, at) {
  const entity = layout.entities.find(e => e.id === at.entity);
  if (!entity) return [];
  const out = [];
  for (const other of freePorts(asset, layout)) {
    if (other.entity === at.entity) continue;
    const target = layout.entities.find(e => e.id === other.entity);
    for (const [ifaceId, iface] of Object.entries(asset.interfaces)) {
      for (const pair of iface.systems?.[layout.system]?.pairs ?? []) {
        const roles = Object.entries(pair.participants);
        for (const [role, p] of roles) {
          if (p.module !== entity.module || p.variant !== entity.variant || p.port !== at.port) continue;
          for (const [otherRole, q] of roles) {
            if (otherRole === role || q.module !== target.module || q.variant !== target.variant || q.port !== other.port) continue;
            if (out.some(o => o.interface === ifaceId && o.role === role && o.other.entity === other.entity && o.other.port === other.port)) continue;
            out.push({
              interface: ifaceId, role, otherRole, other,
              label: `Join ${other.entity}.${other.port}: ${optionLabel(iface, ifaceId, role, otherRole).replace('the new one', other.entity)}`,
            });
          }
        }
      }
    }
  }
  return out;
}

function optionLabel(iface, ifaceId, role, otherRole) {
  const title = iface.title ?? ifaceId;
  if (ifaceId === 'wall_corner') return role === 'through' ? `${title}: this one runs through` : `${title}: the new one runs through`;
  return `${title} (${role} - ${otherRole})`;
}

/** The layout's derived module entries, as a list (derive may be one entry). */
export function deriveList(layout) {
  const d = layout.derive;
  return d === undefined ? [] : Array.isArray(d) ? d : [d];
}
const entryId = e => e.id ?? e.module;

/** The ids of the entries that come after `id`, directly or not. */
export function dependants(layout, id) {
  const out = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of deriveList(layout)) {
      const eid = entryId(e);
      if (!out.has(eid) && (e.after ?? []).some(a => a === id || out.has(a))) { out.add(eid); grew = true; }
    }
  }
  return out;
}

/**
 * The derived modules a layout can list now: [{module, title, ready, missing}]:
 * the system's derived modules that aren't children of another and aren't
 * listed yet; ready when the modules they need are listed.
 */
export function derivedChoices(asset, layout) {
  const listed = new Set(deriveList(layout).map(e => e.module));
  return Object.entries(asset.modules)
    .filter(([id, m]) => m.derived && !m.child_of && m.systems?.[layout.system] && !listed.has(id))
    .map(([id, m]) => {
      const missing = (m.needs ?? []).filter(n => !listed.has(n));
      return { module: id, title: m.title ?? id, ready: !missing.length, missing };
    });
}

/** The facing (degrees, a multiple of 90) of a placement's rotation. */
function facingOf(m) {
  return ((Math.round(Math.atan2(m[1][0], m[0][0]) * 180 / Math.PI / 90) * 90) % 360 + 360) % 360;
}

/**
 * The layout after an action.
 * @returns {object} a new layout
 */
export function update(layout, action, asset) {
  const ids = new Set([...layout.entities.map(e => e.id), ...layout.connections.map(c => c.id)]);
  switch (action.type) {
    case 'replace':
      return structuredClone(action.layout);
    case 'place': {
      if (layout.entities.length) throw new Error('place starts an empty layout; attach to a free port instead');
      const id = nextId('P', ids);
      return {
        ...layout,
        anchor: { entity: id, position: action.position ?? [0, 0, 0], facing: action.facing ?? 0 },
        entities: [{ id, module: action.module, variant: action.variant }],
      };
    }
    case 'attach': {
      const { at, option } = action;
      const id = nextId('P', ids);
      const cid = nextId('c', ids);
      return {
        ...layout,
        entities: [...layout.entities, { id, module: action.module, variant: action.variant }],
        connections: [...layout.connections, {
          id: cid, interface: option.interface,
          [option.role]: `${at.entity}.${at.port}`, [option.otherRole]: `${id}.${option.otherPort}`,
        }],
      };
    }
    case 'join': {
      const { at, other, option } = action;
      return {
        ...layout,
        connections: [...layout.connections, {
          id: nextId('c', ids), interface: option.interface,
          [option.role]: `${at.entity}.${at.port}`, [option.otherRole]: `${other.entity}.${other.port}`,
        }],
      };
    }
    case 'remove': {
      const gone = action.entity;
      const entities = layout.entities.filter(e => e.id !== gone);
      const connections = layout.connections.filter(c => !connectionEnds(asset, c).some(e => e.entity === gone));
      let anchor = layout.anchor;
      if (anchor?.entity === gone) {
        // The anchor moves to a neighbour, where the model has placed it, so
        // the rest stays put.
        const neighbour = layout.connections
          .filter(c => connectionEnds(asset, c).some(e => e.entity === gone))
          .flatMap(c => connectionEnds(asset, c).map(e => e.entity))
          .find(e => e !== gone) ?? entities[0]?.id;
        const placed = action.model?.entities.find(e => e.id === neighbour)?.transform;
        anchor = neighbour && placed ? { entity: neighbour, position: placed.t.map(v => Math.round(v * 1e6) / 1e6), facing: facingOf(placed.m) }
          : neighbour ? { entity: neighbour, position: [0, 0, 0], facing: 0 } : null;
      }
      return { ...layout, anchor, entities, connections };
    }
    case 'add_derived': {
      const module = asset.modules[action.module];
      const list = deriveList(layout);
      const taken = new Set(list.map(entryId));
      const id = taken.has(action.module) ? nextId(`${action.module}_`, taken) : action.module;
      const after = (module.needs ?? []).map(n => {
        const e = list.find(x => x.module === n);
        if (!e) throw new Error(`'${action.module}' needs '${n}' listed first`);
        return entryId(e);
      });
      const fixed = module.systems?.[layout.system]?.params ?? {};
      const parameters = {};
      for (const p of module.parameters) if (!(p.name in fixed) && p.default !== undefined) parameters[p.name] = p.default;
      Object.assign(parameters, action.parameters ?? {});
      const entry = { module: action.module, ...(id !== action.module ? { id } : {}), ...(after.length ? { after } : {}),
        ...(Object.keys(parameters).length ? { parameters } : {}) };
      return { ...layout, derive: [...list, entry] };
    }
    case 'remove_derived': {
      const gone = dependants(layout, action.id).add(action.id);
      const derive = deriveList(layout).filter(e => !gone.has(entryId(e)));
      const { derive: _, ...rest } = layout;
      return derive.length ? { ...rest, derive } : rest;
    }
    case 'set_parameter': {
      const derive = deriveList(layout).map(e => entryId(e) === action.id
        ? { ...e, parameters: { ...(e.parameters ?? {}), [action.name]: action.value } } : e);
      return { ...layout, derive };
    }
    default:
      throw new Error(`unknown action ${action.type}`);
  }
}

/** The layout after several actions, in order (one step for undo). */
export function updateAll(layout, actions, asset) {
  return actions.reduce((l, action) => update(l, action, asset), layout);
}

