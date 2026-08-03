# BluPrint 3D room viewer + real furniture catalog

Replaces the sketch preview with a clean, orbitable 3D room. Furniture renders
as real models (legs, cushions, drawers, shelves) sized to real-world
dimensions — not sketches — across every category your app uses. Built on
Three.js. **No Pascal, no Next.js, no dependency mess.**

## Files

- `room3d/room3d.js` — the viewer. `createRoomViewer(container, { style })` →
  `{ render(layout), dispose() }`. Takes the *same* room layout shape
  `iso-preview.js` already produces (roomPoints in px, `furnitureLayout` with
  `category`, `x`, `y`, `rot`).
- `room3d/furniture-catalog.js` — every category key → real dimensions (inches),
  price range, style tags, a shopping link, and which 3D shape to draw. This is
  the reliable dimension source (Serper title-parsing is flaky); it also drives
  correct 3D scale.
- `room3d/furniture-prompt.js` — a tightened, **structured** GPT-4o prompt +
  JSON schema. GPT returns validated picks (category, real dimensions, style
  tags, price, priority, shopping query) instead of prose.
- `room3d/room3d-demo.js` + `room3d.html` — a runnable demo with a style switcher.

## See it now (zero install)

`room3d.html` loads Three.js from a CDN via an importmap, so you can just:

```bash
npm run dev:client
```

then open **http://localhost:5173/room3d.html**. Drag to orbit; use the Style
dropdown. (If your network blocks the CDN, do the production step below instead.)

## Use it in the app (production)

Install Three.js once (trivial, universally Vite-compatible — unlike Pascal):

```bash
npm install three
```

Then render a real room where you show the preview today:

```js
import { createRoomViewer } from './room3d/room3d.js';
const viewer = createRoomViewer(el, { style: userStyle });
viewer.render(room);   // room = the layout you already store (roomPoints + furnitureLayout)
```

The same bare `import ... from 'three'` works both ways: the CDN importmap
resolves it for the standalone preview, and `npm install three` resolves it in
your Vite build. Nothing else changes.

## Furniture categories covered

All of yours — living, bedroom, kitchen, bath, office, dining, nursery, plus
feature pieces (reading nook, plants, mirror, wall art, shelves…). Each maps to
one of ~18 clean archetypes (bed, sofa, chair, table, dresser/cabinet, open
shelf, lamps, pendant, rug, plant, mirror, bathtub, shower…). Unknown keys fall
back to a clean box. Add or refine sizes in `furniture-catalog.js`.

## How the three pieces fit together

1. **Catalog** gives every pick a real size → furniture renders at true scale in
   both your 2D plan and the new 3D view.
2. **GPT prompt** (`furniture-prompt.js`) picks *what* to buy as structured JSON;
   feed each `search_query` into your existing Serper call in
   `server/routes/furniture.js` to get the real product (price, image, buy link),
   and keep GPT's dimensions for scale.
3. **Viewer** (`room3d.js`) draws the room + those picks in clean 3D.

## Notes / next steps

- Wall-mounted items (art, mirror, pendant) are placed at sensible heights; if
  you store which wall they belong to, that can be made exact.
- Want photoreal instead of stylized? The same layout can drive an AI render
  API — separate add-on.
- Want real 3D *models* (GLB) instead of procedural shapes for hero pieces? Drop
  GLBs in `public/models/` and load them per category — the viewer can mix both.
