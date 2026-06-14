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
| `/room-result.html` | Room planner (Prisha's section) |
| `/inspo-upload.html` | Choose preferences (Nidhi's section) |


## Firebase

Add your Firebase config to `firebase.js`. Then enable **Email/Password** and **Google** sign-in under **Firebase Console → Build → Authentication → Sign-in method**.

## Backend
Copy server/.env.example to server/.env, paste the shared MongoDB connection string into MONGODB_URI, and add OPENAI_API_KEY for style analysis. Then `npm run dev` starts the frontend and backend together.

## Project Structure

```
src/
  mocks/roomData.ts       mock data (delete when teammates finish)
  components/
    RoomSVG.tsx           2D floor plan
    FurnitureCard.tsx     furniture item card
    FurniturePanel.tsx    furniture list + budget tracker
  pages/
    RoomResult.tsx        room result page
index.html                login page
dashboard.html            dashboard
room-result.html          room planner entry point
firebase.js               Firebase config + auth exports
```

## Team

| Section | Owner |
|---------|-------|
| Room dimensions + SVG | Saanvi |
| Inspo upload + style picker | Nidhi |
| AI style analysis | Aditi |
| 2D room result + furniture | Prisha |
