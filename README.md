# BluPrint

AI-powered interior design tool. Draw your room, upload inspiration, pick a vibe, and get furniture recommendations you can actually buy — laid out in 2D and 3D.

## Setup

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

`npm run dev` starts the frontend and backend together. Both `.env` files below need to exist first.

## Pages

| URL | Page |
|-----|------|
| `/` | Landing page |
| `/login.html` | Sign in / sign up |
| `/dashboard.html` | Dashboard — your recent rooms |
| `/room-dimensions.html` | Photo tab: upload a photo and we estimate the size. Dimensions tab: draw the room, place doors and windows (Saanvi) |
| `/inspo-upload.html` | Upload inspiration → refine style picks → AI analysis (Nidhi + Aditi) |
| `/room-result.html` | Furniture results: 2D plan next to a render of your own photo, or a 3D view when there is no photo (Prisha) |
| `/past-inspiration.html` | All saved projects |

## Firebase

Copy `.env.example` to `.env` in the project root and fill in your Firebase web app config:

```bash
cp .env.example .env
```

Get the values from **Firebase Console → Project settings → Your apps → Web app → Config**.

Then enable **Email/Password** and **Google** sign-in under **Firebase Console → Build → Authentication → Sign-in method**.

Restart the dev server after updating `.env`.

## Backend

Copy `server/.env.example` to `server/.env` and fill in:

```
MONGODB_URI=             # MongoDB Atlas connection string
PORT=3001
CLOUDINARY_CLOUD_NAME=   # from cloudinary.com → Dashboard
CLOUDINARY_API_KEY=      # from cloudinary.com → Dashboard
CLOUDINARY_API_SECRET=   # from cloudinary.com → Dashboard
OPENAI_API_KEY=          # from platform.openai.com → API keys
SERPER_API_KEY=          # from serper.dev (shopping search)
FIREBASE_PROJECT_ID=     # same value as VITE_FIREBASE_PROJECT_ID in the root .env
OPENAI_IMAGE_MODEL=gpt-image-1     # room photo renders (optional, this is the default)
OPENAI_IMAGE_QUALITY=medium        # optional
OPENAI_IMAGE_INPUT_FIDELITY=high   # optional; keeps the original room as it is
```

Image edits cost far more per call than chat completions, which is why medium
quality is the default. Raise `OPENAI_IMAGE_QUALITY` to `high` only if the renders
are worth it to you. The output size follows the photo's orientation unless
`OPENAI_IMAGE_SIZE` is set. `OPENAI_IMAGE_INPUT_FIDELITY=high` tells the model to
hold the walls, floor, windows and lighting steady and change only the furniture;
if the model in use rejects the parameter, the render retries without it and
logs that it did.

### Photo mode and renders

On the dimensions page the **Photo** tab (the default) takes a photo of the room
instead of a drawing. The server uploads it to Cloudinary and asks GPT-4o Vision
for the room type, size and the furniture already in it (`POST /api/rooms/photo-analyze`),
and the estimate fills the same width/length inputs the editor uses. The
**Dimensions** tab is the drawing editor as before.

When a room has a photo, the results page shows it in place of the 3D view with a
**Render my room** button. That calls `POST /api/rooms/:roomId/render`, which
composites the currently visible products into the photo with the OpenAI image
edit endpoint (the real product photos are passed as references), then asks
GPT-4o where each product landed so the page can draw hover hotspots with Buy
links. Renders only run from that button and **Re-render**, never automatically,
and the last render is saved on the room so a revisit shows it instantly.

### Getting Cloudinary credentials
1. Sign up at [cloudinary.com](https://cloudinary.com) (free tier is enough)
2. After login, your **Dashboard** shows Cloud Name, API Key, and API Secret at the top

### Getting the OpenAI API key
1. Go to [platform.openai.com](https://platform.openai.com) and sign in
2. Profile icon (top right) → **API keys** → **Create new secret key**
3. Copy the key — you won't be able to see it again
4. Add a payment method under **Billing** (GPT-4o Vision costs ~$0.01–0.05 per analysis call)

## Project structure

```
src/
  components/
    RoomSVG.tsx          2D floor plan
    Room3DView.tsx       React wrapper for the 3D viewer (rooms without a photo)
    RoomRenderView.tsx   your photo with the products rendered in, plus hover hotspots
    FurnitureCard.tsx    furniture item card
    FurniturePanel.tsx   furniture list + budget tracker
  pages/
    RoomResult.tsx       room result page
room3d/                  Three.js room viewer (plain JS)
server/
  routes/render.js       POST /api/rooms/:id/render
  services/roomPhotoAnalyzer.js   size + type estimate from a room photo
  services/roomRenderer.js        image edit + hotspot pass
  utils/cloudinary.js    shared upload helper
public/                  scripts served as-is — see the note below
design-system.css        shared styling for every page
mobile-ui.css / .js      phone layout, loaded on top of the design system
firebase.mjs             Firebase config + auth exports
```

Each page is its own HTML file at the repo root, listed in `vite.config.ts`.

### Two things worth knowing

**Scripts belong in `public/`.** Vite bundles CSS links and module scripts, but a plain
`<script src="./thing.js">` is left alone *and not copied into `dist/`*. Since the server
answers anything it can't find with `index.html`, a missing script comes back as HTML and
silently fails in production. Anything loaded that way — `mobile-ui.js`, `theme-toggle.js`,
`blueprint-bg.js` — lives in `public/`, which Vite copies verbatim.

**Adding a page means editing `vite.config.ts`.** Only the HTML files listed under
`build.rollupOptions.input` get built. A new page works in dev and 404s in production
until it's added there.

## Mobile

Phone layout lives in `mobile-ui.css` and `mobile-ui.js`, loaded after `design-system.css`.
Every rule sits inside `@media (max-width: 600px)`, and the elements `mobile-ui.js` injects
are hidden above that width — so desktop is untouched. It adds a bottom nav dock, a
compact step header, and a draggable element sheet on the room-dimensions page.

## Dark mode

Toggled from the nav, stored in `localStorage` under `blueprintTheme`. The app pages theme
themselves from the `--bp-*` variables in `design-system.css`. The landing page has its own
palette in `index.html`, so it carries a second block of `html.dark-mode` rules for the
components that hardcode light colors.

## Team

| Section | Owner |
|---------|-------|
| Room dimensions + SVG | Saanvi |
| Inspo upload + style picker | Nidhi |
| AI style analysis | Aditi |
| 2D room result + furniture | Prisha |
