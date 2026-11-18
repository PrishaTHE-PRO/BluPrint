// Vercel entry point. Vercel turns this file into one serverless function and
// vercel.json routes every /api/* request (and /healthz) to it. The Express
// app is a plain (req, res) handler, so it can be exported as is. Pages and
// assets never come here: Vercel serves the Vite build from dist/ directly.
//
// Render does not use this file; it runs server/index.js.
module.exports = require("../server/app");
