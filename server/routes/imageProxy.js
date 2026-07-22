const express = require("express");
const axios = require("axios");

const router = express.Router();

/**
 * GET /api/image-proxy?url=...
 * Streams a remote product image so the client can sample its dominant color
 * (retail CDNs usually block canvas reads via CORS).
 */
router.get("/image-proxy", async (req, res) => {
  const raw = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!raw) return res.status(400).json({ error: "url is required" });

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return res.status(400).json({ error: "Invalid url" });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return res.status(400).json({ error: "Only http(s) urls are allowed" });
  }

  try {
    const upstream = await axios.get(raw, {
      responseType: "arraybuffer",
      timeout: 12000,
      maxRedirects: 5,
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "BluPrintColorSampler/1.0",
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const contentType = String(upstream.headers["content-type"] || "image/jpeg").split(";")[0];
    if (!contentType.startsWith("image/")) {
      return res.status(415).json({ error: "URL did not return an image" });
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(Buffer.from(upstream.data));
  } catch (err) {
    console.warn("[image-proxy]", err.message || err);
    res.status(502).json({ error: "Could not fetch image" });
  }
});

module.exports = router;
