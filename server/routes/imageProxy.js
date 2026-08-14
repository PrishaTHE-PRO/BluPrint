const express = require("express");
const axios = require("axios");
const { httpAgent, httpsAgent, assertPublicUrl } = require("../utils/safeRequest");

const router = express.Router();

/**
 * GET /api/image-proxy?url=...
 * Streams a remote product image so the client can sample its dominant color
 * (retail CDNs usually block canvas reads via CORS).
 */
router.get("/image-proxy", async (req, res) => {
  const raw = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!raw) return res.status(400).json({ error: "url is required" });

  // Parses, enforces http(s), and rejects literal private addresses — which the
  // agent's guarded DNS lookup cannot catch, because Node does not resolve a
  // host that is already an IP.
  let parsed;
  try {
    parsed = assertPublicUrl(raw);
  } catch (err) {
    if (err.code === "EBLOCKEDADDR") {
      // Same answer as any other failure; see the content-type branch below.
      return res.status(502).json({ error: "Could not fetch image" });
    }
    return res.status(400).json({ error: "Invalid url" });
  }

  try {
    const upstream = await axios.get(raw, {
      responseType: "arraybuffer",
      timeout: 12000,
      maxRedirects: 3,
      // Refuses to connect to loopback/RFC1918/link-local, on the initial
      // request AND on every redirect hop.
      httpAgent,
      httpsAgent,
      // A proxy that will stream anything of any size is its own memory DoS.
      maxContentLength: 12 * 1024 * 1024,
      maxBodyLength: 12 * 1024 * 1024,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        // Browser-like UA — many retailer CDNs reject the color-sampler agent on mobile-shared URLs.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Referer: parsed.origin + "/",
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const contentType = String(upstream.headers["content-type"] || "image/jpeg").split(";")[0];
    if (!contentType.startsWith("image/")) {
      // Same status and body as a connection failure below. Answering 415 here
      // and 502 there told the caller whether the host was reachable, which
      // turned this endpoint into a port scanner.
      return res.status(502).json({ error: "Could not fetch image" });
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
