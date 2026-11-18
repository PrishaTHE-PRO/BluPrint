// Long-running entry point: Render and `npm start` / `npm run dev:server`.
// The app itself lives in app.js so the same code can also run as a Vercel
// function (see api/index.js).
const app = require("./app");
const { connectDb } = require("./db");

const PORT = process.env.PORT || 5000;

// start listening immediately so pages that don't need the database
// answer right away instead of waiting on the mongo handshake
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));

connectDb().catch((err) => console.error("DB connection error:", err));
