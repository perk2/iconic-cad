// The library asset, and the derived modules' code it carries, loaded once
// for the editor (hut/design/ic_editor.md, 4). Derived code imports nothing,
// so it runs from a Blob URL.

let assetPromise = null;
const derivedCache = new Map();

/** The library asset (web/assets/library.json). */
export function loadAsset() {
  assetPromise ??= fetch('assets/library.json', { cache: 'no-cache' }).then(r => {
    if (!r.ok) throw new Error(`could not load the library: HTTP ${r.status}`);
    return r.json();
  });
  return assetPromise;
}

/** The systems in the library: [{id, title}]. */
export async function librarySystems() {
  try {
    const asset = await loadAsset();
    return Object.entries(asset.systems).map(([id, s]) => ({ id, title: s.title ?? id }));
  } catch {
    return [];
  }
}

/** The derived modules' code, for compileDesign: {<id>: {derive}}. */
export async function derivedModules(asset) {
  const out = {};
  for (const [id, m] of Object.entries(asset.modules)) {
    if (!m.derived || typeof m.code !== 'string') continue;
    if (!derivedCache.has(id)) {
      const url = URL.createObjectURL(new Blob([m.code], { type: 'text/javascript' }));
      derivedCache.set(id, import(url).finally(() => URL.revokeObjectURL(url)));
    }
    out[id] = await derivedCache.get(id);
  }
  return out;
}
