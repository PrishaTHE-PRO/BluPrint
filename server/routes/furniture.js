const express = require("express");
const axios   = require("axios");

const router = express.Router();

const CATEGORIES = [
  { key: "sofa",          label: "sofa",          query: (s) => `${s} sofa` },
  { key: "coffee_table",  label: "coffee table",  query: (s) => `${s} coffee table` },
  { key: "rug",           label: "area rug",      query: (s) => `${s} area rug` },
  { key: "floor_lamp",    label: "floor lamp",    query: (s) => `${s} floor lamp` },
  { key: "accent_chair",  label: "accent chair",  query: (s) => `${s} accent chair` },
  { key: "side_table",    label: "side table",    query: (s) => `${s} side table` },
];

function parsePrice(raw) {
  if (!raw) return 0;
  const match = String(raw).replace(/,/g, "").match(/[\d.]+/);
  return match ? Math.round(parseFloat(match[0])) : 0;
}

async function searchCategory(styleTag, cat) {
  const response = await axios.post(
    "https://google.serper.dev/shopping",
    { q: cat.query(styleTag), num: 4, gl: "us" },
    {
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );

  const items = response.data.shopping || [];
  return items
    .filter((item) => item.imageUrl && item.link)
    .slice(0, 3)
    .map((item, i) => ({
      id:       `${cat.key}-${i}`,
      name:     item.title,
      category: cat.key,
      brand:    item.source || "",
      price:    parsePrice(item.price),
      imageUrl: item.imageUrl,
      buyUrl:   item.link,
    }));
}

// GET /api/rooms/:roomId/furniture?styleTag=minimalist
router.get("/:roomId/furniture", async (req, res) => {
  if (!process.env.SERPER_API_KEY) {
    return res.status(500).json({ error: "SERPER_API_KEY not configured" });
  }

  const styleTag = String(req.query.styleTag || "modern").trim().toLowerCase();

  const results = await Promise.allSettled(
    CATEGORIES.map((cat) => searchCategory(styleTag, cat))
  );

  const furniture = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );

  if (furniture.length === 0) {
    return res.status(502).json({ error: "Furniture search returned no results" });
  }

  res.json(furniture);
});

module.exports = router;
