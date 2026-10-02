# BluPrint

AI-powered interior design tool. Define your room with a photo or a drawing, upload inspiration, pick a vibe, and get furniture you can actually buy, laid out in a 2D plan and rendered into a photo of your own room (or a 3D view when there is no photo).

## Setup

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

`npm run dev` starts the Vite dev server (port 5173) and the API (port 3001) together, with `/api` proxied to the API. Both `.env` files below need to exist first.

### Running it the way Render runs it

```bash
npm run build
npm start
```

This builds `dist/` and serves it from the API on port 3001, which is exactly what production does. The dev server injects CSS in a different order than the build, and this app leans on cascade order, so check anything visual against the production build before calling it a bug.

## Pages

| URL | Page |
|-----|------|
| `/` | Landing page |
| `/login.html` | Sign in / sign up |
| `/dashboard.html` | Dashboard: your recent rooms |
| `/room-dimensions.html` | Define the room. **Image Upload** (default): upload a photo and the size is estimated. **Draw Room**: draw the walls and place doors and windows (Saanvi) |
| `/inspo-upload.html` | Upload inspiration, refine style picks, AI analysis (Nidhi + Aditi) |
| `/room-result.html` | Results: 2D plan next to a render of your photo, or a 3D view when the room has no photo (Prisha) |
| `/past-inspiration.html` | All saved projects |

## How a room becomes a design

1. **Define the room.** Image Upload sends the photo to Cloudinary and asks GPT-4o Vision for the room type, size, ceiling height and the furniture already in it. The estimate fills the same width and length fields the editor uses, so you can switch to Draw Room and adjust it. Draw Room is the drawing editor.
2. **Inspiration.** Upload up to three images or a Pinterest board and pick a style, colours and mood. GPT-4o Vision analyses the images for a style, a palette and mood tags. Your own picks always win where they overlap.
3. **Results.** GPT-4o plans what the room should hold (categories, real sizes, a search phrase each, capped by floor area). Each category is searched on Serper Shopping, every product is scored against the style, palette and mood, and the best-matching set that fits the budget is chosen. The plan is interactive; with a photo, **Render my room** places the chosen products into it.

## Firebase (sign-in)

Create a `.env` file in the project root with your Firebase web app config:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

Get the values from **Firebase Console > Project settings > Your apps > Web app > Config**.

Then enable **Email/Password** and **Google** sign-in under **Firebase Console > Build > Authentication > Sign-in method**.

Restart the dev server after updating `.env`.

## Backend

Copy `server/.env.example` to `server/.env` and fill in:

```
MONGODB_URI=             # MongoDB Atlas connection string
PORT=3001
CLOUDINARY_CLOUD_NAME=   # from cloudinary.com > Dashboard
CLOUDINARY_API_KEY=      # from cloudinary.com > Dashboard
CLOUDINARY_API_SECRET=   # from cloudinary.com > Dashboard
OPENAI_API_KEY=          # from platform.openai.com > API keys
SERPER_API_KEY=          # from serper.dev (shopping search)
FIREBASE_PROJECT_ID=     # same value as VITE_FIREBASE_PROJECT_ID in the root .env
CORS_ORIGINS=            # optional; only if a separate front-end origin calls this API

OPENAI_IMAGE_MODEL=gpt-image-1     # room photo renders (optional, this is the default)
OPENAI_IMAGE_QUALITY=medium        # optional
OPENAI_IMAGE_INPUT_FIDELITY=high   # optional; keeps the original room as it is
# OPENAI_IMAGE_SIZE=1536x1024      # optional; otherwise the size follows the photo's shape
```

`FIREBASE_PROJECT_ID` is required. The API verifies sign-in tokens against it and answers 503 on every room route until it is set. Locally the server also reads the root `.env`, so `VITE_FIREBASE_PROJECT_ID` there is enough.

Image edits cost far more per call than chat completions, which is why medium quality is the default. Raise `OPENAI_IMAGE_QUALITY` to `high` only if the renders are worth it to you.

The server uses `sharp` for image work (drawing the locate grid, cropping). It ships prebuilt binaries, so `npm install` is enough on Render and on a Mac.

### Getting Cloudinary credentials
1. Sign up at [cloudinary.com](https://cloudinary.com) (the free tier is enough)
2. After login, your **Dashboard** shows Cloud Name, API Key and API Secret at the top

### Getting the OpenAI API key
1. Go to [platform.openai.com](https://platform.openai.com) and sign in
2. Profile icon (top right) > **API keys** > **Create new secret key**
3. Copy the key; you will not be able to see it again
4. Add a payment method under **Billing**. A Vision analysis costs a few cents; an image render costs noticeably more

### Getting the Serper key
Sign up at [serper.dev](https://serper.dev) and copy the API key from the dashboard. It powers the shopping search behind every furniture recommendation.

## Authentication and limits

Every `/api/rooms` route requires a signed-in user. The client sends the Firebase ID token through `authedFetch` in `firebase.mjs`; the server verifies it and takes the room's owner from the token, never from the request. A room that belongs to someone else answers 404.

Rate limits are per IP: 120 requests a minute on `/api`, and 12 a minute on the routes that cost money per call (style analysis, furniture search, Pinterest, uploads, photo analysis, renders).

Anything the server fetches on your behalf (the image proxy, product photos, Pinterest boards) refuses private and loopback addresses, and the Pinterest scraper only accepts real Pinterest hosts.

## Image Upload and renders

On the dimensions page, **Image Upload** takes a photo instead of a drawing. The photo is resized in the browser to at most 2048 px before upload, so phone photos never hit the size limit. `POST /api/rooms/photo-analyze` stores it on Cloudinary and returns the estimate; if the estimate fails, the room falls back to 12 x 12 ft and the panel says so. Save & Continue is blocked in this mode until a photo has been analysed.

When a room has a photo, the results page shows it in place of the 3D view with **Render my room**. That calls `POST /api/rooms/:roomId/render`, which sends the room photo and the real product photos to the OpenAI image edit endpoint with `input_fidelity` on, so the walls, floor, windows and lighting stay as they are and only the furniture changes. The output size follows the photo's shape. Renders only run from that button and **Re-render**, never automatically, and the last render is saved on the room so a revisit shows it instantly. Removing the photo (switching to Draw Room and saving) clears the render too.

After a render, the server also works out where each product landed: a lettered grid is drawn over a copy of the render and GPT-4o reports cell ranges, then each piece is cropped and asked about again on a finer grid. The hover boxes this produces are currently switched off on the page (`SHOW_HOTSPOTS` in `RoomRenderView.tsx`); the data is still saved with every render, and `POST /api/rooms/:roomId/render/hotspots` recomputes it without a new picture.

## How furniture is chosen

- **What to buy** comes from GPT-4o (`furniturePlanner.js`): categories scoped to the room type, real dimensions, a budget split and a search phrase per piece, with the number of pieces capped by floor area. A bigger budget buys better pieces, not more of them. If the planner is unavailable, a fixed table per room type is used.
- **Where to buy it** comes from Serper Shopping, one search per category, with a local fallback catalog so a room is never empty.
- **Which product wins** is decided by matching, not price alone. The user's style, palette and mood are merged with what Vision read off the inspiration images, every product title is scored against them, and among the combinations that fit the budget the highest-scoring one is chosen. Prices shown are the real prices.
- **Over budget** is reported honestly, with a **Generate under budget** option that drops the most optional pieces until the set fits. **Regenerate** re-runs the search; results are otherwise cached for 15 minutes per room.

## Project structure

```
src/
  components/
    RoomSVG.tsx              2D floor plan (drag furniture, link to the strip)
    Room3DView.tsx           3D viewer wrapper, used when the room has no photo
    RoomRenderView.tsx       your photo with the products rendered in
    FurnitureCard.tsx        furniture item card
    FurniturePanel.tsx       furniture list, budget notice, panes
    FurnitureLoadingOverlay.tsx
  pages/RoomResult.tsx       results page
  utils/                     placement, layout, colour helpers
room3d/                      Three.js room viewer (plain JS) + furniture catalog
server/
  index.js                   Express app, CORS, rate limits, static dist
  middleware/auth.js         Firebase token check + room ownership
  routes/
    rooms.js                 rooms CRUD + photo-analyze
    inspo.js                 inspiration images, style picks, budget
    styleRoutes.js           GPT-4o Vision style analysis
    furniture.js             planner + Serper search + budget picker
    render.js                render + hotspot refresh
    imageProxy.js            colour sampling proxy for product images
  services/
    furniturePlanner.js      what the room should hold
    styleAnalyzer.js         style, palette and mood from inspiration images
    roomPhotoAnalyzer.js     size and type from a room photo
    roomRenderer.js          image edit + hotspot passes
    gridLocator.js           grid-based product location
    pinterestScraper.js
  utils/
    cloudinary.js            shared upload helper
    safeRequest.js           outbound fetch guard (no private addresses)
public/                      scripts served as-is (see below)
  mobile-ui.js, new-room.js, theme-toggle.js, blueprint-bg.js
design-system.css            shared styling for every page
mobile-ui.css                phone layout, loaded on top of the design system
firebase.mjs                 Firebase config, auth exports, authedFetch
```

Each page is its own HTML file at the repo root, listed in `vite.config.ts`.

### Two things worth knowing

**Scripts belong in `public/`.** Vite bundles CSS links and module scripts, but a plain `<script src="./thing.js">` is left alone and not copied into `dist/`. Since the server answers anything it cannot find with `index.html`, a missing script comes back as HTML and silently fails in production. Anything loaded that way lives in `public/`, which Vite copies verbatim.

**Adding a page means editing `vite.config.ts`.** Only the HTML files listed under `build.rollupOptions.input` get built. A new page works in dev and 404s in production until it is added there.

## Mobile

Phone layout lives in `mobile-ui.css` and `public/mobile-ui.js`, loaded after `design-system.css`. Every rule sits inside `@media (max-width: 600px)`, and the elements `mobile-ui.js` injects are hidden above that width, so desktop is untouched. It adds a bottom nav dock with a New room button, a compact step header, and a draggable element sheet on the room-dimensions page.

## Dark mode

Toggled from the nav, stored in `localStorage` under `blueprintTheme`. The app pages theme themselves from the `--bp-*` variables in `design-system.css`. The landing page has its own palette in `index.html`, so it carries a second block of `html.dark-mode` rules for the components that hardcode light colours.

## Team

| Section | Owner |
|---------|-------|
| Room dimensions + SVG | Saanvi |
| Inspo upload + style picker | Nidhi |
| AI style analysis | Aditi |
| Room result, furniture, photo renders | Prisha |
