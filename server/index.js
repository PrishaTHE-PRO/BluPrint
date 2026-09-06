const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
// The Firebase config lives in the project-root .env as VITE_* (Vite reads it
// at build time). server/middleware/auth.js falls back to
// VITE_FIREBASE_PROJECT_ID, but that fallback could never fire locally because
// only server/.env was ever loaded, so every API route answered 503. dotenv
// does not overwrite variables that are already set, so server/.env still wins.
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Render terminates TLS at its edge, so without this every request looks like
// it comes from the proxy's IP — the rate limiters below would then throttle
// all users as one bucket. `1` trusts exactly one hop (Render's proxy) rather
// than blindly trusting a client-supplied X-Forwarded-For chain.
app.set("trust proxy", 1);

// gzip responses. optional so the server still boots before `npm install`
let compression = null;
try {
  compression = require("compression");
} catch (err) {
  console.warn("compression not installed, run `npm install` to enable gzip");
}
if (compression) app.use(compression());

// CORS was wide open: any site on the internet could drive this API from a
// visitor's browser. Same-origin needs no CORS at all, so the default is to
// send no allow-origin header; set CORS_ORIGINS (comma-separated) only if a
// separate front-end origin genuinely needs access.
const ALLOWED_ORIGINS = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: same-origin navigations, curl, server-to-server.
      if (!origin) return callback(null, true);
      callback(null, ALLOWED_ORIGINS.includes(origin));
    },
  })
);

app.use(express.json({ limit: "10mb" }));

// Rate limiting. Auth now gates the expensive routes, but a signed-in account
// could still hammer GPT-4o and Serper on our keys, and the image proxy is
// deliberately public because <img> tags cannot send an Authorization header.
const rateLimit = require("express-rate-limit");
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — slow down a moment." },
});
// Tighter cap on the routes that cost real money per call.
const expensiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — slow down a moment." },
});

app.use("/api", apiLimiter);
app.use("/api/rooms/:roomId/analyze-style", expensiveLimiter);
app.use("/api/rooms/:roomId/furniture", expensiveLimiter);
app.use("/api/rooms/:roomId/pinterest", expensiveLimiter);
app.use("/api/rooms/:roomId/images", expensiveLimiter);

// cheap wake-up target for the keep-alive ping. touches nothing, answers instantly
app.get("/healthz", (req, res) => {
  res.status(200).json({
    ok: true,
    db: mongoose.connection.readyState === 1 ? "connected" : "connecting",
    uptime: Math.round(process.uptime()),
  });
});

app.use("/api/rooms", require("./routes/inspo"));
app.use("/api/rooms", require("./routes/styleRoutes"));
app.use("/api/rooms", require("./routes/rooms"));
app.use("/api/rooms", require("./routes/furniture"));
app.use("/api", require("./routes/imageProxy"));

// vite hashes asset filenames, so they can be cached hard. html stays fresh
app.use(
  express.static(path.join(__dirname, "..", "dist"), {
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "dist", "index.html"));
});

const PORT = process.env.PORT || 5000;

// start listening immediately so pages that don't need the database
// answer right away instead of waiting on the mongo handshake
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("DB connection error:", err));
