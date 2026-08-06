// room3d.js — clean 3D room viewer for BluPrint (vanilla Three.js, no build step).
// Renders the room shell + real furniture as proper 3D models (legs, cushions,
// shelves — not sketches), sized to real-world dimensions from furniture-catalog.js.
//
// Usage (browser, via importmap for 'three' — see room3d.html):
//   import { createRoomViewer } from './room3d.js';
//   const viewer = createRoomViewer(document.getElementById('stage'), { style: 'modern' });
//   viewer.render(roomLayout);   // roomLayout = BluPrint layout (px), same as iso-preview.js
//
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { catalogEntry } from './furniture-catalog.js';

const FT = 1;               // world unit = 1 foot
const IN = 1 / 12;          // inches -> feet

// ---- style palettes -------------------------------------------------------
const PALETTES = {
  modern:       { wood: 0xb98a5e, woodDark: 0x6f4b30, fabric: 0x9aa3ad, accent: 0x2f6f83, metal: 0x2b2b2f, wall: 0xece7df, floor: 0xd8c7b0 },
  scandinavian: { wood: 0xd8b892, woodDark: 0xb08d63, fabric: 0xd7d3cb, accent: 0x8fb0b8, metal: 0x9a9a9a, wall: 0xf4f1ec, floor: 0xe7d9c4 },
  bohemian:     { wood: 0xa9713f, woodDark: 0x6d4326, fabric: 0xc08457, accent: 0x9c6b46, metal: 0x8a6b3a, wall: 0xefe6da, floor: 0xcaa877 },
  industrial:   { wood: 0x8a6a4a, woodDark: 0x4f3826, fabric: 0x6e6e73, accent: 0x9c5a3c, metal: 0x3a3a3f, wall: 0xd9d4cc, floor: 0xb8ada0 },
  minimalist:   { wood: 0xc9b79c, woodDark: 0x8f7d63, fabric: 0xcfcfca, accent: 0x3a3a3a, metal: 0x4a4a4a, wall: 0xf3f1ec, floor: 0xe3dccf },
};
const pal = (s) => PALETTES[s] || PALETTES.modern;

// ---- material + mesh helpers ---------------------------------------------
/** Darken a colour toward black, for frames and legs under a product colour. */
function shadeHex(colour, k) {
  return new THREE.Color(colour).multiplyScalar(k).getHex();
}

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.75, metalness: o.metal ?? 0, ...o });
function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
function cyl(rt, rb, h, m, seg = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
function legs(group, w, d, h, m, inset = 0.12) {
  const r = Math.min(0.06, w * 0.05);
  const xs = [ -w / 2 + inset, w / 2 - inset ];
  const zs = [ -d / 2 + inset, d / 2 - inset ];
  for (const x of xs) for (const z of zs) {
    const l = cyl(r, r, h, m); l.position.set(x, h / 2, z); group.add(l);
  }
}

// ---- furniture builders (each returns Group, bottom at y=0, faces +Z) -----
// dims [w,d,h] in feet, P = palette
const BUILDERS = {
  bed(w, d, h, P) {
    const g = new THREE.Group();
    const frameH = 0.55, mattH = 0.75;
    g.add(box(w, frameH, d, mat(P.woodDark), 0, frameH / 2, 0));
    g.add(box(w - 0.15, mattH, d - 0.15, mat(0xf2efe9, { rough: 0.95 }), 0, frameH + mattH / 2, 0));
    g.add(box(w, h - 0.2, 0.25, mat(P.wood), 0, (h) / 2, -d / 2 + 0.1)); // headboard
    // pillows
    const pw = (w - 0.6) / 2;
    for (const s of [-1, 1]) g.add(box(pw, 0.3, 0.9, mat(0xffffff, { rough: 1 }), s * (pw / 2 + 0.1), frameH + mattH + 0.12, -d / 2 + 0.7));
    // duvet fold
    g.add(box(w - 0.15, 0.12, d * 0.55, mat(P.accent, { rough: 0.95 }), 0, frameH + mattH + 0.06, d * 0.12));
    return g;
  },
  crib(w, d, h, P) {
    const g = new THREE.Group();
    const m = mat(P.wood);
    g.add(box(w, 0.4, d, m, 0, 0.35, 0));
    g.add(box(w - 0.2, 0.35, d - 0.2, mat(0xf2efe9, { rough: 0.95 }), 0, 0.7, 0));
    // slats
    const n = Math.max(6, Math.round(w / 0.35));
    for (let i = 0; i <= n; i++) {
      const x = -w / 2 + (i / n) * w;
      for (const z of [-d / 2, d / 2]) { const s = cyl(0.03, 0.03, h - 0.5, m); s.position.set(x, (h) / 2, z); g.add(s); }
    }
    for (const z of [-d / 2, d / 2]) g.add(box(w, 0.08, 0.08, m, 0, h - 0.3, z));
    return g;
  },
  sofa(w, d, h, P) {
    const g = new THREE.Group(); const f = mat(P.fabric, { rough: 0.95 });
    const seatH = 0.75;
    g.add(box(w, seatH, d, f, 0, seatH / 2, 0));                       // base
    g.add(box(w, h - seatH, 0.5, f, 0, seatH + (h - seatH) / 2, -d / 2 + 0.25)); // back
    for (const s of [-1, 1]) g.add(box(0.5, h - seatH + 0.1, d, f, s * (w / 2 - 0.25), seatH + (h - seatH) / 2, 0)); // arms
    const n = Math.max(1, Math.round(w / 2.4)); const cw = (w - 1) / n;
    for (let i = 0; i < n; i++) { // seat cushions
      const x = -w / 2 + 0.5 + cw / 2 + i * cw;
      g.add(box(cw - 0.06, 0.3, d - 0.7, mat(P.fabric, { rough: 0.9 }), x, seatH + 0.15, 0.2));
      g.add(box(cw - 0.06, h - seatH - 0.2, 0.35, mat(P.fabric, { rough: 0.9 }), x, seatH + (h - seatH) / 2, -d / 2 + 0.55));
    }
    legs(g, w, d, 0.18, mat(P.woodDark), 0.28);
    return g;
  },
  chair(w, d, h, P) {
    const g = new THREE.Group();
    const arm = w >= 2.4; const f = mat(P.fabric, { rough: 0.95 });
    const seatH = 1.4;
    g.add(box(w, 0.35, d, f, 0, seatH, 0));                            // seat
    g.add(box(w, 0.35, 0.32, f, 0, seatH + 0.18, 0.12));               // cushion
    g.add(box(w, h - seatH, 0.28, f, 0, seatH + (h - seatH) / 2, -d / 2 + 0.14)); // back
    if (arm) for (const s of [-1, 1]) g.add(box(0.3, 0.7, d - 0.3, f, s * (w / 2 - 0.15), seatH + 0.35, 0.05));
    legs(g, w, d, seatH, mat(P.woodDark), 0.14);
    return g;
  },
  stool(w, d, h, P) {
    const g = new THREE.Group(); const r = Math.min(w, d) / 2;
    g.add((() => { const c = cyl(r, r, 0.3, mat(P.fabric, { rough: 0.9 })); c.position.y = h; return c; })());
    const lm = mat(P.metal, { metal: 0.7, rough: 0.4 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; const l = cyl(0.04, 0.04, h, lm); l.position.set(Math.cos(a) * (r - 0.12), h / 2, Math.sin(a) * (r - 0.12)); g.add(l); }
    return g;
  },
  table_low(w, d, h, P) { return tableGeneric(w, d, h, P); },
  table_tall(w, d, h, P) { return tableGeneric(w, d, h, P); },
  storage(w, d, h, P) { return cabinet(w, d, h, P, { drawers: true }); },
  storage_sm(w, d, h, P) { return cabinet(w, d, h, P, { drawers: true, small: true }); },
  storage_tall(w, d, h, P) { return cabinet(w, d, h, P, { doors: true, tall: true }); },
  shelf(w, d, h, P) { return openShelf(w, d, h, P, 3); },
  shelf_tall(w, d, h, P) { return openShelf(w, d, h, P, 5); },
  wall_shelf(w, d, h, P) {
    const g = new THREE.Group(); const m = mat(P.wood);
    g.add(box(w, 0.12, d, m, 0, 0, 0));
    return g; // caller lifts it onto the wall
  },
  lamp_floor(w, d, h, P) {
    const g = new THREE.Group(); const m = mat(P.metal, { metal: 0.6, rough: 0.4 });
    g.add((() => { const c = cyl(w * 0.45, w * 0.5, 0.08, m); c.position.y = 0.04; return c; })());
    const pole = cyl(0.03, 0.03, h - 0.7, m); pole.position.y = (h - 0.7) / 2; g.add(pole);
    const shade = cyl(w * 0.55, w * 0.35, 0.7, mat(0xfdf3d8, { rough: 0.6, emissive: 0x3a3320 })); shade.position.y = h - 0.35; g.add(shade);
    return g;
  },
  lamp_table(w, d, h, P) {
    const g = new THREE.Group(); const m = mat(P.metal, { metal: 0.5, rough: 0.5 });
    g.add((() => { const c = cyl(w * 0.35, w * 0.4, 0.08, m); c.position.y = 0.04; return c; })());
    const pole = cyl(0.025, 0.025, h - 0.55, m); pole.position.y = (h - 0.55) / 2; g.add(pole);
    const shade = cyl(w * 0.5, w * 0.32, 0.5, mat(0xfdf3d8, { rough: 0.6, emissive: 0x3a3320 })); shade.position.y = h - 0.28; g.add(shade);
    return g;
  },
  pendant(w, d, h, P) {
    const g = new THREE.Group(); const m = mat(P.metal, { metal: 0.6, rough: 0.4 });
    const shade = cyl(w * 0.5, w * 0.2, Math.min(h, 1.2), mat(0xfdf3d8, { rough: 0.5, emissive: 0x3a3320 }));
    g.add(shade); // caller hangs it near ceiling
    return g;
  },
  rug(w, d) {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    const rr = 0.4, hw = w / 2, hd = d / 2;
    shape.absarc(0, 0, 1, 0, Math.PI * 2); // placeholder, replaced below
    const geo = new THREE.BoxGeometry(w, 0.05, d);
    const m = new THREE.Mesh(geo, mat(0xffffff, { rough: 1 }));
    m.receiveShadow = true; m.position.y = 0.025; g.add(m);
    return g; // color set by caller
  },
  plant(w, d, h, P) {
    const g = new THREE.Group();
    const pot = cyl(w * 0.35, w * 0.28, h * 0.32, mat(0xb9714e, { rough: 0.8 })); pot.position.y = h * 0.16; g.add(pot);
    const trunk = cyl(0.05, 0.06, h * 0.35, mat(0x6a4a2a)); trunk.position.y = h * 0.32 + h * 0.17; g.add(trunk);
    const green = mat(0x5f8a5a, { rough: 0.9 });
    for (const [dx, dy, dz, r] of [[0, h * 0.72, 0, w * 0.32], [w * 0.18, h * 0.6, 0.05, w * 0.22], [-0.12, h * 0.66, -0.1, w * 0.24]]) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), green); s.position.set(dx, dy, dz); s.castShadow = true; g.add(s);
    }
    return g;
  },
  mirror(w, d, h, P) {
    const g = new THREE.Group();
    g.add(box(w, h, 0.12, mat(P.wood), 0, h / 2, 0));
    g.add(box(w - 0.2, h - 0.2, 0.02, mat(0xcfe0e8, { metal: 0.9, rough: 0.08 }), 0, h / 2, 0.07));
    return g;
  },
  wall_art(w, d, h, P) {
    const g = new THREE.Group();
    g.add(box(w, h, 0.06, mat(P.woodDark), 0, 0, 0));
    g.add(box(w - 0.15, h - 0.15, 0.02, mat(P.accent, { rough: 0.8 }), 0, 0, 0.04));
    return g; // caller lifts onto wall
  },
  bathtub(w, d, h, P) {
    const g = new THREE.Group();
    g.add(box(w, h, d, mat(0xf3f2ee, { rough: 0.3 }), 0, h / 2, 0));
    g.add(box(w - 0.4, 0.3, d - 0.4, mat(0xdfe6ea, { rough: 0.2 }), 0, h - 0.15, 0));
    return g;
  },
  shower(w, d, h, P) {
    const g = new THREE.Group();
    g.add(box(w, 0.15, d, mat(0xe9e9e6, { rough: 0.3 }), 0, 0.075, 0));
    const glass = mat(0xbfe0e6, { rough: 0.05, metal: 0.1, transparent: true, opacity: 0.28 });
    g.add(box(w, h, 0.05, glass, 0, h / 2, -d / 2)); g.add(box(0.05, h, d, glass, -w / 2, h / 2, 0));
    return g;
  },
  panel(w, d, h, P) { const g = new THREE.Group(); g.add(box(w, h, 0.05, mat(P.accent, { rough: 0.95 }), 0, h / 2, 0)); return g; },
  box(w, d, h, P) { const g = new THREE.Group(); g.add(box(w, h, d, mat(P.wood), 0, h / 2, 0)); return g; },
};

function tableGeneric(w, d, h, P) {
  const g = new THREE.Group();
  g.add(box(w, 0.14, d, mat(P.wood), 0, h - 0.07, 0));
  legs(g, w, d, h - 0.14, mat(P.woodDark), 0.16);
  return g;
}
function cabinet(w, d, h, P, { drawers, doors, small, tall } = {}) {
  const g = new THREE.Group(); const body = mat(P.wood);
  const baseH = 0.18;
  g.add(box(w, h - baseH, d, body, 0, baseH + (h - baseH) / 2, 0));
  legs(g, w, d, baseH, mat(P.woodDark), 0.1);
  const front = d / 2 + 0.005;
  const knob = mat(P.metal, { metal: 0.7, rough: 0.3 });
  if (doors) {
    for (const s of [-1, 1]) {
      g.add(box(w / 2 - 0.05, h - baseH - 0.1, 0.02, mat(P.woodDark, { rough: 0.6 }), s * w / 4, baseH + (h - baseH) / 2, front));
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), knob); k.position.set(s > 0 ? 0.08 : -0.08, h * 0.5, front + 0.02); g.add(k);
    }
  } else {
    const rows = small ? 1 : 3; const dh = (h - baseH - 0.15) / rows;
    for (let i = 0; i < rows; i++) {
      const y = baseH + 0.08 + dh / 2 + i * dh;
      g.add(box(w - 0.12, dh - 0.06, 0.02, mat(P.woodDark, { rough: 0.6 }), 0, y, front));
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), knob); k.position.set(0, y, front + 0.02); g.add(k);
    }
  }
  return g;
}
function openShelf(w, d, h, P, rows) {
  const g = new THREE.Group(); const m = mat(P.wood);
  for (const s of [-1, 1]) g.add(box(0.1, h, d, m, s * (w / 2 - 0.05), h / 2, 0));
  for (let i = 0; i <= rows; i++) { const y = (i / rows) * (h - 0.1) + 0.05; g.add(box(w, 0.1, d, m, 0, y, 0)); }
  g.add(box(w, h, 0.08, mat(P.woodDark), 0, h / 2, -d / 2 + 0.04)); // back
  return g;
}

// wall-mounted archetypes get lifted to a sensible height on their nearest wall
const WALL_ITEMS = new Set(['wall_art', 'wall_shelf', 'pendant']);
const CEIL_ITEMS = new Set(['pendant']);

// ---- main viewer ----------------------------------------------------------
export function createRoomViewer(container, opts = {}) {
  const P = pal(opts.style);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(opts.background || 0xf2efe9);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  // canvas is inline by default, which leaves a descender gap and can nudge
  // the container taller each layout pass
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 4;

  // lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d7b6a, 0.55));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.15);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024);  // 2048 was 4x the texels for no visible gain at this size
  key.shadow.camera.near = 1; key.shadow.camera.far = 60;
  key.shadow.camera.left = -20; key.shadow.camera.right = 20; key.shadow.camera.top = 20; key.shadow.camera.bottom = -20;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfeaff, 0.35); fill.position.set(-8, 6, -6); scene.add(fill);

  const roomGroup = new THREE.Group(); scene.add(roomGroup);

  // Render on demand, not every frame. The old loop re-rendered continuously
  // — soft shadows off a 2048 map at devicePixelRatio 2 — even when nobody was
  // touching the room, which kept a core busy for the whole time the results
  // page was open. Now a frame is drawn only when the camera actually moves
  // (OrbitControls.update() reports that, and keeps reporting it while damping
  // settles) or when something explicitly asks for one.
  let raf = null;
  function drawFrame() {
    raf = null;
    const moving = controls.update();
    renderer.render(scene, camera);
    if (moving) requestFrame();       // keep going until damping settles
  }
  function requestFrame() {
    if (raf === null) raf = requestAnimationFrame(drawFrame);
  }
  controls.addEventListener('change', requestFrame);
  requestFrame();

  function resize() {
    const w = container.clientWidth || 800, h = container.clientHeight || 500;
    // NB: updateStyle must stay on (the 3rd arg defaults to true). With it off,
    // three sets only the canvas width/height attributes — and since
    // setPixelRatio is 2 on a retina screen, a canvas with no CSS size renders
    // at 2x the container, overflows it, grows the auto-height parent, and
    // re-triggers this ResizeObserver in a runaway loop.
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    requestFrame();
  }
  const ro = new (window.ResizeObserver || function () { this.observe = () => {}; this.disconnect = () => {}; })(resize);
  ro.observe(container); resize();

  function clear() { while (roomGroup.children.length) { const c = roomGroup.children.pop(); c.traverse?.(o => { o.geometry?.dispose?.(); }); } }

  function render(layout) {
    clear();
    // Room size in FEET. widthFt/lengthFt come straight from the saved room dims
    // (RoomResult already resolves them). roomPoints (editor px @ `scale`) is only
    // a fallback if the feet dims are somehow missing.
    let W = layout.widthFt || 12, L = layout.lengthFt || 14;
    const pts = (layout.roomPoints || []);
    if ((!layout.widthFt || !layout.lengthFt) && pts.length >= 3) {
      const scale = layout.scale || 20;
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      W = (Math.max(...xs) - Math.min(...xs)) / scale;
      L = (Math.max(...ys) - Math.min(...ys)) / scale;
    }
    const H = layout.heightFt || 9;
    // IMPORTANT: furniture x/y are in FEET, measured from the room's TOP-LEFT
    // origin (0..W, 0..L) — see PlacementPos in furniturePlacement.ts. The room
    // mesh is centred on the world origin, so a piece whose top-left corner is
    // (fx,fy) with footprint (w,d) has its CENTRE at (fx + w/2 - W/2, fy + d/2 - L/2).
    // (The old code divided these feet by `scale` as if they were pixels, which
    // collapsed every piece to ~0,0 — the "furniture doesn't show up" bug.)
    const placeXZ = (fx, fy, w, d) => [
      (Number.isFinite(fx) ? fx : W / 2) + w / 2 - W / 2,
      (Number.isFinite(fy) ? fy : L / 2) + d / 2 - L / 2,
    ];

    // ---- room shell -------------------------------------------------------
    // roomPoints / elements / cutouts all arrive in EDITOR PIXELS at `scale`
    // (20px = 1ft), with y growing downward. Convert to feet and centre on the
    // origin so they line up with the furniture, whose feet are already
    // measured from the room's top-left.
    const pxScale = layout.scale || 20;
    const px = pts.length >= 3 ? pts.map(p => p.x) : null;
    const py = pts.length >= 3 ? pts.map(p => p.y) : null;
    const originX = px ? Math.min(...px) : 0;
    const originY = py ? Math.min(...py) : 0;
    const toFt = (p) => ({
      x: (p.x - originX) / pxScale - W / 2,
      z: (p.y - originY) / pxScale - L / 2,
    });
    // Fall back to the plain rectangle when there is no saved polygon.
    const outline = pts.length >= 3
      ? pts.map(toFt)
      : [
          { x: -W / 2, z: -L / 2 }, { x: W / 2, z: -L / 2 },
          { x: W / 2, z: L / 2 },   { x: -W / 2, z: L / 2 },
        ];

    // Floor built from the actual polygon, with cutouts punched out as holes
    // (the old flat box could not represent either).
    const floorShape = new THREE.Shape(outline.map(p => new THREE.Vector2(p.x, p.z)));
    for (const cut of layout.cutouts || []) {
      const cp = (cut.points || []).filter(pt => Number.isFinite(pt.x) && Number.isFinite(pt.y));
      if (cp.length < 3) continue;
      floorShape.holes.push(new THREE.Path(cp.map(toFt).map(p => new THREE.Vector2(p.x, p.z))));
    }
    const floorGeo = new THREE.ExtrudeGeometry(floorShape, { depth: 0.1, bevelEnabled: false });
    // Shape lives in XY; rotate so its Y becomes world Z and the extrusion
    // hangs downward, leaving the walking surface at y = 0.
    floorGeo.rotateX(Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, mat(P.floor, { rough: 0.9 }));
    floor.receiveShadow = true;
    roomGroup.add(floor);

    // Dollhouse: only the two far sides get walls, so the room stays open toward
    // the camera at +X/+Z. Every edge is still tracked, because openings on the
    // omitted sides are marked on the floor instead.
    const cx0 = outline.reduce((sum, p) => sum + p.x, 0) / outline.length;
    const cz0 = outline.reduce((sum, p) => sum + p.z, 0) / outline.length;
    const wm = mat(P.wall, { rough: 0.95 });
    const edges = [];
    for (let i = 0; i < outline.length; i += 1) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const midX = (a.x + b.x) / 2, midZ = (a.z + b.z) / 2;
      const angle = Math.atan2(dz, dx);
      // Outward normal = midpoint pushed away from the room centre. Far walls
      // are the ones whose outward direction points away from the camera.
      const outX = midX - cx0, outZ = midZ - cz0;
      const isFarWall = (outX + outZ) < 0;
      edges.push({ a, b, midX, midZ, angle, len, isFarWall });
      if (!isFarWall) continue;

      const wall = box(len, H, 0.2, wm, midX, H / 2, midZ);
      wall.rotation.y = -angle;
      roomGroup.add(wall);
      const baseboard = box(len, 0.3, 0.22, mat(P.woodDark), midX, 0.15, midZ);
      baseboard.rotation.y = -angle;
      roomGroup.add(baseboard);
    }

    // ---- doors and windows ------------------------------------------------
    // Drawn as framed panels set into the wall face rather than boolean holes:
    // no CSG dependency, and they stay legible from any orbit angle.
    const nearestEdge = (p) => {
      let best = null, bestD = Infinity;
      for (const e of edges) {
        const vx = e.b.x - e.a.x, vz = e.b.z - e.a.z;
        const lenSq = vx * vx + vz * vz || 1;
        let t = ((p.x - e.a.x) * vx + (p.z - e.a.z) * vz) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const cxp = e.a.x + vx * t, czp = e.a.z + vz * t;
        const d = Math.hypot(p.x - cxp, p.z - czp);
        if (d < bestD) { bestD = d; best = { edge: e, x: cxp, z: czp }; }
      }
      return best;
    };
    const glass = mat(0xbcd8ec, { rough: 0.1, metal: 0.05 });
    glass.transparent = true; glass.opacity = 0.55;
    for (const el of layout.elements || []) {
      if (!el || (el.type !== 'door' && el.type !== 'window')) continue;
      if (!Number.isFinite(el.x) || !Number.isFinite(el.y)) continue;
      const spot = nearestEdge(toFt(el));
      if (!spot) continue;
      const isDoor = el.type === 'door';
      // `width` is stored in editor px for windows; doors use a 3ft standard.
      const wFt = isDoor ? 3 : Math.max(1.5, (Number(el.width) || 60) / pxScale);
      const hFt = isDoor ? Math.min(6.8, H - 0.2) : Math.min(3.6, H - 3);
      const sill = isDoor ? hFt / 2 : Math.min(3, H - hFt - 0.4) + hFt / 2;
      const g = new THREE.Group();
      // frame sits a hair proud of the wall on both faces so it reads from
      // inside and out
      g.add(box(wFt + 0.22, hFt + 0.22, 0.3, mat(P.woodDark), 0, 0, 0));
      g.add(box(wFt, hFt, 0.34, isDoor ? mat(P.wood) : glass, 0, 0, 0));
      if (isDoor) {
        // handle, on the +X side of the leaf
        const knob = cyl(0.07, 0.07, 0.16, mat(P.metal, { metal: 0.7, rough: 0.35 }));
        knob.rotation.z = Math.PI / 2;
        knob.position.set(wFt / 2 - 0.35, 0, 0.2);
        g.add(knob);
      }
      // The 3D panel only makes sense where there is a wall to set it into.
      if (spot.edge.isFarWall) {
        g.position.set(spot.x, sill, spot.z);
        g.rotation.y = -spot.edge.angle;
        roomGroup.add(g);
      }

      // Floor marking, drawn for every opening so the ones on the two open
      // sides are still readable: a threshold strip across the gap, plus a
      // quarter-circle swing arc for doors (the floor-plan convention).
      // Doors use BluPrint's rose, windows the palette accent, so the two read
      // apart at a glance. (No palette defines a rose, hence the literal.)
      const markColour = isDoor ? 0xd3968c : P.accent;
      const markMat = mat(markColour, { rough: 0.9 });
      const strip = box(wFt, 0.04, isDoor ? 0.5 : 0.28, markMat, spot.x, 0.02, spot.z);
      strip.rotation.y = -spot.edge.angle;
      strip.castShadow = false;
      roomGroup.add(strip);

      if (isDoor) {
        // Hinge at one end of the opening; sweep the arc toward the room.
        const along = { x: Math.cos(spot.edge.angle), z: Math.sin(spot.edge.angle) };
        const hinge = { x: spot.x - along.x * (wFt / 2), z: spot.z - along.z * (wFt / 2) };
        const inward = { x: cx0 - spot.x, z: cz0 - spot.z };
        // Which way does the arc turn? Cross product of the wall direction with
        // the inward direction gives the sign.
        const turn = (along.x * inward.z - along.z * inward.x) >= 0 ? 1 : -1;
        const arc = new THREE.Mesh(
          new THREE.RingGeometry(wFt - 0.06, wFt, 32, 1, 0, Math.PI / 2),
          markMat,
        );
        arc.rotation.x = -Math.PI / 2;                       // lay it flat
        arc.rotation.z = turn > 0
          ? -spot.edge.angle
          : -spot.edge.angle - Math.PI / 2;                  // sweep into the room
        arc.position.set(hinge.x, 0.02, hinge.z);
        arc.receiveShadow = false;
        roomGroup.add(arc);
      }
    }

    // furniture
    for (const f of layout.furnitureLayout || []) {
      if (f.hidden) continue;
      const entry = catalogEntry(f.category);
      const [cwIn, cdIn, chIn] = entry.dimsIn;
      // prefer the real product size (wIn/dIn/hIn) when known; else catalog defaults
      const w = (f.wIn || cwIn) * IN, d = (f.dIn || cdIn) * IN, h = (f.hIn || chIn) * IN;
      const build = BUILDERS[entry.archetype] || BUILDERS.box;
      // tint the piece toward its product color (matches the 2D preview) when given
      // Match the 2D preview, which fills the whole piece with the resolved
      // product colour. Overriding only wood+fabric left legs and frames on the
      // palette's woodDark — the most-used key in the builders — so a walnut
      // sofa came out with walnut cushions and generic dark legs. Derive the
      // frame tone from the product colour instead of ignoring it.
      const Pi = f.color
        ? { ...P, wood: f.color, fabric: f.color, woodDark: shadeHex(f.color, 0.62) }
        : P;
      const g = build(w, d, h, Pi);
      if (entry.archetype === 'rug') g.traverse(o => { if (o.material) o.material = mat(f.color || P.accent, { rough: 1 }); if (o.position) o.position.y = 0.025; });
      const [x, z] = placeXZ(f.x, f.y, w, d);
      g.position.set(x, 0, z);
      g.rotation.y = (-(f.rot || 0) * Math.PI) / 180;
      // lift wall/ceiling items
      if (CEIL_ITEMS.has(entry.archetype)) g.position.y = H - Math.min(h, 1.4) - 0.2 + h / 2;
      else if (entry.archetype === 'wall_art') g.position.y = H * 0.55;
      else if (entry.archetype === 'wall_shelf') g.position.y = H * 0.5;
      roomGroup.add(g);
    }

    // frame camera
    const maxD = Math.max(W, L);
    controls.target.set(0, Math.min(H * 0.35, 2.5), 0);
    camera.position.set(W * 0.55 + maxD * 0.7, H * 0.9 + maxD * 0.35, L * 0.55 + maxD * 0.7);
    camera.near = 0.1; camera.far = maxD * 20; camera.updateProjectionMatrix();
    key.position.set(W * 0.4 + 6, H + 10, L * 0.2 + 8);
    controls.update();
    requestFrame();   // rendering is on demand now — the scene just changed
  }

  function dispose() { if (raf !== null) cancelAnimationFrame(raf); ro.disconnect?.(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); }
  return { render, dispose, scene, camera, renderer };
}
