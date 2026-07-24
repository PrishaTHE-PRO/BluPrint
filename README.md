# BluPrint

AI-powered interior design tool. Upload your room, pick a vibe, and get furniture recommendations.

## Setup

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Pages

| URL | Page |
|-----|------|
| `/` | Login / Sign up |
| `/dashboard.html` | Dashboard |
| `/room-dimensions.html` | Room dimensions + blueprint (Saanvi) |
| `/inspo-upload.html` | 2-step: upload inspiration image → refine style picks → AI analysis (Nidhi + Aditi) |
| `/room-result.html` | 2D room result + furniture with real AI data (Prisha) |


## Firebase

Copy `.env.example` to `.env` in the project root and fill in your Firebase web app config:

```bash
cp .env.example .env
```

Get the values from **Firebase Console → Project settings → Your apps → Web app → Config**.

Then enable **Email/Password** and **Google** sign-in under **Firebase Console → Build → Authentication → Sign-in method**.

Restart the dev server after updating `.env` (`npm run dev`).

## Backend

Copy `server/.env.example` to `server/.env` and fill in the values below. Then `npm run dev` starts the frontend and backend together.

```
MONGODB_URI=          # MongoDB Atlas connection string
PORT=3001
CLOUDINARY_CLOUD_NAME=   # from cloudinary.com → Dashboard
CLOUDINARY_API_KEY=      # from cloudinary.com → Dashboard
CLOUDINARY_API_SECRET=   # from cloudinary.com → Dashboard
OPENAI_API_KEY=          # from platform.openai.com → API keys
```

### Getting Cloudinary credentials
1. Sign up at [cloudinary.com](https://cloudinary.com) (free tier is enough)
2. After login, your **Dashboard** shows Cloud Name, API Key, and API Secret at the top

### Getting the OpenAI API key
1. Go to [platform.openai.com](https://platform.openai.com) and sign in
2. Click your profile icon (top right) → **API keys** → **Create new secret key**
3. Copy the key — you won't be able to see it again
4. Add a payment method under **Billing** (GPT-4o Vision costs ~$0.01–0.05 per analysis call)

## Project Structure

```
src/
  components/
    RoomSVG.tsx           2D floor plan
    FurnitureCard.tsx     furniture item card
    FurniturePanel.tsx    furniture list + budget tracker
  pages/
    RoomResult.tsx        room result page
index.html                login page
dashboard.html            dashboard
room-result.html          room planner entry point
firebase.mjs               Firebase config + auth exports
```

## Team

| Section | Owner |
|---------|-------|
| Room dimensions + SVG | Saanvi |
| Inspo upload + style picker | Nidhi |
| AI style analysis | Aditi |
| 2D room result + furniture | Prisha |
