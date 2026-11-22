// The 3D preview: the model's parts, boxes and sloped parts (their convex
// pieces, solids.js), coloured by role, z up, orbit with the mouse
// (hut/design/ic_editor.md, 4.2). Renders on demand.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { isSolid, pieces } from '../library/solids.js';

const COLOUR = {
  stud: 0xe9d8b4, king: 0xd9a95b, jack: 0xc47f3a, cripple: 0xa8c686, header: 0x8a5a2b, sill: 0x6e9fc9,
  bottom_plate: 0xcbb48a, top_plate: 0xcbb48a, sill_plate: 0xa8a291, rim: 0xcbb48a, joist: 0xe9d8b4,
  blocking: 0xc47f3a, bracing: 0xd9c38c, subfloor: 0xbfb6a0, rafter: 0xc9a66b, ridge_board: 0x8a5a2b,
  ceiling_joist: 0xdcc9a0, lookout: 0xb89a62,
};

/** @param {HTMLElement} container */
export function createView3d(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(-1, -2, 3);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(40, 1, 10, 200000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  const root = new THREE.Group();
  scene.add(root);
  const materials = new Map();
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x333333 });
  let moved = false; // the user turned or zoomed the view: stop framing the model on each change

  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);
  controls.addEventListener('start', () => { moved = true; });
  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  };
  new ResizeObserver(resize).observe(container);

  const material = role => {
    if (!materials.has(role)) materials.set(role, new THREE.MeshLambertMaterial({ color: COLOUR[role] ?? 0xcccccc }));
    return materials.get(role);
  };

  /** A part's geometry in world coordinates. */
  function geometry(part) {
    if (!isSolid(part)) {
      const b = part.world;
      const g = new THREE.BoxGeometry(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
      g.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
      return g;
    }
    const positions = [];
    for (const piece of pieces(part)) {
      for (const face of piece) {
        const v = face.verts;
        for (let i = 1; i + 1 < v.length; i++) positions.push(...v[0], ...v[i], ...v[i + 1]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    return g;
  }

  /**
   * Show a model.
   * @param {object|null} model
   * @param {{sheets: boolean, highlight: Set<string>}} options
   */
  function setModel(model, { sheets = true, highlight = new Set() } = {}) {
    for (const child of [...root.children]) {
      root.remove(child);
      child.geometry?.dispose();
    }
    if (!model) { render(); return; }
    const flagged = new THREE.MeshLambertMaterial({ color: 0xff5050 });
    for (const part of model.parts) {
      if (part.layer && !sheets) continue;
      const g = geometry(part);
      const owner = part.host ?? part.owner;
      root.add(new THREE.Mesh(g, highlight.has(owner) ? flagged : material(part.role)));
      root.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), edgeMaterial));
    }
    if (!moved && model.parts.length) fit(model);
    render();
  }

  function fit(model) {
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const centre = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    // The sphere fits the narrower of the two fields of view, with a margin.
    const vertical = (camera.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    const distance = radius / Math.sin(Math.min(vertical, horizontal) / 2) * 1.15;
    controls.target.copy(centre);
    camera.position.copy(centre).add(new THREE.Vector3(-0.55, -0.75, 0.45).normalize().multiplyScalar(distance));
    controls.update();
  }

  return {
    setModel,
    fit(model) { moved = false; if (model) fit(model); render(); },
    dispose() { controls.dispose(); renderer.dispose(); renderer.domElement.remove(); },
  };
}
