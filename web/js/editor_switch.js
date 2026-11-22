// The switch between upstream's v1 editor and the editor for systems of the
// new library format (hut/design/ic_editor.md, 4.1). The page is one app;
// the project's system decides which editor runs, and the two never run at
// the same time. The new editor is loaded only when it's needed.

let active = false;

/** The new editor is running. */
export function editorActive() {
  return active;
}

/**
 * Show the new editor (v1's design panes hidden) with a project and a layout
 * (null: an empty one, or the last session's if the owner wants it back).
 * @param {{project: {name: string, system: string}, layout?: object|null}} options
 */
export async function enterEditor({ project, layout = null }) {
  const root = document.getElementById('editor');
  document.body.classList.add('mode-editor');
  active = true;
  const editor = await import('./editor/main.js');
  let start = layout;
  if (!start) {
    const saved = editor.savedSession();
    if (saved && saved.layout.system === project.system && saved.layout.entities.length
      && confirm(`Continue the layout from your last session (${saved.layout.entities.length} blocks)?`)) {
      start = saved.layout;
      project = { ...project, name: saved.project?.name ?? project.name };
    }
  }
  try {
    await editor.startEditor(root, {
      project, layout: start,
      onHome: async () => {
        if (!confirm('Leave the design? It is kept in this browser; save it to keep a file.')) return;
        const { showHome } = await import('./home.js');
        showHome();
      },
    });
  } catch (e) {
    alert(`The editor could not start: ${e.message}`);
    leaveEditor();
  }
}

/** Back to the v1 editor's panes (the new editor stopped). */
export function leaveEditor() {
  if (!active) return;
  active = false;
  document.body.classList.remove('mode-editor');
  import('./editor/main.js').then(m => m.stopEditor());
}

// A layout of the new format loaded from the home screen (io.js hands it
// over instead of applying it as a v1 design).
window.addEventListener('iconic:library-layout', e => {
  const layout = /** @type {CustomEvent} */ (e).detail;
  enterEditor({ project: { name: 'Loaded layout', system: layout.system }, layout });
  window.dispatchEvent(new Event('iconic:loaded'));
});
