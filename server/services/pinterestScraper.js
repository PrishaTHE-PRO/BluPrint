/**
 * Pinterest board scraper — axios + cheerio version (matches the team plan).
 *
 * Requires: npm i axios cheerio
 *
 * HONEST LIMITATION: Pinterest renders pins with JavaScript, so fetching the
 * raw HTML often exposes only the board's cover image (via og:image) plus
 * whatever image URLs happen to be embedded in the initial page source. This
 * scans BOTH og:image tags and every i.pinimg.com URL in the HTML to grab as
 * many as it can, but it may still return only a few. If it comes back light
 * or Pinterest answers with 429, fall back to direct upload — that's the
 * reliable path. (A headless-browser version with Puppeteer would get more
 * images but is much heavier to run/deploy.)
 */
const axios = require("axios");
const cheerio = require("cheerio");

const BOARD_URL_RE = /^https?:\/\/(www\.)?pinterest\.[a-z.]+\/[^/]+\/[^/]+\/?/i;

function isValidBoardUrl(url) {
  return typeof url === "string" && BOARD_URL_RE.test(url.trim());
}

// Swap Pinterest's small thumbnail size segment for a larger usable one.
function upgradeResolution(url) {
  return url.replace(/\/\d+x\d*\//, "/736x/");
}

async function scrapePinterestBoard(boardUrl, { limit = 8 } = {}) {
  if (!isValidBoardUrl(boardUrl)) {
    const err = new Error("That doesn't look like a Pinterest board URL.");
    err.code = "INVALID_URL";
    throw err;
  }

  let html;
  try {
    const resp = await axios.get(boardUrl.trim(), {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    html = resp.data;
  } catch (e) {
    if (e.response && e.response.status === 429) {
      const err = new Error(
        "Pinterest is rate-limiting requests right now — upload the images directly instead."
      );
      err.code = "RATE_LIMITED";
      throw err;
    }
    const err = new Error("Couldn't reach that Pinterest board.");
    err.code = "FETCH_FAILED";
    throw err;
  }

  const found = new Set();

  // 1) Open Graph image(s) in the <head>.
  const $ = cheerio.load(html);
  $('meta[property="og:image"]').each((_, el) => {
    const c = $(el).attr("content");
    if (c && /i\.pinimg\.com/.test(c)) found.add(c);
  });

  // 2) Any pin CDN url embedded anywhere in the page source.
  const re = /https:\/\/i\.pinimg\.com\/[^\s"'\\)]+\.(?:jpg|jpeg|png|webp)/gi;
  let m;
  while ((m = re.exec(html))) found.add(m[0]);

  // Dedup ignoring size segment, then upgrade resolution.
  const seen = new Set();
  const out = [];
  for (const raw of found) {
    const big = upgradeResolution(raw);
    const key = big.replace(/\/\d+x\d*\//, "/SIZE/");
    if (!seen.has(key)) {
      seen.add(key);
      out.push(big);
    }
    if (out.length >= limit) break;
  }

  if (out.length === 0) {
    const err = new Error(
      "Couldn't read any pins from that board (it may be private, empty, or JS-only). Try uploading the images directly."
    );
    err.code = "NO_IMAGES";
    throw err;
  }

  return out;
}

module.exports = { scrapePinterestBoard, isValidBoardUrl };